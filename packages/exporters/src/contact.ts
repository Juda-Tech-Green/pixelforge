import sharp from "sharp";
import { renderFrame, type Project } from "@pixelforge/core";
import { encodePNG } from "./index.js";
export interface ContactOptions {
  animations?: string[];
  prefix?: string;
  columns?: number;
  scale?: number;
  background?: "transparent" | "checkerboard";
  start?: number;
  end?: number;
}
const xml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export async function exportContactSheet(p: Project, o: ContactOptions = {}) {
  const columns = o.columns ?? 4,
    scale = o.scale ?? 4,
    start = o.start ?? 0,
    end = o.end ?? Number.MAX_SAFE_INTEGER;
  if (
    !Number.isInteger(columns) ||
    columns < 1 ||
    columns > 32 ||
    !Number.isInteger(scale) ||
    scale < 1 ||
    scale > 16 ||
    !Number.isInteger(start) ||
    start < 0 ||
    !Number.isInteger(end) ||
    end <= start
  )
    throw new Error("Invalid contact columns1..32, scale1..16 or entry range");
  if (o.background && !["transparent", "checkerboard"].includes(o.background))
    throw new Error("Contact background must be transparent or checkerboard");
  for (const name of o.animations ?? [])
    if (!p.animations.some((a) => a.name === name))
      throw new Error(`Unknown animation ${name}`);
  const animations = p.animations.filter(
    (a) =>
      (!o.animations || o.animations.includes(a.name)) &&
      (!o.prefix || a.name.startsWith(o.prefix)),
  );
  if (
    animations.reduce(
      (count, a) => count + Math.max(0, Math.min(end, a.frames.length) - start),
      0,
    ) > 1000
  )
    throw new Error(
      "Contact exceeds1000 cells; select an entry range or animations",
    );
  const entries = animations.flatMap((a) =>
    a.frames
      .slice(start, end)
      .map((entry, index) => ({
        animation: a.name,
        index: index + start,
        ...entry,
      })),
  );
  if (!entries.length) throw new Error("No contact entries selected");
  if (entries.length > 1000)
    throw new Error(
      "Contact exceeds1000 cells; select an entry range or animations",
    );
  const cellWidth = Math.max(p.width * scale, 180) + 16,
    cellHeight = p.height * scale + 66,
    actualColumns = Math.min(columns, entries.length),
    width = actualColumns * cellWidth,
    height = Math.ceil(entries.length / actualColumns) * cellHeight;
  if (
    !Number.isSafeInteger(width * height) ||
    width * height > 64 * 1024 * 1024 ||
    width > 32767 ||
    height > 32767
  )
    throw new Error("Contact exceeds64MP or32767px output bounds");
  const data = new Uint8Array(width * height * 4);
  const cells = entries.map((entry, index) => {
    const x = (index % actualColumns) * cellWidth + 8,
      y = Math.floor(index / actualColumns) * cellHeight + 8,
      frame = renderFrame(p, entry.frameId);
    for (let row = 0; row < p.height * scale; row++)
      for (let col = 0; col < p.width * scale; col++) {
        const at = ((y + row) * width + x + col) * 4,
          source =
            (Math.floor(row / scale) * p.width + Math.floor(col / scale)) * 4,
          alpha = frame.data[source + 3]! / 255;
        if (o.background === "checkerboard") {
          const value =
            (Math.floor(row / 8) + Math.floor(col / 8)) % 2 ? 40 : 48;
          for (let c = 0; c < 3; c++)
            data[at + c] = Math.round(
              frame.data[source + c]! * alpha + value * (1 - alpha),
            );
          data[at + 3] = 255;
        } else data.set(frame.data.subarray(source, source + 4), at);
      }
    return {
      ...entry,
      x,
      y,
      width: p.width * scale,
      height: p.height * scale,
      label: {
        x,
        y: y + p.height * scale + 6,
        width: cellWidth - 16,
        height: 44,
      },
    };
  });
  const labels = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${cells.map((c) => `<rect x="${c.label.x}" y="${c.label.y}" width="${c.label.width}" height="44" fill="#f1f4f6"/><g fill="#1f2933" font-family="monospace" font-size="11"><text x="${c.label.x + 4}" y="${c.label.y + 12}">${xml(c.animation.slice(0, Math.floor((c.label.width - 8) / 7)))}</text><text x="${c.label.x + 4}" y="${c.label.y + 26}">${xml(c.frameId.slice(0, Math.floor((c.label.width - 8) / 7)))}</text><text x="${c.label.x + 4}" y="${c.label.y + 39}">entry ${c.index} / ${c.durationMs} ms</text></g>`).join("")}</svg>`;
  const base = await encodePNG({ width, height, data });
  const png = await sharp(base)
    .composite([{ input: Buffer.from(labels) }])
    .png()
    .toBuffer();
  return {
    png,
    map: {
      format: "pixelforge-contact",
      version: "1.0",
      width,
      height,
      columns: actualColumns,
      scale,
      background: o.background ?? "transparent",
      cells,
    },
  };
}
