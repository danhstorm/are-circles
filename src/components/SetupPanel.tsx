'use client';

import { useRef, useState, useEffect } from 'react';
import { Settings, AppState, MediaItem, GravityShape } from '@/types';
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
  soundMuted: boolean;
  onToggleSound: () => void;
  onActiveTemplateChange: (idx: number | null) => void;
}

function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-0.5">
      <div className="flex justify-between items-baseline text-[11px]">
        <span className="text-white/55 shrink-0">{label}</span>
        <span className="text-white/35 tabular-nums text-[10px] ml-2 min-w-[2.75em] text-right">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 cursor-pointer"
      />
    </div>
  );
}

function RangeSlider({ label, low, high, min, max, step, onChange }: {
  label: string; low: number; high: number; min: number; max: number; step: number;
  onChange: (low: number, high: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const THUMB = 12;
  const HALF = 6;
  const frac = (v: number) => (v - min) / (max - min);
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
    const usable = rect.width - THUMB;
    const move = (ev: PointerEvent) => {
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left - HALF) / usable));
      const val = snap(min + ratio * (max - min));
      if (thumb === 'low') onChange(Math.min(val, high), high);
      else onChange(low, Math.max(val, low));
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
    <div className="flex flex-col gap-0.5 py-0.5">
      <div className="flex justify-between items-baseline text-[11px]">
        <span className="text-white/55 shrink-0">{label}</span>
        <span className="text-white/35 tabular-nums text-[10px] ml-2 min-w-[4.4em] text-right">{low.toFixed(decimals)} – {high.toFixed(decimals)}</span>
      </div>
      <div ref={trackRef} className="relative h-4 flex items-center" style={{ padding: `0 ${HALF}px` }}>
        <div className="absolute h-1 rounded-full bg-white/10" style={{ left: HALF, right: HALF }} />
        <div className="absolute h-1 rounded-full bg-white/20" style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }} />
        <div
          className="absolute w-3 h-3 rounded-full bg-white/65 -translate-x-1/2 cursor-grab active:cursor-grabbing touch-none"
          style={{ left: `${lowPct}%` }}
          onPointerDown={startDrag('low')}
        />
        <div
          className="absolute w-3 h-3 rounded-full bg-white/65 -translate-x-1/2 cursor-grab active:cursor-grabbing touch-none"
          style={{ left: `${highPct}%` }}
          onPointerDown={startDrag('high')}
        />
      </div>
    </div>
  );
}

function Section({ title, children, collapsed, onToggle }: {
  title: string; children: React.ReactNode; collapsed?: boolean; onToggle?: () => void;
}) {
  const isCollapsible = onToggle !== undefined;
  return (
    <div className="flex flex-col gap-1" style={{
      padding: '8px 10px',
      background: 'rgba(255,255,255,0.025)',
      borderRadius: 4,
      border: '1px solid rgba(255,255,255,0.05)',
    }}>
      {isCollapsible ? (
        <button onClick={onToggle} className="flex justify-between items-center cursor-pointer">
          <span className="text-[10px] uppercase tracking-widest font-medium text-white/30">{title}</span>
          <span className="text-white/20 text-[10px]">{collapsed ? '▸' : '▾'}</span>
        </button>
      ) : (
        <span className="text-[10px] uppercase tracking-widest font-medium text-white/30">{title}</span>
      )}
      {(!isCollapsible || !collapsed) && children}
    </div>
  );
}

