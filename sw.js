// Einfacher Offline-Cache für die Menuiserie-Delley-App.
// Strategie: Cache-first mit Hintergrund-Update ("stale-while-revalidate").
// Alle Daten (Kunden, Offerten, Fotos, Notizen) liegen in IndexedDB, nicht hier —
// dieser Cache betrifft nur die App-Dateien selbst (HTML/JS/CSS/Icons).

const CACHE_VERSION = 'delley-v9';
const FIREBASE_SDK_VERSION = '12.17.1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/router.js',
  './js/db.js',
  './js/i18n.js',
  './js/settings.js',
  './js/customers.js',
  './js/documents.js',
  './js/catalog.js',
  './js/avor.js',
  './js/termine.js',
  './js/projekte.js',
  './js/ausgaben.js',
  './js/picker.js',
  './js/attachments.js',
  './js/bookingRequests.js',
  './js/notifications.js',
  './js/firebase.js',
  './js/firebase-config.js',
  './js/auth.js',
  './js/login.js',
  './js/pdf.js',
  './js/mail.js',
  './js/ui.js',
  './js/utils.js',
  './js/views/dashboard.js',
  './js/views/kunden.js',
  './js/views/katalog.js',
  './js/views/dokumente.js',
  './js/views/avor.js',
  './js/views/kalender.js',
  './js/views/einstellungen.js',
  './js/views/projekte.js',
  './js/views/ausgaben.js',
  './assets/logo.png',
  './assets/logo-full-white.png',
  './assets/logo-mark-white.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './vendor/jspdf.umd.min.js',
  './vendor/qrcode-generator.js',
  `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`,
  `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`,
  `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`,
];
const CACHEABLE_ORIGINS = [self.location.origin, 'https://www.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Klick auf eine Benachrichtigung: bestehendes Fenster fokussieren und dorthin
// navigieren (z.B. zum Kalender), sonst ein neues Fenster öffnen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (allClients.length > 0) {
      const client = allClients[0];
      if ('navigate' in client) await client.navigate(url);
      return client.focus();
    }
    return self.clients.openWindow(url);
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !CACHEABLE_ORIGINS.some((origin) => req.url.startsWith(origin))) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      // Offline & schon im Cache -> sofort liefern. Sonst auf Netzwerk warten.
      if (cached) {
        networkFetch; // Cache im Hintergrund auffrischen, Ergebnis nicht abwarten
        return cached;
      }
      const fresh = await networkFetch;
      return fresh || cached || Response.error();
    })
  );
});
