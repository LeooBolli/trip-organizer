// ============================================================
// CONFIGURAZIONE - da compilare dopo aver creato il progetto Supabase
// (vedi README.md per la guida passo passo)
// ============================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://jhfdfupbifobpznnriwu.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_A3p9QZtklZpzxo73q6iOlw_kjg91oWW",

  // Le uniche email autorizzate ad usare l'app.
  // Anche se qualcuno indovinasse l'URL, senza essere in questa lista
  // (ed essere stato invitato su Supabase Auth) non entra.
  ALLOWED_EMAILS: [
    "leonardobolli@gmail.com",
    "biagettimariachiara@gmail.com"
  ],

  // Nome mostrato al posto dell'email (es. "Connesso come Leonardo")
  USER_NAMES: {
    "leonardobolli@gmail.com": "Leonardo",
    "biagettimariachiara@gmail.com": "Chiara"
  },

  DEFAULT_BASE_CURRENCY: "EUR",
  SUPPORTED_CURRENCIES: ["EUR", "USD", "GBP", "CHF", "JPY", "COP", "XCG", "TRY"],

  // Nome esteso mostrato accanto al codice nei menu valuta (es. "EUR - Euro")
  CURRENCY_NAMES: {
    EUR: "Euro",
    USD: "Dollaro USA",
    GBP: "Sterlina britannica",
    CHF: "Franco svizzero",
    JPY: "Yen giapponese",
    COP: "Peso colombiano",
    XCG: "Caribbean guilder",
    TRY: "Lira turca"
  }
};
