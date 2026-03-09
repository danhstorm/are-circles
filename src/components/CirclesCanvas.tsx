'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { CirclesRenderer } from '@/engine/renderer';
import { Settings, MediaItem } from '@/types';
import { defaultSettings, loadSettings, saveSettings, loadCustomPresets, loadRepoPresets, saveCustomPreset } from '@/lib/settings';
import { presets } from '@/lib/presets';
import SettingsPanel from './SettingsPanel';

export default function CirclesCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CirclesRenderer | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [panelVisible, setPanelVisible] = useState(false);
  const [audioActive, setAudioActive] = useState(false);
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [customPresets, setCustomPresets] = useState<(Partial<Omit<Settings, 'useGrid'>> | null)[]>([null, null, null, null, null]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [activeMediaIndex, setActiveMediaIndex] = useState(-1);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSettingsChange = useCallback((s: Settings) => {
    setSettings(s);
    // Keep preset active while editing -- user can save changes
    rendererRef.current?.updateSettings(s);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveSettings(s), 300);
  }, []);

  const handleApplyPreset = useCallback((idx: number) => {
    // Use custom override if saved, otherwise use default preset
    const custom = customPresets[idx];
    const base = presets[idx].settings;
    const presetSettings = custom || base;
    const newSettings = { ...settings, ...presetSettings };
    setSettings(newSettings);
    setActivePreset(idx);
    rendererRef.current?.updateSettings(newSettings);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveSettings(newSettings), 300);
  }, [settings, customPresets]);

  const handleSavePreset = useCallback(() => {
    if (activePreset === null) return;
    // Extract all settings except useGrid (global toggle)
    const { useGrid, ...rest } = settings;
    void useGrid;
    saveCustomPreset(activePreset, rest);
    const updated = [...customPresets];
    updated[activePreset] = rest;
    setCustomPresets(updated);
  }, [activePreset, settings, customPresets]);

  const toggleAudio = useCallback(async () => {
    const r = rendererRef.current;
    if (!r) return;
    if (r.audio.active) {
      r.audio.stop();
      setAudioActive(false);
    } else {
      const ok = await r.audio.start();
      setAudioActive(ok);
      if (ok) r.audio.setGain(settings.micGain);
    }
  }, [settings.micGain]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const saved = loadSettings();
    setSettings(saved);

    // Load presets: localStorage overrides > repo defaults > built-in
    const localPresets = loadCustomPresets();
    const hasLocal = localPresets.some(p => p !== null);
    if (hasLocal) {
      setCustomPresets(localPresets);
    } else {
      loadRepoPresets().then(repo => {
        const merged = loadCustomPresets(); // re-check in case user saved while loading
        const hasMerged = merged.some(p => p !== null);
        if (!hasMerged) setCustomPresets(repo);
      });
    }

    const renderer = new CirclesRenderer(canvas, saved);
    rendererRef.current = renderer;
    renderer.start();

    fetch('/api/media')
      .then((r) => r.json())
      .then((items: MediaItem[]) => {
        renderer.media.setItems(items);
        setMediaItems(items);
      })
      .catch(() => {});

    const handleResize = () => renderer.resize();
    window.addEventListener('resize', handleResize);

    // Poll active media index for UI highlight
    const mediaIndexPoll = setInterval(() => {
      setActiveMediaIndex(renderer.media.activeIndex);
    }, 200);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearInterval(mediaIndexPoll);
      renderer.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case 'f':
        case 'F':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            document.documentElement.requestFullscreen();
          }
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
          break;
        case 'h':
        case 'H':
          setPanelVisible((v) => !v);
          break;
        case ' ':
          e.preventDefault();
          rendererRef.current?.toggleFade();
          break;
        case 'm':
        case 'M':
          rendererRef.current?.triggerMedia();
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5': {
          const idx = parseInt(e.key) - 1;
          if (presets[idx]) {
            handleApplyPreset(idx);
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [settings, handleSettingsChange, handleApplyPreset]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full"
        style={{ display: 'block', touchAction: 'none' }}
        onClick={() => {
          if (!panelVisible) setPanelVisible(true);
        }}
      />
      <SettingsPanel
        settings={settings}
        onChange={handleSettingsChange}
        visible={panelVisible}
        onClose={() => setPanelVisible(false)}
        audioActive={audioActive}
        onToggleAudio={toggleAudio}
        onTriggerMedia={() => rendererRef.current?.triggerMedia()}
        onTriggerMediaByIndex={(idx) => rendererRef.current?.triggerMediaByIndex(idx)}
        onRemoveMedia={(idx) => {
          const updated = mediaItems.filter((_, i) => i !== idx);
          setMediaItems(updated);
          rendererRef.current?.media.setItems(updated);
        }}
        onUpdateMediaItem={(idx, item) => {
          const updated = [...mediaItems];
          updated[idx] = item;
          setMediaItems(updated);
          rendererRef.current?.media.setItems(updated);
        }}
        mediaItems={mediaItems}
        activeMediaIndex={activeMediaIndex}
        activePreset={activePreset}
        onApplyPreset={handleApplyPreset}
        onSavePreset={handleSavePreset}
      />
      {!panelVisible && (
        <button
          onClick={() => setPanelVisible(true)}
          className="fixed top-4 right-4 z-40 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-opacity opacity-0 hover:opacity-100 cursor-pointer"
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
