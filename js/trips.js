// ============================================================
// Gestione viaggi (CRUD + archivio)
// ============================================================
const Trips = {
  list: [],
  activeTrip: null,
  autoOpenAttempted: false,

  async init() {
    document.getElementById("new-trip-form").addEventListener("submit", (e) => this.create(e));
    document.getElementById("back-to-trips").addEventListener("click", () => this.showList());
    document.getElementById("archive-trip-btn").addEventListener("click", () => this.toggleArchive());
    document.getElementById("delete-trip-btn").addEventListener("click", () => this.remove());
    document.getElementById("show-archived-toggle").addEventListener("change", () => this.render());
    document.getElementById("trip-emoji-edit").addEventListener("click", () => this.editEmoji());

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
    const showArchived = document.getElementById("show-archived-toggle").checked;
    const container = document.getElementById("trips-list");
    container.innerHTML = "";

    const filtered = this.list.filter(t => showArchived ? t.archived : !t.archived);

    if (filtered.length === 0) {
      container.innerHTML = `<p class="empty-state">${showArchived ? "Nessun viaggio archiviato." : "Nessun viaggio ancora. Creane uno qui sotto!"}</p>`;
      return;
    }

    for (const trip of filtered) {
      const card = document.createElement("button");
      card.className = "trip-card";
      card.innerHTML = `
        <span class="trip-emoji">${escapeHtml(trip.emoji || "🧳")}</span>
        <span class="trip-info">
          <strong>${escapeHtml(trip.name)}</strong>
          <small>${escapeHtml(trip.destination || "")} ${trip.start_date ? "· " + escapeHtml(formatDate(trip.start_date)) : ""}</small>
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
    const emoji = document.getElementById("trip-emoji").value.trim() || "🧳";

    if (!name) return;

    const { error } = await supabaseClient.from("trips").insert({
      name, destination, start_date, end_date, base_currency, emoji,
      created_by: Auth.currentUser.id
    });

    if (error) { alert("Errore creazione viaggio: " + error.message); return; }
    e.target.reset();
    document.getElementById("trip-currency").value = window.APP_CONFIG.DEFAULT_BASE_CURRENCY;
  },

  async open(trip) {
    this.activeTrip = trip;
    document.getElementById("view-trips").classList.add("hidden");
    document.getElementById("view-trip-detail").classList.remove("hidden");
    document.getElementById("trip-emoji-edit").textContent = trip.emoji || "🧳";
    document.getElementById("trip-detail-title").textContent = trip.name;
    document.getElementById("archive-trip-btn").textContent = trip.archived ? "Riattiva viaggio" : "Archivia viaggio";
    await Expenses.openForTrip(trip);
    await Bookings.openForTrip(trip);
    await Itinerary.openForTrip(trip);
    await Packing.openForTrip(trip);
    Jetlag.openForTrip(trip);
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
  },

  async editEmoji() {
    const trip = this.activeTrip;
    if (!trip) return;
    const input = prompt("Nuova icona per il viaggio (incolla un'emoji):", trip.emoji || "🧳");
    if (input === null) return;
    const emoji = input.trim() || "🧳";

    trip.emoji = emoji;
    document.getElementById("trip-emoji-edit").textContent = emoji;

    const { error } = await supabaseClient.from("trips").update({ emoji }).eq("id", trip.id);
    if (error) alert(error.message);
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
