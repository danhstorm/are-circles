# Are Circles - Project Context

## What This Is

Interactive generative art installation for Are Business Forum. Projected via mirrored projectors in a physical venue. Circles animate with noise/wave patterns, respond to generative music with swirl impulses and size pulses, and morph into halftone-style video grids on timed triggers. Deployed on Vercel, controlled live via keyboard shortcuts.

**GitHub:** `danhstorm/are-circles` | **Live:** `are-circles.vercel.app` | **Branch:** `main` (auto-deploys to Vercel on push)

## Tech Stack

- **Next.js 16** (App Router, TypeScript, Turbopack)
- **Canvas 2D** for all rendering (no WebGL)
- **Web Audio API** for generative music engine (FM synthesis, ConvolverNode reverb, tempo-synced delay)
- **simplex-noise** for organic noise patterns
- **Tailwind CSS v4** for settings panel UI
- No other runtime dependencies

## Architecture Overview

### Two Modes

- **LIVE** (default): Completely clean canvas. No UI visible. Keys 1/2/3 switch between 3 live presets with smooth transitions. H key opens setup panels.
- **SETUP**: Opens two side panels. Right panel (420px) = preset editor with visual/media settings. Left panel (300px) = music engine controls. All changes auto-save immediately.

### File Structure

```
src/
  app/
    page.tsx              # Single page, renders CirclesCanvas
    layout.tsx            # Root layout with metadata
    api/
      media/route.ts      # GET: list videos in public/media/, DELETE: remove video+thumb
      settings/route.ts   # POST: dev-only, writes AppState to public/settings.json
  components/
    CirclesCanvas.tsx     # Main component: renderer + music lifecycle, keyboard handlers, AppState management
    SetupPanel.tsx        # Right panel: LIVE/SETUP toggle, preset editor (1/2/3), template loading, all visual settings
    MusicPanel.tsx        # Left panel: global music settings, per-instrument controls, visual reaction sliders
    DirectionPicker.tsx   # Circular SVG drag picker for wave direction angle
  engine/
    renderer.ts           # Main render loop: particles, noise/wave patterns, cursor interaction, swirl impulses, media grid blending, preset transitions
    music.ts              # Generative music: 4 instruments, Web Audio scheduler, ConvolverNode reverb, visual reactions output
    audio.ts              # Mic input: FFT analysis for sound reactivity (bass/mid/high)
    media.ts              # Video engine: brightness sampling at 15fps, fade state machine, pingpong playback, per-video intensity
  lib/
    settings.ts           # AppState load/save, localStorage persistence, server sync, migration from old format, buildRendererSettings()
    presets.ts            # 9 template presets for "Load from template" feature (not live presets)
  types/
    index.ts              # All TypeScript interfaces: Particle, Settings, AppState, LivePreset, MusicConfig, SwirlImpulse, etc.
public/
  settings.json           # Canonical settings committed to repo. Version-tracked. Overwrites localStorage if server version is higher.
  media/                  # Video files (.mp4/.webm/.mov) for halftone animations
    thumbs/               # Auto-generated JPEG thumbnails for UI
docs/
  plans/                  # Design documents
```

### Data Model (`src/types/index.ts`)

**AppState** (top-level, stored in localStorage + settings.json):
- `version: string` -- content-hash for sync
- `activePreset: number` (0-2)
- `livePresets: [LivePreset, LivePreset, LivePreset]`
- `globalColors: { backgroundColor, paletteColors, hueVariation }`
- `mediaOverrides: Record<string, MediaOverride>` -- per-video intensity/invert/playMode
- `mediaGridColumns: number`
- `transitionSpeed: number`
- `music: MusicConfig`

**LivePreset** (per-preset):
- `name: string`
- `settings: Partial<Settings>` -- visual params (noise, wave, circles, drift, blur, grid, gravity, media timing, audio sensitivity)
- `mediaEnabled: boolean`
- `musicInstruments: { pling, mid1, mid2, pad }` -- booleans

