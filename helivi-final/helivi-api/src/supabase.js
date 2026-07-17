'use strict';

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (fs.existsSync(p)) dotenv.config({ path: p, override: true });
}

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.SUPABASE_ANON_KEY || '';

if (!url || !serviceKey) {
  console.warn('[helivi-api] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes — rotas autenticadas falharão até configurar .env.local');
}

/** Admin client — bypass RLS; NUNCA expor ao browser. */
const supabaseAdmin = createClient(url || 'http://localhost', serviceKey || 'missing', {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Client com anon key — usado só para auth.getUser(jwt). */
const supabaseAnon = createClient(url || 'http://localhost', anonKey || serviceKey || 'missing', {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = { supabaseAdmin, supabaseAnon, url };
