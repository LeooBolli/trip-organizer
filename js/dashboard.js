// ============================================================
// Dashboard del viaggio: centro di controllo a colpo d'occhio.
// Legge i dati già caricati dagli altri moduli (spese, prenotazioni,
// itinerario, valigia, To Do) e si ridisegna da sola quando cambiano.
// I riquadri da mostrare dipendono dalle preferenze dell'utente.
// ============================================================
const MACRO_AREAS = {
  trasporti: { label: "Trasporti", icon: "✈️", color: "#5AA9E6", categories: ["voli", "trasporti", "auto"] },
  alloggio: { label: "Alloggio", icon: "🏨", color: "#EE8F45", categories: ["alloggio"] },
  cibo: { label: "Cibo e bar", icon: "🍽️", color: "#4FBD87", categories: ["colazione", "pranzo", "cena", "bar", "spesa", "cibo"] },
  attivita: { label: "Attività", icon: "🎟️", color: "#F2C94C", categories: ["escursioni", "intrattenimento", "attivita"] },
  shopping: { label: "Shopping", icon: "🛍️", color: "#B58DE0", categories: ["shopping", "regali"] },
  altro: { label: "Altro", icon: "📦", color: "#8FA3B0", categories: [] }
};

function macroAreaOf(category) {
  for (const [key, area] of Object.entries(MACRO_AREAS)) {
    if (area.categories.includes(category)) return key;
  }
  return "altro";
}

function localISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + "T12:00:00");
  const b = new Date(toISO + "T12:00:00");
  return Math.round((b - a) / 86400000);
}

function shiftISO(iso, days) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return localISO(d);
}

function timeOf(iso) {
  return iso ? new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
}

