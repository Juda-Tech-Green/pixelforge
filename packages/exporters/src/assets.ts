import { readFile, lstat } from "node:fs/promises";
import { resolve, dirname, isAbsolute, sep } from "node:path";
import { createHash } from "node:crypto";
import {
  assetManifestSchema,
  fromDocument,
  applyOperations,
} from "@pixelforge/core";
import {
  exportPhaserBundle,
  verifyManagedBundle,
  assertNoSymlinkPath,
} from "./bundle.js";
export async function buildAssets(file: string, version = "0.5.0") {
  const manifestFile = resolve(file),
    root = dirname(manifestFile);
  await assertNoSymlinkPath(manifestFile);
  const manifest = assetManifestSchema.parse(
      JSON.parse(await readFile(manifestFile, "utf8")),
    ),
    ids = new Set<string>(),
    keys = new Set<string>();
  const contained = (path: string) => {
    if (
      isAbsolute(path) ||
      path.includes("\\") ||
      path
        .split("/")
        .some(
          (part) =>
            !part ||
            part === "." ||
            part === ".." ||
            /[<>:"|?*\x00-\x1f]/.test(part) ||
            /[. ]$/.test(part) ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        )
    )
      throw new Error("Asset paths must be relative portable paths");
    const target = resolve(root, path);
    if (!target.startsWith(root + sep))
      throw new Error(`Asset path escapes project root: ${path}`);
    return target;
  };
  const planned = manifest.assets.map((asset) => {
    if (ids.has(asset.id) || keys.has(asset.runtimeKey ?? asset.id))
      throw new Error("Duplicate asset ID or runtime key");
    ids.add(asset.id);
    keys.add(asset.runtimeKey ?? asset.id);
    return {
      ...asset,
      sourcePath: contained(asset.source),
      outputPath: contained(asset.output),
      operationPaths: (asset.operations ?? []).map(contained),
      inputPaths: (asset.inputs ?? []).map(contained),
    };
  });
  const inside = (a: string, b: string) => {
    const x = process.platform === "win32" ? a.toLowerCase() : a,
      y = process.platform === "win32" ? b.toLowerCase() : b;
    return x === y || x.startsWith(y + sep);
  };
  for (const asset of planned) {
    for (const other of planned)
      if (
        asset !== other &&
        (inside(asset.outputPath, other.outputPath) ||
          inside(other.outputPath, asset.outputPath))
      )
        throw new Error("Asset output directories overlap");
    for (const input of [
      manifestFile,
      ...planned.flatMap((a) => [
        a.sourcePath,
        ...a.operationPaths,
        ...a.inputPaths,
      ]),
    ])
      if (inside(input, asset.outputPath))
        throw new Error("Asset output contains a reproducibility input");
    await assertNoSymlinkPath(asset.outputPath);
    for (const input of [
      asset.sourcePath,
      ...asset.operationPaths,
      ...asset.inputPaths,
    ]) {
      await assertNoSymlinkPath(input);
      if (!(await lstat(input)).isFile())
        throw new Error(`Asset input is not a file: ${input}`);
    }
  }
  const results: {
    id: string;
    runtimeKey: string;
    output: string;
    status: "built" | "skipped";
    fingerprint: string;
  }[] = [];
  for (const asset of planned) {
    const hash = createHash("sha256").update(
      JSON.stringify({ version, asset }),
    );
    const bytes = await Promise.all(
      [asset.sourcePath, ...asset.operationPaths, ...asset.inputPaths].map(
        (path) => readFile(path),
      ),
    );
    for (const data of bytes)
      hash.update(createHash("sha256").update(data).digest());
    const fingerprint = hash.digest("hex");
    let existing = false,
      fresh = false;
    try {
      await lstat(asset.outputPath);
      existing = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (existing) {
      await verifyManagedBundle(asset.outputPath);
      const receipt = JSON.parse(
        await readFile(
          resolve(asset.outputPath, ".pixelforge-bundle.json"),
          "utf8",
        ),
      ) as { buildFingerprint?: string };
      fresh = receipt.buildFingerprint === fingerprint;
    }
    if (!fresh) {
      let p = fromDocument(JSON.parse(bytes[0]!.toString("utf8")));
      for (let i = 0; i < asset.operationPaths.length; i++)
        p = applyOperations(p, JSON.parse(bytes[i + 1]!.toString("utf8")));
      await exportPhaserBundle(p, asset.outputPath, {
        ...asset.options,
        layout: asset.layout,
        name: asset.runtimeKey ?? asset.id,
        runtimeKey: asset.runtimeKey ?? asset.id,
        buildFingerprint: fingerprint,
        replace: existing,
      });
    }
    results.push({
      id: asset.id,
      runtimeKey: asset.runtimeKey ?? asset.id,
      output: asset.output,
      status: fresh ? "skipped" : "built",
      fingerprint,
    });
  }
  return {
    ok: true,
    built: results.filter((r) => r.status === "built").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    assets: results,
  };
}
