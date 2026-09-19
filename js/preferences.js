// ============================================================
// Impostazioni personali (per utente): quali riquadri e sezioni
// preferite mostrare nella Dashboard. Salvate su Supabase
// (user_preferences) così seguono l'account su ogni dispositivo,
// con copia locale come riserva se la tabella non esiste ancora.
// ============================================================
const DASHBOARD_WIDGETS = [
  { id: "balance", icon: "💰", label: "Bilancio", desc: "Chi deve quanto a chi e quanto ha speso ognuno" },
  { id: "today", icon: "📅", label: "Oggi", desc: "Prenotazioni, itinerario e To Do di oggi" },
  { id: "budget", icon: "🎯", label: "Budget", desc: "Massimale di spesa, diviso sui giorni di viaggio" },
  { id: "spending", icon: "🍩", label: "Spese", desc: "Grafico a torta per macroarea, giornaliero o totale" },
  { id: "converter", icon: "💱", label: "Convertitore", desc: "Conversione rapida tra le valute del viaggio" }
];

const DASHBOARD_FAVORITES = [
  { id: "itinerary", icon: "🗓️", label: "Itinerario", tab: "tab-itinerary" },
  { id: "packing", icon: "🧳", label: "Valigia", tab: "tab-packing" },
  { id: "bookings", icon: "📋", label: "Prenotazioni", tab: "tab-bookings" },
  { id: "todo", icon: "✅", label: "To Do", tab: "tab-todo" },
  { id: "jetlag", icon: "🌙", label: "Jet Lag", tab: "tab-jetlag" }
];

const Preferences = {
  LOCAL_KEY: "pdtravel-dashboard-config",
  config: {
    converterSeen: true,
    widgets: DASHBOARD_WIDGETS.map(w => w.id),
    favorites: ["itinerary", "packing", "bookings", "todo"]
  },
  previousView: "view-trips",

  init() {
    document.getElementById("settings-btn").addEventListener("click", () => this.open());
    document.getElementById("settings-back").addEventListener("click", () => this.close());
    this.loadLocal();
  },

  loadLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.LOCAL_KEY) || "null");
      if (saved) this.applyConfig(saved);
    } catch (err) { /* copia locale non valida: si usano i default */ }
  },

  applyConfig(cfg) {
    if (Array.isArray(cfg.widgets)) {
      this.config.widgets = cfg.widgets;
      // Configurazioni salvate prima del Convertitore: lo attiva una volta sola
      if (!cfg.converterSeen) {
        if (!this.config.widgets.includes("converter")) this.config.widgets.push("converter");
        this.config.converterSeen = true;
      }
    }
    if (Array.isArray(cfg.favorites)) this.config.favorites = cfg.favorites;
  },

  async load() {
    if (!Auth.currentUser) return;
    const { data, error } = await supabaseClient
      .from("user_preferences")
      .select("dashboard_config")
      .eq("user_id", Auth.currentUser.id)
      .maybeSingle();
    if (error) { console.warn("Preferenze utente non disponibili (schema aggiornato?):", error.message); return; }
    if (data && data.dashboard_config && Object.keys(data.dashboard_config).length) {
      this.applyConfig(data.dashboard_config);
      localStorage.setItem(this.LOCAL_KEY, JSON.stringify(this.config));
      if (window.Dashboard) Dashboard.refresh();
    }
  },

  async save() {
    localStorage.setItem(this.LOCAL_KEY, JSON.stringify(this.config));
    const status = document.getElementById("settings-status");
    if (!Auth.currentUser) return;
    const { error } = await supabaseClient.from("user_preferences").upsert({
      user_id: Auth.currentUser.id,
      dashboard_config: this.config,
      updated_at: new Date().toISOString()
    });
    status.textContent = error
      ? "Salvato solo su questo dispositivo (esegui lo schema aggiornato su Supabase per sincronizzare)."
      : "Salvato ✓";
  },

  isWidgetOn(id) { return this.config.widgets.includes(id); },
  isFavoriteOn(id) { return this.config.favorites.includes(id); },

  toggle(list, id, on) {
    const set = new Set(this.config[list]);
    if (on) set.add(id); else set.delete(id);
    this.config[list] = [...set];
    this.save();
    if (window.Dashboard) Dashboard.refresh();
  },

  open() {
    this.previousView = ["view-trip-detail", "view-trips"].find(id => !document.getElementById(id).classList.contains("hidden")) || "view-trips";
    document.getElementById("view-trips").classList.add("hidden");
    document.getElementById("view-trip-detail").classList.add("hidden");
    document.getElementById("view-settings").classList.remove("hidden");
    document.getElementById("settings-status").textContent = "";
    this.render();
    window.scrollTo({ top: 0 });
  },

  close() {
    document.getElementById("view-settings").classList.add("hidden");
    document.getElementById(this.previousView).classList.remove("hidden");
    if (window.Dashboard) Dashboard.refresh();
  },

  render() {
    this.renderList("settings-widgets", DASHBOARD_WIDGETS, "widgets", id => this.isWidgetOn(id));
    this.renderList("settings-favorites", DASHBOARD_FAVORITES, "favorites", id => this.isFavoriteOn(id));
  },

  renderList(containerId, items, listName, isOn) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    for (const item of items) {
      const row = document.createElement("label");
      row.className = "pref-row";
      row.innerHTML = `
        <span class="pref-icon">${item.icon}</span>
        <span class="pref-text"><strong>${escapeHtml(item.label)}</strong>${item.desc ? `<small>${escapeHtml(item.desc)}</small>` : ""}</span>
        <input type="checkbox" ${isOn(item.id) ? "checked" : ""}>
      `;
      row.querySelector("input").addEventListener("change", (e) => this.toggle(listName, item.id, e.target.checked));
      container.appendChild(row);
    }
  }
};
