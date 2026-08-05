const CACHE = "avenue-run-v4";
const CORE = ["/", "/manifest.webmanifest", "/icon.svg"];

async function cacheGame() {
  const cache = await caches.open(CACHE);
  await cache.addAll(CORE);
  const response = await fetch("/", { cache: "reload" });
  const html = await response.text();
  const assets = [...html.matchAll(/(?:src|href)=["'](\/[^"']+)["']/g)]
    .map((match) => match[1])
    .filter((url) => !url.startsWith("//"));
  await cache.addAll([...new Set(assets)]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheGame().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const request = event.request;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    })),
  );
});
