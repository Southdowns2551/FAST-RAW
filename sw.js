/**
 * Service Worker for Material Hub PWA
 * Enables offline caching and installability.
 */

const CACHE_NAME = 'material-hub-v50';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/auth.js',
  '/app.js',
  '/camera.js',
  '/rawIn.js',
  '/rawOut.js',
  '/reworkOut.js',
  '/reworkIn.js',
  '/settings.js',
  '/portal.js',
  '/config.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192.svg'
];

/**
 * Install event: pre-cache static assets.
 * @param {ExtendableEvent} event
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

/**
 * Activate event: claim clients and remove old caches.
 * @param {ExtendableEvent} event
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/**
 * Message handler: allows pages to trigger skipWaiting on a waiting SW.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/**
 * Fetch event: network-first with cache update and fallback.
 * @param {FetchEvent} event
 */
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate' && !event.request.url.match(/\.(html|css|js|json|png|svg)$/)) {
    return;
  }
  event.respondWith(
    fetch(event.request).then((response) => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
      return response;
    }).catch(() => caches.match(event.request))
  );
});
