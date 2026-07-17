// supabase-init.js — cria window.supabaseClient (CDN @supabase/supabase-js)
'use strict';

(function () {
  const cfg = window.HELIVI_CONFIG || {};
  if ((window.HELIVI_DATA_BACKEND || cfg.dataBackend || 'firebase') !== 'supabase') {
    return;
  }
  if (typeof supabase === 'undefined' || !supabase.createClient) {
    console.error('[HELIVI] CDN supabase-js não carregado');
    return;
  }
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    console.error('[HELIVI] HELIVI_CONFIG.supabaseUrl / supabaseAnonKey ausentes');
    return;
  }
  window.supabaseClient = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  console.log('[HELIVI] Supabase client pronto');
})();
