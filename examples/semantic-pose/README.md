# Semantic pose fixture — v0.8.1

This small standard-humanoid fixture is separate from the Antigravity clerk
evaluation in `examples/clerk/`. It demonstrates a 0.65-strength slump, a right
hand automatically targeting a folder grip, and explicit palm/folder/front-overlay
ordering. The tiny wrist ellipse is supplied fixture geometry, not generated
finger anatomy. `create-fixtures.ts` records the inputs; do not rerun it over edits.

Runtime/package versions are 0.8.1. All request/asset formats remain 1.0 with
separate `pixelforge-semantic-pose` and `pixelforge-held-object` identifiers.
The folder uses the character palette, its own local grip/support anchors and a
world transform. No animation or detailed illustration is generated.

Run from the repository root:

```powershell
npm run cli -- capabilities --json
npm run cli -- capabilities --schema semanticPose
npm run cli -- doctor examples/semantic-pose/hold.semantic-pose.json --rig examples/semantic-pose/clerk.rig.json --library examples/semantic-pose/clerk.poses.json --object examples/semantic-pose/folder.object.json --json
npm run cli -- rig resolve-pose examples/semantic-pose/hold.semantic-pose.json --rig examples/semantic-pose/clerk.rig.json --library examples/semantic-pose/clerk.poses.json --object examples/semantic-pose/folder.object.json --out examples/semantic-pose/resolved.pose.json --out-rig examples/semantic-pose/resolved.rig.json --json
npm run cli -- rig render examples/semantic-pose/resolved.rig.json --pose examples/semantic-pose/resolved.pose.json --output examples/semantic-pose/resolved.png --sprite examples/semantic-pose/resolved.sprite.json
npm run cli -- preview examples/semantic-pose/resolved.sprite.json --out examples/semantic-pose/preview.png --json
```

Omit both output flags for read-only JSON resolution. Output files are protected
unless `--force` is explicitly selected. Inspect reach diagnostics before rendering.
If using the optional secondary grip, add `secondaryGrip: {hand: "left", anchor:
"support"}` to attachment and review its residual as well.

Resolved poses are ordinary existing pose artifacts. For a held prop, render with
the returned derived rig; the source rig is unchanged. Contact sheets are available
after explicitly creating an ordinary sprite animation through existing tools.
