// data.js — escolhe adapter Firebase ou Supabase
'use strict';

(function () {
  const backend = window.HELIVI_DATA_BACKEND || (window.HELIVI_CONFIG && window.HELIVI_CONFIG.dataBackend) || 'firebase';

  let api;
  if (backend === 'supabase') {
    if (typeof window.__heliviCreateSupabaseData !== 'function') {
      throw new Error('data-supabase.js não carregado');
    }
    api = window.__heliviCreateSupabaseData();
  } else {
    if (typeof window.__heliviCreateFirebaseData !== 'function') {
      throw new Error('data-firebase.js não carregado');
    }
    api = window.__heliviCreateFirebaseData();
  }

  window.heliviData = api;
  window.data = api;
  console.log('[HELIVI] data layer ativo — backend:', api.backend);
})();
