import * as fs from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { assertNoSymlinkPath } from "@pixelforge/exporters";
import { assembleAudioBundle } from "@pixelforge/audio-exporters";
const receipt = ".pixelforge-audio.json";
const hash = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
async function exists(path: string) {
  try {
    return await fs.lstat(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return undefined;
  }
}
async function verify(target: string) {
  await assertNoSymlinkPath(target);
  const data: unknown = JSON.parse(
    await fs.readFile(join(target, receipt), "utf8"),
  );
  if (
    !data ||
    typeof data !== "object" ||
    !("version" in data) ||
    data.version !== "1.0" ||
    !("files" in data) ||
    !data.files ||
    typeof data.files !== "object" ||
    Array.isArray(data.files)
  )
    throw new Error("Invalid audio ownership receipt");
  const files = data.files as Record<string, unknown>;
  const names = Object.keys(files);
  if (
    names.length !== 3 ||
    !names.includes("audio.json") ||
    names.some((name) => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(name))
  )
    throw new Error("Invalid audio receipt filenames");
  const entries = await fs.readdir(target);
  if (entries.some((name) => name !== receipt && !names.includes(name)))
    throw new Error("Unexpected user files in audio bundle");
  for (const name of names) {
    const path = join(target, name),
      info = await fs.lstat(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      hash(await fs.readFile(path)) !== files[name]
    )
      throw new Error(`Managed audio file changed: ${name}`);
  }
}
/** Sibling staging, explicit ownership and rollback match sprite export semantics. */
export async function exportAudioBundle(
  input: unknown,
  output: string,
  replace = false,
) {
  const bundle = assembleAudioBundle(input),
    target = resolve(output);
  if (target === parse(target).root || target === resolve("."))
    throw new Error("Unsafe audio output directory");
  await assertNoSymlinkPath(target);
  await fs.mkdir(dirname(target), { recursive: true });
  const lockPath = `${target}.pixelforge.lock`,
    lock = await fs.open(lockPath, "wx");
  const stage = join(dirname(target), `.pixelforge-audio-${randomUUID()}.tmp`),
    backup = stage + ".backup";
  let staged = false,
    moved = false,
    published = false;
  try {
    const old = await exists(target);
    if (old) {
      if (!replace)
        throw new Error(
          "Audio output exists; use --replace for verified managed output",
        );
      if (!old.isDirectory())
        throw new Error("Audio output is not a directory");
      await verify(target);
    }
    await fs.mkdir(stage);
    staged = true;
    const hashes: Record<string, string> = {};
    for (const [name, bytes] of Object.entries(bundle.files)) {
      await fs.writeFile(join(stage, name), bytes, { flag: "wx" });
      hashes[name] = hash(bytes);
    }
    await fs.writeFile(
      join(stage, receipt),
      JSON.stringify({ version: "1.0", files: hashes }, null, 2) + "\n",
      { flag: "wx" },
    );
    await assertNoSymlinkPath(target);
    if (old) {
      await verify(target);
      await fs.rename(target, backup);
      moved = true;
    }
    await fs.rename(stage, target);
    published = true;
    if (moved) await fs.rm(backup, { recursive: true });
    return {
      output: target,
      manifest: bundle.manifest,
      metrics: bundle.metrics,
    };
  } catch (error) {
    if (moved && !published) await fs.rename(backup, target);
    throw error;
  } finally {
    if (staged && !published)
      await fs.rm(stage, { recursive: true, force: true });
    await lock.close();
    await fs.rm(lockPath);
  }
}
