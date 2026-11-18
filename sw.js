/* PesoPath — service worker (offline app shell) */
const VERSION = '1.2.3';
const CACHE = `pesopath-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  // Keep these asset versions in sync with index.html.
  ...['./css/styles.css', './js/installments.js', './js/store.js', './js/debt.js', './js/ui.js', './js/views.js', './js/guide.js', './js/app.js', './js/mobile-download.js'].map((path) => `${path}?v=${VERSION}`),
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pesopath-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/downloads/')) return;

  // Navigations: try the network so updates land, fall back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.open(CACHE).then((cache) => cache.match('./index.html').then((hit) => hit || cache.match('./'))))
    );
    return;
  }

  // Assets: cache-first, refreshed in the background.
  event.respondWith(
    caches.open(CACHE).then((cache) => cache.match(request).then((hit) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => hit);
      return hit || network;
    }))
  );
});
