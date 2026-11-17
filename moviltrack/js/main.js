import { loadSettings, saveSettings, LEVEL_INFO } from './settings.js';
import { GazeTracker, thresholdFor } from './gaze.js';
import { Game } from './game.js';
import { Sound } from './audio.js';
import { addSession, getSessions, clearSessions, toCSV } from './history.js';
import { drawVehicle, COLORS, VEHICLES } from './vehicles.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let settings = loadSettings();
const sound = new Sound();
const gaze = new GazeTracker();
let current = 'screen-home';
let game = null;
let session = null;
let pauseReason = null;
let lastApplied = null;
let lastLongBlinks = 0;
let lastT = performance.now();
let wakeLock = null;
let countdownTimer = null;

// ================= utilidades =================
function show(id) {
  current = id;
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
}

function loading(text) {
  const el = $('#loading');
  if (text) { $('#loading-text').textContent = text; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

let toastTimer = 0;
function toast(msg, ms = 4000) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

function save() {
  saveSettings(settings);
  sound.enabled = settings.sound;
  gaze.configure({
    eye: settings.eye, sensitivity: settings.sensitivity, dwellMs: settings.dwellMs,
    longBlinkMs: settings.longBlinkMs, calibration: settings.calibration,
  });
}

function hasCalibration() {
  return !!(settings.calibration && settings.calibration[settings.eye]);
}

function holdButton(btn, ms, cb) {
  let timer = 0;
  btn.style.setProperty('--hold', ms + 'ms');
  const start = e => {
    e.preventDefault();
    btn.classList.add('holding');
    timer = setTimeout(() => { btn.classList.remove('holding'); cb(); }, ms);
  };
  const cancel = () => { clearTimeout(timer); btn.classList.remove('holding'); };
  btn.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, cancel));
  btn.addEventListener('contextmenu', e => e.preventDefault());
  // Teclado (accesibilidad para el adulto en computador)
  btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cb(); } });
}

async function requestWake() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* opcional */ }
}
function releaseWake() {
  try { if (wakeLock) wakeLock.release(); } catch { /* nada */ }
  wakeLock = null;
}

function cameraErrorMessage(e) {
  if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
    return 'No hay permiso para usar la cámara. En el iPhone: Ajustes › Safari › Cámara › Permitir, y vuelve a intentar.';
  }
  if (e && e.name === 'NotFoundError') return 'No se encontró una cámara en este equipo.';
  if (e && e.name === 'NoCamera') return e.message;
  return 'No se pudo iniciar la cámara o el detector. ' + (e && e.message ? e.message : '');
}

async function ensureCamera() {
  if (gaze.running) return;
  loading('Iniciando cámara…');
  try { await gaze.start(msg => loading(msg)); }
  finally { loading(null); }
  save();
}

function attachPreview(video) {
  if (!gaze.stream) return;
  if (video.srcObject !== gaze.stream) video.srcObject = gaze.stream;
  video.play().catch(() => {});
}

function stopCamera() {
  gaze.stopCamera();
  $('#calib-video').srcObject = null;
  $('#game-video').srcObject = null;
}

