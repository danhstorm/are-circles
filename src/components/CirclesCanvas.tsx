'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { CirclesRenderer } from '@/engine/renderer';
import { MusicEngine } from '@/engine/music';
import { AppState, MediaItem } from '@/types';
import { defaultAppState, defaultSettings, loadAppState, saveAppState, buildRendererSettings, syncWithServer, getMediaOverride, loadHiddenMedia } from '@/lib/settings';
import SetupPanel from './SetupPanel';
import MusicPanel from './MusicPanel';

export default function CirclesCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CirclesRenderer | null>(null);
  const musicRef = useRef<MusicEngine | null>(null);
  const dragRef = useRef(false);
  const pointerStartRef = useRef({ x: 0, y: 0 });

  const [appState, setAppState] = useState<AppState>(defaultAppState);
  const [panelVisible, setPanelVisible] = useState(false);
  const [mode, setMode] = useState<'live' | 'setup'>('live');
  const [audioActive, setAudioActive] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [activeMediaIndex, setActiveMediaIndex] = useState(-1);
  const [editingPreset, setEditingPreset] = useState(0);

  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const autoSave = useCallback((state: AppState) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveAppState(state), 200);
  }, []);

  const appStateRef = useRef(appState);
  appStateRef.current = appState;

  const applyPreset = useCallback(async (idx: number, state: AppState, transition = true) => {
    const next = { ...state, activePreset: idx };
    setAppState(next);
    autoSave(next);
    const settings = buildRendererSettings(next.livePresets[idx], next);
    if (transition) {
      rendererRef.current?.transitionToSettings(settings);
    } else {
      rendererRef.current?.updateSettings(settings);
    }

    // Music: enable/disable instruments per preset, fade in/out
    const music = musicRef.current;
    if (music) {
      const preset = next.livePresets[idx];
      const anyEnabled = Object.values(preset.musicInstruments).some(v => v);
      if (anyEnabled) {
        if (!music.isPlaying) await music.start();
        else music.fadeIn(2);
        music.setInstrumentEnabled('pling', preset.musicInstruments.pling);
        music.setInstrumentEnabled('mid1', preset.musicInstruments.mid1);
        music.setInstrumentEnabled('mid2', preset.musicInstruments.mid2);
        music.setInstrumentEnabled('pad', preset.musicInstruments.pad);
      } else {
        music.fadeOut(2);
      }
    }
  }, [autoSave]);

  const updateAppState = useCallback((updater: (prev: AppState) => AppState) => {
    setAppState(prev => {
      const next = updater(prev);
      autoSave(next);
      const settings = buildRendererSettings(next.livePresets[next.activePreset], next);
      rendererRef.current?.updateSettings(settings);

      // Update media intensity map
      const intensityMap: Record<string, number> = {};
      for (const [src, ov] of Object.entries(next.mediaOverrides)) {
        intensityMap[src] = ov.intensity;
      }
      rendererRef.current?.media.setIntensityMap(intensityMap);

      // Update music config
      musicRef.current?.updateConfig(next.music);

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

  // Init
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let state = loadAppState();

    syncWithServer(state).then(synced => {
      state = synced;
      setAppState(state);
      const settings = buildRendererSettings(state.livePresets[state.activePreset], state);
      rendererRef.current?.updateSettings(settings);
    });

    setAppState(state);

    const settings = buildRendererSettings(state.livePresets[state.activePreset], state);
    const renderer = new CirclesRenderer(canvas, settings);
    rendererRef.current = renderer;

    // Set intensity map from saved overrides
    const intensityMap: Record<string, number> = {};
    for (const [src, ov] of Object.entries(state.mediaOverrides)) {
      intensityMap[src] = ov.intensity;
    }
    renderer.media.setIntensityMap(intensityMap);

    renderer.start();

    // Music engine (deferred start on first user interaction for AudioContext)
    const music = new MusicEngine(state.music);
    musicRef.current = music;
    const startMusic = async () => {
      document.removeEventListener('pointerdown', startMusic);
      document.removeEventListener('keydown', startMusic);
      // Always init AudioContext on first gesture so it's ready
      await music.start();
      // Enable instruments from whatever preset is currently active
      const current = appStateRef.current;
      const preset = current.livePresets[current.activePreset];
      music.setInstrumentEnabled('pling', preset.musicInstruments.pling);
      music.setInstrumentEnabled('mid1', preset.musicInstruments.mid1);
      music.setInstrumentEnabled('mid2', preset.musicInstruments.mid2);
      music.setInstrumentEnabled('pad', preset.musicInstruments.pad);
      // If no instruments enabled, fade out but keep engine ready
      const anyEnabled = Object.values(preset.musicInstruments).some(v => v);
      if (!anyEnabled) music.fadeOut(0.1);
    };
    document.addEventListener('pointerdown', startMusic);
    document.addEventListener('keydown', startMusic);

    // Pump music reactions into renderer
    const musicPump = setInterval(() => {
      if (!music.isPlaying) return;
      const swirls = music.getSwirlImpulses();
      if (swirls.length > 0) renderer.addSwirlImpulses(swirls);
      renderer.setMusicSizePulse(music.getSizePulse());
    }, 16);

    // Load media
    fetch('/api/media', { cache: 'no-store' })
      .then(r => r.json())
      .then((items: MediaItem[]) => {
        const hidden = loadHiddenMedia();
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
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('pointerdown', startMusic);
      document.removeEventListener('keydown', startMusic);
      clearInterval(mediaIndexPoll);
      clearInterval(musicPump);
      renderer.stop();
      music.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case 'f': case 'F':
          document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
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
        case '1': case '2': case '3': {
          const idx = parseInt(e.key) - 1;
          applyPreset(idx, appStateRef.current);
          break;
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [applyPreset]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full"
        style={{ display: 'block', touchAction: 'none' }}
        onPointerDown={(e) => {
          pointerStartRef.current = { x: e.clientX, y: e.clientY };
          dragRef.current = false;
          rendererRef.current?.setCursor(e.clientX, e.clientY, true);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) {
            const dx = e.clientX - pointerStartRef.current.x;
            const dy = e.clientY - pointerStartRef.current.y;
            if (dx * dx + dy * dy > 25) dragRef.current = true;
            rendererRef.current?.setCursor(e.clientX, e.clientY, true);
          }
        }}
        onPointerUp={() => rendererRef.current?.setCursor(0, 0, false)}
        onPointerLeave={() => rendererRef.current?.setCursor(0, 0, false)}
      />

      {/* Music panel (left) */}
      <MusicPanel
        visible={panelVisible}
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
        onSetEditingPreset={setEditingPreset}
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
            next.mediaOverrides[item.src] = { playMode: item.playMode, invert: item.invert, intensity: getMediaOverride(prev, item.src).intensity };
            return next;
          });
        }}
        mediaItems={mediaItems}
        activeMediaIndex={activeMediaIndex}
      />

      {/* Settings button (only in live mode when panel hidden) */}
      {!panelVisible && (
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
