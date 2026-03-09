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
  backgroundColor: string;
  paletteColors: string[];
  hueVariation: number;
  opacityMin: number;
  opacityMax: number;
  depthOfField: number;
  fadeDuration: number;
  useGrid: boolean;
}

export interface Preset {
  name: string;
  settings: Partial<Omit<Settings, 'useGrid'>>;
}

export type MediaPlayMode = 'loop' | 'pingpong';

export interface MediaItem {
  src: string;
  type: 'video';
  playMode: MediaPlayMode;
  invert: boolean;
}
