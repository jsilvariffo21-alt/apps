// Configuración de la persona adulta, guardada en este dispositivo (localStorage).
const KEY = 'moviltrack.settings.v1';

export const DEFAULTS = {
  vehicle: 'car',        // 'car' | 'moto'
  color: 'blue',         // 'blue' | 'red' | 'green' | 'white' | 'black'
  weather: 'sun',        // 'sun' | 'rain'
  view: 'top',           // 'top' (desde arriba) | 'back' (desde atrás, hacia el horizonte)
  playerName: '',        // opcional: nombre de quien juega, para saludar
  speedStep: 'rand',     // cada 10 estrellas: '0' (no), '2'..'5' (%), 'rand' (2–5 % al azar)
  level: 1,              // 1..5
  lanes: 3,              // 2 | 3
  inputMode: 'gaze',     // 'gaze' (mirada) | 'touch' (toque, sin cámara)
  eye: 'both',           // 'both' | 'right' | 'left' (ojos de quien juega)
  sensitivity: 0.5,      // 0..1 (más alto = basta mirar menos hacia el lado)
  dwellMs: 600,          // tiempo que debe sostener la mirada para confirmar
  blinkPause: false,     // parpadeo largo pausa / reanuda
  longBlinkMs: 1200,
  sessionMinutes: 3,
  sound: true,
  showCamera: true,
  calibration: null,
};

export const LEVEL_INFO = {
  1: 'Recta y lenta. Solo estrellas.',
  2: 'Recta. Aparecen algunos conos.',
  3: 'Curvas suaves y más conos.',
  4: 'Curvas y más velocidad.',
  5: 'Curvas marcadas y rápido.',
};

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sin almacenamiento */ }
}
