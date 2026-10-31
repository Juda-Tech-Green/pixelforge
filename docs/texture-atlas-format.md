# Native Phaser atlas format

PixelForge exports untrimmed Phaser JSON Hash atlases. Load texture PNG and `.atlas.json` with Phaser `load.atlas(key, pngURL, jsonURL)`. This file is distinct from PixelForge manifests, which are not native atlases.

Each `frames` property is a stable source-frame ID. Records contain `frame: {x,y,w,h}`, `rotated:false`, `trimmed:false`, `spriteSourceSize:{x:0,y:0,w,h}` and `sourceSize:{w,h}`. `meta` contains image, RGBA8888 format, atlas dimensions and scale 1. Empty source frames retain full transparent cells. Repeated animation references share one stored source texture.

Packing is deterministic shelf packing in project source-frame order, using as many fixed-size cells per row as the maximum width allows. Padding separates cells; outside margin is zero. This release does not trim or rotate. Power-of-two mode rounds used dimensions up while keeping them within maxima. Non-power-of-two maxima use the largest power-of-two width that fits. Exceeding available space fails before allocation. Maximum side is 8192, padding 0–1024, and raster budget 64 megapixels.

`renderAtlas(project, options)` returns raster, native atlas metadata and unused pixel area. Browser and Node encoders consume these same bytes. Tests reconstruct all source pixels, including transparent frames and padding, and verify deterministic output and failed fitting.
