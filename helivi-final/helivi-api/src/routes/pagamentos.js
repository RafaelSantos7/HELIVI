'use strict';

const express = require('express');
const { supabaseAdmin } = require('../supabase');
const { requireUser, requireAdmin } = require('../auth');
const factory = require('../payments/factory');

const router = express.Router();
const VALOR_MAX_CENTAVOS = 5000000;

async function carregarComandaAutorizada(ownerUid, userId, comandaId) {
  const { data: cmd, error } = await supabaseAdmin
    .from('comandas')
    .select('*')
    .eq('id', comandaId)
    .maybeSingle();
  if (error) throw error;
  if (!cmd) {
    const err = new Error('Comanda não encontrada.');
    err.status = 404;
    throw err;
  }
  if (cmd.owner_uid !== ownerUid && cmd.criador_uid !== userId) {
    const err = new Error('Sem permissão para esta comanda.');
    err.status = 403;
    throw err;
  }
  return cmd;
}

function validarValor(valorCentavos, comanda) {
  const valor = Number(valorCentavos);
  if (!Number.isFinite(valor) || valor <= 0) {
    const err = new Error('Valor inválido.');
    err.status = 400;
    throw err;
  }
  if (valor > VALOR_MAX_CENTAVOS) {
    const err = new Error('Valor acima do limite permitido.');
    err.status = 400;
    throw err;
  }
  const itens = comanda.itens || [];
  const esperado = Math.round(
    itens.reduce((s, i) => s + (Number(i.preco) || 0) * (Number(i.quantidade) || 1), 0) * 100,
  );
  if (esperado > 0 && Math.abs(valor - esperado) > 1) {
    const err = new Error('Valor não confere com o total da comanda.');
    err.status = 400;
    throw err;
  }
}

/** POST /pagamentos/config — salva flags + segredos (admin) */
router.post('/config', requireUser, requireAdmin, async (req, res) => {
  try {
    const ownerUid = req.ownerUid;
    const b = req.body || {};
    if (!['efi', 'mercadopago'].includes(b.gatewayAtivo)) {
      res.status(400).json({ erro: 'invalid-argument', mensagem: 'Gateway inválido.' });
      return;
    }
    const tokens = [b.mpAccessTokenProducao, b.mpAccessTokenSandbox, b.mpPointAccessToken].filter(Boolean);
    if (tokens.some((t) => String(t).startsWith('TEST-'))) {
      res.status(400).json({ erro: 'invalid-argument', mensagem: 'Token TEST- não é suportado. Use APP_USR-.' });
      return;
    }

    const maquininha = b.maquininhaAtiva || '';
    await supabaseAdmin.from('configuracoes_pagamentos').upsert({
      owner_uid: ownerUid,
      gateway_ativo: b.gatewayAtivo,
      efi_configurado: !!(b.efiClientId || b.gatewayAtivo === 'efi'),
      mp_configurado: b.gatewayAtivo === 'mercadopago',
      mp_ambiente_teste: b.mpAmbienteTeste === true,
      maquininha_ativa: maquininha,
      mp_point_device_id: b.mpPointDeviceId ? String(b.mpPointDeviceId).trim() : '',
      mp_point_configurado: maquininha === 'mercadopago_point',
      atualizado_em: new Date().toISOString(),
    });

    const seg = { owner_uid: ownerUid, atualizado_em: new Date().toISOString() };
    if (b.efiClientId) seg.efi_client_id = String(b.efiClientId).trim();
    if (b.efiClientSecret) seg.efi_client_secret = String(b.efiClientSecret).trim();
    if (b.efiPixKey) seg.efi_pix_key = String(b.efiPixKey).trim();
    if (b.mpAccessTokenProducao) seg.mp_access_token_producao = String(b.mpAccessTokenProducao).trim();
    if (b.mpAccessTokenSandbox) {
      seg.mp_access_token_sandbox = String(b.mpAccessTokenSandbox).trim();
      seg.mp_usar_payer_sandbox_doc = true;
    }
    if (b.mpPointDeviceId) seg.mp_point_device_id = String(b.mpPointDeviceId).trim();
    if (b.mpPointAccessToken) seg.mp_point_access_token = String(b.mpPointAccessToken).trim();
    if (b.gatewayAtivo === 'mercadopago') seg.mp_ambiente_teste = b.mpAmbienteTeste === true;

    if (Object.keys(seg).length > 2) {
      await supabaseAdmin.from('segredos_pagamento').upsert(seg);
    }

    factory.limparCache();
    res.json({ sucesso: true });
  } catch (e) {
    console.error('[pagamentos.config]', e.message);
    res.status(500).json({ erro: 'internal', mensagem: 'Erro ao salvar configuração.' });
  }
});

