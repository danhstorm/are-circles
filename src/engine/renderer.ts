import { createNoise3D } from 'simplex-noise';
import { Particle, Settings, AudioData } from '@/types';
import { AudioEngine } from './audio';
import { MediaEngine } from './media';

export class CirclesRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private noise3D = createNoise3D();
  private time = 0;
  private animFrame = 0;
  private running = false;
  private masterOpacity = 0;
  private fadeTarget = 0;
  private settings: Settings;
  audio: AudioEngine;
  media: MediaEngine;

  constructor(canvas: HTMLCanvasElement, settings: Settings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.settings = { ...settings };
    this.audio = new AudioEngine();
    this.media = new MediaEngine();
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  updateSettings(s: Settings) {
    const oldCount = this.settings.circleCount;
    this.settings = { ...s };
    if (s.circleCount !== oldCount) {
      this.adjustParticleCount();
    }
    this.audio.setGain(s.micGain);
  }

  private hslToComponents(color: string): [number, number, number] {
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = 1;
    const c = tmp.getContext('2d')!;
    c.fillStyle = color;
    c.fillRect(0, 0, 1, 1);
    const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    let h = 0;
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d !== 0) {
      if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
      else if (max === gn) h = ((bn - rn) / d + 2) * 60;
      else h = ((rn - gn) / d + 4) * 60;
    }
    return [h, s * 100, l * 100];
  }

  private initParticles() {
    this.particles = [];
    const w = window.innerWidth;
    const h = window.innerHeight;
    const { circleCount, paletteColors } = this.settings;
    const hslPalette = paletteColors.map(c => this.hslToComponents(c));

    for (let i = 0; i < circleCount; i++) {
      const pal = hslPalette[Math.floor(Math.random() * hslPalette.length)];
      const depth = Math.random();
      this.particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: 0,
        vy: 0,
        baseSize: 0,
        size: 0,
        targetSize: 0,
        color: '',
        hue: pal[0],
        saturation: pal[1],
        lightness: pal[2],
        blur: depth,
        opacity: this.settings.opacityMin + depth * (this.settings.opacityMax - this.settings.opacityMin),
        depth,
        gridX: 0,
        gridY: 0,
        noiseOffsetX: Math.random() * 1000,
        noiseOffsetY: Math.random() * 1000,
      });
    }
    this.assignGridPositions();
  }

  private adjustParticleCount() {
    const target = this.settings.circleCount;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const hslPalette = this.settings.paletteColors.map(c => this.hslToComponents(c));

    while (this.particles.length < target) {
      const pal = hslPalette[Math.floor(Math.random() * hslPalette.length)];
      const depth = Math.random();
      this.particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: 0,
        vy: 0,
        baseSize: 0,
        size: 0,
        targetSize: 0,
        color: '',
        hue: pal[0],
        saturation: pal[1],
        lightness: pal[2],
        blur: depth,
        opacity: this.settings.opacityMin + depth * (this.settings.opacityMax - this.settings.opacityMin),
        depth,
        gridX: 0,
        gridY: 0,
        noiseOffsetX: Math.random() * 1000,
        noiseOffsetY: Math.random() * 1000,
      });
    }
    while (this.particles.length > target) {
      this.particles.pop();
    }
    this.assignGridPositions();
  }

  private assignGridPositions() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cols = this.settings.gridColumns;
    const cellW = w / cols;
    const rows = Math.ceil(h / cellW);

    this.particles.forEach((p, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols) % rows;
      p.gridX = (col + 0.5) * cellW;
      p.gridY = (row + 0.5) * cellW;
    });
  }

  fadeIn() {
    this.fadeTarget = 1;
  }

  fadeOut() {
    this.fadeTarget = 0;
  }

  get isFadedOut() {
    return this.masterOpacity <= 0.001 && this.fadeTarget === 0;
  }

  toggleFade() {
    if (this.fadeTarget > 0.5) {
      this.fadeOut();
    } else {
      this.fadeIn();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.initParticles();
    this.fadeIn();
    let last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      this.update(dt);
      this.draw();
      this.animFrame = requestAnimationFrame(loop);
    };
    this.animFrame = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.animFrame);
    this.audio.stop();
  }

  private update(dt: number) {
    const s = this.settings;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const speed = s.animationSpeed * dt;
    this.time += dt * s.animationSpeed * 0.5;

    const fadeLerp = dt / Math.max(s.fadeDuration, 0.1);
    if (this.masterOpacity < this.fadeTarget) {
      this.masterOpacity = Math.min(this.fadeTarget, this.masterOpacity + fadeLerp);
    } else if (this.masterOpacity > this.fadeTarget) {
      this.masterOpacity = Math.max(this.fadeTarget, this.masterOpacity - fadeLerp);
    }

    const audio: AudioData = this.audio.getData(s.soundSensitivity, s.soundSmoothing);

    this.media.update(dt, s.imageIntervalMin, s.imageIntervalMax, s.imageFadeDuration);

    for (const p of this.particles) {
      const nx = this.noise3D(
        p.x * s.noiseScale + p.noiseOffsetX,
        p.y * s.noiseScale + p.noiseOffsetY,
        this.time
      );
      const ny = this.noise3D(
        p.x * s.noiseScale + p.noiseOffsetX + 100,
        p.y * s.noiseScale + p.noiseOffsetY + 100,
        this.time
      );

      const floatX = p.x + nx * speed * 60 * (0.5 + p.depth * 0.5);
      const floatY = p.y + ny * speed * 60 * (0.5 + p.depth * 0.5);

      const blend = s.useGrid ? s.floatGridBlend : 0;
      p.x = floatX * (1 - blend) + p.gridX * blend;
      p.y = floatY * (1 - blend) + p.gridY * blend;

      if (p.x < -100) p.x = w + 100;
      if (p.x > w + 100) p.x = -100;
      if (p.y < -100) p.y = h + 100;
      if (p.y > h + 100) p.y = -100;

      const sizeNoise = (this.noise3D(p.noiseOffsetX, p.noiseOffsetY, this.time * 0.5) + 1) * 0.5;
      p.baseSize = s.minSize + sizeNoise * (s.maxSize - s.minSize);
      p.baseSize *= (1 + audio.bass * 0.4 * (1 - p.depth * 0.5));

      const mediaBright = this.media.getBrightness(
        Math.max(0, Math.min(1, p.x / w)),
        Math.max(0, Math.min(1, p.y / h))
      );
      p.targetSize = p.baseSize * (1 + mediaBright * s.imageIntensity);
      p.size += (p.targetSize - p.size) * Math.min(1, dt * 4);

      const hueShift = audio.mid * s.hueVariation + this.noise3D(p.noiseOffsetX + 200, 0, this.time * 0.2) * s.hueVariation;
      p.color = `hsla(${p.hue + hueShift}, ${p.saturation}%, ${p.lightness}%, ${p.opacity * this.masterOpacity})`;

      p.blur = p.depth * s.depthOfField;
    }
  }

  private draw() {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;

    ctx.fillStyle = this.settings.backgroundColor;
    ctx.fillRect(0, 0, w, h);

    if (this.masterOpacity <= 0.001) return;

    const sorted = [...this.particles].sort((a, b) => a.depth - b.depth);

    for (const p of sorted) {
      if (p.size < 0.5) continue;
      const r = p.size;
      const softness = this.settings.blurMin + p.blur * (this.settings.blurMax - this.settings.blurMin);
      const innerR = r * (1 - softness);

      const grad = ctx.createRadialGradient(p.x, p.y, Math.max(0, innerR), p.x, p.y, r);
      grad.addColorStop(0, p.color);
      grad.addColorStop(1, p.color.replace(/[\d.]+\)$/, '0)'));

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }
}
