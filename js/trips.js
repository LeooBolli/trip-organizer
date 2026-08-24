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
    document.getElementById("edit-trip-form").addEventListener("submit", (e) => this.saveEdit(e));
    document.getElementById("show-archived-toggle").addEventListener("change", () => this.render());
    document.getElementById("trip-emoji-edit").addEventListener("click", () => this.editEmoji());
    document.getElementById("trips-carousel-prev").addEventListener("click", () => this.scrollCarouselBy(-1));
    document.getElementById("trips-carousel-next").addEventListener("click", () => this.scrollCarouselBy(1));

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
    const nav = document.getElementById("trips-carousel-nav");
    const dotsWrap = document.getElementById("trips-carousel-dots");
    container.innerHTML = "";
    dotsWrap.innerHTML = "";

    const filtered = this.list.filter(t => showArchived ? t.archived : !t.archived);

    if (filtered.length === 0) {
      container.innerHTML = `<p class="empty-state">${showArchived ? "Nessun viaggio archiviato." : "Nessun viaggio ancora. Creane uno qui sotto!"}</p>`;
      nav.classList.add("hidden");
      return;
    }

    nav.classList.toggle("hidden", filtered.length < 2);

    const gradients = TRIP_CARD_GRADIENTS;
    filtered.forEach((trip, idx) => {
      const card = document.createElement("button");
      card.className = "trip-hero-card";
      card.style.background = gradients[idx % gradients.length];
      card.innerHTML = `
        <span class="trip-hero-emoji-bg">${escapeHtml(trip.emoji || "🧳")}</span>
        <span class="trip-hero-emoji">${escapeHtml(trip.emoji || "🧳")}</span>
        <span class="trip-hero-info">
          <strong>${escapeHtml(trip.name)}</strong>
          <span>${escapeHtml(trip.destination || "")}</span>
          ${trip.start_date ? `<small>${escapeHtml(formatDate(trip.start_date))}${trip.end_date ? " – " + escapeHtml(formatDate(trip.end_date)) : ""}</small>` : ""}
        </span>
      `;
      card.addEventListener("click", () => this.open(trip));
      container.appendChild(card);

      const dot = document.createElement("span");
      dot.className = "carousel-dot" + (idx === 0 ? " active" : "");
      dot.addEventListener("click", () => this.scrollCarouselTo(idx));
      dotsWrap.appendChild(dot);
    });

    let scrollTimer = null;
    container.onscroll = () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => this.updateActiveDot(), 100);
    };
  },

  scrollCarouselBy(direction) {
    const container = document.getElementById("trips-list");
    const dots = document.querySelectorAll("#trips-carousel-dots .carousel-dot");
    const activeIdx = [...dots].findIndex(d => d.classList.contains("active"));
    const nextIdx = Math.max(0, Math.min(container.children.length - 1, (activeIdx === -1 ? 0 : activeIdx) + direction));
    this.scrollCarouselTo(nextIdx);
  },

  scrollCarouselTo(idx) {
    const container = document.getElementById("trips-list");
    const card = container.children[idx];
    if (card) card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  },

  updateActiveDot() {
    const container = document.getElementById("trips-list");
    const dots = document.querySelectorAll("#trips-carousel-dots .carousel-dot");
    if (dots.length === 0) return;
    const containerCenter = container.scrollLeft + container.clientWidth / 2;
    let closestIdx = 0, closestDist = Infinity;
    [...container.children].forEach((card, idx) => {
      const dist = Math.abs((card.offsetLeft + card.offsetWidth / 2) - containerCenter);
      if (dist < closestDist) { closestDist = dist; closestIdx = idx; }
    });
    dots.forEach((d, i) => d.classList.toggle("active", i === closestIdx));
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

    document.getElementById("edit-trip-name").value = trip.name || "";
    document.getElementById("edit-trip-destination").value = trip.destination || "";
    document.getElementById("edit-trip-start").value = trip.start_date || "";
    document.getElementById("edit-trip-end").value = trip.end_date || "";
    document.getElementById("edit-trip-currency").value = trip.base_currency;
    await Expenses.openForTrip(trip);
    await Bookings.openForTrip(trip);
    await Itinerary.openForTrip(trip);
    await Packing.openForTrip(trip);
    Jetlag.openForTrip(trip);
    await Todos.openForTrip(trip);
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

// Gradienti alternati per le card viaggio nel carosello, stessa palette
// navy/arancio dell'app
const TRIP_CARD_GRADIENTS = [
  "linear-gradient(135deg, #16283A 0%, #1F3245 100%)",
  "linear-gradient(135deg, #D97324 0%, #EE8F45 100%)",
  "linear-gradient(135deg, #10233F 0%, #2C4A6E 100%)",
  "linear-gradient(135deg, #7A3B1E 0%, #B85412 100%)"
];
