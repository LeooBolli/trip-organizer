// ============================================================
// Gestione viaggi (CRUD + archivio)
// ============================================================
const Trips = {
  list: [],
  activeTrip: null,
  // ultimo viaggio aperto: le voci di navigazione ci riportano lì
  lastTrip: null,
  autoOpenAttempted: false,

  async init() {
    document.getElementById("new-trip-form").addEventListener("submit", (e) => this.create(e));
    document.getElementById("back-to-trips").addEventListener("click", () => this.showList());
    document.getElementById("archive-trip-btn").addEventListener("click", () => this.toggleArchive());
    document.getElementById("delete-trip-btn").addEventListener("click", () => this.remove());
    document.getElementById("edit-trip-form").addEventListener("submit", (e) => this.saveEdit(e));
    document.getElementById("show-archived-toggle").addEventListener("change", () => this.render());
    document.getElementById("trip-emoji-edit").addEventListener("click", () => this.editEmoji());
    document.getElementById("trip-flags-btn").addEventListener("click", () => this.pickNewTripFlags());
    document.getElementById("currency-rate-add-btn").addEventListener("click", () => this.addCurrencyRate());

    supabaseClient
      .channel("trips-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => this.load())
      .subscribe();

    await this.load();
  },

  async load() {
    const { data, error } = await supabaseClient.from("trips").select("*").order("start_date", { ascending: false });
    if (error) { console.error(error); return; }
    this.list = data;
    if (this.lastTrip) this.lastTrip = data.find(t => t.id === this.lastTrip.id) || null;
    this.render();

    if (!this.autoOpenAttempted) {
      this.autoOpenAttempted = true;
      if (!this.activeTrip) {
        const active = this.list.filter(t => !t.archived);
        if (active.length > 0) {
          const latest = active.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b);
          this.open(latest);
        }
      }
    }
  },

  render() {
    WorldMap.update();
    const showArchived = document.getElementById("show-archived-toggle").checked;
    const container = document.getElementById("trips-list");
    container.innerHTML = "";

    const filtered = this.list.filter(t => showArchived ? t.archived : !t.archived);
    document.getElementById("trips-count").textContent = filtered.length ? `(${filtered.length})` : "";

    if (filtered.length === 0) {
      container.innerHTML = showArchived
        ? `<p class="empty-state">Nessun viaggio archiviato.</p>`
        : `<p class="empty-state">Nessun viaggio ancora: crea il primo qui sopra.</p>`;
      return;
    }

    for (const trip of filtered) {
      const status = tripStatus(trip);
      const days = trip.start_date && trip.end_date ? daysBetween(trip.start_date, trip.end_date) + 1 : 0;
      const card = document.createElement("button");
      card.type = "button";
      card.className = `trip-ticket ${status.cls}`;
      card.innerHTML = `
        <span class="ticket-flags">${renderTripIcon(trip.emoji)}</span>
        <span class="ticket-info">
          <strong>${escapeHtml(trip.name)}</strong>
          ${trip.destination ? `<small>${escapeHtml(trip.destination)}</small>` : ""}
        </span>
        <span class="ticket-route">
          ${ticketDate(trip.start_date, "Partenza")}
          <span class="ticket-mid">
            <small>${days ? "Durata" : "&nbsp;"}</small>
            <b>${days ? `${days} ${days === 1 ? "giorno" : "giorni"}` : "—"}</b>
            <i class="ticket-line"></i>
          </span>
          ${ticketDate(trip.end_date, "Ritorno")}
        </span>
        <span class="ticket-side">
          <span class="ticket-status">${escapeHtml(status.label)}</span>
          <span class="ticket-cta">Apri</span>
        </span>
      `;
      card.addEventListener("click", () => this.open(trip));
      container.appendChild(card);
    }
  },

  async create(e) {
    e.preventDefault();
    const name = document.getElementById("trip-name").value.trim();
    const destination = document.getElementById("trip-destination").value.trim();
    const start_date = document.getElementById("trip-start").value || null;
    const end_date = document.getElementById("trip-end").value || null;
    const base_currency = document.getElementById("trip-currency").value;
    const emoji = document.getElementById("trip-emoji").value || "🧳";

    if (!name) return;

    const { error } = await supabaseClient.from("trips").insert({
      name, destination, start_date, end_date, base_currency, emoji,
      created_by: Auth.currentUser.id
    });

    if (error) { alert("Errore creazione viaggio: " + error.message); return; }
    e.target.reset();
    document.getElementById("trip-emoji").value = "";
    document.getElementById("trip-flags-btn").textContent = "🏳️ Bandiere";
    document.getElementById("trip-currency").value = window.APP_CONFIG.DEFAULT_BASE_CURRENCY;
    const status = document.getElementById("new-trip-status");
    status.textContent = `✓ "${name}" creato`;
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => { status.textContent = ""; }, 4000);
    await this.load();
  },

  async open(trip) {
    this.activeTrip = trip;
    this.lastTrip = trip;
    document.getElementById("view-settings").classList.add("hidden");
    document.getElementById("view-trips").classList.add("hidden");
    document.getElementById("view-trip-detail").classList.remove("hidden");
    document.getElementById("trip-emoji-edit").innerHTML = renderTripIcon(trip.emoji);
    document.getElementById("trip-detail-title").textContent = trip.name;
    Nav.renderTripHero(trip);
    document.getElementById("archive-trip-btn").textContent = trip.archived ? "Riattiva viaggio" : "Archivia viaggio";

    document.getElementById("edit-trip-name").value = trip.name || "";
    document.getElementById("edit-trip-destination").value = trip.destination || "";
    document.getElementById("edit-trip-start").value = trip.start_date || "";
    document.getElementById("edit-trip-end").value = trip.end_date || "";
    document.getElementById("edit-trip-currency").value = trip.base_currency;
    this.renderCurrencyRates();
    await Expenses.openForTrip(trip);
    await Bookings.openForTrip(trip);
    await Itinerary.openForTrip(trip);
    await Packing.openForTrip(trip);
    Jetlag.openForTrip(trip);
    await Todos.openForTrip(trip);
    Dashboard.openForTrip(trip);
  },

  showList() {
    this.activeTrip = null;
    document.getElementById("view-trip-detail").classList.add("hidden");
    document.getElementById("view-trips").classList.remove("hidden");
  },

  async toggleArchive() {
    const trip = this.activeTrip;
    const { error } = await supabaseClient.from("trips").update({ archived: !trip.archived }).eq("id", trip.id);
    if (error) { alert(error.message); return; }
    this.showList();
  },

  async saveEdit(e) {
    e.preventDefault();
    const trip = this.activeTrip;
    if (!trip) return;

    const name = document.getElementById("edit-trip-name").value.trim();
    if (!name) return;
    const destination = document.getElementById("edit-trip-destination").value.trim();
    const start_date = document.getElementById("edit-trip-start").value || null;
    const end_date = document.getElementById("edit-trip-end").value || null;
    const base_currency = document.getElementById("edit-trip-currency").value;

    const { error } = await supabaseClient.from("trips")
      .update({ name, destination, start_date, end_date, base_currency })
      .eq("id", trip.id);
    if (error) { alert("Errore salvataggio modifiche: " + error.message); return; }

    trip.name = name;
    trip.destination = destination;
    trip.start_date = start_date;
    trip.end_date = end_date;
    trip.base_currency = base_currency;
    document.getElementById("trip-detail-title").textContent = name;
    Nav.renderTripHero(trip);
    Nav.sync();
    await this.load();
  },

  async remove() {
    const trip = this.activeTrip;
    if (!trip) return;
    const confirmName = prompt(`Per eliminare definitivamente "${trip.name}" (spese, prenotazioni, itinerario e valigie comprese), scrivi il nome del viaggio qui sotto:`);
    if (confirmName === null) return;
    if (confirmName.trim().toLowerCase() !== trip.name.trim().toLowerCase()) {
      alert("Nome non corrispondente, eliminazione annullata.");
      return;
    }

    const { error } = await supabaseClient.from("trips").delete().eq("id", trip.id);
    if (error) { alert("Errore eliminazione viaggio: " + error.message); return; }
    this.showList();
    this.lastTrip = null;
    Nav.sync();
  },

  async pickNewTripFlags() {
    const hidden = document.getElementById("trip-emoji");
    const result = await FlagPicker.open(hidden.value);
    if (result === null) return;
    hidden.value = result;
    document.getElementById("trip-flags-btn").textContent = result || "🏳️ Bandiere";
  },

  async editEmoji() {
    const trip = this.activeTrip;
    if (!trip) return;
    const result = await FlagPicker.open(trip.emoji);
    if (result === null) return;
    const emoji = result || "🧳";

    trip.emoji = emoji;
    document.getElementById("trip-emoji-edit").innerHTML = renderTripIcon(emoji);
    Nav.sync();

    const { error } = await supabaseClient.from("trips").update({ emoji }).eq("id", trip.id);
    if (error) alert(error.message);
  },

  renderCurrencyRates() {
    const trip = this.activeTrip;
    if (!trip) return;
    const container = document.getElementById("currency-rates-list");
    const rates = trip.exchange_rates || {};
    const entries = Object.entries(rates);
    container.innerHTML = "";

    if (entries.length === 0) {
      container.innerHTML = `<p class="empty-state">Nessun cambio fisso impostato: durante l'inserimento della spesa dovrai indicarlo a mano.</p>`;
    } else {
      for (const [code, rate] of entries) {
        const row = document.createElement("div");
        row.className = "currency-rate-row";
        row.innerHTML = `
          <strong>${escapeHtml(code)}</strong>
          <span>1 ${escapeHtml(code)} = ${escapeHtml(String(rate))} ${escapeHtml(trip.base_currency)}</span>
          <button type="button" class="icon-btn remove-currency-rate" title="Rimuovi">✕</button>
        `;
        row.querySelector(".remove-currency-rate").addEventListener("click", () => this.removeCurrencyRate(code));
        container.appendChild(row);
      }
    }
  },

  async addCurrencyRate() {
    const trip = this.activeTrip;
    if (!trip) return;
    const code = document.getElementById("currency-rate-code").value;
    const value = parseFloat(document.getElementById("currency-rate-value").value);
    if (!code || !value || value <= 0) return;
    if (code === trip.base_currency) { alert("Non serve un cambio per la valuta base del viaggio."); return; }

    const rates = { ...(trip.exchange_rates || {}), [code]: value };
    const { error } = await supabaseClient.from("trips").update({ exchange_rates: rates }).eq("id", trip.id);
    if (error) { alert("Errore salvataggio cambio: " + error.message); return; }

    trip.exchange_rates = rates;
    document.getElementById("currency-rate-value").value = "";
    this.renderCurrencyRates();
  },

  async removeCurrencyRate(code) {
    const trip = this.activeTrip;
    if (!trip) return;
    const rates = { ...(trip.exchange_rates || {}) };
    delete rates[code];
    const { error } = await supabaseClient.from("trips").update({ exchange_rates: rates }).eq("id", trip.id);
    if (error) { alert(error.message); return; }

    trip.exchange_rates = rates;
    this.renderCurrencyRates();
  }
};

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function formatMoney(amount, currency) {
  const code = currency || "EUR";
  try {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: code }).format(amount);
  } catch (err) {
    // Codici valuta molto recenti (es. XCG, introdotto nel 2025) potrebbero
    // non essere ancora riconosciuti su dispositivi con iOS/Safari datati.
    return `${(amount ?? 0).toFixed(2)} ${code}`;
  }
}

// Stato del viaggio rispetto a oggi (per biglietti e intestazione)
function tripStatus(trip) {
  if (!trip.start_date) return { label: "Senza date", cls: "" };
  const today = localISO();
  const end = trip.end_date || trip.start_date;
  if (today < trip.start_date) {
    const d = daysBetween(today, trip.start_date);
    return { label: d === 1 ? "Domani" : `Tra ${d} giorni`, cls: "is-upcoming" };
  }
  if (today <= end) return { label: `In corso · giorno ${daysBetween(trip.start_date, today) + 1}`, cls: "is-live" };
  return { label: "Concluso", cls: "is-past" };
}

// Data in stile biglietto: giorno grande, mese e anno sotto
function ticketDate(iso, label) {
  if (!iso) return `<span class="ticket-date"><small>${label}</small><b>—</b><small>&nbsp;</small></span>`;
  const d = new Date(iso + "T00:00:00");
  const day = d.toLocaleDateString("it-IT", { day: "2-digit" });
  const month = d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "");
  return `<span class="ticket-date"><small>${label}</small><b>${day} ${escapeHtml(month)}</b><small>${d.getFullYear()}</small></span>`;
}
