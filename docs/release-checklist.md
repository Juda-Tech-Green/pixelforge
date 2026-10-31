# Controlled release checklist

Version0.4.0 is prepared for local distribution. No GitHub push, release or npm publication is authorized or performed.

1. Run `npm run typecheck`, `npm test`, `npm run test:skill`, all browser smoke scripts, and `npm audit`.
2. Run `npm run pack:release`. This builds packages/editor/playground, regenerates schemas, prepares compiled declarations/license/readme allowlists and packs four tarballs under ignored release/.
3. Run `npm run test:external`. Inspect tarball contents and exports; no src, fixture caches or workspace references should be required.
4. Verify public name/namespace rights using the intended publisher's registry account. `npm view pixelforge` returned404 with an old unpublished timestamp, and `npm view @pixelforge/cli` returned404. Neither proves availability or ownership. Scoped package names are local identifiers until this gate is resolved.
5. Obtain explicit publication authorization. Only then publish the reviewed tarballs in dependency order core, exporters, cli, phaser using `npm publish PATH_TO_TARBALL --access public`, with registry authentication/2FA handled by the maintainer. Do not run this command automatically.

Local installation into an unrelated repository:

```sh
npm install --offline --ignore-scripts /absolute/release/pixelforge-core-0.4.0.tgz /absolute/release/pixelforge-exporters-0.4.0.tgz /absolute/release/pixelforge-cli-0.4.0.tgz /absolute/release/pixelforge-phaser-0.4.0.tgz
node node_modules/@pixelforge/cli/dist/index.js --version
```

Offline needs an existing dependency cache; tarballs do not bundle third-party runtime packages. Review/cache dependencies through normal project policy when needed. The exact local binary is pixelforge, provided by @pixelforge/cli; `npx pixelforge` is not a supported registry installation claim. The root workspace remains private. Public scope ownership is the only unresolved publication-rights gate; local toolchain artifacts can be used now.
