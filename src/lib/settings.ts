import { Settings } from '@/types';
import { DEFAULT_PALETTE } from './presets';

const STORAGE_KEY = 'are-circles-settings';

export const defaultSettings: Settings = {
  circleCount: 200,
  minSize: 4,
  maxSize: 80,
  blurMin: 0.1,
  blurMax: 0.8,
  animationSpeed: 0.5,
  noiseScale: 0.003,
  floatGridBlend: 0,
  gridColumns: 20,
  soundSensitivity: 0.7,
  soundSmoothing: 0.95,
  micGain: 1.0,
  imageIntervalMin: 10,
  imageIntervalMax: 30,
  imageFadeDuration: 2.5,
  imageIntensity: 0.7,
  backgroundColor: '#6B3A4A',
  paletteColors: DEFAULT_PALETTE,
  hueVariation: 15,
  opacityMin: 0.3,
  opacityMax: 0.9,
  depthOfField: 0.5,
  fadeDuration: 2,
  useGrid: false,
};

export function loadSettings(): Settings {
  if (typeof window === 'undefined') return { ...defaultSettings };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch {}
  return { ...defaultSettings };
}

export function saveSettings(settings: Settings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}
