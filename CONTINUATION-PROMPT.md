# Are Circles - Continuation Prompt

Read the `CLAUDE.md` file first for full project architecture. Then read this file for the current state of what's been built and changed beyond what CLAUDE.md documents.

## What Changed Since CLAUDE.md Was Written

### 1. Beat-Grid Scheduler (music.ts)

Replaced independent `nextTime` per instrument with a shared `beatOrigin` timestamp. All instruments derive schedule from shared beat grid via `beatToTime(beat)`. Tempo changes rebase origin to preserve beat position. Speed changes snap instrument to next grid-aligned beat.

### 2. FM Synthesis Overhaul (music.ts)

Mid instruments (Plong/Bong) now use:
- 3 detuned carriers per note (not just one) for richness
- Decaying mod index (sound becomes purer over time)
- Output lowpass filter per note (softens FM harmonics)
- Exponential volume curves (`vol = rawVol * rawVol`)
- Much longer envelopes (glass decay 3.5s, release 4.0s)
- Lowered octave ranges: Plong 3-5, Bong 2-4

### 3. Volume Randomization

Pling and Mid configs now use `volumeMin`/`volumeMax` instead of single `volume`. Each note picks random volume in that range. Applied with exponential curve.

### 4. Pling Automation System

PlingConfig has expanded automation ranges that ping-pong sinusoidally:
- `autoFilterMin/Max` (200-8000 Hz) - filter cutoff sweep
- `autoDecayMin/Max` (0.02-1s) - note decay length
- `autoLfoSpeedMin/Max` (0.1-10 Hz) - filter LFO rate
- `autoLfoDepthMin/Max` (0-1) - filter LFO depth
- `autoTriggerMin/Max` (0-1) - trigger probability
- `autoSpeed` (0.01-0.5) - overall automation cycle speed

Each parameter uses a different phase multiplier (1.0x, 0.7x, 0.5x, 0.9x, 1.3x) so they don't all peak at once. When min === max, automation is off (fixed value).

The individual LFO Speed, LFO Depth, Trigger %, Filter, and Decay sliders have been removed from the main Pling section in the UI -- they're controlled exclusively via the automation ranges in the "Auto" sub-section.

### 5. Pad Controls

PadConfig now has: `filterCutoff`, `detune`, `octaveLow`, `octaveHigh` (previously hardcoded). Default: octave 2-3, filter 600Hz (dark/warm), 7 cents detune.

### 6. Visual Reactions - Swirl Impulses

- Per-impulse `radius` field (randomized 0.3x-1.5x of config value)
- Reduced force from 2000 to 800 (gentler, more continuous)
- Extended `maxAge` from 0.3-0.6s to 0.6-1.4s
- Smooth cubic fade curve
- Lowered defaults: swirlStrength 0.2, swirlRadius 0.08, sizePulse 0.15

### 7. Note Pulse System (renderer.ts)

Per-particle `notePulse` field. On mid note trigger, 1-3 random particles get their `notePulse` boosted (strength based on note volume). Particles with notePulse grow up to 4x size with smooth ~1.5s decay (`Math.pow(0.04, dt)`). Max size raised from 1.5x to 2.5x. Works during both grid and scatter mode.

Music engine queues note pulses via `pendingNotePulses` array, drained by `getNotePulses()` getter called from the 16ms musicPump interval in CirclesCanvas.

### 8. Media Contrast/Levels

MediaOverride now has `contrast: number` (0-0.8). Applied as a black point cutoff in `getBrightness()`:
```
b = max(0, (b - blackPoint) / (1 - blackPoint))
```
This crushes dark grey areas to black, giving video animations more punch and contrast.

- `contrastMap: Map<string, number>` on MediaEngine, set via `setContrastMap()`
- `getCurrentContrast()` returns per-video contrast value
- `getContrastBrightness()` utility for external use
- Thumbnail previews show the effect via CSS `filter: brightness(...) contrast(...)`
- "Lvl" slider (0-0.8) appears below "Int" slider for each media thumbnail in SetupPanel

### 9. Circle Count Max

SetupPanel circle count slider max: 1500 (was 500).

### 10. UI - Retro Synth Panel (MusicPanel.tsx)

Complete visual overhaul:
- Color-coded modules: Pling=teal `#4fd1c5`, Plong=amber `#f6ad55`, Bong=pink `#f687b3`, Pad=green `#68d391`, Reactions=purple `#b794f4`
- Colored left borders, LED-style enable dots with glow
- Monospace fonts for values, compact 280px width, 9-10px text
- Module component with accent styling, enable toggle, preset label
- SpeedButtons and SoundButtons with accent-colored selection states

### 11. Scoped CSS for Synth Sliders

`.synth-slider` class in globals.css: 3px track height + 10px thumbs (vs default 6px/16px for SetupPanel). Applied to MusicPanel sliders only via className.

### 12. RangeSlider Overflow Fix

MusicPanel's RangeSlider uses internal padding (`HALF=5px` on each side). Thumbs positioned within usable track area so they never clip off-screen at min values.

### 13. Renamed Instruments in UI

"Mid 1" -> "Plong", "Mid 2" -> "Bong" in MusicPanel. Internal config keys remain `mid1`/`mid2`.

### 14. Music Start on First Gesture

Experience starts with `music.start(3)` on first user gesture (pointerdown/keydown), giving a 3-second fade-in. If no instruments are enabled in the active preset, engine fades out immediately but keeps AudioContext ready.

