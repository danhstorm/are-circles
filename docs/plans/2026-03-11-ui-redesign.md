# UI Redesign: Retro Synth Console

## Status: In Progress (2026-03-11)

## Summary

Complete visual redesign of the setup UI. LIVE mode becomes a small floating card. SETUP mode opens two floating panels: visual controls (right) and synth controls (left). Synth panel has retro synthesizer / VHS cassette aesthetic with decorative SVG elements, per-instrument personality, and proportional resize via drag handle.

## Layout

### LIVE Mode
- Small floating card, top-right corner, ~240px wide, auto-height
- Segmented LIVE/SETUP toggle, 3 preset buttons, transition speed, close button
- No synth panel visible

### SETUP Mode
- Right panel (~420px): Visual controls. Cleaned up spacing, consistent sections.
- Left panel (~320px default, resizable 240-480px): Synth controls with retro aesthetic.
- Left panel only visible in SETUP mode.

## Synth Panel Design

### Aesthetic
- Vintage synthesizer / VHS / cassette culture inspired
- Dark body with subtle CSS noise/scanline texture
- Panel corner screws (SVG), tape-reel decoration at top
- "SYNTH" header in stencil lettering

### Per-Instrument Modules
Each gets a unique personality:
- **Pling** (teal #4fd1c5): Sparkle/crystal icon
- **Plong** (amber #f6ad55): Bell/mallet icon  
- **Bong** (pink #f687b3): Gong/bowl icon
- **Pad** (green #68d391): Wave/drone icon

### Module States
- **Collapsed**: Header + enable LED + mini VU meter (activity indicator)
- **Expanded**: All controls visible. Auto sub-section also collapsible.

### Controls
- Thin 3px track sliders with accent-colored filled portion
- Accent-colored thumbs on range sliders
- Embossed pill-shaped speed/sound buttons
- LED-style digital BPM display for tempo

### Resize
- Drag handle on right edge of synth panel
- Min 240px, max 480px
- `--panel-scale = width / 320` CSS custom property
- All sizes multiply by scale factor
- Width persisted in localStorage

## SetupPanel Cleanup
- Consistent 12px/8px padding in sections
- Labels never clip (min-width on value displays)
- Uniform gap-3 in grid layouts
- RangeSlider thumbs properly inset
- Media thumbnails get more breathing room

## Unchanged
- All functionality, data flow, prop interfaces
- Engine files, types, settings persistence
- Keyboard shortcuts
- All control values, ranges, steps
