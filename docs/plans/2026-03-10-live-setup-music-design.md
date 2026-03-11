# Live/Setup Restructure + Generative Music Engine

## Status: Implemented (2026-03-11)

All features below are implemented, deployed, and running. This doc serves as the canonical design reference.

---

## System Overview

Interactive generative art installation for Are Business Forum. Projected via mirrored projectors. Circles animate with noise/wave patterns, respond to a built-in generative music engine, and morph into halftone-style video grids on timed triggers.

**Stack:** Next.js 16, Canvas 2D, Web Audio API, simplex-noise, Tailwind CSS v4.
**Repo:** `danhstorm/are-circles` on GitHub. Auto-deploys to Vercel on push to `main`.

---

## Modes

### LIVE (default)
- Completely clean canvas. Zero UI elements visible.
- Keys **1/2/3** switch between 3 live presets with smooth transitions (smoothstep easing).
- **H** opens settings panels for adjustment.
- Music engine plays automatically based on which instruments are enabled in the active preset.

### SETUP (press H)
- **Right panel (420px):** Preset editor. Select which preset (1/2/3) to edit. Load from 9 built-in templates. Adjust all visual parameters: noise, wave, circles, depth/blur, drift, layout/grid, focus area, media, audio reactivity, colors.
- **Left panel (300px):** Music engine controls. Global settings (scale, tempo, master volume). Per-instrument controls. Visual reaction tuning.

---

## Data Model

### AppState (top-level, persisted)
```
version: string                    -- content-hash for server sync
activePreset: number               -- 0, 1, or 2
livePresets: [LP, LP, LP]          -- 3 live presets
globalColors: { bg, palette[5], hueVariation }
mediaOverrides: Record<src, { playMode, invert, intensity }>
mediaGridColumns: number
transitionSpeed: number
music: MusicConfig
```

### LivePreset
```
name: string
settings: Partial<Settings>        -- ~40 visual parameters
mediaEnabled: boolean
musicInstruments: {                -- per-preset toggles
  pling: boolean
  mid1: boolean
  mid2: boolean
  pad: boolean
}
```

### MusicConfig (global)
```
scale: 'pentatonic-major' | 'pentatonic-minor'
tempo: 40-80 BPM
masterVolume: 0-1
pling: PlingConfig
mid1: MidConfig
mid2: MidConfig
pad: PadConfig
visualReactions: { swirlStrength, swirlRadius, sizePulseStrength, bassSizeBoost }
```

### What's Per-Preset vs Global

| Setting | Scope |
|---------|-------|
| Visual params (noise, wave, circles, drift, grid, blur, gravity, media timing, audio sensitivity) | Per-preset |
| Which music instruments are enabled | Per-preset |
| Media on/off | Per-preset |
| Grid mode (useGrid) | Per-preset |
| Colors (BG, palette, hue variation) | Global |
| Media overrides (intensity, invert, play mode per video) | Global |
| Music config (sounds, volumes, FX, scale, tempo) | Global |
| Media grid columns | Global |
| Transition speed | Global |

---

## Music Engine

### Architecture
Web Audio API with lookahead scheduler pattern. Scheduler runs every 25ms, schedules notes up to 100ms ahead. All oscillators/gains created per-note, auto-cleaned by `stop(time)`. Config changes reset scheduler times immediately (no waiting for current interval to elapse).

### Audio Graph
```
[Per-note oscillators] --> [envelope] --> [dry gain] -----------> [masterGain] --> [destination]
                                      --> [delay send] --> [delay+filter+feedback] --> [masterGain]
                                      --> [reverb send] --> [ConvolverNode IR] ------> [masterGain]
```

### 4 Instruments

**Pling** (high register, percussive sparkle)
- Triangle oscillator + lowpass filter + LFO on cutoff
- Configurable: volume, speed (1/1 through 1/16 + triplets 1/3, 1/6), trigger %, LFO speed/depth, octave range (2-7), filter cutoff (200-8000Hz), filter Q (0.5-15), decay (0.02-1s), delay send, reverb send
- Default range: C4-C6. Short pluck envelope.
- Visual reaction: 30% swirl strength

**Mid 1 & Mid 2** (mid register, melodic body)
- FM synthesis: carrier + modulator with configurable ratio/index
- 6 sound presets:
  - **Xylophone**: bright, percussive (modRatio 3.0, modIndex 8)
  - **Rhodes**: warm, sustained (modRatio 1.0, modIndex 2.5)
  - **Breathy**: noise layer, slow attack (modRatio 0.5, modIndex 0.8, +bandpass noise)
  - **Bell**: metallic, long decay (modRatio 3.5, modIndex 10)
  - **Kalimba**: clean, short (modRatio 2.0, modIndex 4)
  - **Glass**: soft, airy (modRatio 1.5, modIndex 1.0)
- Configurable: volume, sound preset, speed, trigger %, delay, reverb
- Range: C3-C5. Primary visual reactor (100% swirl strength).
- Two independent instances allow layering different FM sounds.

**Pad** (low register, sustained atmosphere)
- 3 detuned sine oscillators per chord note (+-5 cents), lowpass filtered at 800Hz
- Pentatonic chord selection from scale. 3s crossfade between chords.
- Configurable: volume, chord interval (bars), reverb
- Range: C2-C4
- Volume uses exponential curve and normalizes by oscillator count (chord notes * 3 detuned) to prevent stacking blowout

