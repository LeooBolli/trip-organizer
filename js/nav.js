// ============================================================
// Navigazione: sidebar su PC, barra in basso + foglio "Altro" sul
// telefono. Tiene allineati titolo, voce attiva e intestazione del
// viaggio osservando quale vista è visibile.
// ============================================================
const Nav = {
  init() {
    const views = ["view-trips", "view-trip-detail", "view-settings"].map(id => document.getElementById(id));
    const observer = new MutationObserver(() => this.sync());
    views.forEach(v => observer.observe(v, { attributes: true, attributeFilter: ["class"] }));

    document.querySelectorAll("[data-nav='trips']").forEach(btn =>
      btn.addEventListener("click", () => { this.closeSheet(); this.goTrips(); }));
    document.getElementById("topbar-trip").addEventListener("click", () => this.goTrips());
    document.getElementById("topbar-avatar").addEventListener("click", () => this.openSheet());
    document.getElementById("more-btn").addEventListener("click", () => this.openSheet());

    const sheet = document.getElementById("more-sheet");
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet) { this.closeSheet(); return; }
      const proxy = e.target.closest("[data-proxy]");
      if (proxy) {
        e.preventDefault();
        this.closeSheet();
        document.getElementById(proxy.dataset.proxy).click();
      } else if (e.target.closest(".tab-btn")) {
        this.closeSheet();
      }
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") this.closeSheet(); });

    this.sync();
  },

  goTrips() {
    document.getElementById("view-settings").classList.add("hidden");
    Trips.showList();
    window.scrollTo({ top: 0 });
  },

  openSheet() { document.getElementById("more-sheet").classList.remove("hidden"); },
  closeSheet() { document.getElementById("more-sheet").classList.add("hidden"); },

  setUser(user) {
    const email = user.email || "";
    const name = window.APP_CONFIG.USER_NAMES[email] || email.split("@")[0];
    const initials = name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
    document.querySelectorAll(".js-user-initials").forEach(el => { el.textContent = initials; });
    document.querySelectorAll(".js-user-name").forEach(el => { el.textContent = name; });
    document.querySelectorAll(".js-user-email").forEach(el => { el.textContent = email; });
  },

  currentView() {
    if (!document.getElementById("view-trips").classList.contains("hidden")) return "trips";
    if (!document.getElementById("view-trip-detail").classList.contains("hidden")) return "trip";
    return "settings";
  },

  sync() {
    const shell = document.getElementById("app-shell");
    const view = this.currentView();
    const trip = Trips.activeTrip || Trips.lastTrip;
    shell.dataset.view = view;
    shell.classList.toggle("has-trip", !!trip);
    document.getElementById("side-trip-label").textContent = trip ? trip.name : "";

    const title = document.getElementById("topbar-trip");
    if (view === "trip" && Trips.activeTrip) {
      title.innerHTML = `<span class="topbar-flags">${renderTripIcon(Trips.activeTrip.emoji)}</span>
        <span class="topbar-name">${escapeHtml(Trips.activeTrip.name)}</span>
        <svg class="ico ico-sm"><use href="#i-chevron"/></svg>`;
    } else {
      title.innerHTML = `<span class="topbar-name">${view === "settings" ? "Impostazioni" : "I miei viaggi"}</span>`;
    }

    // "Altro" resta acceso quando la sezione aperta sta nel foglio
    const activeTab = document.querySelector(".tab-panel:not(.hidden)");
    const inSheet = activeTab && document.querySelector(`#more-sheet .tab-btn[data-tab="${activeTab.id}"]`);
    document.getElementById("more-btn").classList.toggle("active", view !== "trip" || !!inSheet);
  },

  // Pillole sotto il titolo del viaggio: destinazione, date, stato, valuta
  renderTripHero(trip) {
    const pills = [];
    const pill = (icon, text, cls = "") =>
      `<span class="hero-pill ${cls}"><svg class="ico ico-sm"><use href="#${icon}"/></svg>${escapeHtml(text)}</span>`;
    if (trip.destination) pills.push(pill("i-pin", trip.destination));
    if (trip.start_date) {
      pills.push(pill("i-calendar", trip.end_date && trip.end_date !== trip.start_date
        ? `${formatDate(trip.start_date)} – ${formatDate(trip.end_date)}` : formatDate(trip.start_date)));
    }
    const status = tripStatus(trip);
    if (trip.start_date) pills.push(pill("i-clock", status.label, "is-accent"));
    pills.push(pill("i-coins", trip.base_currency));
    document.getElementById("trip-hero-pills").innerHTML = pills.join("");
  }
};
