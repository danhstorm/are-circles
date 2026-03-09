import { Settings } from '@/types';
import { DEFAULT_PALETTE } from './presets';

const STORAGE_KEY = 'are-circles-settings';
const PRESETS_KEY = 'are-circles-presets';

export const defaultSettings: Settings = {
  circleCount: 200,
  minSize: 4,
  maxSize: 80,
  blurMin: 0.1,
  blurMax: 0.8,
  animationSpeed: 0.5,
  noiseScale: 0.3,
  noiseStrength: 1.0,
  noiseSpeed: 0.3,
  driftStrength: 15,
  driftSpeed: 0.3,
  waveStrength: 0,
  waveFrequency: 0.3,
  waveSpeed: 0.5,
  waveDirection: 0,
  floatGridBlend: 0,
  gridColumns: 20,
  soundSensitivity: 0.7,
  soundSmoothing: 0.95,
  soundBurstDecay: 0.92,
  micGain: 1.0,
  imageIntervalMin: 10,
  imageIntervalMax: 30,
  imageFadeDuration: 2.5,
  imageIntensity: 0.7,
  mediaEnabled: true,
  mediaAutoGrid: true,
  mediaGridColumns: 40,
  backgroundColor: '#6B3A4A',
  paletteColors: DEFAULT_PALETTE,
  hueVariation: 15,
  opacityMin: 0.3,
  opacityMax: 0.9,
  depthOfField: 0.5,
  blurPercent: 0.5,
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

// Loads custom preset overrides: first from localStorage (user's own),
// falling back to /presets.json (repo defaults shipped by the developer).
// Returns array of 5 slots, null = use built-in preset.
export function loadCustomPresets(): (Partial<Omit<Settings, 'useGrid'>> | null)[] {
  if (typeof window === 'undefined') return [null, null, null, null, null];
  try {
    const stored = localStorage.getItem(PRESETS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [null, null, null, null, null];
}

// Fetches repo-shipped preset defaults from /presets.json.
// These are the developer's saved presets that new visitors get.
export async function loadRepoPresets(): Promise<(Partial<Omit<Settings, 'useGrid'>> | null)[]> {
  try {
    const res = await fetch('/presets.json');
    if (res.ok) return await res.json();
  } catch {}
  return [null, null, null, null, null];
}

export function saveCustomPreset(idx: number, settings: Partial<Omit<Settings, 'useGrid'>>): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadCustomPresets();
    existing[idx] = settings;
    localStorage.setItem(PRESETS_KEY, JSON.stringify(existing));
  } catch {}
}
