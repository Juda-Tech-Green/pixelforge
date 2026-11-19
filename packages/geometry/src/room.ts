import { z } from "zod";
import { projectSchema, fromDocument, toDocument, renderFrame, gameMetadataSchema, surfaceFingerprint, surfaceRegionsSchema,
  type ProjectDocument, type Project, type Color } from "@pixelforge/core";
import { roomSchema, type Room, type RoomLayer } from "./room-schema.js";
import { sceneSchema, type Scene } from "./scene-schema.js";
import { depthOrder, validateScene, renderScene } from "./scene.js";
import { resolveProp } from "./props.js";
import type { Vec2 } from "./math.js";
export interface RoomDiagnostic { code: string; severity: "error" | "warning" | "info"; path: string; message: string; suggestion: string }
export interface RoomMapping {
  id: string; asset: string; source: string; sourceType: "sprite" | "prop"; frame: string; position: Vec2;
  dimensions: { width: number; height: number }; layer: RoomLayer; depth: number; anchors: Record<string, Vec2>;
  provenance: { sourceLayout: string; metadata: ProjectDocument["metadata"] };
}
export interface RoomResult {
  ok: boolean; diagnostics: RoomDiagnostic[]; room?: Room; scene?: Scene; resources?: Record<string, ProjectDocument>;
  instances?: RoomMapping[]; anchors?: Record<string, Vec2>; placementOrder?: string[]; renderOrder?: string[];
  sprite?: ProjectDocument; backgroundRegions?: z.infer<typeof surfaceRegionsSchema>;
}
export const roomDiagnostic = (code: string, path: string, message: string, suggestion: string, severity: RoomDiagnostic["severity"] = "error"): RoomDiagnostic => ({ code, severity, path, message, suggestion });
export function roomSchemaDiagnostics(input: unknown): RoomDiagnostic[] {
  const result = roomSchema.safeParse(input);
  if (result.success) return [];
  const raw = input as { instances?: { placement?: { anchor?: unknown; position?: unknown } }[] } | null;
  const conflicts = Array.isArray(raw?.instances) ? raw.instances.flatMap((i, n) => i?.placement && i.placement.anchor !== undefined && i.placement.position !== undefined ?
    [roomDiagnostic("PF_ROOM_PLACEMENT_CONFLICT", `$.instances[${n}].placement`, "Placement declares both position and anchor.", "Choose explicit top-left position OR anchor/align/offset.")] : []) : [];
  return [...conflicts, ...result.error.issues.map(i => roomDiagnostic(i.path.includes("transform") ? "PF_ROOM_TRANSFORM_UNSUPPORTED" : i.path.includes("layer") ? "PF_ROOM_LAYER_INVALID" :
    i.path[0] === "canvas" ? "PF_ROOM_CANVAS_INVALID" : i.path.includes("placement") ? "PF_ROOM_PLACEMENT_INVALID" : "PF_ROOM_SCHEMA_INVALID",
    `$.${i.path.join(".")}`, i.message, "Use capabilities --schema room; select supported layers, integer coordinates and translation-only placement."))];
}
const layerPolicy: Record<RoomLayer, { depthGroup: "midground" | "actors" | "foreground"; renderLayer: number }> = {
  architecture: { depthGroup: "midground", renderLayer: 0 }, "background-furniture": { depthGroup: "midground", renderLayer: 10 },
  furniture: { depthGroup: "midground", renderLayer: 20 }, actors: { depthGroup: "actors", renderLayer: 0 }, foreground: { depthGroup: "foreground", renderLayer: 0 },
};
const reservedIds = new Set(["room", "room-wall", "room-floor", "room-wall-image", "room-floor-image"]);
const sorted = (values: Iterable<string>) => [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

/** Compile a semantic room into the existing scene contract. No file IO, material execution or new renderer. */
export function resolveRoom(input: unknown, supplied: Record<string, unknown> = {}): RoomResult {
  const diagnostics = roomSchemaDiagnostics(input), parsed = roomSchema.safeParse(input);
  if (!parsed.success) return { ok: false, diagnostics };
  const room = parsed.data;
  const add = (code: string, path: string, message: string, suggestion: string, severity: RoomDiagnostic["severity"] = "error") => diagnostics.push(roomDiagnostic(code, path, message, suggestion, severity));
  const failed = () => diagnostics.some(d => d.severity === "error");
  const { width, height } = room.canvas, wallH = room.background.wallHeight;
  if (wallH >= height) add("PF_ROOM_BACKGROUND_INVALID", "$.background.wallHeight", "Wall leaves no floor region.", "Use wallHeight between one and canvas.height minus one.");
  if (room.palette[0]!.some(v => v !== 0)) add("PF_ROOM_PALETTE_INVALID", "$.palette[0]", "Index zero must be transparent [0,0,0,0].", "Keep zero transparent and use nonzero background colors.");
  for (const name of ["wallColor", "floorColor"] as const) {
    const c = room.background[name];
    if (c >= room.palette.length || room.palette[c]![3] !== 255) add("PF_ROOM_PALETTE_INVALID", `$.background.${name}`, "Background references a missing or non-opaque palette entry.", "Choose an existing opaque background palette index.");
  }
  const resources: Record<string, ProjectDocument> = Object.create(null) as Record<string, ProjectDocument>;
  const projects: Record<string, Project> = Object.create(null) as Record<string, Project>;
  const frames = new Map<string, string>(), assetAnchors = new Map<string, Record<string, Vec2>>();
  const palette: Color[] = room.palette.map(c => [...c] as Color), colorMap = new Map(palette.map((c, i) => [c.join(","), i]));
  for (const id of sorted(Object.keys(room.assets))) {
    const decl = room.assets[id]!, path = `$.assets.${id}`;
    if (!Object.hasOwn(supplied, id)) { add("PF_ROOM_ASSET_MISSING", path, `Missing declared resource ${id}.`, "Supply only the explicitly declared source path or resource ID; no assets are discovered implicitly."); continue; }
    let value = supplied[id];
    if (decl.type === "prop") {
      const prop = resolveProp(value);
      if (!prop.ok) { add("PF_ROOM_PROP_INVALID", path, `Prop ${id} cannot resolve: ${prop.diagnostics.map(d => d.message).join("; ")}`, "Correct the existing prop source; use immutable sprite variants for materialized props."); continue; }
      value = prop.sprite;
    }
    const valid = projectSchema.safeParse(value);
    if (!valid.success) { add("PF_ROOM_SPRITE_INVALID", path, `Asset ${id} is not a compatible editable sprite.`, "Provide sprite1.0 or explicitly declare type:prop for an existing parametric prop source."); continue; }
    const sprite = valid.data, frame = decl.frame ?? (sprite.frames.length === 1 ? sprite.frames[0]!.id : undefined);
    if (!frame || !sprite.frames.some(f => f.id === frame)) { add("PF_ROOM_FRAME_AMBIGUOUS", path, "Frame is missing or ambiguous.", "Declare the exact existing asset.frame when the sprite has multiple frames."); continue; }
    resources[id] = sprite; projects[id] = fromDocument(sprite); frames.set(id, frame);
    const w = sprite.width - 1, h = sprite.height - 1;
    const anchors: Record<string, Vec2> = Object.create(null) as Record<string, Vec2>;
    Object.assign(anchors, { center: [Math.floor(w / 2), Math.floor(h / 2)], "top-left": [0, 0], "top-center": [Math.floor(w / 2), 0], "top-right": [w, 0],
      "bottom-left": [0, h], "bottom-center": [Math.floor(w / 2), h], "bottom-right": [w, h] });
    const merge = (name: string, point: unknown) => {
      const p = z.tuple([z.number().int().min(-4096).max(4096), z.number().int().min(-4096).max(4096)]).safeParse(point);
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name) || !p.success) { add("PF_ROOM_ANCHOR_INVALID", path, `Invalid declared anchor ${name}.`, "Use named integer pixel anchors; frame/prop anchors must be explicit."); return; }
      if (Object.hasOwn(anchors, name) && JSON.stringify(anchors[name]) !== JSON.stringify(p.data)) add("PF_ROOM_ANCHOR_AMBIGUOUS", path, `Anchor ${name} has conflicting declarations.`, "Use distinct anchor names or identical positions; built-in frame anchors cannot be overridden.");
      else anchors[name] = p.data;
    };
    const propMeta = sprite.metadata?.pixelforgeProp;
    if (propMeta && typeof propMeta === "object" && !Array.isArray(propMeta) && propMeta.anchors && typeof propMeta.anchors === "object" && !Array.isArray(propMeta.anchors))
      for (const [name, p] of Object.entries(propMeta.anchors)) merge(name, p);
    if (sprite.metadata?.pixelforgeGame) {
      const game = gameMetadataSchema.parse(sprite.metadata.pixelforgeGame);
      for (const a of game.anchors) if (a.scope.type === "project" || (a.scope.type === "frame" && a.scope.frameId === frame)) merge(a.id, [a.x, a.y]);
    }
    for (const [name, p] of Object.entries(decl.anchors)) merge(name, p);
    if (!Object.hasOwn(anchors, "origin")) anchors.origin = [0, 0];
    if (Object.keys(anchors).length > 32) add("PF_ROOM_ANCHOR_LIMIT", path, "Combined asset anchors exceed the scene's 32-anchor limit.", "Reduce explicit/scoped anchors, including the eight standard frame anchors.");
    assetAnchors.set(id, anchors);
    // Exact composited RGBA colors include any existing translucent-layer blends. Palette indices may be remapped, never colors.
    const raster = renderFrame(projects[id]!, frame);
    for (let p = 0; p < raster.data.length; p += 4) if (raster.data[p + 3]) {
      const c: Color = [raster.data[p]!, raster.data[p + 1]!, raster.data[p + 2]!, raster.data[p + 3]!], key = c.join(",");
      if (!colorMap.has(key)) { colorMap.set(key, palette.length); palette.push(c); }
      if (palette.length > 256) { add("PF_ROOM_PALETTE_LIMIT", path, "Merged room colors exceed 256 entries.", "Use a coordinated shared palette or fewer source color variants; colors are never approximated."); break; }
    }
  }
  for (const [kind, asset] of [["wall", room.background.wallAsset], ["floor", room.background.floorAsset]] as const) if (asset) {
    const resource = resources[asset];
    if (!Object.hasOwn(room.assets, asset)) add("PF_ROOM_ASSET_MISSING", `$.background.${kind}Asset`, "Background asset is undeclared.", "Declare the immutable background sprite in assets.");
    else if (resource && (resource.width !== width || resource.height !== (kind === "wall" ? wallH : height - wallH)))
      add("PF_ROOM_BACKGROUND_SIZE", `$.background.${kind}Asset`, "Background sprite must exactly fit its region.", "Prepare a correctly sized variant explicitly; room placement never tiles, stretches or regenerates materials.");
  }
  const instances = new Map(room.instances.map(i => [i.id, i]));
  if (instances.size !== room.instances.length) add("PF_ROOM_INSTANCE_DUPLICATE", "$.instances", "Instance IDs must be unique.", "Give each placement its own stable ID; reuse the asset ID instead of duplicating source files.");
  for (const i of room.instances) {
    if (reservedIds.has(i.id)) add("PF_ROOM_INSTANCE_RESERVED", `$.instances.${i.id}`, "Instance ID collides with a reserved room object.", "Use an instance ID other than room/room-wall/room-floor/room-wall-image/room-floor-image.");
    if (!Object.hasOwn(room.assets, i.asset)) add("PF_ROOM_ASSET_MISSING", `$.instances.${i.id}.asset`, "Instance references an undeclared asset.", "Declare the source once under assets and reference its ID.");
  }
  const anchors: Record<string, Vec2> = Object.create(null) as Record<string, Vec2>;
  for (const [name, x] of [["left", 0], ["center", Math.floor((width - 1) / 2)], ["right", width - 1]] as const) {
    anchors[`room.wall.${name}`] = [x, Math.floor((wallH - 1) / 2)];
    anchors[`room.floor.${name}`] = [x, wallH + Math.floor((height - wallH - 1) / 2)];
  }
  if (failed()) return { ok: false, diagnostics };
  const resolved = new Map<string, RoomMapping>(), pending = new Set(instances.keys()), placementOrder: string[] = [];
  while (pending.size) {
    let progress = false;
    for (const id of sorted(pending)) {
      const i = instances.get(id)!, path = `$.instances.${id}.placement`, local = assetAnchors.get(i.asset)!, sprite = resources[i.asset]!;
      let position: Vec2;
      if ("position" in i.placement) position = [...i.placement.position];
      else {
        const placement = i.placement, ref = placement.anchor;
        let target = anchors[ref];
        if (!target && !ref.startsWith("room.")) {
          const dot = ref.indexOf("."), other = ref.slice(0, dot), name = ref.slice(dot + 1);
          if (dot < 1 || !instances.has(other)) { add("PF_ROOM_INSTANCE_MISSING", path, `Missing target instance in ${ref}.`, "Use room.wall/floor anchors or an existing instanceId.anchorName."); pending.delete(id); progress = true; continue; }
          if (!Object.hasOwn(assetAnchors.get(instances.get(other)!.asset)!, name)) { add("PF_ROOM_ANCHOR_MISSING", path, `Target anchor ${ref} is undeclared.`, "Inspect the asset's declared prop/frame anchors or add an explicit asset anchor."); pending.delete(id); progress = true; continue; }
          if (!resolved.has(other)) continue;
          target = resolved.get(other)!.anchors[name];
        }
        if (!target || !Object.hasOwn(local, placement.align)) { add("PF_ROOM_ANCHOR_MISSING", path, "Target or source alignment anchor is missing.", "Select documented room anchors and an existing source align anchor; ground/surface are never guessed."); pending.delete(id); progress = true; continue; }
        const source = local[placement.align]!;
        position = [target[0] + placement.offset[0] - source[0], target[1] + placement.offset[1] - source[1]];
      }
      if (position[0] < 0 || position[1] < 0 || position[0] + sprite.width > width || position[1] + sprite.height > height)
        add("PF_ROOM_OFF_CANVAS", path, `Instance ${id} exceeds the canvas.`, "Move the instance or explicitly choose allowClipping:true for intentional clipping.", i.allowClipping ? "warning" : "error");
      resolved.set(id, { id, asset: i.asset, source: room.assets[i.asset]!.source, sourceType: room.assets[i.asset]!.type, frame: frames.get(i.asset)!, position,
        dimensions: { width: sprite.width, height: sprite.height }, layer: i.layer, depth: i.depth,
        anchors: Object.fromEntries(Object.entries(local).map(([name, p]) => [name, [position[0] + p[0], position[1] + p[1]] as Vec2])),
        provenance: { sourceLayout: surfaceFingerprint(sprite), metadata: sprite.metadata } });
      placementOrder.push(id); pending.delete(id); progress = true;
      break; // Reconsider all currently available IDs after every resolved dependency.
    }
    if (!progress) { add("PF_ROOM_PLACEMENT_CYCLE", "$.instances", `Circular placement dependencies: ${sorted(pending).join(", ")}.`, "Break an anchor dependency with a room anchor or explicit position."); break; }
    if (failed()) return { ok: false, diagnostics };
  }
  if (failed()) return { ok: false, diagnostics };
  const rect = (id: string, y: number, h: number, color: number) => ({ id, type: "room-background", position: [0, y, 0], size: [Math.max(.01, width - 1), Math.max(.01, h - 1), 1],
    depthGroup: "background", renderLayer: -128, depthOffset: -y,
    geometry: { type: "polygon", color, points: [[0, 0, 0], [width - 1, 0, 0], [width - 1, h - 1, 0], [0, h - 1, 0]] } });
  const objects: unknown[] = [rect("room-wall", 0, wallH, room.background.wallColor), rect("room-floor", wallH, height - wallH, room.background.floorColor)];
  for (const [kind, asset, y] of [["wall", room.background.wallAsset, 0], ["floor", room.background.floorAsset, wallH]] as const) if (asset) {
    const sprite = resources[asset]!;
    objects.push({ id: `room-${kind}-image`, type: "room-background", position: [0, y, 0], size: [Math.max(.01, sprite.width - 1), Math.max(.01, sprite.height - 1), 1],
      depthGroup: "background", renderLayer: -127, depthOffset: -y, sprite: { asset, frame: frames.get(asset)!, anchor: [0, 0] } });
  }
  for (const id of sorted(resolved.keys())) {
    const i = resolved.get(id)!, local = assetAnchors.get(i.asset)!;
    objects.push({ id, type: "room-instance", position: [...i.position, 0], size: [Math.max(.01, i.dimensions.width - 1), Math.max(.01, i.dimensions.height - 1), 1],
      ...layerPolicy[i.layer], depthOffset: i.depth - i.position[1], anchors: Object.fromEntries(Object.entries(local).map(([k, p]) => [k, [...p, 0]])),
      sprite: { asset: i.asset, frame: i.frame, anchor: [0, 0] } });
  }
  const sceneResult = sceneSchema.safeParse({ version: "1.0", id: room.id, name: room.name, canvas: room.canvas,
    camera: { projection: "top-down", origin: [0, 0], scale: 1 }, palette, objects });
  if (!sceneResult.success) { add("PF_ROOM_SCENE_INVALID", "$", sceneResult.error.issues.map(i => i.message).join("; "), "Reduce room complexity or correct the reported existing scene limit."); return { ok: false, diagnostics }; }
  const scene = sceneResult.data;
  for (const d of validateScene(scene, projects)) if (d.severity === "error") add("PF_ROOM_SCENE_INVALID", "$", `${d.constraint}: ${d.actual}`, d.action);
  if (failed()) return { ok: false, diagnostics };
  return { ok: true, diagnostics, room, scene, resources, instances: sorted(resolved.keys()).map(id => resolved.get(id)!), anchors, placementOrder, renderOrder: depthOrder(scene).map(p => p.id) };
}

