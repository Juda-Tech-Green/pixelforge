import {
  getFrame,
  renderFrame,
  type Project,
  type Raster,
} from "@pixelforge/core";
/** Bounded content cache survives immutable document commits without stale thumbnails. */
export class RasterCache {
  private entries = new Map<
    string,
    { key: string; planes: Uint8Array[]; raster: Raster; bytes: number }
  >();
  constructor(private budget = 16 * 1024 * 1024) {}
  get(p: Project, id: string): Raster {
    const key = JSON.stringify([
      p.width,
      p.height,
      p.palette,
      p.layers.map((l) => [l.id, l.visible]),
    ]);
    const frame = getFrame(p, id),
      planes = p.layers
        .filter((l) => l.visible)
        .map((l) => frame.layers.get(l.id)!);
    const old = this.entries.get(id);
    if (
      old &&
      old.key === key &&
      planes.length === old.planes.length &&
      planes.every(
        (v, i) =>
          v.length === old.planes[i]!.length &&
          v.every((n, j) => n === old.planes[i]![j]),
      )
    )
      return old.raster;
    const raster = renderFrame(p, id),
      bytes =
        raster.data.byteLength + planes.reduce((s, v) => s + v.byteLength, 0);
    this.entries.delete(id);
    if (bytes <= this.budget) {
      this.entries.set(id, {
        key,
        planes: planes.map((v) => v.slice()),
        raster,
        bytes,
      });
      while (
        [...this.entries.values()].reduce((s, v) => s + v.bytes, 0) >
        this.budget
      )
        this.entries.delete(this.entries.keys().next().value!);
    }
    return raster;
  }
}
