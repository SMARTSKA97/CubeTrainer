// CubeTrainer service worker: makes the app open and work offline.
//  - app files (js, css, algorithms JSON, images): stale-while-revalidate
//  - page navigations: network first, cached index.html as the offline fallback
//  - /api, /config.json and the update probe (?ct-check) go straight to the network; other origins are never touched (the app keeps its own offline copy in localStorage)
const CACHE = 'cubetrainer-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['/', '/index.html', '/manifest.webmanifest', '/algs/algs.json']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api') ||
    url.pathname === '/config.json'
  )
    return;
  // The app's "is there a new version?" probe must always reach the network, never the cached copy.
  if (url.searchParams.has('ct-check')) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
