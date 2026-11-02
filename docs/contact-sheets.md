# Labeled animation review

```sh
pixelforge contact hero.sprite.json --animations idle,walk,attack --columns 4 --scale 4 --background checkerboard --output previews/hero.png
pixelforge contact hero.sprite.json --prefix walk- --start 0 --end 8 --output previews/directions.png
```

Selection preserves **project animation order**, then each animation's entry order, including repeated references. --start is inclusive and --end exclusive for each animation. --prefix is an opt-in naming filter; no directional convention is required. Unknown explicit names fail rather than silently disappear. Labels always show the animation, source frame ID, entry index and milliseconds. Long visible labels are clipped to the cell's text capacity; the companion `.contact.json` retains full identifiers and exact image/label rectangles.

Scale is integer1..16 with nearest-neighbor raster copies. Columns1..32; transparent is the default background, checkerboard optional. Text strips have opaque pale backgrounds even when the sprite area is transparent. Limits:1000 selected cells,64MP output,32767px per dimension, checked before raster allocation. Split large reviews by animation/prefix/range. PNG and map are individually atomically written, not a two-file transaction.

Review actual contact PNGs for silhouette, ground alignment, palette, effect phases and transition readability. Render detailed entries with `render` as needed. A contact sheet is visual evidence, not proof of pleasing motion; preview actual timed playback in the editor/game when relevant. File/schema validation alone is structural-only evidence.