/** POST /pagamentos/pix */
router.post('/pix', requireUser, async (req, res) => {
  try {
    const { comandaId, valor, descricao } = req.body || {};
    if (!comandaId) {
      res.status(400).json({ erro: 'invalid-argument', mensagem: 'ID da comanda obrigatório.' });
      return;
    }
    const cmd = await carregarComandaAutorizada(req.ownerUid, req.user.id, comandaId);
    validarValor(valor, cmd);

    // MP /v1/orders: external_reference max 64 chars (uuid+uuid = 73 → 400)
    const identificador = String(comandaId).replace(/-/g, '').slice(0, 64);

    const cob = await factory.gerarCobrancaPix(
      req.ownerUid,
      valor,
      descricao || 'Pagamento de comanda',
      identificador,
    );

    await supabaseAdmin
      .from('comandas')
      .update({
        pix_txid: cob.txid,
        pix_gateway: cob.gateway,
        pix_mp_order_id: cob.mpOrderId || null,
        pix_valor: valor / 100,
        pix_qr_code: cob.qrcode,
        pix_copia_e_cola: cob.pixCopiaECola || null,
        pix_gerado_em: new Date().toISOString(),
        pix_validade_em: cob.validadeEm ? new Date(cob.validadeEm).toISOString() : null,
        status_pagamento: 'aguardando_pix',
        updated_at: new Date().toISOString(),
      })
      .eq('id', comandaId);

    res.json({
      sucesso: true,
      txid: cob.txid,
      mpOrderId: cob.mpOrderId || null,
      qrcode: cob.qrcode,
      pixCopiaECola: cob.pixCopiaECola,
      qrcodeImagem: cob.qrcodeImagem,
      ticketUrl: cob.ticketUrl || null,
      ambienteTeste: cob.ambienteTeste || false,
      pixSandboxReal: cob.pixSandboxReal || false,
      pixSimulacaoLocal: cob.pixSimulacaoLocal || false,
      validadeEm: cob.validadeEm instanceof Date ? cob.validadeEm.toISOString() : cob.validadeEm,
      expiracaoSegundos: cob.expiracaoSegundos,
      gateway: cob.gateway,
    });
  } catch (e) {
    console.error('[pagamentos.pix]', e.message);
    res.status(e.status || 500).json({ erro: 'internal', mensagem: e.message || 'Erro PIX.' });
  }
});

/** POST /pagamentos/pix/cancelar — cancela order no gateway e limpa PIX da comanda */
router.post('/pix/cancelar', requireUser, async (req, res) => {
  try {
    const { comandaId } = req.body || {};
    if (!comandaId) {
      res.status(400).json({ erro: 'invalid-argument', mensagem: 'ID da comanda obrigatório.' });
      return;
    }
    const cmd = await carregarComandaAutorizada(req.ownerUid, req.user.id, comandaId);

    const externalReference = String(comandaId).replace(/-/g, '').slice(0, 64);
    let cancelamento = { cancelado: true, localOnly: true };
    try {
      cancelamento = await factory.cancelarCobrancaPix(req.ownerUid, {
        mpOrderId: cmd.pix_mp_order_id,
        txid: cmd.pix_txid,
        gateway: cmd.pix_gateway,
        externalReference,
      });
    } catch (e) {
      // Ainda limpa o PDV; loga falha no gateway
      console.warn('[pagamentos.pix.cancelar] gateway:', e.message);
      cancelamento = { cancelado: false, erroGateway: e.message };
    }

    await supabaseAdmin
      .from('comandas')
      .update({
        pix_txid: null,
        pix_gateway: null,
        pix_mp_order_id: null,
        pix_valor: null,
        pix_qr_code: null,
        pix_copia_e_cola: null,
        pix_gerado_em: null,
        pix_validade_em: null,
        status_pagamento: 'pix_cancelado',
        updated_at: new Date().toISOString(),
      })
      .eq('id', comandaId);

    res.json({ sucesso: true, cancelamento });
  } catch (e) {
    console.error('[pagamentos.pix.cancelar]', e.message);
    res.status(e.status || 500).json({ erro: 'internal', mensagem: e.message || 'Erro ao cancelar PIX.' });
  }
});

/** POST /pagamentos/pix/verificar */
router.post('/pix/verificar', requireUser, async (req, res) => {
  try {
    const { txid } = req.body || {};
    if (!txid) {
      res.status(400).json({ erro: 'invalid-argument', mensagem: 'TXID obrigatório.' });
      return;
    }
    const { data: cmd } = await supabaseAdmin
      .from('comandas')
      .select('*')
      .eq('pix_txid', txid)
      .eq('owner_uid', req.ownerUid)
      .maybeSingle();
    if (!cmd) {
      res.status(404).json({ erro: 'not-found', mensagem: 'Transação PIX não encontrada.' });
      return;
    }

    const statusPix = await factory.verificarStatusPix(
      req.ownerUid,
      txid,
      cmd.pix_gateway,
      cmd.pix_mp_order_id,
    );

    if (statusPix.pago) {
      await supabaseAdmin
        .from('comandas')
        .update({
          status_pagamento: 'confirmado',
          pix_confirmado_em: new Date().toISOString(),
        })
        .eq('id', cmd.id);
    }

    res.json({
      sucesso: true,
      status: statusPix.status,
      pago: statusPix.pago,
      txid: statusPix.txid,
      dataPagamento: statusPix.dataPagamento,
      valor: statusPix.valor,
    });
  } catch (e) {
    console.error('[pagamentos.pix.verificar]', e.message);
    res.status(500).json({ erro: 'internal', mensagem: 'Erro ao verificar PIX.' });
  }
});

