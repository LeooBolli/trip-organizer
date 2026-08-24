// ============================================================
// Valigia: organizer a scelta libera (Valigia, Zaino, Beauty
// case...) per persona, ognuno con la propria checklist a
// categorie, liste predefinite e modelli personalizzati salvabili.
// ============================================================
const Packing = {
  trip: null,
  list: [], // packing_items
  organizers: [], // packing_organizers
  customTemplates: [],
  channel: null,
  organizersChannel: null,
  templatesChannel: null,
  viewingOwner: "me", // "me" | "other"
  migrationDone: false,

  async openForTrip(trip) {
    this.trip = trip;
    this.viewingOwner = "me";
    this.migrationDone = false;
    document.querySelectorAll("#packing-owner-switch .segmented-btn").forEach(b => b.classList.toggle("active", b.dataset.owner === "me"));
    document.getElementById("packing-other-label").textContent = Auth.otherName();

    if (this.channel) supabaseClient.removeChannel(this.channel);
    this.channel = supabaseClient
      .channel("packing-" + trip.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "packing_items", filter: `trip_id=eq.${trip.id}` }, () => this.load())
      .subscribe();

    if (this.organizersChannel) supabaseClient.removeChannel(this.organizersChannel);
    this.organizersChannel = supabaseClient
      .channel("packing-organizers-" + trip.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "packing_organizers", filter: `trip_id=eq.${trip.id}` }, () => this.loadOrganizers())
      .subscribe();

    await this.loadOrganizers();
    await this.load();
  },

  init() {
    document.getElementById("new-packing-form").addEventListener("submit", (e) => this.create(e));
    document.getElementById("save-packing-template-btn").addEventListener("click", () => this.saveAsTemplate());

    const orgSelect = document.getElementById("packing-organizer");
    orgSelect.dataset.prevValue = "";
    orgSelect.addEventListener("change", async () => {
      if (orgSelect.value !== "__new_organizer__") { orgSelect.dataset.prevValue = orgSelect.value; return; }
      const restore = orgSelect.dataset.prevValue;
      const name = prompt("Nome del nuovo organizer (es. \"Valigia\", \"Zaino\", \"Beauty case\"):");
      if (!name || !name.trim()) { orgSelect.value = restore; return; }
      const newId = await this.createOrganizer(name.trim());
      if (newId) { orgSelect.value = newId; orgSelect.dataset.prevValue = newId; }
      else { orgSelect.value = restore; }
    });

    document.querySelectorAll(".organizer-preset-btn").forEach(btn => {
      btn.addEventListener("click", () => this.createOrganizer(btn.dataset.name));
    });
    document.getElementById("organizer-custom-btn").addEventListener("click", async () => {
      const name = prompt("Nome del nuovo organizer:");
      if (!name || !name.trim()) return;
      await this.createOrganizer(name.trim());
    });

    document.querySelectorAll("#packing-owner-switch .segmented-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this.viewingOwner = btn.dataset.owner;
        document.querySelectorAll("#packing-owner-switch .segmented-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.render();
      });
    });

    document.querySelectorAll(".packing-template-btn").forEach(btn => {
      btn.addEventListener("click", () => this.addTemplate(PACKING_TEMPLATES[btn.dataset.template], btn.textContent.trim()));
    });

    this.templatesChannel = supabaseClient
      .channel("packing-templates")
      .on("postgres_changes", { event: "*", schema: "public", table: "packing_templates" }, () => this.loadCustomTemplates())
      .subscribe();
    this.loadCustomTemplates();
  },

  async loadOrganizers() {
    const { data, error } = await supabaseClient
      .from("packing_organizers")
      .select("*")
      .eq("trip_id", this.trip.id)
      .order("position", { ascending: true });
    if (error) { console.error(error); return; }
    this.organizers = data;

    const me = Auth.currentUser.id;
    if (!this.organizers.some(o => o.owner_id === me)) {
      await this.createOrganizer("Valigia", false);
      return; // createOrganizer ricarica organizers e chiama di nuovo render
    }

    this.populateOrganizerSelect();
    this.render();
  },

  populateOrganizerSelect() {
    const select = document.getElementById("packing-organizer");
    const current = select.value;
    select.innerHTML = "";
    const me = Auth.currentUser.id;
    for (const org of this.organizers.filter(o => o.owner_id === me)) {
      const opt = document.createElement("option");
      opt.value = org.id;
      opt.textContent = org.name;
      select.appendChild(opt);
    }
    const addOpt = document.createElement("option");
    addOpt.value = "__new_organizer__";
    addOpt.textContent = "➕ Nuovo organizer...";
    select.appendChild(addOpt);

    if ([...select.options].some(o => o.value === current)) select.value = current;
    select.dataset.prevValue = select.value;
  },

  async createOrganizer(name, refresh = true) {
    const me = Auth.currentUser.id;
    const mine = this.organizers.filter(o => o.owner_id === me);

    // Se hai già un organizer con questo nome, non ne crea uno doppio:
    // seleziona semplicemente quello esistente.
    const existing = mine.find(o => o.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) {
      const select = document.getElementById("packing-organizer");
      select.value = existing.id;
      select.dataset.prevValue = existing.id;
      return existing.id;
    }

    const position = mine.length > 0 ? Math.max(...mine.map(o => o.position)) + 1 : 0;

    const { data, error } = await supabaseClient.from("packing_organizers").insert({
      trip_id: this.trip.id, owner_id: me, name, position
    }).select().single();
    if (error) { alert("Errore creazione organizer: " + error.message); return null; }

    if (refresh) await this.loadOrganizers();
    const select = document.getElementById("packing-organizer");
    select.value = data.id;
    select.dataset.prevValue = data.id;
    return data.id;
  },

  async renameOrganizer(org) {
    const name = prompt("Nuovo nome dell'organizer:", org.name);
    if (!name || !name.trim()) return;
    const { error } = await supabaseClient.from("packing_organizers").update({ name: name.trim() }).eq("id", org.id);
    if (error) { alert(error.message); return; }
    await this.loadOrganizers();
  },

  async removeOrganizer(org) {
    const itemCount = this.list.filter(i => i.organizer_id === org.id).length;
    const msg = itemCount > 0
      ? `Eliminare "${org.name}" e i ${itemCount} oggetti al suo interno?`
      : `Eliminare "${org.name}"?`;
    if (!confirm(msg)) return;
    const { error } = await supabaseClient.from("packing_organizers").delete().eq("id", org.id);
    if (error) { alert(error.message); return; }
    await this.loadOrganizers();
    await this.load();
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
    await this.migrateOrphanItems();
    this.render();
  },

  // Oggetti creati prima dell'introduzione degli organizer (organizer_id
  // nullo): li assegna al primo organizer disponibile della persona.
  async migrateOrphanItems() {
    if (this.migrationDone) return;
    const me = Auth.currentUser.id;
    const orphans = this.list.filter(i => i.owner_id === me && !i.organizer_id);
    if (orphans.length === 0) { this.migrationDone = true; return; }
    const myOrganizer = this.organizers.find(o => o.owner_id === me);
    if (!myOrganizer) return; // loadOrganizers ne creerà uno e richiamerà load()

    this.migrationDone = true;
    const ids = orphans.map(i => i.id);
    const { error } = await supabaseClient.from("packing_items")
      .update({ organizer_id: myOrganizer.id })
      .in("id", ids);
    if (!error) {
      for (const item of this.list) {
        if (ids.includes(item.id)) item.organizer_id = myOrganizer.id;
      }
    }
  },

  async loadCustomTemplates() {
    const { data, error } = await supabaseClient
      .from("packing_templates")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) { console.error(error); return; }
    this.customTemplates = data;
    this.renderCustomTemplates();
  },

  async create(e) {
    e.preventDefault();
    const organizer_id = document.getElementById("packing-organizer").value;
    if (!organizer_id || organizer_id === "__new_organizer__") return;
    const category = document.getElementById("packing-category").value;
    const name = document.getElementById("packing-name").value.trim();
    const quantity = parseInt(document.getElementById("packing-quantity").value, 10) || 1;
    if (!name) return;

    const { error } = await supabaseClient.from("packing_items").insert({
      trip_id: this.trip.id, owner_id: Auth.currentUser.id, organizer_id, category, name, quantity
    });
    if (error) { alert("Errore salvataggio oggetto: " + error.message); return; }
    document.getElementById("packing-name").value = "";
    document.getElementById("packing-quantity").value = 1;
    await this.load();
  },

  async togglePacked(item) {
    item.packed = !item.packed;
    this.render();
    const { error } = await supabaseClient.from("packing_items").update({ packed: item.packed }).eq("id", item.id);
    if (error) { alert(error.message); await this.load(); }
  },

  async editName(item) {
    const newName = prompt("Nome oggetto:", item.name);
    if (newName === null) return;
    const name = newName.trim();
    if (!name) return;

    const { error } = await supabaseClient.from("packing_items").update({ name }).eq("id", item.id);
    if (error) { alert(error.message); return; }
    await this.load();
  },

  async editQuantity(item) {
    const newQuantityStr = prompt("Quanti ne porti?", item.quantity);
    if (newQuantityStr === null) return;
    const quantity = Math.max(1, parseInt(newQuantityStr, 10) || 1);

    item.quantity = quantity;
    this.render();
    const { error } = await supabaseClient.from("packing_items").update({ quantity }).eq("id", item.id);
    if (error) { alert(error.message); await this.load(); }
  },

  async moveItem(item) {
    const me = Auth.currentUser.id;
    const otherOrganizers = this.organizers.filter(o => o.owner_id === me && o.id !== item.organizer_id);
    if (otherOrganizers.length === 0) {
      alert("Non hai altri organizer in cui spostarlo. Creane uno prima dal form qui sopra.");
      return;
    }
    const list = otherOrganizers.map((o, i) => `${i + 1}. ${o.name}`).join("\n");
    const choice = prompt(`Sposta "${item.name}" in quale organizer?\n${list}`, "1");
    if (choice === null) return;
    const idx = parseInt(choice, 10) - 1;
    const target = otherOrganizers[idx];
    if (!target) return;

    item.organizer_id = target.id;
    this.render();
    const { error } = await supabaseClient.from("packing_items").update({ organizer_id: target.id }).eq("id", item.id);
    if (error) { alert(error.message); await this.load(); }
  },

  async remove(id) {
    this.list = this.list.filter(i => i.id !== id);
    this.render();
    const { error } = await supabaseClient.from("packing_items").delete().eq("id", id);
    if (error) { alert(error.message); await this.load(); }
  },

  async addTemplate(items, templateLabel) {
    if (!items || items.length === 0) return;
    let organizer_id = document.getElementById("packing-organizer").value;
    if (!organizer_id || organizer_id === "__new_organizer__") {
      organizer_id = await this.createOrganizer((templateLabel || "Valigia").replace(/^[^\w]+/, "").trim() || "Valigia");
      if (!organizer_id) return;
    }
    const rows = items.map(i => ({
      trip_id: this.trip.id, owner_id: Auth.currentUser.id, organizer_id,
      category: i.category, name: i.name, quantity: i.quantity
    }));
    const { error } = await supabaseClient.from("packing_items").insert(rows);
    if (error) { alert(error.message); return; }
    await this.load();
  },

  async saveAsTemplate() {
    const me = Auth.currentUser.id;
    const myItems = this.list.filter(i => i.owner_id === me);
    if (myItems.length === 0) {
      alert("La tua valigia per questo viaggio è vuota: aggiungi degli oggetti prima di salvarla come modello.");
      return;
    }
    const name = prompt("Nome del modello (es. \"Weekend corto\", \"Trekking\"):");
    if (!name || !name.trim()) return;

    const items = myItems.map(i => ({ category: i.category, name: i.name, quantity: i.quantity }));
    const { error } = await supabaseClient.from("packing_templates").insert({
      owner_id: me, name: name.trim(), items
    });
    if (error) { alert("Errore salvataggio modello: " + error.message); return; }
    await this.loadCustomTemplates();
  },

  async removeTemplate(id) {
    if (!confirm("Eliminare questo modello salvato?")) return;
    const { error } = await supabaseClient.from("packing_templates").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    await this.loadCustomTemplates();
  },

  renderCustomTemplates() {
    const container = document.getElementById("packing-custom-templates");
    container.innerHTML = "";
    if (this.customTemplates.length === 0) return;

    for (const tpl of this.customTemplates) {
      const wrap = document.createElement("span");
      wrap.className = "custom-template-chip";
      wrap.innerHTML = `
        <button type="button" class="secondary-btn apply-template-btn">💾 ${escapeHtml(tpl.name)}</button>
        <button type="button" class="icon-btn delete-template-btn" title="Elimina modello">✕</button>
      `;
      wrap.querySelector(".apply-template-btn").addEventListener("click", () => this.addTemplate(tpl.items, tpl.name));
      wrap.querySelector(".delete-template-btn").addEventListener("click", () => this.removeTemplate(tpl.id));
      container.appendChild(wrap);
    }
  },

  render() {
    const isMe = this.viewingOwner === "me";
    document.getElementById("packing-add-card").classList.toggle("hidden", !isMe);
    document.getElementById("packing-save-template-card").classList.toggle("hidden", !isMe);
    document.getElementById("packing-templates-card").classList.toggle("hidden", !isMe);
    document.getElementById("packing-organizer-quickadd-card").classList.toggle("hidden", !isMe);

    const me = Auth.currentUser.id;
    const ownerId = isMe ? me : (this.organizers.find(o => o.owner_id !== me)?.owner_id);
    const myOrganizers = this.organizers.filter(o => o.owner_id === ownerId).sort((a, b) => a.position - b.position);
    const myItems = ownerId ? this.list.filter(i => i.owner_id === ownerId) : [];

    document.getElementById("packing-list-title").textContent = isMe ? "La mia valigia" : `Valigia di ${Auth.otherName()}`;
    const packedCount = myItems.filter(i => i.packed).length;
    document.getElementById("packing-progress").textContent = myItems.length ? `${packedCount}/${myItems.length} pronti in totale` : "";

    const container = document.getElementById("packing-organizers-container");
    container.innerHTML = "";

    if (myOrganizers.length === 0) {
      container.innerHTML = `<p class="empty-state">${isMe ? "Crea il tuo primo organizer (es. \"Valigia\") dal form qui sopra." : "Nessun organizer ancora."}</p>`;
      return;
    }

    for (const org of myOrganizers) {
      const orgItems = myItems.filter(i => i.organizer_id === org.id);
      const orgPacked = orgItems.filter(i => i.packed).length;

      const card = document.createElement("div");
      card.className = "card packing-organizer-card";
      const header = document.createElement("div");
      header.className = "card-header";
      header.innerHTML = `
        <h3>🧳 ${escapeHtml(org.name)}</h3>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="card-sub">${orgItems.length ? `${orgPacked}/${orgItems.length}` : ""}</span>
          ${isMe ? `
            <button type="button" class="icon-btn rename-organizer" title="Rinomina">✏️</button>
            <button type="button" class="icon-btn delete-organizer" title="Elimina organizer">✕</button>
          ` : ""}
        </div>
      `;
      if (isMe) {
        header.querySelector(".rename-organizer").addEventListener("click", () => this.renameOrganizer(org));
        header.querySelector(".delete-organizer").addEventListener("click", () => this.removeOrganizer(org));
      }
      card.appendChild(header);

      if (orgItems.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "Vuoto per ora.";
        card.appendChild(empty);
      } else {
        const byCategory = {};
        for (const item of orgItems) {
          if (!byCategory[item.category]) byCategory[item.category] = [];
          byCategory[item.category].push(item);
        }
        for (const [category, catItems] of Object.entries(byCategory)) {
          const catHeader = document.createElement("div");
          catHeader.className = "packing-category-header";
          catHeader.textContent = PACKING_CATEGORY_LABELS[category] || (window.CustomOptions && CustomOptions.getLabel("packing_category", category)) || category;
          card.appendChild(catHeader);

          for (const item of catItems) {
            const row = document.createElement("div");
            row.className = "packing-row" + (item.packed ? " packing-row-packed" : "");
            row.innerHTML = `
              <label class="packing-check">
                <input type="checkbox" ${item.packed ? "checked" : ""}>
                <span>${escapeHtml(item.name)}</span>
              </label>
              ${isMe ? `
                <button type="button" class="qty-badge" title="Cambia quantità">×${item.quantity}</button>
                <button class="icon-btn move-packing-item" title="Sposta in un altro organizer">📦</button>
                <button class="icon-btn edit-packing-item" title="Rinomina">✏️</button>
                <button class="icon-btn delete-packing-item" title="Elimina">✕</button>
              ` : `<span class="qty-badge qty-badge-readonly">×${item.quantity}</span>`}
            `;
            row.querySelector("input").addEventListener("change", () => this.togglePacked(item));
            const qtyBtn = row.querySelector(".qty-badge:not(.qty-badge-readonly)");
            if (qtyBtn) qtyBtn.addEventListener("click", () => this.editQuantity(item));
            const moveBtn = row.querySelector(".move-packing-item");
            if (moveBtn) moveBtn.addEventListener("click", () => this.moveItem(item));
            const editBtn = row.querySelector(".edit-packing-item");
            if (editBtn) editBtn.addEventListener("click", () => this.editName(item));
            const delBtn = row.querySelector(".delete-packing-item");
            if (delBtn) delBtn.addEventListener("click", () => this.remove(item.id));
            card.appendChild(row);
          }
        }
      }

      container.appendChild(card);
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
  essenziali: [
    { category: "abbigliamento", name: "Magliette/T-shirt", quantity: 6 },
    { category: "abbigliamento", name: "Biancheria intima", quantity: 7 },
    { category: "abbigliamento", name: "Calzini", quantity: 7 },
    { category: "abbigliamento", name: "Pantaloni/jeans", quantity: 2 },
    { category: "abbigliamento", name: "Pantaloncini/gonna", quantity: 2 },
    { category: "abbigliamento", name: "Felpa o maglione leggero", quantity: 1 },
    { category: "abbigliamento", name: "Giacca leggera/antivento", quantity: 1 },
    { category: "abbigliamento", name: "Pigiama", quantity: 1 },
    { category: "abbigliamento", name: "Scarpe comode da camminata", quantity: 1 },
    { category: "abbigliamento", name: "Ciabatte/infradito", quantity: 1 },
    { category: "abbigliamento", name: "Costume da bagno", quantity: 1 },
    { category: "abbigliamento", name: "Cintura", quantity: 1 },
    { category: "abbigliamento", name: "Cappello/berretto", quantity: 1 },
    { category: "igiene", name: "Spazzolino e dentifricio", quantity: 1 },
    { category: "igiene", name: "Shampoo/bagnoschiuma formato viaggio", quantity: 1 },
    { category: "igiene", name: "Deodorante", quantity: 1 },
    { category: "igiene", name: "Rasoio", quantity: 1 },
    { category: "igiene", name: "Spazzola/pettine", quantity: 1 },
    { category: "igiene", name: "Tagliaunghie", quantity: 1 },
    { category: "salute", name: "Farmaci personali", quantity: 1 },
    { category: "salute", name: "Kit primo soccorso (cerotti, disinfettante)", quantity: 1 },
    { category: "salute", name: "Antidolorifico da banco", quantity: 1 },
    { category: "salute", name: "Crema solare", quantity: 1 },
    { category: "elettronica", name: "Caricabatterie telefono", quantity: 1 },
    { category: "elettronica", name: "Powerbank", quantity: 1 },
    { category: "elettronica", name: "Adattatore universale", quantity: 1 },
    { category: "elettronica", name: "Cuffie/auricolari", quantity: 1 },
    { category: "documenti", name: "Documento d'identità/passaporto", quantity: 1 },
    { category: "documenti", name: "Biglietti/carte d'imbarco", quantity: 1 },
    { category: "documenti", name: "Carta di credito/contanti", quantity: 1 },
    { category: "documenti", name: "Assicurazione di viaggio", quantity: 1 },
    { category: "documenti", name: "Fotocopia/foto documenti (di scorta)", quantity: 1 },
    { category: "altro", name: "Occhiali da sole", quantity: 1 },
    { category: "altro", name: "Zainetto/borsa da giorno", quantity: 1 },
    { category: "altro", name: "Bottiglia d'acqua riutilizzabile", quantity: 1 },
    { category: "altro", name: "Libro/e-reader per il viaggio", quantity: 1 },
    { category: "altro", name: "Snack per il viaggio", quantity: 2 }
  ],
  sud_est_asiatico: [
    { category: "abbigliamento", name: "Abbigliamento leggero e traspirante", quantity: 5 },
    { category: "abbigliamento", name: "Costume da bagno", quantity: 2 },
    { category: "abbigliamento", name: "Foulard per coprire le spalle nei templi", quantity: 1 },
    { category: "abbigliamento", name: "Infradito/ciabatte", quantity: 1 },
    { category: "salute", name: "Repellente zanzare ad alta concentrazione", quantity: 1 },
    { category: "salute", name: "Crema solare alta protezione", quantity: 1 },
    { category: "salute", name: "Antidiarroico e sali reidratanti", quantity: 1 },
    { category: "altro", name: "Ombrello pieghevole (stagione monsoni)", quantity: 1 },
    { category: "elettronica", name: "Adattatore universale", quantity: 1 },
    { category: "elettronica", name: "Powerbank", quantity: 1 },
    { category: "documenti", name: "Passaporto (validità residua min. 6 mesi)", quantity: 1 },
    { category: "documenti", name: "Assicurazione di viaggio", quantity: 1 }
  ],
  sud_america: [
    { category: "abbigliamento", name: "Giacca a vento impermeabile", quantity: 1 },
    { category: "abbigliamento", name: "Strati termici (sbalzi giorno/notte)", quantity: 2 },
    { category: "abbigliamento", name: "Scarponcini da trekking", quantity: 1 },
    { category: "abbigliamento", name: "Cappello e guanti leggeri", quantity: 1 },
    { category: "salute", name: "Pastiglie per mal di montagna (alta quota)", quantity: 1 },
    { category: "salute", name: "Crema solare alta protezione", quantity: 1 },
    { category: "salute", name: "Repellente insetti", quantity: 1 },
    { category: "documenti", name: "Passaporto", quantity: 1 },
    { category: "documenti", name: "Contanti in dollari (riserva)", quantity: 1 },
    { category: "elettronica", name: "Adattatore presa tipo C/I", quantity: 1 },
    { category: "elettronica", name: "Powerbank", quantity: 1 }
  ],
  caraibi: [
    { category: "abbigliamento", name: "Costumi da bagno", quantity: 3 },
    { category: "abbigliamento", name: "Cappello a tesa larga", quantity: 1 },
    { category: "abbigliamento", name: "Copricostume leggero", quantity: 1 },
    { category: "salute", name: "Crema solare waterproof alta protezione", quantity: 1 },
    { category: "salute", name: "Doposole", quantity: 1 },
    { category: "salute", name: "Repellente zanzare", quantity: 1 },
    { category: "altro", name: "Occhiali da sole", quantity: 1 },
    { category: "altro", name: "Sacchetto stagno per il telefono", quantity: 1 },
    { category: "altro", name: "Ciabatte/sandali", quantity: 1 },
    { category: "documenti", name: "Passaporto", quantity: 1 }
  ],
  citta_europea: [
    { category: "abbigliamento", name: "Scarpe comode da camminata", quantity: 1 },
    { category: "abbigliamento", name: "Outfit per una serata/cena", quantity: 1 },
    { category: "altro", name: "Ombrello tascabile", quantity: 1 },
    { category: "elettronica", name: "Powerbank", quantity: 1 },
    { category: "elettronica", name: "Caricabatterie", quantity: 1 },
    { category: "documenti", name: "Documento d'identità", quantity: 1 },
    { category: "documenti", name: "Carta di credito/contanti", quantity: 1 }
  ],
  montagna_neve: [
    { category: "abbigliamento", name: "Giacca e pantaloni da sci", quantity: 1 },
    { category: "abbigliamento", name: "Strati termici", quantity: 2 },
    { category: "abbigliamento", name: "Guanti, cappello, scaldacollo", quantity: 1 },
    { category: "abbigliamento", name: "Calzini tecnici da sci", quantity: 3 },
    { category: "salute", name: "Crema solare alta protezione (riflesso neve)", quantity: 1 },
    { category: "salute", name: "Burrocacao/doposole", quantity: 1 },
    { category: "altro", name: "Occhiali da sole o maschera da sci", quantity: 1 },
    { category: "documenti", name: "Documento d'identità", quantity: 1 }
  ],
  safari_africa: [
    { category: "abbigliamento", name: "Abbigliamento leggero colori neutri", quantity: 4 },
    { category: "abbigliamento", name: "Giacca leggera (mattine/sere fresche)", quantity: 1 },
    { category: "abbigliamento", name: "Cappello a tesa larga", quantity: 1 },
    { category: "salute", name: "Repellente zanzare ad alta concentrazione", quantity: 1 },
    { category: "salute", name: "Antimalarici (su indicazione medica)", quantity: 1 },
    { category: "salute", name: "Crema solare alta protezione", quantity: 1 },
    { category: "documenti", name: "Passaporto e certificato febbre gialla", quantity: 1 },
    { category: "elettronica", name: "Binocolo", quantity: 1 },
    { category: "elettronica", name: "Powerbank", quantity: 1 }
  ],
  lavoro: [
    { category: "elettronica", name: "Laptop e caricabatterie", quantity: 1 },
    { category: "elettronica", name: "Adattatore universale", quantity: 1 },
    { category: "abbigliamento", name: "Outfit formale", quantity: 2 },
    { category: "documenti", name: "Biglietti da visita", quantity: 1 },
    { category: "documenti", name: "Documento d'identità", quantity: 1 }
  ]
};
