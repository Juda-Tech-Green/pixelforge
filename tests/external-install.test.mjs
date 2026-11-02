import { externalBrowser } from "./external-browser.mjs";
import { manageSkill } from "../.agents/skills/pixelforge-sprite-creator/scripts/install.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  lstat,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
test("packed CLI and dependency graph run outside the workspace", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pixelforge-external-"));
  const run = (args) => {
    const r = spawnSync(process.execPath, args, {
      cwd: dir,
      encoding: "utf8",
      timeout: 120000,
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => !/^npm_config_allow.?scripts$/i.test(key),
          ),
        ),
        NODE_OPTIONS: "",
      },
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    return r.stdout;
  };
  try {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "independent-game",
        private: true,
        type: "module",
      }),
    );
    const npm = process.env.npm_execpath;
    assert.ok(npm, "Run through npm run test:external");
    const tarballs = ["core", "exporters", "cli", "phaser"].map((name) =>
      resolve(root, "release", `pixelforge-${name}-0.5.0.tgz`),
    );
    run([
      npm,
      "install",
      ...(process.env.PIXELFORGE_OFFLINE === "1" ? ["--offline"] : []),
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      ...tarballs,
      "phaser@3.90.0",
      "vite@7.3.7",
      "typescript@5.9.3",
    ]);
    for (const name of ["core", "exporters", "cli", "phaser"]) {
      assert.equal(
        (
          await lstat(join(dir, "node_modules", "@pixelforge", name))
        ).isSymbolicLink(),
        false,
      );
      const p = JSON.parse(
        await readFile(
          join(dir, "node_modules", "@pixelforge", name, "package.json"),
          "utf8",
        ),
      );
      assert.equal(p.version, "0.5.0");
      const files = await readdir(
        join(dir, "node_modules", "@pixelforge", name),
      );
      assert.equal(files.includes("src"), false);
      assert.ok(files.includes("LICENSE"));
      if (p.exports) {
        assert.equal(p.exports.development, undefined);
        await lstat(
          join(dir, "node_modules", "@pixelforge", name, p.exports.types),
        );
      }
      for (const value of Object.values(p.dependencies ?? {}))
        assert.equal(
          ["file:", "workspace:", ".."].some((prefix) =>
            value.startsWith(prefix),
          ),
          false,
        );
    }
    await writeFile(
      join(dir, "consumer.ts"),
      "import {createProject,renderFrame} from '@pixelforge/core';\nimport type {GameAsset} from '@pixelforge/phaser';\nconst p=createProject({name:'Types',width:16,height:16});const bytes:Uint8Array=renderFrame(p,'frame-0').data;let game:GameAsset|undefined;console.log(bytes,game);\n",
    );
    await writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          target: "ES2022",
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          types: [],
          lib: ["ES2022", "DOM"],
        },
        include: ["consumer.ts"],
      }),
    );
    run([join(dir, "node_modules", "typescript", "bin", "tsc")]);
    const installed = await manageSkill(
      "install",
      join(dir, ".agents", "skills"),
    );
    run([join(installed.path, "scripts", "check-environment.mjs")]);
    const cli = join(
      dir,
      "node_modules",
      "@pixelforge",
      "cli",
      "dist",
      "index.js",
    );
    assert.match(run([cli, "--version"]), /0\.5\.0/);
    run([
      cli,
      "init",
      "enemy",
      "--width",
      "16",
      "--height",
      "16",
      "--output",
      "enemy.sprite.json",
    ]);
    await writeFile(
      join(dir, "edits.json"),
      JSON.stringify({
        version: "1.0",
        operations: [
          {
            op: "drawRect",
            frame: "frame-0",
            layer: "base",
            x: 4,
            y: 4,
            width: 8,
            height: 8,
            color: 1,
          },
          { op: "copyFrame", source: "frame-0", id: "second" },
          {
            op: "addAnimation",
            name: "idle",
            loop: true,
            frames: [
              { frameId: "frame-0", durationMs: 100 },
              { frameId: "second", durationMs: 200 },
            ],
          },
          {
            op: "setCollisionBody",
            body: { type: "rectangle", x: 4, y: 4, width: 8, height: 8 },
          },
        ],
      }),
    );
    run([
      cli,
      "apply",
      "enemy.sprite.json",
      "--operations",
      "edits.json",
      "--output",
      "animated.sprite.json",
    ]);
    run([cli, "validate", "animated.sprite.json"]);
    run([
      cli,
      "render",
      "animated.sprite.json",
      "--animation",
      "idle",
      "--frame",
      "1",
      "--output",
      "enemy.png",
    ]);
    run([
      cli,
      "export",
      "animated.sprite.json",
      "--format",
      "phaser",
      "--output",
      "public/enemy",
      "--name",
      "enemy",
    ]);
    run([
      join(installed.path, "scripts", "validate-project.mjs"),
      "animated.sprite.json",
    ]);
    run([
      join(installed.path, "scripts", "validate-export.mjs"),
      "public/enemy",
      "animated.sprite.json",
    ]);
    assert.ok((await readFile(join(dir, "enemy.png"))).byteLength > 0);
    assert.equal(
      JSON.parse(
        await readFile(join(dir, "public/enemy/enemy.animations.json"), "utf8"),
      ).animations[0].frames[1].durationMs,
      200,
    );
    const failed = (args) => {
      const r = spawnSync(process.execPath, args, {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "" },
      });
      assert.equal(r.status, 1, r.stdout + r.stderr);
      const report = JSON.parse(r.stderr.trim());
      assert.equal(report.ok, false);
      assert.ok(report.errors.length);
    };
    await writeFile(join(dir, "malformed.json"), "{broken");
    failed([
      join(installed.path, "scripts", "validate-project.mjs"),
      "malformed.json",
    ]);
    const atlasFile = join(dir, "public/enemy/enemy.atlas.json"),
      originalAtlas = await readFile(atlasFile, "utf8"),
      badAtlas = JSON.parse(originalAtlas);
    badAtlas.frames["frame-0"].frame.x = 999999;
    await writeFile(atlasFile, JSON.stringify(badAtlas));
    failed([
      join(installed.path, "scripts", "validate-export.mjs"),
      "public/enemy",
      "animated.sprite.json",
    ]);
    await writeFile(atlasFile, originalAtlas);
    await externalBrowser(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
