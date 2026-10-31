# Phaser integration

Supported engine: Phaser 3.90 (`phaser: ^3.90.0` peer dependency). Core never imports Phaser. Install/use the local `@pixelforge/phaser` workspace, or build it with `npm run build`. Source conditions resolve TypeScript; default exports resolve compiled JavaScript.

```ts
import {
  loadPixelForgeAssets,
  readPixelForgeMetadata,
  registerPixelForgeAnimations,
  createPixelForgeCharacter,
  playPixelForgeAnimation,
  getActiveHitboxes,
} from "@pixelforge/phaser";
// Import your generated bundle.json; parse it using bundleManifestSchema.
// preload():
loadPixelForgeAssets(this, { key: "hero", baseURL: "/assets/hero", manifest });
// create():
const data = readPixelForgeMetadata(this, "hero");
const keys = registerPixelForgeAnimations(this, {
  key: "hero",
  manifest,
  ...data,
});
const player = createPixelForgeCharacter(this, {
  key: "hero",
  game: data.game,
  x: 150,
  y: 390,
  layout: manifest.layout,
});
playPixelForgeAnimation(player, keys, "idle");
// update():
const attacks = getActiveHitboxes(player, data.game, "attack");
```

`loadPixelForgeAssets` queues files during preload, including game and animation JSON. `readPixelForgeMetadata` validates those cached documents. `registerPixelForgeAnimations` namespaces keys using percent-encoded texture/namespace and animation names; existing registrations are reused. Use a new namespace when intentionally loading a changed animation definition. Base frame duration is the minimum entry duration; Phaser 3.90 frame `duration` overrides the base with the full entry milliseconds, preserving variable durations and repeated references. Loop maps to repeat -1; once maps to repeat 0. Missed-frame skipping is disabled.

`applyPixelForgePhysics` sets origin and Arcade body size/offset or circle. Character creation requires Arcade Physics enabled in the game. Bodies use original source pixels, without multiplying by sprite scale; Phaser applies scale. Bodies remain stable throughout an animation. No per-entry body changes are supported.

`observePixelForgeEvents` installs one subscription per sprite, replacing prior subscriptions and returning an idempotent disposer. Entry events emit in metadata array order once on each observed entry transition. Start/restart and loop boundaries reset deduplication. A transition does not replay events from unobserved entries; the adapter disables missed-frame skipping. Completion emits synthetic `animation_complete`. Events are data, never executable code. Destroy removes listeners. Use callbacks to implement game-specific behavior.

The complete runnable scene is `examples/phaser-playground/src/main.ts`. Movement and target-hit logic belong there, not in the adapter. Set `getActiveHitboxes`'s kind argument to `hurtbox` for receiving regions. Current entry is Phaser's one-based animation frame index minus one, so repeated texture references remain distinct.

## Independent installation

Version0.4 local tarballs include compiled adapter/core declarations and JavaScript. Install the complete release set alongside Phaser3.90; no workspace aliases are needed. test:external creates and runs such a fresh game outside this repository. See external-phaser-integration.md and release-checklist.md. Public package names remain unpublished by this project.
