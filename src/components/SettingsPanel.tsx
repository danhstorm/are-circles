'use client';

import { Settings, MediaItem } from '@/types';
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
    <div className="flex flex-col gap-2 rounded-xl" style={{ padding: '1rem 1.25rem', background: 'rgba(255,255,255,0.05)' }}>
      <span className="text-xs uppercase tracking-widest font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>{title}</span>
      {children}
    </div>
  );
}

export default function SettingsPanel({ settings, onChange, visible, onClose, audioActive, onToggleAudio, onTriggerMedia, onTriggerMediaByIndex, onRemoveMedia, onUpdateMediaItem, mediaItems, activePreset, onApplyPreset, onSavePreset }: Props) {
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
      className={`fixed top-2 right-2 bottom-2 w-[520px] max-w-[calc(100vw-1rem)] z-50 transition-all duration-300 sm:top-6 sm:right-6 sm:bottom-6 ${
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8 pointer-events-none'
      }`}
    >
      <div className="h-full rounded-2xl bg-black/50 backdrop-blur-xl border border-white/10 overflow-y-auto shadow-2xl">
        <div className="flex flex-col gap-6" style={{ padding: '2rem' }}>
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
          <Section title="Presets (1-5)">
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
                onClick={onSavePreset}
                className="w-full mt-2 px-4 py-2 text-sm rounded-lg bg-white/15 hover:bg-white/25 text-white/90 border border-white/20 transition-colors cursor-pointer"
              >
                Save to &quot;{presets[activePreset]?.name}&quot;
              </button>
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

          {/* Noise */}
          <Section title="Noise Pattern">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <Slider label="Strength" value={settings.noiseStrength} min={0} max={2} step={0.05} onChange={(v) => set('noiseStrength', v)} />
              <Slider label="Size" value={settings.noiseScale} min={0.02} max={1} step={0.02} onChange={(v) => set('noiseScale', v)} />
              <Slider label="Speed" value={settings.noiseSpeed} min={0} max={2} step={0.05} onChange={(v) => set('noiseSpeed', v)} />
            </div>
          </Section>

          {/* Wave */}
          <Section title="Wave Pattern">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <Slider label="Strength" value={settings.waveStrength} min={0} max={2} step={0.05} onChange={(v) => set('waveStrength', v)} />
              <Slider label="Size" value={settings.waveFrequency} min={0.02} max={1} step={0.02} onChange={(v) => set('waveFrequency', v)} />
              <Slider label="Speed" value={settings.waveSpeed} min={0.05} max={2} step={0.05} onChange={(v) => set('waveSpeed', v)} />
            </div>
            <div className="flex items-center gap-4 px-1 pt-1">
              <span className="text-sm text-white/80">Direction</span>
              <DirectionPicker value={settings.waveDirection} onChange={(v) => set('waveDirection', v)} />
              <span className="text-xs text-white/40 tabular-nums">{Math.round((settings.waveDirection * 180) / Math.PI)}deg</span>
            </div>
          </Section>

          {/* Circles */}
          <Section title="Circles">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {!settings.useGrid && (
                <Slider label="Count" value={settings.circleCount} min={20} max={500} step={1} onChange={(v) => set('circleCount', v)} />
              )}
              <Slider label="Min Size" value={settings.minSize} min={1} max={settings.maxSize} step={1} onChange={(v) => {
                const s = { ...settings, minSize: v };
                if (v > settings.maxSize) s.maxSize = v;
                onChange(s);
              }} />
              <Slider label="Max Size" value={settings.maxSize} min={settings.minSize} max={300} step={1} onChange={(v) => {
                const s = { ...settings, maxSize: v };
                if (v < settings.minSize) s.minSize = v;
                onChange(s);
              }} />
              <Slider label="Opacity Min" value={settings.opacityMin} min={0.05} max={settings.opacityMax} step={0.05} onChange={(v) => {
                const s = { ...settings, opacityMin: v };
                if (v > settings.opacityMax) s.opacityMax = v;
                onChange(s);
              }} />
              <Slider label="Opacity Max" value={settings.opacityMax} min={settings.opacityMin} max={1} step={0.05} onChange={(v) => {
                const s = { ...settings, opacityMax: v };
                if (v < settings.opacityMin) s.opacityMin = v;
                onChange(s);
              }} />
              <Slider label="Speed" value={settings.animationSpeed} min={0.05} max={2} step={0.05} onChange={(v) => set('animationSpeed', v)} />
            </div>
          </Section>

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
                <Slider label="Columns" value={settings.gridColumns} min={5} max={100} step={1} onChange={(v) => set('gridColumns', v)} />
              </div>
            )}
          </Section>

          {/* Depth & Blur */}
          <Section title="Depth & Blur">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <Slider label="Blur Min" value={settings.blurMin} min={0} max={settings.blurMax} step={0.05} onChange={(v) => {
                const s = { ...settings, blurMin: v };
                if (v > settings.blurMax) s.blurMax = v;
                onChange(s);
              }} />
              <Slider label="Blur Max" value={settings.blurMax} min={settings.blurMin} max={1} step={0.05} onChange={(v) => {
                const s = { ...settings, blurMax: v };
                if (v < settings.blurMin) s.blurMin = v;
                onChange(s);
              }} />
              <Slider label="Depth of Field" value={settings.depthOfField} min={0} max={1} step={0.05} onChange={(v) => set('depthOfField', v)} />
            </div>
          </Section>

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
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <Slider label="Interval Min (s)" value={settings.imageIntervalMin} min={5} max={60} step={1} onChange={(v) => set('imageIntervalMin', v)} />
              <Slider label="Interval Max (s)" value={settings.imageIntervalMax} min={10} max={120} step={1} onChange={(v) => set('imageIntervalMax', v)} />
              <Slider label="Fade (s)" value={settings.imageFadeDuration} min={0.5} max={8} step={0.5} onChange={(v) => set('imageFadeDuration', v)} />
              <Slider label="Intensity" value={settings.imageIntensity} min={0} max={1.5} step={0.05} onChange={(v) => set('imageIntensity', v)} />
            </div>
            {mediaItems.length > 0 && (
              <div className="grid grid-cols-4 gap-2 pt-2">
                {mediaItems.map((item, i) => {
                  const name = (item.src.split('/').pop() || '').replace(/\.[^.]+$/, '');
                  return (
                    <div key={item.src} className="relative group flex flex-col">
                      <button
                        onClick={() => onTriggerMediaByIndex(i)}
                        className="w-full aspect-square rounded-lg overflow-hidden bg-black/40 border border-white/10 hover:border-white/30 transition-colors cursor-pointer"
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
                      <button
                        onClick={() => onRemoveMedia(i)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/80 hover:bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Remove"
                      >
                        &times;
                      </button>
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

          {/* Colors */}
          <Section title="Colors">
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
          </Section>

          {/* Fade */}
          <Section title="Global Fade">
            <Slider label="Fade Duration (s)" value={settings.fadeDuration} min={0.5} max={8} step={0.5} onChange={(v) => set('fadeDuration', v)} />
            <span className="text-xs text-white/30">Press SPACE to fade in/out</span>
          </Section>
        </div>
      </div>
    </div>
  );
}
