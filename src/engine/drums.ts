import {
  DrumConfig, DrumSoundName, DrumSoundConfig, DrumRipple,
  DrumReactionGroup, DRUM_SOUND_NAMES, DRUM_REACTION_GROUPS, SpeedSubdivision,
} from '@/types';

function subdivisionToBeats(sub: SpeedSubdivision): number {
  switch (sub) {
    case '1/1': return 4;
    case '1/2': return 2;
    case '1/3': return 4 / 3;
    case '1/4': return 1;
    case '1/6': return 2 / 3;
    case '1/8': return 0.5;
    case '1/16': return 0.25;
    case '1/32': return 0.125;
  }
}

function emptyDrumSound(volume = 0.7): DrumSoundConfig {
  return {
    pattern: Array(16).fill(false),
    volume,
    decayMin: 0.5, decayMax: 0.5,
    pitchMin: 1.0, pitchMax: 1.0,
    delayMin: 0, delayMax: 0,
    flangerMin: 0, flangerMax: 0,
    chorusMin: 0, chorusMax: 0,
  };
}

export const defaultDrumConfig: DrumConfig = {
  volume: 0.6,
  speed: '1/16',
  autoSpeed: 0.04,
  sounds: {
    kick: emptyDrumSound(0.8),
    woodblock1: emptyDrumSound(0.6),
    woodblock2: emptyDrumSound(0.6),
    clap: emptyDrumSound(0.5),
    snare: emptyDrumSound(0.6),
    hihat: emptyDrumSound(0.4),
    gong: emptyDrumSound(0.7),
  },
  reactions: {
    low: { waveStrength: 0.4, waveSpeed: 1.0, sizeAmount: 0.3, positionAmount: 0.2 },
    mid: { waveStrength: 0.25, waveSpeed: 2.0, sizeAmount: 0.2, positionAmount: 0.1 },
    high: { waveStrength: 0.1, waveSpeed: 4.0, sizeAmount: 0.1, positionAmount: 0.05 },
  },
};

