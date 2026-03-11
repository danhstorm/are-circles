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
  volume: number;
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
}

export interface MidConfig {
  volume: number;
  sound: MidSound;
  speed: SpeedSubdivision;
  triggerProbability: number;
  delay: number;
  reverb: number;
}

export interface PadConfig {
  volume: number;
  chordInterval: number;
  reverb: number;
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

export interface LivePreset {
  name: string;
  settings: Partial<Settings>;
  mediaEnabled: boolean;
  musicInstruments: {
    pling: boolean;
    mid1: boolean;
    mid2: boolean;
    pad: boolean;
  };
}

export interface MediaOverride {
  playMode: MediaPlayMode;
  invert: boolean;
  intensity: number;
}

export interface SwirlImpulse {
  x: number;
  y: number;
  strength: number;
  dx: number;
  dy: number;
  age: number;
  maxAge: number;
}

export interface AppState {
  version: string;
  activePreset: number;
  livePresets: [LivePreset, LivePreset, LivePreset];
  globalColors: {
    backgroundColor: string;
    paletteColors: string[];
    hueVariation: number;
  };
  mediaOverrides: Record<string, MediaOverride>;
  mediaGridColumns: number;
  transitionSpeed: number;
  music: MusicConfig;
}