**MusicConfig** (global):
- `scale: 'pentatonic-major' | 'pentatonic-minor'`
- `tempo: number` (40-80 BPM)
- `masterVolume: number`
- `pling: PlingConfig` (volume, speed subdivision, trigger %, delay, reverb, LFO speed, LFO depth)
- `mid1, mid2: MidConfig` (volume, sound preset, speed, trigger %, delay, reverb)
- `pad: PadConfig` (volume, chord interval, reverb)
- `visualReactions: VisualReactionConfig` (swirl strength, swirl radius, size pulse, bass boost)

**Settings** (renderer input, built from LivePreset + globals):
- ~40 numeric parameters controlling every visual aspect
- Built by `buildRendererSettings(preset, appState)` in settings.ts

### Persistence Flow

1. On page load: `loadAppState()` reads localStorage, deep-merges with defaults (preserving musicInstruments)
2. `syncWithServer()` fetches `/settings.json`, compares version numbers, overwrites localStorage if server is newer
3. All UI changes call `autoSave()` which debounces (200ms) writes to localStorage
4. Dev-only: POST to `/api/settings` writes current AppState to `public/settings.json` for committing
5. Bump `version` in settings.json before deploying to force all clients to pick up new defaults

### Engine Details

#### Renderer (`renderer.ts`, ~850 lines)

**Viewport scaling:** `viewScale = min(w,h) / 1080`. All sizes multiplied by this.

**Particle space:** Square (max(w,h) x max(w,h)) with padding, so particles exist beyond viewport edges for seamless wrapping.

**Update loop (per frame):**
1. Lerp preset transitions (smoothstep easing, bounded linear progress)
2. Read audio FFT data, compute burst detection + speed boost
3. Update media engine, manage grid blend (0 = scattered, 1 = grid formation)
4. Age swirl impulses once per frame (not per particle!)
5. Per particle:
   - Position: drift via noise, or grid snap, or media grid lerp (staggered blend)
   - Cursor interaction: repel + drag (disabled during media grid)
   - Music swirl impulses: radial force from random positions
   - Size: noise pattern + wave pattern, blended with media brightness during animation
   - Edge vignette via size reduction (quadratic falloff, 10% margin) -- NOT opacity
   - Music size pulse + audio burst multiplier
   - Smooth size transition (grow rate differs from shrink rate; extras grow slower)
   - Hue drift via noise
   - Blur: only `blurPercent` fraction of particles get bokeh gradient

**Media grid flow:**
- When media triggers: spawn extra particles at grid positions (size 0, grow in)
- All particles assigned to nearest grid cell (greedy nearest-first)
- Staggered blend: each particle has random delay before snapping to grid
- When media fades out: extras shrink to 0, then removed
- `baseParticleCount` tracks original count to restore after

**Preset transitions:**
- `transitionToSettings()` stores start + target, resets progress to 0
- Each frame: `progress += speed * 2 * dt`, clamped to [0,1]
- Smoothstep: `t * t * (3 - 2t)` for natural acceleration/deceleration
- Numeric keys interpolated, booleans snapped immediately

#### Music Engine (`music.ts`, ~550 lines)

**Architecture:** Web Audio API with lookahead scheduler pattern.
- Scheduler runs every 25ms, schedules notes up to 100ms ahead
- All oscillators/gains created per-note, auto-cleaned by `stop(time)`

**Audio graph:**
```
[Per-note oscillators] → [envelope gain] → [dry gain] → [masterGain] → [destination]
                                          → [delay send] → [delayNode] → [filter] → [feedback] → [delayNode]
                                                                                                → [delayGain] → [masterGain]
                                          → [reverb send] → [convolverNode] → [reverbGain] → [masterGain]
```

**4 Instruments:**
1. **Pling**: Triangle oscillator + LFO on filter cutoff. Range C4-C6. Short pluck envelope. 30% swirl strength.
2. **Mid 1**: FM synthesis (carrier + modulator). 6 sound presets with different modRatio/modIndex/ADSR:
   - xylophone (bright, percussive), rhodes (warm, sustained), breathy (noise layer, slow attack),
   - bell (metallic, long decay), kalimba (clean, short), glass (soft, airy)
   - Range C3-C5. Full swirl strength (primary visual reactor).
