// Dibujo de vehículos vistos desde arriba (frente hacia arriba). Un solo color.
export const COLORS = {
  blue:  { name: 'Azul',   body: '#1f6fe0', dark: '#134a9e', outline: '#0b2f66' },
  red:   { name: 'Rojo',   body: '#e03131', dark: '#a11d1d', outline: '#5e1010' },
  green: { name: 'Verde',  body: '#2f9e44', dark: '#1e6b2e', outline: '#0f3d19' },
  white: { name: 'Blanco', body: '#f7f7f7', dark: '#cfd4db', outline: '#4b525e' },
  black: { name: 'Negro',  body: '#202226', dark: '#0b0c0e', outline: '#d4d8de' },
};

export const VEHICLES = { car: 'Auto', moto: 'Moto' };

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
}

/** size = largo total del vehículo en px; tilt = giro en radianes. */
export function drawVehicle(ctx, type, colorKey, x, y, size, tilt = 0) {
  const c = COLORS[colorKey] || COLORS.blue;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  if (type === 'moto') drawMoto(ctx, c, size); else drawCar(ctx, c, size);
  ctx.restore();
}

function drawCar(ctx, c, s) {
  const w = s * 0.56, h = s;
  const lw = Math.max(1.5, s * 0.025);

  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, -w / 2 + s * 0.05, -h / 2 + s * 0.07, w, h, s * 0.16);
  ctx.fill();

  // ruedas
  ctx.fillStyle = '#111';
  const ww = s * 0.11, wh = s * 0.2;
  for (const [sx, sy] of [[-1, -0.3], [1, -0.3], [-1, 0.3], [1, 0.3]]) {
    roundRect(ctx, sx * (w / 2) - ww / 2, sy * h - wh / 2, ww, wh, ww * 0.4);
    ctx.fill();
  }

  // carrocería
  ctx.fillStyle = c.body;
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = lw;
  roundRect(ctx, -w / 2, -h / 2, w, h, s * 0.17);
  ctx.fill();
  ctx.stroke();

  // brillo del capó
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, -w * 0.3, -h * 0.44, w * 0.6, h * 0.14, s * 0.05);
  ctx.fill();

  // parabrisas
  ctx.fillStyle = '#9fd3ff';
  roundRect(ctx, -w * 0.38, -h * 0.24, w * 0.76, h * 0.17, s * 0.05);
  ctx.fill();

  // techo
  ctx.fillStyle = c.dark;
  roundRect(ctx, -w * 0.37, -h * 0.06, w * 0.74, h * 0.28, s * 0.06);
  ctx.fill();

  // luneta trasera
  ctx.fillStyle = '#7fb8e6';
  roundRect(ctx, -w * 0.33, h * 0.25, w * 0.66, h * 0.1, s * 0.04);
  ctx.fill();

  // focos delanteros
  ctx.fillStyle = '#fff3a3';
  ellipse(ctx, -w * 0.3, -h * 0.47, w * 0.12, h * 0.025); ctx.fill();
  ellipse(ctx, w * 0.3, -h * 0.47, w * 0.12, h * 0.025); ctx.fill();

  // luces traseras
  ctx.fillStyle = '#ff4d4d';
  ellipse(ctx, -w * 0.32, h * 0.475, w * 0.1, h * 0.02); ctx.fill();
  ellipse(ctx, w * 0.32, h * 0.475, w * 0.1, h * 0.02); ctx.fill();
}

function drawMoto(ctx, c, s) {
  const w = s * 0.28;
  const lw = Math.max(1.5, s * 0.025);

  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ellipse(ctx, s * 0.05, s * 0.07, w * 0.75, s * 0.5);
  ctx.fill();

  // ruedas
  ctx.fillStyle = '#111';
  roundRect(ctx, -w * 0.22, -s * 0.5, w * 0.44, s * 0.27, w * 0.2); ctx.fill();
  roundRect(ctx, -w * 0.24, s * 0.22, w * 0.48, s * 0.28, w * 0.2); ctx.fill();

  // cuerpo / estanque
  ctx.fillStyle = c.body;
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = lw;
  roundRect(ctx, -w / 2, -s * 0.3, w, s * 0.58, w * 0.45);
  ctx.fill();
  ctx.stroke();

  // manubrio
  ctx.strokeStyle = '#333';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, s * 0.04);
  ctx.beginPath();
  ctx.moveTo(-s * 0.24, -s * 0.27);
  ctx.lineTo(s * 0.24, -s * 0.27);
  ctx.stroke();

  // hombros del piloto
  ctx.fillStyle = c.dark;
  ellipse(ctx, 0, s * 0.02, s * 0.2, s * 0.1);
  ctx.fill();

  // casco
  ctx.fillStyle = c.body;
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = lw;
  ellipse(ctx, 0, -s * 0.07, s * 0.115, s * 0.125);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1c2533';
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.11, s * 0.085, s * 0.06, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  // foco
  ctx.fillStyle = '#fff3a3';
  ellipse(ctx, 0, -s * 0.49, w * 0.14, s * 0.02);
  ctx.fill();
}

