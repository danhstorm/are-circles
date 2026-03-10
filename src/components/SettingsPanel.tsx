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

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 py-2 px-1">
      <div className="flex justify-between text-sm">
        <span className="text-white/80">{label}</span>
        <span className="text-white/50 tabular-nums">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 cursor-pointer"
      />
    </div>
  );
}

function RangeSlider({
  label,
  low,
  high,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  low: number;
  high: number;
  min: number;
  max: number;
  step: number;
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
      if (thumb === 'low') {
        onChange(Math.min(val, high), high);
      } else {
        onChange(low, Math.max(val, low));
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="flex flex-col gap-1.5 py-2 px-1 col-span-2">
      <div className="flex justify-between text-sm">
        <span className="text-white/80">{label}</span>
        <span className="text-white/50 tabular-nums">{low.toFixed(decimals)} – {high.toFixed(decimals)}</span>
      </div>
      <div ref={trackRef} className="relative h-5 flex items-center">
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-white/10" />
        <div
          className="absolute h-1.5 rounded-full bg-white/25"
          style={{ left: `${leftPct}%`, right: `${rightPct}%` }}
        />
        <div
          className="absolute w-3.5 h-3.5 rounded-full bg-white/80 -translate-x-1/2 cursor-grab active:cursor-grabbing touch-none"
          style={{ left: `${leftPct}%` }}
          onPointerDown={startDrag('low')}
        />
        <div
          className="absolute w-3.5 h-3.5 rounded-full bg-white/80 -translate-x-1/2 cursor-grab active:cursor-grabbing touch-none"
          style={{ left: `${100 - rightPct}%` }}
          onPointerDown={startDrag('high')}
        />
      </div>
    </div>
  );
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-white/80">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl" style={{ padding: '1rem 1.25rem', background: 'rgba(255,255,255,0.03)' }}>
      <span className="text-xs uppercase tracking-widest font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>{title}</span>
      {children}
    </div>
  );
}