3. **Mid 2**: Same as Mid 1, independent sound selection. Allows layering two different FM sounds.
4. **Pad**: 3 detuned sine oscillators per chord note (+-5 cents). Lowpass filtered at 800Hz. Sustained drone with 3s crossfade between chords. Range C2-C4.

**Shared FX:**
- ConvolverNode reverb with generated impulse response (2.5s, decay 2.5)
- Tempo-synced delay with lowpass feedback filter (2000Hz), 30% feedback

**Visual reactions (pumped to renderer at 60fps):**
- `getSwirlImpulses()`: Returns pending swirl positions, drained on read. Created on note trigger at random x/y with force direction.
- `getSizePulse()`: Returns decaying pulse value (0.92 per frame decay). Lower pitch = bigger boost via bassSizeBoost config.

**AudioContext lifecycle:**
- Created on first user interaction (pointerdown/keydown) to comply with browser autoplay policy
- `start()` is async, awaits `ctx.resume()` if suspended
- `applyPreset()` awaits `start()` before setting instrument enables
- Master gain fades from 0 on start, ramps to `masterVolume` over 2s

#### Media Engine (`media.ts`, ~260 lines)

**Brightness sampling:** Renders video frame to 64x64 OffscreenCanvas at 15fps, extracts luminance per pixel. `getBrightness(nx, ny)` returns `luminance * fadeProgress * perVideoIntensity`.

**Fade state machine:** idle → (timer) → in → hold → out → idle. Configurable interval/fade/hold durations.

**Pingpong playback:** First pass forward (native). On `ended`: set `playbackRate = -1` for native reverse. Fallback: manual `currentTime` seeking if browser doesn't support negative playbackRate.

**Per-video intensity:** `intensityMap: Map<string, number>` set from AppState.mediaOverrides. Multiplied into brightness output.

#### Audio Engine (`audio.ts`, ~80 lines)

Mic input via `getUserMedia`. FFT analysis split into bass/mid/high bands. Smoothed output. Used for sound-reactive size bursts and pattern speed boost. Independent from music engine.

### UI Components

#### SetupPanel (`SetupPanel.tsx`)
- Mode toggle (LIVE/SETUP) at top
- LIVE mode: 3 preset buttons + transition speed slider
- SETUP mode sections:
  - **Editing Preset**: 3 buttons, name input, "Load from template" (9 templates)
  - **Pattern**: Noise (strength/size/speed) + Wave (strength/size/speed/direction)
  - **Circles & Depth**: Count, speed, size range, opacity range, depth of field, blur %, blur range
  - **Drift & Layout**: Drift strength/speed, Grid mode toggle + blend/columns
  - **Focus Area**: Shape (none/circle/oval/drop) + strength
  - **Media**: Enable toggle, interval range, fade, grid columns, video thumbnails with per-video intensity sliders, loop/pingpong/invert controls, delete with confirm
  - **Audio** (collapsible): Mic enable, gain, sensitivity, smoothing, burst decay
  - **Colors** (collapsible, global): BG color, 5 palette swatches, hue variation

#### MusicPanel (`MusicPanel.tsx`)
- Header: "Music"
- **Global**: Scale toggle (pentatonic major/minor), tempo (40-80), master volume
- **Pling**: Enable (per-preset), volume, speed subdivision buttons, trigger %, LFO speed/depth, delay, reverb
- **Mid 1**: Enable (per-preset), sound preset buttons (6 options), volume, speed, trigger %, delay, reverb
- **Mid 2**: Same as Mid 1
- **Pad**: Enable (per-preset), volume, chord interval (bars), reverb
- **Visual Reactions**: Swirl strength, swirl radius, size pulse, bass boost

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `H` | Toggle settings panels |
| `F` | Toggle fullscreen |
| `Escape` | Exit fullscreen |
| `Space` | Fade to/from black |
| `M` | Trigger random media |
| `1` | Switch to preset 1 |
| `2` | Switch to preset 2 |
| `3` | Switch to preset 3 |

### Default Presets

