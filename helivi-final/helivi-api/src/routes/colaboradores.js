'use strict';

const express = require('express');
const { supabaseAdmin } = require('../supabase');
const { requireUser, requireAdmin, PERFIS_VALIDOS } = require('../auth');

const router = express.Router();

router.use(requireUser, requireAdmin);

/** POST /colaboradores — cria Auth user + row usuarios no mesmo owner_uid */
router.post('/', async (req, res) => {
  const { nome, email, senha, perfil } = req.body || {};
  if (!nome || String(nome).trim().length < 2) {
    res.status(400).json({ erro: 'invalid-argument', mensagem: 'Nome inválido.' });
    return;
  }
  if (!email || !String(email).includes('@')) {
    res.status(400).json({ erro: 'invalid-argument', mensagem: 'E-mail inválido.' });
    return;
  }
  if (!senha || String(senha).length < 6) {
    res.status(400).json({ erro: 'invalid-argument', mensagem: 'Senha mínimo 6 caracteres.' });
    return;
  }

  const role = PERFIS_VALIDOS.includes(perfil) ? perfil : 'atendente';
  const ownerUid = req.ownerUid;
  const emailNorm = String(email).trim().toLowerCase();
  const nomeTrim = String(nome).trim();

  try {
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: emailNorm,
      password: String(senha),
      email_confirm: true,
      user_metadata: { nome: nomeTrim, owner_uid: ownerUid, role },
    });
    if (cErr) {
      if (/already|registered|exists/i.test(cErr.message)) {
        res.status(409).json({ erro: 'already-exists', mensagem: 'Este e-mail já está cadastrado.' });
        return;
      }
      throw cErr;
    }

    const uid = created.user.id;

    // Evita que o trigger trate colaborador como admin do próprio uid:
    // atualiza a row (se o trigger criou) ou insere com owner_uid correto.
    const { error: uErr } = await supabaseAdmin.from('usuarios').upsert({
      id: uid,
      owner_uid: ownerUid,
      nome: nomeTrim,
      email: emailNorm,
      role,
      ativo: true,
      atualizado_em: new Date().toISOString(),
    });
    if (uErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid).catch(() => {});
      throw uErr;
    }

    // app_metadata para RLS futura via claim (opcional; current_owner_uid já usa tabela)
    await supabaseAdmin.auth.admin.updateUserById(uid, {
      app_metadata: { owner_uid: ownerUid, role },
    });

    res.json({
      sucesso: true,
      uid,
      mensagem: `Colaborador "${nomeTrim}" criado com sucesso!`,
    });
  } catch (e) {
    console.error('[colaboradores.create]', e.message);
    res.status(500).json({ erro: 'internal', mensagem: e.message || 'Erro ao criar colaborador.' });
  }
});

/** PATCH /colaboradores/:id — id = usuarios.id (uuid Auth) */
router.patch('/:id', async (req, res) => {
  const alvoId = req.params.id;
  const { nome, email, senha, perfil } = req.body || {};

  const { data: alvo, error: gErr } = await supabaseAdmin
    .from('usuarios')
    .select('*')
    .eq('id', alvoId)
    .maybeSingle();

  if (gErr) {
    res.status(500).json({ erro: 'internal', mensagem: gErr.message });
    return;
  }
  if (!alvo) {
    res.status(404).json({ erro: 'not-found', mensagem: 'Colaborador não encontrado.' });
    return;
  }
  if (alvo.owner_uid !== req.ownerUid) {
    res.status(403).json({ erro: 'permission-denied', mensagem: 'Colaborador de outro estabelecimento.' });
    return;
  }

  const role = PERFIS_VALIDOS.includes(perfil) ? perfil : alvo.role;
  const authUpdate = {};
  if (nome) authUpdate.user_metadata = { ...(alvo.user_metadata || {}), nome: String(nome).trim() };
  if (email) authUpdate.email = String(email).trim().toLowerCase();
  if (senha && String(senha).length >= 6) authUpdate.password = String(senha);
  authUpdate.app_metadata = { owner_uid: req.ownerUid, role };

  try {
    if (Object.keys(authUpdate).length) {
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(alvoId, authUpdate);
      if (aErr) {
        if (/already|registered|exists/i.test(aErr.message)) {
          res.status(409).json({ erro: 'already-exists', mensagem: 'E-mail já em uso.' });
          return;
        }
        throw aErr;
      }
    }

    const patch = {
      role,
      atualizado_em: new Date().toISOString(),
    };
    if (nome) patch.nome = String(nome).trim();
    if (email) patch.email = String(email).trim().toLowerCase();

    const { error: uErr } = await supabaseAdmin.from('usuarios').update(patch).eq('id', alvoId);
    if (uErr) throw uErr;

    res.json({ sucesso: true, mensagem: 'Colaborador atualizado!' });
  } catch (e) {
    console.error('[colaboradores.update]', e.message);
    res.status(500).json({ erro: 'internal', mensagem: e.message || 'Erro ao atualizar.' });
  }
});

/** DELETE /colaboradores/:id — remove Auth + row (ou desativa se preferir soft-delete futuro) */
router.delete('/:id', async (req, res) => {
  const alvoId = req.params.id;
  if (alvoId === req.user.id) {
    res.status(400).json({ erro: 'invalid-argument', mensagem: 'Não é possível excluir a própria conta.' });
    return;
  }

  const { data: alvo, error: gErr } = await supabaseAdmin
    .from('usuarios')
    .select('id, owner_uid')
    .eq('id', alvoId)
    .maybeSingle();

  if (gErr) {
    res.status(500).json({ erro: 'internal', mensagem: gErr.message });
    return;
  }
  if (!alvo) {
    res.status(404).json({ erro: 'not-found', mensagem: 'Colaborador não encontrado.' });
    return;
  }
  if (alvo.owner_uid !== req.ownerUid) {
    res.status(403).json({ erro: 'permission-denied', mensagem: 'Colaborador de outro estabelecimento.' });
    return;
  }

  try {
    await supabaseAdmin.auth.admin.deleteUser(alvoId).catch(() => {});
    const { error: dErr } = await supabaseAdmin.from('usuarios').delete().eq('id', alvoId);
    if (dErr) throw dErr;
    res.json({ sucesso: true, mensagem: 'Colaborador removido.' });
  } catch (e) {
    console.error('[colaboradores.delete]', e.message);
    res.status(500).json({ erro: 'internal', mensagem: e.message || 'Erro ao excluir.' });
  }
});

module.exports = router;
