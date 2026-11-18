import { z } from "zod";
import { rigSchema, poseSchema, posesSchema, animationSchema, sceneSchema, observationsSchema, cameraSchema, semanticPoseSchema, heldObjectSchema } from "../packages/geometry/src/index.js";
import { soundSchema, audioOperationsSchema, audioManifestSchema } from "../packages/audio-core/src/index.js";
import {
  gameMetadataSchema,
  bundleManifestSchema,
  animationMetadataSchema,
  gameAssetSchema,
  assetManifestSchema,
  semanticContractSchema,
} from "../packages/core/src/index.js";
import { mkdir, writeFile } from "node:fs/promises";
import {
  projectJsonSchema,
  operationsJsonSchema,
} from "../packages/core/src/index.js";
const generated = new Map<string, unknown>([
  ["project", projectJsonSchema], ["operations", operationsJsonSchema],
]);

for (const [name, schema] of Object.entries({
  rig: rigSchema,
  pose: poseSchema,
  poses: posesSchema,
  rigAnimation: animationSchema,
  semanticPose: semanticPoseSchema,
  heldObject: heldObjectSchema,
  scene: sceneSchema,
  geometryObservations: observationsSchema,
  geometryCamera: cameraSchema,
  sound: soundSchema,
  audioOperations: audioOperationsSchema,
  audioManifest: audioManifestSchema,
  game: gameMetadataSchema,
  bundle: bundleManifestSchema,
  animations: animationMetadataSchema,
  gameAsset: gameAssetSchema,
  assets: assetManifestSchema,
  semanticContract: semanticContractSchema,
}))
  generated.set(name, z.toJSONSchema(schema));

// Optional names let bounded schema edits preserve unrelated working-copy schemas.
const selected = process.argv.slice(2);
for (const name of selected) if (!generated.has(name)) throw new Error(`Unknown schema ${name}`);
await mkdir("schemas", { recursive: true });
for (const [name, schema] of generated) {
  if (selected.length && !selected.includes(name)) continue;
  await writeFile(`schemas/${name}.schema.json`, JSON.stringify(schema, null, 2) + "\n");
}