// ---------- Vista desde atrás ----------
/** (x, y) = centro inferior (donde toca la pista); w = ancho del auto en px. */
export function drawVehicleRear(ctx, type, colorKey, x, y, w, tilt = 0) {
  const c = COLORS[colorKey] || COLORS.blue;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  if (type === 'moto') drawMotoRear(ctx, c, w); else drawCarRear(ctx, c, w);
  ctx.restore();
}

function drawCarRear(ctx, c, w) {
  const h = w * 0.62;
  const lw = Math.max(1.5, w * 0.018);
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ellipse(ctx, 0, -w * 0.01, w * 0.58, w * 0.07); ctx.fill();
  // ruedas
  ctx.fillStyle = '#111';
  roundRect(ctx, -w * 0.47, -h * 0.3, w * 0.17, h * 0.3, w * 0.03); ctx.fill();
  roundRect(ctx, w * 0.3, -h * 0.3, w * 0.17, h * 0.3, w * 0.03); ctx.fill();
  // cabina (más angosta arriba)
  ctx.fillStyle = c.dark;
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(-w * 0.4, -h * 0.66);
  ctx.lineTo(-w * 0.31, -h * 0.98);
  ctx.quadraticCurveTo(0, -h * 1.04, w * 0.31, -h * 0.98);
  ctx.lineTo(w * 0.4, -h * 0.66);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // luneta
  ctx.fillStyle = '#8cc4ef';
  ctx.beginPath();
  ctx.moveTo(-w * 0.33, -h * 0.7);
  ctx.lineTo(-w * 0.26, -h * 0.93);
  ctx.quadraticCurveTo(0, -h * 0.97, w * 0.26, -h * 0.93);
  ctx.lineTo(w * 0.33, -h * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.moveTo(-w * 0.2, -h * 0.72); ctx.lineTo(-w * 0.12, -h * 0.9); ctx.lineTo(-w * 0.04, -h * 0.9); ctx.lineTo(-w * 0.12, -h * 0.72);
  ctx.closePath(); ctx.fill();
  // carrocería
  ctx.fillStyle = c.body;
  ctx.strokeStyle = c.outline;
  roundRect(ctx, -w / 2, -h * 0.7, w, h * 0.56, w * 0.08);
  ctx.fill(); ctx.stroke();
  // luces traseras
  ctx.fillStyle = '#ff3b3b';
  roundRect(ctx, -w * 0.45, -h * 0.6, w * 0.17, h * 0.12, w * 0.025); ctx.fill();
  roundRect(ctx, w * 0.28, -h * 0.6, w * 0.17, h * 0.12, w * 0.025); ctx.fill();
  // patente
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#333';
  ctx.lineWidth = Math.max(1, w * 0.008);
  roundRect(ctx, -w * 0.11, -h * 0.42, w * 0.22, h * 0.13, w * 0.015); ctx.fill(); ctx.stroke();
  // parachoques
  ctx.fillStyle = '#2b2e33';
  roundRect(ctx, -w * 0.48, -h * 0.2, w * 0.96, h * 0.1, w * 0.03); ctx.fill();
}

function drawMotoRear(ctx, c, w) {
  const s = w; // ancho de referencia (el de un auto); la moto es más angosta
  const lw = Math.max(1.5, s * 0.018);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ellipse(ctx, 0, -s * 0.01, s * 0.2, s * 0.05); ctx.fill();
  // rueda trasera
  ctx.fillStyle = '#111';
  roundRect(ctx, -s * 0.06, -s * 0.24, s * 0.12, s * 0.24, s * 0.04); ctx.fill();
  // guardabarro y asiento
  ctx.fillStyle = c.body;
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = lw;
  roundRect(ctx, -s * 0.1, -s * 0.34, s * 0.2, s * 0.14, s * 0.05); ctx.fill(); ctx.stroke();
  // luz trasera
  ctx.fillStyle = '#ff3b3b';
  roundRect(ctx, -s * 0.05, -s * 0.31, s * 0.1, s * 0.035, s * 0.015); ctx.fill();
  // manubrio
  ctx.strokeStyle = '#333';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, s * 0.025);
  ctx.beginPath(); ctx.moveTo(-s * 0.22, -s * 0.5); ctx.lineTo(s * 0.22, -s * 0.5); ctx.stroke();
  // piloto (espalda)
  ctx.fillStyle = c.dark;
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(-s * 0.13, -s * 0.34);
  ctx.lineTo(-s * 0.17, -s * 0.6);
  ctx.quadraticCurveTo(0, -s * 0.7, s * 0.17, -s * 0.6);
  ctx.lineTo(s * 0.13, -s * 0.34);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // casco
  ctx.fillStyle = c.body;
  ellipse(ctx, 0, -s * 0.73, s * 0.11, s * 0.11); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ellipse(ctx, -s * 0.04, -s * 0.77, s * 0.035, s * 0.025); ctx.fill();
}
