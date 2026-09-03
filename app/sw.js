// MatricAce service worker
// Handles: app-shell caching for installability/offline (stale-while-revalidate,
// so content updates are picked up automatically without bumping a cache
// version on every deploy), quiz/task API caching, and Web Push notifications
// (works even when the tab is closed).

var CACHE_V = 'matricace-shell';
var QUIZ_CACHE = 'matricace-quiz';
var TASK_CACHE = 'matricace-tasks';
var STATIC = [
  './',
  'MatricAce_SA_Ultimate_v9.html',
  'manifest.json',
  'icon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_V).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_V && k !== QUIZ_CACHE && k !== TASK_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Cache quiz/classwork API responses so tasks are still visible offline
  if (url.includes('supabase') && url.includes('classwork')) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(TASK_CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Network-first for API calls
  if (url.includes('supabase') || url.includes('api')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // Stale-while-revalidate for the app shell/static assets: serve the cached
  // copy instantly, but always re-fetch in the background and update the
  // cache. If the freshly fetched content differs from what was cached, tell
  // any open tabs so they can prompt the user to refresh.
  e.respondWith(
    caches.open(CACHE_V).then(cache =>
      cache.match(e.request).then(cached => {
        const networkFetch = fetch(e.request).then(res => {
          if (res.ok) {
            const resClone = res.clone();
            if (cached) {
              cached.clone().text().then(oldText => {
                resClone.clone().text().then(newText => {
                  if (oldText !== newText) {
                    self.clients.matchAll().then(clients =>
                      clients.forEach(c => c.postMessage({ type: 'NEW_VERSION_READY' }))
                    );
                  }
                });
              });
            }
            cache.put(e.request, resClone);
          }
          return res;
        }).catch(() => cached);

        return cached || networkFetch;
      })
    )
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── Real push notification handling ──────────────────────────
// Fires even when the app/tab is fully closed, as long as the
// browser process can wake this service worker (standard Web Push).
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch(err) { data = { title: 'MatricAce', body: e.data ? e.data.text() : '' }; }
  const title = data.title || 'MatricAce';
  const options = {
    body: data.body || '',
    icon: data.icon || 'icon.svg',
    badge: data.badge || 'icon.svg',
    tag: data.tag || 'matricace-notif',
    data: { url: data.url || './MatricAce_SA_Ultimate_v9.html' },
    vibrate: [80, 40, 80],
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = (e.notification.data && e.notification.data.url) || './MatricAce_SA_Ultimate_v9.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
