const VERSION = "v22";
const CACHE = `lernapp-pwa-${VERSION}`;

// Diese Dateien aendern sich mit jeder Korrektur.
const APP_FILES = [
  "./","./index.html","./styles.css","./compat.js","./app.js","./ai-service.js","./import-ai.js",
  "./appearance.js","./profile-ai-mode.js","./cloud-settings.js","./ai-usage.js","./audit.js",
  "./summaries-ai.js","./free-answer-ai.js","./exam-ai.js","./tutor-ai.js","./material-delete.js",
  "./quiz.js","./sync.js",
  "./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png"
];

// Bibliotheken haengen an ihrer Version und aendern sich nie. Sie sind gross,
// deshalb darf ein Fehlschlag beim Vorabladen die Installation nicht kosten.
const VENDOR_FILES = [
  "./vendor/pdf.mjs","./vendor/pdf.worker.mjs","./vendor/ts-fsrs.mjs"
];

const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_FILES);
    await Promise.all(VENDOR_FILES.map(url => cache.add(url).catch(() => {})));
  })());
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isVendor(pathname) {
  return pathname.includes("/vendor/");
}

async function fromNetworkWithTimeout(request) {
  // Ohne Zeitgrenze haengt der Start in einem schlechten Netz, statt auf den
  // vorhandenen Stand zurueckzufallen.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await fetch(request, {signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Fremde Herkunft bleibt unangetastet: ein zwischengespeicherter Fehlschlag
  // waere von einer gueltigen Antwort nicht mehr zu unterscheiden.
  if (url.origin !== self.location.origin) return;

  // Unveraenderliche Bibliotheken zuerst aus dem Cache: das spart bei jedem
  // Start Zeit und Datenvolumen.
  if (isVendor(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) (await caches.open(CACHE)).put(request, response.clone()).catch(() => {});
      return response;
    })());
    return;
  }

  // Alles andere zuerst aus dem Netz. Andernfalls bliebe eine einmal
  // ausgelieferte Fassung auf dem Geraet stehen und keine Korrektur kaeme je an.
  event.respondWith((async () => {
    try {
      const response = await fromNetworkWithTimeout(request);
      if (response.ok) (await caches.open(CACHE)).put(request, response.clone()).catch(() => {});
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        const shell = await caches.match("./index.html");
        if (shell) return shell;
      }
      throw error;
    }
  })());
});

self.addEventListener("message", event => {
  if (event.data === "version") event.source?.postMessage({version: VERSION});
});
