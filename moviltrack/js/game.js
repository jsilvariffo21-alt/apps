// Juego de carreras visto desde arriba. Sin "game over": se recogen estrellas
// y los conos solo hacen un rebote suave.
import { drawVehicle, roundRect } from './vehicles.js';

// speed y gap están en unidades de 800 px de alto (se escalan a la pantalla),
// así el tiempo de reacción es el mismo en vertical u horizontal.
export const LEVELS = {
  1: { speed: 140, curve: 0,    gap: 560, cone: 0 },
  2: { speed: 175, curve: 0,    gap: 500, cone: 0.3 },
  3: { speed: 210, curve: 0.06, gap: 460, cone: 0.4 },
  4: { speed: 250, curve: 0.09, gap: 420, cone: 0.5 },
  5: { speed: 290, curve: 0.12, gap: 380, cone: 0.6 },
};

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = n => Math.floor(Math.random() * n);

export class Game {
  constructor(canvas, { settings, sound }) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.s = settings;
    this.sound = sound;
    this.cfg = LEVELS[settings.level] || LEVELS[1];
    this.lanes = settings.lanes === 2 ? 2 : 3;
    this.rain = settings.weather === 'rain';
    this.t = 0;
    this.paused = true;
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
    if (this.carX != null) this.carX = this.laneX(this.lane, this.dist);
    this.initRain();
  }

  reset() {
    this.dist = 0;
    this.elapsed = 0;
    this.lane = this.lanes === 3 ? 1 : 0;
    this.carX = this.laneX(this.lane, 0);
    this.tilt = 0;
    this.objs = [];
    this.decor = [];
    this.parts = [];
    this.nextSpawn = this.carY + this.H * 0.5;
    this.nextDecor = -this.H;
    this.lastStarLane = this.lane;
    this.shake = 0;
    this.slow = 0;
    this.stats = { stars: 0, starsTotal: 0, missed: 0, conesHit: 0, conesAvoided: 0, laneChanges: 0, rts: [] };
    const ahead = this.dist + this.carY + 80 * this.u;
    while (this.nextDecor < ahead) this.spawnDecor(this.nextDecor);
  }

  // ---------- geometría de la pista ----------
  cx(d) {
    if (!this.amp) return this.W / 2;
    const ramp = Math.max(0, Math.min(1, (d - this.H) / (this.H * 2)));
    return this.W / 2 + this.amp * ramp * (0.7 * Math.sin(d * this.k) + 0.3 * Math.sin(d * this.k * 2.3 + 1.3));
  }
  laneX(lane, d) { return this.cx(d) - this.roadW / 2 + this.laneW * (lane + 0.5); }
  sy(d) { return this.carY - (d - this.dist); }

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
    const speed = this.cfg.speed * u * (this.slow > 0 ? 0.55 : 1);
    this.slow = Math.max(0, this.slow - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.dist += speed * dt;

    const ahead = this.dist + this.carY + 80 * u;
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
    const target = Math.atan(slope) + Math.max(-0.3, Math.min(0.3, lateral / (this.laneW * 5)));
    this.tilt += (target - this.tilt) * Math.min(1, dt * 10);

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
          if (o.type === 'star') {
            this.stats.stars++;
            if (o.rt != null) this.stats.rts.push(o.rt);
            this.burst(ox, this.sy(o.d));
            this.sound.star();
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
      const x = edge + o.side * o.off;
      this.drawDecor(o, x, y);
    }

    // estrellas y conos
    for (const o of this.objs) {
      if (o.done && !o.hit) continue;
      const y = this.sy(o.d);
      if (y < -60 || y > H + 60) continue;
      const x = this.laneX(o.lane, o.d) + (o.ox || 0);
      if (o.type === 'star') this.drawStar(x, y, Math.min(this.laneW * 0.22, 34 * u * 1.4));
      else this.drawCone(x, y, Math.min(this.laneW * 0.16, 24 * u * 1.4), o.rot);
    }

    // vehículo
    const shakeX = this.shake > 0 ? Math.sin(this.t * 50) * 5 * u * (this.shake / 0.4) : 0;
    drawVehicle(ctx, this.s.vehicle, this.s.color, this.carX + shakeX, this.carY, this.carSize, this.tilt);

    // partículas
    for (const p of this.parts) {
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'plus') {
        ctx.globalAlpha = a;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 3;
        ctx.font = `800 ${Math.round(34 * u * 1.3)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.strokeText('+1', p.x, p.y);
        ctx.fillText('+1', p.x, p.y);
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffe066';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // clima
    if (rain) {
      ctx.fillStyle = 'rgba(30,50,80,0.18)';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(215,228,255,0.5)';
      ctx.lineWidth = Math.max(1, 1.6 * u * 1.4);
      ctx.beginPath();
      for (const r of this.drops) {
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x + 5 * u, r.y - 22 * u);
      }
      ctx.stroke();
    } else {
      const sx = W * 0.88, sy = Math.max(H * 0.1, 90), R0 = Math.min(W, H) * 0.55;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R0);
      g.addColorStop(0, 'rgba(255,244,180,0.55)');
      g.addColorStop(1, 'rgba(255,244,180,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const sr = Math.min(W, H) * 0.05;
      ctx.strokeStyle = 'rgba(255,214,60,0.8)';
      ctx.lineWidth = Math.max(2, sr * 0.15);
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
  }

  drawStar(x, y, r) {
    const ctx = this.ctx;
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
    ctx.lineWidth = Math.max(1.5, s * 0.1);
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  drawCone(x, y, r, rot = 0) {
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

  drawDecor(o, x, y) {
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
}
