---
name: PixelForge
description: A quiet developer workspace for inspecting editable pixel art.
colors:
  primary: "#b0db88"
  primary-hover: "#c4e7a6"
  primary-ink: "#203020"
  page: "#181c20"
  canvas-surround: "#14181c"
  timeline: "#20262c"
  control: "#272e35"
  control-hover: "#38434a"
  frame: "#181e23"
  frame-selected: "#2a352a"
  separator: "#343b42"
  control-border: "#46505a"
  foreground: "#e5e9ec"
  secondary: "#a7b2bc"
  checker-light: "#30373e"
  checker-dark: "#252b31"
  swatch-border: "#66717a"
  swatch-checker-dark: "#30383f"
  scrollbar: "#59656e"
  error-surface: "#422b2b"
  error-text: "#ffddce"
  error-border: "#975b4d"
typography:
  brand:
    fontFamily: '"Segoe UI", sans-serif'
    fontSize: "21px"
    fontWeight: 650
    letterSpacing: "-0.035em"
  headline:
    fontFamily: '"Segoe UI", sans-serif'
    fontSize: "18px"
    fontWeight: 700
    letterSpacing: "-0.02em"
  title:
    fontFamily: '"Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 700
  body:
    fontFamily: '"Segoe UI", sans-serif'
    fontSize: "13px"
    lineHeight: 1.7
  label:
    fontFamily: '"Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 600
  measurement:
    fontFamily: "ui-monospace, monospace"
    fontSize: "11px"
rounded:
  compact: "3px"
  control: "5px"
spacing:
  tight: "8px"
  small: "12px"
  medium: "16px"
  panel: "24px"
  large: "32px"
components:
  button:
    backgroundColor: "{colors.control}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  button-hover:
    backgroundColor: "{colors.control-hover}"
  playback:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  playback-hover:
    backgroundColor: "{colors.primary-hover}"
  frame:
    backgroundColor: "{colors.frame}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "5px"
  frame-selected:
    backgroundColor: "{colors.frame-selected}"
  format-badge:
    textColor: "{colors.secondary}"
    rounded: "{rounded.compact}"
    padding: "3px 5px"
---

# Design System: PixelForge

## Overview

The established direction is a clean, lightweight developer tool. Charcoal surfaces recede around the pixel artwork; precise controls and restrained green state cues support inspection. The interface is compact and practical, with native browser controls and system typography.

Key characteristics: tonal workspace layers, crisp pixel rendering, quiet metadata, and an accent reserved for playback, selection, and focus. This captures the implemented preview rather than a new visual identity.

## Colors

### Primary

Pale green (`primary`) marks playback, the selected frame border, keyboard focus, and text selection. Its lighter hover variant belongs to the playback button; its dark ink keeps that button legible. The selected-frame surface gives the green border a subtle tonal companion.

### Neutral

The page surface holds navigation and metadata. The darker canvas surround separates artwork from controls; the lighter timeline defines the animation area. Foreground and secondary text establish hierarchy without competing with sprite colors. Fine separators and slightly stronger control borders delineate regions and interactive elements.

The two canvas checker tones indicate transparency in the artboard and frame thumbnails. Palette transparency uses its own smaller checker and swatch border. Sprite colors and example illustrations are content, not interface accents. Warm error colors are reserved for the dismissible import/load alert.

## Typography

Use Segoe UI with a sans-serif fallback throughout the shell. The brand is slightly condensed through negative tracking; headings remain modest in scale. Body copy is small and comfortably spaced. Section labels and controls use compact system type.

Use UI monospace for zoom, canvas dimensions, frame numbers, and frame duration. Frame timing steps down to a smaller size (10px); zoom steps up (12px). Numeric metadata uses tabular figures. Mobile reduces the brand to 18px and workspace heading to 16px. There is no display or marketing type treatment in the preview.

## Layout

