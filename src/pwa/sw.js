const CACHE_NAME = 'fiestas-valladolid-2026-__APP_VERSION__';
const APP_SHELL = [
  '/',
  '/mapa/',
  '/plan/',
  '/planes/',
  '/offline.html',
  '/assets/manifest.webmanifest',
  '/assets/icons/fiestas-192.png',
  '/assets/icons/fiestas-512.png',
  '/assets/icons/apple-touch-icon.png',
  '/assets/plan-confetti.png',
  '/assets/css/fiestas-2026.__CSS_VERSION__.css',
  '/assets/js/analytics.__JS_VERSION__.js',
  '/assets/js/plan-storage.__JS_VERSION__.js',
  '/assets/js/plan-export.__JS_VERSION__.js',
  '/assets/js/plans-page.__JS_VERSION__.js',
  '/assets/js/community-plans.__JS_VERSION__.js',
  '/assets/js/fiestas-2026.__JS_VERSION__.js',
  '/assets/js/menu-drawer.__JS_VERSION__.js',
  '/assets/js/pwa.__JS_VERSION__.js',
  '/assets/js/subscribe.__JS_VERSION__.js',
  '/assets/js/theme.__JS_VERSION__.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('fiestas-valladolid-2026-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname === '/data/planes.json' || url.pathname.startsWith('/data/community-plans/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname === '/offline.html') {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) await putInCache(request, response.clone());
    return response;
  } catch (_) {
    return (await caches.match(request)) || (await caches.match('/')) || (await caches.match('/offline.html'));
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) await putInCache(request, response.clone());
    return response;
  } catch (_) {
    return caches.match('/offline.html');
  }
}

async function putInCache(request, response) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response);
}
