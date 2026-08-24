// ============================================================
// Itinerario giorno per giorno: tappe con orario, tempo di
// spostamento verso la tappa successiva e costo opzionale
// (convertibile in spesa condivisa).
// ============================================================
const Itinerary = {
  trip: null,
  list: [],
  channel: null,
  selectedLocation: null, // { address, lat, lng }
  searchDebounceTimer: null,
  mapInstances: new Map(), // itemId -> Leaflet map
  markerIcon: null,

  async openForTrip(trip) {
    this.trip = trip;
    document.getElementById("itinerary-currency").value = trip.base_currency;
    document.getElementById("itinerary-day").value = trip.start_date || new Date().toISOString().slice(0, 10);
    this.toggleExchangeRateField();

    if (this.channel) supabaseClient.removeChannel(this.channel);
    this.channel = supabaseClient
      .channel("itinerary-" + trip.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "itinerary_items", filter: `trip_id=eq.${trip.id}` }, () => this.load())
      .subscribe();

    await this.load();
  },

  init() {
    this.markerIcon = L.icon({
      iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
      iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    document.getElementById("new-itinerary-form").addEventListener("submit", (e) => this.create(e));
    document.getElementById("itinerary-currency").addEventListener("change", () => this.toggleExchangeRateField());

    const searchInput = document.getElementById("itinerary-search");
    searchInput.addEventListener("input", () => {
      clearTimeout(this.searchDebounceTimer);
      const q = searchInput.value.trim();
      if (q.length < 3) {
        this.renderSearchResults([]);
        return;
      }
      this.searchDebounceTimer = setTimeout(() => this.searchPlace(q), 500);
    });

    document.getElementById("itinerary-location-clear").addEventListener("click", () => {
      this.selectedLocation = null;
      document.getElementById("itinerary-location-preview").classList.add("hidden");
      searchInput.value = "";
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#tab-itinerary .location-search-wrapper")) {
        this.renderSearchResults([]);
      }
    });
  },

  toggleExchangeRateField() {
    const isBase = document.getElementById("itinerary-currency").value === this.trip.base_currency;
    document.getElementById("itinerary-exchange-rate-wrapper").classList.toggle("hidden", isBase);
  },

  async searchPlace(query) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { "Accept-Language": "it" } });
      const results = await res.json();
      this.renderSearchResults(results);
    } catch (err) {
      console.error("Errore ricerca luogo:", err);
    }
  },

  renderSearchResults(results) {
    const box = document.getElementById("itinerary-search-results");
    box.innerHTML = "";
    if (!results || results.length === 0) {
      box.classList.add("hidden");
      return;
    }
    for (const r of results) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "search-result-item";
      item.textContent = r.display_name;
      item.addEventListener("click", () => this.selectPlace(r));
      box.appendChild(item);
    }
    box.classList.remove("hidden");
  },

  selectPlace(place) {
    this.selectedLocation = {
      address: place.display_name,
      lat: parseFloat(place.lat),
      lng: parseFloat(place.lon)
    };
    document.getElementById("itinerary-search").value = "";
    this.renderSearchResults([]);
    document.getElementById("itinerary-location-text").textContent = place.display_name;
    document.getElementById("itinerary-location-preview").classList.remove("hidden");

    const titleInput = document.getElementById("itinerary-title");
    if (!titleInput.value.trim()) {
      titleInput.value = (place.name || place.display_name.split(",")[0]);
    }
  },

  async load() {
    const { data, error } = await supabaseClient
      .from("itinerary_items")
      .select("*")
      .eq("trip_id", this.trip.id)
      .order("day", { ascending: true })
      .order("position", { ascending: true });
    if (error) { console.error(error); return; }
    this.list = data;
    this.render();
  },

  async create(e) {
    e.preventDefault();
    const day = document.getElementById("itinerary-day").value;
    if (!day) return;
    const title = document.getElementById("itinerary-title").value.trim();
    if (!title) return;
    const type = document.getElementById("itinerary-type").value;
    const start_datetime = document.getElementById("itinerary-start").value || null;
    const end_datetime = document.getElementById("itinerary-end").value || null;
    const travelMinutesRaw = document.getElementById("itinerary-travel-minutes").value;
    const travel_minutes_to_next = travelMinutesRaw ? parseInt(travelMinutesRaw, 10) : null;
    const transport_mode = document.getElementById("itinerary-transport-mode").value || null;
    const costRaw = document.getElementById("itinerary-cost").value;
    const cost = costRaw ? parseFloat(costRaw) : null;
    const currency = document.getElementById("itinerary-currency").value;
    const exchange_rate = currency === this.trip.base_currency
      ? 1
      : parseFloat(document.getElementById("itinerary-rate").value || "1");
    const notes = document.getElementById("itinerary-notes").value.trim();

    const itemsSameDay = this.list.filter(i => i.day === day);
    const position = itemsSameDay.length > 0 ? Math.max(...itemsSameDay.map(i => i.position)) + 1 : 0;

    const { error } = await supabaseClient.from("itinerary_items").insert({
      trip_id: this.trip.id, day, position, type, title,
      start_datetime, end_datetime, travel_minutes_to_next, transport_mode,
      cost, currency: cost ? currency : null, exchange_rate,
      address: this.selectedLocation ? this.selectedLocation.address : null,
      latitude: this.selectedLocation ? this.selectedLocation.lat : null,
      longitude: this.selectedLocation ? this.selectedLocation.lng : null,
      notes,
      created_by: Auth.currentUser.id
    });

    if (error) { alert("Errore salvataggio tappa: " + error.message); return; }
    e.target.reset();
    document.getElementById("itinerary-day").value = day;
    document.getElementById("itinerary-currency").value = this.trip.base_currency;
    this.toggleExchangeRateField();
    this.selectedLocation = null;
    document.getElementById("itinerary-location-preview").classList.add("hidden");
    await this.load();
  },

  async remove(id) {
    if (!confirm("Eliminare questa tappa?")) return;
    const { error } = await supabaseClient.from("itinerary_items").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    await this.load();
  },

  async move(item, direction) {
    const siblings = this.list.filter(i => i.day === item.day).sort((a, b) => a.position - b.position);
    const idx = siblings.findIndex(i => i.id === item.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const other = siblings[swapIdx];

    await Promise.all([
      supabaseClient.from("itinerary_items").update({ position: other.position }).eq("id", item.id),
      supabaseClient.from("itinerary_items").update({ position: item.position }).eq("id", other.id)
    ]);
    await this.load();
  },

  async addAsExpense(item) {
    if (!item.cost) return;
    const { data: expense, error } = await supabaseClient.from("expenses").insert({
      trip_id: this.trip.id,
      description: item.title,
      category: "altro",
      amount: item.cost,
      currency: item.currency || this.trip.base_currency,
      exchange_rate: item.exchange_rate || 1,
      payer_share_percent: 50,
      paid_by: Auth.currentUser.id,
      expense_date: item.day
    }).select().single();

    if (error) { alert("Errore creazione spesa: " + error.message); return; }

    const { error: updateError } = await supabaseClient
      .from("itinerary_items")
      .update({ expense_id: expense.id })
      .eq("id", item.id);
    if (updateError) { alert(updateError.message); return; }
    await this.load();
    await Expenses.load();
  },

  render() {
    for (const map of this.mapInstances.values()) map.remove();
    this.mapInstances.clear();

    const container = document.getElementById("itinerary-days");
    container.innerHTML = "";

    if (this.list.length === 0) {
      container.innerHTML = `<p class="empty-state">Nessuna tappa ancora. Aggiungine una qui sopra!</p>`;
      return;
    }

    const days = [...new Set(this.list.map(i => i.day))].sort();

    for (const day of days) {
      const items = this.list.filter(i => i.day === day).sort((a, b) => a.position - b.position);
      const dayTotal = items.reduce((sum, i) => sum + (i.cost ? i.cost * (i.exchange_rate || 1) : 0), 0);

      const group = document.createElement("div");
      group.className = "card itinerary-day-card";

      const header = document.createElement("div");
      header.className = "card-header";
      header.innerHTML = `
        <h3>${escapeHtml(formatDate(day))}</h3>
        ${dayTotal > 0 ? `<span class="card-sub">${escapeHtml(formatMoney(dayTotal, this.trip.base_currency))}</span>` : ""}
      `;
      group.appendChild(header);

      const list = document.createElement("div");
      list.className = "itinerary-item-list";

      items.forEach((item, idx) => {
        list.appendChild(this.renderItem(item, idx === 0, idx === items.length - 1));
        if (item.travel_minutes_to_next && idx < items.length - 1) {
          const connector = document.createElement("div");
          connector.className = "itinerary-connector";
          connector.innerHTML = `${TRANSPORT_ICONS[item.transport_mode] || "➡️"} ${item.travel_minutes_to_next} min`;
          list.appendChild(connector);
        }
      });

      group.appendChild(list);
      container.appendChild(group);
    }
  },

  renderItem(item, isFirst, isLast) {
    const el = document.createElement("div");
    el.className = "itinerary-item";
    const icon = ITINERARY_TYPE_ICONS[item.type] || "📌";
    const timeRange = [item.start_datetime, item.end_datetime]
      .filter(Boolean)
      .map(d => new Date(d).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }))
      .join(" – ");

    const hasLocation = item.latitude != null && item.longitude != null;
    const mapId = `itinerary-map-${item.id}`;

    el.innerHTML = `
      <div class="itinerary-item-header">
        <span class="booking-icon">${icon}</span>
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(timeRange)}</small>
        </div>
        <div class="itinerary-item-actions">
          <button class="icon-btn move-up" title="Sposta su">▲</button>
          <button class="icon-btn move-down" title="Sposta giù">▼</button>
          <button class="icon-btn delete-itinerary-item" title="Elimina">✕</button>
        </div>
      </div>
      ${hasLocation ? `<div class="booking-address">📍 ${escapeHtml(item.address || "")}</div><div id="${mapId}" class="booking-map"></div>` : ""}
      ${item.notes ? `<div class="booking-notes">${escapeHtml(item.notes)}</div>` : ""}
      ${item.cost ? `
        <div class="itinerary-cost-row">
          <span>${escapeHtml(formatMoney(item.cost, item.currency || this.trip.base_currency))}</span>
          ${item.expense_id
            ? `<span class="tag-default">Aggiunta alle spese</span>`
            : `<button type="button" class="secondary-btn btn-sm add-as-expense">Aggiungi come spesa</button>`}
        </div>
      ` : ""}
    `;

    el.querySelector(".delete-itinerary-item").addEventListener("click", () => this.remove(item.id));
    el.querySelector(".move-up").addEventListener("click", () => this.move(item, -1));
    el.querySelector(".move-down").addEventListener("click", () => this.move(item, 1));
    if (isFirst) el.querySelector(".move-up").disabled = true;
    if (isLast) el.querySelector(".move-down").disabled = true;
    const addExpenseBtn = el.querySelector(".add-as-expense");
    if (addExpenseBtn) addExpenseBtn.addEventListener("click", () => this.addAsExpense(item));

    if (hasLocation) {
      requestAnimationFrame(() => {
        const map = L.map(mapId, { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false })
          .setView([item.latitude, item.longitude], 15);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19
        }).addTo(map);
        L.marker([item.latitude, item.longitude], { icon: this.markerIcon }).addTo(map);
        this.mapInstances.set(item.id, map);
      });
    }

    return el;
  }
};

const ITINERARY_TYPE_ICONS = {
  attraction: "🎫", transport: "🚌", meal: "🍽️", accommodation: "🏨", free_time: "🌤️", other: "📌"
};
const TRANSPORT_ICONS = {
  walk: "🚶", car: "🚗", public: "🚆", taxi: "🚕", bike: "🚲"
};
