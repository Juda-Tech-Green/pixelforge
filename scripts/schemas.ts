import { z } from "zod";
import { rigSchema, poseSchema, posesSchema, animationSchema, sceneSchema, observationsSchema, cameraSchema } from "../packages/geometry/src/index.js";
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
await mkdir("schemas", { recursive: true });
await writeFile(
  "schemas/project.schema.json",
  JSON.stringify(projectJsonSchema, null, 2) + "\n",
);
await writeFile(
  "schemas/operations.schema.json",
  JSON.stringify(operationsJsonSchema, null, 2) + "\n",
);

for (const [name, schema] of Object.entries({
  rig: rigSchema,
  pose: poseSchema,
  poses: posesSchema,
  rigAnimation: animationSchema,
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
  await writeFile(
    `schemas/${name}.schema.json`,
    JSON.stringify(z.toJSONSchema(schema), null, 2) + "\n",
  );
