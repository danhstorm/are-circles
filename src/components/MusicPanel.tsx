'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { AppState, ScaleType, MidSound, SpeedSubdivision, MusicConfig } from '@/types';
import { synthSkins } from './retroDesignSystem';

interface Props {
  visible: boolean;
  appState: AppState;
  editingPreset: number;
  onUpdate: (updater: (prev: AppState) => AppState) => void;
}

const PANEL_WIDTH_KEY = 'synth-panel-width';
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 250;
const MAX_WIDTH = 480;

const SECTION_ACCENTS = {
  global: 'rgba(255,255,255,0.55)',
  pling: synthSkins.pling.primary,
  plong: synthSkins.plong.primary,
  bong: synthSkins.bong.primary,
  pad: synthSkins.pad.primary,
  vr: synthSkins.vr.primary,
} as const;

function loadPanelWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH;
  const saved = window.localStorage.getItem(PANEL_WIDTH_KEY);
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) return parsed;
  }
  return DEFAULT_WIDTH;
}

function Slider({ label, value, min, max, step, onChange, color }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  color: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '1px 0' }}>
      <div className="flex justify-between items-baseline" style={{ fontSize: 11, gap: 4 }}>
        <span className="text-white/55 shrink-0">{label}</span>
        <span className="text-white/35 tabular-nums" style={{ fontSize: 10, minWidth: '4.4em', textAlign: 'right' }}>
          {value.toFixed(step < 1 ? 2 : 0)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full cursor-pointer"
        style={{
          height: 4,
          background: `linear-gradient(to right, ${color}80 0%, ${color}80 ${pct}%, rgba(255,255,255,0.1) ${pct}%, rgba(255,255,255,0.1) 100%)`,
          borderRadius: 999,
        }}
      />
    </div>
  );
}

function RangeSlider({ label, low, high, min, max, step, onChange, color }: {
  label: string;
  low: number;
  high: number;
  min: number;
  max: number;
  step: number;
  onChange: (low: number, high: number) => void;
  color: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const THUMB = 12;
  const HALF = THUMB / 2;
  const frac = (v: number) => (v - min) / (max - min);
  const snap = (v: number) => {
    const rounded = Math.round(v / step) * step;
    return Math.max(min, Math.min(max, parseFloat(rounded.toFixed(8))));
  };
  const decimals = step < 1 ? 2 : 0;

  const startDrag = (thumb: 'low' | 'high') => (e: React.PointerEvent) => {
    e.preventDefault();
    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const usable = rect.width - THUMB;
    const move = (ev: PointerEvent) => {
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left - HALF) / usable));
      const nextValue = snap(min + ratio * (max - min));
      if (thumb === 'low') onChange(Math.min(nextValue, high), high);
      else onChange(low, Math.max(nextValue, low));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const lowPct = HALF + frac(low) * (100 - THUMB);
  const highPct = HALF + frac(high) * (100 - THUMB);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '1px 0' }}>
      <div className="flex justify-between items-baseline" style={{ fontSize: 11, gap: 4 }}>
        <span className="text-white/55 shrink-0">{label}</span>
        <span className="text-white/35 tabular-nums" style={{ fontSize: 10, minWidth: '5.2em', textAlign: 'right' }}>
          {low.toFixed(decimals)} – {high.toFixed(decimals)}
        </span>
      </div>
      <div ref={trackRef} className="relative h-4 flex items-center" style={{ padding: `0 ${HALF}px` }}>
        <div className="absolute h-1 rounded-full bg-white/10" style={{ left: HALF, right: HALF }} />
        <div className="absolute h-1 rounded-full" style={{ left: `${lowPct}%`, right: `${100 - highPct}%`, background: color }} />
        <div
          className="absolute w-3 h-3 rounded-full bg-white/70 -translate-x-1/2 cursor-grab active:cursor-grabbing touch-none"
          style={{ left: `${lowPct}%` }}
          onPointerDown={startDrag('low')}
        />
        <div
          className="absolute w-3 h-3 rounded-full bg-white/70 -translate-x-1/2 cursor-grab active:cursor-grabbing touch-none"
          style={{ left: `${highPct}%` }}
          onPointerDown={startDrag('high')}
        />
      </div>
    </div>
  );
}

