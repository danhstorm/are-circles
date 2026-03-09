import { MediaItem } from '@/types';

export class MediaEngine {
  private items: MediaItem[] = [];
  private currentIndex = -1;
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private videoEl: HTMLVideoElement | null = null;
  private currentItem: MediaItem | null = null;
  private brightness: Float32Array;
  private sampleWidth = 64;
  private sampleHeight = 64;
  private fadeProgress = 0;
  private fadeDirection: 'in' | 'out' | 'hold' | 'idle' = 'idle';
  private fadeDuration = 2.5;
  private holdTimer = 0;
  private holdDuration = 8;
  private nextInterval = 15;
  private idleTimer = 0;
  private queuedIndex = -1;
  private sampleAccum = 0;
  private sampleInterval = 1 / 15;
  // Pingpong state
  private pingpongReverse = false;
  private enabled = true;

  get intensity() {
    return this.fadeProgress;
  }

  constructor() {
    this.canvas = new OffscreenCanvas(this.sampleWidth, this.sampleHeight);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.brightness = new Float32Array(this.sampleWidth * this.sampleHeight);
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    if (!v && (this.fadeDirection === 'in' || this.fadeDirection === 'hold')) {
      this.fadeDirection = 'out';
    }
  }

  setItems(items: MediaItem[]) {
    this.items = items;
  }

  triggerNext() {
    if (this.items.length === 0 || !this.enabled) return;
    if (this.fadeDirection === 'in' || this.fadeDirection === 'hold') {
      this.fadeDirection = 'out';
    } else {
      this.pickNext();
    }
  }

  triggerByIndex(idx: number) {
    if (idx < 0 || idx >= this.items.length || !this.enabled) return;
    if (this.fadeDirection === 'in' || this.fadeDirection === 'hold') {
      this.fadeDirection = 'out';
      this.queuedIndex = idx;
    } else {
      this.currentIndex = idx;
      this.loadMedia(this.items[idx]);
    }
  }

  getItems() {
    return this.items;
  }

  destroy() {
    this.cleanupCurrent();
  }

  private pickNext() {
    if (this.items.length === 0) return;
    let idx = Math.floor(Math.random() * this.items.length);
    if (this.items.length > 1 && idx === this.currentIndex) {
      idx = (idx + 1) % this.items.length;
    }
    this.currentIndex = idx;
    this.loadMedia(this.items[idx]);
  }

  private cleanupCurrent() {
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.removeAttribute('src');
      this.videoEl.load();
      this.videoEl = null;
    }
    this.currentItem = null;
    this.pingpongReverse = false;
  }

  private loadMedia(item: MediaItem) {
    this.cleanupCurrent();
    this.currentItem = item;
    this.pingpongReverse = false;

    const v = document.createElement('video');
    v.src = item.src;
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;

    if (item.playMode === 'pingpong') {
      v.loop = false;
      v.onended = () => this.handlePingpongEnd(v);
    } else {
      v.loop = true;
    }

    v.onloadeddata = () => {
      this.videoEl = v;
      v.play();
      this.fadeDirection = 'in';
      this.fadeProgress = 0;
      this.holdTimer = 0;
    };
    v.load();
  }

  private handlePingpongEnd(v: HTMLVideoElement) {
    if (!this.currentItem || this.currentItem.playMode !== 'pingpong') return;
    this.pingpongReverse = !this.pingpongReverse;
    v.playbackRate = this.pingpongReverse ? -1 : 1;
    if (this.pingpongReverse) {
      // Seek to near end and play backwards
      v.currentTime = Math.max(0, v.duration - 0.05);
    } else {
      v.currentTime = 0;
    }
    v.play().catch(() => {
      // Fallback: some browsers don't support negative playbackRate
      // Just loop normally
      v.playbackRate = 1;
      v.currentTime = 0;
      v.play();
    });
  }

  private sampleBrightness() {
    if (!this.videoEl || this.videoEl.readyState < 2) return;

    this.ctx.clearRect(0, 0, this.sampleWidth, this.sampleHeight);
    this.ctx.drawImage(this.videoEl, 0, 0, this.sampleWidth, this.sampleHeight);
    const data = this.ctx.getImageData(0, 0, this.sampleWidth, this.sampleHeight).data;

    const invert = this.currentItem?.invert ?? false;

    for (let i = 0; i < this.brightness.length; i++) {
      const idx = i * 4;
      const lum = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
      this.brightness[i] = invert ? 1 - lum : lum;
    }
  }

  getBrightness(nx: number, ny: number): number {
    if (this.fadeProgress <= 0) return 0;
    const x = Math.floor(nx * (this.sampleWidth - 1));
    const y = Math.floor(ny * (this.sampleHeight - 1));
    const idx = y * this.sampleWidth + x;
    return (this.brightness[idx] || 0) * this.fadeProgress;
  }

  update(dt: number, intervalMin: number, intervalMax: number, duration: number) {
    this.fadeDuration = duration;

    this.sampleAccum += dt;
    const shouldSample = this.sampleAccum >= this.sampleInterval;
    if (shouldSample) this.sampleAccum = 0;

    if (this.fadeDirection === 'in') {
      this.fadeProgress = Math.min(1, this.fadeProgress + dt / this.fadeDuration);
      if (shouldSample) this.sampleBrightness();
      if (this.fadeProgress >= 1) {
        this.fadeDirection = 'hold';
        this.holdTimer = 0;
      }
    } else if (this.fadeDirection === 'hold') {
      if (shouldSample) this.sampleBrightness();
      this.holdTimer += dt;
      if (this.holdTimer > this.holdDuration) {
        this.fadeDirection = 'out';
      }
    } else if (this.fadeDirection === 'out') {
      // Keep sampling during fade-out so animation continues
      if (shouldSample) this.sampleBrightness();
      this.fadeProgress = Math.max(0, this.fadeProgress - dt / this.fadeDuration);
      if (this.fadeProgress <= 0) {
        this.cleanupCurrent();
        if (this.queuedIndex >= 0) {
          const idx = this.queuedIndex;
          this.queuedIndex = -1;
          this.currentIndex = idx;
          this.loadMedia(this.items[idx]);
        } else {
          this.fadeDirection = 'idle';
          this.idleTimer = 0;
          this.nextInterval = intervalMin + Math.random() * (intervalMax - intervalMin);
        }
      }
    } else {
      if (!this.enabled) return;
      this.idleTimer += dt;
      if (this.idleTimer >= this.nextInterval && this.items.length > 0) {
        this.pickNext();
      }
    }
  }
}
