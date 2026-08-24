// ============================================================
// Service worker: rete prima di tutto (contenuti sempre aggiornati
// quando c'è connessione), cache solo come riserva se sei offline.
// Le chiamate a Supabase (dati, auth, storage) NON vengono mai
// toccate/messe in cache.
// ============================================================
// Cambiare questo nome ad ogni modifica di app shell/stile: forza il
// browser a scaricare i file nuovi invece di servire quelli in cache.
const CACHE_NAME = "trip-organizer-v12";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/config.js",
  "./js/supabaseClient.js",
  "./js/theme.js",
  "./js/auth.js",
  "./js/customOptions.js",
  "./js/trips.js",
  "./js/expenses.js",
  "./js/bookings.js",
  "./js/itinerary.js",
  "./js/packing.js",
  "./js/jetlag.js",
  "./js/todos.js",
  "./js/export.js",
  "./js/app.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Non toccare mai le chiamate verso Supabase o altri domini esterni
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
