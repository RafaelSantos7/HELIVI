'use strict';

const { supabaseAdmin, supabaseAnon } = require('./supabase');

const PERFIS_VALIDOS = ['admin', 'atendente', 'caixa', 'cozinha', 'balcao'];

function bearerToken(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/**
 * Valida JWT do Supabase Auth e carrega perfil em public.usuarios.
 * Conta principal: row criada pelo trigger handle_new_user.
 */
async function requireUser(req, res, next) {
  try {
    const token = bearerToken(req);
    if (!token) {
      res.status(401).json({ erro: 'unauthenticated', mensagem: 'Você precisa estar logado.' });
      return;
    }

    const { data: authData, error } = await supabaseAnon.auth.getUser(token);
    if (error || !authData?.user) {
      res.status(401).json({ erro: 'unauthenticated', mensagem: 'Sessão inválida ou expirada.' });
      return;
    }

    const user = authData.user;
    const { data: perfil, error: pErr } = await supabaseAdmin
      .from('usuarios')
      .select('id, owner_uid, nome, email, role, ativo')
      .eq('id', user.id)
      .maybeSingle();

    if (pErr) {
      console.error('[auth] perfil:', pErr.message);
      res.status(500).json({ erro: 'internal', mensagem: 'Erro ao carregar perfil.' });
      return;
    }

    // Sem row: trata como admin do próprio uid (janela antes do trigger) e sincroniza
    let row = perfil;
    if (!row) {
      const nome = user.user_metadata?.nome || (user.email || '').split('@')[0] || '';
      const { data: inserted, error: iErr } = await supabaseAdmin
        .from('usuarios')
        .upsert({
          id: user.id,
          owner_uid: user.id,
          nome,
          email: user.email || '',
          role: 'admin',
          ativo: true,
        })
        .select('id, owner_uid, nome, email, role, ativo')
        .single();
      if (iErr) {
        console.error('[auth] upsert principal:', iErr.message);
        res.status(500).json({ erro: 'internal', mensagem: 'Erro ao provisionar conta.' });
        return;
      }
      row = inserted;
    }

    if (row.ativo === false) {
      res.status(403).json({ erro: 'permission-denied', mensagem: 'Conta desativada.' });
      return;
    }

    req.user = user;
    req.perfil = row;
    req.ownerUid = row.owner_uid || user.id;
    next();
  } catch (e) {
    console.error('[auth]', e.message);
    res.status(500).json({ erro: 'internal', mensagem: 'Erro de autenticação.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.perfil || req.perfil.role !== 'admin') {
    res.status(403).json({ erro: 'permission-denied', mensagem: 'Apenas administradores.' });
    return;
  }
  next();
}

module.exports = {
  PERFIS_VALIDOS,
  requireUser,
  requireAdmin,
  bearerToken,
};
