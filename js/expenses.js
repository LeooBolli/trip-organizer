// ============================================================
// Gestione spese + calcolo saldo tra i due utenti
// ============================================================
const Expenses = {
  trip: null,
  list: [],
  channel: null,
  editingId: null,

  async openForTrip(trip) {
    this.trip = trip;
    this.populatePaidBySelect();
    this.cancelEdit();
    document.getElementById("expense-currency").value = trip.base_currency;
    document.getElementById("expense-date").value = new Date().toISOString().slice(0, 10);
    this.toggleExchangeRateField();

    if (this.channel) supabaseClient.removeChannel(this.channel);
    this.channel = supabaseClient
      .channel("expenses-" + trip.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `trip_id=eq.${trip.id}` }, () => this.load())
      .subscribe();

    await this.load();
  },

  init() {
    document.getElementById("new-expense-form").addEventListener("submit", (e) => this.submit(e));
    document.getElementById("expense-currency").addEventListener("change", () => this.toggleExchangeRateField());
    document.getElementById("expense-split").addEventListener("change", () => this.toggleCustomSplit());
    document.getElementById("expense-form-cancel").addEventListener("click", () => this.cancelEdit());
  },

  // Popola "Chi ha pagato" con te + l'altra persona (se già scoperta,
  // vedi Auth.discoverOtherUserId) - così puoi registrare una spesa
  // pagata da chiunque dei due, indipendentemente da chi è loggato.
  populatePaidBySelect() {
    const select = document.getElementById("expense-paid-by");
    if (!Auth.currentUser) return;
    const current = select.value;
    select.innerHTML = "";

    const meOpt = document.createElement("option");
    meOpt.value = Auth.currentUser.id;
    meOpt.textContent = Auth.myName();
    select.appendChild(meOpt);

    if (Auth.otherUserId) {
      const otherOpt = document.createElement("option");
      otherOpt.value = Auth.otherUserId;
      otherOpt.textContent = Auth.otherName();
      select.appendChild(otherOpt);
    }

    select.value = [...select.options].some(o => o.value === current) ? current : Auth.currentUser.id;
  },

  toggleExchangeRateField() {
    const isBase = document.getElementById("expense-currency").value === this.trip.base_currency;
    document.getElementById("exchange-rate-wrapper").classList.toggle("hidden", isBase);
  },

  toggleCustomSplit() {
    const custom = document.getElementById("expense-split").value === "custom";
    document.getElementById("custom-split-wrapper").classList.toggle("hidden", !custom);
  },

  async load() {
    const { data, error } = await supabaseClient
      .from("expenses")
      .select("*")
      .eq("trip_id", this.trip.id)
      .order("expense_date", { ascending: false });
    if (error) { console.error(error); return; }
    this.list = data;
    this.render();
  },

  startEdit(exp) {
    this.editingId = exp.id;
    document.getElementById("expense-description").value = exp.description;
    document.getElementById("expense-category").value = exp.category;
    document.getElementById("expense-amount").value = exp.amount;
    document.getElementById("expense-currency").value = exp.currency;
    document.getElementById("expense-rate").value = exp.exchange_rate;
    document.getElementById("expense-date").value = exp.expense_date;
    this.populatePaidBySelect();
    const paidBySelect = document.getElementById("expense-paid-by");
    if (![...paidBySelect.options].some(o => o.value === exp.paid_by)) {
      const opt = document.createElement("option");
      opt.value = exp.paid_by;
      opt.textContent = Auth.otherUserLabel(exp.paid_by);
      paidBySelect.appendChild(opt);
    }
    paidBySelect.value = exp.paid_by;
    document.getElementById("expense-split").value = exp.payer_share_percent === 50 ? "equal" : "custom";
    document.getElementById("expense-payer-share").value = exp.payer_share_percent;
    this.toggleExchangeRateField();
    this.toggleCustomSplit();

    document.getElementById("expense-form-title").textContent = "Modifica spesa";
    document.getElementById("expense-form-submit").textContent = "Salva modifiche";
    document.getElementById("expense-form-cancel").classList.remove("hidden");
    document.getElementById("expense-form-title").scrollIntoView({ behavior: "smooth", block: "start" });
  },

  cancelEdit() {
    this.editingId = null;
    document.getElementById("new-expense-form").reset();
    document.getElementById("expense-form-title").textContent = "Aggiungi spesa";
    document.getElementById("expense-form-submit").textContent = "Aggiungi spesa";
    document.getElementById("expense-form-cancel").classList.add("hidden");
    if (this.trip) {
      document.getElementById("expense-currency").value = this.trip.base_currency;
      document.getElementById("expense-date").value = new Date().toISOString().slice(0, 10);
    }
    this.populatePaidBySelect();
    this.toggleExchangeRateField();
    this.toggleCustomSplit();
  },

  async submit(e) {
    e.preventDefault();
    const description = document.getElementById("expense-description").value.trim();
    const category = document.getElementById("expense-category").value;
    const amount = parseFloat(document.getElementById("expense-amount").value);
    const currency = document.getElementById("expense-currency").value;
    const exchange_rate = currency === this.trip.base_currency
      ? 1
      : parseFloat(document.getElementById("expense-rate").value || "1");
    const splitType = document.getElementById("expense-split").value;
    const payer_share_percent = splitType === "custom"
      ? parseFloat(document.getElementById("expense-payer-share").value)
      : 50;
    const expense_date = document.getElementById("expense-date").value;
    const paid_by = document.getElementById("expense-paid-by").value || Auth.currentUser.id;

    if (!description || !amount || amount <= 0) return;

    if (this.editingId) {
      const { error } = await supabaseClient.from("expenses").update({
        description, category, amount, currency, exchange_rate, payer_share_percent, expense_date, paid_by
      }).eq("id", this.editingId);
      if (error) { alert("Errore salvataggio modifiche: " + error.message); return; }
    } else {
      const { error } = await supabaseClient.from("expenses").insert({
        trip_id: this.trip.id,
        description, category, amount, currency, exchange_rate,
        payer_share_percent, expense_date,
        paid_by
      });
      if (error) { alert("Errore salvataggio spesa: " + error.message); return; }
    }

    this.cancelEdit();
    await this.load();
  },

  async remove(id) {
    if (!confirm("Eliminare questa spesa?")) return;
    this.list = this.list.filter(e => e.id !== id);
    this.render();
    const { error } = await supabaseClient.from("expenses").delete().eq("id", id);
    if (error) { alert(error.message); await this.load(); }
  },

  render() {
    this.renderList();
    this.renderBalance();
    this.renderCategoryBreakdown();
  },

  renderList() {
    const container = document.getElementById("expenses-list");
    container.innerHTML = "";

    if (this.list.length === 0) {
      container.innerHTML = `<p class="empty-state">Nessuna spesa registrata.</p>`;
      return;
    }

    for (const exp of this.list) {
      const row = document.createElement("div");
      row.className = "expense-row";
      const baseAmount = exp.amount * exp.exchange_rate;
      const categoryLabel = CATEGORY_LABELS[exp.category] || (window.CustomOptions && CustomOptions.getLabel("expense_category", exp.category)) || exp.category;
      row.innerHTML = `
        <div class="expense-main">
          <strong>${escapeHtml(exp.description)}</strong>
          <small>${escapeHtml(categoryLabel)} · ${escapeHtml(formatDate(exp.expense_date))} · pagato da ${escapeHtml(Auth.otherUserLabel(exp.paid_by))}</small>
        </div>
        <div class="expense-amount">
          <strong>${escapeHtml(formatMoney(exp.amount, exp.currency))}</strong>
          ${exp.currency !== this.trip.base_currency ? `<small>≈ ${escapeHtml(formatMoney(baseAmount, this.trip.base_currency))}</small>` : ""}
        </div>
        <button class="icon-btn edit-expense" title="Modifica">✏️</button>
        <button class="icon-btn delete-expense" title="Elimina">✕</button>
      `;
      row.querySelector(".edit-expense").addEventListener("click", () => this.startEdit(exp));
      row.querySelector(".delete-expense").addEventListener("click", () => this.remove(exp.id));
      container.appendChild(row);
    }
  },

  renderBalance() {
    const me = Auth.currentUser.id;
    let owedToMe = 0;
    let iOwe = 0;

    for (const exp of this.list) {
      const baseAmount = exp.amount * exp.exchange_rate;
      const otherShare = baseAmount * (1 - exp.payer_share_percent / 100);
      if (exp.paid_by === me) {
        owedToMe += otherShare;
      } else {
        iOwe += otherShare;
      }
    }

    const net = owedToMe - iOwe;
    const el = document.getElementById("balance-summary");
    const currency = this.trip.base_currency;

    if (Math.abs(net) < 0.005) {
      el.innerHTML = `<span class="balance-neutral">Siete in pari! 🎉</span>`;
    } else if (net > 0) {
      el.innerHTML = `${escapeHtml(Auth.otherName())} ti deve <strong class="balance-positive">${escapeHtml(formatMoney(net, currency))}</strong>`;
    } else {
      el.innerHTML = `Devi <strong class="balance-negative">${escapeHtml(formatMoney(-net, currency))}</strong> a ${escapeHtml(Auth.otherName())}`;
    }
  },

  renderCategoryBreakdown() {
    const totals = {};
    for (const exp of this.list) {
      const baseAmount = exp.amount * exp.exchange_rate;
      totals[exp.category] = (totals[exp.category] || 0) + baseAmount;
    }
    const container = document.getElementById("category-breakdown");
    container.innerHTML = "";
    const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0) || 1;

    for (const [cat, total] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
      const pct = (total / grandTotal * 100).toFixed(0);
      const label = CATEGORY_LABELS[cat] || (window.CustomOptions && CustomOptions.getLabel("expense_category", cat)) || cat;
      const row = document.createElement("div");
      row.className = "category-row";
      row.innerHTML = `
        <span>${escapeHtml(label)}</span>
        <div class="category-bar"><div class="category-bar-fill" style="width:${pct}%"></div></div>
        <span>${escapeHtml(formatMoney(total, this.trip.base_currency))}</span>
      `;
      container.appendChild(row);
    }
  }
};

const CATEGORY_LABELS = {
  voli: "✈️ Voli",
  trasporti: "🚌 Trasporti locali",
  auto: "🚗 Auto/Noleggio",
  alloggio: "🏨 Alloggio",
  colazione: "🍳 Colazione",
  pranzo: "🍽️ Pranzo",
  cena: "🍷 Cena",
  bar: "☕ Bar/Caffè",
  spesa: "🛒 Spesa/Supermercato",
  escursioni: "🎟️ Escursioni/Attività",
  intrattenimento: "🎭 Intrattenimento",
  shopping: "🛍️ Shopping",
  assicurazione: "🛡️ Assicurazione",
  salute: "💊 Salute/Farmacia",
  regali: "🎁 Regali/Souvenir",
  sim: "📶 SIM/Internet",
  mance: "💰 Mance",
  // valori legacy, per compatibilità con spese create prima di questo aggiornamento
  cibo: "🍽️ Cibo",
  attivita: "🎟️ Attività",
  altro: "📦 Altro"
};
