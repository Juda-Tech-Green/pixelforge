import { beforeAll, afterAll, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
const exec = promisify(execFile);
let dir: string;
const cli = (...args: string[]) =>
  exec(process.execPath, [
    "--conditions=development",
    "--import",
    "tsx",
    resolve("packages/cli/src/index.ts"),
    ...args,
  ]);
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "pixelforge-test-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});
it("initializes, validates, inspects, renders and exports through real subprocesses", async () => {
  const project = join(dir, "test.sprite.json");
  await cli(
    "init",
    "test",
    "--width",
    "4",
    "--height",
    "4",
    "--output",
    project,
  );
  expect(JSON.parse((await cli("validate", project)).stdout).ok).toBe(true);
  expect(JSON.parse((await cli("inspect", project)).stdout).width).toBe(4);
  const png = join(dir, "frame.png");
  await cli("render", project, "--output", png);
  expect((await sharp(png).metadata()).hasAlpha).toBe(true);
  const sheet = join(dir, "sheet.png");
  await cli(
    "export",
    project,
    "--format",
    "spritesheet",
    "--columns",
    "2",
    "--output",
    sheet,
  );
  expect((await sharp(sheet).metadata()).width).toBe(8);
  expect(
    JSON.parse(await readFile(join(dir, "sheet.json"), "utf8")).format,
  ).toBe("pixelforge-manifest");
  await cli(
    "export",
    project,
    "--format",
    "frames",
    "--output",
    join(dir, "frames"),
  );
  expect(await readdir(join(dir, "frames"))).toEqual(["0.png"]);
});
it("rejects invalid documents and invalid CLI inputs with nonzero status", async () => {
  await expect(
    cli("validate", "tests/fixtures/invalid.sprite.json"),
  ).rejects.toMatchObject({ code: 1 });
  await expect(cli("init", "bad", "--width", "3.5")).rejects.toMatchObject({
    code: 1,
  });
  await expect(
    cli(
      "render",
      "tests/fixtures/valid.sprite.json",
      "--animation",
      "idle",
      "--frame",
      "99",
      "--output",
      join(dir, "bad.png"),
    ),
  ).rejects.toMatchObject({ code: 1 });
});
it("atomically applies operation files and preserves an existing destination on failure", async () => {
  const source = join(dir, "source.json"),
    operations = join(dir, "ops.json"),
    out = join(dir, "out.json");
  await cli("init", "atomic", "--width", "2", "--height", "2", "-o", source);
  await writeFile(out, "sentinel");
  await writeFile(
    operations,
    JSON.stringify({
      version: "1.0",
      operations: [
        {
          op: "setPixel",
          frame: "frame-0",
          layer: "base",
          x: 0,
          y: 0,
          color: 1,
        },
        {
          op: "setPixel",
          frame: "frame-0",
          layer: "base",
          x: 20,
          y: 0,
          color: 1,
        },
      ],
    }),
  );
  await expect(
    cli("apply", source, "--operations", operations, "-o", out),
  ).rejects.toMatchObject({ code: 1 });
  expect(await readFile(out, "utf8")).toBe("sentinel");
  await writeFile(
    operations,
    JSON.stringify({
      version: "1.0",
      operations: [{ op: "copyFrame", source: "frame-0", id: "second" }],
    }),
  );
  await cli("apply", source, "--operations", operations, "-o", out);
  expect(JSON.parse(await readFile(out, "utf8")).frames).toHaveLength(2);
  expect(JSON.parse(await readFile(source, "utf8")).frames).toHaveLength(1);
  expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual(
    [],
  );
});
