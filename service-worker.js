const CACHE_VERSION = "epso-practice-v7";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles.css?v=19",
  "./app.js?v=19",
  "./data/questions-data.js",
  "./data/numerical-questions-data.js?v=15",
  "./data/abstract-questions-data.js?v=5",
  "./data/questions.json",
  "./data/numerical-questions.json",
  "./data/abstract-questions.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png"
];

async function discoverQuestionFigures() {
  const sources = ["./data/numerical-questions.json", "./data/abstract-questions.json"];
  const banks = await Promise.all(
    sources.map(async (source) => {
      const response = await fetch(source, { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to load ${source}`);
      return response.json();
    }),
  );

  return [...new Set(banks.flatMap((bank) => bank.flatMap((question) => question.figures || [])))];
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(CORE_ASSETS);
      const figures = await discoverQuestionFigures();
      await cache.addAll(figures);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || cache.match("./index.html");
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && new URL(request.url).origin === self.location.origin) {
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(event.request.mode === "navigate" ? networkFirst(event.request) : cacheFirst(event.request));
});
