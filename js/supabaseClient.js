// ============================================================
// Inizializzazione client Supabase (libreria caricata via CDN in index.html)
// ============================================================
const supabaseClient = window.supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_ANON_KEY
);
