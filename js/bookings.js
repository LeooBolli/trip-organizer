// ============================================================
// Gestione prenotazioni (voli, hotel, auto) + documenti allegati
// + ricerca luogo e mappa (OpenStreetMap / Leaflet, nessuna API key)
// ============================================================
const Bookings = {
  trip: null,
  list: [],
  channel: null,
  selectedLocation: null, // { address, lat, lng }
  searchDebounceTimer: null,
  mapInstances: new Map(), // bookingId -> Leaflet map, per pulizia al re-render

  // Icone di default di Leaflet caricate dal CDN (necessario quando si usa
  // la libreria via <script> invece che via bundler)
  markerIcon: null,

  async openForTrip(trip) {
    this.trip = trip;
    if (this.channel) supabaseClient.removeChannel(this.channel);
    this.channel = supabaseClient
      .channel("bookings-" + trip.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `trip_id=eq.${trip.id}` }, () => this.load())
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

    document.getElementById("new-booking-form").addEventListener("submit", (e) => this.create(e));

    const searchInput = document.getElementById("booking-search");
    searchInput.addEventListener("input", () => {
      clearTimeout(this.searchDebounceTimer);
      const q = searchInput.value.trim();
      if (q.length < 3) {
        this.renderSearchResults([]);
        return;
      }
      this.searchDebounceTimer = setTimeout(() => this.searchPlace(q), 500);
    });

    document.getElementById("booking-location-clear").addEventListener("click", () => {
      this.selectedLocation = null;
      document.getElementById("booking-location-preview").classList.add("hidden");
      searchInput.value = "";
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".location-search-wrapper")) {
        this.renderSearchResults([]);
      }
    });
  },

  // Ricerca luogo tramite Nominatim (OpenStreetMap), gratuito e senza API key.
  // Adatto a un uso personale/leggero come questo (max 1 richiesta al secondo).
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
    const box = document.getElementById("booking-search-results");
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

    document.getElementById("booking-search").value = "";
    this.renderSearchResults([]);

    document.getElementById("booking-location-text").textContent = place.display_name;
    document.getElementById("booking-location-preview").classList.remove("hidden");

    // Se il titolo è ancora vuoto, precompilalo con il nome del luogo trovato
    const titleInput = document.getElementById("booking-title");
    if (!titleInput.value.trim()) {
      titleInput.value = (place.name || place.display_name.split(",")[0]);
    }
  },

  async create(e) {
    e.preventDefault();
    const type = document.getElementById("booking-type").value;
    const title = document.getElementById("booking-title").value.trim();
    const provider = document.getElementById("booking-provider").value.trim();
    const start_datetime = document.getElementById("booking-start").value || null;
    const end_datetime = document.getElementById("booking-end").value || null;
    const confirmation_code = document.getElementById("booking-code").value.trim();
    const notes = document.getElementById("booking-notes").value.trim();
    const fileInput = document.getElementById("booking-file");

    if (!title) return;

    const { data: booking, error } = await supabaseClient.from("bookings").insert({
      trip_id: this.trip.id, type, title, provider,
      start_datetime, end_datetime, confirmation_code, notes,
      address: this.selectedLocation ? this.selectedLocation.address : null,
      latitude: this.selectedLocation ? this.selectedLocation.lat : null,
      longitude: this.selectedLocation ? this.selectedLocation.lng : null,
      created_by: Auth.currentUser.id
    }).select().single();

    if (error) { alert("Errore salvataggio prenotazione: " + error.message); return; }

    if (fileInput.files.length > 0) {
      await this.uploadDocument(booking.id, fileInput.files[0]);
    }

    e.target.reset();
    this.selectedLocation = null;
    document.getElementById("booking-location-preview").classList.add("hidden");
  },

  async uploadDocument(bookingId, file) {
    const path = `${this.trip.id}/${bookingId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabaseClient.storage.from("trip-documents").upload(path, file);
    if (uploadError) { alert("Errore upload documento: " + uploadError.message); return; }

    const { error } = await supabaseClient.from("documents").insert({
      booking_id: bookingId,
      file_path: path,
      file_name: file.name,
      uploaded_by: Auth.currentUser.id
    });
    if (error) alert(error.message);
    this.load();
  },

  async downloadDocument(path, fileName) {
    const { data, error } = await supabaseClient.storage.from("trip-documents").createSignedUrl(path, 60);
    if (error) { alert(error.message); return; }
    window.open(data.signedUrl, "_blank");
  },

  async removeBooking(id) {
    if (!confirm("Eliminare questa prenotazione e i documenti allegati?")) return;
    const { error } = await supabaseClient.from("bookings").delete().eq("id", id);
    if (error) alert(error.message);
  },

  render() {
    // Rimuove le mappe esistenti prima di ridisegnare la lista, altrimenti
    // Leaflet si aggancia a contenitori DOM ormai sostituiti
    for (const map of this.mapInstances.values()) map.remove();
    this.mapInstances.clear();

    const container = document.getElementById("bookings-list");
    container.innerHTML = "";

    if (this.list.length === 0) {
      container.innerHTML = `<p class="empty-state">Nessuna prenotazione ancora.</p>`;
      return;
    }

    for (const b of this.list) {
      const card = document.createElement("div");
      card.className = "booking-card";
      const icon = BOOKING_ICONS[b.type] || "📄";
      const dateRange = [b.start_datetime, b.end_datetime]
        .filter(Boolean)
        .map(d => new Date(d).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }))
        .join(" → ");

      const docsHtml = (b.documents || []).map(doc => `
        <button class="doc-chip" data-path="${escapeHtml(doc.file_path)}" data-name="${escapeHtml(doc.file_name)}">📎 ${escapeHtml(doc.file_name)}</button>
      `).join("");

      const hasLocation = b.latitude != null && b.longitude != null;
      const mapId = `map-${b.id}`;

      card.innerHTML = `
        <div class="booking-header">
          <span class="booking-icon">${icon}</span>
          <div>
            <strong>${escapeHtml(b.title)}</strong>
            <small>${escapeHtml(b.provider || "")}</small>
          </div>
          <button class="icon-btn delete-booking" title="Elimina">✕</button>
        </div>
        ${dateRange ? `<div class="booking-dates">${escapeHtml(dateRange)}</div>` : ""}
        ${b.confirmation_code ? `<div class="booking-code">Codice: ${escapeHtml(b.confirmation_code)}</div>` : ""}
        ${b.notes ? `<div class="booking-notes">${escapeHtml(b.notes)}</div>` : ""}
        ${hasLocation ? `
          <div class="booking-address">📍 ${escapeHtml(b.address || "")}</div>
          <div id="${mapId}" class="booking-map"></div>
          <a class="open-maps-link" href="${this.buildMapsUrl(b)}" target="_blank" rel="noopener noreferrer">🧭 Apri in Mappe</a>
        ` : ""}
        <div class="booking-docs">${docsHtml}</div>
      `;

      card.querySelector(".delete-booking").addEventListener("click", () => this.removeBooking(b.id));
      card.querySelectorAll(".doc-chip").forEach(chip => {
        chip.addEventListener("click", () => this.downloadDocument(chip.dataset.path, chip.dataset.name));
      });

      container.appendChild(card);

      if (hasLocation) {
        // Il contenitore deve già essere nel DOM prima di inizializzare Leaflet
        const map = L.map(mapId, { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false })
          .setView([b.latitude, b.longitude], 15);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19
        }).addTo(map);
        L.marker([b.latitude, b.longitude], { icon: this.markerIcon }).addTo(map);
        this.mapInstances.set(b.id, map);
      }
    }
  },

  buildMapsUrl(booking) {
    const label = encodeURIComponent(booking.title || "Destinazione");
    return `https://maps.apple.com/?ll=${booking.latitude},${booking.longitude}&q=${label}`;
  }
};

const BOOKING_ICONS = { flight: "✈️", hotel: "🏨", car: "🚗", other: "📌" };
