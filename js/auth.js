// ============================================================
// Autenticazione - email + password
// Gli unici account esistenti sono quelli creati manualmente su
// Supabase (Authentication > Users) da chi amministra l'app.
// ============================================================
const Auth = {
  currentUser: null,

  init(onReady) {
    const form = document.getElementById("login-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email").value.trim().toLowerCase();
      const password = document.getElementById("login-password").value;
      const statusEl = document.getElementById("login-status");

      if (!window.APP_CONFIG.ALLOWED_EMAILS.map(x => x.toLowerCase()).includes(email)) {
        statusEl.textContent = "Questa email non è autorizzata ad accedere.";
        return;
      }

      statusEl.textContent = "Accesso in corso...";
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

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
      document.getElementById("current-user-email").textContent = this.currentUser.email;
    }
  },

  otherUserLabel(userId) {
    if (!this.currentUser) return "";
    return userId === this.currentUser.id ? "Tu" : "Il/la tuo/a compagno/a";
  }
};
