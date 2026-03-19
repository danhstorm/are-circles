import {
  MusicConfig, MidConfig, ScaleType, MidSound, SpeedSubdivision, SwirlImpulse,
} from '@/types';
import { DrumMachine, defaultDrumConfig } from './drums';

const SCALES: Record<ScaleType, number[]> = {
  'pentatonic-major': [0, 2, 4, 7, 9],
  'pentatonic-minor': [0, 3, 5, 7, 10],
};

const MID_PRESETS: Record<MidSound, {
  modRatio: number; modIndex: number; modDecay: number;
  attack: number; decay: number; sustain: number; release: number;
  filterCutoff: number; filterQ: number;
  hasNoise?: boolean; noiseLevel?: number;
}> = {
  xylophone: { modRatio: 3.0, modIndex: 5, modDecay: 0.06, attack: 0.002, decay: 1.2, sustain: 0, release: 1.5, filterCutoff: 4000, filterQ: 0.7 },
  rhodes:    { modRatio: 1.0, modIndex: 2.0, modDecay: 0.8, attack: 0.01, decay: 2.0, sustain: 0.15, release: 2.5, filterCutoff: 2500, filterQ: 0.5 },
  breathy:   { modRatio: 0.5, modIndex: 0.6, modDecay: 1.5, attack: 0.08, decay: 2.5, sustain: 0.25, release: 3.0, filterCutoff: 1800, filterQ: 0.4, hasNoise: true, noiseLevel: 0.12 },
  bell:      { modRatio: 3.5, modIndex: 6, modDecay: 1.0, attack: 0.002, decay: 3.0, sustain: 0.03, release: 4.0, filterCutoff: 5000, filterQ: 0.8 },
  kalimba:   { modRatio: 2.0, modIndex: 3, modDecay: 0.1, attack: 0.002, decay: 1.8, sustain: 0, release: 2.0, filterCutoff: 3000, filterQ: 0.6 },
  glass:     { modRatio: 1.5, modIndex: 0.8, modDecay: 2.0, attack: 0.02, decay: 3.5, sustain: 0.08, release: 4.0, filterCutoff: 3500, filterQ: 0.5 },
};

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function subdivisionToBeats(sub: SpeedSubdivision): number {
  switch (sub) {
    case '1/1': return 4;
    case '1/2': return 2;
    case '1/3': return 4 / 3;
    case '1/4': return 1;
    case '1/6': return 2 / 3;
    case '1/8': return 0.5;
    case '1/16': return 0.25;
  }
}

function getScaleNotesInRange(scale: number[], midiLow: number, midiHigh: number): number[] {
  const notes: number[] = [];
  for (let octave = 0; octave < 10; octave++) {
    for (const degree of scale) {
      const midi = 12 * octave + degree;
      if (midi >= midiLow && midi <= midiHigh) notes.push(midi);
    }
  }
  return notes;
}

function pickRandomNote(notes: number[], fallback: number): number {
  return notes[Math.floor(Math.random() * notes.length)] ?? fallback;
}

function nearestNote(notes: number[], target: number): number {
  let best = notes[0] ?? target;
  let bestDist = Infinity;
  for (const note of notes) {
    const dist = Math.abs(note - target);
    if (dist < bestDist) {
      best = note;
      bestDist = dist;
    }
  }
  return best;
}

function pickNearNote(notes: number[], target: number, repeatness: number): number {
  if (!notes.length) return target;
  const nearest = nearestNote(notes, target);
  if (repeatness >= 0.999) return nearest;

  const spread = 0.6 + (1 - repeatness) * 4.4;
  const weights = notes.map((note) => Math.exp(-Math.abs(note - target) / spread));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return nearest;

  let choice = Math.random() * total;
  for (let i = 0; i < notes.length; i++) {
    choice -= weights[i];
    if (choice <= 0) return notes[i];
  }
  return nearest;
}

function pickChord(scale: number[], bassMidi: number): number[] {
  const notes: number[] = [];
  for (let octave = 0; octave < 10; octave++) {
    for (const degree of scale) {
      const midi = 12 * octave + degree;
      if (midi >= bassMidi && midi <= bassMidi + 24) notes.push(midi);
    }
  }
  if (notes.length < 3) return notes;
  const root = notes[Math.floor(Math.random() * Math.min(3, notes.length))];
  const chord = [root];
  // Find nearest scale note to a third above root (3-4 semitones)
  let bestThird = -1;
  let bestThirdDist = 99;
  for (const n of notes) {
    if (n <= root) continue;
    const dist = Math.min(Math.abs(n - root - 3), Math.abs(n - root - 4));
    if (dist < bestThirdDist) { bestThirdDist = dist; bestThird = n; }
  }
  if (bestThird > 0) chord.push(bestThird);
  // Find nearest scale note to a fifth above root (7 semitones)
  let bestFifth = -1;
  let bestFifthDist = 99;
  for (const n of notes) {
    if (n <= root + 4) continue;
    const dist = Math.abs(n - root - 7);
    if (dist < bestFifthDist) { bestFifthDist = dist; bestFifth = n; }
  }
  if (bestFifth > 0) chord.push(bestFifth);
  return chord;
}

