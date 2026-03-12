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
  const [synthsVisible, setSynthsVisible] = useState(false);
  const [mode, setMode] = useState<'live' | 'setup'>('live');
  const [audioActive, setAudioActive] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [activeMediaIndex, setActiveMediaIndex] = useState(-1);
  const [editingPreset, setEditingPreset] = useState(0);
  const [playingTemplate, setPlayingTemplate] = useState<number | null>(null);
  const [inIntro, setInIntro] = useState(true);
  const [soundMuted, setSoundMuted] = useState(() => defaultAppState.soundMuted);

  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const serverSaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cycleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cycleTemplateIdx = useRef(0);
  const audioUnlocked = useRef(false);
  const modeRef = useRef<'live' | 'setup'>(mode);
  const isDev = process.env.NODE_ENV === 'development';

  const autoSave = useCallback((state: AppState) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveAppState(state), 200);
    // In dev, also persist to settings.json so it's always in sync for commits
    if (isDev) {
      clearTimeout(serverSaveTimer.current);
      serverSaveTimer.current = setTimeout(() => {
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state),
        }).then(r => r.json()).then(({ version }) => {
          if (version) {
            appStateRef.current = { ...appStateRef.current, version };
            saveAppState(appStateRef.current);
          }
        }).catch(() => {});
      }, 2000);
    }
  }, [isDev]);

  const appStateRef = useRef(appState);
  const soundMutedRef = useRef(soundMuted);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  useEffect(() => {
    soundMutedRef.current = soundMuted;
  }, [soundMuted]);

  useEffect(() => {
    modeRef.current = mode;
    if (mode === 'setup') {
      // Stop auto-cycling when entering setup mode
      clearTimeout(cycleTimer.current);
    } else {
      // Resume cycling when going back to live mode
      startPresetCycling(appStateRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const startPresetCycling = useCallback((state: AppState) => {
    clearTimeout(cycleTimer.current);
    // Don't start cycling in setup mode
    if (modeRef.current === 'setup') return;
    const scene = state.scenes[state.activePreset];
    if (!scene.presetTemplates || scene.presetTemplates.length < 2 || scene.cycleIntervalMin <= 0) return;

    const randomInterval = (s: { cycleIntervalMin: number; cycleIntervalMax: number }) => {
      const lo = s.cycleIntervalMin;
      const hi = Math.max(lo, s.cycleIntervalMax);
      return (lo + Math.random() * (hi - lo)) * 1000;
    };

    const cycle = () => {
      // Skip cycle tick if in setup mode
      if (modeRef.current === 'setup') return;

      const currentState = appStateRef.current;
      const currentScene = currentState.scenes[currentState.activePreset];
      if (!currentScene.presetTemplates || currentScene.presetTemplates.length < 2) return;

      // Reset index if out of bounds (presets may have been toggled off)
      if (cycleTemplateIdx.current >= currentScene.presetTemplates.length) {
        cycleTemplateIdx.current = 0;
      }
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
        setPlayingTemplate(templateIdx);
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
    setPlayingTemplate(firstTemplate);

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

    // Music: always sync instruments to current scene, then start/stop as needed
    const music = musicRef.current;
    if (music) {
      music.setInstrumentEnabled('pling', scene.musicInstruments.pling);
      music.setInstrumentEnabled('mid1', scene.musicInstruments.mid1);
      music.setInstrumentEnabled('mid2', scene.musicInstruments.mid2);
      music.setInstrumentEnabled('pad', scene.musicInstruments.pad);

      const anyEnabled = Object.values(scene.musicInstruments).some(v => v);
      const shouldPlay = !soundMutedRef.current && anyEnabled;

      if (shouldPlay && audioUnlocked.current) {
        if (!music.isPlaying) await music.start();
        else music.fadeIn(2);
      } else if (music.isPlaying) {
        music.fadeOut(2);
      }
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
      if (next.transitionTiming) {
        rendererRef.current!.transitionTiming = next.transitionTiming;
      }

      // Update media maps
      const intensityMap: Record<string, number> = {};
      const contrastMap: Record<string, number> = {};
      const invertMap: Record<string, boolean> = {};
      const zoomToFitMap: Record<string, boolean> = {};
      for (const [src, ov] of Object.entries(next.mediaOverrides)) {
        intensityMap[src] = ov.intensity;
        contrastMap[src] = ov.contrast ?? 0;
        invertMap[src] = ov.invert ?? false;
        zoomToFitMap[src] = ov.zoomToFit ?? false;
      }
      rendererRef.current?.media.setIntensityMap(intensityMap);
      rendererRef.current?.media.setContrastMap(contrastMap);
      rendererRef.current?.media.setInvertMap(invertMap);
      rendererRef.current?.media.setZoomToFitMap(zoomToFitMap);

      // Update music config
      const music = musicRef.current;
      if (music) {
        music.updateConfig(next.music);
        const anyEnabled = Object.values(scene.musicInstruments).some(v => v);
        const shouldPlay = !soundMutedRef.current && anyEnabled;

        music.setInstrumentEnabled('pling', scene.musicInstruments.pling);
        music.setInstrumentEnabled('mid1', scene.musicInstruments.mid1);
        music.setInstrumentEnabled('mid2', scene.musicInstruments.mid2);
        music.setInstrumentEnabled('pad', scene.musicInstruments.pad);

        if (shouldPlay && !music.isPlaying && audioUnlocked.current) {
          music.start();
        } else if (shouldPlay && music.isPlaying) {
          music.fadeIn(0.5);
        } else if (!shouldPlay && music.isPlaying) {
          music.fadeOut(2);
        }
      }

      // Restart cycling in case presetTemplates changed
      startPresetCycling(next);

      return next;
    });
  }, [autoSave, startPresetCycling]);

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
        // Always sync instruments to current scene when unmuting
        music.setInstrumentEnabled('pling', scene.musicInstruments.pling);
        music.setInstrumentEnabled('mid1', scene.musicInstruments.mid1);
        music.setInstrumentEnabled('mid2', scene.musicInstruments.mid2);
        music.setInstrumentEnabled('pad', scene.musicInstruments.pad);

        const anyEnabled = Object.values(scene.musicInstruments).some(v => v);
        if (scene.soundEnabled && anyEnabled) {
          if (!music.isPlaying) {
            music.start(2);
          } else {
            music.fadeIn(2);
          }
        }
      }
      // Persist mute state
      const state = appStateRef.current;
      const next = { ...state, soundMuted: newMuted };
      appStateRef.current = next;
      setAppState(next);
      autoSave(next);
      return newMuted;
    });
  }, [autoSave]);

  const handleFirstInteraction = useCallback(() => {
    const renderer = rendererRef.current;
    const music = musicRef.current;
    if (!renderer) return;

    if (renderer.introMode) {
      renderer.exitIntro();
      setInIntro(false);
      audioUnlocked.current = true;
      const state = appStateRef.current;
      const scene = state.scenes[state.activePreset];
      if (music && !soundMutedRef.current && scene.soundEnabled) {
        // Set instruments BEFORE start so scheduler uses correct state from beat 0
        music.setInstrumentEnabled('pling', scene.musicInstruments.pling);
        music.setInstrumentEnabled('mid1', scene.musicInstruments.mid1);
        music.setInstrumentEnabled('mid2', scene.musicInstruments.mid2);
        music.setInstrumentEnabled('pad', scene.musicInstruments.pad);
        const anyEnabled = Object.values(scene.musicInstruments).some(v => v);
        if (anyEnabled) {
          music.start(3);
        }
      }
      startPresetCycling(state);
    }
  }, [startPresetCycling]);

  // Init
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let state = loadAppState();
    // Always start on scene 1 (Presentation)
    state = { ...state, activePreset: 0 };
    appStateRef.current = state;
    setSoundMuted(state.soundMuted ?? false);
    soundMutedRef.current = state.soundMuted ?? false;

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
      state = { ...synced, activePreset: 0 };
      appStateRef.current = state;
      setSoundMuted(state.soundMuted ?? false);
      soundMutedRef.current = state.soundMuted ?? false;
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
    const zoomToFitMap: Record<string, boolean> = {};
    for (const [src, ov] of Object.entries(state.mediaOverrides)) {
      intensityMap[src] = ov.intensity;
      contrastMap[src] = ov.contrast ?? 0;
      invertMap[src] = ov.invert ?? false;
      zoomToFitMap[src] = ov.zoomToFit ?? false;
    }
    renderer.media.setIntensityMap(intensityMap);
    renderer.media.setContrastMap(contrastMap);
    renderer.media.setInvertMap(invertMap);
    renderer.media.setZoomToFitMap(zoomToFitMap);
    if (state.transitionTiming) {
      renderer.transitionTiming = state.transitionTiming;
    }

    renderer.start();

    // Music engine
    const music = new MusicEngine(state.music);
    musicRef.current = music;

    // Pump music reactions into renderer
    const musicPump = setInterval(() => {
      const currentState = appStateRef.current;
      const scene = currentState.scenes[currentState.activePreset];
      const soundActive = !soundMutedRef.current && scene.soundEnabled
        && Object.values(scene.musicInstruments).some(v => v);

      if (!music.isPlaying || !soundActive) {
        // Drain queues so stale impulses don't build up
        music.getSwirlImpulses();
        music.getNotePulses();
        renderer.setMusicSizePulse(0);
        return;
      }
      const swirls = music.getSwirlImpulses();
      if (swirls.length > 0) renderer.addSwirlImpulses(swirls);
      renderer.setMusicSizePulse(music.getSizePulse());
      const notePulses = music.getNotePulses();
      for (const np of notePulses) renderer.triggerNotePulse(np.count, np.strength);
    }, 16);

    // Load media from static manifest (works on Vercel + local)
    fetch('/media-manifest.json', { cache: 'no-store' })
      .then(r => r.json())
      .then((items: MediaItem[]) => {
        const hidden = state.hiddenMedia || [];
        const order = state.mediaOrder || [];
        const merged = items
          .filter((item: MediaItem) => !hidden.includes(item.src))
          .map((item: MediaItem) => {
            const ov = getMediaOverride(state, item.src);
            return { ...item, playMode: ov.playMode, invert: ov.invert };
          });
        // Sort by saved order; items not in order go to the end
        merged.sort((a, b) => {
          const ai = order.indexOf(a.src);
          const bi = order.indexOf(b.src);
          if (ai === -1 && bi === -1) return 0;
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
        renderer.media.setItems(merged);
        setMediaItems(merged);
      })
      .catch(() => {});

    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => renderer.resize(), 100);
    };
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
        case 'g': case 'G':
          setSynthsVisible(v => !v);
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
        visible={synthsVisible || (panelVisible && mode === 'setup')}
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
              zoomToFit: existing.zoomToFit ?? false,
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
        playingTemplate={playingTemplate}
        onActiveTemplateChange={(idx) => {
          activeTemplateRef.current = idx;
          setPlayingTemplate(idx);
          // Push the new template's settings to the renderer with a smooth transition
          const state = appStateRef.current;
          const scene = state.scenes[state.activePreset];
          const presets = state.customPresets || templatePresets;
          const template = idx != null ? presets[idx] : null;
          const merged = template
            ? { ...scene, settings: { ...defaultSettings, ...template.settings } }
            : scene;
          const settings = buildRendererSettings(merged, state);
          rendererRef.current?.transitionToSettings(settings);
        }}
        onReorderMedia={(fromIdx, toIdx) => {
          const updated = [...mediaItems];
          const [moved] = updated.splice(fromIdx, 1);
          updated.splice(toIdx, 0, moved);
          setMediaItems(updated);
          rendererRef.current?.media.setItems(updated);
          updateAppState(prev => ({
            ...prev,
            mediaOrder: updated.map(m => m.src),
          }));
        }}
      />

      {/* Panel toggled via 'H' key only -- no visible button for live presentation */}
    </>
  );
}
