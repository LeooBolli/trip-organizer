// ============================================================
// Mappa del mondo a puntini: i paesi visitati (dalle bandiere dei
// viaggi + quelli segnati a mano) si colorano d'ocra, quelli del
// prossimo viaggio di verde acqua, gli altri viaggi futuri ad anello.
// Sotto: statistiche, continenti, anni in viaggio e bandiere.
// Disegnata in SVG dai dati di worldMapData.js, senza librerie.
// ============================================================
const WORLD_COUNTRY_COUNT = 195;
const CONTINENTS = [
  { id: "Europe", label: "Europa" },
  { id: "Asia", label: "Asia" },
  { id: "Africa", label: "Africa" },
  { id: "North America", label: "Nord America" },
  { id: "South America", label: "Sud America" },
  { id: "Oceania", label: "Oceania" }
];

const WorldMap = {
  names: null,
  dots: null,
  selected: null,
  selectedYear: null,

  init() {
    const panel = document.querySelector(".map-panel");
    panel.addEventListener("click", (e) => {
      const tripBtn = e.target.closest("[data-trip-id]");
      if (tripBtn) {
        const trip = Trips.list.find(t => String(t.id) === tripBtn.dataset.tripId);
        if (trip) Trips.open(trip);
        return;
      }
      if (e.target.closest("#world-map-edit")) { this.editManual(); return; }
      const yearBtn = e.target.closest("[data-year]");
      if (yearBtn) { this.selectedYear = Number(yearBtn.dataset.year); this.update(); return; }
      const country = e.target.closest("[data-cc]");
      if (country || e.target.closest("#trips-world-map")) {
        const code = country ? country.dataset.cc : null;
        this.selected = code && code !== this.selected ? code : null;
        this.update();
      }
    });
    // Mappa "spenta" sulla schermata di accesso
    document.getElementById("login-world-map").innerHTML = this.svg(new Map(), "login");
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

  // Il primo viaggio che deve ancora partire
  nextTrip() {
    const today = localISO();
    return Trips.list
      .filter(t => !t.archived && t.start_date && t.start_date > today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] || null;
  },

  manualCodes() {
    return (Preferences.config.visitedCountries || []).filter(c => /^[A-Z]{2}$/.test(c));
  },

  // Stato di ogni paese: visitato (viaggio già iniziato, senza date o
  // segnato a mano), prossimo viaggio, oppure in programma
  places() {
    const today = localISO();
    const next = this.nextTrip();
    const places = new Map();
    const get = (code) => {
      if (!places.has(code)) places.set(code, { visited: false, manual: false, next: false, trips: [] });
      return places.get(code);
    };
    for (const trip of Trips.list) {
      const upcoming = trip.start_date && trip.start_date > today;
      for (const code of codesFromFlags(trip.emoji)) {
        const place = get(code);
        if (!upcoming) place.visited = true;
        if (next && trip.id === next.id) place.next = true;
        place.trips.push(trip);
      }
    }
    for (const code of this.manualCodes()) {
      const place = get(code);
      place.visited = true;
      place.manual = true;
    }
    return places;
  },

  stateOf(place) {
    if (!place) return "";
    if (place.next) return "is-next";
    if (place.visited) return "is-visited";
    return "is-planned";
  },

  svg(places, id) {
    const d = WORLD_MAP_DATA;
    let body = "";
    for (const [code, points] of this.countryDots()) {
      const state = this.stateOf(places.get(code));
      const r = state && state !== "is-planned" ? 0.44 : 0.36;
      const circles = points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("");
      const glow = state === "is-visited" || state === "is-next" ? ` filter="url(#wm-glow-${id})"` : "";
      const sel = code === this.selected && id === "trips" ? " is-selected" : "";
      body += `<g class="wm-c ${state}${sel}" data-cc="${code}"${glow}><title>${escapeHtml(this.countryName(code))}</title>${circles}</g>`;
    }
    const defs = `<defs><filter id="wm-glow-${id}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="0.55" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
    return `<svg class="wm-svg" viewBox="0 0 ${d.cols} ${d.rows}" role="img" aria-label="Mappa dei paesi visitati">${defs}${body}</svg>`;
  },

  update() {
    const places = this.places();
    const visitedCodes = [...places].filter(([, p]) => p.visited).map(([code]) => code);
    const today = localISO();
    const doneTrips = Trips.list.filter(t => !t.start_date || t.start_date <= today).length;
    const continents = new Set(visitedCodes.map(c => WORLD_MAP_DATA.continents[c]).filter(Boolean));

    document.getElementById("side-world-map").innerHTML = this.svg(places, "side");
    document.getElementById("trips-world-map").innerHTML = this.svg(places, "trips");
    document.getElementById("side-map-count").textContent = visitedCodes.length;
    document.getElementById("map-stat-countries").textContent = visitedCodes.length;
    document.getElementById("map-stat-continents").innerHTML = `${continents.size}<small>/6</small>`;
    document.getElementById("map-stat-world").textContent = `${Math.round(visitedCodes.length / WORLD_COUNTRY_COUNT * 100)}%`;
    document.getElementById("map-stat-trips").textContent = doneTrips;

    this.renderNext();
    this.renderContinents(visitedCodes);
    this.renderYears();
    this.renderFlags(places, visitedCodes);
    this.renderCaption(places);
  },

  renderNext() {
    const el = document.getElementById("map-next");
    const next = this.nextTrip();
    if (!next) { el.innerHTML = ""; return; }
    el.innerHTML = `<i></i><span>Prossimo viaggio</span>
      <button type="button" data-trip-id="${escapeHtml(String(next.id))}">${renderTripIcon(next.emoji)} ${escapeHtml(next.name)}</button>
      <small>${escapeHtml(tripStatus(next).label.toLowerCase())}</small>`;
  },

  renderContinents(visitedCodes) {
    const count = {};
    for (const code of visitedCodes) {
      const c = WORLD_MAP_DATA.continents[code];
      if (c) count[c] = (count[c] || 0) + 1;
    }
    document.getElementById("map-continents").innerHTML = CONTINENTS.map(c => `
      <span class="wm-cont${count[c.id] ? " is-on" : ""}">${escapeHtml(c.label)}${count[c.id] ? ` <b>${count[c.id]}</b>` : ""}</span>`).join("");
  },

  // Viaggi per anno (data di partenza): barre ocra per gli anni passati,
  // ad anello per i viaggi futuri. Tocca una barra per il dettaglio.
  renderYears() {
    const wrap = document.getElementById("map-years");
    const today = localISO();
    const byYear = new Map();
    for (const trip of Trips.list) {
      if (!trip.start_date) continue;
      const y = Number(trip.start_date.slice(0, 4));
      if (!byYear.has(y)) byYear.set(y, { trips: [], codes: new Set(), future: 0 });
      const entry = byYear.get(y);
      entry.trips.push(trip);
      if (trip.start_date > today) entry.future += 1;
      codesFromFlags(trip.emoji).forEach(c => entry.codes.add(c));
    }
    if (!byYear.size) { wrap.innerHTML = `<p class="wm-hint">Le partenze dei viaggi compariranno qui, anno per anno.</p>`; return; }

    const current = Number(today.slice(0, 4));
    const years = [...byYear.keys()];
    const last = Math.max(current, ...years);
    const first = Math.max(Math.min(...years), last - 11);
    const max = Math.max(...[...byYear.values()].map(e => e.trips.length));
    if (!this.selectedYear || !byYear.has(this.selectedYear)) {
      this.selectedYear = byYear.has(current) ? current : Math.max(...years.filter(y => y <= current), Math.min(...years));
    }

    let bars = "";
    for (let y = first; y <= last; y++) {
      const e = byYear.get(y);
      const n = e ? e.trips.length : 0;
      const past = n - (e ? e.future : 0);
      const h = n ? Math.max(8, Math.round(n / max * 100)) : 0;
      const pastH = n ? Math.round(h * past / n) : 0;
      bars += `
        <button type="button" class="wm-year${y === this.selectedYear ? " is-sel" : ""}${n ? "" : " is-empty"}" ${n ? `data-year="${y}"` : "disabled"}
          aria-label="${y}: ${n} ${n === 1 ? "viaggio" : "viaggi"}">
          <span class="wm-year-val">${n || ""}</span>
          <span class="wm-year-bar" style="height:${h}%">${n && pastH < h ? `<i class="is-future" style="height:${Math.round((h - pastH) / h * 100)}%"></i>` : ""}</span>
          <span class="wm-year-lbl">${String(y).slice(2)}</span>
        </button>`;
    }

    const sel = byYear.get(this.selectedYear);
    const flags = [...sel.codes].map(flagOf).join(" ");
    wrap.innerHTML = `
      <div class="wm-years-chart">${bars}</div>
      <div class="wm-years-detail"><b>${this.selectedYear}</b> · ${sel.trips.length} ${sel.trips.length === 1 ? "viaggio" : "viaggi"} · ${sel.codes.size} ${sel.codes.size === 1 ? "paese" : "paesi"}${sel.future ? ` <small>(${sel.future} in programma)</small>` : ""} <span class="wm-years-flags">${flags}</span></div>`;
  },

  renderFlags(places, visitedCodes) {
    const sorted = visitedCodes.slice().sort((a, b) => this.countryName(a).localeCompare(this.countryName(b), "it"));
    const flags = sorted.map(code => `
      <button type="button" class="wm-flag${code === this.selected ? " is-sel" : ""}" data-cc="${code}" title="${escapeHtml(this.countryName(code))}">${flagOf(code)}</button>`).join("");
    document.getElementById("map-flags").innerHTML = `${flags}
      <button type="button" id="world-map-edit" class="wm-flag-add" title="Segna a mano i paesi visitati">+ ${sorted.length ? "Aggiungi" : "Aggiungi i paesi dove sei stato"}</button>`;
  },

  renderCaption(places) {
    const el = document.getElementById("world-map-caption");
    if (!this.selected) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    const place = places.get(this.selected);
    const status = !place ? "Non ancora visitato"
      : place.next ? "Prossimo viaggio"
      : place.visited ? (place.trips.some(t => !t.start_date || t.start_date <= localISO()) ? "Visitato" : "Visitato · segnato a mano")
      : "In programma";
    const trips = place ? place.trips.map(t =>
      `<button type="button" class="wm-trip" data-trip-id="${escapeHtml(String(t.id))}">${escapeHtml(t.name)}</button>`).join("") : "";
    el.innerHTML = `
      <div class="wm-country">
        <span class="wm-country-flag">${flagOf(this.selected)}</span>
        <span><strong>${escapeHtml(this.countryName(this.selected))}</strong><small class="${this.stateOf(place)}">${status}</small></span>
      </div>
      ${trips ? `<div class="wm-trips">${trips}</div>` : ""}`;
  },

  // Paesi visti prima di usare l'app: personali, salvati nelle preferenze
  async editManual() {
    const current = this.manualCodes().map(flagOf).join("");
    const result = await FlagPicker.open(current);
    if (result === null) return;
    Preferences.setVisitedCountries(codesFromFlags(result));
    this.update();
  }
};
