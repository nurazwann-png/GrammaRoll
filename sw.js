const CACHE = 'grammar-ball-v5'; // bump version to evict stale assets
const ASSETS = [
  '/', '/index.html', '/logo.jpg', '/manifest.json', '/icon-maskable.svg', '/css/style.css',
  ...['data','engine','characters','scenery','questions','render','progress','teacher','story','ui','feedback','multiplayer','main'].map(f => `/js/${f}.js`),
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  if (new URL(e.request.url).pathname.startsWith('/api/')) return;
  // Network-first for HTML, scripts and styles so new deploys reach pupils immediately
  const isNavigation = e.request.mode === 'navigate' || /(\/|\.html|\.js|\.css|\.json)$/.test(new URL(e.request.url).pathname);
  if (isNavigation) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first for assets (images, manifests, etc.)
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res && res.status === 200) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
