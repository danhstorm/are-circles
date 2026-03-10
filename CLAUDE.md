# Åre Circles - Project Context

## What This Is
Interactive generative circles visual for Åre Business Forum, projected via mirrored projectors. Circles animate with noise/wave patterns, sound reactivity, and media morphing (halftone effect). Deployed on Vercel.

## Tech Stack
- **Next.js 15** (App Router, TypeScript)
- **Canvas 2D** for rendering (no WebGL)
- **Web Audio API** for mic input / sound reactivity
- **simplex-noise** for organic noise patterns
- **Tailwind CSS** for settings panel UI

## Architecture

### Engine (`src/engine/`)
- **`renderer.ts`** - Main render loop. Manages particles, applies noise/wave/drift size modulation, sound bursts, media crossfade. Canvas 2D with radial gradients for bokeh effect. Depth-sorted draw order (cached). Viewport-relative sizing via `viewScale = min(w,h) / 1080`. Square particle space `max(w,h) x max(w,h)` centered on viewport with edge vignette fade. Smooth preset transitions via `lerpSettings()`. Cursor repulsion/drag interaction. Focus area (gravity shapes) with drift bias.
- **`audio.ts`** - Web Audio API. FFT analysis with exponential smoothing. Returns bass/mid/high/overall for burst detection.
- **`media.ts`** - Video brightness sampling. Loads MP4s into `<video>` elements, samples brightness at 15fps into 64x64 grid via OffscreenCanvas. Fade state machine: idle → in → hold → out. Queued index for seamless transitions. Pingpong mode uses manual reverse seeking (not negative playbackRate). `triggerByIndex()` interrupts current playback. `getRawBrightness()` and `forceSample()` for brightness-weighted grid assignment.

### Components (`src/components/`)
- **`CirclesCanvas.tsx`** - Main canvas component. Manages renderer lifecycle, keyboard shortcuts (1-9 for presets), settings state, media items, pointer event handlers for cursor interaction, auto-cycle preset effect hook. Hydration-safe (starts with defaults, loads localStorage in useEffect). Default activePreset = 0 (first preset on load).
- **`SettingsPanel.tsx`** - Floating transparent panel (420px wide). Sections: Presets (numbered 1-9, save button, transition speed, auto-cycle with include/exclude toggles), Pattern (Noise + Wave side-by-side), Circles + Depth & Blur (side-by-side), Drift + Layout (side-by-side), Focus Area (gravity shapes), Media (thumbnails 5-col grid, two-step delete confirm, invert/loop per item), Audio (collapsible), Colors (collapsible). Always-visible scrollbar. Padding `p-6 sm:p-7`.
- **`DirectionPicker.tsx`** - Circular SVG drag picker for wave direction.

### Settings & Presets (`src/lib/`)
- **`settings.ts`** - Default settings, localStorage load/save. `loadMediaOverrides/saveMediaOverrides` for per-item invert/loop. `loadCustomPresets/saveCustomPreset` for 9 preset slots.
- **`presets.ts`** - 9 presets: Default, Ethereal, Deep Ocean, Pulse, Grid Pulse, Minimal, Dense Field, Soft Grid (useGrid: true), Tidal. Presets are `Partial<Settings>` (includes `useGrid`).

### Types (`src/types/index.ts`)
- `Particle` includes: `mediaGridX/Y`, `vx/vy` (velocity for cursor interaction), `blurAmount`, `depth`
- `Settings` includes: `gridMinSize/gridMaxSize`, `gravityShape/gravityStrength`, `presetTransitionSpeed`, `autoPresetEnabled/autoPresetIntervalMin/autoPresetIntervalMax/autoPresetInclude[]`
- `GravityShape` = `'none' | 'circle' | 'oval' | 'drop'`
- `Preset` = `{ name: string; settings: Partial<Settings> }`

### API (`src/app/api/media/route.ts`)
- GET: auto-discovers .mp4/.webm/.mov files in `public/media/`
- DELETE: removes files from disk (works in dev, read-only on Vercel)
- `export const dynamic = 'force-dynamic'` + `{ cache: 'no-store' }` to prevent caching

### Key Rendering Patterns
- **Viewport-relative sizing**: `viewScale = min(w,h) / 1080` scales all circle sizes, drift strength, cursor forces, grid jitter. A preset looks identical on any screen.
- **Square particle space**: Particles scatter in a `max(w,h) x max(w,h)` square centered on the viewport. Soft-contain keeps particles within this square. Viewport is just a window into it.
- **Edge vignette**: Particles near viewport edges fade with quadratic falloff (8% margin). No hard clipping.
- **Resize remapping**: Square-relative coordinate transform preserves proportions across aspect ratio changes.
- **Noise/wave size is viewport-relative**: slider value 0-1 = fraction of screen diagonal
- **Drift is independent**: particles wander via per-particle noise offsets, separate from pattern
- **Media crossfade**: patterns fade out as media fades in (`patternSize * (1-blend) + mediaSize * blend`)
- **Media in grid mode**: `mediaBlend` tied to `mediaFade` directly when `useGrid` is true, so brightness drives sizes even when particles are already in grid
- **Brightness-weighted grid assignment**: samples video first frame, weights cells by `brightness * centerBias`, assigns nearest free cell via spiral search
- **Ghost particles**: extra particles spawned for media grid cells not covered by real particles. Slow grow (0.8x dt), fast shrink (8x dt) for delayed appearance and quick dispersal.
- **Staggered formation/dispersal**: per-particle blend offset based on `noiseOffsetX`, smooth lerp toward blended target position
- **Sound bursts**: exponential smoothing with decay, pumps size multiplicatively
- **Cursor interaction**: radial repulsion + velocity-based drag-along force, momentum coasting, disabled during grid formation
- **Focus area**: soft "focus area" shapes (circle/oval/drop) with drift bias instead of hard gravitational pull. Disabled during grid/media.
- **Smooth preset transitions**: `transitionToSettings()` + `lerpSettings()` with configurable speed. Numeric values lerp, booleans snap immediately.
- **Auto-cycle presets**: toggle + interval range + include/exclude per preset, interval randomized between min/max.
- **All media is MP4 video**: GIFs don't animate reliably with canvas drawImage, so everything was converted to looping MP4

## Keyboard Shortcuts
- `H` - toggle settings panel
- `F` - toggle fullscreen
- `ESC` - exit fullscreen
- `Space` - fade to/from black
- `M` - trigger random media
- `1-9` - apply presets

## Adding Media Assets
1. Place `.mp4` files in `public/media/`
2. Generate thumbnail: `ffmpeg -i file.mp4 -vf "select=eq(n\,15),scale=120:120:..." -frames:v 1 public/media/thumbs/file.jpg`
3. The `/api/media` route auto-discovers all .mp4/.webm/.mov files

## Deployment
- GitHub: `danhstorm/are-circles`
- Vercel: `are-circles.vercel.app`
- Push to `main` triggers auto-deploy
- Manual: `npx vercel --prod`

## Performance Notes
- DPR capped at 1.5 on mobile, 2 on desktop
- Particle sort order cached (not re-sorted every frame)
- Media brightness sampling throttled to 15fps
- Thumbnails are static JPGs, not autoplay videos
- Canvas uses `{ alpha: false }` for faster compositing
- Square particle space only extends particle scatter bounds; grid/media remain viewport-scoped
