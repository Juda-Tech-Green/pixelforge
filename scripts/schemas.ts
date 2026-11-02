import { z } from "zod";
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
