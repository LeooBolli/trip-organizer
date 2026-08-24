// ============================================================
// Autenticazione - email + password
// Gli unici account esistenti sono quelli creati manualmente su
// Supabase (Authentication > Users) da chi amministra l'app.
// ============================================================
const Auth = {
  currentUser: null,
  otherUserId: null,
  EMAIL_STORAGE_KEY: "trip-organizer-last-email",

  init(onReady) {
    const form = document.getElementById("login-form");
    const emailInput = document.getElementById("login-email");

    const savedEmail = localStorage.getItem(this.EMAIL_STORAGE_KEY);
    if (savedEmail) emailInput.value = savedEmail;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim().toLowerCase();
      const password = document.getElementById("login-password").value;
      const statusEl = document.getElementById("login-status");

      if (!window.APP_CONFIG.ALLOWED_EMAILS.map(x => x.toLowerCase()).includes(email)) {
        statusEl.textContent = "Questa email non è autorizzata ad accedere.";
        return;
      }

      statusEl.textContent = "Accesso in corso...";
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

      if (!error) localStorage.setItem(this.EMAIL_STORAGE_KEY, email);
      statusEl.textContent = error ? "Email o password non corrette." : "";
    });

    document.getElementById("logout-btn").addEventListener("click", async () => {
      await supabaseClient.auth.signOut();
    });

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      this.currentUser = session ? session.user : null;
      this.updateUI();
      if (this.currentUser) onReady(this.currentUser);
    });

    supabaseClient.auth.getSession().then(({ data }) => {
      this.currentUser = data.session ? data.session.user : null;
      this.updateUI();
      if (this.currentUser) onReady(this.currentUser);
    });
  },

  updateUI() {
    const loggedIn = !!this.currentUser;
    document.getElementById("view-login").classList.toggle("hidden", loggedIn);
    document.getElementById("app-shell").classList.toggle("hidden", !loggedIn);
    if (loggedIn) {
      const email = this.currentUser.email;
      document.getElementById("current-user-email").textContent = window.APP_CONFIG.USER_NAMES[email] || email;
    }
  },

  // Nome reale della persona proprietaria di userId (funziona per te
  // e per l'altra persona, senza mai usare "tuo/a compagno/a")
  otherUserLabel(userId) {
    if (!this.currentUser) return "";
    if (userId === this.currentUser.id) return this.myName();
    return this.otherName();
  },

  myName() {
    if (!this.currentUser) return "Tu";
    return window.APP_CONFIG.USER_NAMES[this.currentUser.email] || this.currentUser.email;
  },

  otherName() {
    if (!this.currentUser) return "";
    const otherEmail = window.APP_CONFIG.ALLOWED_EMAILS.find(
      e => e.toLowerCase() !== this.currentUser.email.toLowerCase()
    );
    return (otherEmail && window.APP_CONFIG.USER_NAMES[otherEmail]) || "l'altra persona";
  },

  // L'app non può leggere auth.users direttamente (lato client), quindi
  // per scoprire l'id dell'altra persona cerchiamo una riga qualsiasi,
  // in una tabella qualsiasi, creata/pagata/posseduta da qualcun altro
  // che non sia noi. Basta che l'altra persona abbia usato l'app almeno
  // una volta in una qualsiasi sezione.
  async discoverOtherUserId() {
    if (this.otherUserId) return this.otherUserId;
    const me = this.currentUser.id;
    const sources = [
      { table: "expenses", column: "paid_by" },
      { table: "packing_items", column: "owner_id" },
      { table: "trips", column: "created_by" },
      { table: "bookings", column: "created_by" },
      { table: "todos", column: "created_by" },
      { table: "itinerary_items", column: "created_by" },
      { table: "documents", column: "uploaded_by" },
      { table: "packing_organizers", column: "owner_id" },
      { table: "packing_templates", column: "owner_id" }
    ];
    for (const { table, column } of sources) {
      const { data } = await supabaseClient
        .from(table).select(column).neq(column, me).not(column, "is", null).limit(1);
      if (data && data.length > 0) {
        this.otherUserId = data[0][column];
        return this.otherUserId;
      }
    }
    return null;
  }
};
