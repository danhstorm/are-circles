import { MediaItem } from '@/types';

export class MediaEngine {
  private items: MediaItem[] = [];
  private currentIndex = -1;
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private imageEl: HTMLImageElement | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private brightness: Float32Array;
  private sampleWidth = 64;
  private sampleHeight = 64;
  private fadeProgress = 0;
  private fadeDirection: 'in' | 'out' | 'hold' | 'idle' = 'idle';
  private fadeDuration = 2.5;
  private holdTimer = 0;
  private nextInterval = 15;
  private idleTimer = 0;
  private queuedIndex = -1;

  get intensity() {
    return this.fadeProgress;
  }

  constructor() {
    this.canvas = new OffscreenCanvas(this.sampleWidth, this.sampleHeight);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.brightness = new Float32Array(this.sampleWidth * this.sampleHeight);
  }

  setItems(items: MediaItem[]) {
    this.items = items;
    if (items.length > 0 && this.currentIndex === -1) {
      this.pickNext();
    }
  }

  triggerNext() {
    if (this.items.length === 0) return;
    if (this.fadeDirection === 'in' || this.fadeDirection === 'hold') {
      this.fadeDirection = 'out';
    } else {
      this.pickNext();
    }
  }

  triggerByIndex(idx: number) {
    if (idx < 0 || idx >= this.items.length) return;
    // If something is already showing, fade it out first then load new
    if (this.fadeDirection === 'in' || this.fadeDirection === 'hold') {
      this.fadeDirection = 'out';
      // Queue the specific one after fade out
      this.queuedIndex = idx;
    } else {
      this.currentIndex = idx;
      this.loadMedia(this.items[idx]);
    }
  }

  getItems() {
    return this.items;
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

  private loadMedia(item: MediaItem) {
    this.imageEl = null;
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.src = '';
      this.videoEl = null;
    }

    if (item.type === 'video') {
      const v = document.createElement('video');
      v.src = item.src;
      v.crossOrigin = 'anonymous';
      v.muted = true;
      v.loop = false;
      v.playsInline = true;
      v.onloadeddata = () => {
        this.videoEl = v;
        v.play();
        this.fadeDirection = 'in';
        this.fadeProgress = 0;
      };
      v.onended = () => {
        this.fadeDirection = 'out';
      };
      v.load();
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.imageEl = img;
        this.fadeDirection = 'in';
        this.fadeProgress = 0;
        this.holdTimer = 0;
      };
      img.src = item.src;
    }
  }

  private sampleBrightness() {
    this.ctx.clearRect(0, 0, this.sampleWidth, this.sampleHeight);
    const source = this.videoEl || this.imageEl;
    if (!source) return;

    this.ctx.drawImage(source as CanvasImageSource, 0, 0, this.sampleWidth, this.sampleHeight);
    const data = this.ctx.getImageData(0, 0, this.sampleWidth, this.sampleHeight).data;

    for (let i = 0; i < this.brightness.length; i++) {
      const idx = i * 4;
      const lum = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
      this.brightness[i] = 1 - lum;
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

    if (this.fadeDirection === 'in') {
      this.fadeProgress = Math.min(1, this.fadeProgress + dt / this.fadeDuration);
      if (this.fadeProgress >= 1) {
        this.fadeDirection = this.videoEl ? 'hold' : 'hold';
        this.holdTimer = 0;
      }
      this.sampleBrightness();
    } else if (this.fadeDirection === 'hold') {
      // Always re-sample so animated GIFs update their frames
      this.sampleBrightness();
      if (this.videoEl) {
        if (this.videoEl.ended) {
          this.fadeDirection = 'out';
        }
      } else {
        this.holdTimer += dt;
        if (this.holdTimer > 8) {
          this.fadeDirection = 'out';
        }
      }
    } else if (this.fadeDirection === 'out') {
      this.fadeProgress = Math.max(0, this.fadeProgress - dt / this.fadeDuration);
      if (this.fadeProgress <= 0) {
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
      this.idleTimer += dt;
      if (this.idleTimer >= this.nextInterval && this.items.length > 0) {
        this.pickNext();
      }
    }
  }
}