### Speed Subdivisions
Available for pling, mid1, mid2: `1/1, 1/2, 1/3, 1/4, 1/6, 1/8, 1/16`
- 1/3 and 1/6 create triplet-feel rhythms that sit outside the regular grid for polyrhythmic/asyncopic textures

### Volume Scaling
All instruments use exponential volume curves (`volume * volume`) so the slider feels perceptually linear. The pad additionally divides by oscillator count to prevent amplitude stacking from multiple detuned oscillators.

### Shared FX
- **Reverb:** ConvolverNode with generated impulse response (2.5s duration, 2.5 decay). Per-instrument send amount.
- **Delay:** Tempo-synced delay time (60/BPM seconds). Lowpass feedback filter at 2000Hz, 30% feedback. Per-instrument send amount.

### Visual Reactions
- **Swirl impulses:** On note trigger, creates a force point at random x/y with radial push + directional drift. Aged once per frame (NOT per particle). Pling = 30% strength, Mids = 100% strength.
- **Size pulse:** Note triggers inflate all particle sizes temporarily. Lower pitch = bigger boost via bassSizeBoost. Decays at 0.92 per frame.
- Configurable: swirl strength, swirl radius, size pulse strength, bass size boost.

### AudioContext Lifecycle
- Created on first user interaction (pointerdown/keydown) to comply with browser autoplay policy.
- `start()` is async, awaits `ctx.resume()`.
- `applyPreset()` awaits `start()` before setting instrument enables.
- Master gain fades from 0 to masterVolume over 2s on start.
- On preset switch: if new preset has instruments, fadeIn(2s). If no instruments, fadeOut(2s).

---

## Renderer

### Viewport & Sizing
- `viewScale = min(w,h) / 1080` -- all sizes viewport-relative
- Particle space: square (max(w,h) x max(w,h)) with padding beyond viewport
- DPR capped: 1.5 mobile, 2 desktop
- Canvas: `{ alpha: false }` for faster compositing

### Particle Behavior
- **Edge vignette = size reduction** (quadratic falloff, 10% margin). Never opacity.
- **Appear/disappear by shrinking.** Never pop in or float from off-screen. Extras grow at dt*0.4 (slow).
- **All particles travel to grid during media.** No orphans. Extras spawn at grid positions with size 0.
- **Uniform grid sizing during media.** Cell-based sizes * video brightness. No depth variation in grid.

### Preset Transitions
- Bounded linear progress + smoothstep easing: `t*t*(3-2t)`
- Numeric params interpolated, booleans snapped immediately
- Direct start-to-target interpolation (not exponential decay which never reaches target)

### Media Grid
- Video brightness sampled at 15fps into 64x64 grid
- Per-video intensity multiplier (0-1.5 range)
- Particles assigned to nearest available cell (greedy nearest-first)
- Staggered blend: each particle has random delay before snapping
- Extras shrink to 0 then removed when media fades out

---

## Media Engine

- **State machine:** idle -> in -> hold -> out -> idle
- **Pingpong:** Native `playbackRate = -1` with manual seeking fallback
- **Per-video:** intensity, invert, loop/pingpong stored in mediaOverrides

---

## Persistence

1. `loadAppState()`: Read localStorage, deep-merge with defaults (preserving musicInstruments and nested music config)
2. `syncWithServer()`: Fetch `/settings.json`, compare versions, overwrite localStorage if server is newer
3. Auto-save: All UI changes debounced (200ms) to localStorage
4. Dev export: POST to `/api/settings` writes to `public/settings.json`
5. Bump `version` in settings.json before deploying to force client refresh

### Migration
Old format (single settings object, 9 presets array, media overrides) automatically migrated on first load. Old localStorage keys cleaned up after migration.

---

## Default Presets

| Preset | Circles | Character | Media | Music |
|--------|---------|-----------|-------|-------|
| 1: Calm | 80, large | Slow drift, no noise/wave | Off | Pling + Pad |
| 2: Breathing | 150, medium | Noise + gentle wave | On | Pling + Mid1 + Pad |
| 3: Active | 250, small | Fast, strong noise + wave | On | All 4 instruments |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| H | Toggle settings panels |
| F | Toggle fullscreen |
| Escape | Exit fullscreen |
| Space | Fade to/from black |
| M | Trigger random media |
| 1-3 | Switch live preset |

---

## Known Bug Fixes & Lessons

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| No audio on load | AudioContext requires user gesture | Defer `music.start()` to first pointerdown/keydown |
| Stale localStorage missing musicInstruments | Shallow spread overwrote livePresets | Deep-merge preserving nested defaults |
| Swirl impulses decay too fast | `age += dt` inside particle loop (aged N times/frame) | Move aging to separate loop before particles |
| Preset transition jitter | Exponential decay never reaches target | Bounded linear + smoothstep |
| Particles floating away during media | Not all particles assigned grid cells | Greedy nearest-cell assignment for all particles |
| Ghost particles appear too abruptly | Grow rate too fast | Reduced to dt*0.4 for extras |
| Pingpong stuck at end | Native negative playbackRate unsupported in some browsers | Manual seeking fallback |
| Slow config reaction | Scheduler only reads config at next scheduled time | Reset nextTime values to "now" on config change |
| Pad too loud at low volume | Linear gain + 9 stacked oscillators | Exponential curve + divide by osc count |
