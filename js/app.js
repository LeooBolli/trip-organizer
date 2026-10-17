// ============================================================
// Entry point - inizializzazione app
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  FlagPicker.init();
  WorldMap.init();
  Nav.init();
  Trips.init();
  Expenses.init();
  Bookings.init();
  Itinerary.init();
  Packing.init();
  Jetlag.init();
  Todos.init();
  ExportModule.init();
  Preferences.init();
  Dashboard.init();

  Auth.init((user) => {
    Nav.setUser(user);
    // utente autenticato -> carica la lista viaggi, le voci
    // personalizzate e prova a scoprire l'id dell'altra persona
    // (richiedono tutte una sessione valida per RLS)
    Trips.load();
    CustomOptions.init();
    Preferences.load();
    Auth.discoverOtherUserId().then(() => {
      Expenses.populatePaidBySelect();
      Dashboard.refresh();
    });
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  }
});
