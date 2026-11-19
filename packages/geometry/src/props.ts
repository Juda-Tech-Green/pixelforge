import { toDocument, type Color, type ProjectDocument } from "@pixelforge/core";
import { parametricPropSchema, type ParametricProp, type PropType } from "./prop-schema.js";
import { rigSchema, poseSchema, type Rig, type Pose, type BodyShape } from "./rig-schema.js";
import { renderRig } from "./raster.js";
import type { Vec2 } from "./math.js";

export interface PropDiagnostic { code: string; severity: "error" | "warning"; path: string; message: string; suggestion: string }
export interface PropResult {
  ok: boolean; diagnostics: PropDiagnostic[]; source?: ParametricProp; rig?: Rig; pose?: Pose;
  sprite?: ProjectDocument; anchors?: Record<string, Vec2>;
}
/** Stable diagnostics shared by doctor and resolution, with no silent repairs. */
export function propSchemaDiagnostics(input: unknown): PropDiagnostic[] {
  const result = parametricPropSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map(issue => ({
    code: issue.path[0] === "palette" ? "PF_PROP_PALETTE_INVALID" : issue.path[0] === "colors" ? "PF_PROP_COLOR_INVALID" :
      issue.path.includes("type") ? "PF_PROP_COMPONENT_UNSUPPORTED" : "PF_PROP_PARAMETER_INVALID",
    severity: "error" as const, path: "$" + issue.path.map(p => `[${JSON.stringify(String(p))}]`).join(""), message: issue.message,
    suggestion: "Use capabilities --schema prop; choose a supported component and integer parameters within the declared limits.",
  }));
}

/** Small editable source preset; no raster or geometry construction required by the author. */
export function createProp(type: PropType, id: string): ParametricProp {
  const palette: Color[] = [[0, 0, 0, 0], [42, 35, 32, 255], [133, 85, 58, 255], [191, 143, 91, 255],
    [82, 54, 43, 255], [202, 171, 102, 255], [112, 151, 153, 255], [114, 124, 99, 255], [73, 83, 68, 255], [181, 188, 157, 255]];
  const component = type === "desk" ? { type, width: 48, height: 28, drawers: { side: "right", count: 2, width: 13 } } :
    type === "cabinet" ? { type, width: 24, height: 44 } : { type, width: 32, height: 36 };
  return parametricPropSchema.parse({ format: "pixelforge-parametric-prop", version: "1.0", id, name: id, palette,
    colors: { outline: 1, body: type === "cabinet" ? 7 : 2, light: type === "cabinet" ? 9 : 3, shadow: type === "cabinet" ? 8 : 4, hardware: 5, glass: 6 }, component });
}

