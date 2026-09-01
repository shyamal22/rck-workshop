/* RCK Workshop service worker.
   The app shell is cached so it opens instantly and still works on a bad
   connection. Supabase calls are never cached — data must always be live. */
const CACHE = 'rck-workshop-v14';
const ASSETS = [
  './', './index.html', './app.css', './app.js', './config.js',
  './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Anything that isn't our own app shell (Supabase data, uploaded photos)
  // goes straight to the network.
  if (url.origin !== location.origin) return;

  // Network-first for the app itself, so a deploy reaches phones next open.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
  );
});
