// ============================================================
// Jet lag: consigli generali + piano di adattamento calcolato su
// fuso orario reale (città → IANA timezone, DST inclusa) con
// orari specifici giorno per giorno. Nessun dato viene salvato
// lato trip (solo le città personalizzate finiscono su Supabase,
// condivise, riutilizzabili in futuro).
// ============================================================
const Jetlag = {
  trip: null,

  openForTrip(trip) {
    this.trip = trip;
    const dateInput = document.getElementById("jetlag-departure-date");
    if (!dateInput.value) dateInput.value = trip.start_date || new Date().toISOString().slice(0, 10);
    document.getElementById("jetlag-plan").innerHTML = "";
  },

  init() {
    this.populateCitySelect("jetlag-origin");
    this.populateCitySelect("jetlag-destination");

    // Prova a preselezionare la partenza sul fuso orario del dispositivo
    try {
      const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const origin = document.getElementById("jetlag-origin");
      if ([...origin.options].some(o => o.value === deviceTz)) origin.value = deviceTz;
    } catch (err) { /* ignora, resta sul default */ }

    document.getElementById("jetlag-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.generatePlan();
    });
  },

  populateCitySelect(selectId) {
    const select = document.getElementById(selectId);
    select.innerHTML = "";
    for (const city of JETLAG_CITIES) {
      const opt = document.createElement("option");
      opt.value = city.tz;
      opt.textContent = city.label;
      select.appendChild(opt);
    }
    const customCities = (window.CustomOptions ? CustomOptions.list : []).filter(o => o.field_key === "jetlag_city");
    for (const c of customCities) {
      const opt = document.createElement("option");
      opt.value = c.value;
      opt.textContent = "✏️ " + c.label;
      select.appendChild(opt);
    }
    const addOpt = document.createElement("option");
    addOpt.value = "__add_city__";
    addOpt.textContent = "➕ Altra città...";
    select.appendChild(addOpt);

    select.dataset.prevValue = select.value;
    select.addEventListener("change", () => this.handleCitySelectChange(select));
  },

  async handleCitySelectChange(select) {
    if (select.value !== "__add_city__") { select.dataset.prevValue = select.value; return; }
    const restore = select.dataset.prevValue;
    const name = prompt("Nome della città:");
    if (!name || !name.trim()) { select.value = restore; return; }
    const offsetStr = prompt(`Differenza oraria di "${name.trim()}" rispetto a UTC (es. 9 per UTC+9, -5 per UTC-5, 5.5 per UTC+5:30):`);
    const offset = parseFloat((offsetStr || "").replace(",", "."));
    if (isNaN(offset)) { select.value = restore; return; }

    const value = `custom_offset:${offset}:${Date.now().toString(36)}`;
    const { error } = await supabaseClient.from("custom_options").insert({
      field_key: "jetlag_city", value, label: name.trim(), created_by: Auth.currentUser.id
    });
    if (error) { alert("Errore salvataggio città: " + error.message); select.value = restore; return; }

    if (window.CustomOptions) await CustomOptions.load();
    this.populateCitySelect("jetlag-origin");
    this.populateCitySelect("jetlag-destination");
    select.value = value;
    select.dataset.prevValue = value;
  },

  // Offset in minuti rispetto a UTC per un identificatore di fuso orario
  // (IANA, es. "Asia/Tokyo") o per una città personalizzata a offset fisso
  // ("custom_offset:9:xyz"), nella data indicata - gestisce l'ora legale
  // automaticamente per i fusi IANA.
  getOffsetMinutes(tzValue, date) {
    if (tzValue.startsWith("custom_offset:")) {
      return parseFloat(tzValue.split(":")[1]) * 60;
    }
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tzValue, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
    const parts = dtf.formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const hour = parts.hour === "24" ? "00" : parts.hour;
    const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +hour, +parts.minute, +parts.second);
    return Math.round((asUTC - date.getTime()) / 60000);
  },

  formatTime(minutesFromMidnight) {
    let m = ((minutesFromMidnight % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const mm = Math.round(m % 60);
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  },

  generatePlan() {
    const departureStr = document.getElementById("jetlag-departure-date").value;
    const departure = departureStr ? new Date(departureStr + "T12:00:00") : new Date();
    const originTz = document.getElementById("jetlag-origin").value;
    const destTz = document.getElementById("jetlag-destination").value;
    const bedtimeStr = document.getElementById("jetlag-bedtime").value || "23:00";
    const [bedH, bedM] = bedtimeStr.split(":").map(Number);
    const bedtimeMinutes = bedH * 60 + bedM;

    if (originTz === "__add_city__" || destTz === "__add_city__") return;

    const offsetMinutes = this.getOffsetMinutes(destTz, departure) - this.getOffsetMinutes(originTz, departure);
    const offsetHours = offsetMinutes / 60;
    const absOffset = Math.abs(offsetHours);
    const east = offsetHours > 0;

    if (absOffset < 0.5) {
      document.getElementById("jetlag-plan").innerHTML = `
        <p class="card-text" style="margin-top:14px;">Nessuna differenza di fuso oraria significativa (${absOffset.toFixed(1)}h): non dovresti avere jet lag da gestire.</p>
      `;
      return;
    }

    const preDays = Math.min(3, Math.round(absOffset));
    const steps = [];

    for (let d = preDays; d >= 1; d--) {
      const day = new Date(departure);
      day.setDate(day.getDate() - d);
      const shiftMin = Math.round((preDays - d + 1) * Math.min(60, (absOffset * 60) / preDays));
      const newBedtime = bedtimeMinutes + (east ? -shiftMin : shiftMin);
      steps.push({
        label: `${d} giorno${d > 1 ? "i" : ""} prima (${formatDate(day.toISOString().slice(0, 10))})`,
        text: `Vai a letto verso le ${this.formatTime(newBedtime)} (invece delle ${this.formatTime(bedtimeMinutes)} abituali) e sveglia di conseguenza ~8h dopo. ${east ? "Cerca luce intensa appena sveglio, evita luce forte a fine giornata." : "Cerca luce intensa in tarda serata, evita luce forte al mattino presto."}`
      });
    }

    steps.push({
      label: `Giorno della partenza (${formatDate(departure.toISOString().slice(0, 10))})`,
      text: `Imposta subito l'orologio sull'ora di ${document.getElementById("jetlag-destination").selectedOptions[0].textContent.replace("✏️ ", "")}. In volo dormi/resta sveglio seguendo quell'orario, non quello di partenza. Evita alcol e limita la caffeina.`
    });

    const recoveryDays = Math.max(1, Math.round(absOffset / 1.5));
    const lightWindow = east ? "7:00–9:00 ora locale (mattina)" : "17:00–20:00 ora locale (tardo pomeriggio/sera)";
    const avoidWindow = east ? "dopo le 20:00 ora locale" : "prima delle 9:00 ora locale";
    for (let d = 1; d <= recoveryDays; d++) {
      steps.push({
        label: `Giorno ${d} a destinazione`,
        text: `Cerca luce naturale intensa tra le ${lightWindow}. Evita luce forte/schermi ${avoidWindow}. Pasti agli orari locali anche se non hai fame. Pisolini max 20-30 minuti, mai dopo le 16:00 locali.`
      });
    }

    const container = document.getElementById("jetlag-plan");
    container.innerHTML = `
      <p class="card-text" style="margin-top:14px;">
        Differenza reale (con ora legale inclusa): <strong>${absOffset.toFixed(1)}h verso ${east ? "est" : "ovest"}</strong>
        — jet lag ${east ? "generalmente più difficile" : "di solito più gestibile"}, recupero stimato in circa
        ${recoveryDays} giorno${recoveryDays > 1 ? "i" : ""}.
      </p>
      <div class="jetlag-steps">
        ${steps.map(s => `
          <div class="jetlag-step">
            <div class="jetlag-step-label">${escapeHtml(s.label)}</div>
            <div class="jetlag-step-text">${escapeHtml(s.text)}</div>
          </div>
        `).join("")}
      </div>
    `;
  }
};

// Città con relativo fuso orario IANA (gestisce l'ora legale in automatico)
const JETLAG_CITIES = [
  { label: "Roma / Milano, Italia", tz: "Europe/Rome" },
  { label: "Londra, Regno Unito", tz: "Europe/London" },
  { label: "Parigi, Francia", tz: "Europe/Paris" },
  { label: "Madrid, Spagna", tz: "Europe/Madrid" },
  { label: "Lisbona, Portogallo", tz: "Europe/Lisbon" },
  { label: "Berlino, Germania", tz: "Europe/Berlin" },
  { label: "Amsterdam, Paesi Bassi", tz: "Europe/Amsterdam" },
  { label: "Atene, Grecia", tz: "Europe/Athens" },
  { label: "Istanbul, Turchia", tz: "Europe/Istanbul" },
  { label: "Mosca, Russia", tz: "Europe/Moscow" },
  { label: "New York, USA", tz: "America/New_York" },
  { label: "Chicago, USA", tz: "America/Chicago" },
  { label: "Denver, USA", tz: "America/Denver" },
  { label: "Los Angeles, USA", tz: "America/Los_Angeles" },
  { label: "Toronto, Canada", tz: "America/Toronto" },
  { label: "Città del Messico, Messico", tz: "America/Mexico_City" },
  { label: "Cancún, Messico", tz: "America/Cancun" },
  { label: "Bogotà, Colombia", tz: "America/Bogota" },
  { label: "Lima, Perù", tz: "America/Lima" },
  { label: "Santiago, Cile", tz: "America/Santiago" },
  { label: "Buenos Aires, Argentina", tz: "America/Argentina/Buenos_Aires" },
  { label: "Rio de Janeiro / San Paolo, Brasile", tz: "America/Sao_Paulo" },
  { label: "Curaçao / Willemstad, Caraibi", tz: "America/Curacao" },
  { label: "Santo Domingo, Rep. Dominicana", tz: "America/Santo_Domingo" },
  { label: "Tokyo, Giappone", tz: "Asia/Tokyo" },
  { label: "Seoul, Corea del Sud", tz: "Asia/Seoul" },
  { label: "Pechino / Shanghai, Cina", tz: "Asia/Shanghai" },
  { label: "Hong Kong", tz: "Asia/Hong_Kong" },
  { label: "Singapore", tz: "Asia/Singapore" },
  { label: "Bangkok, Thailandia", tz: "Asia/Bangkok" },
  { label: "Hanoi / Ho Chi Minh, Vietnam", tz: "Asia/Ho_Chi_Minh" },
  { label: "Bali, Indonesia", tz: "Asia/Makassar" },
  { label: "Giacarta, Indonesia", tz: "Asia/Jakarta" },
  { label: "Kuala Lumpur, Malesia", tz: "Asia/Kuala_Lumpur" },
  { label: "Manila, Filippine", tz: "Asia/Manila" },
  { label: "Mumbai / Delhi, India", tz: "Asia/Kolkata" },
  { label: "Dubai, Emirati Arabi", tz: "Asia/Dubai" },
  { label: "Tel Aviv, Israele", tz: "Asia/Jerusalem" },
  { label: "Kathmandu, Nepal", tz: "Asia/Kathmandu" },
  { label: "Sydney, Australia", tz: "Australia/Sydney" },
  { label: "Melbourne, Australia", tz: "Australia/Melbourne" },
  { label: "Perth, Australia", tz: "Australia/Perth" },
  { label: "Auckland, Nuova Zelanda", tz: "Pacific/Auckland" },
  { label: "Il Cairo, Egitto", tz: "Africa/Cairo" },
  { label: "Marrakech, Marocco", tz: "Africa/Casablanca" },
  { label: "Nairobi, Kenya", tz: "Africa/Nairobi" },
  { label: "Zanzibar, Tanzania", tz: "Africa/Dar_es_Salaam" },
  { label: "Città del Capo, Sudafrica", tz: "Africa/Johannesburg" }
];