1. **Calm** (preset 1): 80 circles, large, slow drift, no noise/wave, no media. Music: pling + pad.
2. **Breathing** (preset 2): 150 circles, medium, noise + gentle wave, media enabled. Music: pling + mid1 + pad.
3. **Active** (preset 3): 250 circles, small, fast, strong noise + wave, media enabled. Music: all 4 instruments.

## Rendering Patterns & Constraints

- **Edge vignette = size reduction**: Particles near edges shrink with quadratic falloff (10% margin). Never use opacity for edge fade.
- **All particles travel to grid**: During media animations, every particle moves to a grid cell. No orphans floating outside. Extras spawn at grid positions with size 0 and grow in.
- **Uniform grid sizing**: During media, all particles use consistent cell-based sizes scaled by video brightness. No depth variation in grid mode.
- **Particles appear/disappear by shrinking**: Never pop in/out or float in from off-screen. Size transitions have different grow/shrink rates (extras grow slowly at dt*0.4).
- **Music swirl impulses aged once per frame**: The aging loop runs before the particle loop, not inside it. This prevents impulses from decaying N times faster where N = particle count.
- **Smooth preset transitions**: Bounded linear progress + smoothstep easing. Not exponential decay (which never truly reaches target). Direct start-to-target interpolation.
- **Canvas alpha: false**: `getContext('2d', { alpha: false })` for faster compositing.
- **DPR capped**: 1.5 on mobile, 2 on desktop.

## Known Decisions & Constraints

- Music instrument enable/disable is **per-preset**. Music config (sounds, volumes, FX) is **global**.
- Colors (background, palette, hue variation) are **global**, not per-preset.
- Media overrides (intensity, invert, play mode) are **global**, not per-preset.
- Media grid is always auto-triggered (no manual "grid on trigger" toggle). Always random selection.
- Grid mode (useGrid) is saved **per-preset**.
- Animation size range (minSize/maxSize) is **per-preset**.
- `viewScale = min(w,h) / 1080` -- all sizes are viewport-relative to this reference dimension.
- Particle home positions use a square space (max dimension) with padding to avoid edge clustering.
- Focus area gravity disabled during media grid blend (would fight grid positioning).
- Cursor interaction disabled during media grid blend.

## Performance Notes

- Particle sort order cached (rebuilt only on count change)
- Media brightness sampling throttled to 15fps via accumulator
- Music scheduler uses Web Audio lookahead (25ms interval, 100ms ahead) -- no setTimeout for note timing
- Noise buffer for breathy instrument cached (one allocation, reused)
- Swirl impulses spliced from array when expired (not filtered/recreated)
- No React re-renders during animation (renderer runs in requestAnimationFrame, not React state)

## Development

```bash
npm run dev          # Start dev server (default port 3000)
npm run build        # Production build
npx tsc --noEmit     # Type check
```

No test suite currently. Verify visually + build clean.

## Deployment

Push to `main` triggers Vercel auto-deploy. To update default settings for all users:
1. Adjust settings in SETUP mode
2. POST current state to `/api/settings` (dev only) or manually edit `public/settings.json`
3. Bump `version` field in settings.json
4. Commit and push

## Recent Bug Fixes (for context)

- **No audio on load**: AudioContext requires user gesture. Fixed by deferring `music.start()` to first pointerdown/keydown event. Always creates AudioContext regardless of which instruments are enabled.
- **Stale localStorage missing musicInstruments**: Shallow spread overwrote livePresets. Fixed with deep-merge that preserves defaults for missing nested fields.
- **Swirl impulses aging too fast**: `imp.age += dt` was inside the particle loop (aged N times per frame). Moved to separate loop before particles.
- **Preset transition jitter**: Exponential decay lerp never reaches target. Replaced with bounded linear progress + smoothstep.
- **Particles floating away during media**: Not all particles were assigned grid cells. Fixed: all particles now travel to nearest available cell.
- **Ghost particles appearing too abruptly**: Reduced grow rate for extra particles from dt*0.8 to dt*0.4.
- **Pingpong stuck at end**: Native `playbackRate = -1` doesn't work in all browsers. Added manual seeking fallback.
