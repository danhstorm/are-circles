# Are Circles - Scenes Overhaul Design

## Date: 2026-03-11

## Changes

### Bug Fixes
1. Dots flowing in from sides during media grid - snap off-screen particles to grid position with size 0
2. Video invert not working - add invertMap to MediaEngine like intensity/contrast
3. Media deletion not persisting on Vercel - track hiddenMedia in AppState
4. Media settings not saving - verify override save path works correctly

### Rename to Scenes
- LivePreset -> Scene type rename throughout

### Per-Scene Sound
- Add soundEnabled boolean to Scene
- S key = temporary live toggle with 2s fade
- Sound toggle in setup panel per scene

### Preset Cycling
- presetTemplates: number[] per scene (indices into template presets)
- cycleInterval: number per scene
- Smooth crossfade between templates

### Start Sequence (Intro Mode)
- Circle formation on load, ~60% of screen
- Slow rotation + size oscillation
- Click/keypress to scatter and start

### Version Tracking
- Content hash based versioning
- Reset button in settings panel

## Data Model
```typescript
interface Scene {
  name: string;
  settings: Partial<Settings>;
  mediaEnabled: boolean;
  soundEnabled: boolean;
  musicInstruments: { pling, mid1, mid2, pad };
  presetTemplates: number[];
  cycleInterval: number;
}

interface AppState {
  version: string; // content hash
  activePreset: number;
  scenes: [Scene, Scene, Scene];
  globalColors: { ... };
  mediaOverrides: Record<string, MediaOverride>;
  hiddenMedia: string[];
  mediaGridColumns: number;
  transitionSpeed: number;
  music: MusicConfig;
}
```
