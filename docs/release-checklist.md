# Controlled v0.5 release preparation

No commit, push, GitHub release or npm publication is authorized by the implementation brief. Local artifacts and validation do not establish public namespace rights. The full executed/unexecuted matrix is v0.5-acceptance-matrix.md.

1. From clean source run npm ci, npm run typecheck, npm test, npm run build. `npm run test:clean` repeats clean-source acceptance in a temporary directory without dist declarations. Cross-platform CI covers Windows/Linux/macOS; only executed jobs count as platform evidence.
2. Run npm run pack:release. Four matching0.5.0 tarballs, SHA256SUMS and RELEASE-0.5.0.md are written under ignored release/. Compiled JS/declarations, licenses/readmes and canonical schemas are allowlisted. Development source conditions are removed only in packed manifests, then the workspace is restored.
3. Run `node scripts/verify-release.mjs release`, `npm run test:skill`, `npm run test:external`, `npm run test:engines`, `npm run bench` and all browser smoke suites with their dev servers running. npm audit must be reviewed. Do not claim success from uncollected process handles.
4. Check complete P0/P1 acceptance and candidate limitations. Engine exact versions3.90.0/4.2.1 are independently typed and browser-tested. Other platforms/versions and autonomous host sessions need explicit evidence. Prepare release notes reflecting actual results, not an unconditional readiness claim.
5. If publication is later requested, verify publisher namespace rights with the intended account and obtain explicit authorization before publishing/pushing/creating a release. This checklist does not grant that authorization; no publication command runs automatically.

See setup.md for one source-checkout and portable consumer installation path. Copy reviewed archives/checksums into a stable vendor directory inside the game; install the matching local set with normal online dependency resolution and no unrelated sibling source paths. --offline is explicit and requires cached third-party dependencies. Source tarballs do not bundle those dependencies or authenticate a publisher. SHA256SUMS is corruption detection, not a signature/provenance attestation; use a trusted distribution channel.

Reproducibility means documented source revision, lockfile, Node/npm versions and exact build/test commands. Cross-platform byte-for-byte archive reproducibility and signed supply-chain provenance are not claimed. Retain original editable inputs and do not publish ignored test artifacts or caches.
