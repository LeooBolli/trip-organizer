// ============================================================
// CONFIGURAZIONE - da compilare dopo aver creato il progetto Supabase
// (vedi README.md per la guida passo passo)
// ============================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-PUBLIC-KEY",

  // Le uniche email autorizzate ad usare l'app.
  // Anche se qualcuno indovinasse l'URL, senza essere in questa lista
  // (ed essere stato invitato su Supabase Auth) non entra.
  ALLOWED_EMAILS: [
    "tua-email@esempio.com",
    "email-compagna@esempio.com"
  ],

  DEFAULT_BASE_CURRENCY: "EUR",
  SUPPORTED_CURRENCIES: ["EUR", "USD", "GBP", "CHF", "JPY"]
};
