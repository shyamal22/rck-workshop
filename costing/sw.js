/* RCK Costing service worker.

   The app is cached in full, so it opens with no connection at all — which
   is the normal case, not the exception: the figures live in the browser's
   own storage and nothing is ever fetched from anywhere.

   The cache is only ever the app itself. No job, no figure and no backup
   passes through here. */
const CACHE = 'rck-costing-v1';
const ASSETS = [
  './', './index.html', './app.css', './app.js', './config.js',
  './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(u =>
        fetch(u, { cache: 'reload' }).then(r => r.ok && c.put(u, r)).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
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
  if (url.origin !== location.origin) return;

  // Network-first for the app itself, so a push to GitHub reaches the phone
  // next time it opens; the cache answers when there is no signal.
  //
  // 'no-cache' is the important word. Without it this fetch is answered by
  // the browser's own cache, which GitHub Pages lets hold a file for ten
  // minutes — so the worker hands back last week's app and believes it went
  // to the network.
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
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