/** Compile parameters to existing rig shapes; doctor uses this without rasterizing. */
export function buildProp(input: unknown): PropResult {
  const diagnostics = propSchemaDiagnostics(input);
  if (diagnostics.length) return { ok: false, diagnostics };
  const source = parametricPropSchema.parse(input), c = source.component, colors = source.colors;
  const add = (code: string, path: string, message: string, suggestion: string, severity: "error" | "warning" = "error") =>
    diagnostics.push({ code, severity, path, message, suggestion });
  if (source.palette[0]!.some(v => v !== 0)) add("PF_PROP_PALETTE_INVALID", "$.palette[0]", "Palette index zero must be transparent [0,0,0,0].", "Restore transparency at index zero; use nonzero indices for prop colors.");
  for (const [role, color] of Object.entries(colors)) if (color !== undefined && (color >= source.palette.length || source.palette[color]![3] !== 255))
    add("PF_PROP_COLOR_INVALID", `$.colors.${role}`, "A palette role references a missing or non-opaque color.", "Choose an existing fully opaque palette index; retain index zero for transparency.");
  const checkDrawers = (width: number, height: number, d: { count: number; gap: number; labels: boolean }, path: string) => {
    const minimum = d.labels ? 8 : 5;
    if (width < 6 || height - 2 - (d.count - 1) * d.gap < d.count * minimum)
      add("PF_PROP_DRAWERS_DONT_FIT", path, `Drawer stack cannot preserve borders${d.labels ? ", labels" : ""} and handles at this size.`, `Increase usable width/height, reduce drawer count/gap, or disable labels; each panel needs width >=4 and height >=${minimum}.`);
  };
  if (c.type === "desk") {
    const supports = 2 * (c.legInset + c.legWidth), columnCount = c.drawers?.side === "both" ? 2 : c.drawers ? 1 : 0;
    const used = 2 * c.legInset + (c.drawers?.width ?? 0) * columnCount + (columnCount === 1 ? c.legWidth : 0);
    if (c.height - c.topThickness < c.legHeight + 5 || c.width - supports < 6 || c.width - used < 6)
      add("PF_PROP_STRUCTURE_INVALID", "$.component", "Desk legs, pedestals and knee opening do not fit the requested proportions.", "Increase width/height, reduce leg inset/width, drawer width or visible leg height; retain a six-pixel knee opening.");
    if (c.drawers) {
      if (c.drawers.width < c.legWidth) add("PF_PROP_STRUCTURE_INVALID", "$.component.drawers.width", "A pedestal is narrower than its supporting leg.", "Increase drawer width or reduce leg width.");
      checkDrawers(c.drawers.width, c.height - c.topThickness - c.legHeight, c.drawers, "$.component.drawers");
    }
  } else if (c.type === "cabinet") checkDrawers(c.width, c.height - c.baseHeight, c.drawers, "$.component.drawers");
  else {
    if (colors.glass === undefined) add("PF_PROP_COLOR_REQUIRED", "$.colors.glass", "Window panes require an explicit glass palette role.", "Map colors.glass to an existing opaque palette index.");
    if (c.width - 2 * c.frame - (c.columns - 1) * c.mullion < c.columns * 3 || c.height - 2 * c.frame - (c.rows - 1) * c.mullion < c.rows * 3)
      add("PF_PROP_PANES_DONT_FIT", "$.component", "Window frame/mullions leave panes smaller than three pixels.", "Increase dimensions, reduce rows/columns, or reduce frame/mullion thickness.");
  }
  if (colors.body === colors.outline || colors.body === colors.shadow || colors.body === colors.light)
    add("PF_PROP_LOW_CONTRAST", "$.colors", "Some structural palette roles share an index; edges or highlights may disappear.", "Review the preview and use distinct palette roles if the silhouette/details need more contrast.", "warning");
  if (diagnostics.some(d => d.severity === "error")) return { ok: false, diagnostics };

  const shapes: BodyShape[] = [];
  const polygon = (id: string, layer: string, points: Vec2[], color: number, outline = colors.outline) =>
    shapes.push({ id, joint: "root", layer, type: "polygon", points, color, outline, offset: [0, 0], rotation: 0 });
  const rect = (id: string, layer: string, x: number, y: number, width: number, height: number, color: number, outline = colors.outline) =>
    polygon(id, layer, [[x, y], [x + width - 1, y], [x + width - 1, y + height - 1], [x, y + height - 1]], color, outline);
  const drawers = (id: string, x: number, y: number, width: number, height: number, d: { count: number; gap: number; labels: boolean; hardware: "bar" | "knob" | "none" }) => {
    const usable = height - 2 - (d.count - 1) * d.gap;
    for (let i = 0; i < d.count; i++) {
      const top = y + 1 + Math.floor(i * usable / d.count) + i * d.gap, h = Math.floor((i + 1) * usable / d.count) - Math.floor(i * usable / d.count);
      rect(`${id}-drawer-${i}`, "details", x + 1, top, width - 2, h, colors.body);
      if (d.labels) { const w = Math.min(8, width - 6); rect(`${id}-label-${i}`, "details", x + Math.floor((width - w) / 2), top + 1, w, 2, colors.light, 0); }
      if (d.hardware !== "none") {
        const w = d.hardware === "knob" ? 1 : Math.min(5, width - 6);
        // A six-pixel-wide pedestal still gets a one-pixel handle.
        rect(`${id}-handle-${i}`, "details", x + Math.floor((width - Math.max(1, w)) / 2), top + (d.labels ? h - 2 : Math.floor(h / 2)), Math.max(1, w), 1, colors.hardware, 0);
      }
    }
  };
  const depth = c.type === "window" ? 0 : c.depth, shift = Math.ceil(depth / 2), overhang = c.type === "window" && c.sillHeight ? 2 : 0;
  const origin: Vec2 = [source.padding + overhang, source.padding];
  let bottom = depth + c.height - 1;
  if (c.type === "desk") {
    const y = depth + c.topThickness - 1;
    rect("desk-leg-left", "supports", c.legInset, y, c.legWidth, c.height - c.topThickness + 1, colors.shadow);
    rect("desk-leg-right", "supports", c.width - c.legInset - c.legWidth, y, c.legWidth, c.height - c.topThickness + 1, colors.shadow);
    if (c.drawers) for (const side of c.drawers.side === "both" ? ["left", "right"] : [c.drawers.side]) {
      const x = side === "left" ? c.legInset : c.width - c.legInset - c.drawers.width, h = c.height - c.topThickness - c.legHeight;
      rect(`desk-pedestal-${side}`, "body", x, depth + c.topThickness, c.drawers.width, h, colors.body);
      drawers(`desk-${side}`, x, depth + c.topThickness, c.drawers.width, h, c.drawers);
    }
    if (depth) polygon("desk-top-surface", "top", [[0, depth], [shift, 0], [c.width - 1 + shift, 0], [c.width - 1, depth]], colors.light);
    rect("desk-top-edge", "top", 0, depth, c.width, c.topThickness, colors.body);
  } else if (c.type === "cabinet") {
    if (depth) {
      polygon("cabinet-side", "body", [[c.width - 1, depth], [c.width - 1 + shift, 0], [c.width - 1 + shift, c.height - 1], [c.width - 1, depth + c.height - 1]], colors.shadow);
      polygon("cabinet-top", "top", [[0, depth], [shift, 0], [c.width - 1 + shift, 0], [c.width - 1, depth]], colors.light);
    }
    rect("cabinet-body", "body", 0, depth, c.width, c.height, colors.body);
    rect("cabinet-base", "details", 0, depth + c.height - c.baseHeight, c.width, c.baseHeight, colors.shadow);
    drawers("cabinet", 0, depth, c.width, c.height - c.baseHeight, c.drawers);
  } else {
    rect("window-frame", "body", 0, 0, c.width, c.height, colors.body);
    const paneW = c.width - 2 * c.frame - (c.columns - 1) * c.mullion, paneH = c.height - 2 * c.frame - (c.rows - 1) * c.mullion;
    for (let row = 0; row < c.rows; row++) for (let col = 0; col < c.columns; col++) {
      const x = c.frame + Math.floor(col * paneW / c.columns) + col * c.mullion, y = c.frame + Math.floor(row * paneH / c.rows) + row * c.mullion;
      const w = Math.floor((col + 1) * paneW / c.columns) - Math.floor(col * paneW / c.columns), h = Math.floor((row + 1) * paneH / c.rows) - Math.floor(row * paneH / c.rows);
      rect(`window-pane-${row}-${col}`, "details", x, y, w, h, colors.glass!, colors.shadow);
    }
    if (c.sillHeight) { rect("window-sill", "top", -2, c.height - 1, c.width + 4, c.sillHeight, colors.light); bottom += c.sillHeight - 1; }
  }
  const canvas = { width: c.width + shift + 2 * (source.padding + overhang), height: bottom + 1 + 2 * source.padding };
  const rigInput = { version: "1.0", id: source.id, name: source.name, canvas, palette: source.palette,
    layers: ["supports", "body", "top", "details"], joints: [{ id: "root", parent: null, position: origin }], shapes,
    metadata: { parametricProp: source.id } };
  const validated = rigSchema.safeParse(rigInput);
  if (!validated.success) {
    add("PF_PROP_GEOMETRY_INVALID", "$", validated.error.issues.map(i => i.message).join("; "), "Reduce component dimensions/detail count to satisfy existing rig raster limits.");
    return { ok: false, diagnostics };
  }
  const anchors: Record<string, Vec2> = { origin, ground: [origin[0] + Math.floor((c.width - 1) / 2), origin[1] + bottom],
    top: [origin[0] + shift + Math.floor((c.width - 1) / 2), origin[1]], surface: [origin[0] + Math.floor((c.width - 1) / 2), origin[1] + depth] };
  return { ok: true, diagnostics, source, rig: validated.data, pose: poseSchema.parse({ id: source.id }), anchors };
}

/** The existing rig rasterizer produces an ordinary editable sprite, without a new drawing engine. */
export function resolveProp(input: unknown): PropResult {
  const result = buildProp(input);
  if (!result.ok) return result;
  const rendered = renderRig(result.rig, result.pose);
  const project = rendered.project;
  project.metadata = { ...project.metadata, pixelforgeProp: JSON.parse(JSON.stringify({ version: "1.0", source: result.source, anchors: result.anchors })) };
  return { ...result, sprite: toDocument(project) };
}
