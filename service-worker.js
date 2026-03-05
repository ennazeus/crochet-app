// service-worker.js

const APP_VERSION = "v1.0.101"; // <-- bumpa vid deploy (v1.0.1, v1.1.0 etc)
const PRECACHE = `precache-${APP_VERSION}`;
const RUNTIME = `runtime-${APP_VERSION}`;

// App shell: allt som behövs för att starta offline
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./create.html",
  "./pattern.html",
  "./offline.html",

  "./vendor/bootstrap/css/bootstrap.min.css",

  "./js/db.js",
  "./js/utils.js",
  "./js/image.js",
  "./js/backup.js",
  "./js/index.js",
  "./js/create.js",
  "./js/pattern.js",
  "./js/pwa.js",

  "./manifest.webmanifest",

  "./resources/icon-192.png",
  "./resources/icon-512.png",
  "./resources/favicon.png"
];

// Install: ladda app shell i cache
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);

    for (const url of PRECACHE_URLS) {
      try {
        await cache.add(url);
      } catch (err) {
        console.warn("Misslyckades att cacha:", url);
      }
    }
  })());

  self.skipWaiting();
});

// Activate: rensa gamla caches + ta kontroll
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith("precache-") || k.startsWith("runtime-"))
        .filter(k => k !== PRECACHE && k !== RUNTIME)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Meddelande-kanal (för att trigga skipWaiting från UI)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Helpers
async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(req);
  if (cached) return cached;

  const fresh = await fetch(req);
  if (fresh && fresh.ok) cache.put(req, fresh.clone());
  return fresh;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(req);

  const fetchPromise = fetch(req).then((fresh) => {
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  }).catch(() => null);

  return cached || (await fetchPromise) || new Response("Offline", { status: 503 });
}

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    return caches.match("./offline.html");
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Bara hantera same-origin
  if (url.origin !== self.location.origin) return;

  // Navigationsförfrågningar: network-first (för att alltid få senaste versionen av appen)
if (req.mode === "navigate") {
  event.respondWith((async () => {
    const url = new URL(req.url);

    // Ta bort querystring
    const cleanUrl = url.origin + url.pathname;

    const cached = await caches.match(cleanUrl);
    if (cached) return cached;

    return networkFirst(req);
  })());

  return;
}

  // CSS/JS/Images/manifest: stale-while-revalidate
  if (
    req.destination === "script" ||
    req.destination === "style" ||
    req.destination === "image" ||
    url.pathname.endsWith(".webmanifest")
  ) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Fallback: cache-first
  event.respondWith(cacheFirst(req));
});

