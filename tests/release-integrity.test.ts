import { it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
it("verifies checksums and rejects corruption, traversal, duplicates and mixed versions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pf-integrity-")),
    run = () =>
      promisify(execFile)(process.execPath, [
        resolve("scripts/verify-release.mjs"),
        dir,
      ]);
  try {
    const bytes = Buffer.from("test release bytes"),
      hash = createHash("sha256").update(bytes).digest("hex");
    const files = ["core", "exporters", "cli", "phaser", "audio-core", "audio-exporters", "geometry"].map(
      (name) => `pixelforge-${name}-0.5.0.tgz`,
    );
    for (const file of files) await writeFile(join(dir, file), bytes);
    const lines = files.map((file) => `${hash}  ${file}`);
    await writeFile(join(dir, "SHA256SUMS"), lines.join("\r\n") + "\r\n");
    expect(JSON.parse((await run()).stdout).authenticatedPublisher).toBe(false);
    await writeFile(join(dir, files[0]!), Buffer.from("corrupt"));
    await expect(run()).rejects.toThrow(/mismatch/);
    await writeFile(join(dir, files[0]!), bytes);
    await writeFile(
      join(dir, "SHA256SUMS"),
      [lines[0], lines[0], ...lines.slice(2)].join("\n"),
    );
    await expect(run()).rejects.toThrow(/duplicate/);
    await writeFile(
      join(dir, "SHA256SUMS"),
      [`${hash}  ../escape.tgz`, ...lines.slice(1)].join("\n"),
    );
    await expect(run()).rejects.toThrow(/Invalid/);
    await writeFile(
      join(dir, "SHA256SUMS"),
      [lines[0]!.replace("0.5.0", "0.4.0"), ...lines.slice(1)].join("\n"),
    );
    await writeFile(join(dir, "pixelforge-core-0.4.0.tgz"), bytes);
    await expect(run()).rejects.toThrow(/Mixed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
