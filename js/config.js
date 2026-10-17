// ============================================================
// CONFIGURAZIONE - da compilare dopo aver creato il progetto Supabase
// (vedi README.md per la guida passo passo)
// ============================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://zwqoxbkcfebiipkssiws.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_RGYs1fsWIyP1K-6R6Yxx3g_EXnB4-k8",

  // Le uniche email autorizzate ad usare l'app.
  // Anche se qualcuno indovinasse l'URL, senza essere in questa lista
  // (ed essere stato invitato su Supabase Auth) non entra.
  ALLOWED_EMAILS: [
    "leonardobolli@gmail.com",
    "biagettimariachiara@gmail.com",
    "23leo07@gmail.com"
  ],

  // Chi condivide i viaggi: ognuno vede solo quelli del proprio spazio.
  // Stesse email di public.pdtravel_space() in supabase/schema.sql.
  SPACES: {
    "leonardobolli@gmail.com": "coppia",
    "biagettimariachiara@gmail.com": "coppia",
    "23leo07@gmail.com": "prova" // account di prova, vuoto: per far vedere l'app
  },

  // Nome mostrato al posto dell'email (es. "Connesso come Leonardo")
  USER_NAMES: {
    "leonardobolli@gmail.com": "Leonardo",
    "biagettimariachiara@gmail.com": "Chiara",
    "23leo07@gmail.com": "Ospite"
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
