const CACHE_NAME = 'pilot-calculator-v1'
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
]

// Install service worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache).catch(err => {
        console.log('Cache addAll error:', err)
      })
    })
  )
  self.skipWaiting()
})

// Activate service worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  self.clients.claim()
})

// Fetch event - Network first, fallback to cache
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response
        }

        const responseToCache = response.clone()
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache)
        })

        return response
      })
      .catch(() => {
        return caches.match(event.request).then(response => {
          return response || new Response('Offline - content unavailable', {
            status: 503,
            statusText: 'Service Unavailable'
          })
        })
      })
  )
})

// Handle background sync for future updates
self.addEventListener('sync', event => {
  if (event.tag === 'sync-currency') {
    event.waitUntil(
      fetch('/api/currency-rates').catch(() => {
        console.log('Background sync failed - offline')
      })
    )
  }
})
