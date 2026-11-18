import { affine, compose, transform, inverse, distance, wrapAngle, type Vec2, type Affine } from "./math.js";
import { applyPose, forwardKinematics, restPose, solveRigIK, type Diagnostic } from "./kinematics.js";
import { parseRig, parsePoses, poseSchema, type Rig, type Pose } from "./rig-schema.js";
import { semanticPoseSchema, heldObjectSchema, postureNames, semanticJointRoles, type HeldObject, type SemanticTarget, type SemanticJointRole } from "./semantic-schema.js";
import { solveAnatomicalGaze, standardGazeAnatomy, AnatomicalGazeError, type AnatomicalGazeMetadata } from "./anatomical-gaze.js";

export const semanticPoseCapabilities = {
  introducedIn: "0.8.1", schema: "semanticPose", objectSchema: "heldObject",
  extensions: { introducedIn: "0.8.2", gaze: { targets: ["world coordinate", "joint", "role", "object-anchor"], forwardReference: "explicit nonzero head-local vector", rotation: "legacy: head only; anatomical: neck/head with intersected limits",
      modes: ["legacy", "anatomical"], defaultMode: "legacy", standardAnatomy: standardGazeAnatomy,
      customAnatomy: "Existing meaningful neck/head rig limits or explicit profile limits required; no inferred human limits", eyeAim: "not implemented; rendered direction error only" },
    objectPlacement: { spaces: ["world", "joint-local"], references: semanticJointRoles, sampling: "after posture/overrides, before hand IK", rotation: "radians, local in joint-local space; full FK reflection retained" } },
  postures: postureNames, targetSpaces: ["world", "joint-local"],
  contacts: "Named IK targets in the selected base pose and named contacts in the supplied pose library; duplicate names are ambiguous",
  standardRoles: { spine: "spine", chest: "chest", neck: "neck", head: "head",
    leftArm: { root: "left-shoulder", middle: "left-elbow", end: "left-wrist" },
    rightArm: { root: "right-shoulder", middle: "right-elbow", end: "right-wrist" } },
  order: ["base pose constraints", "posture", "explicit overrides", "postured FK object placement", "primary hand IK", "other hand IK", "rig-local attachment layers", "post-IK FK and gaze", "final pose/rig validation"],
  limits: { heldObjects: 1, hands: 2, objectResources: 8 },
};
export interface SemanticDiagnostic { code: string; severity: "error" | "warning"; path: string; message: string; suggestion: string; }
export interface HandResolution {
  hand: "left" | "right"; target: Vec2; reached: Vec2; reachable: boolean; residual: number;
  chain: { root: string; middle: string; end: string }; bend: 1 | -1; rotations: Record<string, number>;
}
interface ResolvedObjectPlacement {
  matrix: Affine; position: Vec2; rotation: number; space: "world" | "joint-local";
  sourceJoint?: string; sourceRole?: SemanticJointRole; localOffset?: Vec2;
}
export interface SemanticPoseResult { ok: boolean; diagnostics: SemanticDiagnostic[]; hands: HandResolution[]; pose?: Pose; rig?: Rig;
  attachment?: { object: string; primaryHand: string; grip: string; originalTarget: Vec2; reachedGrip: Vec2; objectOrigin: Vec2; rotation: number; layers: string[] };
  placement?: { object: string; space: "world" | "joint-local"; sourceJoint?: string; sourceRole?: SemanticJointRole; localOffset?: Vec2;
    worldPosition: Vec2; objectRotation: number; gripPosition: Vec2; attachedWorldPosition: Vec2; reachedGrip: Vec2; matrix: Affine };
  gaze?: { joint: string; targetWorld: Vec2; headOrigin: Vec2; forwardLocal: Vec2; referenceWorldDirection: Vec2;
    desiredAngle: number; appliedAngle: number; finalWorldDirection: Vec2; directionError: number; anatomical?: AnatomicalGazeMetadata };
}

