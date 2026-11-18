// Service worker: permite usar MovilTrack sin conexión después de la primera carga.
const SHELL_CACHE = 'moviltrack-shell-v2';
const VENDOR_CACHE = 'moviltrack-vendor-mp-0.10.14';
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/main.js', './js/game.js', './js/gaze.js', './js/vehicles.js',
  './js/settings.js', './js/history.js', './js/audio.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== VENDOR_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Archivos grandes del detector: primero caché (no cambian dentro de una versión).
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(
      caches.open(VENDOR_CACHE).then(cache =>
        cache.match(req).then(hit => hit || fetch(req).then(res => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // Código de la app: primero red (para recibir mejoras), si no hay red, caché.
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL_CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
