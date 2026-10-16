// ============================================================
// Inizializzazione client Supabase (libreria caricata via CDN in index.html)
// storageKey proprio: il progetto Supabase è condiviso con Kurashi, che sta
// sullo stesso dominio (leoobolli.github.io) e con la chiave predefinita
// le due app si leggerebbero a vicenda la sessione salvata.
// ============================================================
const supabaseClient = window.supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_ANON_KEY,
  { auth: { storageKey: "pdtravel-auth" } }
);