function ModeToggle({ mode, onSetMode }: { mode: 'live' | 'setup'; onSetMode: (m: 'live' | 'setup') => void }) {
  return (
    <div className="flex bg-white/5 rounded p-0.5" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      {(['live', 'setup'] as const).map(m => (
        <button
          key={m}
          onClick={() => onSetMode(m)}
          className={`flex-1 text-xs font-medium tracking-widest uppercase cursor-pointer transition-all rounded-sm ${
            mode === m ? 'bg-white/12 text-white/90 shadow-sm' : 'text-white/30 hover:text-white/50'
          }`}
          style={{ padding: '4px 10px' }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

const sceneIcons = [
  <svg key="s0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></svg>,
  <svg key="s1" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 12c2-3 5-5 10-5s8 2 10 5c-2 3-5 5-10 5s-8-2-10-5z" /><circle cx="12" cy="12" r="3" /></svg>,
  <svg key="s2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3v18M3 12h18M7 7l10 10M17 7L7 17" /></svg>,
];

function LiveCard({ visible, appState, onApplyPreset, onSetMode, onClose, soundMuted, onToggleSound }: {
  visible: boolean; appState: AppState;
  onApplyPreset: (idx: number) => void;
  onSetMode: (m: 'live' | 'setup') => void;
  onClose: () => void;
  soundMuted: boolean;
  onToggleSound: () => void;
}) {
  const activeScene = appState.scenes[appState.activePreset];
  const soundActive = activeScene.soundEnabled && !soundMuted;
  return (
    <div
      className={`fixed z-50 transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}
      style={{ top: 16, right: 16, width: 300 }}
    >
      <div style={{
        borderRadius: 6,
        background: 'rgba(0,0,0,0.28)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.06)',
        padding: 14,
      }}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <ModeToggle mode="live" onSetMode={onSetMode} />
            <button onClick={onClose}
              className="w-6 h-6 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center text-white/40 text-xs cursor-pointer"
              aria-label="Close">&times;</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {appState.scenes.map((s, i) => (
              <button key={i} onClick={() => onApplyPreset(i)}
                className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg transition-all cursor-pointer ${
                  appState.activePreset === i
                    ? 'bg-white/15 text-white border border-white/20'
                    : 'bg-white/5 hover:bg-white/10 text-white/40 border border-transparent'
                }`}>
                {sceneIcons[i] || sceneIcons[0]}
                <span className="text-[11px] leading-none">{s.name}</span>
              </button>
            ))}
          </div>
          <button onClick={onToggleSound}
            className={`w-full py-2 text-[11px] rounded transition-all cursor-pointer flex items-center justify-center gap-2 ${
              soundActive
                ? 'bg-white/12 text-white/80 border border-white/15'
                : 'bg-white/5 text-white/35 border border-transparent hover:bg-white/8'
            }`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              {soundActive ? <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" /> : <path d="M17 9l6 6M23 9l-6 6" />}
            </svg>
            <span>Sound {soundActive ? 'On' : 'Off'}</span>
            <span className="text-[9px] text-white/20 ml-1">S</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SetupPanel({ visible, mode, onSetMode, onClose, appState, editingPreset, onSetEditingPreset, onUpdate, onApplyPreset, audioActive, onToggleAudio, onTriggerMedia, onTriggerMediaByIndex, onRemoveMedia, onUpdateMediaItem, mediaItems, activeMediaIndex, soundMuted, onToggleSound, onActiveTemplateChange }: Props) {
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(() => {
    const scene = appState.scenes[editingPreset];
    const templates = scene?.presetTemplates;
    return templates && templates.length > 0 ? templates[0] : null;
  });

  void onTriggerMedia;

  useEffect(() => () => { clearTimeout(confirmTimer.current); }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const scene = appState.scenes[editingPreset];
    const templates = scene?.presetTemplates;
    const next = templates && templates.length > 0 ? templates[0] : null;
    setSelectedTemplate(next);
    onActiveTemplateChange(next);
  }, [editingPreset]); // Only reset when switching scenes, not on every slider change

  const preset = appState.scenes[editingPreset];
  const customPresets = appState.customPresets || templatePresets;
  // When a template preset is selected, sliders read/write from that preset
  const ps = selectedTemplate !== null
    ? (customPresets[selectedTemplate]?.settings ?? preset.settings)
    : preset.settings;

  const setPresetSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    if (selectedTemplate !== null) {
      onUpdate(prev => {
        const cp = [...(prev.customPresets || templatePresets)];
        cp[selectedTemplate] = { ...cp[selectedTemplate], settings: { ...cp[selectedTemplate].settings, [key]: value } };
        return { ...prev, customPresets: cp };
      });
    } else {
      onUpdate(prev => {
        const scenes = [...prev.scenes] as AppState['scenes'];
        scenes[editingPreset] = {
          ...scenes[editingPreset],
          settings: { ...scenes[editingPreset].settings, [key]: value },
        };
        return { ...prev, scenes };
      });
    }
  };

  const setPresetSettings = (partial: Partial<Settings>) => {
    if (selectedTemplate !== null) {
      onUpdate(prev => {
        const cp = [...(prev.customPresets || templatePresets)];
        cp[selectedTemplate] = { ...cp[selectedTemplate], settings: { ...cp[selectedTemplate].settings, ...partial } };
        return { ...prev, customPresets: cp };
      });
    } else {
      onUpdate(prev => {
        const scenes = [...prev.scenes] as AppState['scenes'];
        scenes[editingPreset] = {
          ...scenes[editingPreset],
          settings: { ...scenes[editingPreset].settings, ...partial },
        };
        return { ...prev, scenes };
      });
    }
  };

  const setPresetMedia = (enabled: boolean) => {
    onUpdate(prev => {
      const scenes = [...prev.scenes] as AppState['scenes'];
      scenes[editingPreset] = { ...scenes[editingPreset], mediaEnabled: enabled };
      return { ...prev, scenes };
    });
  };

  const setPresetName = (name: string) => {
    onUpdate(prev => {
      const scenes = [...prev.scenes] as AppState['scenes'];
      scenes[editingPreset] = { ...scenes[editingPreset], name };
      return { ...prev, scenes };
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

  const toggleCyclePreset = (templateIdx: number) => {
    const current = preset.presetTemplates || [];
    const next = current.includes(templateIdx)
      ? current.filter(i => i !== templateIdx)
      : [...current, templateIdx];
    onUpdate(prev => {
      const scenes = [...prev.scenes] as AppState['scenes'];
      scenes[editingPreset] = { ...scenes[editingPreset], presetTemplates: next };
      return { ...prev, scenes };
    });
  };

  const setCycleInterval = (lo: number, hi: number) => {
    onUpdate(prev => {
      const scenes = [...prev.scenes] as AppState['scenes'];
      scenes[editingPreset] = { ...scenes[editingPreset], cycleIntervalMin: lo, cycleIntervalMax: hi };
      return { ...prev, scenes };
    });
  };

  const setMediaOverrideProp = (src: string, prop: string, value: number) => {
    onUpdate(prev => ({
      ...prev,
      mediaOverrides: {
        ...prev.mediaOverrides,
        [src]: { ...getMediaOverride(prev, src), [prop]: value },
      },
    }));
  };

  if (mode === 'live') {
    return (
      <LiveCard
        visible={visible}
        appState={appState}
        onApplyPreset={onApplyPreset}
        onSetMode={onSetMode}
        onClose={onClose}
        soundMuted={soundMuted}
        onToggleSound={onToggleSound}
      />
    );
  }

  return (
    <div className={`fixed z-50 transition-all duration-300 top-0 right-0 bottom-0 w-full sm:top-4 sm:right-4 sm:bottom-4 sm:w-[420px] sm:max-w-[calc(100vw-2rem)] ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8 pointer-events-none'}`}>
      <div
        data-testid="setup-panel-shell"
        data-panel-style="companion-rack"
        className="h-full overflow-y-auto"
        style={{
          borderRadius: 6,
          background: 'rgba(0,0,0,0.28)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.06)',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.08) transparent',
        }}
      >
        <div className="flex flex-col" style={{ padding: '16px 14px', gap: 8 }}>
          <div className="flex justify-between items-center">
            <ModeToggle mode={mode} onSetMode={onSetMode} />
            <div className="flex items-center gap-2">
              <span className="text-white/15 text-[10px] hidden sm:inline">H</span>
              <button
                onClick={onClose}
                className="w-6 h-6 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center text-white/40 text-xs cursor-pointer"
                aria-label="Close"
              >
                &times;
              </button>
            </div>
          </div>

          <Section title="Editing Preset">
            <div className="grid grid-cols-3 gap-1">
              {appState.scenes.map((p, i) => (
                <button
                  key={i}
                  onClick={() => onSetEditingPreset(i)}
                  className={`py-1.5 text-[11px] rounded transition-colors cursor-pointer ${
                    editingPreset === i ? 'bg-white/18 text-white border border-white/25' : 'bg-white/6 hover:bg-white/12 text-white/60'
                  }`}
                >
                  <span className="text-white/30 mr-0.5">{i + 1}</span> {p.name}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] text-white/35 shrink-0">Name</span>
              <input
                type="text"
                value={preset.name}
                onChange={e => setPresetName(e.target.value)}
                className="flex-1 text-[11px] px-2 py-1 rounded bg-white/8 text-white/80 border border-white/10 outline-none min-w-0"
              />
            </div>
            <Slider label="Transition Speed" value={appState.transitionSpeed} min={0.02} max={1} step={0.02} onChange={v => setGlobal('transitionSpeed', v)} />
          </Section>

          <Section title="Presets">
            <div className="flex flex-col gap-1 pt-0.5">
              {customPresets.map((t, i) => {
                const enabled = (preset.presetTemplates || []).includes(i);
                const editing = selectedTemplate === i;
                return (
                  <div key={i} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-colors ${editing ? 'bg-white/12 ring-1 ring-white/20' : ''}`}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggleCyclePreset(i)}
                      className="accent-white/60 w-3 h-3 shrink-0 cursor-pointer"
                    />
                    <button
                      onClick={() => { const next = editing ? null : i; setSelectedTemplate(next); onActiveTemplateChange(next); }}
                      className={`flex-1 text-left text-[10px] truncate cursor-pointer transition-colors ${
                        editing ? 'text-white font-medium' : enabled ? 'text-white/70' : 'text-white/35 hover:text-white/55'
                      }`}
                    >
                      {t.name}
                    </button>
                    {editing && (
                      <span className="text-[8px] text-white/30 shrink-0">editing</span>
                    )}
                  </div>
                );
              })}
            </div>
            {selectedTemplate !== null && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] text-white/35 shrink-0">Preset Name</span>
                <input
                  type="text"
                  value={customPresets[selectedTemplate]?.name ?? ''}
                  onChange={e => {
                    const name = e.target.value;
                    onUpdate(prev => {
                      const cp = [...(prev.customPresets || templatePresets)];
                      cp[selectedTemplate] = { ...cp[selectedTemplate], name };
                      return { ...prev, customPresets: cp };
                    });
                  }}
                  className="flex-1 text-[11px] px-2 py-1 rounded bg-white/8 text-white/80 border border-white/10 outline-none min-w-0"
                />
                <button
                  onClick={() => {
                    onUpdate(prev => {
                      const cp = [...(prev.customPresets || templatePresets)];
                      cp[selectedTemplate] = structuredClone(templatePresets[selectedTemplate]);
                      return { ...prev, customPresets: cp };
                    });
                  }}
                  className="text-[9px] px-1.5 py-1 rounded bg-white/6 hover:bg-white/12 text-white/35 cursor-pointer shrink-0"
                  title="Reset this preset to factory default"
                >
                  Reset
                </button>
              </div>
            )}
            {(preset.presetTemplates || []).length >= 2 && (
              <RangeSlider label="Interval (s)" low={preset.cycleIntervalMin || 30} high={preset.cycleIntervalMax || 60} min={10} max={180} step={5} onChange={(lo, hi) => setCycleInterval(lo, hi)} />
            )}
            {(preset.presetTemplates || []).length < 2 && (preset.presetTemplates || []).length > 0 && (
              <span className="text-[10px] text-white/25 italic">Enable 2+ presets to cycle</span>
            )}
            {selectedTemplate !== null && (
              <div className="text-[10px] text-white/40 pt-1 border-t border-white/8">
                Sliders below edit <span className="text-white/70">{customPresets[selectedTemplate]?.name}</span> preset.
                <button onClick={() => { setSelectedTemplate(null); onActiveTemplateChange(null); }} className="ml-2 text-white/50 hover:text-white/80 underline cursor-pointer">Back to scene</button>
              </div>
            )}
          </Section>

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
                <span className="text-[11px] text-white/55">Dir</span>
                <DirectionPicker value={ps.waveDirection ?? 0} onChange={v => setPresetSetting('waveDirection', v)} />
                <span className="text-[10px] text-white/25 tabular-nums">{Math.round(((ps.waveDirection ?? 0) * 180) / Math.PI)}°</span>
              </div>
            </Section>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Section title="Circles">
              {!ps.useGrid && (
                <Slider label="Count" value={ps.circleCount ?? 200} min={20} max={1500} step={1} onChange={v => setPresetSetting('circleCount', v)} />
              )}
              <Slider label="Speed" value={ps.animationSpeed ?? 0.5} min={0.05} max={2} step={0.05} onChange={v => setPresetSetting('animationSpeed', v)} />
              <RangeSlider label="Size" low={ps.minSize ?? 4} high={ps.maxSize ?? 80} min={1} max={300} step={1} onChange={(lo, hi) => setPresetSettings({ minSize: lo, maxSize: hi })} />
              <RangeSlider label="Opacity" low={ps.opacityMin ?? 0.3} high={ps.opacityMax ?? 0.9} min={0.05} max={1} step={0.05} onChange={(lo, hi) => setPresetSettings({ opacityMin: lo, opacityMax: hi })} />
            </Section>
            <Section title="Depth & Blur">
              <Slider label="Depth of Field" value={ps.depthOfField ?? 0.5} min={0} max={1} step={0.05} onChange={v => setPresetSetting('depthOfField', v)} />
              <Slider label="Blur %" value={ps.blurPercent ?? 0.5} min={0} max={1} step={0.05} onChange={v => setPresetSetting('blurPercent', v)} />
              <RangeSlider label="Blur range" low={ps.blurMin ?? 0.1} high={ps.blurMax ?? 0.8} min={0} max={1} step={0.05} onChange={(lo, hi) => setPresetSettings({ blurMin: lo, blurMax: hi })} />
            </Section>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Section title="Drift">
              <Slider label="Strength" value={ps.driftStrength ?? 15} min={0} max={60} step={1} onChange={v => setPresetSetting('driftStrength', v)} />
              <Slider label="Speed" value={ps.driftSpeed ?? 0.3} min={0.01} max={1} step={0.01} onChange={v => setPresetSetting('driftSpeed', v)} />
            </Section>
            <Section title="Layout">
              <label className="flex items-center gap-2 cursor-pointer py-0.5">
                <input type="checkbox" checked={ps.useGrid ?? false} onChange={e => setPresetSetting('useGrid', e.target.checked)} className="accent-white/60 w-3.5 h-3.5" />
                <span className="text-[11px] text-white/55">Grid Mode</span>
              </label>
              {ps.useGrid && (
                <>
                  <Slider label="Blend" value={ps.floatGridBlend ?? 0} min={0} max={1} step={0.05} onChange={v => setPresetSetting('floatGridBlend', v)} />
                  <Slider label="Columns" value={ps.gridColumns ?? 20} min={5} max={200} step={1} onChange={v => setPresetSetting('gridColumns', v)} />
                </>
              )}
            </Section>
          </div>

          {!ps.useGrid && (
            <Section title="Focus Area">
              <div className="flex gap-1.5">
                {(['none', 'circle', 'oval', 'drop'] as GravityShape[]).map(shape => (
                  <button
                    key={shape}
                    onClick={() => setPresetSetting('gravityShape', shape)}
                    className={`flex-1 px-1.5 py-1 text-[11px] rounded transition-colors cursor-pointer capitalize ${
                      (ps.gravityShape ?? 'none') === shape ? 'bg-white/15 text-white border border-white/25' : 'bg-white/5 hover:bg-white/10 text-white/50'
                    }`}
                  >
                    {shape}
                  </button>
                ))}
              </div>
              {(ps.gravityShape ?? 'none') !== 'none' && (
                <Slider label="Strength" value={ps.gravityStrength ?? 0.3} min={0.05} max={2} step={0.05} onChange={v => setPresetSetting('gravityStrength', v)} />
              )}
            </Section>
          )}

          <Section title="Media">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={preset.mediaEnabled} onChange={e => setPresetMedia(e.target.checked)} className="accent-white/60 w-3.5 h-3.5" />
              <span className="text-[11px] text-white/55">Enabled</span>
            </label>
            <RangeSlider label="Interval (s)" low={ps.imageIntervalMin ?? 10} high={ps.imageIntervalMax ?? 30} min={5} max={120} step={1} onChange={(lo, hi) => setPresetSettings({ imageIntervalMin: lo, imageIntervalMax: hi })} />
            <Slider label="Fade (s)" value={ps.imageFadeDuration ?? 2.5} min={0.5} max={8} step={0.5} onChange={v => setPresetSetting('imageFadeDuration', v)} />
            <Slider label="Grid Columns" value={appState.mediaGridColumns} min={10} max={200} step={1} onChange={v => setGlobal('mediaGridColumns', v)} />
            {mediaItems.length > 0 && (
              <div className="grid grid-cols-4 gap-2.5 pt-1">
                {mediaItems.map((item, i) => {
                  const name = (item.src.split('/').pop() || '').replace(/\.[^.]+$/, '');
                  const ov = getMediaOverride(appState, item.src);
                  return (
                    <div key={item.src} className="relative group flex flex-col gap-1">
                      <button
                        onClick={() => onTriggerMediaByIndex(i)}
                        className={`w-full aspect-square rounded overflow-hidden bg-black/30 border transition-colors cursor-pointer ${
                          activeMediaIndex === i ? 'border-white/50 ring-1 ring-white/25' : 'border-white/8 hover:border-white/20'
                        }`}
                        title={name}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.src.replace(/\.[^.]+$/, '.jpg').replace('/media/', '/media/thumbs/')}
                          alt={name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          style={{ filter: `grayscale(1) brightness(${1 + (ov.intensity - 0.7)}) contrast(${1 + (ov.contrast ?? 0) * 3})${item.invert ? ' invert(1)' : ''}` }}
                        />
                      </button>
                      {confirmDelete === i ? (
                        <button onClick={() => { setConfirmDelete(null); clearTimeout(confirmTimer.current); onRemoveMedia(i); }} className="absolute -top-1 -right-1 px-1 h-4 rounded-full bg-red-600 hover:bg-red-500 text-white text-[8px] font-medium flex items-center justify-center cursor-pointer z-10">Delete</button>
                      ) : (
                        <button onClick={() => { setConfirmDelete(i); clearTimeout(confirmTimer.current); confirmTimer.current = setTimeout(() => setConfirmDelete(null), 3000); }} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500/70 hover:bg-red-500 text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" title="Remove">&times;</button>
                      )}
                      <div className="flex gap-0.5">
                        <button onClick={() => onUpdateMediaItem(i, { ...item, playMode: item.playMode === 'loop' ? 'pingpong' : 'loop' })} className="text-[8px] px-0.5 rounded bg-white/6 hover:bg-white/12 text-white/35 cursor-pointer" title={item.playMode === 'loop' ? 'Loop' : 'Ping-pong'}>{item.playMode === 'loop' ? '↻' : '↔'}</button>
                        <button onClick={() => onUpdateMediaItem(i, { ...item, invert: !item.invert })} className={`text-[8px] px-0.5 rounded cursor-pointer ${item.invert ? 'bg-white/15 text-white/65' : 'bg-white/6 hover:bg-white/12 text-white/35'}`} title="Invert">inv</button>
                      </div>
                      <Slider label="Int" value={ov.intensity} min={0} max={1.5} step={0.05} onChange={v => setMediaOverrideProp(item.src, 'intensity', v)} />
                      <Slider label="Lvl" value={ov.contrast ?? 0} min={0} max={0.8} step={0.05} onChange={v => setMediaOverrideProp(item.src, 'contrast', v)} />
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="Audio" collapsed={!audioOpen} onToggle={() => setAudioOpen(!audioOpen)}>
            <button onClick={onToggleAudio} className={`px-2 py-1 text-[11px] rounded transition-colors cursor-pointer ${audioActive ? 'bg-green-600/25 text-green-300 border border-green-500/25' : 'bg-white/6 text-white/45'}`}>
              {audioActive ? 'Mic Active' : 'Enable Mic'}
            </button>
            <div className="grid grid-cols-2 gap-x-4">
              <Slider label="Gain" value={ps.micGain ?? 1} min={0} max={3} step={0.1} onChange={v => setPresetSetting('micGain', v)} />
              <Slider label="Sensitivity" value={ps.soundSensitivity ?? 0.7} min={0} max={3} step={0.05} onChange={v => setPresetSetting('soundSensitivity', v)} />
              <Slider label="Smoothing" value={ps.soundSmoothing ?? 0.95} min={0.8} max={0.99} step={0.01} onChange={v => setPresetSetting('soundSmoothing', v)} />
              <Slider label="Burst Decay" value={ps.soundBurstDecay ?? 0.92} min={0.8} max={0.99} step={0.01} onChange={v => setPresetSetting('soundBurstDecay', v)} />
            </div>
          </Section>

          <Section title="Colors (Global)" collapsed={!colorsOpen} onToggle={() => setColorsOpen(!colorsOpen)}>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-white/55">BG</span>
              <input type="color" value={appState.globalColors.backgroundColor} onChange={e => setColor('backgroundColor', e.target.value)} className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent" />
              <span className="text-[11px] text-white/55 ml-2">Palette</span>
              {appState.globalColors.paletteColors.map((c, i) => (
                <input key={i} type="color" value={c} onChange={e => setPaletteColor(i, e.target.value)} className="w-6 h-6 rounded border-0 cursor-pointer bg-transparent" />
              ))}
            </div>
            <Slider label="Hue Variation" value={appState.globalColors.hueVariation} min={0} max={60} step={1} onChange={v => setColor('hueVariation', v)} />
          </Section>
        </div>
      </div>
    </div>
  );
}
