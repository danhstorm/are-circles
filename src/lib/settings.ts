import { Settings, AppState, LivePreset, MediaPlayMode, MediaOverride } from '@/types';
import { DEFAULT_PALETTE, templatePresets } from './presets';
import { defaultMusicConfig } from '@/engine/music';

const STATE_KEY = 'are-circles-state';
const OLD_SETTINGS_KEY = 'are-circles-settings';
const OLD_PRESETS_KEY = 'are-circles-presets';
const OLD_OVERRIDES_KEY = 'are-circles-media-overrides';
const OLD_HIDDEN_KEY = 'are-circles-media-hidden';

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
  imageIntensity: 1.0,
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
  gridMinSize: 2,
  gridMaxSize: 30,
  gravityShape: 'none',
  gravityStrength: 0.3,
  presetTransitionSpeed: 0.15,
  autoPresetEnabled: false,
  autoPresetIntervalMin: 30,
  autoPresetIntervalMax: 60,
  autoPresetInclude: [true, true, true, true, true, true, true, true, true],
};

function makeDefaultLivePresets(): [LivePreset, LivePreset, LivePreset] {
  return [
    {
      name: 'Calm',
      settings: templatePresets[0].settings,
      mediaEnabled: false,
      musicInstruments: { pling: false, mid1: false, mid2: false, pad: false },
    },
    {
      name: 'Breathing',
      settings: templatePresets[1].settings,
      mediaEnabled: true,
      musicInstruments: { pling: true, mid1: true, mid2: false, pad: true },
    },
    {
      name: 'Active',
      settings: templatePresets[2].settings,
      mediaEnabled: true,
      musicInstruments: { pling: true, mid1: true, mid2: true, pad: true },
    },
  ];
}

export const defaultAppState: AppState = {
  version: '1',
  activePreset: 0,
  livePresets: makeDefaultLivePresets(),
  globalColors: {
    backgroundColor: '#6B3A4A',
    paletteColors: [...DEFAULT_PALETTE],
    hueVariation: 15,
  },
  mediaOverrides: {},
  mediaGridColumns: 40,
  transitionSpeed: 0.15,
  music: defaultMusicConfig,
};

export function loadAppState(): AppState {
  if (typeof window === 'undefined') return structuredClone(defaultAppState);
  try {
    const stored = localStorage.getItem(STATE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...structuredClone(defaultAppState), ...parsed };
    }
  } catch { /* fall through */ }
  return migrateOldState();
}

export function saveAppState(state: AppState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function buildRendererSettings(preset: LivePreset, state: AppState): Settings {
  return {
    ...defaultSettings,
    ...preset.settings,
    backgroundColor: state.globalColors.backgroundColor,
    paletteColors: state.globalColors.paletteColors,
    hueVariation: state.globalColors.hueVariation,
    mediaEnabled: preset.mediaEnabled,
    mediaAutoGrid: true,
    mediaGridColumns: state.mediaGridColumns,
    presetTransitionSpeed: state.transitionSpeed,
    imageIntensity: 1.0,
    autoPresetEnabled: false,
  };
}

export async function syncWithServer(current: AppState): Promise<AppState> {
  try {
    const res = await fetch('/settings.json', { cache: 'no-store' });
    if (!res.ok) return current;
    const server = await res.json() as AppState;
    if (parseInt(server.version) > parseInt(current.version)) {
      saveAppState(server);
      return server;
    }
  } catch { /* offline or no file yet */ }
  return current;
}

function migrateOldState(): AppState {
  if (typeof window === 'undefined') return structuredClone(defaultAppState);
  const state = structuredClone(defaultAppState);

  try {
    const oldSettings = localStorage.getItem(OLD_SETTINGS_KEY);
    if (oldSettings) {
      const s = JSON.parse(oldSettings) as Partial<Settings>;
      state.livePresets[0].settings = { ...state.livePresets[0].settings, ...s };
      if (s.backgroundColor) state.globalColors.backgroundColor = s.backgroundColor;
      if (s.paletteColors) state.globalColors.paletteColors = s.paletteColors;
      if (s.hueVariation !== undefined) state.globalColors.hueVariation = s.hueVariation;
      if (s.mediaGridColumns !== undefined) state.mediaGridColumns = s.mediaGridColumns;
      if (s.presetTransitionSpeed !== undefined) state.transitionSpeed = s.presetTransitionSpeed;
    }

    const oldPresets = localStorage.getItem(OLD_PRESETS_KEY);
    if (oldPresets) {
      const arr = JSON.parse(oldPresets) as (Partial<Settings> | null)[];
      for (let i = 0; i < 3 && i < arr.length; i++) {
        if (arr[i]) state.livePresets[i].settings = { ...state.livePresets[i].settings, ...arr[i] };
      }
    }

    const oldOverrides = localStorage.getItem(OLD_OVERRIDES_KEY);
    if (oldOverrides) {
      const ov = JSON.parse(oldOverrides) as Record<string, { playMode: MediaPlayMode; invert: boolean }>;
      for (const [src, data] of Object.entries(ov)) {
        state.mediaOverrides[src] = { ...data, intensity: 0.7 };
      }
    }
  } catch { /* ignore migration errors */ }

  // Clean up old keys
  try {
    localStorage.removeItem(OLD_SETTINGS_KEY);
    localStorage.removeItem(OLD_PRESETS_KEY);
    localStorage.removeItem(OLD_OVERRIDES_KEY);
    localStorage.removeItem(OLD_HIDDEN_KEY);
  } catch { /* ignore */ }

  saveAppState(state);
  return state;
}

export function getMediaOverride(state: AppState, src: string): MediaOverride {
  return state.mediaOverrides[src] || { playMode: 'loop', invert: false, intensity: 0.7 };
}

export function loadHiddenMedia(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(OLD_HIDDEN_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return [];
}
