/* RCK QA service worker.
   The app shell is cached so it opens instantly and still works down a
   driveway with no signal. Supabase calls are never cached — the QA record
   must always be the live one. */
const CACHE = 'rck-qa-v1';
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

  // Anything that isn't our own app shell (Supabase data, site photos) goes
  // straight to the network.
  if (url.origin !== location.origin) return;

  // Network-first for the app itself, so a deploy reaches phones next open.
  //
  // 'no-cache' is the important word. Without it this fetch is answered by
  // the browser's own cache, which GitHub Pages lets hold a file for ten
  // minutes — so the worker hands back last week's app and believes it went
  // to the network. This forces a revalidation: a 304 when nothing changed,
  // the new file the moment there is one.
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
