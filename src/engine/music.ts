import {
  MusicConfig, ScaleType, MidSound, SpeedSubdivision, SwirlImpulse,
} from '@/types';

const SCALES: Record<ScaleType, number[]> = {
  'pentatonic-major': [0, 2, 4, 7, 9],
  'pentatonic-minor': [0, 3, 5, 7, 10],
};

const MID_PRESETS: Record<MidSound, {
  modRatio: number; modIndex: number;
  attack: number; decay: number; sustain: number; release: number;
  hasNoise?: boolean;
}> = {
  xylophone: { modRatio: 3.0, modIndex: 8, attack: 0.001, decay: 0.08, sustain: 0, release: 0.2 },
  rhodes:    { modRatio: 1.0, modIndex: 2.5, attack: 0.005, decay: 0.3, sustain: 0.2, release: 0.5 },
  breathy:   { modRatio: 0.5, modIndex: 0.8, attack: 0.05, decay: 0.4, sustain: 0.3, release: 0.8, hasNoise: true },
  bell:      { modRatio: 3.5, modIndex: 10, attack: 0.001, decay: 0.5, sustain: 0.05, release: 1.0 },
  kalimba:   { modRatio: 2.0, modIndex: 4, attack: 0.001, decay: 0.15, sustain: 0, release: 0.4 },
  glass:     { modRatio: 1.5, modIndex: 1.0, attack: 0.01, decay: 0.6, sustain: 0.1, release: 0.8 },
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

function pickNote(scale: number[], midiLow: number, midiHigh: number): number {
  const notes: number[] = [];
  for (let octave = 0; octave < 10; octave++) {
    for (const degree of scale) {
      const midi = 12 * octave + degree;
      if (midi >= midiLow && midi <= midiHigh) notes.push(midi);
    }
  }
  return notes[Math.floor(Math.random() * notes.length)] || midiLow;
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
  const idx = notes.indexOf(root);
  const chord = [root];
  if (idx + 2 < notes.length) chord.push(notes[idx + 2]);
  if (idx + 4 < notes.length) chord.push(notes[idx + 4]);
  else if (idx + 3 < notes.length) chord.push(notes[idx + 3]);
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
  tempo: 60,
  masterVolume: 0.6,
  pling: { volume: 0.3, speed: '1/8', triggerProbability: 0.4, delay: 0.3, reverb: 0.5, lfoSpeed: 2, lfoDepth: 0.4, octaveLow: 4, octaveHigh: 6, filterCutoff: 2000, filterQ: 2, decay: 0.15 },
  mid1: { volume: 0.5, sound: 'rhodes', speed: '1/4', triggerProbability: 0.3, delay: 0.2, reverb: 0.4 },
  mid2: { volume: 0.4, sound: 'kalimba', speed: '1/4', triggerProbability: 0.2, delay: 0.3, reverb: 0.5 },
  pad: { volume: 0.25, chordInterval: 4, reverb: 0.6 },
  visualReactions: { swirlStrength: 0.5, swirlRadius: 0.15, sizePulseStrength: 0.4, bassSizeBoost: 0.3 },
};

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
  private instEnabled = { pling: false, mid1: false, mid2: false, pad: false };

  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private readonly LOOKAHEAD = 0.1;
  private nextTime = { pling: 0, mid1: 0, mid2: 0 };
  private padBeatCount = 0;
  private padNextChordTime = 0;
  private padActiveChord: { oscs: OscillatorNode[]; gains: GainNode[] } | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private pendingSwirls: SwirlImpulse[] = [];
  private _sizePulse = 0;
  private _playing = false;

  get isPlaying() { return this._playing; }

  constructor(config?: MusicConfig) {
    this.config = config ? { ...config } : { ...defaultMusicConfig };
  }

  async start() {
    if (this._playing) return;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.buildGraph();
      }
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
    } catch {
      return;
    }
    this._playing = true;
    const now = this.ctx.currentTime + 0.05;
    this.nextTime = { pling: now, mid1: now, mid2: now };
    this.padNextChordTime = now;
    this.padBeatCount = 0;
    this.fadeIn();
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
    if (this.delayNode && this.ctx) {
      this.delayNode.delayTime.setTargetAtTime(60 / c.tempo, this.ctx.currentTime, 0.1);
    }
    // Reset scheduler times so new speeds/probabilities take effect immediately
    if (this.ctx && this._playing) {
      const now = this.ctx.currentTime;
      if (c.pling.speed !== old.pling.speed || c.tempo !== old.tempo) this.nextTime.pling = now;
      if (c.mid1.speed !== old.mid1.speed || c.tempo !== old.tempo) this.nextTime.mid1 = now;
      if (c.mid2.speed !== old.mid2.speed || c.tempo !== old.tempo) this.nextTime.mid2 = now;
      if (c.pad.chordInterval !== old.pad.chordInterval || c.tempo !== old.tempo) this.padNextChordTime = now;
    }
  }

  setInstrumentEnabled(inst: keyof typeof this.instEnabled, on: boolean) {
    this.instEnabled[inst] = on;
    if (!on && inst === 'pad') this.fadePadOut();
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

  getSizePulse(): number {
    const v = this._sizePulse;
    this._sizePulse *= 0.92;
    if (this._sizePulse < 0.001) this._sizePulse = 0;
    return v;
  }

  destroy() {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    this.killPad();
    this.ctx?.close();
    this.ctx = null;
    this._playing = false;
  }

  // ─── Audio Graph ───

  private buildGraph() {
    const ctx = this.ctx!;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0;
    this.masterGain.connect(ctx.destination);

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

  private schedule() {
    if (!this.ctx || !this._playing) return;
    const now = this.ctx.currentTime;
    const ahead = now + this.LOOKAHEAD;
    const beatDur = 60 / this.config.tempo;
    const c = this.config;

    // Pling
    if (this.instEnabled.pling) {
      const interval = subdivisionToBeats(c.pling.speed) * beatDur;
      while (this.nextTime.pling < ahead) {
        if (Math.random() < c.pling.triggerProbability) {
          this.playPling(this.nextTime.pling);
        }
        this.nextTime.pling += interval;
      }
    } else {
      if (this.nextTime.pling < ahead) this.nextTime.pling = now;
    }

    // Mid1
    if (this.instEnabled.mid1) {
      const interval = subdivisionToBeats(c.mid1.speed) * beatDur;
      while (this.nextTime.mid1 < ahead) {
        if (Math.random() < c.mid1.triggerProbability) {
          this.playMid(this.nextTime.mid1, c.mid1);
        }
        this.nextTime.mid1 += interval;
      }
    } else {
      if (this.nextTime.mid1 < ahead) this.nextTime.mid1 = now;
    }

    // Mid2
    if (this.instEnabled.mid2) {
      const interval = subdivisionToBeats(c.mid2.speed) * beatDur;
      while (this.nextTime.mid2 < ahead) {
        if (Math.random() < c.mid2.triggerProbability) {
          this.playMid(this.nextTime.mid2, c.mid2);
        }
        this.nextTime.mid2 += interval;
      }
    } else {
      if (this.nextTime.mid2 < ahead) this.nextTime.mid2 = now;
    }

    // Pad
    if (this.instEnabled.pad) {
      if (now >= this.padNextChordTime) {
        this.playPadChord(this.padNextChordTime);
        this.padNextChordTime += c.pad.chordInterval * 4 * beatDur;
      }
    }
  }

  // ─── Pling ───

  private playPling(time: number) {
    const ctx = this.ctx!;
    const c = this.config.pling;
    const scale = SCALES[this.config.scale];
    const midiLow = c.octaveLow * 12 + 12; // octave 4 = midi 60
    const midiHigh = c.octaveHigh * 12 + 12;
    const midi = pickNote(scale, midiLow, midiHigh);
    const freq = midiToFreq(midi);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = c.filterCutoff;
    filter.Q.value = c.filterQ;

    // LFO on filter cutoff
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = c.lfoSpeed;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = c.lfoDepth * c.filterCutoff * 0.75;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start(time);

    const decay = Math.max(0.02, c.decay);
    const noteDur = decay * 4 + 0.2;
    const vol = c.volume * c.volume;
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

    // Swirl (pling: 30% strength)
    this.addSwirl(0.3, midi, midiLow, midiHigh);
    this.addSizePulse(midi, midiLow, midiHigh, 0.3);
  }

  // ─── Mid (FM synthesis) ───

  private playMid(time: number, mc: { volume: number; sound: MidSound; delay: number; reverb: number }) {
    const ctx = this.ctx!;
    const preset = MID_PRESETS[mc.sound];
    const scale = SCALES[this.config.scale];
    const midi = pickNote(scale, 48, 72);
    const freq = midiToFreq(midi);

    // FM: modulator → modGain → carrier.frequency
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;

    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * preset.modRatio;

    const modGain = ctx.createGain();
    modGain.gain.value = freq * preset.modIndex;
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    // Envelope
    const env = ctx.createGain();
    const a = preset.attack, d = preset.decay, s = preset.sustain, r = preset.release;
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(mc.volume, time + a);
    env.gain.setTargetAtTime(mc.volume * s, time + a, d);
    const noteDur = a + d * 3 + r;
    env.gain.setTargetAtTime(0, time + a + d * 3, r * 0.5);

    carrier.connect(env);

    // Optional noise layer (breathy)
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
      nf.Q.value = 5;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0, time);
      ng.gain.linearRampToValueAtTime(mc.volume * 0.15, time + a * 2);
      ng.gain.setTargetAtTime(0, time + a + d * 3, r * 0.5);
      noise.connect(nf);
      nf.connect(ng);
      ng.connect(env);
      noise.start(time);
      noise.stop(time + noteDur + 1);
    }

    // Routing
    const dry = ctx.createGain();
    dry.gain.value = 1;
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

    carrier.start(time);
    mod.start(time);
    const stopTime = time + noteDur + 1;
    carrier.stop(stopTime);
    mod.stop(stopTime);

    // Visual reactions (mid = primary reactor, full strength)
    this.addSwirl(1.0, midi, 48, 72);
    this.addSizePulse(midi, 48, 72, 1.0);
  }

  // ─── Pad (sustained drone) ───

  private playPadChord(time: number) {
    const ctx = this.ctx!;
    const c = this.config.pad;
    const scale = SCALES[this.config.scale];
    const bassMidi = 36 + Math.floor(Math.random() * 12);
    const chord = pickChord(scale, bassMidi);

    // Fade out old chord
    this.fadePadOut(4);

    // Exponential volume curve: slider 0-1 maps to perceptually even loudness
    // Divide by estimated osc count (3 notes * 3 detuned = 9) to tame stacking
    const oscCount = chord.length * 3;
    const expVol = c.volume * c.volume * (0.5 / Math.max(1, oscCount));

    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    const masterPadGain = ctx.createGain();
    masterPadGain.gain.setValueAtTime(0, time);
    masterPadGain.gain.linearRampToValueAtTime(expVol, time + 3);
    masterPadGain.connect(this.masterGain!);

    if (c.reverb > 0.01 && this.reverbConv) {
      const rs = ctx.createGain();
      rs.gain.value = c.reverb * 0.5;
      masterPadGain.connect(rs);
      rs.connect(this.reverbConv);
    }

    for (const midi of chord) {
      const freq = midiToFreq(midi);
      // 3 detuned oscillators per note
      for (let d = -1; d <= 1; d++) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq * Math.pow(2, (d * 5) / 1200); // ±5 cents
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        filter.Q.value = 0.5;
        osc.connect(filter);
        filter.connect(masterPadGain);
        osc.start(time);
        oscs.push(osc);
      }
    }
    gains.push(masterPadGain);
    this.padActiveChord = { oscs, gains };

    // Gentle size pulse from pad (very subtle)
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
    this.padActiveChord = null;
  }

  private killPad() {
    if (!this.padActiveChord) return;
    for (const o of this.padActiveChord.oscs) {
      try { o.stop(); } catch { /* already stopped */ }
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
    this.pendingSwirls.push({
      x: Math.random(),
      y: Math.random(),
      strength,
      dx: Math.cos(angle) * 0.02,
      dy: Math.sin(angle) * 0.02,
      age: 0,
      maxAge: 0.3 + Math.random() * 0.2,
    });
  }

  private addSizePulse(midi: number, midiLow: number, midiHigh: number, mult: number) {
    const vr = this.config.visualReactions;
    if (vr.sizePulseStrength < 0.01) return;
    const pitchNorm = 1 - (midi - midiLow) / Math.max(1, midiHigh - midiLow);
    const bassBias = 1 + pitchNorm * vr.bassSizeBoost * 2;
    const pulse = vr.sizePulseStrength * mult * bassBias * 0.3;
    this._sizePulse = Math.min(1, this._sizePulse + pulse);
  }
}
