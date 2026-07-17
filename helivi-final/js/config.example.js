// Copie para js/config.js. Este arquivo contém apenas configuração pública.
// Nunca coloque SUPABASE_SERVICE_ROLE_KEY no frontend.
window.HELIVI_CONFIG = {
  dataBackend: 'supabase',

  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'COLE_AQUI_A_ANON_KEY',

  apiBaseUrl: 'http://127.0.0.1:8787',
};
window.HELIVI_DATA_BACKEND = window.HELIVI_CONFIG.dataBackend;