// ================= inicio =================
function renderHome() {
  const c = $('#home-preview');
  const size = c.getBoundingClientRect().width || 170;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(size * dpr);
  c.height = Math.round(size * dpr);
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = settings.weather === 'rain' ? '#4e7a4a' : '#78c159';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = settings.weather === 'rain' ? '#454b53' : '#5f656e';
  ctx.fillRect(size * 0.22, 0, size * 0.56, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.setLineDash([12, 12]);
  ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size); ctx.stroke(); ctx.setLineDash([]);
  drawVehicle(ctx, settings.vehicle, settings.color, size / 2, size / 2 + 4, size * 0.62, 0);
  if (settings.weather === 'rain') {
    ctx.fillStyle = 'rgba(30,50,80,0.2)'; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(215,228,255,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < 18; i++) { const x = (i * 37) % size, y = (i * 53) % size; ctx.moveTo(x, y); ctx.lineTo(x + 4, y - 14); }
    ctx.stroke();
  }
  ctx.restore();

  const w = settings.weather === 'rain' ? 'lluvia' : 'sol';
  $('#home-summary').textContent =
    `${VEHICLES[settings.vehicle]} ${COLORS[settings.color].name.toLowerCase()} · Nivel ${settings.level} · ${settings.lanes} carriles · ${w}`;

  const st = $('#calib-status');
  st.classList.remove('ok');
  if (settings.inputMode === 'touch') {
    st.textContent = 'Modo toque: se juega tocando la pantalla.';
    $('#btn-calibrate').classList.add('hidden');
  } else {
    $('#btn-calibrate').classList.remove('hidden');
    if (hasCalibration()) {
      const d = new Date(settings.calibration.ts);
      st.textContent = `✅ Mirada calibrada (${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}). Conviene recalibrar en cada sesión.`;
      st.classList.add('ok');
    } else {
      st.textContent = 'Falta calibrar la mirada antes de jugar.';
    }
  }
}

// ================= ajustes =================
const fmt = {
  sensitivity: v => `${Math.round(v * 100)}%`,
  dwellMs: v => `${(v / 1000).toFixed(2).replace('.', ',')} s`,
  longBlinkMs: v => `${(v / 1000).toFixed(1).replace('.', ',')} s`,
  sessionMinutes: v => `${v} min`,
};

function syncSettingsUI() {
  $$('.seg').forEach(seg => {
    const key = seg.dataset.key;
    $$('button[data-val]', seg).forEach(b => b.setAttribute('aria-pressed', String(String(settings[key]) === b.dataset.val)));
  });
  $$('input[type=range][data-key]').forEach(r => { r.value = settings[r.dataset.key]; });
  $$('output[data-for]').forEach(o => { o.textContent = fmt[o.dataset.for](settings[o.dataset.for]); });
  $$('input[type=checkbox][data-key]').forEach(c => { c.checked = !!settings[c.dataset.key]; });
  $('#level-info').textContent = LEVEL_INFO[settings.level];
  $('.settings').classList.toggle('touch-mode', settings.inputMode === 'touch');
  renderHistory();
}

function bindSettings() {
  $$('.seg').forEach(seg => {
    seg.addEventListener('click', e => {
      const b = e.target.closest('button[data-val]');
      if (!b) return;
      settings[seg.dataset.key] = seg.dataset.type === 'num' ? Number(b.dataset.val) : b.dataset.val;
      save();
      syncSettingsUI();
    });
  });
  $$('input[type=range][data-key]').forEach(r => {
    r.addEventListener('input', () => {
      settings[r.dataset.key] = Number(r.value);
      save();
      $(`output[data-for="${r.dataset.key}"]`).textContent = fmt[r.dataset.key](settings[r.dataset.key]);
    });
  });
  $$('input[type=checkbox][data-key]').forEach(c => {
    c.addEventListener('change', () => { settings[c.dataset.key] = c.checked; save(); });
  });
  $('#btn-settings-done').addEventListener('click', () => { show('screen-home'); renderHome(); });
  $('#btn-export').addEventListener('click', exportCSV);
  $('#btn-clear').addEventListener('click', () => {
    if (confirm('¿Borrar todo el historial de sesiones de este dispositivo?')) { clearSessions(); renderHistory(); }
  });
}

function renderHistory() {
  const rows = getSessions().slice(-12).reverse();
  const el = $('#history-list');
  if (!rows.length) { el.innerHTML = '<p class="hint">Aún no hay sesiones registradas.</p>'; return; }
  const tr = rows.map(r => {
    const d = new Date(r.date);
    return `<tr><td>${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
      <td>N${r.level}</td><td>${r.input === 'gaze' ? '👁️' : '👆'}</td>
      <td>⭐ ${r.stars}/${r.starsTotal}</td><td>${r.avgReactionMs != null ? (r.avgReactionMs / 1000).toFixed(1) + ' s' : '–'}</td>
      <td>${r.facePct != null ? r.facePct + '%' : '–'}</td></tr>`;
  }).join('');
  el.innerHTML = `<div class="scroll"><table><thead><tr><th>Fecha</th><th>Nivel</th><th></th><th>Estrellas</th><th>Reacción</th><th>Rostro</th></tr></thead><tbody>${tr}</tbody></table></div>`;
}

