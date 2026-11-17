// Sonidos sintetizados (sin archivos). Suaves, sin estridencias.
export class Sound {
  constructor() { this.ctx = null; this.enabled = true; }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    } catch { /* sin audio */ }
  }

  tone(freq, dur, type = 'sine', vol = 0.12, when = 0) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  star() { this.tone(880, 0.14, 'sine', 0.13); this.tone(1320, 0.22, 'sine', 0.1, 0.09); }
  bump() { this.tone(180, 0.2, 'triangle', 0.14); }
  lane() { this.tone(520, 0.06, 'sine', 0.04); }
  ping() { this.tone(660, 0.18, 'sine', 0.1); }
  count() { this.tone(600, 0.12, 'sine', 0.09); }
  go() { this.tone(900, 0.25, 'sine', 0.11); }
  done() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.11, i * 0.15)); }
}
