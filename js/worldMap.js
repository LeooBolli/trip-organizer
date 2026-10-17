// ============================================================
// Mappa del mondo a puntini: i paesi dei viaggi (presi dalle
// bandiere) si colorano d'ocra. Disegnata in SVG dai dati di
// worldMapData.js, senza librerie né tessere esterne.
// ============================================================
const WORLD_COUNTRY_COUNT = 195;

const WorldMap = {
  names: null,
  dots: null,
  selected: null,

  init() {
    document.getElementById("trips-world-map").addEventListener("click", (e) => {
      const country = e.target.closest("[data-cc]");
      this.selected = country ? country.dataset.cc : null;
      this.renderCaption(this.places(Trips.list));
    });
    document.getElementById("world-map-caption").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-trip-id]");
      if (!btn) return;
      const trip = Trips.list.find(t => String(t.id) === btn.dataset.tripId);
      if (trip) Trips.open(trip);
    });
    // Mappa "spenta" sulla schermata di accesso
    document.getElementById("login-world-map").innerHTML = this.svg(new Map(), { pins: false });
  },

  countryName(code) {
    if (!this.names) {
      try { this.names = new Intl.DisplayNames(["it"], { type: "region" }); } catch (err) { this.names = { of: c => c }; }
    }
    try { return this.names.of(code) || code; } catch (err) { return code; }
  },

  // Puntini raggruppati per paese, calcolati una volta sola
  countryDots() {
    if (this.dots) return this.dots;
    const d = WORLD_MAP_DATA;
    const dots = new Map();
    const add = (code, x, y) => {
      if (!dots.has(code)) dots.set(code, []);
      dots.get(code).push([x, y]);
    };
    d.grid.forEach((row, r) => {
      for (let c = 0; c < d.cols; c++) {
        const code = row.substr(c * 2, 2);
        if (code !== "..") add(code, c + 0.5, r + 0.5);
      }
    });
    for (const [code, lon, lat] of d.extra) {
      const y = (d.latTop - lat) / d.step;
      if (y >= 0 && y <= d.rows) add(code, Math.round((lon + 180) / d.step * 100) / 100, Math.round(y * 100) / 100);
    }
    this.dots = dots;
    return dots;
  },

  // Il puntino più vicino al centro del paese, dove mettere il segnaposto
  centerDot(points) {
    const mx = points.reduce((s, p) => s + p[0], 0) / points.length;
    const my = points.reduce((s, p) => s + p[1], 0) / points.length;
    return points.reduce((best, p) =>
      (p[0] - mx) ** 2 + (p[1] - my) ** 2 < (best[0] - mx) ** 2 + (best[1] - my) ** 2 ? p : best);
  },

  // Paesi dei viaggi: "visitato" se il viaggio è già iniziato (o non ha
  // date), "in programma" se parte nel futuro
  places(trips) {
    const today = localISO();
    const places = new Map();
    for (const trip of trips) {
      const upcoming = trip.start_date && trip.start_date > today;
      for (const code of codesFromFlags(trip.emoji)) {
        const place = places.get(code) || { visited: false, trips: [] };
        if (!upcoming) place.visited = true;
        place.trips.push(trip);
        places.set(code, place);
      }
    }
    return places;
  },

  svg(places, { pins = true } = {}) {
    const d = WORLD_MAP_DATA;
    let body = "";
    let pinsHtml = "";
    for (const [code, points] of this.countryDots()) {
      const place = places.get(code);
      const cls = place ? (place.visited ? " is-visited" : " is-planned") : "";
      const circles = points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.36"/>`).join("");
      body += `<g class="wm-c${cls}" data-cc="${code}"><title>${escapeHtml(this.countryName(code))}</title>${circles}</g>`;
      if (pins && place) {
        const [x, y] = this.centerDot(points);
        pinsHtml += `<circle class="wm-pin${place.visited ? "" : " is-planned"}" cx="${x}" cy="${y}" r="1.25"/>`;
      }
    }
    return `<svg class="wm-svg" viewBox="0 0 ${d.cols} ${d.rows}" role="img" aria-label="Mappa dei paesi visitati">${body}<g class="wm-pins">${pinsHtml}</g></svg>`;
  },

  update() {
    const places = this.places(Trips.list);
    const visited = [...places.values()].filter(p => p.visited).length;
    const planned = places.size - visited;
    const today = localISO();
    const doneTrips = Trips.list.filter(t => !t.start_date || t.start_date <= today).length;

    const html = this.svg(places);
    document.getElementById("side-world-map").innerHTML = html;
    document.getElementById("trips-world-map").innerHTML = html;
    document.getElementById("side-map-count").textContent = visited;
    document.getElementById("map-stat-countries").textContent = visited;
    document.getElementById("map-stat-world").textContent = `${Math.round(visited / WORLD_COUNTRY_COUNT * 100)}%`;
    document.getElementById("map-stat-trips").textContent = doneTrips;
    document.getElementById("map-stat-planned").textContent = planned
      ? `+ ${planned} ${planned === 1 ? "paese" : "paesi"} in programma` : "";
    this.renderCaption(places);
  },

  renderCaption(places) {
    const el = document.getElementById("world-map-caption");
    document.querySelectorAll("#trips-world-map .wm-c.is-selected").forEach(g => g.classList.remove("is-selected"));
    if (!this.selected) {
      el.innerHTML = `<span class="wm-hint">Tocca un paese sulla mappa per vedere i vostri viaggi lì.</span>`;
      return;
    }
    const group = document.querySelector(`#trips-world-map .wm-c[data-cc="${this.selected}"]`);
    if (group) group.classList.add("is-selected");
    const place = places.get(this.selected);
    const status = !place ? "Non ancora visitato" : place.visited ? "Visitato" : "In programma";
    const trips = place ? place.trips.map(t =>
      `<button type="button" class="wm-trip" data-trip-id="${escapeHtml(String(t.id))}">${escapeHtml(t.name)}</button>`).join("") : "";
    el.innerHTML = `
      <div class="wm-country">
        <span class="wm-country-flag">${flagOf(this.selected)}</span>
        <span><strong>${escapeHtml(this.countryName(this.selected))}</strong><small>${status}</small></span>
      </div>
      ${trips ? `<div class="wm-trips">${trips}</div>` : ""}`;
  }
};
