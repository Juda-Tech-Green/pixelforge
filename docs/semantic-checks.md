# Task-defined semantic expectations

```sh
pixelforge check hero.sprite.json --contract hero.expectations.json
```

Example contract (customize names and thresholds to the task):

```json
{
  "version": "1.0",
  "requiredAnimations": ["idle", "attack"],
  "requiredAnchors": ["weapon"],
  "animations": [
    {
      "name": "attack",
      "requiredLayers": ["aura"],
      "layerPhases": [
        { "layer": "aura", "minDistinctPhases": 2, "minVisibleEntries": 3 }
      ],
      "durationsMs": [100, 150, 200],
      "baselineTolerance": 1,
      "boundsTolerance": 3,
      "warnEmpty": true
    }
  ],
  "exceptions": [
    {
      "animation": "attack",
      "check": "baseline",
      "reason": "Approved airborne attack"
    }
  ]
}
```

Optional coverage `{ "actions":["idle","walk"], "directions":["front","back"], "separator":"-" }` expands exact required names. It does not mandate four/eight directions globally. Schema: schemas/semanticContract.schema.json.

Reports distinguish structuralErrors (invalid source or contract), semanticViolations (explicit missing names/layers/anchors/phases/coverage/timing), visualWarnings (empty/baseline/bounds review) and intentionalExceptions. Schema or contract violations exit1; warnings alone exit0. Exception keys are requiredAnimation, anchor, layer, phases, coverage, timing, empty, baseline, bounds; animation `$project` applies to required anchors. Exceptions require a reason and suppress only that explicitly selected check. Untriggered exceptions do not appear as evidence of a passed check.

Required layers must contain visible pixels in every selected animation entry only when explicitly requested. Hidden required/effect layers violate the configured contract. Fully empty effect phases do not count toward minDistinctPhases. Distinct phases compare that layer's visible RGBA values, normalizing transparent pixels and verifying equality after hash bucketing. Stored distinct rasters are capped at64MiB per layer check. Invisible layers can still be inspected as source planes; required visible artwork must also be reviewed in the composed image. Baseline is visible bounds bottom (exclusive), drift is max-minus-min; bounds drift compares x/y/width/height with the first nonempty entry. Timing arrays require exact ordered milliseconds. A static idle is valid unless a task explicitly requires changing phases.

These checks do not judge aesthetic quality, likeness, smoothness, or whether electricity looks convincing. Use the contact command and actual vision/playback alongside configured contracts.
