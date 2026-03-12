export interface Particle {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  baseSize: number;
  size: number;
  targetSize: number;
  color: string;
  colorT: string;
  hue: number;
  saturation: number;
  lightness: number;
  blur: number;
  blurAmount: number;
  opacity: number;
  depth: number;
  gridX: number;
  gridY: number;
  mediaGridX: number;
  mediaGridY: number;
  noiseOffsetX: number;
  noiseOffsetY: number;
  notePulse: number;
  mediaDelay: number;
  preMediaX: number;
  preMediaY: number;
  mediaSpeed: number;
}

export interface AudioData {
  bass: number;
  mid: number;
  high: number;
  overall: number;
}

export interface Settings {
  circleCount: number;
  minSize: number;
  maxSize: number;
  blurMin: number;
  blurMax: number;
  animationSpeed: number;
  noiseScale: number;
  noiseStrength: number;
  noiseSpeed: number;
  driftStrength: number;
  driftSpeed: number;
  waveStrength: number;
  waveFrequency: number;
  waveSpeed: number;
  waveDirection: number;
  floatGridBlend: number;
  gridColumns: number;
  soundSensitivity: number;
  soundSmoothing: number;
  soundBurstDecay: number;
  micGain: number;
  imageIntervalMin: number;
  imageIntervalMax: number;
  imageFadeDuration: number;
  imageIntensity: number;
  mediaEnabled: boolean;
  mediaAutoGrid: boolean;
  mediaGridColumns: number;
  backgroundColor: string;
  paletteColors: string[];
  hueVariation: number;
  opacityMin: number;
  opacityMax: number;
  depthOfField: number;
  blurPercent: number;
  fadeDuration: number;
  useGrid: boolean;
  gridMinSize: number;
  gridMaxSize: number;
  gravityShape: GravityShape;
  gravityStrength: number;
  presetTransitionSpeed: number;
  autoPresetEnabled: boolean;
  autoPresetIntervalMin: number;
  autoPresetIntervalMax: number;
  autoPresetInclude: boolean[];
}

export type GravityShape = 'none' | 'circle' | 'oval' | 'drop';

export interface Preset {
  name: string;
  settings: Partial<Settings>;
}

export type MediaPlayMode = 'loop' | 'pingpong';

export interface MediaItem {
  src: string;
  type: 'video';
  playMode: MediaPlayMode;
  invert: boolean;
}

// ─── Music Engine Types ───

export type ScaleType = 'pentatonic-major' | 'pentatonic-minor';
export type MidSound = 'xylophone' | 'rhodes' | 'breathy' | 'bell' | 'kalimba' | 'glass';
export type SpeedSubdivision = '1/1' | '1/2' | '1/3' | '1/4' | '1/6' | '1/8' | '1/16';

export interface PlingConfig {
  volumeMin: number;
  volumeMax: number;
  speed: SpeedSubdivision;
  triggerProbability: number;
  delay: number;
  reverb: number;
  lfoSpeed: number;
  lfoDepth: number;
  octaveLow: number;
  octaveHigh: number;
  filterCutoff: number;
  filterQ: number;
  decay: number;
  // Automation ranges (ping-pong). When min === max, automation is off.
  autoFilterMin: number;
  autoFilterMax: number;
  autoDecayMin: number;
  autoDecayMax: number;
  autoLfoSpeedMin: number;
  autoLfoSpeedMax: number;
  autoLfoDepthMin: number;
  autoLfoDepthMax: number;
  autoTriggerMin: number;
  autoTriggerMax: number;
  autoSpeed: number;
}

export interface MidConfig {
  volumeMin: number;
  volumeMax: number;
  sound: MidSound;
  speed: SpeedSubdivision;
  triggerProbability: number;
  octaveLow: number;
  octaveHigh: number;
  filterCutoff: number;
  decay: number;
  fmAmount: number;
  delay: number;
  reverb: number;
  // Automation ranges (ping-pong). When min === max, automation is off.
  autoFilterMin: number;
  autoFilterMax: number;
  autoDecayMin: number;
  autoDecayMax: number;
  autoFmMin: number;
  autoFmMax: number;
  autoTriggerMin: number;
  autoTriggerMax: number;
  autoSpeed: number;
}

export interface PadConfig {
  volume: number;
  chordInterval: number;
  reverb: number;
  filterCutoff: number;
  octaveLow: number;
  octaveHigh: number;
}

export interface VisualReactionConfig {
  swirlStrength: number;
  swirlRadius: number;
  sizePulseStrength: number;
  bassSizeBoost: number;
}

export interface MusicConfig {
  scale: ScaleType;
  tempo: number;
  masterVolume: number;
  pling: PlingConfig;
  mid1: MidConfig;
  mid2: MidConfig;
  pad: PadConfig;
  visualReactions: VisualReactionConfig;
}

// ─── App State Types ───

export interface Scene {
  name: string;
  settings: Partial<Settings>;
  mediaEnabled: boolean;
  soundEnabled: boolean;
  musicInstruments: {
    pling: boolean;
    mid1: boolean;
    mid2: boolean;
    pad: boolean;
  };
  presetTemplates: number[];
  cycleIntervalMin: number;
  cycleIntervalMax: number;
}

/** @deprecated Use Scene instead */
export type LivePreset = Scene;

export interface MediaOverride {
  playMode: MediaPlayMode;
  invert: boolean;
  intensity: number;
  contrast: number;
}

export interface SwirlImpulse {
  x: number;
  y: number;
  strength: number;
  radius: number;
  dx: number;
  dy: number;
  age: number;
  maxAge: number;
}

export interface AppState {
  version: string;
  activePreset: number;
  scenes: [Scene, Scene, Scene];
  /** @deprecated Use scenes instead */
  livePresets?: [Scene, Scene, Scene];
  customPresets: Preset[];
  globalColors: {
    backgroundColor: string;
    paletteColors: string[];
    hueVariation: number;
  };
  mediaOverrides: Record<string, MediaOverride>;
  mediaOrder: string[];
  hiddenMedia: string[];
  mediaGridColumns: number;
  transitionSpeed: number;
  soundMuted: boolean;
  music: MusicConfig;
}
