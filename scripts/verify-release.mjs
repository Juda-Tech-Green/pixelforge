import { readFile, lstat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
const dir = resolve(process.argv[2] ?? "release");
const lines = (await readFile(join(dir, "SHA256SUMS"), "utf8"))
  .trim()
  .split(/\r?\n/);
if (lines.length !== 7) throw new Error("Expected seven package checksums");
const seen = new Set();
const packages = new Set(),
  versions = new Set();
for (const line of lines) {
  const match =
    /^([a-f0-9]{64})  (pixelforge-(core|exporters|cli|phaser|audio-core|audio-exporters|geometry)-([0-9]+\.[0-9]+\.[0-9]+)\.tgz)$/.exec(
      line,
    );
  if (!match || seen.has(match[2]) || packages.has(match[3]))
    throw new Error("Invalid or duplicate checksum entry");
  const [, hash, file, name, version] = match;
  seen.add(file);
  packages.add(name);
  versions.add(version);
  if (versions.size > 1) throw new Error("Mixed release versions");
  const path = join(dir, file);
  if (!(await lstat(path)).isFile())
    throw new Error("Archive must be a regular file");
  if (
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex") !== hash
  )
    throw new Error(`Checksum mismatch: ${file}`);
}
console.log(
  JSON.stringify({
    ok: true,
    verified: [...seen],
    authenticatedPublisher: false,
  }),
);
