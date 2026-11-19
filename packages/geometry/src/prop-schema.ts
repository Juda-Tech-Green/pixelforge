import { z } from "zod";
import { colorSchema } from "@pixelforge/core";
import { geometryIdSchema } from "./rig-schema.js";

const pixels = (min: number, max: number) => z.number().int().min(min).max(max);
const size = { width: pixels(12, 128), height: pixels(12, 128) };
const hardware = z.enum(["bar", "knob", "none"]).default("bar");
const drawerDetails = { count: pixels(1, 6).default(2), gap: pixels(1, 4).default(1), labels: z.boolean().default(false), hardware };
export const propComponentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("desk"), ...size,
    depth: pixels(0, 16).default(5).describe("Projected top depth in pixels, not a world-space measurement"),
    topThickness: pixels(2, 8).default(3), legWidth: pixels(2, 12).default(3), legInset: pixels(0, 16).default(3),
    legHeight: pixels(2, 24).default(5).describe("Visible feet below drawer pedestals"),
    drawers: z.strictObject({ ...drawerDetails, side: z.enum(["left", "right", "both"]), width: pixels(6, 40) }).optional(),
  }),
  z.strictObject({ type: z.literal("cabinet"), ...size, depth: pixels(0, 16).default(4),
    baseHeight: pixels(2, 12).default(3),
    drawers: z.strictObject({ ...drawerDetails, count: pixels(1, 6).default(4), labels: z.boolean().default(true) }).default({ count: 4, gap: 1, labels: true, hardware: "bar" }),
  }),
  z.strictObject({ type: z.literal("window"), ...size, frame: pixels(1, 8).default(3),
    columns: pixels(1, 6).default(2), rows: pixels(1, 6).default(2), mullion: pixels(1, 4).default(2),
    sillHeight: pixels(0, 6).default(3),
  }),
]);
const index = pixels(1, 255);
export const parametricPropSchema = z.strictObject({
  format: z.literal("pixelforge-parametric-prop"), version: z.literal("1.0"), id: geometryIdSchema,
  name: z.string().min(1).max(128), padding: pixels(0, 16).default(2),
  palette: z.array(colorSchema).min(2).max(256),
  colors: z.strictObject({ outline: index, body: index, light: index, shadow: index, hardware: index, glass: index.optional() }),
  component: propComponentSchema,
}).meta({ id: "pixelforge-parametric-prop" });
export type ParametricProp = z.infer<typeof parametricPropSchema>;
export type PropComponent = ParametricProp["component"];
export const propTypes = ["desk", "cabinet", "window"] as const;
export type PropType = typeof propTypes[number];
export const parametricPropCapabilities = {
  introducedIn: "0.9.0",
  types: propTypes, schema: "capabilities --schema prop", formatVersion: "1.0",
  author: "prop create ID --type desk|cabinet|window --out SOURCE.prop.json",
  resolve: "prop resolve SOURCE.prop.json --out OUTPUT.sprite.json [--out-rig OUTPUT.rig.json] --json",
  outputs: ["ordinary editable sprite 1.0", "optional existing rig 1.0", "JSON diagnostics, source provenance, anchors and part IDs"],
  palette: "Semantic palette indices: outline, body, light, shadow, hardware; glass required for windows. Existing updatePaletteColor recolors the sprite without rebuilding geometry.",
  limits: { dimensions: [12, 128], projectedDepth: [0, 16], drawers: [1, 6], panesPerAxis: [1, 6], rasterWork: 8_000_000 },
  limitations: ["One static component per source; no automatic scene composition", "Front view with fixed shallow top/right projection for desks/cabinets; windows are front-facing",
    "Flat base shading; use material apply for optional texturing. No articulated/open drawers, arbitrary perspective or parametric animation", "Incompatible sizes/details are rejected; defaults are not an artistic guarantee"],
};
