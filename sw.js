const CACHE_NAME = 'shidan-v19';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/store.js',
    './js/app.js',
    './js/theme.js',
    './manifest.json',
    './vendor/vue.global.prod.js',
    './vendor/element-plus.full.min.js',
    './vendor/element-plus-zh-cn.min.js',
    './vendor/element-plus.css',
    './vendor/element-plus-dark.css',
    './img/logo-192px.png',
    './img/logo-512px.png'
];

// Install event: Cache essential assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Caching all assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting()) // Force the waiting service worker to become the active service worker
    );
});

// Activate event: Clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Removing old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control of all clients immediately
    );
});

// Fetch event: Network first, falling back to cache (for a balance of fresh data and offline support)
self.addEventListener('fetch', event => {
    // Only GET requests can be stored in the Cache API, so leave anything else alone.
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // If the response is valid, clone it and update the cache.
                // A response body can only be read once, hence the clone.
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(event.request, responseToCache));
                }
                return response;
            })
            // If the network request fails, fall back to whatever we cached
            .catch(() => caches.match(event.request))
    );
});
