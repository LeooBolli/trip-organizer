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
  Todos.init();
  ExportModule.init();

  Auth.init(() => {
    // utente autenticato -> carica la lista viaggi e le voci
    // personalizzate (richiedono entrambe una sessione valida per RLS)
    Trips.load();
    CustomOptions.init();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  }
});