function exportCSV() {
  const rows = getSessions();
  if (!rows.length) { toast('No hay sesiones para exportar.'); return; }
  const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `moviltrack-sesiones-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ================= calibración =================
const CAL_POS = { left: 7, center: 50, right: 93 };
const STEP_MS = 2600;
const SETTLE_MS = 900;
let cal = null;

function setCalibStep(name) {
  $$('.calib-step').forEach(s => s.classList.toggle('active', s.id === 'calib-' + name));
  if (cal) cal.step = name;
}

async function openCalibration(after) {
  sound.unlock();
  cal = { step: 'setup', after };
  show('screen-calib');
  setCalibStep('setup');
  $('#calib-start').disabled = true;
  try {
    await ensureCamera();
  } catch (e) {
    console.error(e);
    toast(cameraErrorMessage(e), 7000);
    show('screen-home');
    renderHome();
    return;
  }
  attachPreview($('#calib-video'));
}

function startTargets(mode, onDone) {
  const blank = () => ({ left: [], center: [], right: [] });
  cal = {
    ...(cal || {}),
    mode, onDone,
    seq: mode === 'center' ? ['center'] : ['center', 'left', 'center', 'right'],
    idx: -1, stepStart: 0,
    samples: { both: blank(), left: blank(), right: blank() },
  };
  show('screen-calib');
  setCalibStep('targets');
  const t = $('#calib-target');
  t.style.transition = 'none';
  t.style.left = '50%';
  void t.offsetWidth;
  t.style.transition = '';
  nextTarget(performance.now());
}

function nextTarget(now) {
  cal.idx++;
  if (cal.idx >= cal.seq.length) { finishCalibration(); return; }
  const pos = cal.seq[cal.idx];
  const t = $('#calib-target');
  t.style.left = CAL_POS[pos] + '%';
  t.classList.remove('pulse');
  void t.offsetWidth;
  t.classList.add('pulse');
  cal.stepStart = now;
  sound.ping();
  $('#calib-hint').textContent = 'Mira la estrella';
}

function median(a) {
  if (a.length < 6) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

function finishCalibration() {
  if (cal.mode === 'center') {
    const c = settings.calibration;
    let ok = false;
    for (const k of ['both', 'left', 'right']) {
      const m = median(cal.samples[k].center);
      if (m != null && c && c[k]) {
        const old = c[k].center;
        // desplaza también los extremos para mantener la escala
        c[k].left += m - old; c[k].right += m - old; c[k].center = m;
        ok = true;
      }
    }
    if (ok) { settings.calibration.ts = Date.now(); save(); }
    toast(ok ? 'Mirada recentrada.' : 'No se pudo recentrar: no se vio bien el rostro.');
    cal.onDone && cal.onDone(ok);
    return;
  }

  const result = { ts: Date.now() };
  for (const k of ['both', 'left', 'right']) {
    const s = cal.samples[k];
    const l = median(s.left), c = median(s.center), r = median(s.right);
    result[k] = (l != null && c != null && r != null && (l - c) * (r - c) < 0)
      ? { left: l, center: c, right: r, span: Math.min(Math.abs(l - c), Math.abs(r - c)) }
      : null;
  }
  const main = result[settings.eye];
  setCalibStep('test');
  if (!main || main.span < 0.008) {
    $('#calib-test-title').textContent = 'No se logró calibrar';
    $('#calib-test-text').textContent = 'No hubo suficiente diferencia entre mirar a la izquierda y a la derecha.';
    $('#calib-quality').textContent = 'Sugerencias: teléfono horizontal, acercarlo (25–35 cm), más luz de frente, y que el niño mire la estrella sin mover la cabeza.';
    $('#calib-done').textContent = 'Volver';
    cal.failed = true;
    return;
  }
  cal.failed = false;
  settings.calibration = result;
  save();
  const q = main.span >= 0.035 ? 'Buena ✅' : main.span >= 0.018 ? 'Aceptable 🙂' : 'Baja ⚠️ (prueba acercar el teléfono o ponerlo horizontal)';
  $('#calib-test-title').textContent = '¡Calibración lista!';
  $('#calib-test-text').textContent = 'Pide al niño que mire a cada lado. La zona amarilla es lo que ve el juego; se pone verde cuando se confirma.';
  $('#calib-quality').textContent = `Calidad de la señal: ${q}`;
  $('#calib-done').textContent = cal.after === 'play' ? 'Jugar' : 'Listo';
  const t = thresholdFor(settings.sensitivity);
  $('#meter-tl').style.left = `${((1 - t) / 3) * 100 + 100 / 6}%`;
  $('#meter-tr').style.left = `${((1 + t) / 3) * 100 + 100 / 6}%`;
  sound.done();
}

function calibFrame(now) {
  if (!cal) return;
  const st = gaze.state;
  if (cal.step === 'setup') {
    const badge = $('#face-badge');
    badge.classList.remove('ok', 'warn');
    if (!gaze.running) { badge.textContent = 'Iniciando…'; return; }
    if (!st.faceFound) { badge.textContent = 'Buscando rostro…'; $('#calib-start').disabled = true; }
    else if (st.tooFar) { badge.textContent = 'Acerca un poco el teléfono'; badge.classList.add('warn'); $('#calib-start').disabled = false; }
    else { badge.textContent = '✅ Rostro detectado'; badge.classList.add('ok'); $('#calib-start').disabled = false; }
  } else if (cal.step === 'targets') {
    const el = now - cal.stepStart;
    if (el > SETTLE_MS && st.faceFound && st.blink < 0.45) {
      const pos = cal.seq[cal.idx];
      for (const k of ['both', 'left', 'right']) {
        if (st.ratios[k] != null) cal.samples[k][pos].push(st.ratios[k]);
      }
    }
    $('#calib-hint').textContent = st.faceFound ? 'Mira la estrella' : 'No veo el rostro…';
    if (el > STEP_MS) nextTarget(now);
  } else if (cal.step === 'test' && !cal.failed) {
    $$('#calib-test .zone').forEach(z => {
      z.classList.toggle('looking', st.faceFound && z.dataset.zone === st.zone && st.zone !== st.committed);
      z.classList.toggle('committed', st.faceFound && z.dataset.zone === st.committed);
    });
    const n = Math.max(-1.5, Math.min(1.5, st.n || 0));
    $('#meter-dot').style.left = `${((n + 1.5) / 3) * 100}%`;
  }
}

// ================= juego =================
async function startGame() {
  sound.unlock();
  save();
  if (settings.inputMode === 'gaze') {
    if (!hasCalibration()) { toast('Primero calibra la mirada 👁️'); openCalibration('play'); return; }
    try { await ensureCamera(); } catch (e) { console.error(e); toast(cameraErrorMessage(e), 7000); return; }
  }
  $('#overlay').classList.add('hidden');
  show('screen-game');
  game = new Game($('#game-canvas'), { settings, sound });
  session = {
    duration: settings.sessionMinutes * 60,
    frames0: gaze.stats.frames,
    face0: gaze.stats.faceFrames,
    ended: false,
  };
  lastApplied = null;
  lastLongBlinks = gaze.state.longBlinks;
  const gazeOn = settings.inputMode === 'gaze';
  const mini = $('#game-video');
  mini.classList.toggle('on', gazeOn && settings.showCamera);
  if (gazeOn && settings.showCamera) attachPreview(mini);
  $('#gaze-ind').classList.toggle('on', gazeOn);
  requestWake();
  startCountdown();
}

function startCountdown(from = 3) {
  pauseReason = 'countdown';
  game.paused = true;
  $('#overlay').classList.add('hidden');
  const cd = $('#countdown');
  cd.classList.remove('hidden');
  let n = from;
  const tick = () => {
    if (n > 0) { cd.textContent = n; sound.count(); n--; countdownTimer = setTimeout(tick, 800); }
    else {
      cd.textContent = '¡Vamos!'; sound.go();
      countdownTimer = setTimeout(() => { cd.classList.add('hidden'); pauseReason = null; if (game) game.paused = false; }, 600);
    }
  };
  clearTimeout(countdownTimer);
  tick();
}

function pauseGame(reason) {
  if (!game || session.ended) return;
  if (pauseReason === 'countdown') { clearTimeout(countdownTimer); $('#countdown').classList.add('hidden'); }
  game.paused = true;
  pauseReason = reason;
  const gazeOn = settings.inputMode === 'gaze';
  if (reason === 'face') {
    openOverlay('No veo la cara 🙂', 'El juego sigue solo cuando el rostro vuelva a verse.', '', [
      ['Menú', 'btn', goHome],
    ]);
  } else {
    openOverlay('Pausa', settings.blinkPause && gazeOn ? 'Un parpadeo largo también reanuda el juego.' : '', '', [
      ['▶ Seguir', 'btn primary', () => startCountdown(2)],
      ...(gazeOn ? [['🎯 Recentrar mirada', 'btn', recenter]] : []),
      ['Terminar', 'btn', () => endGame()],
      ['Menú', 'btn', goHome],
    ]);
  }
}

function recenter() {
  $('#overlay').classList.add('hidden');
  startTargets('center', () => {
    show('screen-game');
    game.resize();
    startCountdown(2);
  });
}

function openOverlay(title, text, statsHTML, actions) {
  $('#ov-title').textContent = title;
  $('#ov-text').textContent = text;
  $('#ov-stats').innerHTML = statsHTML;
  const box = $('#ov-actions');
  box.innerHTML = '';
  for (const [label, cls, fn] of actions) {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', fn);
    box.appendChild(b);
  }
  $('#overlay').classList.remove('hidden');
}

function endGame() {
  if (!game || session.ended) return;
  session.ended = true;
  game.paused = true;
  pauseReason = 'ended';
  clearTimeout(countdownTimer);
  $('#countdown').classList.add('hidden');
  releaseWake();
  const s = game.stats;
  const gazeOn = settings.inputMode === 'gaze';
  const frames = gaze.stats.frames - session.frames0;
  const facePct = gazeOn && frames > 0 ? Math.round((100 * (gaze.stats.faceFrames - session.face0)) / frames) : null;
  const avgRt = s.rts.length ? Math.round((1000 * s.rts.reduce((a, b) => a + b, 0)) / s.rts.length) : null;
  addSession({
    date: new Date().toISOString(),
    durationS: Math.round(game.elapsed),
    input: settings.inputMode, eye: gazeOn ? settings.eye : '',
    level: settings.level, lanes: settings.lanes, vehicle: settings.vehicle,
    color: settings.color, weather: settings.weather,
    stars: s.stars, starsTotal: s.starsTotal, conesHit: s.conesHit, conesAvoided: s.conesAvoided,
    laneChanges: s.laneChanges, avgReactionMs: avgRt, facePct,
  });
  sound.done();
  const cell = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
  const stats =
    cell(`⭐ ${s.stars}`, `de ${s.starsTotal} estrellas`) +
    cell(s.laneChanges, 'cambios de carril') +
    cell(avgRt != null ? (avgRt / 1000).toFixed(1).replace('.', ',') + ' s' : '–', 'reacción promedio') +
    (gazeOn ? cell(facePct + '%', 'rostro detectado') : cell(s.conesAvoided, 'conos esquivados'));
  const title = s.stars >= s.starsTotal * 0.7 ? '¡Excelente carrera! 🏁' : s.stars > 0 ? '¡Muy bien! 🏁' : '¡Buen intento! 🏁';
  openOverlay(title, '', stats, [
    ['🔁 Otra vez', 'btn primary', () => startGame()],
    ['Menú', 'btn', goHome],
  ]);
}

function goHome() {
  clearTimeout(countdownTimer);
  $('#countdown').classList.add('hidden');
  $('#overlay').classList.add('hidden');
  if (game && session && !session.ended && game.elapsed > 10) endGame();
  game = null;
  pauseReason = null;
  releaseWake();
  stopCamera();
  show('screen-home');
  renderHome();
  $('#overlay').classList.add('hidden');
}

function gameFrame(now, dt) {
  if (!game) return;
  const gazeOn = settings.inputMode === 'gaze';
  if (gazeOn) {
    const st = gaze.state;
    if (!session.ended) {
      if (!st.faceFound) {
        if (!game.paused && now - st.lastFaceTs > 1200) pauseGame('face');
      } else if (pauseReason === 'face' && now - st.faceSince > 700) {
        startCountdown(1);
      }
      if (settings.blinkPause && st.longBlinks !== lastLongBlinks) {
        if (pauseReason === null) pauseGame('user');
        else if (pauseReason === 'user') startCountdown(2);
      }
    }
    lastLongBlinks = st.longBlinks;
    if (!game.paused && st.faceFound && st.committed !== lastApplied) {
      game.setZone(st.committed);
      lastApplied = st.committed;
    }
    $$('#gaze-ind span').forEach(sp => {
      const z = sp.dataset.zone;
      sp.classList.toggle('committed', st.faceFound && z === st.committed);
      sp.style.setProperty('--p', st.faceFound && z === st.candidate && st.candidate !== st.committed ? st.dwell.toFixed(2) : 0);
    });
  }
  game.update(dt);
  game.draw();
  $('#hud-stars').textContent = game.stats.stars;
  $('#hud-time-bar').style.width = `${Math.max(0, 100 * (1 - game.elapsed / session.duration))}%`;
  if (!session.ended && game.elapsed >= session.duration) endGame();
}

// ================= bucle principal =================
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  if (gaze.running) gaze.update(now);
  if (current === 'screen-calib') calibFrame(now);
  else if (current === 'screen-game') gameFrame(now, dt);
}

// ================= eventos =================
function bindUI() {
  $('#btn-play').addEventListener('click', startGame);
  $('#btn-calibrate').addEventListener('click', () => openCalibration('home'));
  holdButton($('#btn-settings'), 2000, () => { syncSettingsUI(); show('screen-settings'); });

  $('#calib-cancel').addEventListener('click', goHome);
  $('#calib-start').addEventListener('click', () => { sound.unlock(); startTargets('full'); });
  $('#calib-redo').addEventListener('click', () => { setCalibStep('setup'); attachPreview($('#calib-video')); });
  $('#calib-done').addEventListener('click', () => {
    if (!cal.failed && cal.after === 'play') { startGame(); return; }
    goHome();
  });

  $('#btn-pause').addEventListener('click', () => {
    if (!game || session.ended) return;
    if (pauseReason === 'user') startCountdown(2); else pauseGame('user');
  });

  // Toque: el tercio de la pantalla tocado elige el carril (solo modo toque)
  $('#game-canvas').addEventListener('pointerdown', e => {
    if (!game || settings.inputMode !== 'touch' || game.paused) return;
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    game.setZone(f < 1 / 3 ? 'left' : f > 2 / 3 ? 'right' : 'center');
  });

  // Teclado: flechas para probar en computador
  window.addEventListener('keydown', e => {
    if (current !== 'screen-game' || !game || game.paused) return;
    if (e.key === 'ArrowLeft') game.setZone('left');
    else if (e.key === 'ArrowRight') game.setZone('right');
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') game.setZone('center');
  });

  window.addEventListener('resize', () => {
    if (game) { game.resize(); game.draw(); }
    if (current === 'screen-home') renderHome();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game && pauseReason === null) pauseGame('user');
    if (!document.hidden && game && !session.ended) requestWake();
  });
}

// ================= arranque =================
bindUI();
bindSettings();
save();
renderHome();
requestAnimationFrame(loop);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW', err));
}

// Para pruebas desde la consola
window.MovilTrack = { gaze, get game() { return game; }, settings: () => settings };
