import {
  renderFrame,
  assemblePhaserBundle,
  type BundleOptions,
  renderSpriteSheet,
  serializeProject,
  type Project,
  type Raster,
  type SheetOptions,
} from "@pixelforge/core";
export async function savePhaserBundle(
  project: Project,
  options: BundleOptions,
): Promise<void> {
  const bundle = assemblePhaserBundle(project, options),
    png = await pngBlob(bundle.raster);
  download(png, bundle.manifest.texture);
  for (const [name, text] of Object.entries(bundle.files))
    download(
      new Blob([text], {
        type: name.endsWith(".json") ? "application/json" : "text/markdown",
      }),
      name,
    );
}
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function pngBlob(raster: Raster): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  ctx.putImageData(
    new ImageData(
      new Uint8ClampedArray(raster.data),
      raster.width,
      raster.height,
    ),
    0,
    0,
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("PNG encoding failed")),
      "image/png",
    ),
  );
}
export function saveProject(p: Project): void {
  download(
    new Blob([serializeProject(p)], { type: "application/json" }),
    `${p.name}.sprite.json`,
  );
}
export async function saveFrame(
  p: Project,
  id: string,
  name = id,
): Promise<void> {
  download(await pngBlob(renderFrame(p, id)), `${name}.png`);
}
export async function saveSheet(
  p: Project,
  options: SheetOptions,
): Promise<void> {
  const { raster, manifest } = renderSpriteSheet(p, options);
  const png = await pngBlob(raster);
  download(png, `${p.name}.png`);
  download(
    new Blob([JSON.stringify(manifest, null, 2) + "\n"], {
      type: "application/json",
    }),
    `${p.name}.json`,
  );
}
