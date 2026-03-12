'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { CirclesRenderer } from '@/engine/renderer';
import { MusicEngine } from '@/engine/music';
import { AppState, MediaItem } from '@/types';
import { defaultAppState, defaultSettings, loadAppState, saveAppState, buildRendererSettings, syncWithServer, getMediaOverride } from '@/lib/settings';
import { templatePresets } from '@/lib/presets';
import SetupPanel from './SetupPanel';
import MusicPanel from './MusicPanel';

export default function CirclesCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CirclesRenderer | null>(null);
  const musicRef = useRef<MusicEngine | null>(null);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const activeTemplateRef = useRef<number | null>(null);

  const [appState, setAppState] = useState<AppState>(defaultAppState);
  const [panelVisible, setPanelVisible] = useState(false);
  const [mode, setMode] = useState<'live' | 'setup'>('live');
  const [audioActive, setAudioActive] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [activeMediaIndex, setActiveMediaIndex] = useState(-1);
  const [editingPreset, setEditingPreset] = useState(0);
  const [inIntro, setInIntro] = useState(true);
  const [soundMuted, setSoundMuted] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cycleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cycleTemplateIdx = useRef(0);

  const autoSave = useCallback((state: AppState) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveAppState(state), 200);
  }, []);

  const appStateRef = useRef(appState);
  const soundMutedRef = useRef(soundMuted);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  useEffect(() => {
    soundMutedRef.current = soundMuted;
  }, [soundMuted]);

  const startPresetCycling = useCallback((state: AppState) => {
    clearTimeout(cycleTimer.current);
    const scene = state.scenes[state.activePreset];
    if (!scene.presetTemplates || scene.presetTemplates.length < 2 || scene.cycleIntervalMin <= 0) return;

    const randomInterval = (s: { cycleIntervalMin: number; cycleIntervalMax: number }) => {
      const lo = s.cycleIntervalMin;
      const hi = Math.max(lo, s.cycleIntervalMax);
      return (lo + Math.random() * (hi - lo)) * 1000;
    };

    const cycle = () => {
      const currentState = appStateRef.current;
      const currentScene = currentState.scenes[currentState.activePreset];
      if (!currentScene.presetTemplates || currentScene.presetTemplates.length < 2) return;

      cycleTemplateIdx.current = (cycleTemplateIdx.current + 1) % currentScene.presetTemplates.length;
      const templateIdx = currentScene.presetTemplates[cycleTemplateIdx.current];
      const presets = currentState.customPresets || templatePresets;
      const template = presets[templateIdx];
      if (template) {
        const mergedSettings = buildRendererSettings(
          { ...currentScene, settings: { ...defaultSettings, ...template.settings } },
          currentState,
        );
        rendererRef.current?.transitionToSettings(mergedSettings);
      }
      cycleTimer.current = setTimeout(cycle, randomInterval(currentScene));
    };
    cycleTimer.current = setTimeout(cycle, randomInterval(scene));
  }, []);

  const applyPreset = useCallback(async (idx: number, state: AppState, transition = true) => {
    const next = { ...state, activePreset: idx };
    setAppState(next);
    autoSave(next);

    const scene = next.scenes[idx];
    // Reset active template ref to first template of new scene
    const firstTemplate = scene.presetTemplates?.[0] ?? null;
    activeTemplateRef.current = firstTemplate;

    let settings: ReturnType<typeof buildRendererSettings>;

    // If scene has preset templates, load the first one
    if (scene.presetTemplates && scene.presetTemplates.length > 0) {
      cycleTemplateIdx.current = 0;
      const templateIdx = scene.presetTemplates[0];
      const presets = next.customPresets || templatePresets;
      const template = presets[templateIdx];
      if (template) {
        settings = buildRendererSettings(
          { ...scene, settings: { ...defaultSettings, ...template.settings } },
          next,
        );
      } else {
        settings = buildRendererSettings(scene, next);
      }
    } else {
      settings = buildRendererSettings(scene, next);
    }

    if (transition) {
      rendererRef.current?.transitionToSettings(settings);
    } else {
      rendererRef.current?.updateSettings(settings);
    }

    // Start preset cycling if applicable
    startPresetCycling(next);

    // Music: enable/disable per scene
    const music = musicRef.current;
    if (music && !soundMutedRef.current) {
      if (scene.soundEnabled) {
        const anyEnabled = Object.values(scene.musicInstruments).some(v => v);
        if (anyEnabled) {
          if (!music.isPlaying) await music.start();
          else music.fadeIn(2);
          music.setInstrumentEnabled('pling', scene.musicInstruments.pling);
          music.setInstrumentEnabled('mid1', scene.musicInstruments.mid1);
          music.setInstrumentEnabled('mid2', scene.musicInstruments.mid2);
          music.setInstrumentEnabled('pad', scene.musicInstruments.pad);
        } else {
          music.fadeOut(2);
        }
      } else {
        music.fadeOut(2);
      }
    } else if (music) {
      music.fadeOut(0.5);
    }
  }, [autoSave, startPresetCycling]);

  const updateAppState = useCallback((updater: (prev: AppState) => AppState) => {
    setAppState(prev => {
      const next = updater(prev);
      autoSave(next);
      const scene = next.scenes[next.activePreset];
      const presets = next.customPresets || templatePresets;
      const tIdx = activeTemplateRef.current ?? scene.presetTemplates?.[0];
      const template = tIdx != null ? presets[tIdx] : null;
      const merged = template
        ? { ...scene, settings: { ...defaultSettings, ...template.settings } }
        : scene;
      const settings = buildRendererSettings(merged, next);
      rendererRef.current?.updateSettings(settings);

      // Update media maps
      const intensityMap: Record<string, number> = {};
      const contrastMap: Record<string, number> = {};
      const invertMap: Record<string, boolean> = {};
      for (const [src, ov] of Object.entries(next.mediaOverrides)) {
        intensityMap[src] = ov.intensity;
        contrastMap[src] = ov.contrast ?? 0;
        invertMap[src] = ov.invert ?? false;
      }
      rendererRef.current?.media.setIntensityMap(intensityMap);
      rendererRef.current?.media.setContrastMap(contrastMap);
      rendererRef.current?.media.setInvertMap(invertMap);

      // Update music config
      const music = musicRef.current;
      if (music) {
        music.updateConfig(next.music);
        music.setInstrumentEnabled('pling', scene.musicInstruments.pling);
        music.setInstrumentEnabled('mid1', scene.musicInstruments.mid1);
        music.setInstrumentEnabled('mid2', scene.musicInstruments.mid2);
        music.setInstrumentEnabled('pad', scene.musicInstruments.pad);
        if (!soundMutedRef.current && scene.soundEnabled) {
          const anyEnabled = Object.values(scene.musicInstruments).some(v => v);
          if (anyEnabled && !music.isPlaying) {
            music.start();
          } else if (anyEnabled && music.isPlaying) {
            music.fadeIn(0.5);
          } else if (!anyEnabled && music.isPlaying) {
            music.fadeOut(2);
          }
        }
      }

      return next;
    });
  }, [autoSave]);

  const toggleAudio = useCallback(async () => {
    const r = rendererRef.current;
    if (!r) return;
    if (r.audio.active) {
      r.audio.stop();
      setAudioActive(false);
    } else {
      const ok = await r.audio.start();
      setAudioActive(ok);
    }
  }, []);

  const toggleSoundMute = useCallback(() => {
    const music = musicRef.current;
    if (!music) return;
    setSoundMuted(prev => {
      const newMuted = !prev;
      if (newMuted) {
        music.fadeOut(2);
      } else {
        const state = appStateRef.current;
        const scene = state.scenes[state.activePreset];
        if (scene.soundEnabled) {
          const anyEnabled = Object.values(scene.musicInstruments).some(v => v);
          if (anyEnabled) {
            if (!music.isPlaying) {
              music.start(2).then(() => {
                music.setInstrumentEnabled('pling', scene.musicInstruments.pling);
                music.setInstrumentEnabled('mid1', scene.musicInstruments.mid1);
                music.setInstrumentEnabled('mid2', scene.musicInstruments.mid2);
                music.setInstrumentEnabled('pad', scene.musicInstruments.pad);
              });
            } else {
              music.fadeIn(2);
            }
          }
        }
      }
      return newMuted;
    });
  }, []);

  const handleFirstInteraction = useCallback(() => {
    const renderer = rendererRef.current;
    const music = musicRef.current;
    if (!renderer) return;

    if (renderer.introMode) {
      renderer.exitIntro();
      setInIntro(false);
      // Start music if scene 1 has sound enabled
      const state = appStateRef.current;
      const scene = state.scenes[state.activePreset];
      if (music && scene.soundEnabled) {
        const anyEnabled = Object.values(scene.musicInstruments).some(v => v);
        if (anyEnabled) {
          music.start(3).then(() => {
            music.setInstrumentEnabled('pling', scene.musicInstruments.pling);
            music.setInstrumentEnabled('mid1', scene.musicInstruments.mid1);
            music.setInstrumentEnabled('mid2', scene.musicInstruments.mid2);
            music.setInstrumentEnabled('pad', scene.musicInstruments.pad);
          });
        }
      }
      // Start cycling if applicable
      startPresetCycling(state);
    }
  }, [startPresetCycling]);

  // Init
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let state = loadAppState();
    appStateRef.current = state;

    const hydrateFrame = window.requestAnimationFrame(() => {
      setAppState(state);
    });

    const mergeTemplate = (s: AppState) => {
      const scene = s.scenes[s.activePreset];
      const presets = s.customPresets || templatePresets;
      const tIdx = scene.presetTemplates?.[0];
      const t = tIdx != null ? presets[tIdx] : null;
      return t ? { ...scene, settings: { ...defaultSettings, ...t.settings } } : scene;
    };

    syncWithServer(state).then(synced => {
      state = synced;
      appStateRef.current = state;
      setAppState(state);
      const settings = buildRendererSettings(mergeTemplate(state), state);
      rendererRef.current?.updateSettings(settings);
    });

    const settings = buildRendererSettings(mergeTemplate(state), state);
    const renderer = new CirclesRenderer(canvas, settings);
    rendererRef.current = renderer;

    // Set media maps from saved overrides
    const intensityMap: Record<string, number> = {};
    const contrastMap: Record<string, number> = {};
    const invertMap: Record<string, boolean> = {};
    for (const [src, ov] of Object.entries(state.mediaOverrides)) {
      intensityMap[src] = ov.intensity;
      contrastMap[src] = ov.contrast ?? 0;
      invertMap[src] = ov.invert ?? false;
    }
    renderer.media.setIntensityMap(intensityMap);
    renderer.media.setContrastMap(contrastMap);
    renderer.media.setInvertMap(invertMap);

    renderer.start();

    // Music engine
    const music = new MusicEngine(state.music);
    musicRef.current = music;

    // Pump music reactions into renderer
    const musicPump = setInterval(() => {
      if (!music.isPlaying) return;
      const swirls = music.getSwirlImpulses();
      if (swirls.length > 0) renderer.addSwirlImpulses(swirls);
      renderer.setMusicSizePulse(music.getSizePulse());
      const notePulses = music.getNotePulses();
      for (const np of notePulses) renderer.triggerNotePulse(np.count, np.strength);
    }, 16);

    // Load media (filter hidden)
    fetch('/api/media', { cache: 'no-store' })
      .then(r => r.json())
      .then((items: MediaItem[]) => {
        const hidden = state.hiddenMedia || [];
        const merged = items
          .filter((item: MediaItem) => !hidden.includes(item.src))
          .map((item: MediaItem) => {
            const ov = getMediaOverride(state, item.src);
            return { ...item, playMode: ov.playMode, invert: ov.invert };
          });
        renderer.media.setItems(merged);
        setMediaItems(merged);
      })
      .catch(() => {});

    const handleResize = () => renderer.resize();
    window.addEventListener('resize', handleResize);

    const mediaIndexPoll = setInterval(() => {
      setActiveMediaIndex(renderer.media.activeIndex);
    }, 200);

    return () => {
      window.cancelAnimationFrame(hydrateFrame);
      window.removeEventListener('resize', handleResize);
      clearInterval(mediaIndexPoll);
      clearInterval(musicPump);
      clearTimeout(cycleTimer.current);
      renderer.stop();
      music.destroy();
    };
  }, []);

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      // First interaction exits intro
      if (rendererRef.current?.introMode) {
        handleFirstInteraction();
        // Don't process other keys during intro exit
        if (e.key !== 'h' && e.key !== 'H' && e.key !== 'f' && e.key !== 'F') return;
      }

      switch (e.key) {
        case 'f': case 'F':
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen();
          break;
        case 'Escape':
          if (document.fullscreenElement) document.exitFullscreen();
          break;
        case 'h': case 'H':
          setPanelVisible(v => !v);
          break;
        case ' ':
          e.preventDefault();
          rendererRef.current?.toggleFade();
          break;
        case 'm': case 'M':
          rendererRef.current?.triggerMedia();
          break;
        case 's': case 'S':
          toggleSoundMute();
          break;
        case '1': case '2': case '3': {
          const idx = parseInt(e.key) - 1;
          applyPreset(idx, appStateRef.current);
          break;
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [applyPreset, handleFirstInteraction]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full"
        style={{ display: 'block', touchAction: 'none' }}
        onPointerDown={(e) => {
          // First click exits intro
          if (rendererRef.current?.introMode) {
            handleFirstInteraction();
            return;
          }
          pointerStartRef.current = { x: e.clientX, y: e.clientY };
          rendererRef.current?.setCursor(e.clientX, e.clientY, true);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0 && !rendererRef.current?.introMode) {
            rendererRef.current?.setCursor(e.clientX, e.clientY, true);
          }
        }}
        onPointerUp={() => rendererRef.current?.setCursor(0, 0, false)}
        onPointerLeave={() => rendererRef.current?.setCursor(0, 0, false)}
      />

      {/* Music panel (left, only in setup mode) */}
      <MusicPanel
        visible={panelVisible && mode === 'setup'}
        appState={appState}
        editingPreset={editingPreset}
        onUpdate={updateAppState}
      />

      {/* Setup panel (right) */}
      <SetupPanel
        visible={panelVisible}
        mode={mode}
        onSetMode={setMode}
        onClose={() => setPanelVisible(false)}
        appState={appState}
        editingPreset={editingPreset}
        onSetEditingPreset={(idx) => {
          setEditingPreset(idx);
          applyPreset(idx, appState);
        }}
        onUpdate={updateAppState}
        onApplyPreset={(idx) => applyPreset(idx, appState)}
        audioActive={audioActive}
        onToggleAudio={toggleAudio}
        onTriggerMedia={() => rendererRef.current?.triggerMedia()}
        onTriggerMediaByIndex={(idx) => rendererRef.current?.triggerMediaByIndex(idx)}
        onRemoveMedia={(idx) => {
          const removed = mediaItems[idx];
          const updated = mediaItems.filter((_, i) => i !== idx);
          setMediaItems(updated);
          rendererRef.current?.media.setItems(updated);
          if (removed) {
            // Track hidden media in state for persistence
            updateAppState(prev => ({
              ...prev,
              hiddenMedia: [...(prev.hiddenMedia || []), removed.src],
            }));
            // Also try filesystem delete for local dev
            fetch('/api/media', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ src: removed.src }),
            }).catch(() => {});
          }
        }}
        onUpdateMediaItem={(idx, item) => {
          const updated = [...mediaItems];
          updated[idx] = item;
          setMediaItems(updated);
          rendererRef.current?.media.setItems(updated);
          updateAppState(prev => {
            const next = { ...prev, mediaOverrides: { ...prev.mediaOverrides } };
            const existing = getMediaOverride(prev, item.src);
            next.mediaOverrides[item.src] = {
              playMode: item.playMode,
              invert: item.invert,
              intensity: existing.intensity,
              contrast: existing.contrast ?? 0,
            };
            return next;
          });
        }}
        mediaItems={mediaItems}
        activeMediaIndex={activeMediaIndex}
        soundMuted={soundMuted}
        onToggleSound={toggleSoundMute}
        onActiveTemplateChange={(idx) => { activeTemplateRef.current = idx; }}
      />

      {/* Settings button (only when panel hidden and not in intro) */}
      {!panelVisible && !inIntro && (
        <button
          onClick={() => setPanelVisible(true)}
          className="fixed top-4 right-4 z-40 w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-white/15 sm:bg-white/10 hover:bg-white/20 flex items-center justify-center transition-opacity sm:opacity-0 sm:hover:opacity-100 cursor-pointer"
          title="Settings (H)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
      )}
    </>
  );
}