const Dashboard = {
  trip: null,
  refreshTimer: null,
  spending: { mode: "total", day: localISO(), user: "all" },

  init() {
    const root = document.getElementById("dashboard-content");
    root.addEventListener("click", (e) => this.onClick(e));
    root.addEventListener("change", (e) => this.onChange(e));
    document.getElementById("dashboard-fab").addEventListener("click", () => {
      window.switchTab("tab-expenses");
      setTimeout(() => document.getElementById("expense-description").focus(), 350);
    });

    // Ogni volta che un modulo ridisegna i propri dati, la Dashboard si aggiorna
    for (const module of [Expenses, Bookings, Itinerary, Packing, Todos]) {
      const original = module.render;
      module.render = function (...args) {
        const result = original.apply(this, args);
        Dashboard.refresh();
        return result;
      };
    }
  },

  openForTrip(trip) {
    this.trip = trip;
    this.spending = { mode: "total", day: localISO(), user: "all" };
    window.switchTab("tab-dashboard");
    this.render();
  },

  refresh() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.render(), 40);
  },

  onClick(e) {
    const actionEl = e.target.closest("[data-action]");
    if (actionEl) {
      e.stopPropagation();
      this.handleAction(actionEl);
      return;
    }
    if (e.target.closest("input, select, label")) return;
    const gotoEl = e.target.closest("[data-goto]");
    if (gotoEl) window.switchTab(gotoEl.dataset.goto);
  },

  onChange(e) {
    if (e.target.dataset.action === "spend-day" && e.target.value) {
      this.spending.day = e.target.value;
      this.render();
    }
  },

  handleAction(el) {
    const action = el.dataset.action;
    if (action === "budget-edit") this.editBudget();
    else if (action === "spend-mode") { this.spending.mode = el.dataset.value; this.render(); }
    else if (action === "spend-user") { this.spending.user = el.dataset.value; this.render(); }
    else if (action === "spend-shift") { this.spending.day = shiftISO(this.spending.day, parseInt(el.dataset.value, 10)); this.render(); }
  },

  async editBudget() {
    const trip = this.trip;
    const current = trip.budget ? String(trip.budget) : "";
    const input = prompt(`Budget totale per tutto il viaggio in ${trip.base_currency} (lascia vuoto per rimuoverlo):`, current);
    if (input === null) return;
    const value = input.trim() === "" ? null : parseFloat(input.replace(",", "."));
    if (value !== null && (isNaN(value) || value <= 0)) { alert("Inserisci un importo valido."); return; }

    const { error } = await supabaseClient.from("trips").update({ budget: value }).eq("id", trip.id);
    if (error) { alert("Errore salvataggio budget: " + error.message + "\n(Hai eseguito lo schema aggiornato su Supabase?)"); return; }
    trip.budget = value;
    this.render();
  },

  // ---------- Calcoli ----------
  baseAmount(exp) { return exp.amount * exp.exchange_rate; },

  tripDays() {
    const t = this.trip;
    if (!t || !t.start_date || !t.end_date) return 0;
    return Math.max(1, daysBetween(t.start_date, t.end_date) + 1);
  },

  paidByUser(list) {
    const totals = {};
    for (const exp of list) totals[exp.paid_by] = (totals[exp.paid_by] || 0) + this.baseAmount(exp);
    return totals;
  },

  userChips(totals) {
    const ids = new Set([Auth.currentUser.id, ...(Auth.otherUserId ? [Auth.otherUserId] : []), ...Object.keys(totals)]);
    return [...ids].map(id => `<span class="dash-chip"><i></i>${escapeHtml(Auth.otherUserLabel(id))} <b>${escapeHtml(formatMoney(totals[id] || 0, this.trip.base_currency))}</b></span>`).join("");
  },

  // ---------- Grafica ----------
  ring(pct, color, centerHtml) {
    const p = Math.max(0, Math.min(100, pct));
    return `
      <div class="dash-ring">
        <svg viewBox="0 0 42 42">
          <circle cx="21" cy="21" r="15.9155" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="5"></circle>
          <circle cx="21" cy="21" r="15.9155" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"
            stroke-dasharray="${p} ${100 - p}" stroke-dashoffset="25"></circle>
        </svg>
        <span>${centerHtml}</span>
      </div>`;
  },

  donut(segments, total, centerLabel) {
    const R = 15.9155;
    let offset = 25;
    let circles = `<circle cx="21" cy="21" r="${R}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="6"></circle>`;
    if (total > 0) {
      for (const seg of segments) {
        const pct = seg.value / total * 100;
        const gap = segments.length > 1 ? Math.min(0.8, pct * 0.3) : 0;
        circles += `<circle cx="21" cy="21" r="${R}" fill="none" stroke="${seg.color}" stroke-width="6"
          stroke-dasharray="${Math.max(0, pct - gap)} ${100 - Math.max(0, pct - gap)}" stroke-dashoffset="${offset}"></circle>`;
        offset -= pct;
      }
    }
    return `
      <div class="dash-donut">
        <svg viewBox="0 0 42 42">${circles}</svg>
        <span><strong>${escapeHtml(centerLabel)}</strong></span>
      </div>`;
  },

  // ---------- Render ----------
  render() {
    const root = document.getElementById("dashboard-content");
    if (!this.trip || !Auth.currentUser) { root.innerHTML = ""; return; }

    const prefs = Preferences;
    const parts = [this.renderHero()];
    if (prefs.isWidgetOn("balance")) parts.push(this.renderBalance());
    if (prefs.isWidgetOn("today")) parts.push(this.renderToday());
    if (prefs.isWidgetOn("budget")) parts.push(this.renderBudget());
    if (prefs.isWidgetOn("spending")) parts.push(this.renderSpending());
    const favs = this.renderFavorites();
    if (favs) parts.push(favs);
    if (parts.length === 1) parts.push(`<div class="dash-card"><p class="dash-muted">Nessun riquadro attivo. Scegli cosa mostrare da ⚙️ Impostazioni.</p></div>`);

    root.innerHTML = parts.join("");
  },

  renderHero() {
    const t = this.trip;
    const today = localISO();
    let status = "Imposta le date del viaggio dal Riepilogo";
    let progress = "";
    if (t.start_date) {
      const untilStart = daysBetween(today, t.start_date);
      const total = this.tripDays();
      if (untilStart > 0) status = untilStart === 1 ? "Si parte domani!" : `Partenza tra ${untilStart} giorni`;
      else if (t.end_date && today > t.end_date) status = "Viaggio concluso";
      else if (total) {
        const dayNo = -untilStart + 1;
        status = `Giorno ${dayNo} di ${total}`;
        progress = `<div class="dash-progress"><div style="width:${Math.min(100, dayNo / total * 100)}%"></div></div>`;
      }
    }
    const dates = t.start_date ? `${formatDate(t.start_date)}${t.end_date ? " – " + formatDate(t.end_date) : ""}` : "";
    return `
      <div class="dash-hero" data-goto="tab-summary">
        <span class="dash-hero-emoji">${escapeHtml(t.emoji || "🧳")}</span>
        <div class="dash-hero-info">
          <strong>${escapeHtml(t.name)}</strong>
          <span>${escapeHtml([t.destination, dates].filter(Boolean).join(" · "))}</span>
          <em>${escapeHtml(status)}</em>
          ${progress}
        </div>
      </div>`;
  },

  renderBalance() {
    const list = Expenses.list;
    const base = this.trip.base_currency;
    const me = Auth.currentUser.id;
    let owedToMe = 0, iOwe = 0;
    for (const exp of list) {
      const otherShare = this.baseAmount(exp) * (1 - exp.payer_share_percent / 100);
      if (exp.paid_by === me) owedToMe += otherShare; else iOwe += otherShare;
    }
    const net = owedToMe - iOwe;
    const total = list.reduce((s, e) => s + this.baseAmount(e), 0);

    let big;
    if (list.length === 0) big = `<div class="dash-big dash-muted">Nessuna spesa</div><div class="dash-sub">Aggiungi la prima con il pulsante +</div>`;
    else if (Math.abs(net) < 0.005) big = `<div class="dash-big">Siete in pari 🎉</div><div class="dash-sub">Nessuno deve nulla a nessuno</div>`;
    else if (net > 0) big = `<div class="dash-sub">${escapeHtml(Auth.otherName())} ti deve</div><div class="dash-big dash-positive">${escapeHtml(formatMoney(net, base))}</div>`;
    else big = `<div class="dash-sub">Devi a ${escapeHtml(Auth.otherName())}</div><div class="dash-big dash-negative">${escapeHtml(formatMoney(-net, base))}</div>`;

    return `
      <div class="dash-card" data-goto="tab-expenses">
        <div class="dash-card-title">Bilancio <span class="dash-arrow">›</span></div>
        ${big}
        <div class="dash-divider"></div>
        <div class="dash-sub">Speso finora: <b>${escapeHtml(formatMoney(total, base))}</b></div>
        <div class="dash-chips">${this.userChips(this.paidByUser(list))}</div>
      </div>`;
  },

  renderToday() {
    const now = new Date();
    const today = localISO(now);
    const rows = [];

    for (const item of Itinerary.list.filter(i => i.day === today)) {
      rows.push({ tab: "tab-itinerary", icon: ITINERARY_TYPE_ICONS[item.type] || "📌", title: item.title, time: timeOf(item.start_datetime), sort: item.start_datetime || "9" });
    }
    for (const b of Bookings.list) {
      if (!b.start_datetime) continue;
      const startDay = localISO(new Date(b.start_datetime));
      const endDay = b.end_datetime ? localISO(new Date(b.end_datetime)) : startDay;
      if (today < startDay || today > endDay) continue;
      rows.push({ tab: "tab-bookings", icon: BOOKING_ICONS[b.type] || "📄", title: b.title, time: startDay === today ? timeOf(b.start_datetime) : "", sort: b.start_datetime });
    }
    for (const todo of Todos.list) {
      if (!todo.due_date) continue;
      const overdue = todo.due_date < today && !todo.done;
      if (todo.due_date !== today && !overdue) continue;
      rows.push({ tab: "tab-todo", icon: todo.done ? "☑️" : (overdue ? "⏰" : "✅"), title: todo.title, time: overdue ? "in ritardo" : "", done: todo.done, sort: "0" });
    }
    rows.sort((a, b) => String(a.sort).localeCompare(String(b.sort)));

    const dayNum = now.getDate();
    const month = now.toLocaleDateString("it-IT", { month: "long" });
    const weekday = now.toLocaleDateString("it-IT", { weekday: "long" });
    const list = rows.length
      ? rows.map(r => `
          <div class="dash-row${r.done ? " dash-row-done" : ""}" data-goto="${r.tab}">
            <span class="dash-row-icon">${r.icon}</span>
            <span class="dash-row-title">${escapeHtml(r.title)}</span>
            <span class="dash-row-time">${escapeHtml(r.time || "")}</span>
          </div>`).join("")
      : `<p class="dash-muted" style="margin:14px 0 4px;">Niente in programma per oggi ✨</p>`;

    return `
      <div class="dash-card">
        <div class="dash-card-title">Oggi</div>
        <div class="dash-date">
          <span class="dash-date-num">${dayNum}</span>
          <span class="dash-date-text"><strong>${escapeHtml(month)}</strong><small>${escapeHtml(weekday)}</small></span>
          <span class="dash-date-count">${rows.length ? `${rows.length} ${rows.length === 1 ? "impegno" : "impegni"}` : ""}</span>
        </div>
        <div class="dash-divider"></div>
        ${list}
      </div>`;
  },

  renderBudget() {
    const t = this.trip;
    const base = t.base_currency;
    const budget = Number(t.budget) || 0;
    const edit = `<button type="button" class="dash-edit" data-action="budget-edit" title="Modifica budget">✏️</button>`;

    if (!budget) {
      return `
        <div class="dash-card">
          <div class="dash-card-title">Budget ${edit}</div>
          <p class="dash-muted" style="margin:8px 0 12px;">Imposta un massimale indicativo di spesa per tutto il viaggio: lo dividiamo in automatico sui giorni di permanenza.</p>
          <button type="button" class="dash-btn" data-action="budget-edit">🎯 Imposta budget</button>
        </div>`;
    }

    const list = Expenses.list;
    const spent = list.reduce((s, e) => s + this.baseAmount(e), 0);
    const pct = spent / budget * 100;
    const over = spent > budget;
    const color = over ? "var(--negative)" : (pct > 85 ? "#F2C94C" : "var(--positive)");
    const days = this.tripDays();
    const today = localISO();

    let daily = "";
    if (days) {
      const perDay = budget / days;
      const spentToday = list.filter(e => e.expense_date === today).reduce((s, e) => s + this.baseAmount(e), 0);
      const dayPct = perDay ? Math.min(100, spentToday / perDay * 100) : 0;
      daily = `
        <div class="dash-divider"></div>
        <div class="dash-sub">Budget giornaliero (${days} giorni): <b>${escapeHtml(formatMoney(perDay, base))}</b></div>
        <div class="dash-sub">Oggi speso: <b class="${spentToday > perDay ? "dash-negative" : ""}">${escapeHtml(formatMoney(spentToday, base))}</b></div>
        <div class="dash-progress dash-progress-thin"><div style="width:${dayPct}%;background:${spentToday > perDay ? "var(--negative)" : "var(--accent)"}"></div></div>`;
    } else {
      daily = `<div class="dash-divider"></div><div class="dash-sub dash-muted">Imposta data di inizio e fine viaggio per vedere il budget giornaliero.</div>`;
    }

    return `
      <div class="dash-card" data-goto="tab-expenses">
        <div class="dash-card-title">Budget ${edit}</div>
        <div class="dash-budget-main">
          ${this.ring(pct, color, `${Math.round(pct)}%`)}
          <div>
            <div class="dash-big" style="font-size:1.7rem;">${escapeHtml(formatMoney(spent, base))}</div>
            <div class="dash-sub">su ${escapeHtml(formatMoney(budget, base))}</div>
            <div class="dash-sub ${over ? "dash-negative" : "dash-positive"}"><b>${over ? "Sforato di " + escapeHtml(formatMoney(spent - budget, base)) : "Restano " + escapeHtml(formatMoney(budget - spent, base))}</b></div>
          </div>
        </div>
        <div class="dash-chips">${this.userChips(this.paidByUser(list))}</div>
        ${daily}
      </div>`;
  },

  renderSpending() {
    const st = this.spending;
    const base = this.trip.base_currency;
    let list = Expenses.list;
    if (st.mode === "day") list = list.filter(e => e.expense_date === st.day);
    if (st.user !== "all") list = list.filter(e => e.paid_by === st.user);

    const byArea = {};
    for (const exp of list) {
      const key = macroAreaOf(exp.category);
      byArea[key] = byArea[key] || { value: 0, count: 0 };
      byArea[key].value += this.baseAmount(exp);
      byArea[key].count += 1;
    }
    const total = Object.values(byArea).reduce((s, a) => s + a.value, 0);
    const segments = Object.entries(byArea)
      .map(([key, a]) => ({ key, ...a, color: MACRO_AREAS[key].color }))
      .sort((a, b) => b.value - a.value);

    const legend = segments.length
      ? segments.map(s => `
          <div class="dash-legend-row">
            <i style="background:${s.color}"></i>
            <span>${MACRO_AREAS[s.key].icon} ${escapeHtml(MACRO_AREAS[s.key].label)} <small>${s.count}×</small></span>
            <b>${escapeHtml(formatMoney(s.value, base))}</b>
          </div>`).join("")
      : `<p class="dash-muted" style="margin:0;">${st.mode === "day" ? "Nessuna spesa in questo giorno" : "Nessuna spesa registrata"}</p>`;

    const users = [{ id: "all", label: "Tutti" }, { id: Auth.currentUser.id, label: Auth.myName() }];
    if (Auth.otherUserId) users.push({ id: Auth.otherUserId, label: Auth.otherName() });

    const dayControls = st.mode === "day" ? `
      <div class="dash-day-picker">
        <button type="button" class="dash-mini" data-action="spend-shift" data-value="-1">‹</button>
        <input type="date" value="${escapeHtml(st.day)}" data-action="spend-day">
        <button type="button" class="dash-mini" data-action="spend-shift" data-value="1">›</button>
      </div>` : "";

    return `
      <div class="dash-card" data-goto="tab-expenses">
        <div class="dash-card-title">Spese <span class="dash-arrow">›</span></div>
        <div class="dash-seg">
          <button type="button" class="${st.mode === "day" ? "on" : ""}" data-action="spend-mode" data-value="day">Giornaliero</button>
          <button type="button" class="${st.mode === "total" ? "on" : ""}" data-action="spend-mode" data-value="total">Totale</button>
        </div>
        ${dayControls}
        <div class="dash-seg dash-seg-small">
          ${users.map(u => `<button type="button" class="${st.user === u.id ? "on" : ""}" data-action="spend-user" data-value="${escapeHtml(u.id)}">${escapeHtml(u.label)}</button>`).join("")}
        </div>
        <div class="dash-spending-main">
          ${this.donut(segments, total, formatMoney(total, base))}
          <div class="dash-legend">${legend}</div>
        </div>
      </div>`;
  },

  renderFavorites() {
    const me = Auth.currentUser.id;
    const today = localISO();
    const cards = [];

    for (const fav of DASHBOARD_FAVORITES) {
      if (!Preferences.isFavoriteOn(fav.id)) continue;
      let graphic = `<span class="dash-fav-icon">${fav.icon}</span>`;
      let value = "";
      let sub = "";

      if (fav.id === "itinerary") {
        const upcoming = Itinerary.list.filter(i => i.day >= today);
        const next = upcoming[0];
        value = `${Itinerary.list.length} <small>tappe</small>`;
        sub = next ? `Prossima: ${next.title}` : (Itinerary.list.length ? "Tutte le tappe sono passate" : "Pianifica la prima tappa");
      } else if (fav.id === "packing") {
        const mine = Packing.list.filter(i => i.owner_id === me);
        const packed = mine.filter(i => i.packed).length;
        const pct = mine.length ? packed / mine.length * 100 : 0;
        graphic = this.ring(pct, "var(--positive)", `${Math.round(pct)}%`);
        value = `${packed}/${mine.length} <small>pronti</small>`;
        sub = mine.length ? (packed === mine.length ? "Valigia pronta! 🎉" : `${mine.length - packed} da preparare`) : "Valigia vuota";
      } else if (fav.id === "todo") {
        const done = Todos.list.filter(t => t.done).length;
        const pct = Todos.list.length ? done / Todos.list.length * 100 : 0;
        graphic = this.ring(pct, "var(--accent)", `${Math.round(pct)}%`);
        value = `${done}/${Todos.list.length} <small>fatti</small>`;
        sub = Todos.list.length ? (done === Todos.list.length ? "Tutto fatto! 🎉" : `${Todos.list.length - done} da fare`) : "Nessun promemoria";
      } else if (fav.id === "bookings") {
        const nowIso = new Date().toISOString();
        const next = Bookings.list.find(b => b.start_datetime && b.start_datetime >= nowIso);
        value = `${Bookings.list.length} <small>prenotazioni</small>`;
        if (next) {
          const d = daysBetween(today, localISO(new Date(next.start_datetime)));
          sub = `${next.title} · ${d <= 0 ? "oggi" : d === 1 ? "domani" : "tra " + d + " giorni"}`;
        } else sub = Bookings.list.length ? "Nessuna in arrivo" : "Aggiungi la prima";
      } else if (fav.id === "jetlag") {
        value = `Piano <small>jet lag</small>`;
        sub = "Calcola fuso e orari";
      }

      cards.push(`
        <div class="dash-fav" data-goto="${fav.tab}">
          ${graphic}
          <div class="dash-fav-text">
            <span>${escapeHtml(fav.label)}</span>
            <strong>${value}</strong>
            <small>${escapeHtml(sub)}</small>
          </div>
        </div>`);
    }

    if (!cards.length) return "";
    return `<div class="dash-section-title">Le tue sezioni preferite</div><div class="dash-favs">${cards.join("")}</div>`;
  }
};
