// Juego de carreras. Sin "game over": se recogen estrellas y los conos solo
// hacen un rebote suave. Dos vistas: desde arriba o desde atrás (horizonte).
// La simulación es la misma en ambas vistas; solo cambia el dibujo.
import { drawVehicle, drawVehicleRear, roundRect } from './vehicles.js';

// speed y gap están en unidades de 800 px de alto (se escalan a la pantalla),
// así el tiempo de reacción es el mismo en vertical u horizontal.
export const LEVELS = {
  1: { speed: 140, curve: 0,    gap: 560, cone: 0 },
  2: { speed: 175, curve: 0,    gap: 500, cone: 0.3 },
  3: { speed: 210, curve: 0.06, gap: 460, cone: 0.4 },
  4: { speed: 250, curve: 0.09, gap: 420, cone: 0.5 },
  5: { speed: 290, curve: 0.12, gap: 380, cone: 0.6 },
};

export const STARS_PER_SPEEDUP = 10;
export const MAX_SPEED_MUL = 1.5; // tope: 50 % más rápido que al inicio

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = n => Math.floor(Math.random() * n);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Game {
  constructor(canvas, { settings, sound, onSpeedUp }) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.s = settings;
    this.sound = sound;
    this.onSpeedUp = onSpeedUp;
    this.cfg = LEVELS[settings.level] || LEVELS[1];
    this.lanes = settings.lanes === 2 ? 2 : 3;
    this.rain = settings.weather === 'rain';
    this.view = settings.view === 'back' ? 'back' : 'top';
    this.t = 0;
    this.paused = true;
    this.clouds = Array.from({ length: 4 }, (_, i) => ({ x: Math.random(), y: rand(0.15, 0.6), s: rand(0.7, 1.2), v: rand(0.004, 0.01) * (i % 2 ? 1 : -1) }));
    this.resize();
    this.reset();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.c.getBoundingClientRect();
    this.W = r.width || window.innerWidth;
    this.H = r.height || window.innerHeight;
    this.c.width = Math.round(this.W * dpr);
    this.c.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.u = this.H / 800;
    // La pista ocupa casi todo el ancho: así los carriles quedan lo más
    // separados posible y la mirada se distingue mejor.
    this.roadW = this.W * (0.9 - this.cfg.curve * 1.6);
    this.laneW = this.roadW / this.lanes;
    this.carY = this.H * 0.8;
    this.carSize = Math.min(this.laneW * 0.8, this.H * 0.2);
    this.amp = this.cfg.curve > 0 ? ((this.W - this.roadW) / 2) * 0.85 : 0;
    this.k = (Math.PI * 2) / (this.H * 2.4);
    this.ahead = this.carY + 80 * this.u; // distancia a la que aparecen los objetos

    // Vista desde atrás: proyección en perspectiva.
    // z = 1 en el vehículo; z = 8 donde aparecen los objetos.
    this.hy = this.H * (this.W > this.H ? 0.3 : 0.36);   // línea del horizonte
    this.yCar = this.H * 0.93;                            // base del vehículo
    this.RW = this.W * 0.94;                              // ancho de la pista a la altura del vehículo
    this.zs = 7 / this.ahead;
    this.rearW = Math.min((this.RW / this.lanes) * 0.62, this.H * 0.36);

    if (this.carX != null) this.carX = this.laneX(this.lane, this.dist);
    this.initRain();
  }

  reset() {
    this.dist = 0;
    this.elapsed = 0;
    this.lane = this.lanes === 3 ? 1 : 0;
    this.carX = this.laneX(this.lane, 0);
    this.tilt = 0;
    this.sway = 0;
    this.objs = [];
    this.decor = [];
    this.parts = [];
    this.nextSpawn = this.carY + this.H * 0.5;
    this.nextDecor = -this.H;
    this.lastStarLane = this.lane;
    this.shake = 0;
    this.slow = 0;
    this.speedMul = 1;
    this.stats = { stars: 0, starsTotal: 0, missed: 0, conesHit: 0, conesAvoided: 0, laneChanges: 0, rts: [], maxSpeedPct: 0 };
    while (this.nextDecor < this.dist + this.ahead) this.spawnDecor(this.nextDecor);
  }

  // ---------- geometría de la pista ----------
  cx(d) {
    if (!this.amp) return this.W / 2;
    const ramp = clamp((d - this.H) / (this.H * 2), 0, 1);
    return this.W / 2 + this.amp * ramp * (0.7 * Math.sin(d * this.k) + 0.3 * Math.sin(d * this.k * 2.3 + 1.3));
  }
  laneX(lane, d) { return this.cx(d) - this.roadW / 2 + this.laneW * (lane + 0.5); }
  sy(d) { return this.carY - (d - this.dist); }

  /** Posición lateral en fracciones del ancho de pista (−0,5 borde izq. … 0,5 borde der.). */
  laneFrac(lane) { return -0.5 + (lane + 0.5) / this.lanes; }

  /** Proyección para la vista desde atrás. dy = distancia por delante del vehículo. */
  proj(dy, frac) {
    const z = 1 + dy * this.zs;
    const s = 1 / Math.max(0.05, z);
    const dyc = Math.min(dy, this.ahead * 1.6); // las curvas lejanas no se exageran
    const bend = clamp(((this.cx(this.dist + dyc) - this.cx(this.dist)) / this.roadW) * this.RW * (1 - Math.min(1, s)) * 2.2, -this.W * 0.45, this.W * 0.45);
    return { x: this.W / 2 + bend + frac * this.RW * s, y: this.hy + (this.yCar - this.hy) * s, s, z };
  }

  // ---------- control ----------
  setZone(z) {
    let target;
    if (this.lanes === 3) target = z === 'left' ? 0 : z === 'right' ? 2 : 1;
    else {
      if (z === 'center') return; // con 2 carriles, mirar al centro no cambia nada
      target = z === 'left' ? 0 : 1;
    }
    if (target !== this.lane) {
      this.lane = target;
      this.stats.laneChanges++;
      this.sound.lane();
    }
  }

  // ---------- velocidad progresiva ----------
  speedUp() {
    const step = String(this.s.speedStep ?? 'rand');
    if (step === '0' || this.speedMul >= MAX_SPEED_MUL) return;
    const inc = step === 'rand' ? rand(0.02, 0.05) : clamp(Number(step) || 0, 0, 10) / 100;
    if (!inc) return;
    this.speedMul = Math.min(MAX_SPEED_MUL, this.speedMul + inc);
    this.stats.maxSpeedPct = Math.round((this.speedMul - 1) * 100);
    if (this.onSpeedUp) this.onSpeedUp(this.stats.maxSpeedPct, this.speedMul >= MAX_SPEED_MUL);
  }

  // ---------- aparición de objetos ----------
  spawnRow(d) {
    const L = this.lanes;
    let sl;
    if (Math.random() < 0.7) { do { sl = randInt(L); } while (sl === this.lastStarLane); }
    else sl = randInt(L);
    this.lastStarLane = sl;
    this.objs.push({ type: 'star', lane: sl, d, t0: this.elapsed, needsChange: sl !== this.lane, rt: null, done: false });
    this.stats.starsTotal++;
    if (Math.random() < this.cfg.cone) {
      let cl;
      do { cl = randInt(L); } while (cl === sl);
      this.objs.push({ type: 'cone', lane: cl, d, done: false, hit: false, ox: 0, vx: 0, rot: 0 });
    }
  }

  spawnDecor(d) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const r = Math.random();
    const kind = r < 0.55 ? 'tree' : r < 0.85 ? 'bush' : 'flower';
    const size = (kind === 'tree' ? rand(26, 40) : kind === 'bush' ? rand(12, 18) : rand(5, 8)) * this.u * 1.6;
    const off = rand(8, 60) * this.u + size * 0.6;
    this.decor.push({ kind, side, off, size, d, hue: randInt(4) });
    if (this.rain && Math.random() < 0.35) {
      this.decor.push({ kind: 'puddle', d: d + rand(0, 60) * this.u, fx: rand(0.08, 0.92), size: rand(18, 34) * this.u * 1.4 });
    }
    this.nextDecor = d + rand(70, 150) * this.u;
  }

  initRain() {
    if (!this.rain) { this.drops = []; return; }
    const n = Math.min(140, Math.round((this.W * this.H) / 7000));
    this.drops = Array.from({ length: n }, () => ({ x: rand(0, this.W), y: rand(0, this.H), v: rand(0.8, 1.2) }));
  }

  // ---------- simulación ----------
  update(dt) {
    this.t += dt;
    if (this.paused) return;
    this.elapsed += dt;
    const u = this.u;
    const speed = this.cfg.speed * u * this.speedMul * (this.slow > 0 ? 0.55 : 1);
    this.slow = Math.max(0, this.slow - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.dist += speed * dt;

    const ahead = this.dist + this.ahead;
    while (this.nextSpawn < ahead) {
      this.spawnRow(this.nextSpawn);
      this.nextSpawn += this.cfg.gap * u * rand(0.85, 1.15);
    }
    while (this.nextDecor < ahead) this.spawnDecor(this.nextDecor);

    // vehículo
    const prev = this.carX;
    const tx = this.laneX(this.lane, this.dist);
    this.carX += (tx - this.carX) * (1 - Math.exp(-dt * 7));
    const slope = (this.cx(this.dist + 6) - this.cx(this.dist - 6)) / 12;
    const lateral = dt > 0 ? (this.carX - prev) / dt : 0;
    const sway = clamp(lateral / (this.laneW * 5), -0.3, 0.3);
    this.sway += (sway - this.sway) * Math.min(1, dt * 10);
    this.tilt += (Math.atan(slope) + sway - this.tilt) * Math.min(1, dt * 10);

    // objetos y colisiones
    const reach = this.carSize * 0.5;
    for (const o of this.objs) {
      if (o.hit) { o.ox += o.vx * dt; o.rot += dt * 9; }
      if (o.done) continue;
      const dy = o.d - this.dist;
      if (o.type === 'star' && o.needsChange && o.rt == null && this.lane === o.lane) o.rt = this.elapsed - o.t0;
      if (Math.abs(dy) < reach) {
        const ox = this.laneX(o.lane, o.d);
        if (Math.abs(ox - this.carX) < this.laneW * 0.45) {
          o.done = true;
          const p = this.screenPos(o);
          if (o.type === 'star') {
            this.stats.stars++;
            if (o.rt != null) this.stats.rts.push(o.rt);
            this.burst(p.x, p.y);
            this.sound.star();
            if (this.stats.stars % STARS_PER_SPEEDUP === 0) this.speedUp();
          } else {
            o.hit = true;
            o.vx = (ox >= this.carX ? 1 : -1) * 320 * u;
            this.stats.conesHit++;
            this.shake = 0.4;
            this.slow = 0.7;
            this.sound.bump();
          }
        }
      } else if (dy < -reach * 1.2) {
        o.done = true;
        if (o.type === 'star') this.stats.missed++; else this.stats.conesAvoided++;
      }
    }
    const gone = this.dist - (this.H - this.carY) - 120 * u;
    this.objs = this.objs.filter(o => o.d > gone);
    this.decor = this.decor.filter(o => o.d > gone - 60 * u);

    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * u * dt; p.life -= dt; }
    this.parts = this.parts.filter(p => p.life > 0);

    for (const r of this.drops) {
      r.y += 900 * u * r.v * dt;
      r.x -= 120 * u * r.v * dt;
      if (r.y > this.H) { r.y = -20; r.x = rand(0, this.W + 100); }
      if (r.x < -20) r.x = this.W + 10;
    }
    for (const c of this.clouds) { c.x += c.v * dt; if (c.x > 1.3) c.x = -0.3; if (c.x < -0.3) c.x = 1.3; }
  }

  /** Posición en pantalla de un objeto, según la vista. */
  screenPos(o) {
    if (this.view === 'back') {
      const frac = this.laneFrac(o.lane) + (o.ox || 0) / this.roadW;
      const p = this.proj(o.d - this.dist, frac);
      return { x: p.x, y: p.y - (this.RW / this.lanes) * 0.2 * p.s, s: p.s };
    }
    return { x: this.laneX(o.lane, o.d) + (o.ox || 0), y: this.sy(o.d), s: 1 };
  }

  burst(x, y) {
    const u = this.u;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const sp = rand(90, 170) * u;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.7, max: 0.7, r: rand(3, 6) * u * 1.4, kind: 'dot' });
    }
    this.parts.push({ x, y: y - 10 * u, vx: 0, vy: -70 * u, life: 0.9, max: 0.9, r: 0, kind: 'plus' });
  }

  // ---------- dibujo ----------
  draw() {
    if (this.view === 'back') this.drawBack(); else this.drawTop();
    this.drawParticles();
    this.drawRain();
  }

  drawTop() {
    const { ctx, W, H, u } = this;
    const rain = this.rain;

    // pasto con franjas que dan sensación de avance
    ctx.fillStyle = rain ? '#4e7a4a' : '#78c159';
    ctx.fillRect(0, 0, W, H);
    const band = 70 * u;
    ctx.fillStyle = rain ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)';
    const off = this.dist % (band * 2);
    for (let y = off - band * 2; y < H; y += band * 2) ctx.fillRect(0, y, W, band);

    // pista
    const step = 12;
    const L = [], R = [];
    for (let y = -step; y <= H + step; y += step) {
      const c = this.cx(this.dist + this.carY - y);
      L.push([c - this.roadW / 2, y]);
      R.push([c + this.roadW / 2, y]);
    }
    const poly = (grow, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      L.forEach(([x, y], i) => (i ? ctx.lineTo(x - grow, y) : ctx.moveTo(x - grow, y)));
      for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0] + grow, R[i][1]);
      ctx.closePath();
      ctx.fill();
    };
    poly(7 * u * 1.4, rain ? '#b9bec4' : '#e9e4d8');
    poly(0, rain ? '#454b53' : '#5f656e');

    // bordes blancos
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = Math.max(2, 4 * u * 1.4);
    for (const [pts, sgn] of [[L, 1], [R, -1]]) {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + sgn * 8 * u, y) : ctx.moveTo(x + sgn * 8 * u, y)));
      ctx.stroke();
    }

    // líneas de carril discontinuas
    const P = 70 * u, dash = 34 * u;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(2, 5 * u);
    ctx.lineCap = 'round';
    const dTop = this.dist + this.carY + 20;
    const dBot = this.dist + this.carY - H - 20;
    for (let i = 1; i < this.lanes; i++) {
      ctx.beginPath();
      for (let d = Math.floor(dBot / P) * P; d < dTop; d += P) {
        const x1 = this.cx(d) - this.roadW / 2 + this.laneW * i;
        const x2 = this.cx(d + dash) - this.roadW / 2 + this.laneW * i;
        ctx.moveTo(x1, this.sy(d));
        ctx.lineTo(x2, this.sy(d + dash));
      }
      ctx.stroke();
    }

    // charcos, árboles, arbustos y flores
    for (const o of this.decor) {
      const y = this.sy(o.d);
      if (y < -80 || y > H + 80) continue;
      if (o.kind === 'puddle') {
        const x = this.cx(o.d) - this.roadW / 2 + this.roadW * o.fx;
        ctx.fillStyle = 'rgba(150,180,210,0.35)';
        ctx.beginPath(); ctx.ellipse(x, y, o.size, o.size * 0.45, 0, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      const edge = this.cx(o.d) + o.side * (this.roadW / 2 + 10 * u);
      this.drawDecorTop(o, edge + o.side * o.off, y);
    }

    // estrellas y conos
    for (const o of this.objs) {
      if (o.done && !o.hit) continue;
      const y = this.sy(o.d);
      if (y < -60 || y > H + 60) continue;
      const x = this.laneX(o.lane, o.d) + (o.ox || 0);
      if (o.type === 'star') this.drawStar(x, y, Math.min(this.laneW * 0.22, 34 * u * 1.4));
      else this.drawConeTop(x, y, Math.min(this.laneW * 0.16, 24 * u * 1.4), o.rot);
    }

    // vehículo
    const shakeX = this.shake > 0 ? Math.sin(this.t * 50) * 5 * u * (this.shake / 0.4) : 0;
    drawVehicle(ctx, this.s.vehicle, this.s.color, this.carX + shakeX, this.carY, this.carSize, this.tilt);

    // sol
    if (!rain) {
      const sx = W * 0.88, sy = Math.max(H * 0.1, 90), R0 = Math.min(W, H) * 0.55;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R0);
      g.addColorStop(0, 'rgba(255,244,180,0.55)');
      g.addColorStop(1, 'rgba(255,244,180,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      this.drawSun(sx, sy, Math.min(W, H) * 0.05);
    }
  }

  drawBack() {
    const { ctx, W, H, u, hy } = this;
    const rain = this.rain;
    const lanes = this.lanes;

    // cielo
    const sky = ctx.createLinearGradient(0, 0, 0, hy);
    if (rain) { sky.addColorStop(0, '#6f7c8c'); sky.addColorStop(1, '#aab4bf'); }
    else { sky.addColorStop(0, '#5fb3ff'); sky.addColorStop(1, '#cdeaff'); }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, hy + 1);

    // sol y nubes
    if (!rain) {
      const sx = W * 0.8, sy = hy * 0.42, sr = Math.min(W, H) * 0.055;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 5);
      g.addColorStop(0, 'rgba(255,248,200,0.8)');
      g.addColorStop(1, 'rgba(255,248,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, hy);
      this.drawSun(sx, sy, sr);
    }
    for (const c of this.clouds) {
      const x = c.x * W, y = c.y * hy * 0.75, r = Math.min(W, H) * 0.05 * c.s;
      ctx.fillStyle = rain ? 'rgba(90,100,115,0.75)' : 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.6, r * 0.7, 0, 0, Math.PI * 2);
      ctx.ellipse(x - r * 0.9, y + r * 0.15, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.ellipse(x + r * 1.0, y + r * 0.1, r * 1.1, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // cerros en el horizonte (se desplazan un poco con las curvas)
    const shift = (this.cx(this.dist + this.ahead) - this.cx(this.dist)) * 0.8;
    for (const [amp, base, col, f, ph] of [
      [0.09, 0.0, rain ? '#7c8f86' : '#9fd39a', 0.006, 1.0],
      [0.05, 0.0, rain ? '#5f7a63' : '#6fbf6a', 0.011, 2.3],
    ]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, hy + 1);
      for (let x = 0; x <= W; x += 8) {
        const y = hy - base - hy * amp * (0.6 + 0.4 * Math.sin((x - shift) * f + ph));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, hy + 1);
      ctx.closePath();
      ctx.fill();
    }

    // pasto
    ctx.fillStyle = rain ? '#4e7a4a' : '#78c159';
    ctx.fillRect(0, hy, W, H - hy);

    // límites de dibujo en profundidad
    const dyMin = -0.5 / this.zs;          // z = 0,5 (detrás de la cámara visible)
    const dyMax = 12 / this.zs;            // z ≈ 13 (la neblina cubre el resto)

    // franjas de pasto (por bandas del mundo: sin parpadeos)
    const band = 70 * u;
    ctx.fillStyle = rain ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)';
    const b0 = Math.floor((this.dist + dyMin) / band);
    const b1 = Math.ceil((this.dist + dyMax) / band);
    for (let b = b0; b <= b1; b++) {
      if (b % 2) continue;
      const d0 = Math.max(dyMin, b * band - this.dist), d1 = Math.min(dyMax, (b + 1) * band - this.dist);
      if (d1 <= d0) continue;
      const y1 = this.proj(d0, 0).y, y0 = this.proj(d1, 0).y;
      if (y1 - y0 < 0.6) continue;
      ctx.fillRect(0, y0, W, y1 - y0);
    }

    // pista: bordes muestreados en profundidad
    const N = 70;
    const samples = [];
    for (let i = 0; i <= N; i++) {
      // muestreo uniforme en pantalla (s), del horizonte hacia abajo
      const s = 1 / 13 + (2 - 1 / 13) * (i / N);
      samples.push((1 / s - 1) / this.zs);
    }
    const edge = (grow) => {
      const left = [], right = [];
      for (const dy of samples) {
        const pl = this.proj(dy, -0.5 - grow), pr = this.proj(dy, 0.5 + grow);
        left.push(pl); right.push(pr);
      }
      return [left, right];
    };
    const fillEdges = ([left, right], color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      left.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
      ctx.closePath();
      ctx.fill();
    };
    fillEdges(edge(0.035), rain ? '#b9bec4' : '#e9e4d8');
    fillEdges(edge(0), rain ? '#454b53' : '#5f656e');

    // bordes rojos y blancos (por bandas del mundo)
    const rb = 40 * u;
    const r0 = Math.floor((this.dist + dyMin) / rb), r1 = Math.ceil((this.dist + dyMax * 0.5) / rb);
    for (let b = r0; b <= r1; b++) {
      const d0 = Math.max(dyMin, b * rb - this.dist), d1 = Math.min(dyMax, (b + 1) * rb - this.dist);
      if (d1 <= d0) continue;
      ctx.fillStyle = b % 2 ? '#ffffff' : '#e03131';
      for (const side of [-1, 1]) {
        const a0 = this.proj(d0, side * 0.5), a1 = this.proj(d1, side * 0.5);
        const c0 = this.proj(d0, side * 0.535), c1 = this.proj(d1, side * 0.535);
        if (a0.y - a1.y < 0.6) continue;
        ctx.beginPath();
        ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.lineTo(c1.x, c1.y); ctx.lineTo(c0.x, c0.y);
        ctx.closePath(); ctx.fill();
      }
    }

    // líneas de carril
    const P = 70 * u, dash = 34 * u, lw = 0.012;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    for (let i = 1; i < lanes; i++) {
      const f = -0.5 + i / lanes;
      for (let d = Math.floor((this.dist + dyMin) / P) * P; d < this.dist + dyMax * 0.6; d += P) {
        const d0 = Math.max(dyMin, d - this.dist), d1 = d + dash - this.dist;
        if (d1 <= d0) continue;
        const a = this.proj(d0, f - lw), b = this.proj(d0, f + lw), c = this.proj(d1, f + lw), e = this.proj(d1, f - lw);
        if (a.y - c.y < 0.6) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(e.x, e.y);
        ctx.closePath(); ctx.fill();
      }
    }

    // charcos
    for (const o of this.decor) {
      if (o.kind !== 'puddle') continue;
      const dy = o.d - this.dist;
      if (dy < dyMin || dy > this.ahead) continue;
      const p = this.proj(dy, o.fx - 0.5);
      const rx = (o.size / this.roadW) * this.RW * p.s;
      ctx.fillStyle = 'rgba(150,180,210,0.35)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, rx * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    }

    // neblina suave cerca del horizonte (oculta detalles lejanos)
    const fogH = (this.yCar - hy) * 0.28;
    const fog = ctx.createLinearGradient(0, hy, 0, hy + fogH);
    const fc = rain ? '170,180,191' : '205,234,255';
    fog.addColorStop(0, `rgba(${fc},0.85)`);
    fog.addColorStop(1, `rgba(${fc},0)`);
    ctx.fillStyle = fog;
    ctx.fillRect(0, hy, W, fogH);

    // objetos en profundidad: de lejos hacia cerca (el vehículo también)
    const sprites = [];
    for (const o of this.decor) if (o.kind !== 'puddle') sprites.push({ dy: o.d - this.dist, o, k: 'decor' });
    for (const o of this.objs) if (!o.done || o.hit) sprites.push({ dy: o.d - this.dist, o, k: 'obj' });
    sprites.push({ dy: 0.001, k: 'car' });
    sprites.sort((a, b) => b.dy - a.dy);

    const laneScreen = this.RW / lanes;
    for (const sp of sprites) {
      if (sp.k === 'car') { this.drawCarBack(); continue; }
      if (sp.dy < dyMin || sp.dy > this.ahead + 1) continue;
      const o = sp.o;
      if (sp.k === 'decor') {
        const frac = o.side * (0.5 + (10 * u + o.off) / this.roadW);
        const p = this.proj(sp.dy, frac);
        if (p.x < -200 || p.x > W + 200) continue;
        this.drawDecorBack(o, p.x, p.y, (o.size / this.roadW) * this.RW * p.s);
        continue;
      }
      const frac = this.laneFrac(o.lane) + (o.ox || 0) / this.roadW;
      const p = this.proj(sp.dy, frac);
      ctx.globalAlpha = clamp((8.2 - p.z) / 1.5, 0, 1); // aparecen suavemente a lo lejos
      if (o.type === 'star') {
        const r = laneScreen * 0.2 * p.s;
        this.drawStar(p.x, p.y - r * 1.3, r);
      } else {
        this.drawConeSide(p.x, p.y, laneScreen * 0.22 * p.s, o.rot);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawCarBack() {
    const frac = (this.carX - this.cx(this.dist)) / this.roadW;
    const p = this.proj(0, frac);
    const shakeX = this.shake > 0 ? Math.sin(this.t * 50) * 5 * this.u * (this.shake / 0.4) : 0;
    drawVehicleRear(this.ctx, this.s.vehicle, this.s.color, p.x + shakeX, p.y, this.rearW, this.sway * 0.35);
  }

  drawParticles() {
    const { ctx, u } = this;
    for (const p of this.parts) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      if (p.kind === 'plus') {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 3;
        ctx.font = `800 ${Math.round(34 * u * 1.3)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.strokeText('+1', p.x, p.y);
        ctx.fillText('+1', p.x, p.y);
      } else {
        ctx.fillStyle = '#ffe066';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawRain() {
    if (!this.rain) return;
    const { ctx, W, H, u } = this;
    ctx.fillStyle = 'rgba(30,50,80,0.16)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(215,228,255,0.5)';
    ctx.lineWidth = Math.max(1, 1.6 * u * 1.4);
    ctx.beginPath();
    for (const r of this.drops) {
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x + 5 * u, r.y - 22 * u);
    }
    ctx.stroke();
  }

  drawSun(sx, sy, sr) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,214,60,0.8)';
    ctx.lineWidth = Math.max(2, sr * 0.15);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.moveTo(sx + Math.cos(a) * sr * 1.35, sy + Math.sin(a) * sr * 1.35);
      ctx.lineTo(sx + Math.cos(a) * sr * 1.8, sy + Math.sin(a) * sr * 1.8);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffd93b';
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
  }

  drawStar(x, y, r) {
    const ctx = this.ctx;
    if (r < 0.5) return;
    const s = r * (1 + 0.06 * Math.sin(this.t * 4));
    ctx.fillStyle = 'rgba(255,236,150,0.35)';
    ctx.beginPath(); ctx.arc(x, y, s * 1.45, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? s * 0.45 : s;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffd43b';
    ctx.fill();
    ctx.strokeStyle = '#e67700';
    ctx.lineWidth = Math.max(1, s * 0.1);
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  drawConeTop(x, y, r, rot = 0) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    roundRect(ctx, -r * 1.1 + r * 0.2, -r * 1.1 + r * 0.25, r * 2.2, r * 2.2, r * 0.35); ctx.fill();
    ctx.fillStyle = '#ff7a1a';
    roundRect(ctx, -r * 1.1, -r * 1.1, r * 2.2, r * 2.2, r * 0.35); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /** Cono visto de lado: (x, y) = base; w = ancho de la base. */
  drawConeSide(x, y, w, rot = 0) {
    const ctx = this.ctx;
    if (w < 0.8) return;
    const h = w * 1.25;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot * 0.3);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.65, w * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8590c';
    roundRect(ctx, -w * 0.6, -w * 0.12, w * 1.2, w * 0.12, w * 0.04); ctx.fill();
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.moveTo(-w * 0.45, -w * 0.1); ctx.lineTo(-w * 0.1, -h); ctx.lineTo(w * 0.1, -h); ctx.lineTo(w * 0.45, -w * 0.1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const y0 = -h * 0.42, y1 = -h * 0.62;
    const xAt = yy => w * 0.45 - ((w * 0.35) * (-yy - w * 0.1)) / (h - w * 0.1);
    ctx.moveTo(-xAt(y0), y0); ctx.lineTo(-xAt(y1), y1); ctx.lineTo(xAt(y1), y1); ctx.lineTo(xAt(y0), y0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  drawDecorTop(o, x, y) {
    const ctx = this.ctx;
    const rain = this.rain;
    if (o.kind === 'tree') {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath(); ctx.arc(x + o.size * 0.18, y + o.size * 0.22, o.size, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rain ? '#2c5a2f' : '#2f8a3a';
      ctx.beginPath(); ctx.arc(x, y, o.size, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rain ? '#3b7040' : '#45a84f';
      ctx.beginPath(); ctx.arc(x - o.size * 0.25, y - o.size * 0.25, o.size * 0.6, 0, Math.PI * 2); ctx.fill();
    } else if (o.kind === 'bush') {
      ctx.fillStyle = rain ? '#3a6b3c' : '#4fae4c';
      for (const [dx, dy] of [[-0.6, 0], [0.6, 0], [0, -0.5]]) {
        ctx.beginPath(); ctx.arc(x + dx * o.size, y + dy * o.size, o.size * 0.8, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      const cols = ['#ff6b9d', '#ffd43b', '#ffffff', '#b197fc'];
      ctx.fillStyle = cols[o.hue % cols.length];
      ctx.beginPath(); ctx.arc(x, y, o.size, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f59f00';
      ctx.beginPath(); ctx.arc(x, y, o.size * 0.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** Árboles y arbustos vistos de lado. (x, y) = base; r = tamaño en pantalla. */
  drawDecorBack(o, x, y, r) {
    const ctx = this.ctx;
    const rain = this.rain;
    if (r < 0.6) return;
    if (o.kind === 'tree') {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.9, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a5230';
      ctx.fillRect(x - r * 0.14, y - r * 1.2, r * 0.28, r * 1.2);
      ctx.fillStyle = rain ? '#2c5a2f' : '#2f8a3a';
      ctx.beginPath(); ctx.arc(x, y - r * 1.8, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rain ? '#3b7040' : '#45a84f';
      ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 2.05, r * 0.55, 0, Math.PI * 2); ctx.fill();
    } else if (o.kind === 'bush') {
      ctx.fillStyle = rain ? '#3a6b3c' : '#4fae4c';
      for (const [dx, dy, rr] of [[-0.6, -0.5, 0.7], [0.6, -0.5, 0.7], [0, -0.9, 0.8]]) {
        ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, r * rr, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      const cols = ['#ff6b9d', '#ffd43b', '#ffffff', '#b197fc'];
      ctx.strokeStyle = '#3c8d3f';
      ctx.lineWidth = Math.max(1, r * 0.25);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - r * 2.2); ctx.stroke();
      ctx.fillStyle = cols[o.hue % cols.length];
      ctx.beginPath(); ctx.arc(x, y - r * 2.4, r, 0, Math.PI * 2); ctx.fill();
    }
  }
}
