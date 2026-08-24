// ============================================================
// Jet lag: consigli generali + piano di adattamento generato
// lato client (nessun dato salvato, nessuna tabella necessaria).
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
    const select = document.getElementById("jetlag-offset");
    select.innerHTML = "";
    for (let h = 14; h >= -12; h--) {
      if (h === 0) continue;
      const opt = document.createElement("option");
      opt.value = h;
      opt.textContent = h > 0 ? `+${h} ore (verso est)` : `${h} ore (verso ovest)`;
      select.appendChild(opt);
    }
    select.value = "9";

    document.getElementById("jetlag-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.generatePlan();
    });
  },

  generatePlan() {
    const offset = parseInt(document.getElementById("jetlag-offset").value, 10);
    const departureStr = document.getElementById("jetlag-departure-date").value;
    const departure = departureStr ? new Date(departureStr + "T00:00:00") : new Date();
    const absOffset = Math.abs(offset);
    const east = offset > 0;

    // Pre-adattamento: 1h al giorno nei giorni precedenti la partenza,
    // fino a un massimo di 3 giorni (oltre non è pratico prepararsi di più)
    const preDays = Math.min(3, absOffset);
    const steps = [];

    for (let d = preDays; d >= 1; d--) {
      const day = new Date(departure);
      day.setDate(day.getDate() - d);
      const shift = preDays - d + 1;
      steps.push({
        label: `${d} giorno${d > 1 ? "i" : ""} prima (${formatDate(day.toISOString().slice(0, 10))})`,
        text: east
          ? `Vai a letto e svegliati circa ${shift}h prima del solito.`
          : `Vai a letto e svegliati circa ${shift}h dopo il solito.`
      });
    }

    steps.push({
      label: `Giorno della partenza (${formatDate(departure.toISOString().slice(0, 10))})`,
      text: "Imposta subito l'orologio sull'ora di destinazione. In volo, dormi/resta sveglio seguendo quell'orario, non quello di partenza."
    });

    // Giorni di recupero a destinazione: circa 1 giorno ogni 1-1.5 fusi orari
    const recoveryDays = Math.max(1, Math.round(absOffset / 1.5));
    steps.push({
      label: `Primi ${recoveryDays} giorni a destinazione`,
      text: east
        ? "Cerca luce naturale appena sveglio/a, evitala nelle ore serali. Evita pisolini oltre i 20-30 minuti."
        : "Cerca luce naturale nel tardo pomeriggio/sera, evitala al mattino presto. Evita pisolini oltre i 20-30 minuti."
    });

    const container = document.getElementById("jetlag-plan");
    container.innerHTML = `
      <p class="card-text" style="margin-top:14px;">
        Differenza di ${absOffset}h verso ${east ? "est" : "ovest"} — jet lag ${east ? "generalmente più difficile" : "di solito più gestibile"},
        recupero stimato in circa ${recoveryDays} giorno${recoveryDays > 1 ? "i" : ""}.
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
