/*
 * Service worker de «TransMilenio en vivo».
 *
 * El shell (HTML, JS, CSS, íconos) se guarda para que la app abra sin red, como
 * una app instalada. Las posiciones de los buses nunca se cachean: mostrar una
 * posición vieja como si fuera actual es peor que decir «sin conexión». Las
 * teselas del mapa son de otro origen y van directo a la red.
 */
const VERSION = "transmi-v1";

const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

const LIVE = ["/api/", "/socket.io/", "/health"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (LIVE.some((path) => url.pathname.startsWith(path))) return;

  // Navegar: red primero para estrenar cada build, cache cuando no hay red.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() =>
          caches.match("/index.html").then((hit) => hit || new Response("Sin conexión", { status: 503 })),
        ),
    );
    return;
  }

  // Assets con hash: cache primero; se rellena en la primera visita.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
