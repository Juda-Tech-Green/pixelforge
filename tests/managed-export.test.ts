import { it, expect } from "vitest";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as pf from "../packages/core/src/index.js";
import {
  exportPhaserBundle,
  verifyManagedBundle,
} from "../packages/exporters/src/bundle.js";
it("replaces managed output; staging and publish failures retain exact previous bytes", async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), "pf-replace-")),
    target = join(dir, "hero");
  try {
    const p = pf.createProject({ name: "Hero", width: 4, height: 4 });
    await exportPhaserBundle(p, target);
    const before = await fs.readFile(join(target, "character.png"));
    pf.setPixel(p, "frame-0", "base", 1, 1, 1);
    let writes = 0;
    await expect(
      exportPhaserBundle(
        p,
        target,
        { replace: true },
        {
          ...fs,
          writeFile: async (...args: Parameters<typeof fs.writeFile>) => {
            if (++writes === 3) throw new Error("Injected staging failure");
            return fs.writeFile(...args);
          },
        },
      ),
    ).rejects.toThrow("staging failure");
    expect(await fs.readFile(join(target, "character.png"))).toEqual(before);
    await verifyManagedBundle(target);
    let renames = 0;
    await expect(
      exportPhaserBundle(
        p,
        target,
        { replace: true },
        {
          ...fs,
          rename: async (...args: Parameters<typeof fs.rename>) => {
            if (++renames === 2) throw new Error("Injected publish failure");
            return fs.rename(...args);
          },
        },
      ),
    ).rejects.toThrow("publish failure");
    expect(await fs.readFile(join(target, "character.png"))).toEqual(before);
    await verifyManagedBundle(target);
    await exportPhaserBundle(p, target, { replace: true });
    expect(await fs.readFile(join(target, "character.png"))).not.toEqual(
      before,
    );
    expect(await fs.readdir(dir)).toEqual(["hero"]);
    await fs.writeFile(join(target, "user.txt"), "keep");
    await expect(
      exportPhaserBundle(p, target, { replace: true }),
    ).rejects.toThrow(/Unexpected/);
    expect(await fs.readFile(join(target, "user.txt"), "utf8")).toBe("keep");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
it("rejects unknown, modified, linked and invalid targets without damaging them", async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), "pf-protect-"));
  try {
    const p = pf.createProject({ name: "Hero", width: 4, height: 4 }),
      target = join(dir, "hero");
    await fs.mkdir(target);
    await fs.writeFile(join(target, "user.txt"), "keep");
    await expect(
      exportPhaserBundle(p, target, { replace: true }),
    ).rejects.toThrow(/receipt/);
    const managed = join(dir, "managed");
    await exportPhaserBundle(p, managed);
    await fs.writeFile(join(managed, "character.png"), "changed");
    await expect(
      exportPhaserBundle(p, managed, { replace: true }),
    ).rejects.toThrow(/changed/);
    expect(await fs.readFile(join(managed, "character.png"), "utf8")).toBe(
      "changed",
    );
    const link = join(dir, "link");
    await fs.symlink(
      managed,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(exportPhaserBundle(p, join(link, "new"))).rejects.toThrow(
      /Symlink/,
    );
    const valid = join(dir, "valid");
    await exportPhaserBundle(p, valid);
    const original = await fs.readFile(join(valid, "character.png"));
    await expect(
      exportPhaserBundle(p, valid, { replace: true, maxWidth: 1 }),
    ).rejects.toThrow();
    expect(await fs.readFile(join(valid, "character.png"))).toEqual(original);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
