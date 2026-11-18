import { affine, compose, transform, inverse, distance, wrapAngle, type Vec2 } from "./math.js";
import { applyPose, forwardKinematics, restPose, solveRigIK, type Diagnostic } from "./kinematics.js";
import { parseRig, parsePoses, poseSchema, type Rig, type Pose } from "./rig-schema.js";
import { semanticPoseSchema, heldObjectSchema, postureNames, type HeldObject, type SemanticTarget } from "./semantic-schema.js";

export const semanticPoseCapabilities = {
  introducedIn: "0.8.1", schema: "semanticPose", objectSchema: "heldObject",
  postures: postureNames, targetSpaces: ["world", "joint-local"],
  contacts: "Named IK targets in the selected base pose and named contacts in the supplied pose library; duplicate names are ambiguous",
  standardRoles: { spine: "spine", chest: "chest", neck: "neck",
    leftArm: { root: "left-shoulder", middle: "left-elbow", end: "left-wrist" },
    rightArm: { root: "right-shoulder", middle: "right-elbow", end: "right-wrist" } },
  order: ["base pose constraints", "posture", "explicit overrides", "primary hand IK", "other hand IK", "rig-local attachment layers"],
  limits: { heldObjects: 1, hands: 2, objectResources: 8 },
};
export interface SemanticDiagnostic { code: string; severity: "error" | "warning"; path: string; message: string; suggestion: string; }
export interface HandResolution {
  hand: "left" | "right"; target: Vec2; reached: Vec2; reachable: boolean; residual: number;
  chain: { root: string; middle: string; end: string }; bend: 1 | -1; rotations: Record<string, number>;
}
export interface SemanticPoseResult { ok: boolean; diagnostics: SemanticDiagnostic[]; hands: HandResolution[]; pose?: Pose; rig?: Rig;
  attachment?: { object: string; primaryHand: string; grip: string; originalTarget: Vec2; reachedGrip: Vec2; objectOrigin: Vec2; rotation: number; layers: string[] }; }

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
    const objects = new Map<string, HeldObject>();
    if ((context.objects?.length ?? 0) > 8) fail("PF_OBJECT_LIMIT", "$.attachment", "At most eight object resources may be supplied.", "Supply only the referenced resources.");
    for (const input of context.objects ?? []) {
      const object = heldObjectSchema.parse(input);
      if (objects.has(object.id)) fail("PF_OBJECT_DUPLICATE", "$.attachment.object", `Duplicate object ${object.id}.`, "Supply each object ID once.");
      objects.set(object.id, object);
    }
    const objectFor = (id: string) => objects.get(id) ?? fail("PF_OBJECT_MISSING", "$.attachment.object", `Object ${id} is not loaded.`, "Supply --object FILE with the matching object ID and existing shapes.");
    const anchor = (object: HeldObject, id: string): Vec2 => Object.hasOwn(object.anchors, id) ? object.anchors[id]! :
      fail("PF_ANCHOR_MISSING", "$.attachment.grip", `Object ${object.id} has no anchor ${id}.`, "Select an anchor declared in the object's anchors map.");
    const objectPoint = (object: HeldObject, id: string): Vec2 => transform(anchor(object, id), affine(object.transform.position, object.transform.rotation));
    const contacts = new Map<string, Vec2[]>();
    for (const c of [...base.targets, ...(library?.animations.flatMap(a => a.contacts) ?? [])]) contacts.set(c.id, [...(contacts.get(c.id) ?? []), c.position]);
    // Joint-local targets are sampled after posture/overrides, before new hand IK.
    const beforeHands = forwardKinematics(rig, pose);
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
    if (attachment) {
      const primary = hands.find(h => h.hand === attachment.primaryHand)!;
      const origin: Vec2 = [object!.transform.position[0] + primary.reached[0] - primaryTarget![0], object!.transform.position[1] + primary.reached[1] - primaryTarget![1]];
      const world = forwardKinematics(rig, pose), wrist = world[primary.chain.end]!;
      const local = compose(inverse(wrist.matrix), affine(origin, object!.transform.rotation));
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
        originalTarget: primaryTarget!, reachedGrip: primary.reached, objectOrigin: origin, rotation: object!.transform.rotation,
        layers: occlusion.type === "sandwich" ? layerNames : [layerNames[1]!] };
    }
    result.rig = parseRig(rig); result.pose = poseSchema.parse(pose);
    forwardKinematics(result.rig, result.pose);
    result.ok = !diagnostics.some(d => d.severity === "error");
  } catch (error) {
    if (!diagnostics.some(d => d.severity === "error")) {
      if (error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)) {
        for (const issue of error.issues) add("PF_SEMANTIC_SCHEMA", "$" + (issue.path as PropertyKey[]).map(p => `[${JSON.stringify(p)}]`).join(""), issue.message as string, "Correct the field using capabilities --schema semanticPose or heldObject and the existing rig schema.");
      } else add("PF_SEMANTIC_RESOLUTION", "$", error instanceof Error ? error.message : String(error), "Check explicit rotations, role mappings and resource references against the rig.");
    }
  }
  return result;
}
