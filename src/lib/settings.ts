import { Settings, AppState, Scene, MediaPlayMode, MediaOverride } from '@/types';
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

function makeDefaultScenes(): [Scene, Scene, Scene] {
  return [
    {
      name: 'Calm',
      settings: templatePresets[0].settings,
      mediaEnabled: false,
      soundEnabled: true,
      musicInstruments: { pling: true, mid1: false, mid2: false, pad: true },
      presetTemplates: [],
      cycleIntervalMin: 0,
      cycleIntervalMax: 0,
    },
    {
      name: 'Breathing',
      settings: templatePresets[1].settings,
      mediaEnabled: false,
      soundEnabled: false,
      musicInstruments: { pling: true, mid1: true, mid2: false, pad: true },
      presetTemplates: [1, 2, 8],
      cycleIntervalMin: 30,
      cycleIntervalMax: 60,
    },
    {
      name: 'Active',
      settings: templatePresets[2].settings,
      mediaEnabled: true,
      soundEnabled: false,
      musicInstruments: { pling: true, mid1: true, mid2: true, pad: true },
      presetTemplates: [1, 2, 8],
      cycleIntervalMin: 30,
      cycleIntervalMax: 60,
    },
  ];
}

export const defaultAppState: AppState = {
  version: '1',
  activePreset: 0,
  scenes: makeDefaultScenes(),
  globalColors: {
    backgroundColor: '#6B3A4A',
    paletteColors: [...DEFAULT_PALETTE],
    hueVariation: 15,
  },
  mediaOverrides: {},
  hiddenMedia: [],
  mediaGridColumns: 40,
  transitionSpeed: 0.15,
  music: defaultMusicConfig,
};

