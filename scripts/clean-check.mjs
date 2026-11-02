import { mkdtemp, mkdir, cp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
const root = resolve("."),
  dir = await mkdtemp(join(tmpdir(), "pixelforge-clean-"));
const environment = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^npm_config_allow.?scripts$/i.test(key),
    ),
  ),
  NODE_OPTIONS: "",
};
const files = spawnSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
);
if (files.status !== 0) throw new Error(files.stderr);
try {
  for (const name of new Set(files.stdout.split("\0").filter(Boolean))) {
    const target = resolve(dir, name);
    if (!target.startsWith(dir + sep)) throw new Error("Unsafe snapshot path");
    await mkdir(dirname(target), { recursive: true });
    await cp(join(root, name), target, { dereference: false });
  }
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error("Run via npm run test:clean");
  const commands = [
    [
      "ci",
      "--no-audit",
      "--no-fund",
      ...(process.argv.includes("--offline") ? ["--offline"] : []),
    ],
    ...["typecheck", "test", "build", "pack:release", "test:skill"].map(
      (name) => ["run", name],
    ),
  ];
  for (const args of commands) {
    const result = spawnSync(process.execPath, [npm, ...args], {
      cwd: dir,
      env: environment,
      stdio: "inherit",
    });
    if (result.status !== 0)
      throw new Error(`Clean ${args.join(" ")} failed (${result.status})`);
  }
  const verify = spawnSync(process.execPath, ["scripts/verify-release.mjs"], {
    cwd: dir,
    stdio: "inherit",
  });
  if (verify.status !== 0) throw new Error("Clean integrity failed");
  console.log(
    JSON.stringify({
      ok: true,
      cleanSnapshot: dir,
      platform: process.platform,
    }),
  );
} finally {
  if (!process.argv.includes("--keep")) {
    if (!dir.startsWith(resolve(tmpdir()) + sep))
      throw new Error("Unsafe cleanup path");
    await rm(dir, { recursive: true, force: true });
  }
}
