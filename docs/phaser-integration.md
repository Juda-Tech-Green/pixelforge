# Phaser integration

Supported peer range: Phaser `^3.90.0 || ^4.2.1`. Exact independent TypeScript and real WebGL acceptance executed against **3.90.0 and4.2.1** on Windows; other versions in those ranges were not individually executed. This is one adapter using verified common APIs, not a peer-only compatibility claim. Core never imports Phaser. Install/use the local `@pixelforge/phaser` workspace, or build it with `npm run build`. Source conditions resolve TypeScript; default exports resolve compiled JavaScript.

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

`loadPixelForgeAssets` queues files during preload, including game and animation JSON. `readPixelForgeMetadata` validates those cached documents. `registerPixelForgeAnimations` namespaces keys using percent-encoded texture/namespace and animation names; existing registrations are reused. Use a new namespace when intentionally loading a changed animation definition. Base frame duration is the minimum entry duration; Tested Phaser3.90/4.2.1 frame `duration` overrides the base with the full entry milliseconds, preserving variable durations and repeated references. Loop maps to repeat -1; once maps to repeat 0. Missed-frame skipping is disabled.

`applyPixelForgePhysics` sets origin and Arcade body size/offset or circle. Character creation requires Arcade Physics enabled in the game. Bodies use original source pixels, without multiplying by sprite scale; Phaser applies scale. Bodies remain stable throughout an animation. No per-entry body changes are supported.

`observePixelForgeEvents` installs one subscription per sprite, replacing prior subscriptions and returning an idempotent disposer. Entry events emit in metadata array order once on each observed entry transition. Start/restart and loop boundaries reset deduplication. A transition does not replay events from unobserved entries; the adapter disables missed-frame skipping. Completion emits synthetic `animation_complete`. Events are data, never executable code. Destroy removes listeners. Use callbacks to implement game-specific behavior.

The complete runnable scene is `examples/phaser-playground/src/main.ts`. Movement and target-hit logic belong there, not in the adapter. Set `getActiveHitboxes`'s kind argument to `hurtbox` for receiving regions. Current entry is Phaser's one-based animation frame index minus one, so repeated texture references remain distinct.

## Independent installation

Version0.5 local tarballs include compiled adapter/core declarations and JavaScript. Install the complete release set alongside a supported host Phaser version; no workspace aliases are needed. test:external creates and runs such a fresh game outside this repository. See external-phaser-integration.md and release-checklist.md. Public package names remain unpublished by this project.

## Anchors, flips and static geometry

`getActiveAnchors(sprite, gameAsset, animation)` resolves named anchors by project → animation → source frame → entry precedence. The returned world point uses the current sprite position, origin, independent X/Y scale, flips and rotation. Canvas coordinates describe source edges; an anchor is not a trimmed-frame coordinate. Combat hit/hurt rectangles use the same source basis but explicitly reject rotation. Both helpers assume a directly transformed sprite; parent Container transforms are not represented. Avoid containers or perform the full parent world transform in your consumer.

`applyPixelForgePhysics` is the dynamic Arcade workflow. For a static sprite, call `syncPixelForgeStaticBody(staticSprite, gameAsset)` after moving/scaling/changing its origin. This first synchronizes with the game object, then reapplies scaled source geometry and offsets; calling Phaser updateFromGameObject afterward would reset its custom dimensions. The helper requires positive scale and no rotation; static circles additionally require uniform scale. Sprite flipping affects anchor/combat geometry; Arcade collision bodies retain their configured offsets rather than automatically mirroring an asymmetric body. Define the intended collision policy explicitly in the game.

The independent tests move a static sprite after sizing, resynchronize it, and verify exact world bounds on both tested engines. Phaser's [StaticBody implementation](https://github.com/phaserjs/phaser/blob/v3.90.0/src/physics/arcade/StaticBody.js) documents why position/size need explicit synchronization; [Game Object components](https://docs.phaser.io/phaser/concepts/gameobjects/components) explain origin, scale, flips and parent transforms.

## Optional game conventions

Top-down games can update actor depth from actor.y, keep backgrounds lower and use a separate HUD Scene or fixed-scroll high-depth objects. Pick explicit layers for effects and UI; Y-depth is not a required PixelForge convention. Likewise choose action/direction names appropriate to the game and keep them stable in its manifest/runtime mapping. Mirroring is optional; verify asymmetric weapons/anchors instead of assuming a flip fits every character.

Animation keys encode texture namespace and source animation name. Reusing a registration preserves stable keys across scene restarts; when intentionally changing a definition, remove only owned animation keys or select a new namespace. Dispose event observers when replacing objects; destroy cleanup and one-observer replacement prevent duplicate callbacks. Global textures/animation caches may outlive a scene: avoid repeatedly adding the same key or removing assets used by another scene. The adapter does not own gameplay state, HUD, movement systems or a global game manager.

## Other engine versions

Inspect the consumer version before selecting an integration. Phaser4.0/4.1 and Phaser2 are outside this release's supported peer range. Do not force incompatible peers. A consumer can load the native JSON Hash atlas through its engine's own loader and map PixelForge animation/game JSON itself, but that custom path needs independent validation; it is not a blanket compatibility claim. No legacy-peer-deps workaround is required for the two tested versions.
