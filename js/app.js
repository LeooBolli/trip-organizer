// ============================================================
// Entry point - inizializzazione app
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  Trips.init();
  Expenses.init();
  Bookings.init();
  Itinerary.init();
  Packing.init();
  Jetlag.init();
  ExportModule.init();

  Auth.init(() => {
    // utente autenticato -> carica la lista viaggi
    Trips.load();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  }
});
