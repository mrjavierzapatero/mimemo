const CACHE = 'leteo-v18-mic-and-alarms-20261112';
const ASSETS = [
  './',
  './index.html',
  './agenda.js?v=20261112-v9',
  './waveform.js?v=20261112-v9',
  './calendar.js?v=20261112-v9',
  './calendar-ui.js?v=20261112-v9',
  './calendar.css?v=20261112-v9',
  './branding.css?v=20261112-v9',
  './manifest.json',
  './assets/icons/icon-192.png?v=leteo-20261108',
  './assets/icons/icon-512.png?v=leteo-20261108',
  './assets/branding/leteo-yellow.svg',
  './assets/branding/wave-idle.svg',
  './assets/branding/wave-recording.svg',
  './Branding/SVG/logo_leteo_negro.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('leteo-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' })))
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Siempre red para APIs externas
  if (url.includes('generativelanguage.googleapis.com') ||
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com') ||
      url.includes('unpkg.com')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // index.html: siempre red primero — garantiza código actualizado
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if(!res.ok) throw new Error('Navigation failed');
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(async () => (await caches.match(e.request)) || (await caches.match('./index.html')) || new Response('Sin conexión', {status:503}))
    );
    return;
  }

  // Resto de assets: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        if (clients.length) return clients[0].focus();
        return self.clients.openWindow('./');
      })
  );
});
