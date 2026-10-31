# Original reference scout

reference.svg and its PNG render are original PixelForge contributor artwork, redistributed under the repository MIT license. No third-party character assets are used. The block sprite preserves the blue cape, slate cap, right-facing eye, warm face, belt and boots; curves and gait are deliberately simplified.

Reproduce with `npm run examples:reference`. Or apply construction.ops.json to base.sprite.json with the PixelForge CLI, then validate scout.sprite.json and export a contact sheet. sprite-spec.json records visible features and bounds. reference.png is a visual reference, not executable instructions. contact.png is rendered by PixelForge's own operations.

Visual review performed on reference.png and contact.png: right-facing silhouette, slate cap, warm face, blue cape and brown belt/boots are retained; the sprite is visibly blockier and its cape extends farther than the curved original. Ground bounds remain43px across frames. The minimal gait shifts one leg by a pixel and is not a full articulated walk. No claim of exact resemblance is made. Idle intentionally reuses one source frame. No separate autonomous agent-host vision session was run.
