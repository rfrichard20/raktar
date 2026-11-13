// Service worker: az alkalmazás fájljait gyorsítótárazza, így internet nélkül is elindul.
// Stratégia: hálózat elsőként (rövid időkorláttal), hiba esetén a gyorsítótárból.
// Új verzió kiadásakor elég a VERSION értékét növelni.
// FIGYELEM: a Tereppel közös originen (GitHub Pages) a gyorsítótárak is közösek → csak a saját, PREFIX-szel
// kezdődő gyorsítótárakat szabad törölni, különben a másik app offline fájljai vesznek el.
const PREFIX = 'raktar-';
const VERSION = PREFIX + 'v61';
const FONTS = ['400', '500', '600', '700'].flatMap(w => ['latin', 'latin-ext'].map(s => `fonts/poppins-${w}-${s}.woff2`));
const ASSETS = [
  ...FONTS, './', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'css/app.css',
  'js/theme.js', 'js/logic.js', 'js/config.js', 'js/idb.js', 'js/ui.js', 'js/icons.js', 'js/backend.js', 'js/store.js', 'js/app.js',
  'js/views/common.js', 'js/views/login.js', 'js/views/fiok.js', 'js/views/attekinto.js', 'js/views/leltar.js',
  'js/views/beerkezes.js', 'js/views/kivet.js', 'js/views/rendelesek.js', 'js/views/torzsadatok.js', 'js/views/kimutatasok.js', 'js/views/mozgasok.js',
  'js/views/igenyek.js', 'js/views/eszkozok.js', 'js/views/cimkek.js', 'js/views/visszavetel.js', 'js/qr.js',
  // A QR-könyvtárak csak használatkor töltődnek be, de offline is kellenek (pl. raktári beolvasás térerő nélkül)
  'js/vendor/qrcode.js', 'js/vendor/jsQR.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // API hívások, Google szkriptek: nem érintjük
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await Promise.race([fetch(req), timeout(4000)]);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return cache.match('index.html');
      return new Response('Offline', { status: 503 });
    }
  })());
});
