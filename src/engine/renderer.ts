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
  private sortedParticles: Particle[] = [];
  private masterOpacity = 0;
  private fadeTarget = 0;
  private settings: Settings;
  private soundBurst = 0;
  private soundSpeedBoost = 0;
  private prevGridCols = 0;
  private mediaGridBlend = 0; // 0 = scattered, 1 = grid formation
  private prevMediaActive = false;
  private cursorX = 0;
  private cursorY = 0;
  private prevCursorX = 0;
  private prevCursorY = 0;
  private cursorVx = 0;
  private cursorVy = 0;
  private cursorDown = false;
  audio: AudioEngine;
  media: MediaEngine;

  constructor(canvas: HTMLCanvasElement, settings: Settings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.settings = { ...settings };
    this.prevGridCols = settings.gridColumns;
    this.audio = new AudioEngine();
    this.media = new MediaEngine();
    this.resize();
  }

  private prevW = 0;
  private prevH = 0;

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Limit DPR on mobile for performance (phones have 3x+)
    const isMobile = w < 768;
    const dpr = Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Proportionally remap all particle positions to new viewport
    if (this.prevW > 0 && this.prevH > 0 && this.particles.length > 0) {
      const sx = w / this.prevW;
      const sy = h / this.prevH;
      for (const p of this.particles) {
        p.homeX *= sx;
        p.homeY *= sy;
        p.x *= sx;
        p.y *= sy;
      }
    }
    this.prevW = w;
    this.prevH = h;

    this.assignGridPositions();
  }

  private getGridCount(): number {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cols = this.settings.gridColumns;
    const cellW = w / cols;
    const rows = Math.ceil(h / cellW);
    return cols * rows;
  }

  private getEffectiveCount(): number {
    return this.settings.useGrid ? this.getGridCount() : this.settings.circleCount;
  }

  updateSettings(s: Settings) {
    const oldUseGrid = this.settings.useGrid;
    const oldCols = this.settings.gridColumns;
    const oldCount = this.settings.circleCount;
    this.settings = { ...s };

    const needsRecount =
      s.useGrid !== oldUseGrid ||
      (s.useGrid && s.gridColumns !== oldCols) ||
      (!s.useGrid && s.circleCount !== oldCount);

    // When switching from grid to float, scatter home positions
    if (oldUseGrid && !s.useGrid) {
      this.scatterParticles();
    }

    if (needsRecount) {
      this.adjustParticleCount();
    } else if (s.gridColumns !== oldCols) {
      this.assignGridPositions();
    }
    this.audio.setGain(s.micGain);
  }

  private scatterParticles() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const p of this.particles) {
      p.homeX = Math.random() * w;
      p.homeY = Math.random() * h;
    }
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
    const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d !== 0) {
      if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
      else if (max === gn) h = ((bn - rn) / d + 2) * 60;
      else h = ((rn - gn) / d + 4) * 60;
    }
    return [h, sat * 100, l * 100];
  }

  private initParticles() {
    this.particles = [];
    const w = window.innerWidth;
    const h = window.innerHeight;
    const count = this.getEffectiveCount();
    const { paletteColors } = this.settings;
    const hslPalette = paletteColors.map(c => this.hslToComponents(c));

    for (let i = 0; i < count; i++) {
      const pal = hslPalette[Math.floor(Math.random() * hslPalette.length)];
      const depth = Math.random();
      const x = Math.random() * w;
      const y = Math.random() * h;
      this.particles.push({
        x, y,
        homeX: x,
        homeY: y,
        vx: 0, vy: 0,
        baseSize: 0, size: 0, targetSize: 0,
        color: '',
        hue: pal[0], saturation: pal[1], lightness: pal[2],
        blur: 0,
        blurAmount: Math.random(),
        opacity: this.settings.opacityMin + depth * (this.settings.opacityMax - this.settings.opacityMin),
        depth,
        gridX: 0, gridY: 0,
        mediaGridX: 0, mediaGridY: 0,
        noiseOffsetX: Math.random() * 1000,
        noiseOffsetY: Math.random() * 1000,
      });
    }
    this.assignGridPositions();
  }

  private adjustParticleCount() {
    const target = this.getEffectiveCount();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const hslPalette = this.settings.paletteColors.map(c => this.hslToComponents(c));

    while (this.particles.length < target) {
      const pal = hslPalette[Math.floor(Math.random() * hslPalette.length)];
      const depth = Math.random();
      const x = Math.random() * w;
      const y = Math.random() * h;
      this.particles.push({
        x, y,
        homeX: x, homeY: y,
        vx: 0, vy: 0,
        baseSize: 0, size: 0, targetSize: 0,
        color: '',
        hue: pal[0], saturation: pal[1], lightness: pal[2],
        blur: 0,
        blurAmount: Math.random(),
        opacity: this.settings.opacityMin + depth * (this.settings.opacityMax - this.settings.opacityMin),
        depth,
        gridX: 0, gridY: 0,
        mediaGridX: 0, mediaGridY: 0,
        noiseOffsetX: Math.random() * 1000,
        noiseOffsetY: Math.random() * 1000,
      });
    }
    while (this.particles.length > target) {
      this.particles.pop();
    }
    this.assignGridPositions();
  }

  private rebuildSortOrder() {
    this.sortedParticles = [...this.particles].sort((a, b) => a.depth - b.depth);
  }

  private assignGridPositions() {
    if (this.particles.length === 0) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cols = this.settings.gridColumns;
    const cellW = w / cols;
    const rows = Math.ceil(h / cellW);

    this.particles.forEach((p, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols) % Math.max(1, rows);
      p.gridX = (col + 0.5) * cellW;
      p.gridY = (row + 0.5) * cellW;
    });
    this.rebuildSortOrder();
  }

  private assignMediaGridPositions() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cols = this.settings.mediaGridColumns;
    const cellW = w / cols;
    const rows = Math.ceil(h / cellW);
    const taken = new Set<number>();

    // Particles closest to their natural cell center get first pick
    const order = this.particles.map((p, i) => {
      const c = Math.max(0, Math.min(cols - 1, Math.floor(p.x / cellW)));
      const r = Math.max(0, Math.min(rows - 1, Math.floor(p.y / cellW)));
      const dx = p.x - (c + 0.5) * cellW;
      const dy = p.y - (r + 0.5) * cellW;
      return { i, c, r, d: dx * dx + dy * dy };
    }).sort((a, b) => a.d - b.d);

    for (const { i, c, r } of order) {
      let ac = c, ar = r;
      if (taken.has(r * cols + c)) {
        search:
        for (let rad = 1; rad < Math.max(cols, rows); rad++) {
          for (let dr = -rad; dr <= rad; dr++) {
            for (let dc = -rad; dc <= rad; dc++) {
              if (Math.abs(dr) < rad && Math.abs(dc) < rad) continue;
              const nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !taken.has(nr * cols + nc)) {
                ar = nr; ac = nc;
                break search;
              }
            }
          }
        }
      }
      taken.add(ar * cols + ac);
      this.particles[i].mediaGridX = (ac + 0.5) * cellW;
      this.particles[i].mediaGridY = (ar + 0.5) * cellW;
    }
  }

  triggerMedia() {
    this.media.triggerNext();
  }

  setCursor(x: number, y: number, down: boolean) {
    if (!this.cursorDown && down) {
      this.prevCursorX = x;
      this.prevCursorY = y;
    }
    this.cursorX = x;
    this.cursorY = y;
    this.cursorDown = down;
  }

  triggerMediaByIndex(idx: number) {
    this.media.triggerByIndex(idx);
  }

  fadeIn() { this.fadeTarget = 1; }
  fadeOut() { this.fadeTarget = 0; }
  get isFadedOut() { return this.masterOpacity <= 0.001 && this.fadeTarget === 0; }

  toggleFade() {
    if (this.fadeTarget > 0.5) this.fadeOut();
    else this.fadeIn();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.prevW = window.innerWidth;
    this.prevH = window.innerHeight;
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
    this.media.destroy();
  }

  private update(dt: number) {
    const s = this.settings;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.time += dt * s.animationSpeed * 0.5;

    // Master fade
    const fadeLerp = dt / Math.max(s.fadeDuration, 0.1);
    if (this.masterOpacity < this.fadeTarget) {
      this.masterOpacity = Math.min(this.fadeTarget, this.masterOpacity + fadeLerp);
    } else if (this.masterOpacity > this.fadeTarget) {
      this.masterOpacity = Math.max(this.fadeTarget, this.masterOpacity - fadeLerp);
    }

    // Audio with burst detection
    const audio: AudioData = this.audio.getData(s.soundSensitivity, s.soundSmoothing);
    const burstInput = audio.overall;
    if (burstInput > this.soundBurst) {
      this.soundBurst = burstInput;
    } else {
      this.soundBurst *= s.soundBurstDecay;
    }

    // Audio speed boost: volume above threshold gently pushes pattern speed up
    const speedThreshold = 0.15;
    const speedTarget = burstInput > speedThreshold
      ? (burstInput - speedThreshold) * 2.0
      : 0;
    if (speedTarget > this.soundSpeedBoost) {
      // Rise smoothly
      this.soundSpeedBoost += (speedTarget - this.soundSpeedBoost) * Math.min(1, dt * 3);
    } else {
      // Fade back slowly
      this.soundSpeedBoost += (speedTarget - this.soundSpeedBoost) * Math.min(1, dt * 1.2);
    }

    // Apply speed boost to time progression
    this.time += this.soundSpeedBoost * dt * 0.8;

    this.media.setEnabled(s.mediaEnabled);
    this.media.update(dt, s.imageIntervalMin, s.imageIntervalMax, s.imageFadeDuration);

    // Media auto-grid: blend toward grid when media is active
    const mediaActive = this.media.intensity > 0.01;
    if (s.mediaAutoGrid && !s.useGrid) {
      if (mediaActive && !this.prevMediaActive) {
        this.assignMediaGridPositions();
      }
      const targetBlend = mediaActive ? 1 : 0;
      const blendSpeed = mediaActive ? 0.6 : 0.8;
      this.mediaGridBlend += (targetBlend - this.mediaGridBlend) * Math.min(1, dt * blendSpeed);
      if (!mediaActive && this.mediaGridBlend < 0.005) this.mediaGridBlend = 0;
    } else {
      this.mediaGridBlend = 0;
    }
    this.prevMediaActive = mediaActive;

    // Effective size range: interpolate between regular and grid sizes during auto-grid
    const effectiveMinSize = s.useGrid
      ? s.gridMinSize
      : s.minSize + (s.gridMinSize - s.minSize) * this.mediaGridBlend;
    const effectiveMaxSize = s.useGrid
      ? s.gridMaxSize
      : s.maxSize + (s.gridMaxSize - s.maxSize) * this.mediaGridBlend;
    const sizeRange = effectiveMaxSize - effectiveMinSize;
    const mediaFade = this.media.intensity;
    const mediaBlend = (s.mediaAutoGrid && !s.useGrid)
      ? Math.max(this.mediaGridBlend, Math.min(1, mediaFade))
      : Math.min(1, mediaFade);

    // Wave direction vector
    const waveDirX = Math.cos(s.waveDirection);
    const waveDirY = Math.sin(s.waveDirection);

    // Cursor velocity
    if (this.cursorDown) {
      this.cursorVx = (this.cursorX - this.prevCursorX) / Math.max(dt, 0.001);
      this.cursorVy = (this.cursorY - this.prevCursorY) / Math.max(dt, 0.001);
      this.prevCursorX = this.cursorX;
      this.prevCursorY = this.cursorY;
    } else {
      this.cursorVx *= Math.pow(0.01, dt);
      this.cursorVy *= Math.pow(0.01, dt);
    }
    const cursorRadius = Math.sqrt(w * w + h * h) * 0.18;
    const cursorRadiusSq = cursorRadius * cursorRadius;

    for (let pi = 0; pi < this.particles.length; pi++) {
      const p = this.particles[pi];

      // ===== POSITION =====
      if (s.useGrid) {
        const looseness = 1 - s.floatGridBlend;
        const jitterX = looseness > 0.01
          ? this.noise3D(p.noiseOffsetX + 300, p.noiseOffsetY + 300, this.time * s.driftSpeed) * 30 * looseness
          : 0;
        const jitterY = looseness > 0.01
          ? this.noise3D(p.noiseOffsetX + 400, p.noiseOffsetY + 400, this.time * s.driftSpeed) * 30 * looseness
          : 0;
        const targetX = p.gridX + jitterX;
        const targetY = p.gridY + jitterY;
        p.x += (targetX - p.x) * Math.min(1, dt * 8);
        p.y += (targetY - p.y) * Math.min(1, dt * 8);
        p.homeX = p.x;
        p.homeY = p.y;
      } else {
        // Random drift: each particle wanders independently (separate from noise pattern)
        const driftNx = this.noise3D(p.noiseOffsetX + 500, p.noiseOffsetY + 500, this.time * s.driftSpeed);
        const driftNy = this.noise3D(p.noiseOffsetX + 600, p.noiseOffsetY + 600, this.time * s.driftSpeed);
        p.homeX += driftNx * dt * s.driftStrength * s.animationSpeed;
        p.homeY += driftNy * dt * s.driftStrength * s.animationSpeed;

        // Soft contain
        const margin = 50;
        const pushStrength = 0.02;
        if (p.homeX < -margin) p.homeX += (-margin - p.homeX + 1) * pushStrength;
        if (p.homeX > w + margin) p.homeX -= (p.homeX - w - margin + 1) * pushStrength;
        if (p.homeY < -margin) p.homeY += (-margin - p.homeY + 1) * pushStrength;
        if (p.homeY > h + margin) p.homeY -= (p.homeY - h - margin + 1) * pushStrength;

        p.x += (p.homeX - p.x) * Math.min(1, dt * 3);
        p.y += (p.homeY - p.y) * Math.min(1, dt * 3);

        // Blend toward media grid formation when media is active
        if (this.mediaGridBlend > 0.001) {
          p.x = p.x * (1 - this.mediaGridBlend) + p.mediaGridX * this.mediaGridBlend;
          p.y = p.y * (1 - this.mediaGridBlend) + p.mediaGridY * this.mediaGridBlend;
        }
      }

      // ===== CURSOR INTERACTION =====
      if (this.cursorDown) {
        const cdx = p.x - this.cursorX;
        const cdy = p.y - this.cursorY;
        const distSq = cdx * cdx + cdy * cdy;
        if (distSq < cursorRadiusSq && distSq > 1) {
          const dist = Math.sqrt(distSq);
          const proximity = 1 - dist / cursorRadius;
          const proxSq = proximity * proximity;
          const nx = cdx / dist;
          const ny = cdy / dist;
          p.vx += nx * proxSq * 4000 * dt;
          p.vy += ny * proxSq * 4000 * dt;
          const cursorSpeed = Math.sqrt(this.cursorVx * this.cursorVx + this.cursorVy * this.cursorVy);
          if (cursorSpeed > 5) {
            const drag = proxSq * 2500 * dt * Math.min(1, cursorSpeed / 300);
            p.vx += (this.cursorVx / cursorSpeed) * drag;
            p.vy += (this.cursorVy / cursorSpeed) * drag;
          }
        }
      }
      if (p.vx !== 0 || p.vy !== 0) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const damp = Math.pow(0.15, dt);
        p.vx *= damp;
        p.vy *= damp;
        if (Math.abs(p.vx) < 0.1 && Math.abs(p.vy) < 0.1) { p.vx = 0; p.vy = 0; }
      }

      // ===== SIZE: patterns drive size =====
      let sizeMod = 0.5;
      const vp = Math.sqrt(w * w + h * h);

      if (s.noiseStrength > 0.01) {
        const actualNoiseScale = (1 / Math.max(0.01, s.noiseScale)) / vp;
        const noiseSizeVal = (this.noise3D(
          p.x * actualNoiseScale + p.noiseOffsetX,
          p.y * actualNoiseScale + p.noiseOffsetY,
          this.time * s.noiseSpeed
        ) + 1) * 0.5;
        sizeMod += (noiseSizeVal - 0.5) * s.noiseStrength;
      }

      if (s.waveStrength > 0.01) {
        const wavelength = Math.max(0.01, s.waveFrequency) * vp;
        const dot = p.x * waveDirX + p.y * waveDirY;
        const wavePhase = (dot / wavelength) * Math.PI * 2 + this.time * s.waveSpeed * 4;
        const waveSizeVal = (Math.sin(wavePhase) + 1) * 0.5;
        sizeMod += (waveSizeVal - 0.5) * s.waveStrength;
      }

      sizeMod = Math.max(0, Math.min(1, sizeMod));
      const patternSize = effectiveMinSize + sizeMod * sizeRange;

      const mediaBright = this.media.getBrightness(
        Math.max(0, Math.min(1, p.x / w)),
        Math.max(0, Math.min(1, p.y / h))
      );
      const mediaSize = mediaBright * s.imageIntensity * (effectiveMaxSize * 1.2);

      const blendedSize = patternSize * (1 - mediaBlend) + mediaSize * mediaBlend;

      const burstSizeMult = 1 + this.soundBurst * 2.0 * (0.5 + p.depth * 0.5);
      p.targetSize = blendedSize * burstSizeMult;
      p.targetSize = Math.max(0, Math.min(effectiveMaxSize * 1.5, p.targetSize));

      p.size += (p.targetSize - p.size) * Math.min(1, dt * 4);

      // ===== OPACITY =====
      p.opacity = s.opacityMin + p.depth * (s.opacityMax - s.opacityMin);

      // ===== COLOR (no audio, only noise-based hue drift) =====
      const hueShift = this.noise3D(p.noiseOffsetX + 200, 0, this.time * 0.2) * s.hueVariation;
      p.color = `hsla(${p.hue + hueShift}, ${p.saturation}%, ${p.lightness}%, ${p.opacity * this.masterOpacity})`;

      // ===== BLUR: only a percentage of particles get blur =====
      // blurAmount is 0-1 random per particle; only those above (1 - blurPercent) get blur
      const blurThreshold = 1 - s.blurPercent;
      p.blur = p.blurAmount >= blurThreshold
        ? ((p.blurAmount - blurThreshold) / Math.max(0.001, s.blurPercent)) * s.depthOfField
        : 0;
    }
  }

  private draw() {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;

    ctx.fillStyle = this.settings.backgroundColor;
    ctx.fillRect(0, 0, w, h);

    if (this.masterOpacity <= 0.001) return;

    for (const p of this.sortedParticles) {
      if (p.size < 0.5) continue;
      const r = p.size;

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);

      if (p.blur > 0.001) {
        // Blurred circle: radial gradient for bokeh effect
        const softness = this.settings.blurMin + p.blur * (this.settings.blurMax - this.settings.blurMin);
        const innerR = r * (1 - softness);
        const grad = ctx.createRadialGradient(p.x, p.y, Math.max(0, innerR), p.x, p.y, r);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, p.color.replace(/[\d.]+\)$/, '0)'));
        ctx.fillStyle = grad;
      } else {
        // Sharp circle: solid fill
        ctx.fillStyle = p.color;
      }
      ctx.fill();
    }
  }
}
