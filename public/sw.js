const CACHE_NAME = "hooda-v1";
const STATIC_ASSETS = [
  "/",
  "/home",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Instalar — faz cache dos recursos estáticos
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Ativar — limpa caches antigas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback para cache
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Só interceta GET
  if (request.method !== "GET") return;

  // Ignora requests de APIs externas (Supabase, Cloudinary)
  const url = new URL(request.url);
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("cloudinary.com") ||
    url.hostname.includes("anthropic.com")
  ) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Guarda em cache se for resposta válida
        if (response && response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
