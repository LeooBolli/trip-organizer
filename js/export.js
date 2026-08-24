// ============================================================
// Export del viaggio in Excel (xlsx) - usa SheetJS caricato via CDN
// ============================================================
const ExportModule = {
  init() {
    document.getElementById("export-btn").addEventListener("click", () => this.exportTrip());
  },

  exportTrip() {
    const trip = Trips.activeTrip;
    if (!trip) return;

    const wb = XLSX.utils.book_new();

    const expenseRows = Expenses.list.map(exp => ({
      Data: exp.expense_date,
      Descrizione: exp.description,
      Categoria: CATEGORY_LABELS[exp.category] || exp.category,
      Importo: exp.amount,
      Valuta: exp.currency,
      "Cambio applicato": exp.exchange_rate,
      [`Importo in ${trip.base_currency}`]: +(exp.amount * exp.exchange_rate).toFixed(2),
      "Pagato da": Auth.otherUserLabel(exp.paid_by) === "Tu" ? Auth.currentUser.email : "Compagno/a",
      "% a carico del pagante": exp.payer_share_percent
    }));
    const expenseSheet = XLSX.utils.json_to_sheet(expenseRows);
    XLSX.utils.book_append_sheet(wb, expenseSheet, "Spese");

    const bookingRows = Bookings.list.map(b => ({
      Tipo: b.type,
      Titolo: b.title,
      Fornitore: b.provider,
      Inizio: b.start_datetime ? new Date(b.start_datetime).toLocaleString("it-IT") : "",
      Fine: b.end_datetime ? new Date(b.end_datetime).toLocaleString("it-IT") : "",
      "Codice prenotazione": b.confirmation_code,
      Note: b.notes
    }));
    const bookingSheet = XLSX.utils.json_to_sheet(bookingRows);
    XLSX.utils.book_append_sheet(wb, bookingSheet, "Prenotazioni");

    const me = Auth.currentUser.id;
    let owedToMe = 0, iOwe = 0;
    for (const exp of Expenses.list) {
      const baseAmount = exp.amount * exp.exchange_rate;
      const otherShare = baseAmount * (1 - exp.payer_share_percent / 100);
      if (exp.paid_by === me) owedToMe += otherShare; else iOwe += otherShare;
    }
    const totalBase = Expenses.list.reduce((s, e) => s + e.amount * e.exchange_rate, 0);
    const summarySheet = XLSX.utils.json_to_sheet([
      { Voce: "Spesa totale viaggio", Valore: `${totalBase.toFixed(2)} ${trip.base_currency}` },
      { Voce: "Saldo netto", Valore: `${(owedToMe - iOwe).toFixed(2)} ${trip.base_currency}` }
    ]);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Riepilogo");

    const fileName = `${trip.name.replace(/[^a-z0-9]+/gi, "_")}_export.xlsx`;
    XLSX.writeFile(wb, fileName);
  }
};
