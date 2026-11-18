import { createRig, createPoseLibrary } from "../../packages/geometry/src/index.js";
import { writeFile } from "node:fs/promises";
const rig = createRig("standard", "semantic-clerk");
rig.name = "Semantic posing fixture";
rig.shapes = rig.shapes.filter(s => !["blade", "guard", "cape"].includes(s.id));
rig.shapes.push({ id: "grip-overlay", type: "ellipse", joint: "right-wrist", layer: "limbs-front",
  radius: [1, 1], offset: [0, 0], rotation: 0, color: 3, outline: 0 });
const library = createPoseLibrary(rig);
library.poses = library.poses.filter(p => p.id === "idle");
library.animations = [];
const object = { format: "pixelforge-held-object", version: "1.0", id: "folder",
  transform: { space: "world", position: [44, 36], rotation: 0 },
  anchors: { grip: [0, 0], support: [-7, 0] },
  shapes: [{ id: "folder-body", type: "polygon", joint: "folder", layer: "paper", color: 4, outline: 1,
    points: [[-8, -5], [1, -5], [1, 8], [-8, 8]] }] };
const request = { format: "pixelforge-semantic-pose", version: "1.0", id: "slumped-folder", rig: rig.id, basePose: "idle",
  posture: { type: "slumped", strength: 0.65 },
  attachment: { object: "folder", primaryHand: "right", grip: "grip",
    occlusion: { type: "sandwich", palmShapes: ["right-hand-shape"], frontShapes: ["grip-overlay"] } } };
for (const [file, data] of Object.entries({ "clerk.rig.json": rig, "clerk.poses.json": library, "folder.object.json": object, "hold.semantic-pose.json": request }))
  await writeFile(new URL(file, import.meta.url), JSON.stringify(data, null, 2) + "\n");
