// Service worker: simpan tampilan aplikasi agar cepat dibuka. Data selalu diambil baru dari Supabase.
const VERSI = 'nopa-v2';
const FILE = ['./', './index.html', './app.js', './config.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSI).then((c) => c.addAll(FILE))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSI).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // data Supabase tidak disimpan
  e.respondWith(
    fetch(e.request).then((res) => { const salin = res.clone(); caches.open(VERSI).then((c) => c.put(e.request, salin)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
