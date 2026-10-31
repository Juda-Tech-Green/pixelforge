import { mkdir, writeFile, rename, rm, lstat } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  assemblePhaserBundle,
  type Project,
  type BundleOptions,
} from "@pixelforge/core";
import { encodePNG } from "./index.js";
/** Build and validate every file before publishing a new directory; never delete user output. */
export async function exportPhaserBundle(
  project: Project,
  output: string,
  options: BundleOptions = {},
) {
  const bundle = assemblePhaserBundle(project, options),
    png = await encodePNG(bundle.raster),
    target = resolve(output);
  try {
    await lstat(target);
    throw new Error("Bundle output already exists; choose a new directory");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      throw error;
  }
  await mkdir(dirname(target), { recursive: true });
  const stage = join(dirname(target), `.pixelforge-${randomUUID()}.tmp`);
  try {
    await mkdir(stage);
    for (const [name, text] of Object.entries(bundle.files))
      await writeFile(join(stage, name), text, { flag: "wx" });
    await writeFile(join(stage, bundle.manifest.texture), png, { flag: "wx" });
    await rename(stage, target);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  return bundle.manifest;
}
