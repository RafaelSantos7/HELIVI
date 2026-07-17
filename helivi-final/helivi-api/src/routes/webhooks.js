'use strict';

const express = require('express');
const { supabaseAdmin } = require('../supabase');
const factory = require('../payments/factory');

const router = express.Router();

/**
 * POST /webhooks/pix?gateway=mercadopago|efi&secret=...&owner=UUID
 * Em produção PIX_WEBHOOK_SECRET é obrigatório.
 * owner = owner_uid do estabelecimento (necessário porque config é por tenant).
 */
router.post('/pix', async (req, res) => {
  const emProd = process.env.NODE_ENV === 'production';
  const webhookSecret = process.env.PIX_WEBHOOK_SECRET;
  if (emProd && !webhookSecret) {
    console.error('[PIX Webhook] PIX_WEBHOOK_SECRET ausente em produção');
    res.status(503).json({ erro: 'Webhook indisponível: secret não configurado.' });
    return;
  }
  if (webhookSecret && req.query.secret !== webhookSecret) {
    res.status(403).json({ erro: 'Não autorizado' });
    return;
  }

  const ownerUid = req.query.owner;
  if (!ownerUid) {
    res.status(400).json({ erro: 'owner (owner_uid) obrigatório na query' });
    return;
  }

  try {
    const gateway = req.query.gateway || null;
    const dados = await factory.processarWebhook(ownerUid, req.body, gateway);
    if (!dados || !dados.txid || dados.valor === undefined) {
      res.status(400).json({ erro: 'Dados incompletos.' });
      return;
    }

    await supabaseAdmin.from('pagamentos_pix').upsert({
      txid: dados.txid,
      owner_uid: ownerUid,
      valor: parseFloat(dados.valor),
      cpf_pagador: dados.pagador?.cpf || 'não informado',
      horario_pagamento: dados.horario || new Date().toISOString(),
      confirmado_em: new Date().toISOString(),
      status: 'confirmado',
      gateway: gateway || null,
    });

    const { data: cmds } = await supabaseAdmin
      .from('comandas')
      .select('id')
      .eq('pix_txid', dados.txid)
      .eq('owner_uid', ownerUid)
      .limit(1);

    if (cmds && cmds[0]) {
      await supabaseAdmin
        .from('comandas')
        .update({
          status_pagamento: 'confirmado',
          pix_confirmado_em: new Date().toISOString(),
          pix_valor: parseFloat(dados.valor),
        })
        .eq('id', cmds[0].id);
    }

    res.status(200).json({ sucesso: true, mensagem: 'Webhook processado' });
  } catch (e) {
    console.error('[PIX Webhook]', e.message);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

module.exports = router;
