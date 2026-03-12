import { createNoise3D } from 'simplex-noise';
import { Particle, Settings, AudioData, GravityShape, SwirlImpulse } from '@/types';
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
  private baseParticleCount = 0;
  private cursorX = 0;
  private cursorY = 0;
  private prevCursorX = 0;
  private prevCursorY = 0;
  private cursorVx = 0;
  private cursorVy = 0;
  private cursorDown = false;
  private swirlImpulses: SwirlImpulse[] = [];
  private musicSizePulse = 0;
  private targetSettings: Settings | null = null;
  private transitionStart: Settings | null = null;
  private transitionProgress = 0;
  private readonly REF_SIZE = 1080;
  private _introMode = true;
  private introTime = 0;
  private introAngles: number[] = [];
  private mediaBrightCenterX = 0;
  private mediaBrightCenterY = 0;
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

  private getViewScale(): number {
    return Math.min(window.innerWidth, window.innerHeight) / this.REF_SIZE;
  }

  private getSquarePad(): [number, number] {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const side = Math.max(w, h);
    return [(side - w) / 2, (side - h) / 2];
  }

  private edgeSizeFade(px: number, py: number, w: number, h: number): number {
    const margin = Math.min(w, h) * 0.10;
    if (margin < 1) return 1;
    const fx = Math.min(Math.max(0, px / margin), Math.max(0, (w - px) / margin), 1);
    const fy = Math.min(Math.max(0, py / margin), Math.max(0, (h - py) / margin), 1);
    return fx * fx * fy * fy;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isMobile = w < 768;
    const dpr = Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Remap home positions using square-relative coordinates
    if (this.prevW > 0 && this.prevH > 0 && this.particles.length > 0) {
      const oldSide = Math.max(this.prevW, this.prevH);
      const newSide = Math.max(w, h);
      const oldPadX = (oldSide - this.prevW) / 2;
      const oldPadY = (oldSide - this.prevH) / 2;
      const newPadX = (newSide - w) / 2;
      const newPadY = (newSide - h) / 2;
      for (const p of this.particles) {
        p.homeX = ((p.homeX + oldPadX) / oldSide) * newSide - newPadX;
        p.homeY = ((p.homeY + oldPadY) / oldSide) * newSide - newPadY;
      }
    }
    this.prevW = w;
    this.prevH = h;

    this.assignGridPositions();
    if (this.mediaGridBlend > 0.001 && this.particles.length > 0) {
      this.assignMediaGridPositions();
    }
  }

  private getMediaGridCount(): number {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cols = this.settings.mediaGridColumns;
    const cellW = w / cols;
    const rows = Math.ceil(h / cellW);
    return cols * rows;
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
    if (this.targetSettings && this.transitionProgress < 1) {
      // A transition is in progress -- update the target instead of cancelling
      this.targetSettings = { ...s };
    } else {
      this.applySettings(s);
      this.targetSettings = null;
      this.transitionStart = null;
    }
  }

  transitionToSettings(s: Settings) {
    this.transitionStart = { ...this.settings };
    this.targetSettings = { ...s };
    this.transitionProgress = 0;
  }

  private applySettings(s: Settings, isTransitioning = false) {
    const oldUseGrid = this.settings.useGrid;
    const oldCols = this.settings.gridColumns;
    const oldCount = this.settings.circleCount;

    // During transitions, defer particle count changes to avoid jitter
    if (isTransitioning) {
      this.settings = { ...s, circleCount: oldCount, gridColumns: oldCols, useGrid: oldUseGrid };
      this.audio.setGain(s.micGain);
      return;
    }

    this.settings = { ...s };

    const needsRecount =
      s.useGrid !== oldUseGrid ||
      (s.useGrid && s.gridColumns !== oldCols) ||
      (!s.useGrid && s.circleCount !== oldCount);

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

  private lerpSettings(dt: number) {
    if (!this.targetSettings || !this.transitionStart) return;

    const rate = this.targetSettings.presetTransitionSpeed * 2;
    this.transitionProgress = Math.min(1, this.transitionProgress + rate * dt);

    // Smoothstep easing for natural acceleration/deceleration
    const t = this.transitionProgress;
    const eased = t * t * (3 - 2 * t);

    const a = this.transitionStart;
    const b = this.targetSettings;
    const next = { ...this.settings };

    const numericKeys: (keyof Settings)[] = [
      'circleCount', 'minSize', 'maxSize', 'blurMin', 'blurMax',
      'animationSpeed', 'noiseScale', 'noiseStrength', 'noiseSpeed',
      'driftStrength', 'driftSpeed', 'waveStrength', 'waveFrequency', 'waveSpeed',
      'waveDirection', 'floatGridBlend', 'gridColumns',
      'soundSensitivity', 'soundSmoothing', 'soundBurstDecay', 'micGain',
      'imageIntervalMin', 'imageIntervalMax', 'imageFadeDuration', 'imageIntensity',
      'mediaGridColumns', 'hueVariation', 'opacityMin', 'opacityMax',
      'depthOfField', 'blurPercent', 'gravityStrength',
    ];

    for (const key of numericKeys) {
      const sv = a[key] as number;
      const tv = b[key] as number;
      const val = sv + (tv - sv) * eased;
      (next as Record<string, unknown>)[key] =
        key === 'circleCount' || key === 'gridColumns' || key === 'mediaGridColumns'
          ? Math.round(val)
          : val;
    }

    // Snap booleans and non-numeric values immediately
    next.useGrid = b.useGrid;
    next.mediaEnabled = b.mediaEnabled;
    next.mediaAutoGrid = b.mediaAutoGrid;
    next.gravityShape = b.gravityShape;
    next.backgroundColor = b.backgroundColor;
    next.paletteColors = b.paletteColors;
    next.presetTransitionSpeed = b.presetTransitionSpeed;

    if (this.transitionProgress >= 1) {
      // Transition complete: apply final settings with full recount
      this.applySettings(next);
      this.transitionStart = null;
      this.targetSettings = null;
    } else {
      // Mid-transition: defer particle count/grid changes
      this.applySettings(next, true);
    }
  }

  private scatterParticles() {
    const side = Math.max(window.innerWidth, window.innerHeight);
    const [padX, padY] = this.getSquarePad();
    for (const p of this.particles) {
      p.homeX = -padX + Math.random() * side;
      p.homeY = -padY + Math.random() * side;
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
    const side = Math.max(window.innerWidth, window.innerHeight);
    const [padX, padY] = this.getSquarePad();
    const count = this.getEffectiveCount();
    const { paletteColors } = this.settings;
    const hslPalette = paletteColors.map(c => this.hslToComponents(c));

    for (let i = 0; i < count; i++) {
      const pal = hslPalette[Math.floor(Math.random() * hslPalette.length)];
      const depth = Math.random();
      const x = -padX + Math.random() * side;
      const y = -padY + Math.random() * side;
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
        notePulse: 0,
        mediaDelay: 0,
        preMediaX: 0,
        preMediaY: 0,
        mediaSpeed: 0,
      });
    }
    this.assignGridPositions();
  }

  private adjustParticleCount() {
    // Skip during active media animation to avoid destroying ghost particles
    if (this.baseParticleCount > 0) return;

    const target = this.getEffectiveCount();
    const side = Math.max(window.innerWidth, window.innerHeight);
    const [padX, padY] = this.getSquarePad();
    const hslPalette = this.settings.paletteColors.map(c => this.hslToComponents(c));

    while (this.particles.length < target) {
      const pal = hslPalette[Math.floor(Math.random() * hslPalette.length)];
      const depth = Math.random();
      const x = -padX + Math.random() * side;
      const y = -padY + Math.random() * side;
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
        notePulse: 0,
        mediaDelay: 0,
        preMediaX: 0,
        preMediaY: 0,
        mediaSpeed: 0,
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

  // Soft focus area: returns a drift bias (0..1) that gently keeps particles
  // lingering within the shape. Not a hard pull -- just a tendency to stay.
  private focusBias(px: number, py: number, w: number, h: number, shape: GravityShape): [number, number] {
    if (shape === 'none') return [0, 0];
    const nx = px / w - 0.5;
    const ny = py / h - 0.5;
    let insideness: number;
    if (shape === 'circle') {
      insideness = 1 - Math.sqrt(nx * nx + ny * ny) / 0.5;
    } else if (shape === 'oval') {
      insideness = 1 - Math.sqrt(nx * nx / (0.4 * 0.4) + ny * ny / (0.55 * 0.55));
    } else {
      const oy = ny + 0.1;
      const wAtY = 0.25 + Math.max(0, oy) * 0.6;
      insideness = 1 - Math.sqrt(nx * nx / (wAtY * wAtY) + (oy / 0.55) * (oy / 0.55));
    }
    // Outside the shape: gentle nudge toward center of shape
    // Inside: no force (free to drift)
    if (insideness > 0) return [0, 0];
    const strength = Math.min(1, -insideness * 2);
    return [-nx * strength, -ny * strength];
  }

  private assignMediaGridPositions() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cols = this.settings.mediaGridColumns;
    const cellW = w / cols;
    const rows = Math.ceil(h / cellW);
    const totalCells = cols * rows;

    // Sample video brightness for the current frame
    this.media.forceSample();

    // Build all cells
    const cells: { x: number; y: number; key: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({ x: (c + 0.5) * cellW, y: (r + 0.5) * cellW, key: r * cols + c });
      }
    }

    const n = Math.min(this.particles.length, totalCells);
    const taken = new Set<number>();

    // Assign each particle to nearest available cell
    const order = this.particles.slice(0, n).map((p, i) => {
      let bestD = Infinity, bestIdx = 0;
      for (let ci = 0; ci < cells.length; ci++) {
        const dx = p.x - cells[ci].x, dy = p.y - cells[ci].y;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; bestIdx = ci; }
      }
      return { i, ci: bestIdx, d: bestD };
    }).sort((a, b) => a.d - b.d);

    for (const { i, ci } of order) {
      let cell = cells[ci];
      if (taken.has(cell.key)) {
        let bestD = Infinity;
        for (const c of cells) {
          if (taken.has(c.key)) continue;
          const dx = this.particles[i].x - c.x, dy = this.particles[i].y - c.y;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; cell = c; }
        }
      }
      taken.add(cell.key);
      this.particles[i].mediaGridX = cell.x;
      this.particles[i].mediaGridY = cell.y;
    }

    // Remaining particles (extras beyond cell count) get assigned to the nearest unoccupied cell
    // or double-up on existing cells
    for (let i = n; i < this.particles.length; i++) {
      const ci = i % totalCells;
      this.particles[i].mediaGridX = cells[ci].x;
      this.particles[i].mediaGridY = cells[ci].y;
    }
  }

  private assignMediaGridPositionsBrightnessAware() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cols = this.settings.mediaGridColumns;
    const cellW = w / cols;
    const rows = Math.ceil(h / cellW);
    const totalCells = cols * rows;

    this.media.forceSample();

    const cells: { x: number; y: number; key: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({ x: (c + 0.5) * cellW, y: (r + 0.5) * cellW, key: r * cols + c });
      }
    }

    const cellBrightness = cells.map(c =>
      this.media.getRawBrightness(
        Math.max(0, Math.min(1, c.x / w)),
        Math.max(0, Math.min(1, c.y / h))
      )
    );

    const origCount = Math.min(this.baseParticleCount, this.particles.length);
    const taken = new Set<number>();

    // For each original particle, find nearest cell preferring bright ones
    const assignments = this.particles.slice(0, origCount).map((p, i) => {
      let bestD = Infinity, bestIdx = 0;
      let bestBrightD = Infinity, bestBrightIdx = -1;
      for (let ci = 0; ci < cells.length; ci++) {
        const dx = p.x - cells[ci].x, dy = p.y - cells[ci].y;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; bestIdx = ci; }
        if (cellBrightness[ci] > 0.1 && d < bestBrightD) {
          bestBrightD = d;
          bestBrightIdx = ci;
        }
      }
      const useBright = bestBrightIdx >= 0 && bestBrightD < bestD * 4;
      return { i, ci: useBright ? bestBrightIdx : bestIdx, d: useBright ? bestBrightD : bestD };
    }).sort((a, b) => a.d - b.d);

    for (const { i, ci } of assignments) {
      let cell = cells[ci];
      if (taken.has(cell.key)) {
        let bestD = Infinity;
        for (const c of cells) {
          if (taken.has(c.key)) continue;
          const dx = this.particles[i].x - c.x, dy = this.particles[i].y - c.y;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; cell = c; }
        }
      }
      taken.add(cell.key);
      this.particles[i].mediaGridX = cell.x;
      this.particles[i].mediaGridY = cell.y;
    }

    // Extras: assign to remaining cells
    const remainingCells = cells.filter(c => !taken.has(c.key));
    for (let i = origCount; i < this.particles.length; i++) {
      const ri = (i - origCount) % Math.max(1, remainingCells.length);
      const cell = remainingCells.length > 0 ? remainingCells[ri] : cells[i % totalCells];
      this.particles[i].mediaGridX = cell.x;
      this.particles[i].mediaGridY = cell.y;
      this.particles[i].x = cell.x;
      this.particles[i].y = cell.y;
    }
  }

  addSwirlImpulses(impulses: SwirlImpulse[]) {
    for (const imp of impulses) this.swirlImpulses.push(imp);
  }

  setMusicSizePulse(v: number) {
    this.musicSizePulse = v;
  }

  triggerNotePulse(count: number, strength: number) {
    const len = this.particles.length;
    if (len === 0) return;
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * len);
      this.particles[idx].notePulse = Math.min(1, this.particles[idx].notePulse + strength);
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
  get introMode() { return this._introMode; }

  toggleFade() {
    if (this.fadeTarget > 0.5) this.fadeOut();
    else this.fadeIn();
  }

  exitIntro() {
    this._introMode = false;
  }

  private setupIntroCircle() {
    this.introAngles = [];
    const count = this.particles.length;
    for (let i = 0; i < count; i++) {
      this.introAngles.push((i / count) * Math.PI * 2 + Math.random() * 0.3);
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.3;
    for (let i = 0; i < count; i++) {
      const angle = this.introAngles[i];
      this.particles[i].x = cx + Math.cos(angle) * radius;
      this.particles[i].y = cy + Math.sin(angle) * radius;
      this.particles[i].size = 0;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.prevW = window.innerWidth;
    this.prevH = window.innerHeight;
    this.initParticles();
    this.setupIntroCircle();
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
    // Smooth preset transitions
    this.lerpSettings(dt);

    const s = this.settings;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const vs = this.getViewScale();
    const [padX, padY] = this.getSquarePad();
    this.time += dt * s.animationSpeed * 0.5;

    // Master fade
    const fadeLerp = dt / Math.max(s.fadeDuration, 0.1);
    if (this.masterOpacity < this.fadeTarget) {
      this.masterOpacity = Math.min(this.fadeTarget, this.masterOpacity + fadeLerp);
    } else if (this.masterOpacity > this.fadeTarget) {
      this.masterOpacity = Math.max(this.fadeTarget, this.masterOpacity - fadeLerp);
    }

    // ===== INTRO MODE: circle formation =====
    if (this._introMode) {
      this.introTime += dt;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.3;
      const effectiveMinSz = s.minSize * vs;
      const effectiveMaxSz = s.maxSize * vs;
      const avgSize = (effectiveMinSz + effectiveMaxSz) * 0.5;

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const baseAngle = this.introAngles[i] || 0;
        const angle = baseAngle + this.introTime * 0.1;
        const targetX = cx + Math.cos(angle) * radius;
        const targetY = cy + Math.sin(angle) * radius;
        p.x += (targetX - p.x) * Math.min(1, dt * 3);
        p.y += (targetY - p.y) * Math.min(1, dt * 3);
        const ownSpeed = 0.4 + p.depth * 0.8;
        const ownPhase = p.noiseOffsetX * 100;
        const sizeOsc = 1 + Math.sin(this.introTime * ownSpeed + ownPhase) * 0.3
                           + Math.sin(this.introTime * ownSpeed * 0.6 + ownPhase * 1.7) * 0.15;
        const perParticleScale = 0.35 + p.depth * 0.9 + Math.sin(baseAngle * 7.3) * 0.15;
        p.targetSize = avgSize * sizeOsc * perParticleScale;
        p.size += (p.targetSize - p.size) * Math.min(1, dt * 2);
        const baseOpacity = s.opacityMin + p.depth * (s.opacityMax - s.opacityMin);
        p.opacity = baseOpacity;
        const hueShift = this.noise3D(p.noiseOffsetX + 200, 0, this.introTime * 0.2) * s.hueVariation;
        p.color = `hsla(${p.hue + hueShift}, ${p.saturation}%, ${p.lightness}%, ${p.opacity * this.masterOpacity})`;
        const blurThreshold = 1 - s.blurPercent;
        p.blur = p.blurAmount >= blurThreshold
          ? ((p.blurAmount - blurThreshold) / Math.max(0.001, s.blurPercent)) * s.depthOfField
          : 0;
      }
      return;
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
    const mediaFade = this.media.intensity;
    const mediaActive = mediaFade > 0.01;
    if (s.mediaAutoGrid && !s.useGrid) {
      if (mediaActive && !this.prevMediaActive) {
        if (this.baseParticleCount === 0) {
          this.baseParticleCount = this.particles.length;
        }

        // Save pre-media position and assign random travel speed for all originals
        for (let i = 0; i < this.baseParticleCount; i++) {
          const p = this.particles[i];
          p.preMediaX = p.x;
          p.preMediaY = p.y;
          p.mediaSpeed = 0.6 + Math.random() * 0.8;
        }

        const totalNeeded = this.getMediaGridCount();

        // Spawn extra particles at their grid positions with size 0 (will grow in)
        if (this.particles.length < totalNeeded) {
          const cols = s.mediaGridColumns;
          const cellW = w / cols;
          const hslPalette = s.paletteColors.map(c => this.hslToComponents(c));
          while (this.particles.length < totalNeeded) {
            const idx = this.particles.length;
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const gx = (col + 0.5) * cellW;
            const gy = (row + 0.5) * cellW;
            const pal = hslPalette[Math.floor(Math.random() * hslPalette.length)];
            const depth = Math.random();
            this.particles.push({
              x: gx, y: gy, homeX: gx, homeY: gy, vx: 0, vy: 0,
              baseSize: 0, size: 0, targetSize: 0, color: '',
              hue: pal[0], saturation: pal[1], lightness: pal[2],
              blur: 0, blurAmount: Math.random(),
              opacity: s.opacityMin + depth * (s.opacityMax - s.opacityMin),
              depth, gridX: 0, gridY: 0, mediaGridX: gx, mediaGridY: gy,
              noiseOffsetX: Math.random() * 1000, noiseOffsetY: Math.random() * 1000,
              notePulse: 0, mediaDelay: 0.4 + Math.random() * 0.4,
              preMediaX: gx, preMediaY: gy,
              mediaSpeed: 0.5 + Math.random() * 0.8,
            });
          }
          this.rebuildSortOrder();
        }

        // Assign originals to bright cells, extras to remaining cells
        this.assignMediaGridPositionsBrightnessAware();

        // Set per-particle mediaDelay and compute brightness centroid for gathering
        this.media.forceSample();
        let brightSumX = 0, brightSumY = 0, brightSum = 0;
        const cols = s.mediaGridColumns;
        const cellW2 = w / cols;
        const rows2 = Math.ceil(h / cellW2);
        for (let r = 0; r < rows2; r++) {
          for (let c = 0; c < cols; c++) {
            const cx = (c + 0.5) * cellW2;
            const cy = (r + 0.5) * cellW2;
            const b = this.media.getRawBrightness(
              Math.max(0, Math.min(1, cx / w)),
              Math.max(0, Math.min(1, cy / h))
            );
            brightSumX += cx * b;
            brightSumY += cy * b;
            brightSum += b;
          }
        }
        this.mediaBrightCenterX = brightSum > 0.01 ? brightSumX / brightSum : w / 2;
        this.mediaBrightCenterY = brightSum > 0.01 ? brightSumY / brightSum : h / 2;

        for (let i = 0; i < this.particles.length; i++) {
          const p = this.particles[i];
          const bright = this.media.getRawBrightness(
            Math.max(0, Math.min(1, p.mediaGridX / w)),
            Math.max(0, Math.min(1, p.mediaGridY / h))
          );
          if (i < this.baseParticleCount) {
            p.mediaDelay = (1 - bright) * 0.4 + Math.random() * 0.1;
          } else {
            p.mediaDelay = 0.3 + (1 - bright) * 0.3 + Math.random() * 0.2;
          }
        }
      }

      // Smooth global blend toward media intensity
      if (mediaActive) {
        const blendRate = this.mediaGridBlend < mediaFade ? dt * 1.5 : dt * 2.0;
        this.mediaGridBlend += (mediaFade - this.mediaGridBlend) * Math.min(1, blendRate);
      } else {
        this.mediaGridBlend += (0 - this.mediaGridBlend) * Math.min(1, dt * 1.5);
        if (this.mediaGridBlend < 0.005) {
          this.mediaGridBlend = 0;
          if (this.baseParticleCount > 0) {
            let allShrunk = true;
            for (let ei = this.baseParticleCount; ei < this.particles.length; ei++) {
              if (this.particles[ei].size > 0.5) { allShrunk = false; break; }
            }
            if (allShrunk) {
              this.particles.length = Math.min(this.baseParticleCount, this.particles.length);
              this.rebuildSortOrder();
              this.baseParticleCount = 0;
              this.adjustParticleCount();
            }
          }
        }
      }
    } else {
      this.mediaGridBlend = 0;
    }
    this.prevMediaActive = mediaActive;

    // Use a single blend factor for everything: size range, position, and brightness
    // In grid mode, particles are already positioned -- just blend size with brightness
    const mediaBlend = s.useGrid ? mediaFade : this.mediaGridBlend;

    // Effective size range: interpolate between regular and grid sizes, scaled to viewport
    const effectiveMinSize = (s.minSize + (s.gridMinSize - s.minSize) * mediaBlend) * vs;
    const effectiveMaxSize = (s.maxSize + (s.gridMaxSize - s.maxSize) * mediaBlend) * vs;
    const sizeRange = effectiveMaxSize - effectiveMinSize;

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
    const cursorRadius = Math.sqrt(w * w + h * h) * 0.18 * vs;
    const cursorRadiusSq = cursorRadius * cursorRadius;

    // Age swirl impulses once per frame (not per particle)
    for (let si = this.swirlImpulses.length - 1; si >= 0; si--) {
      this.swirlImpulses[si].age += dt;
      if (this.swirlImpulses[si].age >= this.swirlImpulses[si].maxAge) {
        this.swirlImpulses.splice(si, 1);
      }
    }

    for (let pi = 0; pi < this.particles.length; pi++) {
      const p = this.particles[pi];
      if (!p) continue;

      // ===== POSITION =====
      if (s.useGrid) {
        const looseness = 1 - s.floatGridBlend;
        const jitterX = looseness > 0.01
          ? this.noise3D(p.noiseOffsetX + 300, p.noiseOffsetY + 300, this.time * s.driftSpeed) * 30 * vs * looseness
          : 0;
        const jitterY = looseness > 0.01
          ? this.noise3D(p.noiseOffsetX + 400, p.noiseOffsetY + 400, this.time * s.driftSpeed) * 30 * vs * looseness
          : 0;
        const targetX = p.gridX + jitterX;
        const targetY = p.gridY + jitterY;
        p.x += (targetX - p.x) * Math.min(1, dt * 8);
        p.y += (targetY - p.y) * Math.min(1, dt * 8);
        p.homeX = p.x;
        p.homeY = p.y;
      } else {
        const isExtraP = this.baseParticleCount > 0 && pi >= this.baseParticleCount;
        const inMediaTransition = this.mediaGridBlend > 0.001 && this.baseParticleCount > 0;

        // During media: freeze drift for original particles so they return to pre-media positions
        if (!inMediaTransition || isExtraP) {
          const driftNx = this.noise3D(p.noiseOffsetX + 500, p.noiseOffsetY + 500, this.time * s.driftSpeed);
          const driftNy = this.noise3D(p.noiseOffsetX + 600, p.noiseOffsetY + 600, this.time * s.driftSpeed);
          p.homeX += driftNx * dt * s.driftStrength * s.animationSpeed * vs;
          p.homeY += driftNy * dt * s.driftStrength * s.animationSpeed * vs;

          if (s.gravityShape !== 'none' && s.gravityStrength > 0.01 && this.mediaGridBlend < 0.01) {
            const [bx, by] = this.focusBias(p.homeX, p.homeY, w, h, s.gravityShape);
            const fStr = s.gravityStrength * 15 * dt;
            p.homeX += bx * fStr * w;
            p.homeY += by * fStr * h;
          }

          const softMargin = 50 * vs;
          const hardMargin = 200 * vs;
          const sqLeft = -padX - softMargin;
          const sqRight = w + padX + softMargin;
          const sqTop = -padY - softMargin;
          const sqBottom = h + padY + softMargin;
          const hardLeft = -padX - hardMargin;
          const hardRight = w + padX + hardMargin;
          const hardTop = -padY - hardMargin;
          const hardBottom = h + padY + hardMargin;
          if (p.homeX < hardLeft) p.homeX = sqLeft;
          else if (p.homeX > hardRight) p.homeX = sqRight;
          if (p.homeY < hardTop) p.homeY = sqTop;
          else if (p.homeY > hardBottom) p.homeY = sqBottom;
          const pushStrength = 0.05;
          if (p.homeX < sqLeft) p.homeX += (sqLeft - p.homeX + 1) * pushStrength;
          if (p.homeX > sqRight) p.homeX -= (p.homeX - sqRight + 1) * pushStrength;
          if (p.homeY < sqTop) p.homeY += (sqTop - p.homeY + 1) * pushStrength;
          if (p.homeY > sqBottom) p.homeY -= (p.homeY - sqBottom + 1) * pushStrength;
        } else {
          // Original particle during media: pin homeX/Y to saved pre-media position
          p.homeX = p.preMediaX;
          p.homeY = p.preMediaY;
        }

        // Position: blend between pre-media position and grid cell during media
        if (this.mediaGridBlend > 0.001) {
          const rawBlend = this.mediaGridBlend;
          const delayRange = 0.6;
          const pBlend = Math.max(0, Math.min(1,
            (rawBlend - p.mediaDelay * delayRange) / Math.max(0.01, 1 - p.mediaDelay * delayRange)
          ));

          if (isExtraP) {
            p.x += (p.mediaGridX - p.x) * Math.min(1, dt * 8);
            p.y += (p.mediaGridY - p.y) * Math.min(1, dt * 8);
          } else if (pBlend < 0.001) {
            // Not yet blending: gently drift toward brightness center (gathering)
            const gatherRate = dt * 0.3;
            const driftRate = dt * (0.6 + p.depth * 0.8);
            p.x += (p.preMediaX - p.x) * Math.min(1, driftRate);
            p.y += (p.preMediaY - p.y) * Math.min(1, driftRate);
            p.x += (this.mediaBrightCenterX - p.x) * Math.min(1, gatherRate);
            p.y += (this.mediaBrightCenterY - p.y) * Math.min(1, gatherRate);
          } else {
            // Gathering bias: early in blend, pull toward brightness center.
            // As pBlend→1, target becomes the exact grid cell.
            const gatherStrength = (1 - pBlend) * (1 - pBlend) * 0.5;
            const biasedX = p.mediaGridX + (this.mediaBrightCenterX - p.mediaGridX) * gatherStrength;
            const biasedY = p.mediaGridY + (this.mediaBrightCenterY - p.mediaGridY) * gatherStrength;
            const targetX = p.preMediaX + (biasedX - p.preMediaX) * pBlend;
            const targetY = p.preMediaY + (biasedY - p.preMediaY) * pBlend;
            const lerpRate = dt * (2 + p.mediaSpeed * 2);
            p.x += (targetX - p.x) * Math.min(1, lerpRate);
            p.y += (targetY - p.y) * Math.min(1, lerpRate);
          }
        } else {
          // Normal mode: follow home position with drift
          const driftLerp = dt * (0.6 + p.depth * 0.8);
          p.x += (p.homeX - p.x) * Math.min(1, driftLerp);
          p.y += (p.homeY - p.y) * Math.min(1, driftLerp);
        }
      }

      // ===== CURSOR INTERACTION (disabled during grid formation) =====
      if (this.cursorDown && this.mediaGridBlend < 0.01) {
        const cdx = p.x - this.cursorX;
        const cdy = p.y - this.cursorY;
        const distSq = cdx * cdx + cdy * cdy;
        if (distSq < cursorRadiusSq && distSq > 1) {
          const dist = Math.sqrt(distSq);
          const proximity = 1 - dist / cursorRadius;
          const proxSq = proximity * proximity;
          const nx = cdx / dist;
          const ny = cdy / dist;
          p.vx += nx * proxSq * 4000 * vs * dt;
          p.vy += ny * proxSq * 4000 * vs * dt;
          const cursorSpeed = Math.sqrt(this.cursorVx * this.cursorVx + this.cursorVy * this.cursorVy);
          if (cursorSpeed > 5) {
            const drag = proxSq * 2500 * vs * dt * Math.min(1, cursorSpeed / 300);
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

      // ===== MUSIC SWIRL IMPULSES (gentle, cursor-like) =====
      for (const imp of this.swirlImpulses) {
        const ix = imp.x * w;
        const iy = imp.y * h;
        const cdx = p.x - ix;
        const cdy = p.y - iy;
        const distSq = cdx * cdx + cdy * cdy;
        const swirlRadius = Math.sqrt(w * w + h * h) * imp.radius;
        if (distSq < swirlRadius * swirlRadius && distSq > 1) {
          const dist = Math.sqrt(distSq);
          const proximity = 1 - dist / swirlRadius;
          const proxSq = proximity * proximity;
          // Smooth fade: ease out over lifetime (cubic)
          const lifeFrac = imp.age / imp.maxAge;
          const fade = (1 - lifeFrac) * (1 - lifeFrac);
          // Radial push (like cursor repulsion but gentler)
          const nx = cdx / dist;
          const ny = cdy / dist;
          p.vx += nx * proxSq * fade * imp.strength * 800 * vs * dt;
          p.vy += ny * proxSq * fade * imp.strength * 800 * vs * dt;
          // Gentle directional drift
          p.vx += imp.dx * proxSq * fade * 200 * vs * dt;
          p.vy += imp.dy * proxSq * fade * 200 * vs * dt;
        }
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

      // Use unfaded brightness for sizing -- fade timing is handled by pSizeBlend,
      // not by fadeProgress. This prevents double-fade and dots disappearing.
      const mediaBright = this.media.getUnfadedBrightness(
        Math.max(0, Math.min(1, p.x / w)),
        Math.max(0, Math.min(1, p.y / h))
      );
      const gridCellSize = effectiveMaxSize * 0.5;
      const mediaSize = mediaBright * gridCellSize;

      const isExtra = this.baseParticleCount > 0 && pi >= this.baseParticleCount;
      const delayRange = 0.6;
      let pSizeBlend: number;
      if (mediaBlend > 0.001) {
        if (this.media.intensity > 0.01) {
          pSizeBlend = Math.max(0, Math.min(1,
            (mediaBlend - p.mediaDelay * delayRange) / Math.max(0.01, 1 - p.mediaDelay * delayRange)
          ));
        } else {
          const invertedDelay = 1 - p.mediaDelay;
          pSizeBlend = Math.max(0, Math.min(1,
            (mediaBlend - invertedDelay * delayRange) / Math.max(0.01, 1 - invertedDelay * delayRange)
          ));
        }
      } else {
        pSizeBlend = 0;
      }

      let blendedSize: number;
      if (isExtra) {
        // Extras: blend from 0 to mediaSize (never inherit patternSize)
        blendedSize = pSizeBlend > 0.001 ? mediaSize * pSizeBlend : 0;
      } else if (pSizeBlend < 0.001) {
        blendedSize = patternSize;
      } else {
        // Originals: crossfade from patternSize to mediaSize.
        // Dark cells (mediaSize≈0) cause the dot to shrink away smoothly.
        blendedSize = patternSize * (1 - pSizeBlend) + mediaSize * pSizeBlend;
      }

      // Per-particle note pulse
      const noteMult = 1 + p.notePulse * 3.0;
      p.notePulse *= Math.pow(0.04, dt);
      if (p.notePulse < 0.005) p.notePulse = 0;

      const musicMult = 1 + this.musicSizePulse * 1.5 * (0.5 + p.depth * 0.5);
      const burstSizeMult = 1 + this.soundBurst * 2.0 * (0.5 + p.depth * 0.5);
      p.targetSize = blendedSize * burstSizeMult * musicMult * noteMult;
      p.targetSize = Math.max(0, Math.min(effectiveMaxSize * 2.5, p.targetSize));

      const eFade = this.edgeSizeFade(p.x, p.y, w, h);
      p.targetSize *= eFade;

      // Size lerp: extras grow very slowly, shrink fast; regular particles moderate
      const isGrowing = p.targetSize > p.size;
      let sizeLerp: number;
      if (isExtra) {
        sizeLerp = isGrowing ? dt * 0.5 : dt * 5;
      } else if (pSizeBlend > 0.01) {
        // During media: grow slowly (staggered reveal), shrink moderately
        sizeLerp = isGrowing ? dt * 1.5 : dt * 3;
      } else {
        sizeLerp = isGrowing ? dt * 5 : dt * 3;
      }
      p.size += (p.targetSize - p.size) * Math.min(1, sizeLerp);

      // ===== OPACITY (no edge fade -- edges handled by size) =====
      const baseOpacity = s.opacityMin + p.depth * (s.opacityMax - s.opacityMin);
      p.opacity = baseOpacity;

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
      if (!p || p.size < 0.5) continue;
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