Desktop uses a fixed project sidebar (270px) beside a flexible workspace. A header (76px) spans both. The workspace stacks a toolbar (65px), scrollable canvas stage, timeline, and footer. Sidebar padding is 32px vertically and 24px horizontally; the toolbar and timeline use 26px horizontal insets. The canvas remains the dominant area, centered safely so oversized imports can scroll without clipping their leading edge.

At a maximum width of 800px, the sidebar narrows to 210px, panel insets reduce to 16px, the local-workspace label disappears, and timeline controls can wrap. The stage becomes 400px tall.

At a maximum width of 580px, the shell becomes a single column. A shorter header (65px) precedes the compact example switcher, workspace, and timeline. Examples form two equal columns. Introductory and repeated project metadata are hidden; a native **Project details** disclosure keeps canvas size, frame count, layer count, format, palette count, and palette swatches available. It begins collapsed and expands in normal document flow. The stage is 360px tall with a 300px minimum. Long project names truncate in the toolbar, and the format badge is hidden.

Frame buttons scroll horizontally at every width. Preserve exact canvas zoom and permit stage scrolling for large artwork; do not shrink the canvas with responsive image sizing.

## Elevation & Depth

Depth primarily comes from adjacent charcoal tones and one-pixel rules. The artboard alone uses a soft dark shadow to lift it from the canvas surround. Buttons and panels do not float. The inset shadows on the tiny example illustrations belong to their pixel artwork, not the shell's elevation system.

## Shapes

Controls and frames use gently rounded corners (`control`); badges and palette swatches use the smaller radius (`compact`). Artboards and thumbnails stay square-edged to preserve pixel geometry. Borders remain thin and quiet, gaining green emphasis for the selected frame.

## Components

### Buttons and fields

Standard buttons and the native animation select use a dark control surface, light text, and a stronger neutral border. Hover changes button background over a short transition. Keyboard focus is a green outline (2px) offset by 3px. Disabled controls reduce opacity to 0.45. Reduced-motion preferences remove transitions.

Playback uses the green primary variant with a minimum width of 68px. Zoom buttons are compact and flank a fixed-width monospace output. Import invokes a file picker; keep its visible action label explicit.

### Example navigation and metadata

Example buttons have transparent backgrounds, quiet borders, small pixel illustrations, names, and dimensions. Desktop metadata uses a two-column definition list with right-aligned values. Palette swatches wrap rather than overflow. On mobile, the native Project details summary retains its disclosure marker, keyboard operation, and visible focus treatment.

### Canvas and timeline

Render canvas pixels without smoothing. Use a transparency checker behind the artboard and each thumbnail, with a finer checker in thumbnails. Frame buttons contain a thumbnail and compact timing row; selected state uses both a green border and a tinted surface, reflected by `aria-pressed`. Selecting a frame pauses playback. The animation selector sits alongside playback controls and wraps on narrow screens.

### Feedback

Loading and empty states use direct text within the existing workspace. Load errors appear in a warm-toned alert above the toolbar, with wrapping, scrollable technical detail and a Dismiss button. Keep feedback within the tool shell.

## Do's and Don'ts

- **Do** keep the pixel artwork visually primary and preserve its crisp edges.
- **Do** use green consistently for playback, selection, and focus.
- **Do** preserve access to project metadata through the mobile disclosure.
- **Do** retain native control semantics, readable labels, and reduced-motion behavior.
- **Don't** turn sprite palette colors into additional shell accents.
- **Don't** replace exact pixel zoom with responsive canvas scaling.
- **Don't** use decorative elevation or oversized type that competes with the workspace.

## v0.2 editor extension

The Operate surface now has a 145px tool rail, flexible pixel viewport, resizable 240px properties panel, and a scrollable timeline. At 800px the properties panel moves below the canvas. Lucide icons accompany tool labels. Pink previous/blue next onion overlays remain canvas-only. Active tools, frames, colors and layers use green selection cues. Native dialogs collect short names and warn on unsaved replacement. Scoped editor styles preserve mobile controls.
