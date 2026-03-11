# Åre Circles - Project Context

## What This Is
Interactive generative circles visual for Åre Business Forum, projected via mirrored projectors. Circles animate with noise/wave patterns, generative music reactivity, and media morphing (halftone effect). Deployed on Vercel.

## Tech Stack
- **Next.js 16** (App Router, TypeScript)
- **Canvas 2D** for rendering (no WebGL)
- **Web Audio API** for generative music engine (4 instruments, FM synthesis, reverb, delay)
- **simplex-noise** for organic noise patterns
- **Tailwind CSS** for settings panel UI

## Architecture

### Modes
- **LIVE** (default): Clean canvas, no UI. Keys 1/2/3 switch between 3 live presets. H opens setup.
- **SETUP**: Right panel = preset editor (select 1/2/3 at top). Left panel = music settings. 9 built-in presets available as templates.

### Engine (`src/engine/`)
- **`renderer.ts`** - Main render loop. Viewport-relative sizing (`viewScale = min(w,h) / 1080`). Square particle space. Edge vignette via size reduction (not opacity). Smooth preset transitions (smoothstep). Cursor + music swirl impulses. Ghost particles for media grid.
- **`audio.ts`** - Web Audio API mic input. FFT analysis for sound reactivity.
- **`media.ts`** - Video brightness sampling at 15fps into 64x64 grid. Per-video intensity support. Fade state machine. Pingpong mode with native reverse playbackRate + fallback.
- **`music.ts`** - Generative music engine. 4 instruments: Pling (triangle + LFO), Mid 1 & 2 (FM synthesis, 6 sound presets: xylophone/rhodes/breathy/bell/kalimba/glass), Pad (sustained drone chords). ConvolverNode reverb, tempo-synced delay. Pentatonic major/minor scales, 40-80 BPM. Visual reactions: swirl impulses + size pulse.

### Components (`src/components/`)
- **`CirclesCanvas.tsx`** - Main component. Manages renderer + music engine lifecycle, keyboard shortcuts (1-3 presets, H/F/Space/M), AppState, LIVE/SETUP modes. Music starts on first user interaction (AudioContext gesture).
- **`SetupPanel.tsx`** - Right panel (420px). LIVE/SETUP toggle. Preset editor with template loading. Sections: Pattern (Noise+Wave), Circles+Depth, Drift+Layout, Focus Area, Media (per-video intensity sliders), Audio, Colors (global).
- **`MusicPanel.tsx`** - Left panel (300px). Global music settings (scale, tempo, master volume). Per-instrument: enable toggle, volume, speed subdivision, trigger %, delay/reverb sends. Visual reaction sliders.
- **`DirectionPicker.tsx`** - Circular SVG drag picker for wave direction.

### Data Model (`src/types/index.ts`)
- **`AppState`** - Top-level: version, activePreset, 3 LivePresets, globalColors, mediaOverrides (per-video intensity/invert/loop), mediaGridColumns, transitionSpeed, MusicConfig.
- **`LivePreset`** - name, `Partial<Settings>`, mediaEnabled, musicInstruments (pling/mid1/mid2/pad booleans).
- **`MusicConfig`** - scale, tempo, masterVolume, pling/mid1/mid2/pad configs, visualReactions.
- **Per-preset**: visual settings, media on/off, which instruments enabled.
- **Global**: colors, media overrides, grid columns, transition speed, all music config.

### Settings & Persistence (`src/lib/`)
- **`settings.ts`** - AppState load/save to localStorage. Version-tracked sync with `public/settings.json`. Auto-migration from old format. `buildRendererSettings()` merges preset + globals into renderer Settings.
- **`presets.ts`** - 9 template presets for "Load from template" feature. Not live presets.
- **`public/settings.json`** - Canonical settings committed to repo. Content-hash version. On page load, if server version > localStorage version, overwrites localStorage.
- **`/api/settings`** - Dev-only POST route to export current state to settings.json.

### Key Rendering Patterns
- **Edge vignette = size reduction**: Particles near edges shrink (quadratic falloff, 10% margin). No opacity fade.
- **All particles travel to grid during media**: No orphan particles floating away. Extras spawn at grid positions, shrink to 0 when unneeded.
- **Uniform grid sizing**: During media animation, all particles use consistent cell-based sizes scaled by video brightness.
- **Music swirl impulses**: Notes trigger phantom cursor presses at random positions. Aged once per frame, applied per particle.
- **Music size pulse**: Note triggers inflate particle sizes, lower pitch = bigger boost.
- **Smooth preset transitions**: Bounded linear progress + smoothstep. Direct start→target interpolation with definite endpoint.

## Keyboard Shortcuts
- `H` - toggle settings panel
- `F` - toggle fullscreen
- `ESC` - exit fullscreen
- `Space` - fade to/from black
- `M` - trigger random media
- `1-3` - switch live presets

## Deployment
- GitHub: `danhstorm/are-circles`
- Vercel: `are-circles.vercel.app`
- Push to `main` triggers auto-deploy

## Performance Notes
- DPR capped at 1.5 on mobile, 2 on desktop
- Particle sort order cached
- Media brightness sampling throttled to 15fps
- Music scheduler uses Web Audio lookahead pattern (25ms interval, 100ms lookahead)
- Noise buffer cached for breathy instrument
- Canvas uses `{ alpha: false }` for faster compositing