/** Raster output is entirely delegated to existing scene rendering; texture coordinates are never regenerated. */
export function renderRoom(result: RoomResult): RoomResult {
  if (!result.ok || !result.scene || !result.resources) return result;
  const resources = Object.fromEntries(Object.entries(result.resources).map(([id, doc]) => [id, fromDocument(doc)]));
  const rendered = renderScene(result.scene, resources), sprite = toDocument(rendered.project);
  sprite.metadata = { ...sprite.metadata, pixelforgeRoom: JSON.parse(JSON.stringify({ source: result.room!.id, instances: result.instances, anchors: result.anchors })) };
  const b = result.room!.background, w = sprite.width;
  const backgroundRegions = { format: "pixelforge-surface-regions", version: "1.0", id: `${result.room!.id}-background`, surfaces: [
    { id: "wall", frame: "scene-000", layer: b.wallAsset ? "room-wall-image" : "room-wall", regions: [{ x: 0, y: 0, width: w, height: b.wallHeight }], protected: [] },
    { id: "floor", frame: "scene-000", layer: b.floorAsset ? "room-floor-image" : "room-floor", regions: [{ x: 0, y: b.wallHeight, width: w, height: sprite.height - b.wallHeight }], protected: [] },
  ] };
  return { ...result, sprite, backgroundRegions: surfaceRegionsSchema.parse(backgroundRegions) };
}