/** Pure deterministic resolution. All parsed sources are copies; errors never modify inputs. */
export function resolveSemanticPose(rigInput: unknown, requestInput: unknown, context: { library?: unknown; objects?: unknown[] } = {}): SemanticPoseResult {
  const diagnostics: SemanticDiagnostic[] = [], hands: HandResolution[] = [];
  const result: SemanticPoseResult = { ok: false, diagnostics, hands };
  const add = (code: string, path: string, message: string, suggestion: string, severity: "error" | "warning" = "error") =>
    diagnostics.push({ code, severity, path, message, suggestion });
  const fail = (code: string, path: string, message: string, suggestion: string): never => {
    add(code, path, message, suggestion); throw new Error(message);
  };
  const geometry = (items: Diagnostic[], path: string) => items.forEach(d => add(`PF_${d.constraint.replaceAll("-", "_").toUpperCase()}`, path, `${d.constraint}: actual ${JSON.stringify(d.actual)}, expected ${JSON.stringify(d.expected)}`, d.action, d.severity));
  try {
    const rig = parseRig(rigInput), request = semanticPoseSchema.parse(requestInput);
    if (request.rig !== rig.id) fail("PF_RIG_REFERENCE", "$.rig", `Expected rig ID ${rig.id}, received ${request.rig}.`, "Use the rig ID, not its filename.");
    const library = context.library === undefined ? undefined : parsePoses(context.library);
    if (library && library.rig !== rig.id) fail("PF_RIG_REFERENCE", "$.basePose", "Pose library belongs to a different rig.", "Supply the matching pose library.");
    const base = (request.basePose ? library?.poses.find(p => p.id === request.basePose) : restPose(rig)) ??
      fail("PF_BASE_POSE_MISSING", "$.basePose", `Unknown base pose ${request.basePose}.`, "Supply --library containing that pose ID, or omit basePose to use the rig rest pose.");
    // Bake existing constraints once, then solve new intentions without reapplying stale targets.
    const initial = applyPose(rig, base);
    geometry(initial.diagnostics, "$.basePose");
    let pose = poseSchema.parse({ ...initial.pose, id: request.id, targets: [] });
    const byId = new Map(rig.joints.map(j => [j.id, j]));
    const requireJoint = (id: string, path: string) => byId.get(id) ?? fail("PF_ANATOMY_MISSING", path, `Joint ${id} does not exist.`, "Provide an explicit roles mapping to existing joints; no bones are synthesized.");
    const posture = request.posture;
    if (posture && posture.type !== "neutral" && posture.strength > 0) {
      const mapped = ["spine", "chest", "neck"].map(role => requireJoint(request.roles?.[role as "spine" | "chest" | "neck"] ?? role, `$.roles.${role}`));
      if (mapped[1]!.parent !== mapped[0]!.id || mapped[2]!.parent !== mapped[1]!.id)
        fail("PF_POSTURE_HIERARCHY", "$.roles", "Posture roles must form a direct spine-chest-neck hierarchy.", "Map the existing humanoid torso chain explicitly.");
      const changes = posture.type === "slumped" ? [.16, .22, .10] : posture.type === "lean_forward" ? [.28, .12, -.08] : [0, 0, 0];
      mapped.forEach((joint, i) => {
        const value = posture.type === "upright" ?
          (pose.rotations[joint.id] ?? joint.rotation) * (1 - posture.strength) + joint.rotation * posture.strength :
          (pose.rotations[joint.id] ?? joint.rotation) + changes[i]! * posture.strength;
        const limited = Math.max(joint.limits[0], Math.min(joint.limits[1], value));
        if (limited !== value) add("PF_POSTURE_LIMIT", "$.posture", `${joint.id} posture was clamped to its declared joint limit.`, "Reduce strength or use a suitable explicit role mapping.", "warning");
        pose.rotations[joint.id] = limited;
      });
    }
    if (request.overrides) pose = poseSchema.parse({ ...pose, ...request.overrides, rotations: { ...pose.rotations, ...request.overrides.rotations } });
    forwardKinematics(rig, pose); // Strictly validate explicit overrides before solving.
    const isWithin = (id: string, ancestor: string): boolean => {
      let current = byId.get(id);
      while (current) { if (current.id === ancestor) return true; current = current.parent ? byId.get(current.parent) : undefined; }
      return false;
    };
    const roleJoint = (role: SemanticJointRole): string => {
      if (role === "spine" || role === "chest" || role === "neck" || role === "head") return request.roles?.[role] ?? role;
      const side = role.startsWith("left") ? "left" : "right";
      const chain = request.roles?.[side === "left" ? "leftArm" : "rightArm"] ?? semanticPoseCapabilities.standardRoles[side === "left" ? "leftArm" : "rightArm"];
      return role.endsWith("Shoulder") ? chain.root : role.endsWith("Elbow") ? chain.middle : chain.end;
    };
    const gazeJointId = request.gaze ? roleJoint("head") : undefined;
    const anatomicalMode = request.gaze?.mode === "anatomical";
    const gazeNeckId = anatomicalMode ? roleJoint("neck") : undefined;
    const gazeControlRoot = anatomicalMode ? gazeNeckId : gazeJointId;
    if (request.gaze) {
      if (!byId.has(gazeJointId!)) fail(anatomicalMode ? "PF_GAZE_ANATOMY_UNAVAILABLE" : "PF_GAZE_ROLE_MISSING", "$.roles.head", `Gaze joint ${gazeJointId} does not exist.`, "Map roles.head to an existing head joint.");
      if (anatomicalMode && !byId.has(gazeNeckId!)) fail("PF_GAZE_ANATOMY_UNAVAILABLE", "$.roles.neck", `Neck joint ${gazeNeckId} does not exist.`, "Map roles.neck to an existing neck joint.");
      if (!anatomicalMode && request.gaze.anatomy) fail("PF_GAZE_PROFILE_INVALID", "$.gaze.anatomy", "An anatomical profile requires explicit anatomical mode.", "Set gaze.mode to anatomical, or remove the anatomy profile.");
      if (!request.gaze.forward) fail("PF_GAZE_FORWARD_MISSING", "$.gaze.forward", "Gaze requires an explicit head-local forward reference.", "Supply a nonzero vector matching the artwork, e.g. [1,0] only when local +X is forward.");
      if (Object.hasOwn(request.overrides?.rotations ?? {}, gazeJointId!)) fail("PF_GAZE_ROTATION_CONFLICT", "$.gaze", "Gaze and an explicit rotation both control the gaze joint.", "Choose semantic gaze or remove the explicit head rotation override.");
      if (anatomicalMode && Object.hasOwn(request.overrides?.rotations ?? {}, gazeNeckId!)) fail("PF_GAZE_ROTATION_CONFLICT", "$.gaze", "Anatomical gaze conflicts with an explicit neck rotation override.", "Put baseline neck rotations in the pose library, or remove the conflicting override.");
    }
    const activeSides = (["left", "right"] as const).filter(side => request.hands?.[side] || request.attachment?.primaryHand === side || request.attachment?.secondaryGrip?.hand === side);
    const activeChains = activeSides.map(side => request.roles?.[side === "left" ? "leftArm" : "rightArm"] ?? semanticPoseCapabilities.standardRoles[side === "left" ? "leftArm" : "rightArm"]);
    if (gazeControlRoot && [...activeChains.map(c => c.end), ...base.targets.map(t => t.end)].some(end => isWithin(end, gazeControlRoot)))
      fail("PF_SEMANTIC_CYCLE", "$.roles.head", "Rotating this gaze joint would invalidate a constrained hand or base-pose target.", "Map head to anatomy outside the constrained arm hierarchy.");
    const objects = new Map<string, HeldObject>();
    if ((context.objects?.length ?? 0) > 8) fail("PF_OBJECT_LIMIT", "$.attachment", "At most eight object resources may be supplied.", "Supply only the referenced resources.");
    for (const input of context.objects ?? []) {
      const object = heldObjectSchema.parse(input);
      if (objects.has(object.id)) fail("PF_OBJECT_DUPLICATE", "$.attachment.object", `Duplicate object ${object.id}.`, "Supply each object ID once.");
      objects.set(object.id, object);
    }
    const objectFor = (id: string, path = "$.attachment.object") => objects.get(id) ?? fail("PF_OBJECT_MISSING", path, `Object ${id} is not loaded.`, "Supply --object FILE with the matching object ID and existing shapes.");
    const anchor = (object: HeldObject, id: string, path = "$.attachment.grip"): Vec2 => Object.hasOwn(object.anchors, id) ? object.anchors[id]! :
      fail("PF_ANCHOR_MISSING", path, `Object ${object.id} has no anchor ${id}.`, "Select an anchor declared in the object's anchors map.");
    const contacts = new Map<string, Vec2[]>();
    for (const c of [...base.targets, ...(library?.animations.flatMap(a => a.contacts) ?? [])]) contacts.set(c.id, [...(contacts.get(c.id) ?? []), c.position]);
    // Joint-local targets are sampled after posture/overrides, before new hand IK.
    const beforeHands = forwardKinematics(rig, pose);
    const placements = new Map<string, ResolvedObjectPlacement>();
    const placementFor = (object: HeldObject): ResolvedObjectPlacement => {
      const cached = placements.get(object.id); if (cached) return cached;
      const override = request.attachment?.object === object.id ? request.attachment.placement : undefined;
      const definition = override ?? object.transform, path = override ? "$.attachment.placement" : `$.objects[${JSON.stringify(object.id)}].transform`;
      if (definition.space === "world") {
        const resolved = { matrix: affine(definition.position, definition.rotation), position: definition.position, rotation: definition.rotation, space: "world" as const };
        placements.set(object.id, resolved); return resolved;
      }
      const sourceRole = "role" in definition ? definition.role : undefined;
      const sourceJoint = "joint" in definition ? definition.joint : roleJoint(definition.role);
      if (!byId.has(sourceJoint)) fail("PF_PLACEMENT_JOINT_MISSING", path, `Placement joint ${sourceJoint} does not exist.`, "Choose an existing joint or provide the matching semantic role mapping.");
      if (activeChains.some(c => isWithin(sourceJoint, c.root)) || (gazeControlRoot && isWithin(sourceJoint, gazeControlRoot)))
        fail("PF_SEMANTIC_CYCLE", path, "Placement reference would move during later hand IK or gaze resolution.", "Use a stable torso joint, e.g. chest, outside the solved hand/head branches.");
      const matrix = compose(beforeHands[sourceJoint]!.matrix, affine(definition.offset, definition.rotation));
      const resolved = { matrix, position: [matrix[4], matrix[5]] as Vec2, rotation: Math.atan2(matrix[1], matrix[0]), space: "joint-local" as const,
        sourceJoint, sourceRole, localOffset: definition.offset };
      placements.set(object.id, resolved); return resolved;
    };
    const objectPoint = (object: HeldObject, id: string): Vec2 => transform(anchor(object, id), placementFor(object).matrix);
    const targetPosition = (target: SemanticTarget): Vec2 => {
      if (target.type === "coordinate") {
        if (target.space === "world") return [...target.position];
        requireJoint(target.joint, "$.hands");
        return transform(target.position, beforeHands[target.joint]!.matrix);
      }
      if (target.type === "object-anchor") return objectPoint(objectFor(target.object), target.anchor);
      const found = contacts.get(target.id);
      if (!found?.length) return fail("PF_CONTACT_MISSING", "$.hands", `No existing contact named ${target.id}.`, "Use an existing base-pose IK target or library animation contact ID; or declare an explicit coordinate target.");
      if (found.length !== 1) return fail("PF_CONTACT_AMBIGUOUS", "$.hands", `Contact ${target.id} is ambiguous.`, "Use unique contact IDs in the supplied library or an explicit coordinate target.");
      return [...found[0]!];
    };
    const attachment = request.attachment, object = attachment ? objectFor(attachment.object) : undefined;
    const primaryTarget = attachment ? objectPoint(object!, attachment.grip) : undefined;
    if (attachment && attachment.secondaryGrip?.hand === attachment.primaryHand) fail("PF_SECONDARY_HAND", "$.attachment.secondaryGrip", "Secondary grip must use the other hand.", "Choose the other hand or omit secondaryGrip.");
    const selections = new Map<"left" | "right", { position: Vec2; bend: 1 | -1 }>();
    for (const side of ["left", "right"] as const) {
      const hand = request.hands?.[side];
      if (hand) selections.set(side, { position: targetPosition(hand.target), bend: hand.bend ?? (side === "right" ? 1 : -1) });
    }
    if (attachment && !selections.has(attachment.primaryHand)) selections.set(attachment.primaryHand, { position: primaryTarget!, bend: attachment.primaryHand === "right" ? 1 : -1 });
    if (attachment?.secondaryGrip && selections.has(attachment.secondaryGrip.hand)) fail("PF_HAND_CONFLICT", "$.attachment.secondaryGrip", "Secondary grip conflicts with an explicit hand target.", "Specify that hand in either hands or secondaryGrip, not both.");
    const usedJoints = new Set<string>();
    const solve = (side: "left" | "right", position: Vec2, bend: 1 | -1) => {
      const chain = request.roles?.[side === "left" ? "leftArm" : "rightArm"] ?? semanticPoseCapabilities.standardRoles[side === "left" ? "leftArm" : "rightArm"];
      for (const id of Object.values(chain)) {
        requireJoint(id, `$.roles.${side}Arm`);
        if (usedJoints.has(id)) fail("PF_ARM_CHAIN_OVERLAP", "$.roles", "Hand chains overlap and cannot be solved independently.", "Use disjoint root-middle-end arm chains.");
        usedJoints.add(id);
      }
      if (byId.get(chain.middle)!.parent !== chain.root || byId.get(chain.end)!.parent !== chain.middle)
        fail("PF_IK_CHAIN", `$.roles.${side}Arm`, "Arm IK requires a direct root-middle-end chain.", "Map shoulder, elbow and wrist to a direct existing chain.");
      const solved = solveRigIK(rig, pose, { ...chain, id: `semantic-${side}`, position, bend });
      pose = poseSchema.parse({ ...solved.pose, targets: [] });
      geometry(solved.diagnostics, `$.hands.${side}`);
      const reached = solved.joints[chain.end]!.position, residual = distance(position, reached), reachable = residual <= 1e-5;
      if (!reachable) add("PF_HAND_UNREACHABLE", `$.hands.${side}`, `Target ${JSON.stringify(position)} leaves residual ${residual} pixels.`, "Move the target closer or revise posture/joint limits; limbs were not stretched.", "warning");
      hands.push({ hand: side, target: [...position], reached: [...reached], residual, reachable, chain, bend,
        rotations: Object.fromEntries(Object.values(chain).map(id => [id, pose.rotations[id] ?? byId.get(id)!.rotation])) });
    };
    const order = attachment ? [attachment.primaryHand, attachment.primaryHand === "right" ? "left" : "right"] as const : ["left", "right"] as const;
    for (const side of order) {
      const selected = selections.get(side);
      if (selected) solve(side, selected.position, selected.bend);
      else if (attachment?.secondaryGrip?.hand === side) {
        const primary = hands.find(h => h.hand === attachment.primaryHand)!;
        const original = objectPoint(object!, attachment.secondaryGrip.anchor);
        solve(side, [original[0] + primary.reached[0] - primaryTarget![0], original[1] + primary.reached[1] - primaryTarget![1]], attachment.secondaryGrip.bend ?? (side === "right" ? 1 : -1));
      }
    }
    let attachedObjectMatrix: Affine | undefined;
    if (attachment) {
      const primary = hands.find(h => h.hand === attachment.primaryHand)!;
      const placement = placementFor(object!);
      const origin: Vec2 = [placement.position[0] + primary.reached[0] - primaryTarget![0], placement.position[1] + primary.reached[1] - primaryTarget![1]];
      const world = forwardKinematics(rig, pose), wrist = world[primary.chain.end]!;
      // Keep the old world-space matrix path byte-for-byte equivalent; local placement retains FK reflection.
      attachedObjectMatrix = placement.space === "world" ? affine(origin, placement.rotation) : [...placement.matrix] as Affine;
      attachedObjectMatrix[4] = origin[0]; attachedObjectMatrix[5] = origin[1];
      const local = compose(inverse(wrist.matrix), attachedObjectMatrix);
      const prefix = "semantic-grip", layerNames = [`${prefix}-palm`, `${prefix}-object`, `${prefix}-front`];
      if (rig.layers.some(l => layerNames.includes(l))) fail("PF_LAYER_COLLISION", "$.attachment.occlusion", "Generated grip layer IDs already exist.", "Use an unmodified source rig without semantic-grip layers.");
      const occlusion = attachment.occlusion;
      let insertAt: number;
      if (occlusion.type === "sandwich") {
        const selected = [...occlusion.palmShapes, ...occlusion.frontShapes];
        if (new Set(selected).size !== selected.length) fail("PF_GRIP_SHAPE_DUPLICATE", "$.attachment.occlusion", "Palm/front shape selections overlap or repeat.", "Select distinct existing palm and front-overlay shapes.");
        const shapes = selected.map(id => rig.shapes.find(s => s.id === id) ?? fail("PF_GRIP_GEOMETRY_MISSING", "$.attachment.occlusion", `Grip shape ${id} does not exist.`, "Provide existing palm/front overlay geometry or choose body-only explicitly."));
        for (const shape of shapes) {
          let joint = byId.get(shape.joint);
          while (joint && joint.id !== primary.chain.end) joint = joint.parent ? byId.get(joint.parent) : undefined;
          if (!joint) fail("PF_GRIP_ANATOMY", "$.attachment.occlusion", `Shape ${shape.id} is not attached to the primary wrist or its descendants.`, "Select geometry belonging to the chosen hand.");
        }
        insertAt = Math.max(...shapes.map(s => rig.layers.indexOf(s.layer))) + 1;
        for (const shape of shapes) shape.layer = occlusion.palmShapes.includes(shape.id) ? layerNames[0]! : layerNames[2]!;
      } else {
        insertAt = rig.layers.indexOf(occlusion.afterLayer) + 1;
        if (insertAt === 0) fail("PF_LAYER_MISSING", "$.attachment.occlusion.afterLayer", `Unknown layer ${occlusion.afterLayer}.`, "Select an existing layer for explicit body-only ordering.");
      }
      rig.layers.splice(insertAt, 0, ...(occlusion.type === "sandwich" ? layerNames : [layerNames[1]!]));
      for (const source of object!.shapes) {
        const id = `held-${source.id}`;
        if (rig.shapes.some(s => s.id === id)) fail("PF_SHAPE_COLLISION", "$.attachment.object", `Generated shape ${id} already exists.`, "Choose a prop with distinct shape IDs.");
        const matrix = compose(local, affine(source.offset, source.rotation));
        const common = { ...source, id, joint: primary.chain.end, layer: layerNames[1]!, offset: transform([0, 0], matrix), rotation: wrapAngle(Math.atan2(matrix[1], matrix[0])) };
        if (source.type === "polygon") rig.shapes.push({ ...common, type: "polygon", points: source.points.map(p => transform(p, matrix)), offset: [0, 0], rotation: 0 });
        else if (source.type === "ellipse") rig.shapes.push({ ...common, type: "ellipse", radius: source.radius });
        else if (source.type === "sprite") {
          if (matrix[0] * matrix[3] - matrix[1] * matrix[2] < 0) fail("PF_PROP_REFLECTION", "$.attachment.object", "A world-oriented sprite prop would require unsupported reflection.", "Use polygon/ellipse geometry for left-facing grips, or supply a suitable right-facing pose.");
          rig.shapes.push({ ...common, type: "sprite", asset: source.asset, frame: source.frame, scale: source.scale });
        }
      }
      result.attachment = { object: object!.id, primaryHand: attachment.primaryHand, grip: attachment.grip,
        originalTarget: primaryTarget!, reachedGrip: primary.reached, objectOrigin: origin, rotation: placement.rotation,
        layers: occlusion.type === "sandwich" ? layerNames : [layerNames[1]!] };
      if (attachment.placement || placement.space === "joint-local") result.placement = {
        object: object!.id, space: placement.space, sourceJoint: placement.sourceJoint, sourceRole: placement.sourceRole, localOffset: placement.localOffset,
        worldPosition: [...placement.position], objectRotation: placement.rotation, gripPosition: primaryTarget!,
        attachedWorldPosition: origin, reachedGrip: primary.reached, matrix: attachedObjectMatrix,
      };
    }
    if (request.gaze) {
      const gaze = request.gaze, joint = byId.get(gazeJointId!)!, world = forwardKinematics(rig, pose), head = world[joint.id]!;
      const reference = gaze.target;
      let target: Vec2;
      if (reference.type === "coordinate") target = [...reference.position];
      else if (reference.type === "joint" || reference.type === "role") {
        const id = reference.type === "joint" ? reference.id : roleJoint(reference.role);
        if (!world[id]) fail("PF_GAZE_TARGET_UNKNOWN", "$.gaze.target", `Gaze target joint ${id} does not exist.`, "Choose an existing joint or a correctly mapped role.");
        if (isWithin(id, gazeControlRoot!)) fail("PF_SEMANTIC_CYCLE", "$.gaze.target", "Gaze target belongs to the rotating head subtree.", "Choose a world target, independent joint, or a prop held outside the head hierarchy.");
        target = [...world[id]!.position];
      } else {
        const targetObject = objectFor(reference.object, "$.gaze.target.object");
        target = transform(anchor(targetObject, reference.anchor, "$.gaze.target.anchor"),
          reference.object === attachment?.object ? attachedObjectMatrix! : placementFor(targetObject).matrix);
      }
      if (distance(target, head.position) < 1e-6) fail("PF_GAZE_COINCIDENT", "$.gaze.target", "Gaze target coincides with the head origin.", "Move the target away from the head origin to define a direction.");
      if (anatomicalMode) {
        const solved = solveAnatomicalGaze(rig, pose, gaze, target, gazeNeckId!, joint.id);
        pose = solved.pose;
        result.gaze = { joint: joint.id, targetWorld: target, headOrigin: solved.headOrigin, forwardLocal: [...gaze.forward!],
          referenceWorldDirection: solved.referenceWorldDirection, desiredAngle: solved.desiredAngle, appliedAngle: solved.appliedAngle,
          finalWorldDirection: solved.finalWorldDirection, directionError: solved.directionError, anatomical: solved.metadata };
        if (solved.metadata.neck.atLimit || solved.metadata.head.atLimit) add("PF_GAZE_LIMIT_REACHED", "$.gaze.anatomy", "Anatomical gaze reached a neck or head limit.", "Inspect per-joint limits and the remaining rendered direction error; do not force extreme rotations.", "warning");
        if (solved.directionError > 1e-5) add("PF_GAZE_TARGET_UNREACHABLE", "$.gaze.target", `Rendered head direction retains ${solved.directionError} radians of error (${solved.metadata.reason}).`, "Accept the bounded pose, reposition the target or deliberately revise the profile; eye pixels are unchanged.", "warning");
      } else {
      const forward = gaze.forward!, current = pose.rotations[joint.id] ?? joint.rotation;
      // Inverse FK handles parent rotations and both facing parities without guessing a world-forward axis.
      const localTarget = transform(target, inverse(head.matrix));
      const delta = wrapAngle(Math.atan2(localTarget[1], localTarget[0]) - Math.atan2(forward[1], forward[0]));
      const desired = wrapAngle(current + delta), lower = Math.max(joint.limits[0], gaze.limits?.[0] ?? -Math.PI), upper = Math.min(joint.limits[1], gaze.limits?.[1] ?? Math.PI);
      if (lower > upper) fail("PF_GAZE_LIMITS_INVALID", "$.gaze.limits", "Gaze limits have no ordered intersection with the rig limits.", "Supply an increasing angle interval inside the head joint's declared limits.");
      const interpolated = gaze.strength === 0 ? current : wrapAngle(current + delta * gaze.strength);
      const applied = Math.max(lower, Math.min(upper, interpolated));
      if (applied !== interpolated) add("PF_GAZE_LIMIT", "$.gaze", "Gaze was clamped to the permitted head angle interval.", "Move the target or revise explicit gaze limits; inspect the remaining direction error.", "warning");
      const direction = (matrix: Affine): Vec2 => {
        const x = matrix[0] * forward[0] + matrix[2] * forward[1], y = matrix[1] * forward[0] + matrix[3] * forward[1], length = Math.hypot(x, y);
        return [x / length, y / length];
      };
      pose.rotations[joint.id] = applied;
      const final = forwardKinematics(rig, pose), finalDirection = direction(final[joint.id]!.matrix);
      const targetAngle = Math.atan2(target[1] - head.position[1], target[0] - head.position[0]);
      result.gaze = { joint: joint.id, targetWorld: target, headOrigin: [...head.position], forwardLocal: [...forward], referenceWorldDirection: direction(head.matrix),
        desiredAngle: desired, appliedAngle: applied, finalWorldDirection: finalDirection,
        directionError: Math.abs(wrapAngle(targetAngle - Math.atan2(finalDirection[1], finalDirection[0]))) };
      }
    }
    result.rig = parseRig(rig); result.pose = poseSchema.parse(pose);
    forwardKinematics(result.rig, result.pose);
    result.ok = !diagnostics.some(d => d.severity === "error");
  } catch (error) {
    if (!diagnostics.some(d => d.severity === "error")) {
      if (error instanceof AnatomicalGazeError) add(error.code, error.path, error.message, error.suggestion);
      else if (error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)) {
        for (const issue of error.issues) add((issue.path as PropertyKey[]).includes("anatomy") ? "PF_GAZE_PROFILE_INVALID" : "PF_SEMANTIC_SCHEMA", "$" + (issue.path as PropertyKey[]).map(p => `[${JSON.stringify(p)}]`).join(""), issue.message as string, "Correct the field using capabilities --schema semanticPose or heldObject and the existing rig schema.");
      } else add("PF_SEMANTIC_RESOLUTION", "$", error instanceof Error ? error.message : String(error), "Check explicit rotations, role mappings and resource references against the rig.");
    }
  }
  return result;
}
