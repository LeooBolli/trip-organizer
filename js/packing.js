// ============================================================
// Valigia: checklist di cosa portare, una lista separata per
// persona (owner_id), con liste predefinite per tipo di viaggio.
// ============================================================
const Packing = {
  trip: null,
  list: [],
  channel: null,
  viewingOwner: "me", // "me" | "other"

  async openForTrip(trip) {
    this.trip = trip;
    this.viewingOwner = "me";
    document.querySelectorAll("#packing-owner-switch .segmented-btn").forEach(b => b.classList.toggle("active", b.dataset.owner === "me"));

    if (this.channel) supabaseClient.removeChannel(this.channel);
    this.channel = supabaseClient
      .channel("packing-" + trip.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "packing_items", filter: `trip_id=eq.${trip.id}` }, () => this.load())
      .subscribe();

    await this.load();
  },

  init() {
    document.getElementById("new-packing-form").addEventListener("submit", (e) => this.create(e));

    document.querySelectorAll("#packing-owner-switch .segmented-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this.viewingOwner = btn.dataset.owner;
        document.querySelectorAll("#packing-owner-switch .segmented-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.render();
      });
    });

    document.querySelectorAll(".packing-template-btn").forEach(btn => {
      btn.addEventListener("click", () => this.addTemplate(btn.dataset.template));
    });
  },

  async load() {
    const { data, error } = await supabaseClient
      .from("packing_items")
      .select("*")
      .eq("trip_id", this.trip.id)
      .order("category", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) { console.error(error); return; }
    this.list = data;
    this.render();
  },

  async create(e) {
    e.preventDefault();
    const category = document.getElementById("packing-category").value;
    const name = document.getElementById("packing-name").value.trim();
    const quantity = parseInt(document.getElementById("packing-quantity").value, 10) || 1;
    if (!name) return;

    const { error } = await supabaseClient.from("packing_items").insert({
      trip_id: this.trip.id, owner_id: Auth.currentUser.id, category, name, quantity
    });
    if (error) { alert("Errore salvataggio oggetto: " + error.message); return; }
    e.target.reset();
    document.getElementById("packing-quantity").value = 1;
  },

  async togglePacked(item) {
    const { error } = await supabaseClient.from("packing_items").update({ packed: !item.packed }).eq("id", item.id);
    if (error) alert(error.message);
  },

  async remove(id) {
    const { error } = await supabaseClient.from("packing_items").delete().eq("id", id);
    if (error) alert(error.message);
  },

  async addTemplate(key) {
    const items = PACKING_TEMPLATES[key];
    if (!items) return;
    const rows = items.map(i => ({
      trip_id: this.trip.id, owner_id: Auth.currentUser.id,
      category: i.category, name: i.name, quantity: i.quantity
    }));
    const { error } = await supabaseClient.from("packing_items").insert(rows);
    if (error) alert(error.message);
  },

  render() {
    const isMe = this.viewingOwner === "me";
    document.getElementById("packing-add-card").classList.toggle("hidden", !isMe);
    document.getElementById("packing-templates-card").classList.toggle("hidden", !isMe);

    const me = Auth.currentUser.id;
    const items = isMe
      ? this.list.filter(i => i.owner_id === me)
      : this.list.filter(i => i.owner_id !== me);

    document.getElementById("packing-list-title").textContent = isMe ? "La mia valigia" : "Valigia del/la compagno/a";

    const packedCount = items.filter(i => i.packed).length;
    document.getElementById("packing-progress").textContent = items.length ? `${packedCount}/${items.length} pronti` : "";

    const container = document.getElementById("packing-list");
    container.innerHTML = "";

    if (items.length === 0) {
      container.innerHTML = `<p class="empty-state">${isMe ? "Nessun oggetto ancora. Aggiungine uno o usa una lista predefinita!" : "Nessun oggetto in questa valigia."}</p>`;
      return;
    }

    const byCategory = {};
    for (const item of items) {
      if (!byCategory[item.category]) byCategory[item.category] = [];
      byCategory[item.category].push(item);
    }

    for (const [category, catItems] of Object.entries(byCategory)) {
      const catHeader = document.createElement("div");
      catHeader.className = "packing-category-header";
      catHeader.textContent = PACKING_CATEGORY_LABELS[category] || category;
      container.appendChild(catHeader);

      for (const item of catItems) {
        const row = document.createElement("div");
        row.className = "packing-row" + (item.packed ? " packing-row-packed" : "");
        row.innerHTML = `
          <label class="packing-check">
            <input type="checkbox" ${item.packed ? "checked" : ""}>
            <span>${escapeHtml(item.name)}${item.quantity > 1 ? ` <small>×${item.quantity}</small>` : ""}</span>
          </label>
          ${isMe ? `<button class="icon-btn delete-packing-item" title="Elimina">✕</button>` : ""}
        `;
        row.querySelector("input").addEventListener("change", () => this.togglePacked(item));
        const delBtn = row.querySelector(".delete-packing-item");
        if (delBtn) delBtn.addEventListener("click", () => this.remove(item.id));
        container.appendChild(row);
      }
    }
  }
};

const PACKING_CATEGORY_LABELS = {
  abbigliamento: "👕 Abbigliamento",
  elettronica: "🔌 Elettronica",
  documenti: "📄 Documenti",
  igiene: "🧴 Igiene",
  salute: "💊 Salute",
  altro: "📦 Altro"
};

const PACKING_TEMPLATES = {
  mare: [
    { category: "abbigliamento", name: "Costume da bagno", quantity: 2 },
    { category: "abbigliamento", name: "Telo mare", quantity: 1 },
    { category: "altro", name: "Crema solare", quantity: 1 },
    { category: "altro", name: "Occhiali da sole", quantity: 1 },
    { category: "abbigliamento", name: "Infradito", quantity: 1 },
    { category: "documenti", name: "Documento d'identità", quantity: 1 },
    { category: "elettronica", name: "Caricabatterie", quantity: 1 }
  ],
  montagna: [
    { category: "abbigliamento", name: "Giacca impermeabile", quantity: 1 },
    { category: "abbigliamento", name: "Pile/maglione caldo", quantity: 2 },
    { category: "abbigliamento", name: "Scarponi/scarpe da trekking", quantity: 1 },
    { category: "abbigliamento", name: "Guanti e cappello", quantity: 1 },
    { category: "altro", name: "Crema solare", quantity: 1 },
    { category: "documenti", name: "Documento d'identità", quantity: 1 },
    { category: "elettronica", name: "Caricabatterie", quantity: 1 }
  ],
  citta: [
    { category: "abbigliamento", name: "Scarpe comode da camminata", quantity: 1 },
    { category: "elettronica", name: "Caricabatterie", quantity: 1 },
    { category: "elettronica", name: "Powerbank", quantity: 1 },
    { category: "documenti", name: "Documento d'identità", quantity: 1 },
    { category: "documenti", name: "Carta di credito/contanti", quantity: 1 },
    { category: "igiene", name: "Kit da viaggio igiene", quantity: 1 }
  ],
  lavoro: [
    { category: "elettronica", name: "Laptop e caricabatterie", quantity: 1 },
    { category: "elettronica", name: "Adattatore/presa universale", quantity: 1 },
    { category: "abbigliamento", name: "Outfit formale", quantity: 2 },
    { category: "documenti", name: "Biglietti da visita", quantity: 1 },
    { category: "documenti", name: "Documento d'identità", quantity: 1 }
  ]
};
