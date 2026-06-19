const CACHE_NAME = 'cz-aluno-v6';
// Path served as the offline fallback for failed navigations (precached below).
const OFFLINE_URL = '/offline';

// Install — activate immediately, cache in background
self.addEventListener('install', (event) => {
  // Skip waiting to activate immediately — critical for push to work
  self.skipWaiting();

  // Cache app shell in background (don't block install if any URL fails)
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const urls = ['/dashboard', OFFLINE_URL];
      for (const url of urls) {
        try {
          await cache.add(url);
        } catch (e) {
          // Don't let a single failed cache prevent SW activation
          console.log('[SW] Cache skip:', url, e.message);
        }
      }
    })
  );
});

// Activate — clean old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Clean old caches
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
      // Take control of all clients immediately
      self.clients.claim(),
    ])
  );
});

// Fetch — network first, cache fallback. Network-first means an online client
// always gets the freshly-deployed HTML/chunks (so there's no stale-shell
// problem); the cache only kicks in when the network actually fails.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/')) return; // Don't cache API calls
  // Skip user-uploaded content: avatars and other uploads should always come
  // fresh from the network so a new upload replaces the old one immediately.
  if (event.request.url.includes('/uploads/')) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        // Cache successful same-origin responses for offline fallback.
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      } catch (err) {
        // Network failed (offline / flaky link). Serve the cached copy if we
        // have one for this exact URL.
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // Page navigation with nothing cached for this URL → fall back to the
        // app shell so the installed PWA still OPENS instead of a blank screen.
        if (event.request.mode === 'navigate') {
          const shell = await caches.match('/dashboard');
          if (shell) return shell;
          // No shell either → serve the precached branded offline page so the
          // user sees "Você está offline" instead of Response.error()/blank.
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
        }
        // Last resort: a real (error) Response. NEVER resolve to undefined —
        // respondWith(undefined) makes the request fail hard, which is the old
        // bug that could leave the PWA blank.
        return Response.error();
      }
    })()
  );
});

// Push notification received
self.addEventListener('push', (event) => {
  let data = { title: 'Código Zero', body: 'Nova notificação', url: '/dashboard', icon: '/icons/icon-192.png' };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = { ...data, ...payload };
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/dashboard' },
    actions: [{ action: 'open', title: 'Abrir' }],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification click — open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    })
  );
});