### 15. Deep-Merge for Music Config

`loadAppState()` in settings.ts deep-merges each music sub-object individually (`pling`, `mid1`, `mid2`, `pad`, `visualReactions`) so new fields from defaults aren't lost when loading from older localStorage data.

### 16. Default Preset Tuning

- Tempo: 54 BPM (meditative)
- Pling: octave 4-7, filter auto-sweeping 1200-4500Hz, decay auto 0.08-0.3s
- Mid1 (Plong): glass sound, 1/2 speed, octave 3-5, decay 1.5x, low FM
- Mid2 (Bong): rhodes, 1/4 speed, octave 2-4, decay 2.0x
- Pad: octave 2-3, filter 600Hz, 7 cents detune
- Preset 1 (Calm): pling + pad enabled
- Preset 2 (Breathing): pling + mid1 + pad enabled
- Preset 3 (Active): all 4 enabled

## Current Default Config Values

```typescript
defaultMusicConfig = {
  scale: 'pentatonic-major',
  tempo: 54,
  masterVolume: 0.7,
  pling: {
    volumeMin: 0.1, volumeMax: 0.35, speed: '1/8', triggerProbability: 0.35,
    delay: 0.4, reverb: 0.6, lfoSpeed: 1.5, lfoDepth: 0.3,
    octaveLow: 4, octaveHigh: 7, filterCutoff: 3000, filterQ: 1.5, decay: 0.2,
    autoFilterMin: 1200, autoFilterMax: 4500, autoDecayMin: 0.08, autoDecayMax: 0.3,
    autoLfoSpeedMin: 1.5, autoLfoSpeedMax: 1.5, autoLfoDepthMin: 0.3, autoLfoDepthMax: 0.3,
    autoTriggerMin: 0.35, autoTriggerMax: 0.35, autoSpeed: 0.06,
  },
  mid1: {
    volumeMin: 0.2, volumeMax: 0.5, sound: 'glass', speed: '1/2', triggerProbability: 0.35,
    octaveLow: 3, octaveHigh: 5, filterCutoff: 3000, decay: 1.5, fmAmount: 0.6, detune: 1.2,
    delay: 0.3, reverb: 0.5,
  },
  mid2: {
    volumeMin: 0.15, volumeMax: 0.4, sound: 'rhodes', speed: '1/4', triggerProbability: 0.2,
    octaveLow: 2, octaveHigh: 4, filterCutoff: 2000, decay: 2.0, fmAmount: 0.8, detune: 0.8,
    delay: 0.4, reverb: 0.6,
  },
  pad: { volume: 0.2, chordInterval: 4, reverb: 0.7, filterCutoff: 600, detune: 7, octaveLow: 2, octaveHigh: 3 },
  visualReactions: { swirlStrength: 0.2, swirlRadius: 0.08, sizePulseStrength: 0.15, bassSizeBoost: 0.15 },
};
```

## Type Definitions (Current)

```typescript
interface PlingConfig {
  volumeMin: number; volumeMax: number;
  speed: SpeedSubdivision; triggerProbability: number;
  delay: number; reverb: number;
  lfoSpeed: number; lfoDepth: number;
  octaveLow: number; octaveHigh: number;
  filterCutoff: number; filterQ: number; decay: number;
  autoFilterMin: number; autoFilterMax: number;
  autoDecayMin: number; autoDecayMax: number;
  autoLfoSpeedMin: number; autoLfoSpeedMax: number;
  autoLfoDepthMin: number; autoLfoDepthMax: number;
  autoTriggerMin: number; autoTriggerMax: number;
  autoSpeed: number;
}

interface MidConfig {
  volumeMin: number; volumeMax: number;
  sound: MidSound; speed: SpeedSubdivision; triggerProbability: number;
  octaveLow: number; octaveHigh: number;
  filterCutoff: number; decay: number; fmAmount: number; detune: number;
  delay: number; reverb: number;
}

interface PadConfig {
  volume: number; chordInterval: number; reverb: number;
  filterCutoff: number; detune: number; octaveLow: number; octaveHigh: number;
}

interface MediaOverride {
  playMode: MediaPlayMode; invert: boolean;
  intensity: number; contrast: number;
}

interface SwirlImpulse {
  x: number; y: number; strength: number; radius: number;
  dx: number; dy: number; age: number; maxAge: number;
}

// Particle has: notePulse: number
```

## File Sizes (for reference)

- `renderer.ts` ~850 lines
- `music.ts` ~685 lines
- `media.ts` ~280 lines
- `audio.ts` ~80 lines
- `CirclesCanvas.tsx` ~340 lines
- `SetupPanel.tsx` ~425 lines
- `MusicPanel.tsx` ~375 lines
- `settings.ts` ~235 lines
- `presets.ts` ~250 lines
- `types/index.ts` ~220 lines
- `globals.css` ~85 lines

## Verification

All changes pass `npx tsc --noEmit` cleanly. No test suite exists -- verify visually + build clean.

## Potential Future Work

- Automation for mid instruments (filter, decay) -- same ping-pong system as pling
- Pad crossfade timing automation
- Visual reaction strength tied to music amplitude
- Performance testing at 1500 particles on projection hardware
- Default automation ranges may need tuning after real-world testing (currently LFO and trigger auto ranges are set to equal min/max = fixed values by default)
