# Contributing

Use Node 22.12+ and npm. Install with `npm install`, then run `npm run typecheck`, `npm test`, and `npm run build`. Run `npm run dev` to inspect the preview. Rebuild examples with `npm run examples` and schemas with `npm run schemas` after relevant changes.

Keep the core free of platform APIs, deterministic, and strictly typed. Document changes in pixel semantics or document format. Add tests for observable behavior, including decoded golden pixels for rendering changes. Never update goldens merely to hide a regression. Preserve format 1.0 compatibility or introduce an explicit version migration.

Keep PRs focused and include the problem, resulting behavior, and validation performed. No cloud service, secret, or paid API is needed to contribute. Run `npx prettier --write .` for formatting (generated JSON can be large).

For skill/distribution changes also run npm run test:skill, npm run pack:release and npm run test:external. Keep the skill instructions engine-free, preserve relative references, and do not report toolchain acceptance as autonomous agent behavior. Reference artwork must have redistribution rights. Publication requires explicit authorization and verified namespace ownership.
