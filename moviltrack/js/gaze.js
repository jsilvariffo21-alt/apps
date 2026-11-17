// Seguimiento de mirada con la cámara frontal (MediaPipe Face Landmarker).
//
// Idea: para cada ojo se mide dónde está el centro del iris entre las dos
// esquinas del ojo (0 = una esquina, 1 = la otra). Ese valor cambia cuando el
// niño mira a izquierda o derecha. La calibración guarda el valor al mirar el
// centro, la izquierda y la derecha de la pantalla; con eso se decide la zona.
//
// Todo el procesamiento ocurre en el dispositivo: el video nunca sale del equipo.

const VENDOR = new URL('../vendor/mediapipe/', import.meta.url).href;

// Puntos de MediaPipe (ojos del niño): esquinas de cada ojo y centros de iris.
const EYES = { right: { a: 33, b: 133 }, left: { a: 362, b: 263 } };
const IRIS = [468, 473];
const KEYS = ['both', 'left', 'right'];

export function normalizeGaze(v, cal) {
  const d = v - cal.center;
  const dr = cal.right - cal.center;
  const dl = cal.left - cal.center;
  if (d * dr > 0) return Math.min(2, d / dr);
  if (d * dl > 0) return -Math.min(2, d / dl);
  return 0;
}

export function thresholdFor(sensitivity) {
  return 0.7 - 0.4 * sensitivity; // sensibilidad 0 → 0.70, 1 → 0.30
}

export class GazeTracker {
  constructor() {
    this.stream = null;
    this.video = null;
    this.landmarker = null;
    this.lastVideoTime = -1;
    this.cfg = { eye: 'both', sensitivity: 0.5, dwellMs: 600, longBlinkMs: 1200, calibration: null };
    this.state = {
      faceFound: false, faceSince: 0, lastFaceTs: 0,
      blink: 0, tooFar: false,
      ratios: { both: null, left: null, right: null },
      n: 0, zone: 'center', candidate: 'center', candidateSince: 0,
      committed: 'center', dwell: 0, longBlinks: 0,
    };
    this.hist = { both: [], left: [], right: [] };
    this.smooth = { both: null, left: null, right: null };
    this.blinkStart = 0;
    this.blinkFired = false;
    this.stats = { frames: 0, faceFrames: 0 };
  }

  get running() { return !!(this.stream && this.landmarker); }

  configure(c) { Object.assign(this.cfg, c); }

