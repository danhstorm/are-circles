'use client';

import { Settings } from '@/types';
import { presets } from '@/lib/presets';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  visible: boolean;
  audioActive: boolean;
  onToggleAudio: () => void;
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
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-white/70">{label}</span>
        <span className="text-white/50 tabular-nums">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-white/60 h-1 cursor-pointer"
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
    <div className="flex items-center gap-2">
      <span className="text-xs text-white/70">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent"
      />
    </div>
  );
}

export default function SettingsPanel({ settings, onChange, visible, audioActive, onToggleAudio }: Props) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  const setPaletteColor = (idx: number, color: string) => {
    const colors = [...settings.paletteColors];
    colors[idx] = color;
    onChange({ ...settings, paletteColors: colors });
  };

  const applyPreset = (idx: number) => {
    const p = presets[idx];
    onChange({ ...settings, ...p.settings });
  };

  return (
    <div
      className={`fixed top-0 right-0 h-full w-80 bg-black/80 backdrop-blur-md border-l border-white/10 z-50 overflow-y-auto transition-transform duration-300 ${
        visible ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="p-4 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-white text-sm font-medium tracking-wide uppercase">Settings</h2>
          <span className="text-white/30 text-xs">H to toggle</span>
        </div>

        {/* Presets */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-white/50 uppercase tracking-wider">Presets (1-5)</span>
          <div className="grid grid-cols-3 gap-1.5">
            {presets.map((p, i) => (
              <button
                key={p.name}
                onClick={() => applyPreset(i)}
                className="px-2 py-1.5 text-xs rounded bg-white/10 hover:bg-white/20 text-white/80 transition-colors cursor-pointer"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Audio */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-white/50 uppercase tracking-wider">Audio</span>
          <button
            onClick={onToggleAudio}
            className={`px-3 py-1.5 text-xs rounded transition-colors cursor-pointer ${
              audioActive ? 'bg-green-600/40 text-green-300' : 'bg-white/10 text-white/60'
            }`}
          >
            {audioActive ? 'Mic Active' : 'Enable Mic'}
          </button>
          <Slider label="Mic Gain" value={settings.micGain} min={0} max={3} step={0.1} onChange={(v) => set('micGain', v)} />
          <Slider label="Sensitivity" value={settings.soundSensitivity} min={0} max={2} step={0.05} onChange={(v) => set('soundSensitivity', v)} />
          <Slider label="Smoothing (release)" value={settings.soundSmoothing} min={0.8} max={0.99} step={0.01} onChange={(v) => set('soundSmoothing', v)} />
        </div>

        {/* Circles */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-white/50 uppercase tracking-wider">Circles</span>
          <Slider label="Count" value={settings.circleCount} min={20} max={500} step={1} onChange={(v) => set('circleCount', v)} />
          <Slider label="Min Size" value={settings.minSize} min={1} max={40} step={1} onChange={(v) => set('minSize', v)} />
          <Slider label="Max Size" value={settings.maxSize} min={20} max={200} step={1} onChange={(v) => set('maxSize', v)} />
          <Slider label="Opacity Min" value={settings.opacityMin} min={0.05} max={0.8} step={0.05} onChange={(v) => set('opacityMin', v)} />
          <Slider label="Opacity Max" value={settings.opacityMax} min={0.2} max={1} step={0.05} onChange={(v) => set('opacityMax', v)} />
        </div>

        {/* Motion */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-white/50 uppercase tracking-wider">Motion</span>
          <Slider label="Speed" value={settings.animationSpeed} min={0.05} max={2} step={0.05} onChange={(v) => set('animationSpeed', v)} />
          <Slider label="Noise Scale" value={settings.noiseScale} min={0.0005} max={0.01} step={0.0005} onChange={(v) => set('noiseScale', v)} />
        </div>

        {/* Grid */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-white/50 uppercase tracking-wider">Layout</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.useGrid}
              onChange={(e) => set('useGrid', e.target.checked)}
              className="accent-white/60"
            />
            <span className="text-xs text-white/70">Grid Mode</span>
          </label>
          {settings.useGrid && (
            <>
              <Slider label="Grid Blend" value={settings.floatGridBlend} min={0} max={1} step={0.05} onChange={(v) => set('floatGridBlend', v)} />
              <Slider label="Grid Columns" value={settings.gridColumns} min={5} max={50} step={1} onChange={(v) => set('gridColumns', v)} />
            </>
          )}
        </div>

        {/* Blur / Depth */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-white/50 uppercase tracking-wider">Depth & Blur</span>
          <Slider label="Blur Min" value={settings.blurMin} min={0} max={0.8} step={0.05} onChange={(v) => set('blurMin', v)} />
          <Slider label="Blur Max" value={settings.blurMax} min={0.1} max={1} step={0.05} onChange={(v) => set('blurMax', v)} />
          <Slider label="Depth of Field" value={settings.depthOfField} min={0} max={1} step={0.05} onChange={(v) => set('depthOfField', v)} />
        </div>

        {/* Media */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-white/50 uppercase tracking-wider">Media Morphing</span>
          <Slider label="Interval Min (s)" value={settings.imageIntervalMin} min={5} max={60} step={1} onChange={(v) => set('imageIntervalMin', v)} />
          <Slider label="Interval Max (s)" value={settings.imageIntervalMax} min={10} max={120} step={1} onChange={(v) => set('imageIntervalMax', v)} />
          <Slider label="Fade Duration (s)" value={settings.imageFadeDuration} min={0.5} max={8} step={0.5} onChange={(v) => set('imageFadeDuration', v)} />
          <Slider label="Intensity" value={settings.imageIntensity} min={0} max={1.5} step={0.05} onChange={(v) => set('imageIntensity', v)} />
        </div>

        {/* Colors */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-white/50 uppercase tracking-wider">Colors</span>
          <ColorPicker label="Background" value={settings.backgroundColor} onChange={(v) => set('backgroundColor', v)} />
          <div className="flex gap-1.5 items-center">
            <span className="text-xs text-white/70">Palette</span>
            {settings.paletteColors.map((c, i) => (
              <input
                key={i}
                type="color"
                value={c}
                onChange={(e) => setPaletteColor(i, e.target.value)}
                className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent"
              />
            ))}
          </div>
          <Slider label="Hue Variation" value={settings.hueVariation} min={0} max={60} step={1} onChange={(v) => set('hueVariation', v)} />
        </div>

        {/* Fade */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-white/50 uppercase tracking-wider">Global Fade</span>
          <Slider label="Fade Duration (s)" value={settings.fadeDuration} min={0.5} max={8} step={0.5} onChange={(v) => set('fadeDuration', v)} />
          <span className="text-[10px] text-white/30">Press SPACE to fade in/out</span>
        </div>
      </div>
    </div>
  );
}