function ChoiceButtons<T extends string | number>({ value, onChange, options, accent }: {
  value: T;
  onChange: (v: T) => void;
  options: { label: string; value: T }[];
  accent: string;
}) {
  return (
    <div className="flex flex-wrap gap-1 py-0.5">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={String(option.value)}
            onClick={() => onChange(option.value)}
            className="rounded text-[10px] uppercase tracking-wide font-medium transition-colors cursor-pointer"
            style={{
              padding: '4px 6px',
              background: active ? accent : 'rgba(255,255,255,0.06)',
              color: active ? '#050505' : 'rgba(255,255,255,0.72)',
              border: active ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ToggleChip({ enabled, onToggle, accent }: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  accent: string;
}) {
  return (
    <button
      onClick={() => onToggle(!enabled)}
      className="rounded text-[10px] uppercase tracking-widest font-medium cursor-pointer transition-colors"
      style={{
        padding: '3px 7px',
        background: enabled ? accent : 'rgba(255,255,255,0.06)',
        color: enabled ? '#050505' : 'rgba(255,255,255,0.58)',
        border: enabled ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.08)',
      }}
      aria-pressed={enabled}
    >
      {enabled ? 'On' : 'Off'}
    </button>
  );
}

function Card({ title, accent, children, collapsed, onToggle, action }: {
  title: string;
  accent: string;
  children: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  action?: React.ReactNode;
}) {
  const collapsible = onToggle !== undefined;

  return (
    <div
      className="flex flex-col"
      style={{
        padding: '6px 8px',
        gap: 4,
        background: 'rgba(255,255,255,0.025)',
        borderRadius: 4,
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div className="flex items-center gap-2">
        {collapsible ? (
          <button onClick={onToggle} className="flex-1 flex items-center gap-2 text-left cursor-pointer min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
            <span className="text-[10px] uppercase tracking-widest font-medium text-white/30 truncate">{title}</span>
            <span className="ml-auto text-white/20 text-[10px]">{collapsed ? '▸' : '▾'}</span>
          </button>
        ) : (
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
            <span className="text-[10px] uppercase tracking-widest font-medium text-white/30 truncate">{title}</span>
          </div>
        )}
        {action}
      </div>
      {(!collapsible || !collapsed) && <div className="flex flex-col" style={{ gap: 2 }}>{children}</div>}
    </div>
  );
}

function AutoSection({ accent, children }: { accent: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div
      className="flex flex-col"
      style={{
        padding: '4px 6px',
        gap: 3,
        marginTop: 2,
        borderRadius: 4,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <button onClick={() => setCollapsed((value) => !value)} className="flex items-center gap-2 cursor-pointer text-left">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
        <span className="text-[10px] uppercase tracking-widest font-medium text-white/30">Automation</span>
        <span className="ml-auto text-white/20 text-[10px]">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && <div className="flex flex-col" style={{ gap: 2 }}>{children}</div>}
    </div>
  );
}

function GripDots() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 opacity-0 hover:opacity-25 transition-opacity cursor-col-resize">
      {[0, 1, 2, 3, 4].map((index) => (
        <span key={index} className="block h-1 w-1 rounded-full bg-white" />
      ))}
    </div>
  );
}

function SpeedButtons({ value, onChange, accent }: {
  value: SpeedSubdivision;
  onChange: (value: SpeedSubdivision) => void;
  accent: string;
}) {
  return (
    <ChoiceButtons
      value={value}
      onChange={onChange}
      accent={accent}
      options={[
        { label: '1/1', value: '1/1' },
        { label: '1/2', value: '1/2' },
        { label: '1/3', value: '1/3' },
        { label: '1/4', value: '1/4' },
        { label: '1/6', value: '1/6' },
        { label: '1/8', value: '1/8' },
        { label: '1/16', value: '1/16' },
      ]}
    />
  );
}

function SoundButtons({ value, onChange, accent }: {
  value: MidSound;
  onChange: (value: MidSound) => void;
  accent: string;
}) {
  return (
    <ChoiceButtons
      value={value}
      onChange={onChange}
      accent={accent}
      options={[
        { label: 'Xylophone', value: 'xylophone' },
        { label: 'Rhodes', value: 'rhodes' },
        { label: 'Breathy', value: 'breathy' },
        { label: 'Bell', value: 'bell' },
        { label: 'Kalimba', value: 'kalimba' },
        { label: 'Glass', value: 'glass' },
      ]}
    />
  );
}

export default function MusicPanel({ visible, appState, editingPreset, onUpdate }: Props) {
  const music = appState.music;
  const preset = appState.scenes[editingPreset];

  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const resizing = useRef(false);

  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [plingOpen, setPlingOpen] = useState(true);
  const [plongOpen, setPlongOpen] = useState(false);
  const [bongOpen, setBongOpen] = useState(false);
  const [padOpen, setPadOpen] = useState(false);
  const [vrOpen, setVrOpen] = useState(false);

  useEffect(() => {
    const savedWidth = loadPanelWidth();
    if (savedWidth === DEFAULT_WIDTH) return undefined;

    const frame = window.requestAnimationFrame(() => {
      setPanelWidth(savedWidth);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;
    let nextWidth = panelWidth;

    const move = (ev: PointerEvent) => {
      if (!resizing.current) return;
      nextWidth = Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + (ev.clientX - startX))));
      setPanelWidth(nextWidth);
    };

    const up = () => {
      resizing.current = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.localStorage.setItem(PANEL_WIDTH_KEY, String(nextWidth));
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [panelWidth]);

  const setMusic = <K extends keyof MusicConfig>(key: K, value: MusicConfig[K]) => {
    onUpdate((prev) => ({ ...prev, music: { ...prev.music, [key]: value } }));
  };

  const setInst = (inst: 'pling' | 'mid1' | 'mid2' | 'pad', key: string, value: unknown) => {
    onUpdate((prev) => ({ ...prev, music: { ...prev.music, [inst]: { ...prev.music[inst], [key]: value } } }));
  };

  const setInstMulti = (inst: 'pling' | 'mid1' | 'mid2' | 'pad', updates: Record<string, unknown>) => {
    onUpdate((prev) => ({ ...prev, music: { ...prev.music, [inst]: { ...prev.music[inst], ...updates } } }));
  };

  const setPresetInst = (inst: 'pling' | 'mid1' | 'mid2' | 'pad', enabled: boolean) => {
    onUpdate((prev) => {
      const scenes = [...prev.scenes] as AppState['scenes'];
      scenes[editingPreset] = {
        ...scenes[editingPreset],
        musicInstruments: { ...scenes[editingPreset].musicInstruments, [inst]: enabled },
      };
      return { ...prev, scenes };
    });
  };

  const setVR = (key: string, value: number) => {
    onUpdate((prev) => ({
      ...prev,
      music: {
        ...prev.music,
        visualReactions: { ...prev.music.visualReactions, [key]: value },
      },
    }));
  };

  return (
    <div
      className={`fixed z-50 transition-all duration-300 ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8 pointer-events-none'}`}
      style={{ top: 16, left: 16, bottom: panelCollapsed ? 'auto' : 16, width: panelWidth, maxWidth: 'calc(100vw - 460px)' }}
    >
      <div
        data-testid="music-panel-shell"
        data-panel-style="companion-rack"
        className={`relative ${panelCollapsed ? '' : 'h-full overflow-y-auto overflow-x-hidden'}`}
        style={{
          borderRadius: 6,
          background: 'rgba(0,0,0,0.28)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.06)',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.08) transparent',
        }}
      >
        <div className="flex flex-col" style={{ padding: '10px 10px', gap: 5 }}>
          {/* Header -- click to collapse/expand entire panel */}
          <button
            onClick={() => setPanelCollapsed(v => !v)}
            className="flex items-center justify-between cursor-pointer text-left w-full"
            style={{ padding: '2px 2px 6px', borderBottom: panelCollapsed ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center" style={{ gap: 6 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.8)' }}>SYNTH</h2>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>{panelCollapsed ? '▸' : '▾'}</span>
            </div>
            <div style={{ fontSize: 12, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,0.5)' }}>
              {music.tempo} <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)' }}>BPM</span>
            </div>
          </button>

          {!panelCollapsed && (
            <>
              <Card title="Global" accent={SECTION_ACCENTS.global}>
                <ChoiceButtons
                  value={music.scale}
                  onChange={(value) => setMusic('scale', value as ScaleType)}
                  accent="rgba(255,255,255,0.72)"
                  options={[
                    { label: 'Major', value: 'pentatonic-major' },
                    { label: 'Minor', value: 'pentatonic-minor' },
                  ]}
                />
                <Slider label="Tempo" value={music.tempo} min={40} max={80} step={1} onChange={(value) => setMusic('tempo', value)} color={SECTION_ACCENTS.global} />
                <Slider label="Master Volume" value={music.masterVolume} min={0} max={1} step={0.05} onChange={(value) => setMusic('masterVolume', value)} color={SECTION_ACCENTS.global} />
              </Card>

              <Card
                title="Pling"
                accent={SECTION_ACCENTS.pling}
                collapsed={!plingOpen}
                onToggle={() => setPlingOpen((value) => !value)}
                action={<ToggleChip enabled={preset.musicInstruments.pling} onToggle={(value) => setPresetInst('pling', value)} accent={SECTION_ACCENTS.pling} />}
              >
                <RangeSlider label="Volume" low={music.pling.volumeMin} high={music.pling.volumeMax} min={0} max={1} step={0.05} onChange={(low, high) => setInstMulti('pling', { volumeMin: low, volumeMax: high })} color={SECTION_ACCENTS.pling} />
                <SpeedButtons value={music.pling.speed} onChange={(value) => setInst('pling', 'speed', value)} accent={SECTION_ACCENTS.pling} />
                <RangeSlider label="Octave" low={music.pling.octaveLow} high={music.pling.octaveHigh} min={2} max={7} step={1} onChange={(low, high) => setInstMulti('pling', { octaveLow: low, octaveHigh: high })} color={SECTION_ACCENTS.pling} />
                <Slider label="Filter Q" value={music.pling.filterQ} min={0.5} max={15} step={0.5} onChange={(value) => setInst('pling', 'filterQ', value)} color={SECTION_ACCENTS.pling} />
                <Slider label="Delay" value={music.pling.delay} min={0} max={1} step={0.05} onChange={(value) => setInst('pling', 'delay', value)} color={SECTION_ACCENTS.pling} />
                <Slider label="Reverb" value={music.pling.reverb} min={0} max={1} step={0.05} onChange={(value) => setInst('pling', 'reverb', value)} color={SECTION_ACCENTS.pling} />
                <AutoSection accent={SECTION_ACCENTS.pling}>
                  <Slider label="Auto Speed" value={music.pling.autoSpeed} min={0.01} max={0.5} step={0.01} onChange={(value) => setInst('pling', 'autoSpeed', value)} color={SECTION_ACCENTS.pling} />
                  <RangeSlider label="Filter" low={music.pling.autoFilterMin} high={music.pling.autoFilterMax} min={200} max={8000} step={50} onChange={(low, high) => setInstMulti('pling', { autoFilterMin: low, autoFilterMax: high })} color={SECTION_ACCENTS.pling} />
                  <RangeSlider label="Decay" low={music.pling.autoDecayMin} high={music.pling.autoDecayMax} min={0.02} max={1} step={0.02} onChange={(low, high) => setInstMulti('pling', { autoDecayMin: low, autoDecayMax: high })} color={SECTION_ACCENTS.pling} />
                  <RangeSlider label="LFO Speed" low={music.pling.autoLfoSpeedMin} high={music.pling.autoLfoSpeedMax} min={0.1} max={10} step={0.1} onChange={(low, high) => setInstMulti('pling', { autoLfoSpeedMin: low, autoLfoSpeedMax: high })} color={SECTION_ACCENTS.pling} />
                  <RangeSlider label="LFO Depth" low={music.pling.autoLfoDepthMin} high={music.pling.autoLfoDepthMax} min={0} max={1} step={0.05} onChange={(low, high) => setInstMulti('pling', { autoLfoDepthMin: low, autoLfoDepthMax: high })} color={SECTION_ACCENTS.pling} />
                  <RangeSlider label="Trigger %" low={music.pling.autoTriggerMin} high={music.pling.autoTriggerMax} min={0} max={1} step={0.05} onChange={(low, high) => setInstMulti('pling', { autoTriggerMin: low, autoTriggerMax: high })} color={SECTION_ACCENTS.pling} />
                </AutoSection>
              </Card>

              <Card
                title="Plong"
                accent={SECTION_ACCENTS.plong}
                collapsed={!plongOpen}
                onToggle={() => setPlongOpen((value) => !value)}
                action={<ToggleChip enabled={preset.musicInstruments.mid1} onToggle={(value) => setPresetInst('mid1', value)} accent={SECTION_ACCENTS.plong} />}
              >
                <SoundButtons value={music.mid1.sound} onChange={(value) => setInst('mid1', 'sound', value)} accent={SECTION_ACCENTS.plong} />
                <RangeSlider label="Volume" low={music.mid1.volumeMin} high={music.mid1.volumeMax} min={0} max={1} step={0.05} onChange={(low, high) => setInstMulti('mid1', { volumeMin: low, volumeMax: high })} color={SECTION_ACCENTS.plong} />
                <SpeedButtons value={music.mid1.speed} onChange={(value) => setInst('mid1', 'speed', value)} accent={SECTION_ACCENTS.plong} />
                <RangeSlider label="Octave" low={music.mid1.octaveLow} high={music.mid1.octaveHigh} min={1} max={6} step={1} onChange={(low, high) => setInstMulti('mid1', { octaveLow: low, octaveHigh: high })} color={SECTION_ACCENTS.plong} />
                <Slider label="Delay" value={music.mid1.delay} min={0} max={1} step={0.05} onChange={(value) => setInst('mid1', 'delay', value)} color={SECTION_ACCENTS.plong} />
                <Slider label="Reverb" value={music.mid1.reverb} min={0} max={1} step={0.05} onChange={(value) => setInst('mid1', 'reverb', value)} color={SECTION_ACCENTS.plong} />
                <AutoSection accent={SECTION_ACCENTS.plong}>
                  <Slider label="Auto Speed" value={music.mid1.autoSpeed} min={0.01} max={0.5} step={0.01} onChange={(value) => setInst('mid1', 'autoSpeed', value)} color={SECTION_ACCENTS.plong} />
                  <RangeSlider label="Filter" low={music.mid1.autoFilterMin} high={music.mid1.autoFilterMax} min={200} max={8000} step={50} onChange={(low, high) => setInstMulti('mid1', { autoFilterMin: low, autoFilterMax: high })} color={SECTION_ACCENTS.plong} />
                  <RangeSlider label="Decay" low={music.mid1.autoDecayMin} high={music.mid1.autoDecayMax} min={0.2} max={3} step={0.1} onChange={(low, high) => setInstMulti('mid1', { autoDecayMin: low, autoDecayMax: high })} color={SECTION_ACCENTS.plong} />
                  <RangeSlider label="FM" low={music.mid1.autoFmMin} high={music.mid1.autoFmMax} min={0} max={3} step={0.1} onChange={(low, high) => setInstMulti('mid1', { autoFmMin: low, autoFmMax: high })} color={SECTION_ACCENTS.plong} />
                  <RangeSlider label="Trigger %" low={music.mid1.autoTriggerMin} high={music.mid1.autoTriggerMax} min={0} max={1} step={0.05} onChange={(low, high) => setInstMulti('mid1', { autoTriggerMin: low, autoTriggerMax: high })} color={SECTION_ACCENTS.plong} />
                </AutoSection>
              </Card>

              <Card
                title="Bong"
                accent={SECTION_ACCENTS.bong}
                collapsed={!bongOpen}
                onToggle={() => setBongOpen((value) => !value)}
                action={<ToggleChip enabled={preset.musicInstruments.mid2} onToggle={(value) => setPresetInst('mid2', value)} accent={SECTION_ACCENTS.bong} />}
              >
                <SoundButtons value={music.mid2.sound} onChange={(value) => setInst('mid2', 'sound', value)} accent={SECTION_ACCENTS.bong} />
                <RangeSlider label="Volume" low={music.mid2.volumeMin} high={music.mid2.volumeMax} min={0} max={1} step={0.05} onChange={(low, high) => setInstMulti('mid2', { volumeMin: low, volumeMax: high })} color={SECTION_ACCENTS.bong} />
                <SpeedButtons value={music.mid2.speed} onChange={(value) => setInst('mid2', 'speed', value)} accent={SECTION_ACCENTS.bong} />
                <RangeSlider label="Octave" low={music.mid2.octaveLow} high={music.mid2.octaveHigh} min={1} max={6} step={1} onChange={(low, high) => setInstMulti('mid2', { octaveLow: low, octaveHigh: high })} color={SECTION_ACCENTS.bong} />
                <Slider label="Delay" value={music.mid2.delay} min={0} max={1} step={0.05} onChange={(value) => setInst('mid2', 'delay', value)} color={SECTION_ACCENTS.bong} />
                <Slider label="Reverb" value={music.mid2.reverb} min={0} max={1} step={0.05} onChange={(value) => setInst('mid2', 'reverb', value)} color={SECTION_ACCENTS.bong} />
                <AutoSection accent={SECTION_ACCENTS.bong}>
                  <Slider label="Auto Speed" value={music.mid2.autoSpeed} min={0.01} max={0.5} step={0.01} onChange={(value) => setInst('mid2', 'autoSpeed', value)} color={SECTION_ACCENTS.bong} />
                  <RangeSlider label="Filter" low={music.mid2.autoFilterMin} high={music.mid2.autoFilterMax} min={200} max={8000} step={50} onChange={(low, high) => setInstMulti('mid2', { autoFilterMin: low, autoFilterMax: high })} color={SECTION_ACCENTS.bong} />
                  <RangeSlider label="Decay" low={music.mid2.autoDecayMin} high={music.mid2.autoDecayMax} min={0.2} max={3} step={0.1} onChange={(low, high) => setInstMulti('mid2', { autoDecayMin: low, autoDecayMax: high })} color={SECTION_ACCENTS.bong} />
                  <RangeSlider label="FM" low={music.mid2.autoFmMin} high={music.mid2.autoFmMax} min={0} max={3} step={0.1} onChange={(low, high) => setInstMulti('mid2', { autoFmMin: low, autoFmMax: high })} color={SECTION_ACCENTS.bong} />
                  <RangeSlider label="Trigger %" low={music.mid2.autoTriggerMin} high={music.mid2.autoTriggerMax} min={0} max={1} step={0.05} onChange={(low, high) => setInstMulti('mid2', { autoTriggerMin: low, autoTriggerMax: high })} color={SECTION_ACCENTS.bong} />
                </AutoSection>
              </Card>

              <Card
                title="Pad"
                accent={SECTION_ACCENTS.pad}
                collapsed={!padOpen}
                onToggle={() => setPadOpen((value) => !value)}
                action={<ToggleChip enabled={preset.musicInstruments.pad} onToggle={(value) => setPresetInst('pad', value)} accent={SECTION_ACCENTS.pad} />}
              >
                <Slider label="Volume" value={music.pad.volume} min={0} max={1} step={0.05} onChange={(value) => setInst('pad', 'volume', value)} color={SECTION_ACCENTS.pad} />
                <Slider label="Bars" value={music.pad.chordInterval} min={1} max={8} step={1} onChange={(value) => setInst('pad', 'chordInterval', value)} color={SECTION_ACCENTS.pad} />
                <RangeSlider label="Octave" low={music.pad.octaveLow} high={music.pad.octaveHigh} min={1} max={5} step={1} onChange={(low, high) => setInstMulti('pad', { octaveLow: low, octaveHigh: high })} color={SECTION_ACCENTS.pad} />
                <Slider label="Filter" value={music.pad.filterCutoff} min={100} max={4000} step={50} onChange={(value) => setInst('pad', 'filterCutoff', value)} color={SECTION_ACCENTS.pad} />
                <Slider label="Reverb" value={music.pad.reverb} min={0} max={1} step={0.05} onChange={(value) => setInst('pad', 'reverb', value)} color={SECTION_ACCENTS.pad} />
              </Card>

              <Card title="Visual Reactions" accent={SECTION_ACCENTS.vr} collapsed={!vrOpen} onToggle={() => setVrOpen((value) => !value)}>
                <Slider label="Swirl" value={music.visualReactions.swirlStrength} min={0} max={1} step={0.05} onChange={(value) => setVR('swirlStrength', value)} color={SECTION_ACCENTS.vr} />
                <Slider label="Radius" value={music.visualReactions.swirlRadius} min={0.05} max={0.5} step={0.01} onChange={(value) => setVR('swirlRadius', value)} color={SECTION_ACCENTS.vr} />
                <Slider label="Pulse" value={music.visualReactions.sizePulseStrength} min={0} max={1} step={0.05} onChange={(value) => setVR('sizePulseStrength', value)} color={SECTION_ACCENTS.vr} />
                <Slider label="Bass" value={music.visualReactions.bassSizeBoost} min={0} max={1} step={0.05} onChange={(value) => setVR('bassSizeBoost', value)} color={SECTION_ACCENTS.vr} />
              </Card>
            </>
          )}
        </div>
      </div>

      {!panelCollapsed && (
        <div className="absolute top-0 bottom-0 z-20" style={{ right: -4, width: 10 }} onPointerDown={startResize}>
          <GripDots />
        </div>
      )}
    </div>
  );
}
