// Registro simple de sesiones para el terapeuta (solo en este dispositivo).
const KEY = 'moviltrack.history.v1';
const MAX = 300;

export function getSessions() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function addSession(rec) {
  const all = getSessions();
  all.push(rec);
  while (all.length > MAX) all.shift();
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* lleno o bloqueado */ }
}

export function clearSessions() {
  try { localStorage.removeItem(KEY); } catch { /* nada */ }
}

const COLS = [
  ['fecha', 'date'], ['duracion_s', 'durationS'], ['control', 'input'], ['ojo', 'eye'],
  ['nivel', 'level'], ['carriles', 'lanes'], ['vehiculo', 'vehicle'], ['color', 'color'],
  ['clima', 'weather'], ['estrellas', 'stars'], ['estrellas_total', 'starsTotal'],
  ['conos_chocados', 'conesHit'], ['conos_esquivados', 'conesAvoided'],
  ['cambios_carril', 'laneChanges'], ['reaccion_prom_ms', 'avgReactionMs'],
  ['rostro_detectado_pct', 'facePct'], ['vista', 'view'], ['velocidad_max_pct', 'maxSpeedPct'],
];

export function toCSV(rows) {
  const esc = v => {
    const s = v == null ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = COLS.map(c => c[0]).join(',');
  const body = rows.map(r => COLS.map(c => esc(r[c[1]])).join(',')).join('\n');
  return head + '\n' + body + '\n';
}
