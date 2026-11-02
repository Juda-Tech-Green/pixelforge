import * as fs from "node:fs/promises";
import { resolve, dirname, join, parse } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import {
  assemblePhaserBundle,
  bundleManifestSchema,
  type Project,
  type BundleOptions,
} from "@pixelforge/core";
import { encodePNG } from "./index.js";

const receiptName = ".pixelforge-bundle.json";
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
async function exists(path: string) {
  try {
    return await fs.lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
export async function assertNoSymlinkPath(path: string) {
  let current = resolve(path);
  for (;;) {
    const info = await exists(current);
    if (info?.isSymbolicLink())
      throw new Error(`Symlink paths are not allowed: ${current}`);
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
/** Verify ownership, current bytes and absence of unexpected user files. Never infer ownership from a directory name. */
export async function verifyManagedBundle(target: string) {
  await assertNoSymlinkPath(target);
  const receiptPath = join(target, receiptName);
  if (!(await exists(receiptPath))?.isFile())
    throw new Error(
      "Existing output is not a managed PixelForge bundle (missing receipt)",
    );
  const receipt: unknown = JSON.parse(await fs.readFile(receiptPath, "utf8"));
  if (
    !receipt ||
    typeof receipt !== "object" ||
    !("version" in receipt) ||
    receipt.version !== "1.0" ||
    !("files" in receipt) ||
    !receipt.files ||
    typeof receipt.files !== "object" ||
    Array.isArray(receipt.files)
  )
    throw new Error("Invalid bundle ownership receipt");
  const files = receipt.files as Record<string, unknown>;
  if (
    Object.keys(files).some(
      (name) => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name),
    )
  )
    throw new Error("Unsafe receipt filename");
  if (!(await fs.lstat(join(target, "bundle.json"))).isFile())
    throw new Error("Bundle manifest must be a regular file, not a link");
  const manifest = bundleManifestSchema.parse(
    JSON.parse(await fs.readFile(join(target, "bundle.json"), "utf8")),
  );
  const names = [
    "bundle.json",
    "README.md",
    manifest.texture,
    manifest.animations,
    manifest.game,
    ...(manifest.atlas ? [manifest.atlas] : []),
  ].sort();
  if (JSON.stringify(Object.keys(files).sort()) !== JSON.stringify(names))
    throw new Error("Receipt does not match bundle-owned files");
  const entries = await fs.readdir(target);
  if (entries.some((name) => name !== receiptName && !names.includes(name)))
    throw new Error(
      "Unexpected user files in bundle; preserve them before replacement",
    );
  for (const name of names) {
    const path = join(target, name),
      info = await fs.lstat(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      typeof files[name] !== "string" ||
      hash(await fs.readFile(path)) !== files[name]
    )
      throw new Error(`Managed bundle file changed or invalid: ${name}`);
  }
  return { manifest, hashes: files as Record<string, string> };
}
/** Stage first; publish via sibling renames. Replacement has a short absence window, with rollback on an observed failure. */
export async function exportPhaserBundle(
  project: Project,
  output: string,
  options: BundleOptions & {
    replace?: boolean;
    buildFingerprint?: string;
    runtimeKey?: string;
  } = {},
  io: Pick<typeof fs, "writeFile" | "rename"> = fs,
) {
  const bundle = assemblePhaserBundle(project, options),
    png = await encodePNG(bundle.raster),
    target = resolve(output);
  if (target === parse(target).root || target === resolve("."))
    throw new Error("Unsafe bundle output directory");
  await assertNoSymlinkPath(target);
  await fs.mkdir(dirname(target), { recursive: true });
  const lock = `${target}.pixelforge.lock`;
  const handle = await fs.open(lock, "wx");
  const token = randomUUID(),
    stage = join(dirname(target), `.pixelforge-${token}.tmp`),
    backup = join(dirname(target), `.pixelforge-${token}.backup`);
  let movedOld = false,
    published = false,
    stageCreated = false;
  try {
    const old = await exists(target);
    if (old) {
      if (!options.replace)
        throw new Error(
          "Bundle output already exists; use --replace for a verified managed bundle",
        );
      if (!old.isDirectory())
        throw new Error("Bundle target must be a directory");
      await verifyManagedBundle(target);
    }
    await fs.mkdir(stage);
    stageCreated = true;
    const files: Record<string, string | Uint8Array> = {
      ...bundle.files,
      [bundle.manifest.texture]: png,
    };
    const hashes: Record<string, string> = {};
    for (const [name, data] of Object.entries(files)) {
      await io.writeFile(join(stage, name), data, { flag: "wx" });
      hashes[name] = hash(data);
    }
    await io.writeFile(
      join(stage, receiptName),
      JSON.stringify(
        {
          version: "1.0",
          files: hashes,
          ...(options.buildFingerprint
            ? { buildFingerprint: options.buildFingerprint }
            : {}),
          ...(options.runtimeKey ? { runtimeKey: options.runtimeKey } : {}),
        },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    await verifyManagedBundle(stage);
    await assertNoSymlinkPath(target);
    if (old) {
      await verifyManagedBundle(target);
      await io.rename(target, backup);
      movedOld = true;
    } else if (await exists(target))
      throw new Error("Output appeared during staging; refusing overwrite");
    try {
      await io.rename(stage, target);
      published = true;
    } catch (error) {
      if (movedOld) {
        try {
          await fs.rename(backup, target);
          movedOld = false;
        } catch {
          throw new Error(
            `Publish and rollback failed; previous bundle retained at ${backup}`,
            { cause: error },
          );
        }
      }
      throw error;
    }
    if (movedOld) {
      await fs.rm(backup, { recursive: true });
      movedOld = false;
    }
    return bundle.manifest;
  } finally {
    if (stageCreated) await fs.rm(stage, { recursive: true, force: true });
    await handle.close();
    await fs.rm(lock, { force: true });
    // If rollback failed, leave backup intact for explicit recovery, never delete it here.
    if (published && movedOld)
      console.error(`Previous bundle backup retained: ${backup}`);
  }
}
