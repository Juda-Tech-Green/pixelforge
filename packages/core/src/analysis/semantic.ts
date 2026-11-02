import { z } from "zod";
import { type Project, getFrame } from "../models/project.js";
import { getGameMetadata } from "../models/game.js";
import { frameBounds } from "./inspect.js";
const names = z.array(z.string().min(1)).max(1000);
export const semanticContractSchema = z.strictObject({
  version: z.literal("1.0"),
  requiredAnimations: names.optional(),
  requiredAnchors: names.optional(),
  coverage: z
    .strictObject({
      actions: names,
      directions: names,
      separator: z.string().default("-"),
    })
    .optional(),
  animations: z
    .array(
      z.strictObject({
        name: z.string(),
        requiredLayers: names.optional(),
        layerPhases: z
          .array(
            z.strictObject({
              layer: z.string(),
              minDistinctPhases: z.number().int().min(1).max(1000),
              minVisibleEntries: z.number().int().nonnegative().optional(),
            }),
          )
          .max(100)
          .optional(),
        durationsMs: z.array(z.number().int().positive()).optional(),
        warnEmpty: z.boolean().optional(),
        baselineTolerance: z.number().nonnegative().optional(),
        boundsTolerance: z.number().nonnegative().optional(),
      }),
    )
    .max(1000)
    .optional(),
  exceptions: z
    .array(
      z.strictObject({
        animation: z.string(),
        check: z.string(),
        reason: z.string().min(1),
      }),
    )
    .max(1000)
    .optional(),
});
export function checkSemantics(p: Project, input: unknown) {
  const contract = semanticContractSchema.parse(input),
    violations: { animation: string; check: string; message: string }[] = [],
    warnings: typeof violations = [],
    exceptions: typeof violations = [];
  const issue = (
    animation: string,
    check: string,
    message: string,
    warning = false,
  ) => {
    const exception = contract.exceptions?.find(
      (e) => e.animation === animation && e.check === check,
    );
    (exception ? exceptions : warning ? warnings : violations).push({
      animation,
      check,
      message: exception ? exception.reason : message,
    });
  };
  const required = [
    ...(contract.requiredAnimations ?? []),
    ...(contract.coverage?.actions.flatMap((action) =>
      contract.coverage!.directions.map(
        (direction) => `${action}${contract.coverage!.separator}${direction}`,
      ),
    ) ?? []),
  ];
  for (const name of new Set(required))
    if (!p.animations.some((a) => a.name === name))
      issue(name, "requiredAnimation", "Required animation missing");
  const game = getGameMetadata(p);
  for (const anchor of contract.requiredAnchors ?? [])
    if (!game.anchors.some((a) => a.name === anchor || a.id === anchor))
      issue("$project", "anchor", `Missing anchor ${anchor}`);
  for (const rule of contract.animations ?? []) {
    const a = p.animations.find((a) => a.name === rule.name);
    if (!a) {
      issue(rule.name, "requiredAnimation", "Configured animation missing");
      continue;
    }
    for (const layer of rule.requiredLayers ?? [])
      if (!p.layers.some((l) => l.id === layer))
        issue(a.name, "layer", `Required layer ${layer} missing`);
      else if (!p.layers.find((l) => l.id === layer)!.visible)
        issue(a.name, "layer", `Required layer ${layer} is hidden`);
      else if (
        a.frames.some(
          (f) =>
            !getFrame(p, f.frameId)
              .layers.get(layer)
              ?.some((index) => p.palette[index]![3] > 0),
        )
      )
        issue(
          a.name,
          "layer",
          `Layer ${layer} is empty in one or more entries`,
        );
    for (const phase of rule.layerPhases ?? []) {
      if (!p.layers.some((l) => l.id === phase.layer)) {
        issue(a.name, "phases", `Missing effect layer ${phase.layer}`);
        continue;
      }
      if (!p.layers.find((l) => l.id === phase.layer)!.visible) {
        issue(a.name, "phases", `Effect layer ${phase.layer} is hidden`);
        continue;
      }
      const unique = new Map<number, Uint8Array[]>();
      let distinct = 0,
        visible = 0,
        bytes = 0;
      for (const entry of a.frames) {
        const data = getFrame(p, entry.frameId).layers.get(phase.layer)!,
          raster = new Uint8Array(data.length * 4);
        let hash = 2166136261,
          nonempty = false;
        for (let i = 0; i < data.length; i++) {
          const color = p.palette[data[i]!]!;
          for (let c = 0; c < 4; c++) {
            const byte = color[3] === 0 ? 0 : color[c]!;
            raster[i * 4 + c] = byte;
            hash = Math.imul(hash ^ byte, 16777619);
          }
          if (color[3] > 0) nonempty = true;
        }
        if (!nonempty) continue;
        visible++;
        const bucket = unique.get(hash) ?? [];
        if (
          !bucket.some((previous) =>
            previous.every((value, index) => value === raster[index]),
          )
        ) {
          bytes += raster.length;
          if (bytes > 64 * 1024 * 1024)
            throw new Error("Semantic distinct-phase memory budget exceeded");
          bucket.push(raster);
          unique.set(hash, bucket);
          distinct++;
        }
      }
      if (distinct < phase.minDistinctPhases)
        issue(
          a.name,
          "phases",
          `${phase.layer} has ${distinct} visibly distinct phases; expected at least ${phase.minDistinctPhases}`,
        );
      if (visible < (phase.minVisibleEntries ?? 0))
        issue(
          a.name,
          "coverage",
          `${phase.layer} visible in ${visible} entries; expected at least ${phase.minVisibleEntries}`,
        );
    }
    if (
      rule.durationsMs &&
      JSON.stringify(rule.durationsMs) !==
        JSON.stringify(a.frames.map((f) => f.durationMs))
    )
      issue(a.name, "timing", "Entry durations differ from contract");
    if (
      rule.warnEmpty ||
      rule.baselineTolerance !== undefined ||
      rule.boundsTolerance !== undefined
    ) {
      const bounds = a.frames.map((f) => frameBounds(p, f.frameId));
      if (rule.warnEmpty && bounds.some((b) => !b))
        issue(a.name, "empty", "One or more entries are transparent", true);
      const nonempty = bounds.filter((b) => b !== null);
      if (nonempty.length) {
        const baselines = nonempty.map((b) => b.y + b.height);
        if (
          rule.baselineTolerance !== undefined &&
          Math.max(...baselines) - Math.min(...baselines) >
            rule.baselineTolerance
        )
          issue(
            a.name,
            "baseline",
            "Ground baseline drift exceeds configured tolerance",
            true,
          );
        const first = nonempty[0]!;
        if (
          rule.boundsTolerance !== undefined &&
          nonempty.some(
            (b) =>
              Math.max(
                Math.abs(b.x - first.x),
                Math.abs(b.y - first.y),
                Math.abs(b.width - first.width),
                Math.abs(b.height - first.height),
              ) > rule.boundsTolerance!,
          )
        )
          issue(
            a.name,
            "bounds",
            "Bounding-box drift exceeds configured tolerance",
            true,
          );
      }
    }
  }
  return {
    ok: !violations.length,
    structuralErrors: [],
    semanticViolations: violations,
    visualWarnings: warnings,
    intentionalExceptions: exceptions,
    aestheticQualityVerified: false,
  };
}
