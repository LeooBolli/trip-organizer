// ============================================================
// To Do: promemoria/checklist per singolo viaggio (cose da
// ricordarsi di fare prima/durante il viaggio).
// ============================================================
const Todos = {
  trip: null,
  list: [],
  channel: null,

  async openForTrip(trip) {
    this.trip = trip;
    if (this.channel) supabaseClient.removeChannel(this.channel);
    this.channel = supabaseClient
      .channel("todos-" + trip.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "todos", filter: `trip_id=eq.${trip.id}` }, () => this.load())
      .subscribe();
    await this.load();
  },

  init() {
    document.getElementById("new-todo-form").addEventListener("submit", (e) => this.create(e));
  },

  async load() {
    const { data, error } = await supabaseClient
      .from("todos")
      .select("*")
      .eq("trip_id", this.trip.id)
      .order("position", { ascending: true });
    if (error) { console.error(error); return; }
    this.list = data;
    this.render();
  },

  async create(e) {
    e.preventDefault();
    const input = document.getElementById("todo-title");
    const title = input.value.trim();
    if (!title) return;
    const position = this.list.length > 0 ? Math.max(...this.list.map(t => t.position)) + 1 : 0;

    const { error } = await supabaseClient.from("todos").insert({
      trip_id: this.trip.id, title, position, created_by: Auth.currentUser.id
    });
    if (error) { alert("Errore salvataggio promemoria: " + error.message); return; }
    input.value = "";
    await this.load();
  },

  async toggleDone(todo) {
    todo.done = !todo.done;
    this.render();
    const { error } = await supabaseClient.from("todos").update({ done: todo.done }).eq("id", todo.id);
    if (error) { alert(error.message); await this.load(); }
  },

  async editTitle(todo) {
    const title = prompt("Testo del promemoria:", todo.title);
    if (title === null || !title.trim()) return;
    const { error } = await supabaseClient.from("todos").update({ title: title.trim() }).eq("id", todo.id);
    if (error) { alert(error.message); return; }
    await this.load();
  },

  async remove(id) {
    this.list = this.list.filter(t => t.id !== id);
    this.render();
    const { error } = await supabaseClient.from("todos").delete().eq("id", id);
    if (error) { alert(error.message); await this.load(); }
  },

  render() {
    const doneCount = this.list.filter(t => t.done).length;
    document.getElementById("todo-progress").textContent = this.list.length ? `${doneCount}/${this.list.length} fatti` : "";

    const container = document.getElementById("todo-list");
    container.innerHTML = "";

    if (this.list.length === 0) {
      container.innerHTML = `<p class="empty-state">Nessun promemoria ancora. Aggiungine uno qui sopra!</p>`;
      return;
    }

    // In sospeso prima, fatti in fondo (ma senza sparire, restano spuntabili)
    const sorted = [...this.list].sort((a, b) => (a.done === b.done ? a.position - b.position : a.done ? 1 : -1));

    for (const todo of sorted) {
      const row = document.createElement("div");
      row.className = "packing-row" + (todo.done ? " packing-row-packed" : "");
      row.innerHTML = `
        <label class="packing-check">
          <input type="checkbox" ${todo.done ? "checked" : ""}>
          <span>${escapeHtml(todo.title)}</span>
        </label>
        <button class="icon-btn edit-todo" title="Modifica">✏️</button>
        <button class="icon-btn delete-todo" title="Elimina">✕</button>
      `;
      row.querySelector("input").addEventListener("change", () => this.toggleDone(todo));
      row.querySelector(".edit-todo").addEventListener("click", () => this.editTitle(todo));
      row.querySelector(".delete-todo").addEventListener("click", () => this.remove(todo.id));
      container.appendChild(row);
    }
  }
};
