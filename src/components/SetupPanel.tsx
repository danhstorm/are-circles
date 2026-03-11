'use client';

import { useRef, useState, useEffect } from 'react';
import { Settings, AppState, MediaItem, GravityShape, LivePreset } from '@/types';
import { templatePresets } from '@/lib/presets';
import { getMediaOverride } from '@/lib/settings';
import DirectionPicker from './DirectionPicker';

interface Props {
  visible: boolean;
  mode: 'live' | 'setup';
  onSetMode: (m: 'live' | 'setup') => void;
  onClose: () => void;
  appState: AppState;
  editingPreset: number;
  onSetEditingPreset: (idx: number) => void;
  onUpdate: (updater: (prev: AppState) => AppState) => void;
  onApplyPreset: (idx: number) => void;
  audioActive: boolean;
  onToggleAudio: () => void;
  onTriggerMedia: () => void;
  onTriggerMediaByIndex: (idx: number) => void;
  onRemoveMedia: (idx: number) => void;
  onUpdateMediaItem: (idx: number, item: MediaItem) => void;
  mediaItems: MediaItem[];
  activeMediaIndex: number;
}

function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-white/60">{label}</span>
        <span className="text-white/40 tabular-nums">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-1 cursor-pointer" />
    </div>
  );
}

function RangeSlider({ label, low, high, min, max, step, onChange }: {
  label: string; low: number; high: number; min: number; max: number; step: number;
  onChange: (low: number, high: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frac = (v: number) => (v - min) / (max - min);
  const leftPct = frac(low) * 100;
  const rightPct = (1 - frac(high)) * 100;
  const snap = (v: number) => {
    const s = Math.round(v / step) * step;
    return Math.max(min, Math.min(max, parseFloat(s.toFixed(8))));
  };
  const decimals = step < 1 ? 2 : 0;
  const startDrag = (thumb: 'low' | 'high') => (e: React.PointerEvent) => {
    e.preventDefault();
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const val = snap(min + ratio * (max - min));
      if (thumb === 'low') onChange(Math.min(val, high), high);
      else onChange(low, Math.max(val, low));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-white/60">{label}</span>
        <span className="text-white/40 tabular-nums">{low.toFixed(decimals)} – {high.toFixed(decimals)}</span>
      </div>
      <div ref={trackRef} className="relative h-4 flex items-center">
        <div className="absolute inset-x-0 h-1 rounded-full bg-white/10" />
        <div className="absolute h-1 rounded-full bg-white/20" style={{ left: `${leftPct}%`, right: `${rightPct}%` }} />
        <div className="absolute w-3 h-3 rounded-full bg-white/70 -translate-x-1/2 cursor-grab active:cursor-grabbing touch-none"
          style={{ left: `${leftPct}%` }} onPointerDown={startDrag('low')} />
        <div className="absolute w-3 h-3 rounded-full bg-white/70 -translate-x-1/2 cursor-grab active:cursor-grabbing touch-none"
          style={{ left: `${100 - rightPct}%` }} onPointerDown={startDrag('high')} />
      </div>
    </div>
  );
}

function Section({ title, children, collapsed, onToggle }: {
  title: string; children: React.ReactNode; collapsed?: boolean; onToggle?: () => void;
}) {
  const isCollapsible = onToggle !== undefined;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg" style={{ padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)' }}>
      {isCollapsible ? (
        <button onClick={onToggle} className="flex justify-between items-center cursor-pointer">
          <span className="text-[10px] uppercase tracking-widest font-medium text-white/35">{title}</span>
          <span className="text-white/25 text-[10px]">{collapsed ? '▸' : '▾'}</span>
        </button>
      ) : (
        <span className="text-[10px] uppercase tracking-widest font-medium text-white/35">{title}</span>
      )}
      {(!isCollapsible || !collapsed) && children}
    </div>
  );
}

export default function SetupPanel({ visible, mode, onSetMode, onClose, appState, editingPreset, onSetEditingPreset, onUpdate, onApplyPreset, audioActive, onToggleAudio, onTriggerMedia, onTriggerMediaByIndex, onRemoveMedia, onUpdateMediaItem, mediaItems, activeMediaIndex }: Props) {
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);

  useEffect(() => () => { clearTimeout(confirmTimer.current); }, []);

  const preset = appState.livePresets[editingPreset];
  const ps = preset.settings;

  const setPresetSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onUpdate(prev => {
      const presets = [...prev.livePresets] as AppState['livePresets'];
      presets[editingPreset] = {
        ...presets[editingPreset],
        settings: { ...presets[editingPreset].settings, [key]: value },
      };
      return { ...prev, livePresets: presets };
    });
  };

  const setPresetSettings = (partial: Partial<Settings>) => {
    onUpdate(prev => {
      const presets = [...prev.livePresets] as AppState['livePresets'];
      presets[editingPreset] = {
        ...presets[editingPreset],
        settings: { ...presets[editingPreset].settings, ...partial },
      };
      return { ...prev, livePresets: presets };
    });
  };

  const setPresetMedia = (enabled: boolean) => {
    onUpdate(prev => {
      const presets = [...prev.livePresets] as AppState['livePresets'];
      presets[editingPreset] = { ...presets[editingPreset], mediaEnabled: enabled };
      return { ...prev, livePresets: presets };
    });
  };

  const setPresetName = (name: string) => {
    onUpdate(prev => {
      const presets = [...prev.livePresets] as AppState['livePresets'];
      presets[editingPreset] = { ...presets[editingPreset], name };
      return { ...prev, livePresets: presets };
    });
  };

  const setGlobal = (key: 'mediaGridColumns' | 'transitionSpeed', value: number) => {
    onUpdate(prev => ({ ...prev, [key]: value }));
  };

  const setColor = (key: string, value: string | string[] | number) => {
    onUpdate(prev => ({
      ...prev,
      globalColors: { ...prev.globalColors, [key]: value },
    }));
  };

  const setPaletteColor = (idx: number, color: string) => {
    const colors = [...appState.globalColors.paletteColors];
    colors[idx] = color;
    setColor('paletteColors', colors);
  };

  const loadTemplate = (idx: number) => {
    const t = templatePresets[idx];
    if (!t) return;
    setPresetSettings(t.settings);
    setTemplateOpen(false);
  };

  const setMediaIntensity = (src: string, intensity: number) => {
    onUpdate(prev => ({
      ...prev,
      mediaOverrides: {
        ...prev.mediaOverrides,
        [src]: { ...getMediaOverride(prev, src), intensity },
      },
    }));
  };

  return (
    <div className={`fixed z-50 transition-all duration-300
      top-0 right-0 bottom-0 w-full
      sm:top-4 sm:right-4 sm:bottom-4 sm:w-[420px] sm:max-w-[calc(100vw-2rem)]
      ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8 pointer-events-none'}`}>
      <div className="h-full sm:rounded-2xl bg-black/35 backdrop-blur-2xl border-l sm:border border-white/8 overflow-y-scroll">
        <div className="flex flex-col gap-3 p-6 sm:p-7">

          {/* Header with mode toggle */}
          <div className="flex justify-between items-center pb-1 pt-1">
            <div className="flex items-center gap-3">
              <button onClick={() => onSetMode('live')}
                className={`text-xs font-medium tracking-[0.15em] uppercase cursor-pointer transition-colors ${mode === 'live' ? 'text-white/90' : 'text-white/30 hover:text-white/50'}`}>Live</button>
              <button onClick={() => onSetMode('setup')}
                className={`text-xs font-medium tracking-[0.15em] uppercase cursor-pointer transition-colors ${mode === 'setup' ? 'text-white/90' : 'text-white/30 hover:text-white/50'}`}>Setup</button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/20 text-[10px] hidden sm:inline">H</span>
              <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center text-white/50 text-sm cursor-pointer" aria-label="Close">&times;</button>
            </div>
          </div>

          {mode === 'live' ? (
            /* ─── LIVE MODE ─── */
            <Section title="Live Presets">
              <div className="grid grid-cols-3 gap-1.5">
                {appState.livePresets.map((p, i) => (
                  <button key={i} onClick={() => onApplyPreset(i)}
                    className={`px-2 py-2 text-[12px] rounded-md transition-colors cursor-pointer ${
                      appState.activePreset === i ? 'bg-white/20 text-white border border-white/25' : 'bg-white/6 hover:bg-white/12 text-white/70'
                    }`}><span className="text-white/30 mr-0.5">{i + 1}</span> {p.name}</button>
                ))}
              </div>
              <Slider label="Transition Speed" value={appState.transitionSpeed} min={0.02} max={1} step={0.02} onChange={v => setGlobal('transitionSpeed', v)} />
            </Section>
          ) : (
            /* ─── SETUP MODE ─── */
            <>
              {/* Preset selector */}
              <Section title="Editing Preset">
                <div className="grid grid-cols-3 gap-1.5">
                  {appState.livePresets.map((p, i) => (
                    <button key={i} onClick={() => onSetEditingPreset(i)}
                      className={`px-2 py-2 text-[12px] rounded-md transition-colors cursor-pointer ${
                        editingPreset === i ? 'bg-white/20 text-white border border-white/25' : 'bg-white/6 hover:bg-white/12 text-white/70'
                      }`}><span className="text-white/30 mr-0.5">{i + 1}</span> {p.name}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-white/40">Name</span>
                  <input type="text" value={preset.name} onChange={e => setPresetName(e.target.value)}
                    className="flex-1 text-[11px] px-2 py-1 rounded bg-white/8 text-white/80 border border-white/10 outline-none" />
                </div>
                <div className="pt-1">
                  <button onClick={() => setTemplateOpen(!templateOpen)}
                    className="text-[10px] text-white/40 hover:text-white/60 cursor-pointer underline">
                    {templateOpen ? 'Hide templates' : 'Load from template...'}
                  </button>
                  {templateOpen && (
                    <div className="grid grid-cols-3 gap-1 pt-1">
                      {templatePresets.map((t, i) => (
                        <button key={t.name} onClick={() => loadTemplate(i)}
                          className="px-1.5 py-1 text-[10px] rounded-sm bg-white/6 hover:bg-white/12 text-white/50 cursor-pointer truncate">{t.name}</button>
                      ))}
                    </div>
                  )}
                </div>
                <Slider label="Transition Speed" value={appState.transitionSpeed} min={0.02} max={1} step={0.02} onChange={v => setGlobal('transitionSpeed', v)} />
              </Section>

              {/* ─── PATTERN ─── */}
              <div className="grid grid-cols-2 gap-2">
                <Section title="Noise">
                  <Slider label="Strength" value={ps.noiseStrength ?? 1} min={0} max={2} step={0.05} onChange={v => setPresetSetting('noiseStrength', v)} />
                  <Slider label="Size" value={ps.noiseScale ?? 0.3} min={0.02} max={1} step={0.02} onChange={v => setPresetSetting('noiseScale', v)} />
                  <Slider label="Speed" value={ps.noiseSpeed ?? 0.3} min={0} max={2} step={0.05} onChange={v => setPresetSetting('noiseSpeed', v)} />
                </Section>
                <Section title="Wave">
                  <Slider label="Strength" value={ps.waveStrength ?? 0} min={0} max={2} step={0.05} onChange={v => setPresetSetting('waveStrength', v)} />
                  <Slider label="Size" value={ps.waveFrequency ?? 0.3} min={0.02} max={1} step={0.02} onChange={v => setPresetSetting('waveFrequency', v)} />
                  <Slider label="Speed" value={ps.waveSpeed ?? 0.5} min={0.05} max={2} step={0.05} onChange={v => setPresetSetting('waveSpeed', v)} />
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="text-[11px] text-white/60">Dir</span>
                    <DirectionPicker value={ps.waveDirection ?? 0} onChange={v => setPresetSetting('waveDirection', v)} />
                    <span className="text-[10px] text-white/30 tabular-nums">{Math.round(((ps.waveDirection ?? 0) * 180) / Math.PI)}°</span>
                  </div>
                </Section>
              </div>

              {/* ─── CIRCLES & DEPTH ─── */}
              <div className="grid grid-cols-2 gap-2">
                <Section title="Circles">
                  {!ps.useGrid && (
                    <Slider label="Count" value={ps.circleCount ?? 200} min={20} max={500} step={1} onChange={v => setPresetSetting('circleCount', v)} />
                  )}
                  <Slider label="Speed" value={ps.animationSpeed ?? 0.5} min={0.05} max={2} step={0.05} onChange={v => setPresetSetting('animationSpeed', v)} />
                  <RangeSlider label="Size" low={ps.minSize ?? 4} high={ps.maxSize ?? 80} min={1} max={300} step={1}
                    onChange={(lo, hi) => setPresetSettings({ minSize: lo, maxSize: hi })} />
                  <RangeSlider label="Opacity" low={ps.opacityMin ?? 0.3} high={ps.opacityMax ?? 0.9} min={0.05} max={1} step={0.05}
                    onChange={(lo, hi) => setPresetSettings({ opacityMin: lo, opacityMax: hi })} />
                </Section>
                <Section title="Depth & Blur">
                  <Slider label="Depth of Field" value={ps.depthOfField ?? 0.5} min={0} max={1} step={0.05} onChange={v => setPresetSetting('depthOfField', v)} />
                  <Slider label="Blur %" value={ps.blurPercent ?? 0.5} min={0} max={1} step={0.05} onChange={v => setPresetSetting('blurPercent', v)} />
                  <RangeSlider label="Blur range" low={ps.blurMin ?? 0.1} high={ps.blurMax ?? 0.8} min={0} max={1} step={0.05}
                    onChange={(lo, hi) => setPresetSettings({ blurMin: lo, blurMax: hi })} />
                </Section>
              </div>

              {/* ─── DRIFT & LAYOUT ─── */}
              <div className="grid grid-cols-2 gap-2">
                <Section title="Drift">
                  <Slider label="Strength" value={ps.driftStrength ?? 15} min={0} max={60} step={1} onChange={v => setPresetSetting('driftStrength', v)} />
                  <Slider label="Speed" value={ps.driftSpeed ?? 0.3} min={0.01} max={1} step={0.01} onChange={v => setPresetSetting('driftSpeed', v)} />
                </Section>
                <Section title="Layout">
                  <label className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input type="checkbox" checked={ps.useGrid ?? false} onChange={e => setPresetSetting('useGrid', e.target.checked)} className="accent-white/60 w-3.5 h-3.5" />
                    <span className="text-[11px] text-white/60">Grid Mode</span>
                  </label>
                  {ps.useGrid && (
                    <>
                      <Slider label="Blend" value={ps.floatGridBlend ?? 0} min={0} max={1} step={0.05} onChange={v => setPresetSetting('floatGridBlend', v)} />
                      <Slider label="Columns" value={ps.gridColumns ?? 20} min={5} max={200} step={1} onChange={v => setPresetSetting('gridColumns', v)} />
                    </>
                  )}
                </Section>
              </div>

              {/* ─── FOCUS AREA ─── */}
              {!ps.useGrid && (
                <Section title="Focus Area">
                  <div className="flex gap-1.5">
                    {(['none', 'circle', 'oval', 'drop'] as GravityShape[]).map(shape => (
                      <button key={shape} onClick={() => setPresetSetting('gravityShape', shape)}
                        className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors cursor-pointer capitalize ${
                          (ps.gravityShape ?? 'none') === shape ? 'bg-white/18 text-white border border-white/25' : 'bg-white/6 hover:bg-white/12 text-white/60'
                        }`}>{shape}</button>
                    ))}
                  </div>
                  {(ps.gravityShape ?? 'none') !== 'none' && (
                    <Slider label="Strength" value={ps.gravityStrength ?? 0.3} min={0.05} max={2} step={0.05} onChange={v => setPresetSetting('gravityStrength', v)} />
                  )}
                </Section>
              )}

              {/* ─── MEDIA ─── */}
              <Section title="Media">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={preset.mediaEnabled} onChange={e => setPresetMedia(e.target.checked)} className="accent-white/60 w-3.5 h-3.5" />
                  <span className="text-[11px] text-white/60">Enabled</span>
                </label>
                <div className="grid grid-cols-2 gap-x-4">
                  <RangeSlider label="Interval (s)" low={ps.imageIntervalMin ?? 10} high={ps.imageIntervalMax ?? 30} min={5} max={120} step={1}
                    onChange={(lo, hi) => setPresetSettings({ imageIntervalMin: lo, imageIntervalMax: hi })} />
                </div>
                <Slider label="Fade (s)" value={ps.imageFadeDuration ?? 2.5} min={0.5} max={8} step={0.5} onChange={v => setPresetSetting('imageFadeDuration', v)} />
                <Slider label="Grid Columns" value={appState.mediaGridColumns} min={10} max={200} step={1} onChange={v => setGlobal('mediaGridColumns', v)} />
                {mediaItems.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {mediaItems.map((item, i) => {
                      const name = (item.src.split('/').pop() || '').replace(/\.[^.]+$/, '');
                      const ov = getMediaOverride(appState, item.src);
                      return (
                        <div key={item.src} className="relative group flex flex-col gap-1">
                          <button onClick={() => onTriggerMediaByIndex(i)}
                            className={`w-full aspect-square rounded overflow-hidden bg-black/30 border transition-colors cursor-pointer ${
                              activeMediaIndex === i ? 'border-white/50 ring-1 ring-white/30' : 'border-white/8 hover:border-white/25'}`}
                            title={name}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.src.replace(/\.[^.]+$/, '.jpg').replace('/media/', '/media/thumbs/')} alt={name} loading="lazy"
                              className={`w-full h-full object-cover grayscale brightness-150 contrast-125 ${item.invert ? 'invert' : ''}`} />
                          </button>
                          {confirmDelete === i ? (
                            <button onClick={() => { setConfirmDelete(null); clearTimeout(confirmTimer.current); onRemoveMedia(i); }}
                              className="absolute -top-1 -right-1 px-1 h-4 rounded-full bg-red-600 hover:bg-red-500 text-white text-[8px] font-medium flex items-center justify-center cursor-pointer z-10">Delete</button>
                          ) : (
                            <button onClick={() => { setConfirmDelete(i); clearTimeout(confirmTimer.current); confirmTimer.current = setTimeout(() => setConfirmDelete(null), 3000); }}
                              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500/70 hover:bg-red-500 text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" title="Remove">&times;</button>
                          )}
                          <div className="flex gap-0.5">
                            <button onClick={() => onUpdateMediaItem(i, { ...item, playMode: item.playMode === 'loop' ? 'pingpong' : 'loop' })}
                              className="text-[8px] px-0.5 rounded bg-white/6 hover:bg-white/12 text-white/40 cursor-pointer" title={item.playMode === 'loop' ? 'Loop' : 'Ping-pong'}>{item.playMode === 'loop' ? '↻' : '↔'}</button>
                            <button onClick={() => onUpdateMediaItem(i, { ...item, invert: !item.invert })}
                              className={`text-[8px] px-0.5 rounded cursor-pointer ${item.invert ? 'bg-white/15 text-white/70' : 'bg-white/6 hover:bg-white/12 text-white/40'}`} title="Invert">inv</button>
                          </div>
                          <Slider label="" value={ov.intensity} min={0} max={1.5} step={0.05}
                            onChange={v => setMediaIntensity(item.src, v)} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              {/* ─── AUDIO (collapsible) ─── */}
              <Section title="Audio" collapsed={!audioOpen} onToggle={() => setAudioOpen(!audioOpen)}>
                <button onClick={onToggleAudio}
                  className={`px-3 py-1.5 text-[11px] rounded-md transition-colors cursor-pointer ${
                    audioActive ? 'bg-green-600/25 text-green-300 border border-green-500/25' : 'bg-white/6 text-white/50'}`}>
                  {audioActive ? 'Mic Active' : 'Enable Mic'}</button>
                <div className="grid grid-cols-2 gap-x-4">
                  <Slider label="Gain" value={ps.micGain ?? 1} min={0} max={3} step={0.1} onChange={v => setPresetSetting('micGain', v)} />
                  <Slider label="Sensitivity" value={ps.soundSensitivity ?? 0.7} min={0} max={3} step={0.05} onChange={v => setPresetSetting('soundSensitivity', v)} />
                  <Slider label="Smoothing" value={ps.soundSmoothing ?? 0.95} min={0.8} max={0.99} step={0.01} onChange={v => setPresetSetting('soundSmoothing', v)} />
                  <Slider label="Burst Decay" value={ps.soundBurstDecay ?? 0.92} min={0.8} max={0.99} step={0.01} onChange={v => setPresetSetting('soundBurstDecay', v)} />
                </div>
              </Section>

              {/* ─── COLORS (collapsible, global) ─── */}
              <Section title="Colors (Global)" collapsed={!colorsOpen} onToggle={() => setColorsOpen(!colorsOpen)}>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-white/60">BG</span>
                  <input type="color" value={appState.globalColors.backgroundColor} onChange={e => setColor('backgroundColor', e.target.value)} className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent" />
                  <span className="text-[11px] text-white/60 ml-2">Palette</span>
                  {appState.globalColors.paletteColors.map((c, i) => (
                    <input key={i} type="color" value={c} onChange={e => setPaletteColor(i, e.target.value)} className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent" />
                  ))}
                </div>
                <Slider label="Hue Variation" value={appState.globalColors.hueVariation} min={0} max={60} step={1} onChange={v => setColor('hueVariation', v)} />
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