export default function SettingsPanel({ settings, onChange, visible, onClose, audioActive, onToggleAudio, onTriggerMedia, onTriggerMediaByIndex, onRemoveMedia, onUpdateMediaItem, mediaItems, activeMediaIndex, activePreset, onApplyPreset, onSavePreset }: Props) {
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [colorsOpen, setColorsOpen] = useState(false);

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
    <div
      className={`fixed z-50 transition-all duration-300
        top-0 right-0 bottom-0 w-full
        sm:top-6 sm:right-6 sm:bottom-6 sm:w-[520px] sm:max-w-[calc(100vw-3rem)]
        ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8 pointer-events-none'}`}
    >
      <div className="h-full sm:rounded-2xl bg-black/30 backdrop-blur-xl border-l sm:border border-white/8 overflow-y-auto shadow-2xl">
        <div className="flex flex-col gap-6 p-5 sm:p-8">
          {/* Header */}
          <div className="flex justify-between items-center">
            <h2 className="text-white text-base font-medium tracking-wide uppercase">Settings</h2>
            <div className="flex items-center gap-3">
              <span className="text-white/30 text-sm hidden sm:inline">H to toggle</span>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 cursor-pointer"
                aria-label="Close"
              >
                &times;
              </button>
            </div>
          </div>

          {/* Presets */}
          <Section title="Presets (1-9)">
            <div className="grid grid-cols-3 gap-2">
              {presets.map((p, i) => (
                <button
                  key={p.name}
                  onClick={() => onApplyPreset(i)}
                  className={`px-3 py-2 text-sm rounded-lg transition-colors cursor-pointer ${
                    activePreset === i
                      ? 'bg-white/20 text-white border border-white/30'
                      : 'bg-white/8 hover:bg-white/15 text-white/80'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {activePreset !== null && (
              <button
                onClick={handleSave}
                className={`w-full mt-2 px-4 py-2 text-sm rounded-lg border transition-colors cursor-pointer ${
                  saved
                    ? 'bg-green-600/30 text-green-300 border-green-500/30'
                    : 'bg-white/15 hover:bg-white/25 text-white/90 border-white/20'
                }`}
              >
                {saved ? 'Saved!' : <>Save to &quot;{presets[activePreset]?.name}&quot;</>}
              </button>
            )}
            <Slider label="Transition Speed" value={settings.presetTransitionSpeed} min={0.02} max={1} step={0.02} onChange={(v) => set('presetTransitionSpeed', v)} />
            <label className="flex items-center gap-3 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={settings.autoPresetEnabled}
                onChange={(e) => set('autoPresetEnabled', e.target.checked)}
                className="accent-white/60 w-4 h-4"
              />
              <span className="text-sm text-white/80">Auto-cycle</span>
            </label>
            {settings.autoPresetEnabled && (
              <>
                <RangeSlider label="Interval (s)" low={settings.autoPresetIntervalMin} high={settings.autoPresetIntervalMax} min={5} max={120} step={1} onChange={(lo, hi) => onChange({ ...settings, autoPresetIntervalMin: lo, autoPresetIntervalMax: hi })} />
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {presets.map((p, i) => {
                    const included = settings.autoPresetInclude[i] ?? true;
                    return (
                      <button
                        key={p.name}
                        onClick={() => {
                          const arr = [...settings.autoPresetInclude];
                          while (arr.length <= i) arr.push(true);
                          arr[i] = !arr[i];
                          set('autoPresetInclude', arr);
                        }}
                        className={`px-2 py-1 text-[10px] rounded transition-colors cursor-pointer ${
                          included ? 'bg-white/15 text-white/80' : 'bg-white/5 text-white/30 line-through'
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </Section>

          {/* Audio */}
          <Section title="Audio">
            <button
              onClick={onToggleAudio}
              className={`px-4 py-2 text-sm rounded-lg transition-colors cursor-pointer ${
                audioActive ? 'bg-green-600/30 text-green-300 border border-green-500/30' : 'bg-white/8 text-white/60'
              }`}
            >
              {audioActive ? 'Mic Active' : 'Enable Mic'}
            </button>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <Slider label="Mic Gain" value={settings.micGain} min={0} max={3} step={0.1} onChange={(v) => set('micGain', v)} />
              <Slider label="Sensitivity" value={settings.soundSensitivity} min={0} max={3} step={0.05} onChange={(v) => set('soundSensitivity', v)} />
              <Slider label="Smoothing" value={settings.soundSmoothing} min={0.8} max={0.99} step={0.01} onChange={(v) => set('soundSmoothing', v)} />
              <Slider label="Burst Decay" value={settings.soundBurstDecay} min={0.8} max={0.99} step={0.01} onChange={(v) => set('soundBurstDecay', v)} />
            </div>
          </Section>

          {/* Drift */}
          <Section title="Random Drift">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <Slider label="Strength" value={settings.driftStrength} min={0} max={60} step={1} onChange={(v) => set('driftStrength', v)} />
              <Slider label="Speed" value={settings.driftSpeed} min={0.01} max={1} step={0.01} onChange={(v) => set('driftSpeed', v)} />
            </div>
          </Section>

          {/* Noise & Wave side by side */}
          <div className="grid grid-cols-2 gap-3">
            <Section title="Noise">
              <Slider label="Strength" value={settings.noiseStrength} min={0} max={2} step={0.05} onChange={(v) => set('noiseStrength', v)} />
              <Slider label="Size" value={settings.noiseScale} min={0.02} max={1} step={0.02} onChange={(v) => set('noiseScale', v)} />
              <Slider label="Speed" value={settings.noiseSpeed} min={0} max={2} step={0.05} onChange={(v) => set('noiseSpeed', v)} />
            </Section>
            <Section title="Wave">
              <Slider label="Strength" value={settings.waveStrength} min={0} max={2} step={0.05} onChange={(v) => set('waveStrength', v)} />
              <Slider label="Size" value={settings.waveFrequency} min={0.02} max={1} step={0.02} onChange={(v) => set('waveFrequency', v)} />
              <Slider label="Speed" value={settings.waveSpeed} min={0.05} max={2} step={0.05} onChange={(v) => set('waveSpeed', v)} />
              <div className="flex items-center gap-3 px-1 pt-1">
                <span className="text-sm text-white/80">Dir</span>
                <DirectionPicker value={settings.waveDirection} onChange={(v) => set('waveDirection', v)} />
                <span className="text-xs text-white/40 tabular-nums">{Math.round((settings.waveDirection * 180) / Math.PI)}°</span>
              </div>
            </Section>
          </div>

          {/* Circles & Depth side by side */}
          <div className="grid grid-cols-2 gap-3">
            <Section title="Circles">
              {!settings.useGrid && (
                <Slider label="Count" value={settings.circleCount} min={20} max={500} step={1} onChange={(v) => set('circleCount', v)} />
              )}
              <RangeSlider label="Size" low={settings.minSize} high={settings.maxSize} min={1} max={300} step={1} onChange={(lo, hi) => onChange({ ...settings, minSize: lo, maxSize: hi })} />
              {(settings.useGrid || settings.mediaAutoGrid) && (
                <RangeSlider label="Circle size when in grid" low={settings.gridMinSize} high={settings.gridMaxSize} min={1} max={300} step={1} onChange={(lo, hi) => onChange({ ...settings, gridMinSize: lo, gridMaxSize: hi })} />
              )}
              <RangeSlider label="Opacity" low={settings.opacityMin} high={settings.opacityMax} min={0.05} max={1} step={0.05} onChange={(lo, hi) => onChange({ ...settings, opacityMin: lo, opacityMax: hi })} />
              <Slider label="Speed" value={settings.animationSpeed} min={0.05} max={2} step={0.05} onChange={(v) => set('animationSpeed', v)} />
            </Section>
            <Section title="Depth & Blur">
              <RangeSlider label="Blur" low={settings.blurMin} high={settings.blurMax} min={0} max={1} step={0.05} onChange={(lo, hi) => onChange({ ...settings, blurMin: lo, blurMax: hi })} />
              <Slider label="Depth of Field" value={settings.depthOfField} min={0} max={1} step={0.05} onChange={(v) => set('depthOfField', v)} />
              <Slider label="Blur %" value={settings.blurPercent} min={0} max={1} step={0.05} onChange={(v) => set('blurPercent', v)} />
            </Section>
          </div>

          {/* Layout */}
          <Section title="Layout">
            <label className="flex items-center gap-3 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={settings.useGrid}
                onChange={(e) => set('useGrid', e.target.checked)}
                className="accent-white/60 w-4 h-4"
              />
              <span className="text-sm text-white/80">Grid Mode</span>
            </label>
            {settings.useGrid && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <Slider label="Grid Blend" value={settings.floatGridBlend} min={0} max={1} step={0.05} onChange={(v) => set('floatGridBlend', v)} />
                <Slider label="Columns" value={settings.gridColumns} min={5} max={200} step={1} onChange={(v) => set('gridColumns', v)} />
              </div>
            )}
          </Section>

          {/* Gravity Shape (only for non-grid) */}
          {!settings.useGrid && <Section title="Gravity Shape">
            <div className="grid grid-cols-4 gap-2">
              {(['none', 'circle', 'oval', 'drop'] as GravityShape[]).map((shape) => (
                <button
                  key={shape}
                  onClick={() => set('gravityShape', shape)}
                  className={`px-3 py-2 text-sm rounded-lg transition-colors cursor-pointer capitalize ${
                    settings.gravityShape === shape
                      ? 'bg-white/20 text-white border border-white/30'
                      : 'bg-white/8 hover:bg-white/15 text-white/80'
                  }`}
                >
                  {shape}
                </button>
              ))}
            </div>
            {settings.gravityShape !== 'none' && (
              <Slider label="Strength" value={settings.gravityStrength} min={0.05} max={2} step={0.05} onChange={(v) => set('gravityStrength', v)} />
            )}
          </Section>}

          {/* Media */}
          <Section title="Media Morphing">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.mediaEnabled}
                  onChange={(e) => set('mediaEnabled', e.target.checked)}
                  className="accent-white/60 w-4 h-4"
                />
                <span className="text-sm text-white/80">Enabled</span>
              </label>
              <button
                onClick={onTriggerMedia}
                className="px-3 py-1.5 text-sm rounded-lg bg-white/8 hover:bg-white/15 text-white/80 transition-colors cursor-pointer"
              >
                Trigger Random (M)
              </button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={settings.mediaAutoGrid}
                onChange={(e) => set('mediaAutoGrid', e.target.checked)}
                className="accent-white/60 w-4 h-4"
              />
              <span className="text-sm text-white/80">Form grid on trigger</span>
            </label>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <RangeSlider label="Interval (s)" low={settings.imageIntervalMin} high={settings.imageIntervalMax} min={5} max={120} step={1} onChange={(lo, hi) => onChange({ ...settings, imageIntervalMin: lo, imageIntervalMax: hi })} />
              <Slider label="Fade (s)" value={settings.imageFadeDuration} min={0.5} max={8} step={0.5} onChange={(v) => set('imageFadeDuration', v)} />
              <Slider label="Intensity" value={settings.imageIntensity} min={0} max={1.5} step={0.05} onChange={(v) => set('imageIntensity', v)} />
              {settings.mediaAutoGrid && (
                <Slider label="Grid Columns" value={settings.mediaGridColumns} min={10} max={200} step={1} onChange={(v) => set('mediaGridColumns', v)} />
              )}
            </div>
            {mediaItems.length > 0 && (
              <div className="grid grid-cols-4 gap-2 pt-2">
                {mediaItems.map((item, i) => {
                  const name = (item.src.split('/').pop() || '').replace(/\.[^.]+$/, '');
                  return (
                    <div key={item.src} className="relative group flex flex-col">
                      <button
                        onClick={() => onTriggerMediaByIndex(i)}
                        className={`w-full aspect-square rounded-lg overflow-hidden bg-black/40 border transition-colors cursor-pointer ${activeMediaIndex === i ? 'border-white/60 ring-1 ring-white/40' : 'border-white/10 hover:border-white/30'}`}
                        title={name}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.src.replace(/\.[^.]+$/, '.jpg').replace('/media/', '/media/thumbs/')}
                          alt={name}
                          loading="lazy"
                          className={`w-full h-full object-cover grayscale brightness-150 contrast-125 ${item.invert ? 'invert' : ''}`}
                        />
                      </button>
                      {confirmDelete === i ? (
                        <button
                          onClick={() => {
                            setConfirmDelete(null);
                            clearTimeout(confirmTimer.current);
                            onRemoveMedia(i);
                          }}
                          className="absolute -top-1.5 -right-1.5 px-1.5 h-5 rounded-full bg-red-600 hover:bg-red-500 text-white text-[9px] font-medium flex items-center justify-center transition-opacity cursor-pointer z-10"
                        >
                          Delete
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setConfirmDelete(i);
                            clearTimeout(confirmTimer.current);
                            confirmTimer.current = setTimeout(() => setConfirmDelete(null), 3000);
                          }}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/80 hover:bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Remove"
                        >
                          &times;
                        </button>
                      )}
                      <div className="flex items-center gap-1 mt-0.5">
                        <button
                          onClick={() => onUpdateMediaItem(i, { ...item, playMode: item.playMode === 'loop' ? 'pingpong' : 'loop' })}
                          className="text-[9px] px-1 rounded bg-white/8 hover:bg-white/15 text-white/50 cursor-pointer"
                          title={item.playMode === 'loop' ? 'Loop' : 'Ping-pong'}
                        >
                          {item.playMode === 'loop' ? '↻' : '↔'}
                        </button>
                        <button
                          onClick={() => onUpdateMediaItem(i, { ...item, invert: !item.invert })}
                          className={`text-[9px] px-1 rounded cursor-pointer ${item.invert ? 'bg-white/20 text-white/80' : 'bg-white/8 hover:bg-white/15 text-white/50'}`}
                          title="Invert brightness"
                        >
                          inv
                        </button>
                      </div>
                      <span className="block text-[9px] text-white/40 truncate px-0.5">{name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Colors (collapsible) */}
          <div className="flex flex-col gap-2 rounded-xl" style={{ padding: '1rem 1.25rem', background: 'rgba(255,255,255,0.03)' }}>
            <button
              onClick={() => setColorsOpen(!colorsOpen)}
              className="flex justify-between items-center cursor-pointer"
            >
              <span className="text-xs uppercase tracking-widest font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>Colors</span>
              <span className="text-white/30 text-xs">{colorsOpen ? '▾' : '▸'}</span>
            </button>
            {colorsOpen && (
              <>
                <ColorPicker label="Background" value={settings.backgroundColor} onChange={(v) => set('backgroundColor', v)} />
                <div className="flex gap-2 items-center py-1">
                  <span className="text-sm text-white/80">Palette</span>
                  {settings.paletteColors.map((c, i) => (
                    <input
                      key={i}
                      type="color"
                      value={c}
                      onChange={(e) => setPaletteColor(i, e.target.value)}
                      className="w-8 h-8 rounded-lg border-0 cursor-pointer bg-transparent"
                    />
                  ))}
                </div>
                <Slider label="Hue Variation" value={settings.hueVariation} min={0} max={60} step={1} onChange={(v) => set('hueVariation', v)} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
