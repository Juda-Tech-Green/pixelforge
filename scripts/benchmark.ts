import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import * as pf from "../packages/core/src/index.js";
import {
  exportPhaserBundle,
  exportContactSheet,
  buildAssets,
} from "../packages/exporters/src/index.js";
const temp = await mkdtemp(join(tmpdir(), "pf-benchmark-"));
const results: unknown[] = [];
const time = async <T>(action: () => T | Promise<T>) => {
  const start = performance.now(),
    value = await action();
  return { value, ms: Number((performance.now() - start).toFixed(2)) };
};
try {
  for (const spec of [
    {
      name: "small",
      width: 16,
      height: 16,
      frames: 6,
      layers: 2,
      animations: 2,
    },
    {
      name: "medium",
      width: 32,
      height: 48,
      frames: 40,
      layers: 4,
      animations: 12,
    },
    {
      name: "large",
      width: 48,
      height: 64,
      frames: 80,
      layers: 8,
      animations: 40,
    },
  ]) {
    const p = pf.createProject({
      name: spec.name,
      width: spec.width,
      height: spec.height,
    });
    for (let l = 1; l < spec.layers; l++) pf.createLayer(p, `layer-${l}`);
    pf.drawRect(
      p,
      "frame-0",
      "base",
      2,
      2,
      Math.max(2, spec.width - 4),
      Math.max(2, spec.height - 4),
      1,
      true,
    );
    for (let f = 1; f < spec.frames; f++) {
      pf.copyFrame(p, "frame-0", `frame-${f}`);
      pf.setPixel(p, `frame-${f}`, "base", f % spec.width, 0, 1);
    }
    for (let a = 0; a < spec.animations; a++)
      pf.addAnimation(
        p,
        `walk-${a}`,
        p.frames.map((f) => ({ frameId: f.id, durationMs: 125 })),
      );
    const dir = join(temp, spec.name);
    await mkdir(dir);
    const source = join(dir, "source.sprite.json");
    await writeFile(source, pf.serializeProject(p));
    const bytes = await readFile(source);
    const inspect = await time(() =>
      pf.inspectProject(pf.fromDocument(JSON.parse(bytes.toString("utf8"))), {
        sourceBytes: bytes.length,
      }),
    );
    const stdoutBytes = Buffer.byteLength(JSON.stringify(inspect.value));
    if (stdoutBytes > 32768) throw new Error("Inspection budget regression");
    const render = await time(() => pf.renderFrame(p, p.frames[0]!.id));
    const exported = await time(() =>
      exportPhaserBundle(p, join(dir, "bundle"), {
        maxWidth: 4096,
        maxHeight: 4096,
      }),
    );
    const contact = await time(() =>
      exportContactSheet(p, { animations: ["walk-0"], scale: 2, columns: 8 }),
    );
    const manifest = join(dir, "pixelforge.assets.json");
    await writeFile(
      manifest,
      JSON.stringify({
        version: "1.0",
        assets: [
          {
            id: spec.name,
            source: "source.sprite.json",
            output: "generated",
            layout: "atlas",
            options: { maxWidth: 4096, maxHeight: 4096 },
          },
        ],
      }),
    );
    const first = await time(() => buildAssets(manifest));
    const repeat = await time(() => buildAssets(manifest));
    if (repeat.value.built !== 0 || repeat.value.skipped !== 1)
      throw new Error("Unchanged asset rebuilt");
    results.push({
      ...spec,
      sourceBytes: bytes.length,
      inspectionMs: inspect.ms,
      inspectionOutputBytes: stdoutBytes,
      renderMs: render.ms,
      exportMs: exported.ms,
      contactMs: contact.ms,
      contactPngBytes: contact.value.png.length,
      initialBuildMs: first.ms,
      unchangedBuildMs: repeat.ms,
      unchangedBuilt: repeat.value.built,
      unchangedSkipped: repeat.value.skipped,
      observedRssBytes: process.memoryUsage().rss,
    });
  }
  await mkdir("test-output", { recursive: true });
  await writeFile(
    "test-output/v05-benchmark.json",
    JSON.stringify(
      { platform: process.platform, node: process.version, results },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  if (!temp.startsWith(resolve(tmpdir())))
    throw new Error("Unsafe temp cleanup");
  await rm(temp, { recursive: true, force: true });
}
