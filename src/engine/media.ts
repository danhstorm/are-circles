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
  private fadeDirection: 'in' | 'out' | 'hold' | 'idle' | 'retained' = 'idle';
  private fadeDuration = 2.5;
  private holdTimer = 0;
  private holdDuration = 8;
  private nextInterval = 15;
  private idleTimer = 0;
  private queuedIndex = -1;
  private sampleAccum = 0;
  private sampleInterval = 1 / 15;
  private pingpongReverse = false;
  private pingpongTime = 0;
  private enabled = true;
  private intensityMap: Map<string, number> = new Map();
  private contrastMap: Map<string, number> = new Map();
  private invertMap: Map<string, boolean> = new Map();
  private zoomToFitMap: Map<string, boolean> = new Map();
  private retainVideo = false;

  get intensity() {
    return this.fadeProgress;
  }

  get activeIndex(): number {
    if (this.fadeDirection === 'idle') return -1;
    return this.currentIndex;
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
    // Update currentItem reference if still playing
    if (this.currentIndex >= 0 && this.currentIndex < items.length && this.currentItem) {
      const newItem = items[this.currentIndex];
      if (newItem && newItem.src === this.currentItem.src) {
        this.currentItem = newItem;
      }
    }
    if (this.currentIndex >= items.length) {
      this.currentIndex = -1;
      this.fadeDirection = 'idle';
      this.fadeProgress = 0;
      this.videoEl?.pause();
      this.videoEl = null;
    }
  }

  setIntensityMap(map: Record<string, number>) {
    this.intensityMap.clear();
    for (const [src, val] of Object.entries(map)) {
      this.intensityMap.set(src, val);
    }
  }

  setContrastMap(map: Record<string, number>) {
    this.contrastMap.clear();
    for (const [src, val] of Object.entries(map)) {
      this.contrastMap.set(src, val);
    }
  }

  setInvertMap(map: Record<string, boolean>) {
    this.invertMap.clear();
    for (const [src, val] of Object.entries(map)) {
      this.invertMap.set(src, val);
    }
  }

  setRetainVideo(v: boolean) {
    this.retainVideo = v;
  }

  setZoomToFitMap(map: Record<string, boolean>) {
    this.zoomToFitMap.clear();
    for (const [src, val] of Object.entries(map)) {
      this.zoomToFitMap.set(src, val);
    }
  }

  private getCurrentIntensity(): number {
    if (!this.currentItem) return 0.7;
    return this.intensityMap.get(this.currentItem.src) ?? 0.7;
  }

  private getCurrentContrast(): number {
    if (!this.currentItem) return 0;
    return this.contrastMap.get(this.currentItem.src) ?? 0;
  }

  private getCurrentInvert(): boolean {
    if (!this.currentItem) return false;
    return this.invertMap.get(this.currentItem.src) ?? false;
  }

  private getCurrentZoomToFit(): boolean {
    if (!this.currentItem) return false;
    return this.zoomToFitMap.get(this.currentItem.src) ?? false;
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
    this.cleanupCurrent();
    this.queuedIndex = -1;
    this.currentIndex = idx;
    this.loadMedia(this.items[idx]);
  }

  getItems() {
    return this.items;
  }

  destroy() {
    this.cleanupCurrent();
  }

  private pickNext() {
    if (this.items.length === 0) return;
    const idx = (this.currentIndex + 1) % this.items.length;
    this.currentIndex = idx;
    this.loadMedia(this.items[idx]);
  }

  private cleanupCurrent() {
    if (this.videoEl) {
      this.videoEl.playbackRate = 1;
      this.videoEl.pause();
      this.videoEl.removeAttribute('src');
      this.videoEl.load();
      this.videoEl = null;
    }
    this.currentItem = null;
    this.pingpongReverse = false;
    this.pingpongTime = 0;
  }

  private loadMedia(item: MediaItem) {
    if (!this.enabled) return;
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
      v.onended = () => {
        if (this.currentItem?.playMode === 'pingpong' && !this.pingpongReverse) {
          this.pingpongReverse = true;
          this.pingpongTime = v.duration;
          v.currentTime = v.duration - 0.01;
          try {
            v.playbackRate = -1;
            v.play().catch(() => { v.pause(); });
          } catch {
            // Browser doesn't support negative playbackRate; manual seeking fallback
            v.pause();
          }
        }
      };
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

  private updatePingpong(dt: number) {
    const v = this.videoEl;
    if (!v || !this.pingpongReverse) return;

    if (v.playbackRate < 0) {
      if (v.currentTime <= 0.05) {
        this.pingpongReverse = false;
        v.playbackRate = 1;
        v.currentTime = 0;
        v.play();
      }
    } else {
      this.pingpongTime = Math.max(0, this.pingpongTime - dt);
      v.currentTime = this.pingpongTime;
      if (this.pingpongTime <= 0.05) {
        this.pingpongReverse = false;
        v.currentTime = 0;
        v.play();
      }
    }
  }

  private sampleBrightness() {
    if (!this.videoEl || this.videoEl.readyState < 2) return;

    const vw = this.videoEl.videoWidth;
    const vh = this.videoEl.videoHeight;
    if (vw === 0 || vh === 0) return;

    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const viewportAspect = viewW / viewH;
    const zoomToFit = this.getCurrentZoomToFit();

    let sx: number, sy: number, sw: number, sh: number;
    let dx = 0, dy = 0, dw = this.sampleWidth, dh = this.sampleHeight;

    if (zoomToFit) {
      // Full cover crop: fill viewport completely, crop excess from center
      const videoAspect = vw / vh;
      sx = 0; sy = 0; sw = vw; sh = vh;
      if (videoAspect > viewportAspect) {
        sw = vh * viewportAspect;
        sx = (vw - sw) / 2;
      } else {
        sh = vw / viewportAspect;
        sy = (vh - sh) / 2;
      }
    } else {
      // Limited crop: max 25% off any axis. Letterbox/pillarbox the rest.
      const maxCrop = 0.25;
      const coverScale = Math.max(viewW / vw, viewH / vh);
      const visibleW = viewW / coverScale;
      const visibleH = viewH / coverScale;
      const cropW = 1 - visibleW / vw;
      const cropH = 1 - visibleH / vh;

      if (cropW <= maxCrop && cropH <= maxCrop) {
        sw = visibleW;
        sh = visibleH;
        sx = (vw - sw) / 2;
        sy = (vh - sh) / 2;
      } else {
        sw = Math.max(visibleW, vw * (1 - maxCrop));
        sh = Math.max(visibleH, vh * (1 - maxCrop));
        sx = (vw - sw) / 2;
        sy = (vh - sh) / 2;

        const srcAspect = sw / sh;
        let fitW: number, fitH: number;
        if (srcAspect > viewportAspect) {
          fitW = viewW;
          fitH = viewW / srcAspect;
        } else {
          fitH = viewH;
          fitW = viewH * srcAspect;
        }
        dw = (fitW / viewW) * this.sampleWidth;
        dh = (fitH / viewH) * this.sampleHeight;
        dx = (this.sampleWidth - dw) / 2;
        dy = (this.sampleHeight - dh) / 2;
      }
    }

    this.ctx.clearRect(0, 0, this.sampleWidth, this.sampleHeight);
    this.ctx.drawImage(this.videoEl, sx, sy, sw, sh, dx, dy, dw, dh);
    const data = this.ctx.getImageData(0, 0, this.sampleWidth, this.sampleHeight).data;

    // Read invert from map (live-updated) rather than stale currentItem
    const invert = this.getCurrentInvert();

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
    let b = this.brightness[idx] || 0;
    const blackPoint = this.getCurrentContrast();
    if (blackPoint > 0.001) {
      b = Math.max(0, (b - blackPoint) / (1 - blackPoint));
    }
    return b * this.fadeProgress * this.getCurrentIntensity();
  }

  getContrastBrightness(brightness: number, contrast: number): number {
    if (contrast > 0.001) {
      return Math.max(0, (brightness - contrast) / (1 - contrast));
    }
    return brightness;
  }

  getRawBrightness(nx: number, ny: number): number {
    const x = Math.floor(nx * (this.sampleWidth - 1));
    const y = Math.floor(ny * (this.sampleHeight - 1));
    const idx = y * this.sampleWidth + x;
    return this.brightness[idx] || 0;
  }

  // Brightness with contrast and intensity applied but WITHOUT fadeProgress.
  // Used for sizing during transitions where fade is handled separately.
  getUnfadedBrightness(nx: number, ny: number): number {
    const x = Math.floor(nx * (this.sampleWidth - 1));
    const y = Math.floor(ny * (this.sampleHeight - 1));
    const idx = y * this.sampleWidth + x;
    let b = this.brightness[idx] || 0;
    const blackPoint = this.getCurrentContrast();
    if (blackPoint > 0.001) {
      b = Math.max(0, (b - blackPoint) / (1 - blackPoint));
    }
    return b * this.getCurrentIntensity();
  }

  forceSample() {
    this.sampleBrightness();
  }

  update(dt: number, intervalMin: number, intervalMax: number, duration: number) {
    this.fadeDuration = duration;
    this.updatePingpong(dt);

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
      if (shouldSample) this.sampleBrightness();
      this.fadeProgress = Math.max(0, this.fadeProgress - dt / this.fadeDuration);
      if (this.fadeProgress <= 0) {
        if (this.retainVideo) {
          // Renderer still has particles in grid -- keep video alive and sampling
          this.fadeDirection = 'retained';
        } else {
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
      }
    } else if (this.fadeDirection === 'retained') {
      // Video kept alive for exit transition -- keep sampling so dots show animation
      if (shouldSample) this.sampleBrightness();
      this.updatePingpong(dt);
      if (!this.retainVideo) {
        this.cleanupCurrent();
        this.fadeDirection = 'idle';
        this.idleTimer = 0;
        this.nextInterval = intervalMin + Math.random() * (intervalMax - intervalMin);
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
