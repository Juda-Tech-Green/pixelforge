# Editing with PixelForge

Run `npm run dev` and open the Vite URL. The coin opens initially. Choose New to create a transparent project, Open to select JSON, or drop a `.sprite.json` file onto the workspace. Invalid files show validation paths without replacing your work. Reset to coin example asks before discarding changes, as do New and Open when the project is modified.

Select a palette index, a visible layer, and a drawing tool. Pencil joins rapid pointer movements with integer line segments; eraser writes transparent index 0. Fill is four-connected. Line, rectangle and ellipse preview until release; Filled shapes controls rectangles/ellipses. Escape, pointer cancellation or losing window focus discards an unfinished gesture. Picker samples the selected layer's palette index, including transparent pixels, rather than the composited image.

Zoom is an integer magnification. Space + drag or Pan moves the scrollable viewport without painting. Pixel grid is available at zoom 4 and above. The outlined cursor marks the pixel under the pointer. The right panel can be resized on desktop; the canvas takes the remaining width. On narrow screens, panels and the timeline scroll independently.

The Animation selector offers Source frames or a named sequence. Blank frame and Duplicate frame create a source; when an animation is selected they also insert an entry after the selection. Remove entry changes only the current animation. Delete source frame permanently removes its pixel planes and is rejected while any animation references it. Move earlier/later changes the current sequence; in Source frames mode it changes export/source order without changing animations. Add existing frame can repeat a source frame in one or multiple sequences.

Create, rename or delete animations using the timeline controls. Duration ms belongs to the selected animation entry. Play respects every entry duration, Speed scales preview time, and Loop determines wrapping versus holding the final frame. Playback pauses when the page becomes hidden; elapsed-time selection skips delayed frames rather than accumulating timer drift. Editing is disabled on the canvas during playback.

Previous onion and Next onion independently show neighboring animation entries, tinted pink and blue. Opacity changes overlays only. Looping sequences wrap at the ends; nonlooping ones do not. Repeated references are treated as separate entries. Overlays never modify saved pixels or exports.

Layer order is displayed top first. Raise/lower changes compositing order. Add layer creates a transparent plane in every frame; delete removes it everywhere. The final layer cannot be deleted. Show checkboxes control visibility, and hidden layers cannot be painted.

Select a palette color and edit RGBA bytes or #RRGGBB / #RRGGBBAA, then apply. Add color appends a new index up to 256 entries. Remove unused color checks every frame and layer, including hidden ones, and remaps higher indices while preserving their colors. Index zero is immutable transparent.

Undo/Redo covers one whole gesture or one structural action. New edits clear redo. The default history retains up to 50 checkpoints and 32 MiB of serialized UTF-16 history text; the current and saved documents consume additional memory. Oversized checkpoints may not remain undoable. No snapshots are created during pointer movement or playback. Import/new/reset clears history and establishes a saved baseline. The EditorHistory constructor accepts custom limits.

Save project downloads canonical editable JSON and clears the modified indicator. Browser close/navigation warns while modified. Downloads work without File System Access API. Export frame PNG writes the selected source frame. Export animation PNGs downloads entries in animation order, including repeated references. Export sheet requests columns and padding and downloads a PNG plus PixelForge manifest. Browsers may require allowing multiple downloads. Both sheet and frame exports preserve transparency and exclude onion skins, grid and cursor. Sheets use source-frame order, never trim, and use the same layout code as CLI exports.

## Phase 3

Phase 3 Game Data controls edit collision/origin, scoped hitbox/hurtbox records, anchors and event markers. Scope selector targets project, source frame, animation or exact entry. Overlay switches independently show each kind; Edit geometry on canvas enables snapped drag/corner resize instead of pixel tools. Toggle off overlapping regions to manipulate a covered one. Undo/redo and saving include metadata. Phaser export summary/settings produce browser downloads; keep all files together.
