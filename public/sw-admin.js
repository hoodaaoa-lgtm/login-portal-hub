/**
 * Service Worker exclusivo do PWA "Hooda Admin".
 *
 * Importante: este SW é registado com scope "/hdequipa9x2/", por isso só
 * controla pedidos dentro dessa rota — nunca interfere com o Service
 * Worker principal do site (public/sw.js, scope "/"), que continua a
 * servir todas as outras páginas normalmente.
 *
 * Cache isolada (nome próprio) para não colidir com a cache do PWA
 * principal nem ser apagada por engano quando um deles faz limpeza.
 */
const CACHE_NAME = "hooda-admin-v1";
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  "/hdequipa9x2",
  "/hdequipa9x2-manifest.webmanifest",
  OFFLINE_URL,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("hooda-admin-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.hostname !== self.location.hostname) return;
  // Nunca cachear chamadas à API/autenticação — precisam de estar sempre frescas.
  if (url.pathname.startsWith("/rest/") || url.pathname.startsWith("/auth/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === "navigate") return caches.match(OFFLINE_URL);
          return new Response("", { status: 503 });
        })
      )
  );
});
