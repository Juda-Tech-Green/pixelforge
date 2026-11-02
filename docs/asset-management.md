# Reproducible multi-asset builds

Keep assets separate instead of combining every sprite in one dense document:

```text
assets-src/                 Editable .sprite.json, operation batches, generator inputs
public/assets/generated/    Managed runtime bundles
previews/                   Contacts, review maps, semantic reports
temporary/                  Disposable intermediate outputs
pixelforge.assets.json      Small versioned build manifest
```

```json
{
  "version": "1.0",
  "assets": [
    {
      "id": "player",
      "source": "assets-src/player.sprite.json",
      "output": "public/assets/generated/player",
      "layout": "atlas",
      "runtimeKey": "player",
      "operations": ["assets-src/player.effects.ops.json"],
      "inputs": ["assets-src/player.spec.json"],
      "options": { "padding": 1, "maxWidth": 2048, "maxHeight": 2048 }
    }
  ]
}
```

```sh
pixelforge build-assets --manifest pixelforge.assets.json
```

Source and paths are relative to the manifest's directory, use portable forward slashes, and must stay within that root. Dot traversal segments, Windows device names, reserved/control characters and trailing dots/spaces are rejected for portable safety. ID/runtimeKey are unique filesystem-safe names1..64 characters; runtimeKey defaults to id and is used as the bundle basename. Layout is atlas (default) or spritesheet. Options additionally include columns and powerOfTwo. The source is validated; operation batches apply in order in memory without rewriting it. `inputs` are additional hash-tracked generator/specification inputs, **not executable generators**. Run external generators explicitly under your project policy before this command; this is not a shell build system.

Freshness hashes tool version, source bytes, batches, extra inputs and normalized options. A fresh bundle must also pass current ownership/file hash verification. Unchanged assets skip parsing/raster generation and output writes; source bytes are still read for hashing. Changed inputs rebuild only their asset through managed replacement, preserving runtime keys. A manually modified/corrupt generated file causes refusal, not silent overwrite. Missing/escaped/symlinked inputs, duplicate keys, overlapping outputs or any output containing reproducibility inputs fail preflight. Preserve inputs; do not place the manifest/source under a generated output directory.

The concise JSON result reports built/skipped totals and per-asset id/key/output/fingerprint/status. Individual bundles have rollback semantics; a later failure does not undo earlier successfully built assets. Moving a manifest tree may invalidate fingerprints and trigger safe rebuilds. No source deletion, arbitrary shell execution, watch daemon or universal build framework is introduced.

Try `npm run cli -- build-assets --manifest pixelforge.assets.example.json` twice: the second run skips unchanged assets. The example's outputs are under ignored test-output/ and all source/batch inputs remain versioned. Schema: schemas/assets.schema.json.