export function computeVersionHash(state: AppState): string {
  const content = JSON.stringify({
    scenes: state.scenes,
    globalColors: state.globalColors,
    mediaOverrides: state.mediaOverrides,
    hiddenMedia: state.hiddenMedia,
    mediaGridColumns: state.mediaGridColumns,
    transitionSpeed: state.transitionSpeed,
    music: state.music,
  });
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function loadAppState(): AppState {
  if (typeof window === 'undefined') return structuredClone(defaultAppState);
  try {
    const stored = localStorage.getItem(STATE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const base = structuredClone(defaultAppState);
      const merged = { ...base, ...parsed };

      // Migrate livePresets -> scenes
      const savedScenes = parsed.scenes || parsed.livePresets;
      if (savedScenes) {
        merged.scenes = base.scenes.map((def: Scene, i: number) => {
          const saved = savedScenes[i];
          if (!saved) return def;
          return {
            ...def,
            ...saved,
            soundEnabled: saved.soundEnabled ?? def.soundEnabled,
            presetTemplates: saved.presetTemplates ?? def.presetTemplates,
            cycleIntervalMin: saved.cycleIntervalMin ?? saved.cycleInterval ?? def.cycleIntervalMin,
            cycleIntervalMax: saved.cycleIntervalMax ?? saved.cycleInterval ?? def.cycleIntervalMax,
            musicInstruments: { ...def.musicInstruments, ...(saved.musicInstruments || {}) },
          };
        }) as [Scene, Scene, Scene];
      }
      // Remove deprecated field
      delete merged.livePresets;

      // Deep-merge music config
      if (parsed.music) {
        merged.music = {
          ...base.music,
          ...parsed.music,
          pling: { ...base.music.pling, ...(parsed.music.pling || {}) },
          mid1: { ...base.music.mid1, ...(parsed.music.mid1 || {}) },
          mid2: { ...base.music.mid2, ...(parsed.music.mid2 || {}) },
          pad: { ...base.music.pad, ...(parsed.music.pad || {}) },
          visualReactions: { ...base.music.visualReactions, ...(parsed.music.visualReactions || {}) },
        };
      }

      // Ensure hiddenMedia exists
      if (!merged.hiddenMedia) merged.hiddenMedia = [];

      return merged;
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

export function buildRendererSettings(scene: Scene, state: AppState): Settings {
  return {
    ...defaultSettings,
    ...scene.settings,
    backgroundColor: state.globalColors.backgroundColor,
    paletteColors: state.globalColors.paletteColors,
    hueVariation: state.globalColors.hueVariation,
    mediaEnabled: scene.mediaEnabled,
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
    const server = await res.json();

    // Migrate server data: livePresets -> scenes
    if (server.livePresets && !server.scenes) {
      server.scenes = server.livePresets;
      delete server.livePresets;
    }

    // Hash-based comparison: if server version differs, server wins
    if (server.version && server.version !== current.version) {
      // Deep-merge server state with defaults to fill any missing fields
      const base = structuredClone(defaultAppState);
      const merged = { ...base, ...server };
      if (server.scenes) {
        merged.scenes = base.scenes.map((def: Scene, i: number) => {
          const saved = server.scenes[i];
          if (!saved) return def;
          return {
            ...def,
            ...saved,
            soundEnabled: saved.soundEnabled ?? def.soundEnabled,
            presetTemplates: saved.presetTemplates ?? def.presetTemplates,
            cycleIntervalMin: saved.cycleIntervalMin ?? saved.cycleInterval ?? def.cycleIntervalMin,
            cycleIntervalMax: saved.cycleIntervalMax ?? saved.cycleInterval ?? def.cycleIntervalMax,
            musicInstruments: { ...def.musicInstruments, ...(saved.musicInstruments || {}) },
          };
        }) as [Scene, Scene, Scene];
      }
      if (server.music) {
        merged.music = {
          ...base.music,
          ...server.music,
          pling: { ...base.music.pling, ...(server.music.pling || {}) },
          mid1: { ...base.music.mid1, ...(server.music.mid1 || {}) },
          mid2: { ...base.music.mid2, ...(server.music.mid2 || {}) },
          pad: { ...base.music.pad, ...(server.music.pad || {}) },
          visualReactions: { ...base.music.visualReactions, ...(server.music.visualReactions || {}) },
        };
      }
      if (!merged.hiddenMedia) merged.hiddenMedia = [];
      delete merged.livePresets;
      saveAppState(merged);
      return merged;
    }
  } catch { /* offline or no file yet */ }
  return current;
}

export function resetToServerDefaults(): Promise<AppState> {
  return fetch('/settings.json', { cache: 'no-store' })
    .then(r => r.json())
    .then(server => {
      if (server.livePresets && !server.scenes) {
        server.scenes = server.livePresets;
        delete server.livePresets;
      }
      const base = structuredClone(defaultAppState);
      const merged = { ...base, ...server };
      if (server.scenes) {
        merged.scenes = base.scenes.map((def: Scene, i: number) => {
          const saved = server.scenes[i];
          if (!saved) return def;
          return {
            ...def,
            ...saved,
            soundEnabled: saved.soundEnabled ?? def.soundEnabled,
            presetTemplates: saved.presetTemplates ?? def.presetTemplates,
            cycleIntervalMin: saved.cycleIntervalMin ?? saved.cycleInterval ?? def.cycleIntervalMin,
            cycleIntervalMax: saved.cycleIntervalMax ?? saved.cycleInterval ?? def.cycleIntervalMax,
            musicInstruments: { ...def.musicInstruments, ...(saved.musicInstruments || {}) },
          };
        }) as [Scene, Scene, Scene];
      }
      if (server.music) {
        merged.music = {
          ...base.music,
          ...server.music,
          pling: { ...base.music.pling, ...(server.music.pling || {}) },
          mid1: { ...base.music.mid1, ...(server.music.mid1 || {}) },
          mid2: { ...base.music.mid2, ...(server.music.mid2 || {}) },
          pad: { ...base.music.pad, ...(server.music.pad || {}) },
          visualReactions: { ...base.music.visualReactions, ...(server.music.visualReactions || {}) },
        };
      }
      if (!merged.hiddenMedia) merged.hiddenMedia = [];
      delete merged.livePresets;
      saveAppState(merged);
      return merged;
    })
    .catch(() => {
      const defaults = structuredClone(defaultAppState);
      saveAppState(defaults);
      return defaults;
    });
}

function migrateOldState(): AppState {
  if (typeof window === 'undefined') return structuredClone(defaultAppState);
  const state = structuredClone(defaultAppState);

  try {
    const oldSettings = localStorage.getItem(OLD_SETTINGS_KEY);
    if (oldSettings) {
      const s = JSON.parse(oldSettings) as Partial<Settings>;
      state.scenes[0].settings = { ...state.scenes[0].settings, ...s };
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
        if (arr[i]) state.scenes[i].settings = { ...state.scenes[i].settings, ...arr[i] };
      }
    }

    const oldOverrides = localStorage.getItem(OLD_OVERRIDES_KEY);
    if (oldOverrides) {
      const ov = JSON.parse(oldOverrides) as Record<string, { playMode: MediaPlayMode; invert: boolean }>;
      for (const [src, data] of Object.entries(ov)) {
        state.mediaOverrides[src] = { ...data, intensity: 0.7, contrast: 0 };
      }
    }
  } catch { /* ignore migration errors */ }

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
  return state.mediaOverrides[src] || { playMode: 'loop', invert: false, intensity: 0.7, contrast: 0 };
}
