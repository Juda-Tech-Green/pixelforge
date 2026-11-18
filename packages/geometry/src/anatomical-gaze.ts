import { forwardKinematics } from "./kinematics.js";
import { inverse, transform, wrapAngle, type Vec2, type Affine } from "./math.js";
import { poseSchema, type Rig, type Pose } from "./rig-schema.js";
import { createRig } from "./presets.js";
import type { SemanticPoseRequest } from "./semantic-schema.js";

type Gaze = NonNullable<SemanticPoseRequest["gaze"]>;
export const standardGazeAnatomy = {
  neckWeight: .4, headWeight: .6,
  neckLimits: [-.2, .2] as [number, number], headLimits: [-.35, .35] as [number, number],
};
export class AnatomicalGazeError extends Error {
  constructor(public code: string, public path: string, message: string, public suggestion: string) { super(message); }
}
export interface AnatomicalGazeMetadata {
  mode: "anatomical"; requestedTarget: Gaze["target"]; initialHeadOrigin: Vec2; initialCorrection: number;
  normalizedWeights: { neck: number; head: number }; profileSource: { neck: string; head: string };
  neck: { joint: string; initialRotation: number; appliedDelta: number; rotation: number; limits: [number, number]; atLimit: boolean };
  head: { joint: string; initialRotation: number; appliedDelta: number; rotation: number; limits: [number, number]; atLimit: boolean };
  renderedDirectionError: number; reason: "joint-limits" | "partial-strength" | "bounded-allocation" | null;
}

/** Detect only the existing standard skeleton, independent of its artwork, ID and tighter limits. */
function hasStandardSkeleton(rig: Rig): boolean {
  const canonical = createRig("standard").joints;
  return rig.joints.length === canonical.length && canonical.every(j => rig.joints.some(candidate =>
    candidate.id === j.id && candidate.parent === j.parent && candidate.position.every((v, i) => Math.abs(v - j.position[i]!) < 1e-9)));
}
function direction(matrix: Affine, forward: Vec2): Vec2 {
  const x = matrix[0] * forward[0] + matrix[2] * forward[1], y = matrix[1] * forward[0] + matrix[3] * forward[1], size = Math.hypot(x, y);
  return [x / size, y / size];
}
function correction(matrix: Affine, target: Vec2, forward: Vec2): number {
  const local = transform(target, inverse(matrix));
  if (Math.hypot(...local) < 1e-6) throw new AnatomicalGazeError("PF_GAZE_COINCIDENT", "$.gaze.target", "Gaze target coincides with the current head origin.", "Move the target away from the head origin.");
  return wrapAngle(Math.atan2(local[1], local[0]) - Math.atan2(forward[1], forward[0]));
}
const clamp = (n: number, limits: [number, number]) => Math.max(limits[0], Math.min(limits[1], n));

