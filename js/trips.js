// ============================================================
// Gestione viaggi (CRUD + archivio)
// ============================================================
const Trips = {
  list: [],
  activeTrip: null,

  async init() {
    document.getElementById("new-trip-form").addEventListener("submit", (e) => this.create(e));
    document.getElementById("back-to-trips").addEventListener("click", () => this.showList());
    document.getElementById("archive-trip-btn").addEventListener("click", () => this.toggleArchive());
    document.getElementById("show-archived-toggle").addEventListener("change", () => this.render());

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
    document.getElementById("trip-detail-title").textContent = `${trip.emoji} ${trip.name}`;
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
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: currency || "EUR" }).format(amount);
}
