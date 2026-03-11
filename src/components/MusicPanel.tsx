'use client';

import { AppState, ScaleType, MidSound, SpeedSubdivision, MusicConfig } from '@/types';

interface Props {
  visible: boolean;
  appState: AppState;
  editingPreset: number;
  onUpdate: (updater: (prev: AppState) => AppState) => void;
}

function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1 py-0.5">
      <div className="flex justify-between text-[11px]">
        <span className="text-white/60">{label}</span>
        <span className="text-white/40 tabular-nums">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-1 cursor-pointer" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg" style={{ padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)' }}>
      <span className="text-[10px] uppercase tracking-widest font-medium text-white/35">{title}</span>
      {children}
    </div>
  );
}

const SPEED_OPTIONS: SpeedSubdivision[] = ['1/1', '1/2', '1/3', '1/4', '1/6', '1/8', '1/16'];
const SOUND_OPTIONS: { value: MidSound; label: string }[] = [
  { value: 'xylophone', label: 'Xylophone' },
  { value: 'rhodes', label: 'Rhodes' },
  { value: 'breathy', label: 'Breathy' },
  { value: 'bell', label: 'Bell' },
  { value: 'kalimba', label: 'Kalimba' },
  { value: 'glass', label: 'Glass' },
];

export default function MusicPanel({ visible, appState, editingPreset, onUpdate }: Props) {
  const m = appState.music;
  const preset = appState.livePresets[editingPreset];

  const setMusic = <K extends keyof MusicConfig>(key: K, value: MusicConfig[K]) => {
    onUpdate(prev => ({ ...prev, music: { ...prev.music, [key]: value } }));
  };

  const setInst = (inst: 'pling' | 'mid1' | 'mid2' | 'pad', key: string, value: unknown) => {
    onUpdate(prev => ({
      ...prev,
      music: { ...prev.music, [inst]: { ...prev.music[inst], [key]: value } },
    }));
  };

  const setPresetInst = (inst: 'pling' | 'mid1' | 'mid2' | 'pad', on: boolean) => {
    onUpdate(prev => {
      const presets = [...prev.livePresets] as AppState['livePresets'];
      presets[editingPreset] = {
        ...presets[editingPreset],
        musicInstruments: { ...presets[editingPreset].musicInstruments, [inst]: on },
      };
      return { ...prev, livePresets: presets };
    });
  };

  const setVR = (key: string, value: number) => {
    onUpdate(prev => ({
      ...prev,
      music: { ...prev.music, visualReactions: { ...prev.music.visualReactions, [key]: value } },
    }));
  };

  return (
    <div className={`fixed z-50 transition-all duration-300
      top-0 left-0 bottom-0 w-[300px]
      sm:top-4 sm:left-4 sm:bottom-4 sm:max-w-[calc(100vw-440px)]
      ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8 pointer-events-none'}`}>
      <div className="h-full sm:rounded-2xl bg-black/35 backdrop-blur-2xl border-r sm:border border-white/8 overflow-y-scroll">
        <div className="flex flex-col gap-2.5 p-5">

          <h2 className="text-white/90 text-xs font-medium tracking-[0.2em] uppercase pb-1">Music</h2>

          {/* Global */}
          <Section title="Global">
            <div className="flex gap-1.5 py-0.5">
              {(['pentatonic-major', 'pentatonic-minor'] as ScaleType[]).map(s => (
                <button key={s} onClick={() => setMusic('scale', s)}
                  className={`flex-1 px-2 py-1 text-[10px] rounded-md transition-colors cursor-pointer ${
                    m.scale === s ? 'bg-white/18 text-white border border-white/25' : 'bg-white/6 hover:bg-white/12 text-white/60'
                  }`}>{s === 'pentatonic-major' ? 'Penta Maj' : 'Penta Min'}</button>
              ))}
            </div>
            <Slider label="Tempo" value={m.tempo} min={40} max={80} step={1} onChange={v => setMusic('tempo', v)} />
            <Slider label="Master Vol" value={m.masterVolume} min={0} max={1} step={0.05} onChange={v => setMusic('masterVolume', v)} />
          </Section>

          {/* Pling */}
          <Section title="Pling">
            <label className="flex items-center gap-2 cursor-pointer py-0.5">
              <input type="checkbox" checked={preset.musicInstruments.pling} onChange={e => setPresetInst('pling', e.target.checked)} className="accent-white/60 w-3.5 h-3.5" />
              <span className="text-[11px] text-white/60">Enabled (preset {editingPreset + 1})</span>
            </label>
            <Slider label="Volume" value={m.pling.volume} min={0} max={1} step={0.05} onChange={v => setInst('pling', 'volume', v)} />
            <div className="flex gap-1 flex-wrap py-0.5">
              {SPEED_OPTIONS.map(s => (
                <button key={s} onClick={() => setInst('pling', 'speed', s)}
                  className={`px-1.5 py-0.5 text-[10px] rounded-sm cursor-pointer ${
                    m.pling.speed === s ? 'bg-white/20 text-white' : 'bg-white/6 text-white/50'
                  }`}>{s}</button>
              ))}
            </div>
            <Slider label="Trigger %" value={m.pling.triggerProbability} min={0} max={1} step={0.05} onChange={v => setInst('pling', 'triggerProbability', v)} />
            <Slider label="LFO Speed" value={m.pling.lfoSpeed} min={0.1} max={10} step={0.1} onChange={v => setInst('pling', 'lfoSpeed', v)} />
            <Slider label="LFO Depth" value={m.pling.lfoDepth} min={0} max={1} step={0.05} onChange={v => setInst('pling', 'lfoDepth', v)} />
            <div className="flex gap-2">
              <div className="flex-1">
                <Slider label="Octave Low" value={m.pling.octaveLow} min={2} max={7} step={1} onChange={v => setInst('pling', 'octaveLow', Math.min(v, m.pling.octaveHigh))} />
              </div>
              <div className="flex-1">
                <Slider label="Octave High" value={m.pling.octaveHigh} min={2} max={7} step={1} onChange={v => setInst('pling', 'octaveHigh', Math.max(v, m.pling.octaveLow))} />
              </div>
            </div>
            <Slider label="Filter Cutoff" value={m.pling.filterCutoff} min={200} max={8000} step={50} onChange={v => setInst('pling', 'filterCutoff', v)} />
            <Slider label="Filter Q" value={m.pling.filterQ} min={0.5} max={15} step={0.5} onChange={v => setInst('pling', 'filterQ', v)} />
            <Slider label="Decay" value={m.pling.decay} min={0.02} max={1} step={0.02} onChange={v => setInst('pling', 'decay', v)} />
            <Slider label="Delay" value={m.pling.delay} min={0} max={1} step={0.05} onChange={v => setInst('pling', 'delay', v)} />
            <Slider label="Reverb" value={m.pling.reverb} min={0} max={1} step={0.05} onChange={v => setInst('pling', 'reverb', v)} />
          </Section>

          {/* Mid 1 */}
          <Section title="Mid 1">
            <label className="flex items-center gap-2 cursor-pointer py-0.5">
              <input type="checkbox" checked={preset.musicInstruments.mid1} onChange={e => setPresetInst('mid1', e.target.checked)} className="accent-white/60 w-3.5 h-3.5" />
              <span className="text-[11px] text-white/60">Enabled (preset {editingPreset + 1})</span>
            </label>
            <div className="flex gap-1 flex-wrap py-0.5">
              {SOUND_OPTIONS.map(s => (
                <button key={s.value} onClick={() => setInst('mid1', 'sound', s.value)}
                  className={`px-1.5 py-0.5 text-[10px] rounded-sm cursor-pointer ${
                    m.mid1.sound === s.value ? 'bg-white/20 text-white' : 'bg-white/6 text-white/50'
                  }`}>{s.label}</button>
              ))}
            </div>
            <Slider label="Volume" value={m.mid1.volume} min={0} max={1} step={0.05} onChange={v => setInst('mid1', 'volume', v)} />
            <div className="flex gap-1 flex-wrap py-0.5">
              {SPEED_OPTIONS.map(s => (
                <button key={s} onClick={() => setInst('mid1', 'speed', s)}
                  className={`px-1.5 py-0.5 text-[10px] rounded-sm cursor-pointer ${
                    m.mid1.speed === s ? 'bg-white/20 text-white' : 'bg-white/6 text-white/50'
                  }`}>{s}</button>
              ))}
            </div>
            <Slider label="Trigger %" value={m.mid1.triggerProbability} min={0} max={1} step={0.05} onChange={v => setInst('mid1', 'triggerProbability', v)} />
            <Slider label="Delay" value={m.mid1.delay} min={0} max={1} step={0.05} onChange={v => setInst('mid1', 'delay', v)} />
            <Slider label="Reverb" value={m.mid1.reverb} min={0} max={1} step={0.05} onChange={v => setInst('mid1', 'reverb', v)} />
          </Section>

          {/* Mid 2 */}
          <Section title="Mid 2">
            <label className="flex items-center gap-2 cursor-pointer py-0.5">
              <input type="checkbox" checked={preset.musicInstruments.mid2} onChange={e => setPresetInst('mid2', e.target.checked)} className="accent-white/60 w-3.5 h-3.5" />
              <span className="text-[11px] text-white/60">Enabled (preset {editingPreset + 1})</span>
            </label>
            <div className="flex gap-1 flex-wrap py-0.5">
              {SOUND_OPTIONS.map(s => (
                <button key={s.value} onClick={() => setInst('mid2', 'sound', s.value)}
                  className={`px-1.5 py-0.5 text-[10px] rounded-sm cursor-pointer ${
                    m.mid2.sound === s.value ? 'bg-white/20 text-white' : 'bg-white/6 text-white/50'
                  }`}>{s.label}</button>
              ))}
            </div>
            <Slider label="Volume" value={m.mid2.volume} min={0} max={1} step={0.05} onChange={v => setInst('mid2', 'volume', v)} />
            <div className="flex gap-1 flex-wrap py-0.5">
              {SPEED_OPTIONS.map(s => (
                <button key={s} onClick={() => setInst('mid2', 'speed', s)}
                  className={`px-1.5 py-0.5 text-[10px] rounded-sm cursor-pointer ${
                    m.mid2.speed === s ? 'bg-white/20 text-white' : 'bg-white/6 text-white/50'
                  }`}>{s}</button>
              ))}
            </div>
            <Slider label="Trigger %" value={m.mid2.triggerProbability} min={0} max={1} step={0.05} onChange={v => setInst('mid2', 'triggerProbability', v)} />
            <Slider label="Delay" value={m.mid2.delay} min={0} max={1} step={0.05} onChange={v => setInst('mid2', 'delay', v)} />
            <Slider label="Reverb" value={m.mid2.reverb} min={0} max={1} step={0.05} onChange={v => setInst('mid2', 'reverb', v)} />
          </Section>

          {/* Pad */}
          <Section title="Pad">
            <label className="flex items-center gap-2 cursor-pointer py-0.5">
              <input type="checkbox" checked={preset.musicInstruments.pad} onChange={e => setPresetInst('pad', e.target.checked)} className="accent-white/60 w-3.5 h-3.5" />
              <span className="text-[11px] text-white/60">Enabled (preset {editingPreset + 1})</span>
            </label>
            <Slider label="Volume" value={m.pad.volume} min={0} max={1} step={0.05} onChange={v => setInst('pad', 'volume', v)} />
            <Slider label="Chord Interval (bars)" value={m.pad.chordInterval} min={1} max={8} step={1} onChange={v => setInst('pad', 'chordInterval', v)} />
            <Slider label="Reverb" value={m.pad.reverb} min={0} max={1} step={0.05} onChange={v => setInst('pad', 'reverb', v)} />
          </Section>

          {/* Visual Reactions */}
          <Section title="Visual Reactions">
            <Slider label="Swirl Strength" value={m.visualReactions.swirlStrength} min={0} max={1} step={0.05} onChange={v => setVR('swirlStrength', v)} />
            <Slider label="Swirl Radius" value={m.visualReactions.swirlRadius} min={0.05} max={0.5} step={0.01} onChange={v => setVR('swirlRadius', v)} />
            <Slider label="Size Pulse" value={m.visualReactions.sizePulseStrength} min={0} max={1} step={0.05} onChange={v => setVR('sizePulseStrength', v)} />
            <Slider label="Bass Boost" value={m.visualReactions.bassSizeBoost} min={0} max={1} step={0.05} onChange={v => setVR('bassSizeBoost', v)} />
          </Section>

        </div>
      </div>
    </div>
  );
}