/** POST /pagamentos/pix/simular — só em development */
router.post('/pix/simular', requireUser, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ erro: 'failed-precondition', mensagem: 'Indisponível em produção.' });
    return;
  }
  try {
    const { comandaId, txid } = req.body || {};
    const cmd = await carregarComandaAutorizada(req.ownerUid, req.user.id, comandaId);
    if (cmd.pix_txid !== txid) {
      res.status(400).json({ erro: 'failed-precondition', mensagem: 'TXID não corresponde.' });
      return;
    }
    await supabaseAdmin
      .from('comandas')
      .update({
        status_pagamento: 'confirmado',
        pix_confirmado_em: new Date().toISOString(),
      })
      .eq('id', comandaId);
    res.json({ sucesso: true, mensagem: 'Pagamento simulado.' });
  } catch (e) {
    res.status(e.status || 500).json({ erro: 'internal', mensagem: e.message });
  }
});

/** POST /pagamentos/maquininha */
router.post('/maquininha', requireUser, async (req, res) => {
  try {
    const { comandaId, valorCentavos, tipoPagamento, descricao } = req.body || {};
    if (!comandaId) {
      res.status(400).json({ erro: 'invalid-argument', mensagem: 'ID da comanda obrigatório.' });
      return;
    }
    const cmd = await carregarComandaAutorizada(req.ownerUid, req.user.id, comandaId);
    validarValor(valorCentavos, cmd);

    const resultado = await factory.enviarPoint(
      req.ownerUid,
      valorCentavos,
      tipoPagamento,
      `${req.ownerUid}-${comandaId}`,
      descricao,
    );

    await supabaseAdmin
      .from('comandas')
      .update({
        cartao_intent_id: resultado.intentId,
        cartao_maquininha: resultado.maquininha,
        cartao_device_id: resultado.deviceId,
        cartao_tipo: tipoPagamento,
        cartao_valor: valorCentavos / 100,
        cartao_gerado_em: new Date().toISOString(),
        status_pagamento: 'aguardando_cartao',
      })
      .eq('id', comandaId);

    res.json({
      sucesso: true,
      intentId: resultado.intentId,
      deviceId: resultado.deviceId,
      maquininha: resultado.maquininha,
    });
  } catch (e) {
    console.error('[pagamentos.maquininha]', e.message);
    res.status(500).json({ erro: 'internal', mensagem: e.message || 'Erro maquininha.' });
  }
});

router.post('/maquininha/verificar', requireUser, async (req, res) => {
  try {
    const { intentId } = req.body || {};
    const { data: cmd } = await supabaseAdmin
      .from('comandas')
      .select('*')
      .eq('cartao_intent_id', intentId)
      .eq('owner_uid', req.ownerUid)
      .maybeSingle();
    if (!cmd) {
      res.status(404).json({ erro: 'not-found', mensagem: 'Pagamento não encontrado.' });
      return;
    }
    const st = await factory.consultarPoint(req.ownerUid, intentId);
    if (st.pago) {
      await supabaseAdmin
        .from('comandas')
        .update({
          status_pagamento: 'confirmado',
          cartao_confirmado_em: new Date().toISOString(),
          cartao_payment_id: st.paymentId || null,
        })
        .eq('id', cmd.id);
    }
    res.json({
      sucesso: true,
      status: st.status,
      pago: st.pago,
      recusado: st.recusado || false,
      cancelado: st.cancelado || false,
      intentId,
      paymentId: st.paymentId || null,
      valor: st.valor,
    });
  } catch (e) {
    res.status(500).json({ erro: 'internal', mensagem: e.message });
  }
});

router.post('/maquininha/cancelar', requireUser, async (req, res) => {
  try {
    const { intentId, comandaId } = req.body || {};
    let deviceId = null;
    if (comandaId) {
      const cmd = await carregarComandaAutorizada(req.ownerUid, req.user.id, comandaId);
      deviceId = cmd.cartao_device_id;
    }
    const resultado = await factory.cancelarPoint(req.ownerUid, intentId, deviceId);
    if (comandaId) {
      await supabaseAdmin
        .from('comandas')
        .update({
          status_pagamento: 'cartao_cancelado',
          cartao_cancelado_em: new Date().toISOString(),
        })
        .eq('id', comandaId);
    }
    res.json({ sucesso: true, ...resultado });
  } catch (e) {
    res.status(500).json({ erro: 'internal', mensagem: e.message });
  }
});

module.exports = router;