/** Bounded two-joint allocation; uses authoritative FK and never changes any other rotation. */
export function solveAnatomicalGaze(rig: Rig, input: Pose, gaze: Gaze, target: Vec2, neckId: string, headId: string) {
  const head = rig.joints.find(j => j.id === headId), neck = rig.joints.find(j => j.id === neckId);
  if (!head || !neck || head.id === neck.id || head.parent !== neck.id)
    throw new AnatomicalGazeError("PF_GAZE_ANATOMY_UNAVAILABLE", "$.roles", "Anatomical gaze requires an existing direct neck-to-head chain.", "Map roles.neck and roles.head to distinct, directly connected joints.");
  const profile = gaze.anatomy ?? {}, standard = neckId === "neck" && headId === "head" && hasStandardSkeleton(rig);
  const source = { neck: "", head: "" };
  const limits = (kind: "neck" | "head", joint: Rig["joints"][number]): [number, number] => {
    const supplied = profile[kind === "neck" ? "neckLimits" : "headLimits"];
    const existing = joint.limits[0] > -Math.PI + 1e-9 || joint.limits[1] < Math.PI - 1e-9;
    const chosen = supplied ?? (standard ? standardGazeAnatomy[kind === "neck" ? "neckLimits" : "headLimits"] : existing ? joint.limits : undefined);
    if (!chosen) throw new AnatomicalGazeError("PF_GAZE_ANATOMY_UNAVAILABLE", `$.gaze.anatomy.${kind}Limits`, `Custom ${kind} anatomy has no usable limits.`, "Provide explicit local angle limits or author meaningful limits on the rig; standard-human defaults are not assumed.");
    source[kind] = supplied ? "explicit-profile" : standard ? "standard-skeleton" : "rig";
    const lower = Math.max(joint.limits[0], chosen[0], kind === "head" ? gaze.limits?.[0] ?? -Math.PI : -Math.PI);
    const upper = Math.min(joint.limits[1], chosen[1], kind === "head" ? gaze.limits?.[1] ?? Math.PI : Math.PI);
    if (chosen[0] > chosen[1] || (kind === "head" && gaze.limits && gaze.limits[0] > gaze.limits[1]) || lower > upper)
      throw new AnatomicalGazeError("PF_GAZE_PROFILE_INVALID", `$.gaze.anatomy.${kind}Limits`, "Anatomical and rig limits have no valid ordered intersection.", "Use increasing local angle intervals that intersect the existing rig limits.");
    return [lower, upper];
  };
  const bounds = [limits("neck", neck), limits("head", head)] as const;
  const weights = [profile.neckWeight ?? standardGazeAnatomy.neckWeight, profile.headWeight ?? standardGazeAnatomy.headWeight];
  const sum = weights[0]! + weights[1]!;
  if (!(sum > 0)) throw new AnatomicalGazeError("PF_GAZE_PROFILE_INVALID", "$.gaze.anatomy", "At least one gaze weight must be positive.", "Set neckWeight and/or headWeight above zero; weights are normalized deterministically.");
  const normalized = weights.map(w => w / sum), pose = poseSchema.parse(input), forward = gaze.forward!;
  const initial = forwardKinematics(rig, pose), initialHead = initial[headId]!;
  const delta = correction(initialHead.matrix, target, forward), requested = delta * gaze.strength;
  const starts = [pose.rotations[neckId] ?? neck.rotation, pose.rotations[headId] ?? head.rotation];
  const applied = starts.map((start, i) => clamp(start + requested * normalized[i]!, bounds[i]!) - start);
  let remainder = requested - applied[0]! - applied[1]!;
  // One fixed spill pass: head first, then neck. Zero-weight joints receive no spill.
  for (const i of [1, 0]) if (normalized[i]! > 0) {
    const next = clamp(starts[i]! + applied[i]! + remainder, bounds[i]!) - starts[i]!;
    remainder -= next - applied[i]!; applied[i] = next;
  }
  pose.rotations[neckId] = starts[0]! + applied[0]!;
  pose.rotations[headId] = starts[1]! + applied[1]!;
  // Neck rotation moves the head origin. One analytical head correction accounts for that parallax.
  // The head's own rotation does not move its origin, so no iterative body solver is needed.
  if (normalized[1]! > 0) {
    const afterAllocation = forwardKinematics(rig, pose)[headId]!;
    const updatedTotal = wrapAngle(correction(afterAllocation.matrix, target, forward) + applied[0]! + applied[1]!);
    pose.rotations[headId] = clamp(starts[1]! + updatedTotal * gaze.strength - applied[0]!, bounds[1]);
  }
  const final = forwardKinematics(rig, pose), finalHead = final[headId]!, finalDirection = direction(finalHead.matrix, forward);
  if (Math.hypot(target[0] - finalHead.position[0], target[1] - finalHead.position[1]) < 1e-6)
    throw new AnatomicalGazeError("PF_GAZE_COINCIDENT", "$.gaze.target", "The bounded neck rotation moved the head origin onto the target.", "Reposition the target so it defines a nonzero gaze direction.");
  const targetAngle = Math.atan2(target[1] - finalHead.position[1], target[0] - finalHead.position[0]);
  const error = Math.abs(wrapAngle(targetAngle - Math.atan2(finalDirection[1], finalDirection[0])));
  const atLimit = (value: number, interval: [number, number]) => Math.abs(value - interval[0]) < 1e-9 || Math.abs(value - interval[1]) < 1e-9;
  const neckRotation = pose.rotations[neckId]!, headRotation = pose.rotations[headId]!;
  const neckAtLimit = atLimit(neckRotation, bounds[0]), headAtLimit = atLimit(headRotation, bounds[1]);
  const reason = error <= 1e-5 ? null : gaze.strength < 1 ? "partial-strength" : neckAtLimit || headAtLimit ? "joint-limits" : "bounded-allocation";
  const metadata: AnatomicalGazeMetadata = { mode: "anatomical", requestedTarget: gaze.target, initialHeadOrigin: [...initialHead.position], initialCorrection: delta,
    normalizedWeights: { neck: normalized[0]!, head: normalized[1]! }, profileSource: source,
    neck: { joint: neckId, initialRotation: starts[0]!, appliedDelta: neckRotation - starts[0]!, rotation: neckRotation, limits: bounds[0], atLimit: neckAtLimit },
    head: { joint: headId, initialRotation: starts[1]!, appliedDelta: headRotation - starts[1]!, rotation: headRotation, limits: bounds[1], atLimit: headAtLimit },
    renderedDirectionError: error, reason };
  return { pose, metadata, headOrigin: [...finalHead.position] as Vec2, referenceWorldDirection: direction(initialHead.matrix, forward), finalWorldDirection: finalDirection,
    desiredAngle: wrapAngle(starts[1]! + delta), appliedAngle: headRotation, directionError: error };
}