  async start(onProgress) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const e = new Error('Este navegador no permite usar la cámara.');
      e.name = 'NoCamera';
      throw e;
    }
    if (!this.stream) {
      onProgress && onProgress('Solicitando acceso a la cámara…');
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
    }
    if (!this.video) {
      const v = document.createElement('video');
      v.setAttribute('playsinline', '');
      v.setAttribute('muted', '');
      v.muted = true;
      v.autoplay = true;
      v.className = 'hidden-video';
      document.body.appendChild(v);
      this.video = v;
    }
    this.video.srcObject = this.stream;
    try { await this.video.play(); } catch { /* iOS a veces requiere otro gesto */ }

    if (!this.landmarker) {
      onProgress && onProgress('Cargando detector de mirada…\n(la primera vez puede tardar unos segundos)');
      const { FilesetResolver, FaceLandmarker } = await import(VENDOR + 'vision_bundle.mjs');
      const fileset = await FilesetResolver.forVisionTasks(VENDOR + 'wasm');
      const opts = delegate => ({
        baseOptions: { modelAssetPath: VENDOR + 'face_landmarker.task', delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      try {
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, opts('GPU'));
      } catch (err) {
        console.warn('GPU no disponible, se usa CPU', err);
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, opts('CPU'));
      }
    }
  }

  stopCamera() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.lastVideoTime = -1;
    this.state.faceFound = false;
  }

  /** Llamar en cada cuadro de animación. */
  update(now) {
    const v = this.video;
    if (!this.running || !v || v.readyState < 2 || !v.videoWidth) return;
    if (v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;

    let res;
    try { res = this.landmarker.detectForVideo(v, now); } catch (e) { console.warn(e); return; }
    this.stats.frames++;
    const st = this.state;
    const lm = res.faceLandmarks && res.faceLandmarks[0];
    if (!lm || lm.length < 478) {
      st.faceFound = false;
      st.candidateSince = now;
      st.dwell = 0;
      this.blinkStart = 0;
      return;
    }
    this.stats.faceFrames++;
    if (!st.faceFound) { st.faceFound = true; st.faceSince = now; }
    st.lastFaceTs = now;

    // Parpadeo (coeficientes de expresión del modelo)
    let bl = 0, br = 0;
    const cats = (res.faceBlendshapes && res.faceBlendshapes[0] && res.faceBlendshapes[0].categories) || [];
    for (const c of cats) {
      if (c.categoryName === 'eyeBlinkLeft') bl = c.score;
      else if (c.categoryName === 'eyeBlinkRight') br = c.score;
    }
    st.blink = Math.max(bl, br);

    // Parpadeo largo voluntario (ambos ojos cerrados)
    if (Math.min(bl, br) > 0.55) {
      if (!this.blinkStart) { this.blinkStart = now; this.blinkFired = false; }
      else if (!this.blinkFired && now - this.blinkStart >= this.cfg.longBlinkMs) {
        this.blinkFired = true;
        st.longBlinks++;
      }
    } else {
      this.blinkStart = 0;
    }

    // Posición del iris dentro de cada ojo
    const aspect = v.videoWidth / v.videoHeight;
    const P = i => ({ x: lm[i].x * aspect, y: lm[i].y });
    const irisPts = IRIS.map(P);
    const eyes = {};
    for (const name of ['left', 'right']) {
      let p1 = P(EYES[name].a), p2 = P(EYES[name].b);
      if (p1.x > p2.x) { const t = p1; p1 = p2; p2 = t; }
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      let ir = irisPts[0];
      if (Math.hypot(irisPts[1].x - mid.x, irisPts[1].y - mid.y) < Math.hypot(ir.x - mid.x, ir.y - mid.y)) ir = irisPts[1];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const len2 = dx * dx + dy * dy || 1e-6;
      eyes[name] = { r: ((ir.x - p1.x) * dx + (ir.y - p1.y) * dy) / len2, w: Math.sqrt(len2) };
    }
    st.tooFar = Math.max(eyes.left.w, eyes.right.w) < 0.045;

    // Durante un parpadeo el iris no es confiable: se mantiene el último valor.
    if (st.blink < 0.45) {
      const raw = { left: eyes.left.r, right: eyes.right.r, both: (eyes.left.r + eyes.right.r) / 2 };
      for (const k of KEYS) {
        const h = this.hist[k];
        h.push(raw[k]);
        if (h.length > 5) h.shift();
        const med = [...h].sort((a, b) => a - b)[Math.floor(h.length / 2)];
        this.smooth[k] = this.smooth[k] == null ? med : this.smooth[k] + 0.4 * (med - this.smooth[k]);
        st.ratios[k] = this.smooth[k];
      }
    }
    this._zone(now);
  }

  _zone(now) {
    const st = this.state;
    const cal = this.cfg.calibration && this.cfg.calibration[this.cfg.eye];
    const v = st.ratios[this.cfg.eye];
    if (!cal || v == null) { st.candidateSince = now; st.dwell = 0; return; }

    const n = normalizeGaze(v, cal);
    st.n = n;
    const t = thresholdFor(this.cfg.sensitivity);
    const h = 0.1; // histéresis: evita parpadeo entre zonas
    let z = st.zone;
    if (z === 'center') {
      if (n > t) z = 'right'; else if (n < -t) z = 'left';
    } else if (z === 'right') {
      if (n < t - h) z = n < -t ? 'left' : 'center';
    } else if (z === 'left') {
      if (n > -t + h) z = n > t ? 'right' : 'center';
    }
    st.zone = z;

    if (z !== st.candidate) { st.candidate = z; st.candidateSince = now; }
    if (st.candidate !== st.committed) {
      st.dwell = Math.min(1, (now - st.candidateSince) / Math.max(1, this.cfg.dwellMs));
      if (st.dwell >= 1) { st.committed = st.candidate; st.dwell = 0; }
    } else {
      st.dwell = 0;
    }
  }
}