function generateIR(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const len = ctx.sampleRate * duration;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export const defaultMusicConfig: MusicConfig = {
  scale: 'pentatonic-major',
  tempo: 54,
  masterVolume: 0.7,
  pling: {
    volumeMin: 0.1, volumeMax: 0.35, speed: '1/8', triggerProbability: 0.35, rhythmRepeat: 0.2, toneRepeat: 0.2,
    delay: 0.4, reverb: 0.6, lfoSpeed: 1.5, lfoDepth: 0.3,
    octaveLow: 4, octaveHigh: 7, filterCutoff: 3000, filterQ: 1.5, decay: 0.2,
    autoFilterMin: 1200, autoFilterMax: 4500, autoDecayMin: 0.08, autoDecayMax: 0.3,
    autoLfoSpeedMin: 1.5, autoLfoSpeedMax: 1.5, autoLfoDepthMin: 0.3, autoLfoDepthMax: 0.3,
    autoTriggerMin: 0.35, autoTriggerMax: 0.35, autoSpeed: 0.06,
  },
  mid1: {
    volumeMin: 0.2, volumeMax: 0.5, sound: 'glass', speed: '1/2', triggerProbability: 0.35, rhythmRepeat: 0.2, toneRepeat: 0.2,
    octaveLow: 3, octaveHigh: 5, filterCutoff: 3000, decay: 1.5, fmAmount: 0.6,
    delay: 0.3, reverb: 0.5,
    autoFilterMin: 3000, autoFilterMax: 3000, autoDecayMin: 1.5, autoDecayMax: 1.5,
    autoFmMin: 0.6, autoFmMax: 0.6, autoTriggerMin: 0.35, autoTriggerMax: 0.35, autoSpeed: 0.04,
  },
  mid2: {
    volumeMin: 0.15, volumeMax: 0.4, sound: 'rhodes', speed: '1/4', triggerProbability: 0.2, rhythmRepeat: 0.2, toneRepeat: 0.2,
    octaveLow: 2, octaveHigh: 4, filterCutoff: 2000, decay: 2.0, fmAmount: 0.8,
    delay: 0.4, reverb: 0.6,
    autoFilterMin: 2000, autoFilterMax: 2000, autoDecayMin: 2.0, autoDecayMax: 2.0,
    autoFmMin: 0.8, autoFmMax: 0.8, autoTriggerMin: 0.2, autoTriggerMax: 0.2, autoSpeed: 0.04,
  },
  pad: { volume: 0.2, chordInterval: 4, reverb: 0.7, filterCutoff: 600, octaveLow: 2, octaveHigh: 3 },
  drums: defaultDrumConfig,
  visualReactions: { swirlStrength: 0.2, swirlRadius: 0.08, sizePulseStrength: 0.15, bassSizeBoost: 0.15 },
};

type RepeatInstrumentId = 'pling' | 'mid1' | 'mid2';

interface RepeatMemory {
  slotsPerBar: number;
  currentBar: number | null;
  hasPreviousBar: boolean;
  previousTriggered: boolean[];
  previousNotes: (number | null)[];
  currentTriggered: boolean[];
  currentNotes: (number | null)[];
}

interface RepeatSlotContext {
  memory: RepeatMemory;
  slotIndex: number;
}

function makeRepeatMemory(slotsPerBar: number): RepeatMemory {
  return {
    slotsPerBar,
    currentBar: null,
    hasPreviousBar: false,
    previousTriggered: Array(slotsPerBar).fill(false),
    previousNotes: Array(slotsPerBar).fill(null),
    currentTriggered: Array(slotsPerBar).fill(false),
    currentNotes: Array(slotsPerBar).fill(null),
  };
}

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverbConv: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayGain: GainNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayFilter: BiquadFilterNode | null = null;

  private config: MusicConfig;
  private instEnabled = { pling: false, mid1: false, mid2: false, pad: false, drums: false };
  readonly drums: DrumMachine;

  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private readonly LOOKAHEAD = 0.1;
  private beatOrigin = 0;
  private nextBeat = { pling: 0, mid1: 0, mid2: 0 };
  private padNextChordBeat = 0;
  private padActiveChord: { oscs: OscillatorNode[]; gains: GainNode[]; noteCount: number } | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private pendingSwirls: SwirlImpulse[] = [];
  private pendingNotePulses: { count: number; strength: number }[] = [];
  private _sizePulse = 0;
  private _playing = false;
  private autoPhase = 0;
  private autoMid1Phase = 0;
  private autoMid2Phase = 0;
  private repeatMemory: Record<RepeatInstrumentId, RepeatMemory> = {
    pling: makeRepeatMemory(8),
    mid1: makeRepeatMemory(2),
    mid2: makeRepeatMemory(4),
  };

  get isPlaying() { return this._playing; }

  constructor(config?: MusicConfig) {
    this.config = config ? { ...config } : { ...defaultMusicConfig };
    this.drums = new DrumMachine(this.config.drums);
  }

  async start(fadeDur = 2) {
    if (this._playing) return;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.buildGraph();
        this.drums.init(this.ctx, this.masterGain!, this.delayNode);
      }
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
    } catch {
      return;
    }
    this._playing = true;
    this.beatOrigin = this.ctx.currentTime + 0.05;
    this.nextBeat = { pling: 0, mid1: 0, mid2: 0 };
    this.padNextChordBeat = 0;
    this.resetRepeatMemory();
    this.fadeIn(fadeDur);
    this.schedulerTimer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (!this._playing) return;
    this.fadeOut(2);
    setTimeout(() => {
      this._playing = false;
      if (this.schedulerTimer) clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
      this.killPad();
      this.ctx?.suspend();
    }, 2200);
  }

  updateConfig(c: MusicConfig) {
    const old = this.config;
    this.config = { ...c };
    if (this.ctx && this.masterGain) {
      const t = this.ctx.currentTime;
      if (c.masterVolume !== old.masterVolume) {
        this.masterGain.gain.cancelScheduledValues(t);
        this.masterGain.gain.setTargetAtTime(c.masterVolume, t, 0.05);
      }
    }
    if (this.delayNode && this.ctx) {
      this.delayNode.delayTime.setTargetAtTime(60 / c.tempo, this.ctx.currentTime, 0.1);
    }
    // On tempo change, rebase the beat origin so instruments stay on the grid
    if (this.ctx && this._playing && c.tempo !== old.tempo) {
      const now = this.ctx.currentTime;
      const oldBeatDur = 60 / old.tempo;
      const currentBeat = (now - this.beatOrigin) / oldBeatDur;
      this.beatOrigin = now - currentBeat * (60 / c.tempo);
      this.drums.rebaseBeat(old.tempo, c.tempo, this.beatOrigin, now);
    }
    // On speed change, snap instrument to next grid-aligned beat
    if (this.ctx && this._playing) {
      const now = this.ctx.currentTime;
      const beatDur = 60 / c.tempo;
      const currentBeat = (now - this.beatOrigin) / beatDur;
      if (c.pling.speed !== old.pling.speed) {
        const interval = subdivisionToBeats(c.pling.speed);
        this.nextBeat.pling = Math.ceil(currentBeat / interval) * interval;
        this.resetRepeatMemory('pling');
      }
      if (c.mid1.speed !== old.mid1.speed) {
        const interval = subdivisionToBeats(c.mid1.speed);
        this.nextBeat.mid1 = Math.ceil(currentBeat / interval) * interval;
        this.resetRepeatMemory('mid1');
      }
      if (c.mid2.speed !== old.mid2.speed) {
        const interval = subdivisionToBeats(c.mid2.speed);
        this.nextBeat.mid2 = Math.ceil(currentBeat / interval) * interval;
        this.resetRepeatMemory('mid2');
      }
      if (c.pad.chordInterval !== old.pad.chordInterval) {
        const interval = c.pad.chordInterval * 4;
        this.padNextChordBeat = Math.ceil(currentBeat / interval) * interval;
      }
    }
    // Pad: update active chord volume in real-time
    if (this.ctx && this.padActiveChord && c.pad.volume !== old.pad.volume) {
      const t = this.ctx.currentTime;
      const expVol = c.pad.volume * c.pad.volume / Math.sqrt(Math.max(1, this.padActiveChord.noteCount));
      for (const g of this.padActiveChord.gains) {
        g.gain.cancelScheduledValues(t);
        g.gain.setTargetAtTime(expVol, t, 0.1);
      }
    }
    // Pad: retrigger chord if tonal/timbral params changed (filter, octave, scale)
    if (this.ctx && this._playing && this.instEnabled.pad && this.padActiveChord) {
      const p = c.pad;
      const op = old.pad;
      if (p.filterCutoff !== op.filterCutoff ||
          p.octaveLow !== op.octaveLow || p.octaveHigh !== op.octaveHigh ||
          c.scale !== old.scale) {
        this.playPadChord(this.ctx.currentTime + 0.05);
        // Advance scheduler so it doesn't immediately fire another chord
        const beatDur = 60 / c.tempo;
        const currentBeat = (this.ctx.currentTime - this.beatOrigin) / beatDur;
        this.padNextChordBeat = currentBeat + c.pad.chordInterval * 4;
      }
    }
    // Drums: sync config, rebase on speed change
    this.drums.updateConfig(c.drums);
    if (this.ctx && this._playing && c.drums.speed !== old.drums.speed) {
      this.drums.rebaseSpeed(this.beatOrigin, c.tempo, this.ctx.currentTime);
    }
  }

  setInstrumentEnabled(inst: keyof typeof this.instEnabled, on: boolean) {
    this.instEnabled[inst] = on;
    if (!on && inst === 'pad') this.fadePadOut();
    if (inst === 'drums') this.drums.setEnabled(on);
  }

  fadeIn(dur = 2) {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.linearRampToValueAtTime(this.config.masterVolume, t + dur);
  }

  fadeOut(dur = 2) {
    if (!this.ctx || !this.masterGain) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.linearRampToValueAtTime(0, t + dur);
  }

  getSwirlImpulses(): SwirlImpulse[] {
    const out = this.pendingSwirls;
    this.pendingSwirls = [];
    return out;
  }

  getNotePulses(): { count: number; strength: number }[] {
    const out = this.pendingNotePulses;
    this.pendingNotePulses = [];
    return out;
  }

  getSizePulse(): number {
    const v = this._sizePulse;
    this._sizePulse *= 0.92;
    if (this._sizePulse < 0.001) this._sizePulse = 0;
    return v;
  }

  destroy() {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    this.killPad();
    this.drums.destroy();
    this.ctx?.close();
    this.ctx = null;
    this._playing = false;
  }

  // ─── Audio Graph ───

  private buildGraph() {
    const ctx = this.ctx!;

    // Brick-wall limiter before destination to prevent clipping
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 3;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.05;
    limiter.connect(ctx.destination);

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0;
    this.masterGain.connect(limiter);

    // Reverb
    this.reverbConv = ctx.createConvolver();
    this.reverbConv.buffer = generateIR(ctx, 2.5, 2.5);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.5;
    this.reverbConv.connect(this.reverbGain);
    this.reverbGain.connect(this.masterGain);

    // Delay with feedback
    this.delayNode = ctx.createDelay(4);
    this.delayNode.delayTime.value = 60 / this.config.tempo;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.3;
    this.delayFilter = ctx.createBiquadFilter();
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.value = 2000;
    this.delayGain = ctx.createGain();
    this.delayGain.gain.value = 0.4;
    this.delayNode.connect(this.delayFilter);
    this.delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayGain);
    this.delayGain.connect(this.masterGain);
  }

  // ─── Scheduler ───

  private beatToTime(beat: number): number {
    return this.beatOrigin + beat * (60 / this.config.tempo);
  }

  private pingPong(phase: number, lo: number, hi: number): number {
    if (lo >= hi) return lo;
    const t = (Math.sin(phase) + 1) * 0.5;
    return lo + t * (hi - lo);
  }

  private resetRepeatMemory(inst?: RepeatInstrumentId) {
    if (inst) {
      this.repeatMemory[inst] = makeRepeatMemory(this.repeatMemory[inst].slotsPerBar);
      return;
    }
    this.repeatMemory = {
      pling: makeRepeatMemory(this.repeatMemory.pling.slotsPerBar),
      mid1: makeRepeatMemory(this.repeatMemory.mid1.slotsPerBar),
      mid2: makeRepeatMemory(this.repeatMemory.mid2.slotsPerBar),
    };
  }

  private getRepeatSlot(inst: RepeatInstrumentId, beat: number, interval: number): RepeatSlotContext {
    const slotsPerBar = Math.max(1, Math.round(4 / interval));
    let memory = this.repeatMemory[inst];

    if (memory.slotsPerBar !== slotsPerBar) {
      memory = makeRepeatMemory(slotsPerBar);
      this.repeatMemory[inst] = memory;
    }

    const bar = Math.floor((beat + 1e-6) / 4);
    if (memory.currentBar === null) {
      memory.currentBar = bar;
    }

    while ((memory.currentBar ?? bar) < bar) {
      memory.previousTriggered = [...memory.currentTriggered];
      memory.previousNotes = [...memory.currentNotes];
      memory.currentTriggered = Array(slotsPerBar).fill(false);
      memory.currentNotes = Array(slotsPerBar).fill(null);
      memory.currentBar = (memory.currentBar ?? bar) + 1;
      memory.hasPreviousBar = true;
    }

    const slotIndex = ((Math.round(beat / interval) % slotsPerBar) + slotsPerBar) % slotsPerBar;
    return { memory, slotIndex };
  }

  private shouldTriggerRepeat(slot: RepeatSlotContext, baseProbability: number, repeatness: number): boolean {
    if (slot.memory.hasPreviousBar && Math.random() < repeatness) {
      return slot.memory.previousTriggered[slot.slotIndex] ?? false;
    }
    return Math.random() < baseProbability;
  }

  private recordRest(slot: RepeatSlotContext) {
    slot.memory.currentTriggered[slot.slotIndex] = false;
    slot.memory.currentNotes[slot.slotIndex] = null;
  }

  private recordNote(slot: RepeatSlotContext, midi: number) {
    slot.memory.currentTriggered[slot.slotIndex] = true;
    slot.memory.currentNotes[slot.slotIndex] = midi;
  }

  private pickRepeatedNote(
    scale: number[],
    midiLow: number,
    midiHigh: number,
    slot: RepeatSlotContext,
    toneRepeat: number,
  ): number {
    const notes = getScaleNotesInRange(scale, midiLow, midiHigh);
    const fallback = notes[0] ?? midiLow;
    const previousNote = slot.memory.hasPreviousBar ? slot.memory.previousNotes[slot.slotIndex] : null;

    if (previousNote !== null && Math.random() < toneRepeat) {
      return pickNearNote(notes, previousNote, toneRepeat);
    }
    return pickRandomNote(notes, fallback);
  }

  private schedule() {
    if (!this.ctx || !this._playing) return;
    const now = this.ctx.currentTime;
    const ahead = now + this.LOOKAHEAD;
    const c = this.config;

    // Advance automation phases (continuous, based on wall time)
    const elapsed = now - this.beatOrigin;
    this.autoPhase = elapsed * c.pling.autoSpeed * Math.PI * 2;
    this.autoMid1Phase = elapsed * c.mid1.autoSpeed * Math.PI * 2;
    this.autoMid2Phase = elapsed * c.mid2.autoSpeed * Math.PI * 2;

    // Pling (trigger probability is automated)
    if (this.instEnabled.pling) {
      const interval = subdivisionToBeats(c.pling.speed);
      const curTrigger = this.pingPong(this.autoPhase * 1.3, c.pling.autoTriggerMin, c.pling.autoTriggerMax);
      while (this.beatToTime(this.nextBeat.pling) < ahead) {
        const slot = this.getRepeatSlot('pling', this.nextBeat.pling, interval);
        if (this.shouldTriggerRepeat(slot, curTrigger, c.pling.rhythmRepeat)) {
          this.playPling(this.beatToTime(this.nextBeat.pling), slot);
        } else {
          this.recordRest(slot);
        }
        this.nextBeat.pling += interval;
      }
    } else {
      const currentBeat = (now - this.beatOrigin) / (60 / c.tempo);
      if (this.nextBeat.pling < currentBeat) this.nextBeat.pling = currentBeat;
    }

    // Mid1 (trigger probability, filter, decay, FM are automated)
    if (this.instEnabled.mid1) {
      const interval = subdivisionToBeats(c.mid1.speed);
      const curTrigger = this.pingPong(this.autoMid1Phase * 1.3, c.mid1.autoTriggerMin, c.mid1.autoTriggerMax);
      while (this.beatToTime(this.nextBeat.mid1) < ahead) {
        const slot = this.getRepeatSlot('mid1', this.nextBeat.mid1, interval);
        if (this.shouldTriggerRepeat(slot, curTrigger, c.mid1.rhythmRepeat)) {
          this.playMid(this.beatToTime(this.nextBeat.mid1), c.mid1, this.autoMid1Phase, slot);
        } else {
          this.recordRest(slot);
        }
        this.nextBeat.mid1 += interval;
      }
    } else {
      const currentBeat = (now - this.beatOrigin) / (60 / c.tempo);
      if (this.nextBeat.mid1 < currentBeat) this.nextBeat.mid1 = currentBeat;
    }

    // Mid2 (trigger probability, filter, decay, FM are automated)
    if (this.instEnabled.mid2) {
      const interval = subdivisionToBeats(c.mid2.speed);
      const curTrigger = this.pingPong(this.autoMid2Phase * 1.3, c.mid2.autoTriggerMin, c.mid2.autoTriggerMax);
      while (this.beatToTime(this.nextBeat.mid2) < ahead) {
        const slot = this.getRepeatSlot('mid2', this.nextBeat.mid2, interval);
        if (this.shouldTriggerRepeat(slot, curTrigger, c.mid2.rhythmRepeat)) {
          this.playMid(this.beatToTime(this.nextBeat.mid2), c.mid2, this.autoMid2Phase, slot);
        } else {
          this.recordRest(slot);
        }
        this.nextBeat.mid2 += interval;
      }
    } else {
      const currentBeat = (now - this.beatOrigin) / (60 / c.tempo);
      if (this.nextBeat.mid2 < currentBeat) this.nextBeat.mid2 = currentBeat;
    }

    // Pad: only schedule one chord at a time; skip past any missed beats
    if (this.instEnabled.pad) {
      const interval = c.pad.chordInterval * 4;
      if (this.beatToTime(this.padNextChordBeat) < ahead) {
        // Skip ahead to the latest due beat (prevents chord stacking on catch-up)
        while (this.beatToTime(this.padNextChordBeat + interval) < ahead) {
          this.padNextChordBeat += interval;
        }
        this.playPadChord(Math.max(now, this.beatToTime(this.padNextChordBeat)));
        this.padNextChordBeat += interval;
      }
    } else {
      const currentBeat = (now - this.beatOrigin) / (60 / c.tempo);
      if (this.padNextChordBeat < currentBeat) this.padNextChordBeat = currentBeat;
    }

    // Drums: delegate to DrumMachine (always called so it tracks beat position)
    this.drums.schedule(this.beatOrigin, c.tempo, now, ahead);
  }

  // ─── Pling ───

  private playPling(time: number, slot: RepeatSlotContext) {
    const ctx = this.ctx!;
    const c = this.config.pling;
    const scale = SCALES[this.config.scale];
    const midiLow = c.octaveLow * 12 + 12;
    const midiHigh = c.octaveHigh * 12 + 12;
    const midi = this.pickRepeatedNote(scale, midiLow, midiHigh, slot, c.toneRepeat);
    const freq = midiToFreq(midi);

    // Automated values (ping-pong, each at slightly different phase rates)
    const curFilter = this.pingPong(this.autoPhase, c.autoFilterMin, c.autoFilterMax);
    const curDecay = this.pingPong(this.autoPhase * 0.7, c.autoDecayMin, c.autoDecayMax);
    const curLfoSpeed = this.pingPong(this.autoPhase * 0.5, c.autoLfoSpeedMin, c.autoLfoSpeedMax);
    const curLfoDepth = this.pingPong(this.autoPhase * 0.9, c.autoLfoDepthMin, c.autoLfoDepthMax);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = curFilter;
    filter.Q.value = c.filterQ;

    // LFO on filter cutoff
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = curLfoSpeed;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = curLfoDepth * curFilter * 0.75;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start(time);

    const decay = Math.max(0.02, curDecay);
    const noteDur = decay * 4 + 0.2;
    // Random volume within range
    const rawVol = c.volumeMin + Math.random() * (c.volumeMax - c.volumeMin);
    const vol = rawVol * rawVol;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(vol, time + 0.01);
    env.gain.setTargetAtTime(vol * 0.1, time + 0.01, decay);
    env.gain.setTargetAtTime(0, time + decay * 3, decay * 0.7);

    osc.connect(filter);
    filter.connect(env);

    // Dry → master
    const dry = ctx.createGain();
    dry.gain.value = 1 - Math.max(c.delay, c.reverb) * 0.5;
    env.connect(dry);
    dry.connect(this.masterGain!);

    // Delay send
    if (c.delay > 0.01 && this.delayNode) {
      const ds = ctx.createGain();
      ds.gain.value = c.delay;
      env.connect(ds);
      ds.connect(this.delayNode);
    }

    // Reverb send
    if (c.reverb > 0.01 && this.reverbConv) {
      const rs = ctx.createGain();
      rs.gain.value = c.reverb;
      env.connect(rs);
      rs.connect(this.reverbConv);
    }

    osc.start(time);
    const stopTime = time + noteDur + 0.5;
    osc.stop(stopTime);
    lfo.stop(stopTime);
    this.recordNote(slot, midi);

    // Swirl (pling: 30% strength)
    this.addSwirl(0.3, midi, midiLow, midiHigh);
    this.addSizePulse(midi, midiLow, midiHigh, 0.3);
  }

  // ─── Mid (FM synthesis) ───

  private playMid(time: number, mc: MidConfig, autoPhase: number, slot: RepeatSlotContext) {
    const ctx = this.ctx!;
    const preset = MID_PRESETS[mc.sound];
    const scale = SCALES[this.config.scale];
    const midiLow = mc.octaveLow * 12 + 12;
    const midiHigh = mc.octaveHigh * 12 + 12;
    const midi = this.pickRepeatedNote(scale, midiLow, midiHigh, slot, mc.toneRepeat);
    const freq = midiToFreq(midi);
    const rawVol = mc.volumeMin + Math.random() * (mc.volumeMax - mc.volumeMin);
    const vol = rawVol * rawVol;

    // Automated values (ping-pong, each at slightly different phase rates)
    const curFilter = this.pingPong(autoPhase, mc.autoFilterMin, mc.autoFilterMax);
    const curDecay = this.pingPong(autoPhase * 0.7, mc.autoDecayMin, mc.autoDecayMax);
    const curFm = this.pingPong(autoPhase * 0.5, mc.autoFmMin, mc.autoFmMax);

    // Timing scaled by automated decay control
    const a = preset.attack;
    const d = preset.decay * curDecay;
    const s = preset.sustain;
    const r = preset.release * curDecay;
    const modDecayTime = preset.modDecay * curDecay;
    const noteDur = a + d * 3 + r * 2;

    // Output filter (softens FM harmonics)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = curFilter;
    filter.Q.value = preset.filterQ;

    // Amplitude envelope
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(vol, time + a);
    env.gain.setTargetAtTime(vol * s, time + a, d);
    env.gain.setTargetAtTime(0, time + a + d * 3, r * 0.5);

    // Single carrier
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;
    carrier.connect(filter);
    filter.connect(env);

    // FM modulator with decaying index (sound becomes purer over time)
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * preset.modRatio;
    const modGain = ctx.createGain();
    const modPeak = freq * preset.modIndex * curFm;
    modGain.gain.setValueAtTime(modPeak, time);
    modGain.gain.setTargetAtTime(modPeak * 0.1, time + a, modDecayTime);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    // Optional noise layer
    if (preset.hasNoise) {
      if (!this.noiseBuffer) {
        const bufSize = ctx.sampleRate * 2;
        this.noiseBuffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const noiseData = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) noiseData[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = freq;
      nf.Q.value = 3;
      const ng = ctx.createGain();
      const nl = preset.noiseLevel ?? 0.1;
      ng.gain.setValueAtTime(0, time);
      ng.gain.linearRampToValueAtTime(vol * nl, time + a * 2);
      ng.gain.setTargetAtTime(0, time + a + d * 3, r * 0.5);
      noise.connect(nf);
      nf.connect(ng);
      ng.connect(env);
      noise.start(time);
      noise.stop(time + noteDur + 1);
    }

    // Routing
    const dry = ctx.createGain();
    dry.gain.value = 1 - Math.max(mc.delay, mc.reverb) * 0.3;
    env.connect(dry);
    dry.connect(this.masterGain!);

    if (mc.delay > 0.01 && this.delayNode) {
      const ds = ctx.createGain();
      ds.gain.value = mc.delay;
      env.connect(ds);
      ds.connect(this.delayNode);
    }

    if (mc.reverb > 0.01 && this.reverbConv) {
      const rs = ctx.createGain();
      rs.gain.value = mc.reverb;
      env.connect(rs);
      rs.connect(this.reverbConv);
    }

    const stopTime = time + noteDur + 1;
    carrier.start(time);
    carrier.stop(stopTime);
    mod.start(time);
    mod.stop(stopTime);
    this.recordNote(slot, midi);

    this.addSwirl(vol * 3, midi, midiLow, midiHigh);
    this.addSizePulse(midi, midiLow, midiHigh, vol * 3);

    // Trigger random dot growth (1-3 dots, strength based on note volume)
    const dotCount = 1 + Math.floor(Math.random() * 3);
    this.pendingNotePulses.push({ count: dotCount, strength: vol * 2 });
  }

  // ─── Pad (sustained drone) ───

  private playPadChord(time: number) {
    const ctx = this.ctx!;
    const c = this.config.pad;
    const scale = SCALES[this.config.scale];
    const midiLow = c.octaveLow * 12 + 12;
    const midiHigh = c.octaveHigh * 12 + 12;
    const bassMidi = midiLow + Math.floor(Math.random() * Math.max(1, midiHigh - midiLow - 12));
    const chord = pickChord(scale, bassMidi);

    this.fadePadOut(4);

    const oscCount = chord.length;
    const expVol = c.volume * c.volume / Math.sqrt(Math.max(1, oscCount));

    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    const masterPadGain = ctx.createGain();
    masterPadGain.gain.setValueAtTime(0, time);
    masterPadGain.gain.linearRampToValueAtTime(expVol, time + 1.5);
    masterPadGain.connect(this.masterGain!);

    if (c.reverb > 0.01 && this.reverbConv) {
      const rs = ctx.createGain();
      rs.gain.value = c.reverb * 0.5;
      masterPadGain.connect(rs);
      rs.connect(this.reverbConv);
    }

    for (const midi of chord) {
      const freq = midiToFreq(midi);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      // Slow vibrato per note (slightly different rate per pitch for organic feel)
      const vib = ctx.createOscillator();
      vib.type = 'sine';
      vib.frequency.value = 3.5 + (midi % 5) * 0.4;
      const vibGain = ctx.createGain();
      vibGain.gain.setValueAtTime(0, time);
      vibGain.gain.linearRampToValueAtTime(freq * 0.004, time + 2);
      vib.connect(vibGain);
      vibGain.connect(osc.frequency);
      vib.start(time);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = c.filterCutoff;
      filter.Q.value = 0.7;
      osc.connect(filter);
      filter.connect(masterPadGain);
      osc.start(time);
      oscs.push(osc, vib);
    }
    gains.push(masterPadGain);
    this.padActiveChord = { oscs, gains, noteCount: chord.length };

    this._sizePulse = Math.min(1, this._sizePulse + this.config.visualReactions.sizePulseStrength * 0.15);
  }

  private fadePadOut(dur = 4) {
    if (!this.padActiveChord || !this.ctx) return;
    const t = this.ctx.currentTime;
    const { oscs, gains } = this.padActiveChord;
    for (const g of gains) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + dur);
    }
    const stopTime = t + dur + 0.1;
    for (const o of oscs) {
      try { o.stop(stopTime); } catch { /* already stopped */ }
    }
    // Disconnect nodes after fade to free audio graph resources
    setTimeout(() => {
      for (const o of oscs) { try { o.disconnect(); } catch { /* */ } }
      for (const g of gains) { try { g.disconnect(); } catch { /* */ } }
    }, (dur + 0.2) * 1000);
    this.padActiveChord = null;
  }

  private killPad() {
    if (!this.padActiveChord) return;
    for (const o of this.padActiveChord.oscs) {
      try { o.stop(); o.disconnect(); } catch { /* already stopped */ }
    }
    for (const g of this.padActiveChord.gains) {
      try { g.disconnect(); } catch { /* */ }
    }
    this.padActiveChord = null;
  }

  // ─── Visual Reactions ───

  private addSwirl(strengthMult: number, midi: number, midiLow: number, midiHigh: number) {
    const vr = this.config.visualReactions;
    if (vr.swirlStrength < 0.01) return;
    const pitchNorm = 1 - (midi - midiLow) / Math.max(1, midiHigh - midiLow);
    const strength = vr.swirlStrength * strengthMult * (0.5 + pitchNorm * 0.5);
    const angle = Math.random() * Math.PI * 2;
    // Randomize radius: use config swirlRadius as base, vary 0.3x-1.5x
    const radiusVariation = 0.3 + Math.random() * 1.2;
    const radius = vr.swirlRadius * radiusVariation;
    this.pendingSwirls.push({
      x: Math.random(),
      y: Math.random(),
      strength,
      radius,
      dx: Math.cos(angle) * 0.01,
      dy: Math.sin(angle) * 0.01,
      age: 0,
      maxAge: 0.6 + Math.random() * 0.8,
    });
  }

  private addSizePulse(midi: number, midiLow: number, midiHigh: number, mult: number) {
    const vr = this.config.visualReactions;
    if (vr.sizePulseStrength < 0.01) return;
    const pitchNorm = 1 - (midi - midiLow) / Math.max(1, midiHigh - midiLow);
    const bassBias = 1 + pitchNorm * vr.bassSizeBoost * 2;
    const pulse = vr.sizePulseStrength * mult * bassBias * 0.15;
    this._sizePulse = Math.min(1, this._sizePulse + pulse);
  }
}
