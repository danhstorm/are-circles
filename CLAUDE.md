# Åre Circles - Project Context

## What This Is
Interactive generative circles visual for Åre Business Forum, projected via mirrored projectors. Circles animate with noise/wave patterns, sound reactivity, and media morphing (halftone effect). Deployed on Vercel.

## Tech Stack
- **Next.js 16** (App Router, TypeScript)
- **Canvas 2D** for rendering (no WebGL)
- **Web Audio API** for mic input / sound reactivity
- **simplex-noise** for organic noise patterns
- **Tailwind CSS** for settings panel UI

## Architecture

### Engine (`src/engine/`)
- **`renderer.ts`** - Main render loop. Manages particles, applies noise/wave/drift size modulation, sound bursts, media crossfade. Canvas 2D with radial gradients for bokeh effect. Depth-sorted draw order (cached).
- **`audio.ts`** - Web Audio API. FFT analysis with exponential smoothing. Returns bass/mid/high/overall for burst detection.
- **`media.ts`** - Video brightness sampling. Loads MP4s into `<video>` elements, samples brightness at 15fps into 64x64 grid via OffscreenCanvas. Fade state machine: idle → in → hold → out. Queued index for seamless transitions.

### Components (`src/components/`)
- **`CirclesCanvas.tsx`** - Main canvas component. Manages renderer lifecycle, keyboard shortcuts, settings state, media items. Hydration-safe (starts with defaults, loads localStorage in useEffect).
- **`SettingsPanel.tsx`** - Floating transparent panel with sections: Presets, Audio, Drift, Noise, Wave, Circles, Layout, Blur, Media, Colors, Fade. 2-column grid sliders. Media thumbnails with click-to-trigger and X-to-remove.
- **`DirectionPicker.tsx`** - Circular SVG drag picker for wave direction.

### Settings (`src/lib/`)
- **`settings.ts`** - Default settings, localStorage load/save.
- **`presets.ts`** - 5 presets. Presets control everything except grid toggle.

### Key Patterns
- **Noise/wave size is viewport-relative**: slider value 0-1 = fraction of screen diagonal
- **Drift is independent**: particles wander via per-particle noise offsets, separate from pattern
- **Media crossfade**: patterns fade out as media fades in (`patternSize * (1-blend) + mediaSize * blend`)
- **Sound bursts**: exponential smoothing with decay, pumps size multiplicatively
- **All media is MP4 video**: GIFs don't animate reliably with canvas drawImage, so everything was converted to looping MP4

## Keyboard Shortcuts
- `H` - toggle settings panel
- `F` - toggle fullscreen
- `ESC` - exit fullscreen
- `Space` - fade to/from black
- `M` - trigger random media
- `1-5` - apply presets

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
