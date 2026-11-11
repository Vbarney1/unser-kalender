// sw.js – der Service Worker läuft im Hintergrund zwischen App und Netz.
// Strategie: Immer zuerst aus dem Internet laden (neueste Version).
// Klappt das nicht – kein Netz oder es dauert länger als NETWORK_TIMEOUT_MS
// (z. B. schlechter Empfang in der U-Bahn) –, nehmen wir die gespeicherte Kopie.
// Wenn du Dateien hinzufügst, ergänze ASSETS und erhöhe die Versionsnummer.

const CACHE = 'kalender-v4';
const NETWORK_TIMEOUT_MS = 3000;
// Supabase-Bibliothek vom CDN. Die Version steht in der Adresse und ändert sich nie,
// deshalb nehmen wir hier immer die gespeicherte Kopie (schneller, klappt offline).
const SUPABASE_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './store.js',
  './calendar.js',
  './holidays.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    await cache.addAll(ASSETS);
    // Fremde Adresse: Wenn das CDN gerade hakt, soll nicht die ganze Installation scheitern.
    await cache.add(SUPABASE_LIB).catch(err => console.warn('Supabase-Bibliothek nicht gespeichert:', err));
  }));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Alte Cache-Versionen aufräumen
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))),
  );
  self.clients.claim();
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function networkFirst(request) {
  const cache = await caches.open(CACHE);

  // Netz-Anfrage starten; eine erfolgreiche Antwort landet auch im Cache.
  const network = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  network.catch(() => {}); // Fehler wird unten behandelt, hier nur nicht als "unbehandelt" melden

  try {
    // Wer zuerst fertig ist: Netz oder Stoppuhr? Bei der Stoppuhr ist das Ergebnis undefined.
    const response = await Promise.race([network, wait(NETWORK_TIMEOUT_MS)]);
    if (response) return response;
  } catch {
    // offline – weiter mit dem Cache
  }

  const cached = await cache.match(request, { ignoreSearch: true });
  // Nichts im Cache? Dann doch weiter auf das (langsame) Netz warten.
  return cached ?? network;
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.url === SUPABASE_LIB) return event.respondWith(cacheFirst(request));
  // Alles andere von fremden Adressen (z. B. die Supabase-Datenbank) nie zwischenspeichern.
  if (new URL(request.url).origin !== location.origin) return;
  event.respondWith(networkFirst(request));
});
