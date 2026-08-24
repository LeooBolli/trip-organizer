// ============================================================
// Voci personalizzate nei menu a tendina: per ogni select
// "collegato" (categoria spesa, tipo prenotazione, tipo tappa,
// categoria valigia...) aggiunge in fondo "+ Aggiungi nuovo..."
// che permette di creare una voce libera, salvata condivisa tra
// i due utenti e riutilizzabile ovunque quel menu compaia.
// ============================================================
const CustomOptions = {
  list: [],
  channel: null,
  ADD_VALUE: "__add_custom__",

  async init() {
    if (this.initialized) { await this.load(); return; }
    this.initialized = true;
    await this.load();

    this.channel = supabaseClient
      .channel("custom-options")
      .on("postgres_changes", { event: "*", schema: "public", table: "custom_options" }, () => this.load())
      .subscribe();

    this.wireSelect("expense-category", "expense_category");
    this.wireSelect("booking-type", "booking_type");
    this.wireSelect("itinerary-type", "itinerary_type");
    this.wireSelect("packing-category", "packing_category");
  },

  async load() {
    const { data, error } = await supabaseClient
      .from("custom_options")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) { console.error(error); return; }
    this.list = data;
    // Ripopola tutti i select già collegati con le voci aggiornate
    for (const [selectId, fieldKey] of Object.entries(this.wired || {})) {
      const select = document.getElementById(selectId);
      if (select) this.populate(select, fieldKey);
    }
  },

  getLabel(fieldKey, value) {
    const found = this.list.find(o => o.field_key === fieldKey && o.value === value);
    return found ? found.label : null;
  },

  wireSelect(selectId, fieldKey) {
    const select = document.getElementById(selectId);
    if (!select) return;
    this.wired = this.wired || {};
    this.wired[selectId] = fieldKey;

    this.populate(select, fieldKey);
    select.dataset.prevValue = select.value;

    select.addEventListener("change", async () => {
      if (select.value !== this.ADD_VALUE) {
        select.dataset.prevValue = select.value;
        return;
      }
      const restoreValue = select.dataset.prevValue;
      const label = prompt("Nome della nuova voce:");
      if (!label || !label.trim()) {
        select.value = restoreValue;
        return;
      }
      const value = "custom_" + label.trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, "_").slice(0, 40) + "_" + Date.now().toString(36);

      const { error } = await supabaseClient.from("custom_options").insert({
        field_key: fieldKey, value, label: label.trim(), created_by: Auth.currentUser.id
      });
      if (error) { alert("Errore salvataggio voce: " + error.message); select.value = restoreValue; return; }

      await this.load();
      select.value = value;
      select.dataset.prevValue = value;
      select.dispatchEvent(new Event("change", { bubbles: false }));
    });
  },

  populate(select, fieldKey) {
    const currentValue = select.value;
    select.querySelectorAll('[data-custom-option="1"]').forEach(o => o.remove());

    const customs = this.list.filter(o => o.field_key === fieldKey);
    for (const c of customs) {
      const opt = document.createElement("option");
      opt.value = c.value;
      opt.textContent = "✏️ " + c.label;
      opt.dataset.customOption = "1";
      select.appendChild(opt);
    }

    const addOpt = document.createElement("option");
    addOpt.value = this.ADD_VALUE;
    addOpt.textContent = "➕ Aggiungi nuovo...";
    addOpt.dataset.customOption = "1";
    select.appendChild(addOpt);

    if ([...select.options].some(o => o.value === currentValue)) {
      select.value = currentValue;
    }
  }
};
