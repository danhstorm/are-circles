# Live/Setup Restructure + Generative Music

## Summary
Replace the 9-preset settings panel with a LIVE/SETUP dual-mode system. 3 live presets (keys 1-3), setup panel for editing, generative music engine with 4 instruments, versioned persistence.

## Modes
- **LIVE** (default): Clean canvas, keys 1/2/3 switch presets. H opens setup.
- **SETUP**: Right panel = preset editor (select 1/2/3 at top, edit visual+media). Left panel = music settings. 9 old presets become "Load template" options.

## Data Model

### Per Live Preset (3 slots)
Visual settings (pattern, circles, drift, grid, blur, focus, opacity), media on/off + interval/fade, which music instruments are enabled.

### Global
Colors, media overrides (invert/loop/intensity per video), media grid columns, transition speed, full music config (scale, tempo, all instrument params, visual reactions).

## Music Engine
4 instruments, Web Audio API, ConvolverNode reverb (generated IR), lookahead scheduler.

- **Pling**: Triangle/sine + LFO cutoff. High register (C4-C6). Short pluck.
- **Mid 1**: FM synthesis, selectable sound (xylophone/rhodes/breathy/bell/kalimba/glass). Mid register (C3-C5). Primary visual reactor.
- **Mid 2**: Duplicate of Mid 1, independent sound selection.
- **Pad**: Detuned oscillators, sustained drone, crossfade chord changes. Low-mid (C2-C4).

All have: volume, speed subdivision, trigger %, delay send, reverb send.
Pling adds: LFO speed, LFO depth.
Pad: chord interval instead of speed/trigger.

Fade: 2s master gain ramp on preset switch. No jitter/glitch.

## Visual Reactions
- Swirl impulses (phantom cursor presses on note trigger, random position)
- Size pulse (note velocity → particle size, lower pitch → bigger boost)
- Settings: swirl strength, swirl radius, size pulse strength, bass boost

## Persistence
- `public/settings.json`: canonical, committed to repo, content-hash version
- localStorage: cached copy with version field, auto-replaced if server is newer
- All changes auto-save immediately
- Dev-only API route exports state to settings.json for commit

## Media
- Per-video intensity slider under each thumbnail
- "Grid on trigger" always on (hidden), "Random" button removed
- Animation size auto-fits viewport
- Delete = permanent removal