export class DrumMachine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private drumGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private flangerInput: GainNode | null = null;
  private chorusInput: GainNode | null = null;
  private flangerLfo: OscillatorNode | null = null;
  private chorusLfo1: OscillatorNode | null = null;
  private chorusLfo2: OscillatorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private graphBuilt = false;

  private config: DrumConfig;
  private enabled = false;
  private autoPhase = 0;

  private nextStepNum = 0;
  private _currentStep = -1;
  private pendingRipples: DrumRipple[] = [];

  get currentStep(): number { return this._currentStep; }

  constructor(config?: DrumConfig) {
    this.config = config ? structuredClone(config) : structuredClone(defaultDrumConfig);
  }

  init(ctx: AudioContext, masterGain: GainNode, delayNode: DelayNode | null) {
    this.ctx = ctx;
    this.masterGain = masterGain;
    this.delayNode = delayNode;
    if (this.enabled) this.ensureGraph();
  }

  private ensureGraph() {
    if (this.graphBuilt || !this.ctx) return;
    this.buildDrumGraph();
    this.graphBuilt = true;
  }

  private buildDrumGraph() {
    const ctx = this.ctx!;

    this.drumGain = ctx.createGain();
    this.drumGain.gain.value = this.config.volume;
    this.drumGain.connect(this.masterGain!);

    // Flanger bus: short modulated delay + feedback
    this.flangerInput = ctx.createGain();
    this.flangerInput.gain.value = 1;
    const flangerDelay = ctx.createDelay(0.02);
    flangerDelay.delayTime.value = 0.003;
    this.flangerLfo = ctx.createOscillator();
    this.flangerLfo.type = 'sine';
    this.flangerLfo.frequency.value = 0.5;
    const flangerLfoGain = ctx.createGain();
    flangerLfoGain.gain.value = 0.002;
    this.flangerLfo.connect(flangerLfoGain);
    flangerLfoGain.connect(flangerDelay.delayTime);
    this.flangerLfo.start();
    const flangerFeedback = ctx.createGain();
    flangerFeedback.gain.value = 0.4;
    this.flangerInput.connect(flangerDelay);
    flangerDelay.connect(flangerFeedback);
    flangerFeedback.connect(flangerDelay);
    const flangerOut = ctx.createGain();
    flangerOut.gain.value = 0.5;
    flangerDelay.connect(flangerOut);
    flangerOut.connect(this.drumGain);

    // Chorus bus: two detuned delay lines with LFO
    this.chorusInput = ctx.createGain();
    this.chorusInput.gain.value = 1;
    const chorusDelay1 = ctx.createDelay(0.05);
    chorusDelay1.delayTime.value = 0.012;
    this.chorusLfo1 = ctx.createOscillator();
    this.chorusLfo1.type = 'sine';
    this.chorusLfo1.frequency.value = 0.4;
    const chorusLfoGain1 = ctx.createGain();
    chorusLfoGain1.gain.value = 0.003;
    this.chorusLfo1.connect(chorusLfoGain1);
    chorusLfoGain1.connect(chorusDelay1.delayTime);
    this.chorusLfo1.start();
    const chorusDelay2 = ctx.createDelay(0.05);
    chorusDelay2.delayTime.value = 0.018;
    this.chorusLfo2 = ctx.createOscillator();
    this.chorusLfo2.type = 'sine';
    this.chorusLfo2.frequency.value = 0.6;
    const chorusLfoGain2 = ctx.createGain();
    chorusLfoGain2.gain.value = 0.004;
    this.chorusLfo2.connect(chorusLfoGain2);
    chorusLfoGain2.connect(chorusDelay2.delayTime);
    this.chorusLfo2.start();
    const chorusOut = ctx.createGain();
    chorusOut.gain.value = 0.4;
    this.chorusInput.connect(chorusDelay1);
    this.chorusInput.connect(chorusDelay2);
    chorusDelay1.connect(chorusOut);
    chorusDelay2.connect(chorusOut);
    chorusOut.connect(this.drumGain);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) this.ensureGraph();
  }
  get isEnabled() { return this.enabled; }

  updateConfig(c: DrumConfig) {
    this.config = c;
    if (this.drumGain && this.ctx) {
      this.drumGain.gain.setTargetAtTime(c.volume, this.ctx.currentTime, 0.05);
    }
  }

  getRipples(): DrumRipple[] {
    if (!this.enabled) {
      this.pendingRipples.length = 0;
      return [];
    }
    const out = this.pendingRipples;
    this.pendingRipples = [];
    return out;
  }

  getDrumStep(): number {
    return this._currentStep;
  }

  schedule(beatOrigin: number, tempo: number, now: number, ahead: number) {
    if (!this.ctx || !this.enabled) {
      // Keep step counter current so re-enabling doesn't jump
      const beatDur = 60 / tempo;
      const currentBeat = (now - beatOrigin) / beatDur;
      const stepsPerBeat = 1 / subdivisionToBeats(this.config.speed);
      const currentStepNum = Math.floor(currentBeat * stepsPerBeat);
      if (this.nextStepNum < currentStepNum) this.nextStepNum = currentStepNum;
      this._currentStep = -1;
      return;
    }

    this.ensureGraph();

    const beatDur = 60 / tempo;
    const stepsPerBeat = 1 / subdivisionToBeats(this.config.speed);
    const beatsPerStep = subdivisionToBeats(this.config.speed);
    const elapsed = now - beatOrigin;
    this.autoPhase = elapsed * this.config.autoSpeed * Math.PI * 2;

    // Update visual step based on current wall time
    const currentBeat = elapsed / beatDur;
    this._currentStep = Math.floor((currentBeat * stepsPerBeat) % 16);
    if (this._currentStep < 0) this._currentStep = 0;

    while (true) {
      const stepTime = beatOrigin + this.nextStepNum * beatsPerStep * beatDur;
      if (stepTime >= ahead) break;
      const step = ((this.nextStepNum % 16) + 16) % 16;
      for (const name of DRUM_SOUND_NAMES) {
        const sound = this.config.sounds[name];
        if (sound.pattern[step]) {
          this.playDrumSound(name, sound, Math.max(now, stepTime));
        }
      }
      this.nextStepNum++;
    }
  }

  rebaseBeat(oldTempo: number, newTempo: number, beatOrigin: number, now: number) {
    const beatDur = 60 / newTempo;
    const currentBeat = (now - beatOrigin) / beatDur;
    const stepsPerBeat = 1 / subdivisionToBeats(this.config.speed);
    this.nextStepNum = Math.floor(currentBeat * stepsPerBeat);
  }

  rebaseSpeed(beatOrigin: number, tempo: number, now: number) {
    const beatDur = 60 / tempo;
    const currentBeat = (now - beatOrigin) / beatDur;
    const stepsPerBeat = 1 / subdivisionToBeats(this.config.speed);
    this.nextStepNum = Math.ceil(currentBeat * stepsPerBeat);
  }

  destroy() {
    try { this.flangerLfo?.stop(); } catch { /* */ }
    try { this.chorusLfo1?.stop(); } catch { /* */ }
    try { this.chorusLfo2?.stop(); } catch { /* */ }
    this.drumGain?.disconnect();
    this.flangerInput?.disconnect();
    this.chorusInput?.disconnect();
  }

  // ─── Automation helper ───

  private pingPong(phase: number, lo: number, hi: number): number {
    if (lo >= hi) return lo;
    const t = (Math.sin(phase) + 1) * 0.5;
    return lo + t * (hi - lo);
  }

  private autoVal(sc: DrumSoundConfig, key: 'decay' | 'pitch' | 'delay' | 'flanger' | 'chorus', phaseOffset: number): number {
    const lo = sc[`${key}Min`];
    const hi = sc[`${key}Max`];
    return this.pingPong(this.autoPhase * phaseOffset, lo, hi);
  }

  // ─── Sound dispatch ───

  private playDrumSound(name: DrumSoundName, sc: DrumSoundConfig, time: number) {
    switch (name) {
      case 'kick': this.playKick(sc, time); break;
      case 'woodblock1': this.playWoodblock(sc, time, 1); break;
      case 'woodblock2': this.playWoodblock(sc, time, 2); break;
      case 'clap': this.playClap(sc, time); break;
      case 'snare': this.playSnare(sc, time); break;
      case 'hihat': this.playHihat(sc, time); break;
      case 'gong': this.playGong(sc, time); break;
    }
    this.emitRipple(name);
  }

  // ─── Kick ───

  private playKick(sc: DrumSoundConfig, time: number) {
    const ctx = this.ctx!;
    const pitch = this.autoVal(sc, 'pitch', 1.0);
    const decay = 0.1 + this.autoVal(sc, 'decay', 0.7) * 0.8;
    const vol = sc.volume * this.config.volume;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150 * pitch, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, 40 * pitch), time + 0.04);

    const env = ctx.createGain();
    env.gain.setValueAtTime(vol, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + decay);

    osc.connect(env);
    this.routeSound(env, sc, time, decay);
    osc.start(time);
    osc.stop(time + decay + 0.1);
  }

  // ─── Woodblock ───

  private playWoodblock(sc: DrumSoundConfig, time: number, variant: 1 | 2) {
    const ctx = this.ctx!;
    const pitch = this.autoVal(sc, 'pitch', 1.0);
    const baseFreq = variant === 1 ? 800 : 500;
    const freq = baseFreq * pitch;
    const decay = 0.02 + this.autoVal(sc, 'decay', 0.7) * 0.15;
    const vol = sc.volume * this.config.volume;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq * 1.5, time);
    osc.frequency.exponentialRampToValueAtTime(freq, time + 0.005);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = variant === 1 ? 10 : 6;

    const env = ctx.createGain();
    env.gain.setValueAtTime(vol, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + decay);

    osc.connect(filter);
    filter.connect(env);
    this.routeSound(env, sc, time, decay);
    osc.start(time);
    osc.stop(time + decay + 0.1);
  }

  // ─── Clap ───

  private playClap(sc: DrumSoundConfig, time: number) {
    const ctx = this.ctx!;
    const pitch = this.autoVal(sc, 'pitch', 1.0);
    const decay = 0.05 + this.autoVal(sc, 'decay', 0.7) * 0.2;
    const vol = sc.volume * this.config.volume;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200 * pitch;
    filter.Q.value = 2;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    for (let i = 0; i < 3; i++) {
      const t = time + i * 0.01;
      env.gain.setValueAtTime(vol, t);
      env.gain.linearRampToValueAtTime(vol * 0.2, t + 0.008);
    }
    env.gain.setValueAtTime(vol * 0.5, time + 0.03);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.03 + decay);

    const noise = this.makeNoise(time, decay + 0.1);
    noise.connect(filter);
    filter.connect(env);
    this.routeSound(env, sc, time, decay + 0.1);
  }

  // ─── Snare ───

  private playSnare(sc: DrumSoundConfig, time: number) {
    const ctx = this.ctx!;
    const pitch = this.autoVal(sc, 'pitch', 1.0);
    const decay = 0.05 + this.autoVal(sc, 'decay', 0.7) * 0.25;
    const vol = sc.volume * this.config.volume;

    // Tone body
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 200 * pitch;
    const oscEnv = ctx.createGain();
    oscEnv.gain.setValueAtTime(vol * 0.5, time);
    oscEnv.gain.exponentialRampToValueAtTime(0.001, time + decay * 0.5);

    // Noise rattle
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 2000 * pitch;
    const noiseEnv = ctx.createGain();
    noiseEnv.gain.setValueAtTime(vol * 0.7, time);
    noiseEnv.gain.exponentialRampToValueAtTime(0.001, time + decay);

    const noise = this.makeNoise(time, decay + 0.1);

    const mix = ctx.createGain();
    mix.gain.value = 1;
    osc.connect(oscEnv);
    oscEnv.connect(mix);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseEnv);
    noiseEnv.connect(mix);

    this.routeSound(mix, sc, time, decay);
    osc.start(time);
    osc.stop(time + decay + 0.1);
  }

  // ─── Hihat ───

  private playHihat(sc: DrumSoundConfig, time: number) {
    const ctx = this.ctx!;
    const pitch = this.autoVal(sc, 'pitch', 1.0);
    const decay = 0.02 + this.autoVal(sc, 'decay', 0.7) * 0.15;
    const vol = sc.volume * this.config.volume;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000 * pitch;

    const env = ctx.createGain();
    env.gain.setValueAtTime(vol, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + decay);

    const noise = this.makeNoise(time, decay + 0.1);
    noise.connect(filter);
    filter.connect(env);
    this.routeSound(env, sc, time, decay);
  }

  // ─── Gong ───

  private playGong(sc: DrumSoundConfig, time: number) {
    const ctx = this.ctx!;
    const pitch = this.autoVal(sc, 'pitch', 1.0);
    const decay = 0.5 + this.autoVal(sc, 'decay', 0.7) * 4;
    const vol = sc.volume * this.config.volume;
    const baseFreq = 80 * pitch;

    // Main tone
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * 0.95, time);
    osc.frequency.linearRampToValueAtTime(baseFreq, time + 0.1);

    // FM modulator for metallic shimmer
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = baseFreq * 2.4;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(baseFreq * 2, time);
    modGain.gain.exponentialRampToValueAtTime(Math.max(1, baseFreq * 0.1), time + decay * 0.5);
    mod.connect(modGain);
    modGain.connect(osc.frequency);

    // Second inharmonic partial
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = baseFreq * 3.1;
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.setValueAtTime(vol * 0.3, time);
    osc2Gain.gain.exponentialRampToValueAtTime(0.001, time + decay * 0.7);
    osc2.connect(osc2Gain);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(vol, time + 0.005);
    env.gain.setTargetAtTime(0, time + 0.1, decay * 0.3);

    const mix = ctx.createGain();
    mix.gain.value = 1;
    osc.connect(env);
    env.connect(mix);
    osc2Gain.connect(mix);

    this.routeSound(mix, sc, time, decay);
    osc.start(time);
    osc.stop(time + decay + 0.5);
    mod.start(time);
    mod.stop(time + decay + 0.5);
    osc2.start(time);
    osc2.stop(time + decay + 0.5);
  }

  // ─── Routing ───

  private routeSound(source: AudioNode, sc: DrumSoundConfig, _time: number, dur: number) {
    const delayAmt = this.autoVal(sc, 'delay', 1.3);
    const flangerAmt = this.autoVal(sc, 'flanger', 0.9);
    const chorusAmt = this.autoVal(sc, 'chorus', 1.1);

    const dry = this.ctx!.createGain();
    dry.gain.value = Math.max(0.3, 1 - Math.max(delayAmt, flangerAmt, chorusAmt) * 0.3);
    source.connect(dry);
    dry.connect(this.drumGain!);

    if (delayAmt > 0.01 && this.delayNode) {
      const ds = this.ctx!.createGain();
      ds.gain.value = delayAmt;
      source.connect(ds);
      ds.connect(this.delayNode);
    }

    if (flangerAmt > 0.01 && this.flangerInput) {
      const fs = this.ctx!.createGain();
      fs.gain.value = flangerAmt;
      source.connect(fs);
      fs.connect(this.flangerInput);
    }

    if (chorusAmt > 0.01 && this.chorusInput) {
      const cs = this.ctx!.createGain();
      cs.gain.value = chorusAmt;
      source.connect(cs);
      cs.connect(this.chorusInput);
    }

    // Auto-disconnect after sound finishes to free graph resources
    if (source instanceof GainNode) {
      setTimeout(() => {
        try { source.disconnect(); } catch { /* */ }
        try { dry.disconnect(); } catch { /* */ }
      }, (dur + 0.5) * 1000);
    }
  }

  // ─── Noise helper ───

  private makeNoise(time: number, duration: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) {
      const bufSize = ctx.sampleRate * 2;
      this.noiseBuffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.start(time);
    source.stop(time + duration + 0.1);
    return source;
  }

  // ─── Ripple emission ───

  private emitRipple(name: DrumSoundName) {
    const group: DrumReactionGroup = DRUM_REACTION_GROUPS[name];
    const rc = this.config.reactions[group];
    if (rc.waveStrength < 0.01) return;

    const maxRadius = group === 'low' ? 0.6 : group === 'mid' ? 0.35 : 0.15;
    const maxAge = maxRadius / Math.max(0.1, rc.waveSpeed * 0.3);

    this.pendingRipples.push({
      x: Math.random(),
      y: Math.random(),
      radius: 0,
      maxRadius,
      speed: rc.waveSpeed * 0.3,
      strength: rc.waveStrength,
      sizeAmount: rc.sizeAmount,
      positionAmount: rc.positionAmount,
      age: 0,
      maxAge,
    });
  }
}
