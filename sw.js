const CACHE = "thermabot-v0.4.1-unified";
const ASSETS = [
"./unified.css",
  "./workspace.html",
  "./workspace.css",
  "./workspace-core.js",
  "./workspace.js",
  "./",
  "./index.html",
  "./styles.css",
  "./app-v023.js",
  "./realtime-input.js",
  "./engine.js",
  "./pressure.html",
  "./pressure.css",
  "./pressure-network.js",
  "./pressure-app.js",
  "./tracker.html",
  "./tracker.css",
  "./tracker.js",
  "./tracker-drive-autosync.js",
  "./manifest.webmanifest",
  "./version.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith("thermabot-") && k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if(event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  event.respondWith(
    fetch(event.request, {cache:"no-store"})
      .then(response => {
        const copy = response.clone();
        if(response.ok) event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
        return response;
      })
      .catch(() => caches.match(event.request).then(r => r || Response.error()))
  );
});
