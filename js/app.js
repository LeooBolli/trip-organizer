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
    // utente autenticato -> carica la lista viaggi, le voci
    // personalizzate e prova a scoprire l'id dell'altra persona
    // (richiedono tutte una sessione valida per RLS)
    Trips.load();
    CustomOptions.init();
    Auth.discoverOtherUserId().then(() => Expenses.populatePaidBySelect());
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  }
});
