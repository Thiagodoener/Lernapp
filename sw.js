const CACHE = "lernapp-pwa-v14";
const LOCAL = [
  "./","./index.html","./styles.css","./app.js","./ai-service.js","./import-ai.js","./profile-ai-mode.js","./cloud-settings.js","./summaries-ai.js","./free-answer-ai.js","./exam-ai.js","./tutor-ai.js","./material-delete.js",
  "./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(LOCAL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      const copy = response.clone();
      const cache = await caches.open(CACHE);
      cache.put(event.request, copy).catch(()=>{});
      return response;
    } catch (err) {
      if (event.request.mode === "navigate") {
        return caches.match("./index.html");
      }
      throw err;
    }
  })());
});
