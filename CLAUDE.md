# Are Circles - Project Context

## Critical Rules

- **Complete every requested task.** When the user gives a list of changes, track each one (use a todo list), implement each one, and check them off. Do not leave tasks undone. Before finishing, review the original request and confirm every point has been addressed.
- **Do not skip verification.** Always run typecheck/build before declaring work complete.
- **Always commit and push after every completed change.** Include `public/settings.json` in every commit. Do not wait to be asked.

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
- `mediaOverrides: Record<string, MediaOverride>` -- per-video intensity/contrast/invert/playMode
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
- `tempo: number` (40-80 BPM, default 54)
- `masterVolume: number`
- `pling: PlingConfig` (volumeMin/Max, speed, triggerProbability, delay, reverb, LFO speed/depth, octave range, filter/Q, decay, + 6 automation ranges: autoFilter, autoDecay, autoLfoSpeed, autoLfoDepth, autoTrigger, autoSpeed)
- `mid1, mid2: MidConfig` (volumeMin/Max, sound preset, speed, trigger %, octave range, filter, decay, FM amount, detune, delay, reverb)
- `pad: PadConfig` (volume, chord interval, reverb, filterCutoff, detune, octaveLow/High)
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

**Media animation transition flow:**
- **Transition IN**: When media triggers, original particles save their current position (`preMediaX/Y`). Each original is assigned to a grid cell with brightness-aware priority (bright/active areas preferred). Originals then smoothly travel from their current floating position toward their assigned grid cell at individual random speeds. Extra particles needed to fill the grid are spawned at their grid positions with size 0 and grow in gradually. The animation (video) starts playing immediately; dots arrive while it is already running. No particles fly in from off-screen or snap positions.
- **During animation**: Particles sit at grid cells, sized by video brightness. Normal drift is frozen for originals.
- **Transition OUT**: Extra particles shrink to 0 and are removed once fully shrunk. Original particles smoothly travel back to their saved pre-media home positions (`preMediaX/Y`) at individual speeds. Once back, normal drift resumes from those positions. The current preset continues as before.
- **Staggering**: Per-particle `mediaDelay` controls timing. Bright-area particles move first on entry; dark-area particles leave first on exit. `mediaSpeed` adds per-particle speed variation.
- `baseParticleCount` tracks original count to restore after animation.
- Scenes never switch automatically. Presets (templates) within a scene cycle on the configured interval.

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
1. **Pling**: Triangle oscillator + LFO on filter cutoff. Range C4-C7 (configurable). Short pluck envelope. 30% swirl strength. Fully automated: filter, decay, LFO speed/depth, trigger % all ping-pong independently.
2. **Mid 1 ("Plong")**: FM synthesis with 3 detuned carriers, decaying mod index, output lowpass filter. 6 sound presets:
   - xylophone (bright, percussive), rhodes (warm, sustained), breathy (noise layer, slow attack),
   - bell (metallic, long decay), kalimba (clean, short), glass (soft, airy)
   - Range C3-C5. Full swirl strength. Triggers 1-3 random dot growth pulses per note.
3. **Mid 2 ("Bong")**: Same as Mid 1, independent sound selection. Range C2-C4. Allows layering two different FM sounds.
4. **Pad**: 3 detuned sine oscillators per chord note (configurable detune). Lowpass filtered (configurable cutoff). Sustained drone with 3s crossfade. Configurable octave range.

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

**Brightness sampling:** Renders video frame to 64x64 OffscreenCanvas at 15fps, extracts luminance per pixel. `getBrightness(nx, ny)` applies contrast/levels (black point cutoff) then returns `adjusted_luminance * fadeProgress * perVideoIntensity`. Per-video contrast stored in `contrastMap`.

**Fade state machine:** idle → (timer) → in → hold → out → idle. Configurable interval/fade/hold durations.

**Pingpong playback:** First pass forward (native). On `ended`: set `playbackRate = -1` for native reverse. Fallback: manual `currentTime` seeking if browser doesn't support negative playbackRate.

**Per-video intensity + contrast:** `intensityMap` and `contrastMap` (both `Map<string, number>`) set from AppState.mediaOverrides. Intensity multiplied into brightness output. Contrast applied as black point cutoff before intensity.

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
  - **Media**: Enable toggle, interval range, fade, grid columns, video thumbnails with per-video "Int" (intensity) + "Lvl" (contrast/levels) sliders, loop/pingpong/invert controls, delete with confirm. Thumbnails preview intensity+contrast via CSS filter.
  - **Audio** (collapsible): Mic enable, gain, sensitivity, smoothing, burst decay
  - **Colors** (collapsible, global): BG color, 5 palette swatches, hue variation

#### MusicPanel (`MusicPanel.tsx`)
- Retro synth aesthetic: color-coded modules with LED enable dots, monospace fonts, compact 280px, `.synth-slider` CSS
- **Global**: Scale toggle (MAJ/MIN), tempo (40-80), master volume
- **Pling** (teal): Enable, volume range, speed buttons, octave range, filter Q, delay, reverb. Auto sub-section: auto speed, filter/decay/LFO speed/LFO depth/trigger range sliders (when min===max = fixed value)
- **Plong** (amber, = mid1): Enable, sound buttons (6), volume range, speed, trigger %, octave range, filter, decay, FM, detune, delay, reverb
- **Bong** (pink, = mid2): Same as Plong
- **Pad** (green): Enable, volume, bars, octave range, filter, detune, reverb
- **Reactions** (purple): Swirl, radius, pulse, bass

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
- **Smooth media transitions**: Original particles travel from their floating positions to assigned grid cells at individual random speeds. No position snapping, no flying from off-screen. Extras spawn at grid cells with size 0 and grow in. On exit, extras shrink away and originals travel back to their saved pre-media positions at individual speeds.
- **Brightness-aware grid assignment**: Original particles are preferentially assigned to bright (active) grid cells so they visually converge on the visible parts of the animation.
- **Uniform grid sizing**: During media, all particles use consistent cell-based sizes scaled by video brightness. No depth variation in grid mode.
- **Particles appear/disappear by shrinking**: Never pop in/out or teleport. Size transitions have different grow/shrink rates (extras grow slowly).
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

Push to `main` triggers Vercel auto-deploy.

**CRITICAL: Always include `public/settings.json` in every commit and push.** This file is auto-updated by the dev server whenever settings change. It is the canonical source of truth for deployed clients. If it is not committed, Vercel will serve stale settings.

```bash
# Every commit MUST include settings.json:
git add public/settings.json   # Always add this
git add -A                     # Or add everything
git commit -m "..."
git push
```

## Recent Bug Fixes (for context)

- **No audio on load**: AudioContext requires user gesture. Fixed by deferring `music.start()` to first pointerdown/keydown event. Always creates AudioContext regardless of which instruments are enabled.
- **Stale localStorage missing musicInstruments**: Shallow spread overwrote livePresets. Fixed with deep-merge that preserves defaults for missing nested fields.
- **Swirl impulses aging too fast**: `imp.age += dt` was inside the particle loop (aged N times per frame). Moved to separate loop before particles.
- **Preset transition jitter**: Exponential decay lerp never reaches target. Replaced with bounded linear progress + smoothstep.
- **Particles snapping/flying during media transitions**: All particles were being snapped to grid positions instantly and sizes zeroed, causing jarring visual jumps. Fixed: originals now save their pre-media position and smoothly travel to brightness-prioritized grid cells at individual speeds. Extras grow from zero at their grid positions. On exit, originals travel back to saved positions at different speeds.
- **Pingpong stuck at end**: Native `playbackRate = -1` doesn't work in all browsers. Added manual seeking fallback.
