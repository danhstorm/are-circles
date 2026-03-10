'use client';

import { useRef, useState, useEffect } from 'react';
import { Settings, MediaItem, GravityShape } from '@/types';
import { presets } from '@/lib/presets';
import DirectionPicker from './DirectionPicker';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  visible: boolean;
  onClose: () => void;
  audioActive: boolean;
  onToggleAudio: () => void;
  onTriggerMedia: () => void;
  onTriggerMediaByIndex: (idx: number) => void;
  onRemoveMedia: (idx: number) => void;
  onUpdateMediaItem: (idx: number, item: MediaItem) => void;
  mediaItems: MediaItem[];
  activeMediaIndex: number;
  activePreset: number | null;
  onApplyPreset: (idx: number) => void;
  onSavePreset: () => void;
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

export default function SettingsPanel({ settings, onChange, visible, onClose, audioActive, onToggleAudio, onTriggerMedia, onTriggerMediaByIndex, onRemoveMedia, onUpdateMediaItem, mediaItems, activeMediaIndex, activePreset, onApplyPreset, onSavePreset }: Props) {
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);

  useEffect(() => () => { clearTimeout(savedTimer.current); clearTimeout(confirmTimer.current); }, []);

  const handleSave = () => {
    onSavePreset();
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1500);
  };

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  const setPaletteColor = (idx: number, color: string) => {
    const colors = [...settings.paletteColors];
    colors[idx] = color;
    onChange({ ...settings, paletteColors: colors });
  };

  return (
    <div className={`fixed z-50 transition-all duration-300
      top-0 right-0 bottom-0 w-full
      sm:top-4 sm:right-4 sm:bottom-4 sm:w-[420px] sm:max-w-[calc(100vw-2rem)]
      ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8 pointer-events-none'}`}>
      <div className="h-full sm:rounded-2xl bg-black/35 backdrop-blur-2xl border-l sm:border border-white/8 overflow-y-scroll">
        <div className="flex flex-col gap-3 p-6 sm:p-7">

          {/* Header */}
          <div className="flex justify-between items-center pb-1 pt-1">
            <h2 className="text-white/90 text-xs font-medium tracking-[0.2em] uppercase">Settings</h2>
            <div className="flex items-center gap-2">
              <span className="text-white/20 text-[10px] hidden sm:inline">H</span>
              <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center text-white/50 text-sm cursor-pointer" aria-label="Close">&times;</button>
            </div>
          </div>

          {/* ─── PRESETS ─── */}
          <Section title="Presets">
            <div className="grid grid-cols-3 gap-1.5">
              {presets.map((p, i) => (
                <button key={p.name} onClick={() => onApplyPreset(i)}
                  className={`px-2 py-1.5 text-[11px] rounded-md transition-colors cursor-pointer truncate ${
                    activePreset === i ? 'bg-white/20 text-white border border-white/25' : 'bg-white/6 hover:bg-white/12 text-white/70'
                  }`}><span className="text-white/30 mr-0.5">{i + 1}</span> {p.name}</button>
              ))}
            </div>
            {activePreset !== null && (
              <div className="flex items-center gap-2 mt-1">
                <button onClick={handleSave}
                  className={`px-3 py-1.5 text-[11px] rounded-md border transition-colors cursor-pointer ${
                    saved ? 'bg-green-600/25 text-green-300 border-green-500/25' : 'bg-white/10 hover:bg-white/18 text-white/80 border-white/15'
                  }`}>{saved ? 'Saved!' : <>Save to &quot;{presets[activePreset]?.name}&quot;</>}</button>
              </div>
            )}
            <Slider label="Transition Speed" value={settings.presetTransitionSpeed} min={0.02} max={1} step={0.02} onChange={(v) => set('presetTransitionSpeed', v)} />
            <label className="flex items-center gap-2 cursor-pointer py-0.5">
              <input type="checkbox" checked={settings.autoPresetEnabled} onChange={(e) => set('autoPresetEnabled', e.target.checked)} className="accent-white/60 w-3.5 h-3.5" />
              <span className="text-[11px] text-white/60">Auto-cycle</span>
            </label>
            {settings.autoPresetEnabled && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1">
                <div>
                  <RangeSlider label="Cycle interval (s)" low={settings.autoPresetIntervalMin} high={settings.autoPresetIntervalMax} min={5} max={120} step={1} onChange={(lo, hi) => onChange({ ...settings, autoPresetIntervalMin: lo, autoPresetIntervalMax: hi })} />
                </div>
                <div>
                  <span className="text-[10px] text-white/30 uppercase tracking-wider">Include in cycle</span>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {presets.map((p, i) => {
                      const on = settings.autoPresetInclude[i] ?? true;
                      return (
                        <button key={p.name} onClick={() => {
                          const arr = [...settings.autoPresetInclude]; while (arr.length <= i) arr.push(true); arr[i] = !arr[i]; set('autoPresetInclude', arr);
                        }} className={`px-1.5 py-0.5 text-[9px] rounded-sm transition-colors cursor-pointer border ${
                          on ? 'border-white/15 bg-transparent text-white/60' : 'border-white/5 bg-transparent text-white/20 line-through'
                        }`}>{p.name}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </Section>

          {/* ─── PATTERN ─── */}
          <div className="grid grid-cols-2 gap-2">
            <Section title="Noise">
              <Slider label="Strength" value={settings.noiseStrength} min={0} max={2} step={0.05} onChange={(v) => set('noiseStrength', v)} />
              <Slider label="Size" value={settings.noiseScale} min={0.02} max={1} step={0.02} onChange={(v) => set('noiseScale', v)} />
              <Slider label="Speed" value={settings.noiseSpeed} min={0} max={2} step={0.05} onChange={(v) => set('noiseSpeed', v)} />
            </Section>
            <Section title="Wave">
              <Slider label="Strength" value={settings.waveStrength} min={0} max={2} step={0.05} onChange={(v) => set('waveStrength', v)} />
              <Slider label="Size" value={settings.waveFrequency} min={0.02} max={1} step={0.02} onChange={(v) => set('waveFrequency', v)} />
              <Slider label="Speed" value={settings.waveSpeed} min={0.05} max={2} step={0.05} onChange={(v) => set('waveSpeed', v)} />
              <div className="flex items-center gap-2 pt-0.5">
                <span className="text-[11px] text-white/60">Dir</span>
                <DirectionPicker value={settings.waveDirection} onChange={(v) => set('waveDirection', v)} />
                <span className="text-[10px] text-white/30 tabular-nums">{Math.round((settings.waveDirection * 180) / Math.PI)}°</span>
              </div>
            </Section>
          </div>

          {/* ─── CIRCLES & DEPTH ─── */}
          <div className="grid grid-cols-2 gap-2">
            <Section title="Circles">
              {!settings.useGrid && (
                <Slider label="Count" value={settings.circleCount} min={20} max={500} step={1} onChange={(v) => set('circleCount', v)} />
              )}
              <Slider label="Speed" value={settings.animationSpeed} min={0.05} max={2} step={0.05} onChange={(v) => set('animationSpeed', v)} />
              <RangeSlider label="Size" low={settings.minSize} high={settings.maxSize} min={1} max={300} step={1} onChange={(lo, hi) => onChange({ ...settings, minSize: lo, maxSize: hi })} />
              <RangeSlider label="Opacity" low={settings.opacityMin} high={settings.opacityMax} min={0.05} max={1} step={0.05} onChange={(lo, hi) => onChange({ ...settings, opacityMin: lo, opacityMax: hi })} />

            </Section>
            <Section title="Depth & Blur">
              <Slider label="Depth of Field" value={settings.depthOfField} min={0} max={1} step={0.05} onChange={(v) => set('depthOfField', v)} />
              <Slider label="Blur %" value={settings.blurPercent} min={0} max={1} step={0.05} onChange={(v) => set('blurPercent', v)} />
              <RangeSlider label="Blur range" low={settings.blurMin} high={settings.blurMax} min={0} max={1} step={0.05} onChange={(lo, hi) => onChange({ ...settings, blurMin: lo, blurMax: hi })} />
            </Section>
          </div>

          {/* ─── DRIFT & LAYOUT ─── */}
          <div className="grid grid-cols-2 gap-2">
            <Section title="Drift">
              <Slider label="Strength" value={settings.driftStrength} min={0} max={60} step={1} onChange={(v) => set('driftStrength', v)} />
              <Slider label="Speed" value={settings.driftSpeed} min={0.01} max={1} step={0.01} onChange={(v) => set('driftSpeed', v)} />
            </Section>
            <Section title="Layout">
              <label className="flex items-center gap-2 cursor-pointer py-0.5">
                <input type="checkbox" checked={settings.useGrid} onChange={(e) => set('useGrid', e.target.checked)} className="accent-white/60 w-3.5 h-3.5" />
                <span className="text-[11px] text-white/60">Grid Mode</span>
              </label>
              {settings.useGrid && (
                <>
                  <Slider label="Blend" value={settings.floatGridBlend} min={0} max={1} step={0.05} onChange={(v) => set('floatGridBlend', v)} />
                  <Slider label="Columns" value={settings.gridColumns} min={5} max={200} step={1} onChange={(v) => set('gridColumns', v)} />
                </>
              )}
            </Section>
          </div>

          {/* ─── FOCUS AREA (non-grid only) ─── */}
          {!settings.useGrid && (
            <Section title="Focus Area">
              <div className="flex gap-1.5">
                {(['none', 'circle', 'oval', 'drop'] as GravityShape[]).map((shape) => (
                  <button key={shape} onClick={() => set('gravityShape', shape)}
                    className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors cursor-pointer capitalize ${
                      settings.gravityShape === shape ? 'bg-white/18 text-white border border-white/25' : 'bg-white/6 hover:bg-white/12 text-white/60'
                    }`}>{shape}</button>
                ))}
              </div>
              {settings.gravityShape !== 'none' && (
                <Slider label="Strength" value={settings.gravityStrength} min={0.05} max={2} step={0.05} onChange={(v) => set('gravityStrength', v)} />
              )}
            </Section>
          )}

          {/* ─── MEDIA ─── */}
          <Section title="Media">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={settings.mediaEnabled} onChange={(e) => set('mediaEnabled', e.target.checked)} className="accent-white/60 w-3.5 h-3.5" />
                <span className="text-[11px] text-white/60">Enabled</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={settings.mediaAutoGrid} onChange={(e) => set('mediaAutoGrid', e.target.checked)} className="accent-white/60 w-3.5 h-3.5" />
                <span className="text-[11px] text-white/60">Grid on trigger</span>
              </label>
              <button onClick={onTriggerMedia} className="ml-auto px-2 py-1 text-[10px] rounded-md bg-white/8 hover:bg-white/15 text-white/60 transition-colors cursor-pointer">Random (M)</button>
            </div>
            <div className="grid grid-cols-2 gap-x-4">
              <RangeSlider label="Interval (s)" low={settings.imageIntervalMin} high={settings.imageIntervalMax} min={5} max={120} step={1} onChange={(lo, hi) => onChange({ ...settings, imageIntervalMin: lo, imageIntervalMax: hi })} />
            </div>
            <div className="grid grid-cols-2 gap-x-4">
              <Slider label="Fade (s)" value={settings.imageFadeDuration} min={0.5} max={8} step={0.5} onChange={(v) => set('imageFadeDuration', v)} />
              <Slider label="Intensity" value={settings.imageIntensity} min={0} max={1.5} step={0.05} onChange={(v) => set('imageIntensity', v)} />
            </div>
            {settings.mediaAutoGrid && (
              <>
                <Slider label="Grid Columns" value={settings.mediaGridColumns} min={10} max={200} step={1} onChange={(v) => set('mediaGridColumns', v)} />
                <RangeSlider label="Animation size" low={settings.gridMinSize} high={settings.gridMaxSize} min={1} max={300} step={1} onChange={(lo, hi) => onChange({ ...settings, gridMinSize: lo, gridMaxSize: hi })} />
              </>
            )}
            {mediaItems.length > 0 && (
              <div className="grid grid-cols-5 gap-1.5 pt-1">
                {mediaItems.map((item, i) => {
                  const name = (item.src.split('/').pop() || '').replace(/\.[^.]+$/, '');
                  return (
                    <div key={item.src} className="relative group flex flex-col">
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
                      <div className="flex gap-0.5 mt-0.5">
                        <button onClick={() => onUpdateMediaItem(i, { ...item, playMode: item.playMode === 'loop' ? 'pingpong' : 'loop' })}
                          className="text-[8px] px-0.5 rounded bg-white/6 hover:bg-white/12 text-white/40 cursor-pointer" title={item.playMode === 'loop' ? 'Loop' : 'Ping-pong'}>{item.playMode === 'loop' ? '↻' : '↔'}</button>
                        <button onClick={() => onUpdateMediaItem(i, { ...item, invert: !item.invert })}
                          className={`text-[8px] px-0.5 rounded cursor-pointer ${item.invert ? 'bg-white/15 text-white/70' : 'bg-white/6 hover:bg-white/12 text-white/40'}`} title="Invert">inv</button>
                      </div>
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
              <Slider label="Gain" value={settings.micGain} min={0} max={3} step={0.1} onChange={(v) => set('micGain', v)} />
              <Slider label="Sensitivity" value={settings.soundSensitivity} min={0} max={3} step={0.05} onChange={(v) => set('soundSensitivity', v)} />
              <Slider label="Smoothing" value={settings.soundSmoothing} min={0.8} max={0.99} step={0.01} onChange={(v) => set('soundSmoothing', v)} />
              <Slider label="Burst Decay" value={settings.soundBurstDecay} min={0.8} max={0.99} step={0.01} onChange={(v) => set('soundBurstDecay', v)} />
            </div>
          </Section>

          {/* ─── COLORS (collapsible) ─── */}
          <Section title="Colors" collapsed={!colorsOpen} onToggle={() => setColorsOpen(!colorsOpen)}>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-white/60">BG</span>
              <input type="color" value={settings.backgroundColor} onChange={(e) => set('backgroundColor', e.target.value)} className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent" />
              <span className="text-[11px] text-white/60 ml-2">Palette</span>
              {settings.paletteColors.map((c, i) => (
                <input key={i} type="color" value={c} onChange={(e) => setPaletteColor(i, e.target.value)} className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent" />
              ))}
            </div>
            <Slider label="Hue Variation" value={settings.hueVariation} min={0} max={60} step={1} onChange={(v) => set('hueVariation', v)} />
          </Section>

        </div>
      </div>
    </div>
  );
}
