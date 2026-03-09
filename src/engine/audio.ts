import { AudioData } from '@/types';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private smoothed: AudioData = { bass: 0, mid: 0, high: 0, overall: 0 };
  private _active = false;

  get active() {
    return this._active;
  }

  async start(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      this.gainNode = this.ctx.createGain();
      this.source = this.ctx.createMediaStreamSource(stream);
      this.source.connect(this.gainNode);
      this.gainNode.connect(this.analyser);
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this._active = true;
      return true;
    } catch {
      console.warn('Microphone access denied');
      return false;
    }
  }

  stop() {
    this.source?.disconnect();
    this.ctx?.close();
    this._active = false;
  }

  setGain(value: number) {
    if (this.gainNode) this.gainNode.gain.value = value;
  }

  getData(sensitivity: number, smoothing: number): AudioData {
    if (!this.analyser || !this._active) return this.smoothed;

    this.analyser.getByteFrequencyData(this.freqData);
    const bins = this.freqData.length;

    let bass = 0, mid = 0, high = 0;
    const bassEnd = Math.floor(bins * 0.15);
    const midEnd = Math.floor(bins * 0.5);

    for (let i = 0; i < bins; i++) {
      const v = this.freqData[i] / 255;
      if (i < bassEnd) bass += v;
      else if (i < midEnd) mid += v;
      else high += v;
    }

    bass = (bass / bassEnd) * sensitivity;
    mid = (mid / (midEnd - bassEnd)) * sensitivity;
    high = (high / (bins - midEnd)) * sensitivity;
    const overall = bass * 0.5 + mid * 0.3 + high * 0.2;

    this.smoothed.bass += (bass - this.smoothed.bass) * (1 - smoothing);
    this.smoothed.mid += (mid - this.smoothed.mid) * (1 - smoothing);
    this.smoothed.high += (high - this.smoothed.high) * (1 - smoothing);
    this.smoothed.overall += (overall - this.smoothed.overall) * (1 - smoothing);

    return { ...this.smoothed };
  }
}
