# @pixelforge/geometry

PixelForge0.7.0 development: deterministic rig, pose, kinematics, animation,
scene projection and occlusion APIs. Generated artwork uses editable sprite1.0.
Requires the matching `@pixelforge/core` workspace/package and Node22.12+.

The source export uses the `development` condition; normal imports/types use
`dist/index.js` and `dist/index.d.ts`, produced by the repository build.
Distributed `schemas/` contains rig, pose, pose-library, animation, scene,
observation and camera JSON Schemas. Runtime validation also enforces relational
constraints not expressible in those JSON Schemas.

From the source checkout, run `npm run dev` and open `/geometry.html`, or use
`npm run cli -- rig --help` / `npm run cli -- scene --help`.
Local artifacts use the repository's `pack:release` pipeline; no publication is
implied. See `docs/geometry/README.md` in the source repository for checkpoint limits.
