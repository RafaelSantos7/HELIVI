'use strict';

const { supabaseAdmin } = require('../supabase');
const efiService = require('../gateways/efiService');
const mercadoPagoService = require('../gateways/mercadoPagoService');
const mercadoPagoPointService = require('../gateways/mercadoPagoPointService');

const SERVICES = { efi: efiService, mercadopago: mercadoPagoService };
const CACHE_TTL_MS = 60000;
let cache = { dados: null, expira: 0, ownerUid: null };

async function carregarConfig(ownerUid) {
  if (cache.dados && cache.ownerUid === ownerUid && Date.now() < cache.expira) {
    return cache.dados;
  }

  const [{ data: pag }, { data: seg }] = await Promise.all([
    supabaseAdmin.from('configuracoes_pagamentos').select('*').eq('owner_uid', ownerUid).maybeSingle(),
    supabaseAdmin.from('segredos_pagamento').select('*').eq('owner_uid', ownerUid).maybeSingle(),
  ]);

  const p = pag || {};
  const s = seg || {};
  let gateway = p.gateway_ativo || 'mercadopago';
  if (!SERVICES[gateway]) gateway = 'efi';

  const segredos = {
    efiClientId: s.efi_client_id,
    efiClientSecret: s.efi_client_secret,
    efiPixKey: s.efi_pix_key,
    mpAccessTokenProducao: s.mp_access_token_producao,
    mpAccessTokenSandbox: s.mp_access_token_sandbox,
    mpUsarPayerSandboxDoc: s.mp_usar_payer_sandbox_doc,
    mpAmbienteTeste: s.mp_ambiente_teste === true || p.mp_ambiente_teste === true,
    mpPointDeviceId: s.mp_point_device_id || p.mp_point_device_id,
    mpPointAccessToken: s.mp_point_access_token,
  };

  const dados = { gateway, segredos, pag: p };
  cache = { dados, expira: Date.now() + CACHE_TTL_MS, ownerUid };
  return dados;
}

function limparCache() {
  cache = { dados: null, expira: 0, ownerUid: null };
}

function credenciaisDe(gateway, segredos) {
  if (gateway === 'mercadopago') {
    const sandbox = segredos.mpAmbienteTeste === true;
    const token = sandbox
      ? (segredos.mpAccessTokenSandbox || segredos.mpAccessTokenProducao || '')
      : (segredos.mpAccessTokenProducao || segredos.mpAccessTokenSandbox || '');
    return {
      mpAccessToken: token,
      mpAmbienteTeste: sandbox,
      mpUsarPayerSandboxDoc: !!segredos.mpUsarPayerSandboxDoc,
    };
  }
  return {
    clientId: segredos.efiClientId,
    clientSecret: segredos.efiClientSecret,
    pixKey: segredos.efiPixKey,
  };
}

async function gerarCobrancaPix(ownerUid, valorCentavos, descricao, identificador) {
  const { gateway, segredos } = await carregarConfig(ownerUid);
  const service = SERVICES[gateway] || efiService;
  const resultado = await service.gerarCobranca({
    valorCentavos,
    descricao,
    identificador,
    credenciais: credenciaisDe(gateway, segredos),
  });
  return { ...resultado, gateway };
}

async function verificarStatusPix(ownerUid, txid, gateway, mpOrderId) {
  const cfg = await carregarConfig(ownerUid);
  const g = gateway || cfg.gateway;
  const service = SERVICES[g] || efiService;
  return service.verificarStatus({
    txid,
    mpOrderId,
    credenciais: credenciaisDe(g, cfg.segredos),
  });
}

async function processarWebhook(ownerUid, body, gateway) {
  const cfg = await carregarConfig(ownerUid);
  const g = gateway || cfg.gateway;
  const service = SERVICES[g] || efiService;
  return service.processarWebhook({
    body,
    credenciais: credenciaisDe(g, cfg.segredos),
  });
}

async function enviarPoint(ownerUid, valorCentavos, tipoPagamento, identificador, descricao) {
  const { segredos, pag } = await carregarConfig(ownerUid);
  const deviceId = (segredos.mpPointDeviceId || pag.mp_point_device_id || '').trim();
  const mpPointAccessToken = (segredos.mpPointAccessToken || segredos.mpAccessTokenProducao || '').trim();
  if (!mpPointAccessToken || !deviceId) {
    throw new Error('Maquininha Point não configurada.');
  }
  if (!pag.maquininha_ativa) {
    throw new Error('Nenhuma maquininha de cartão ativa.');
  }
  const resultado = await mercadoPagoPointService.criarPaymentIntent({
    valorCentavos,
    tipoPagamento,
    deviceId,
    externalReference: identificador,
    descricao,
    credenciais: { mpPointAccessToken, mpPointDeviceId: deviceId },
  });
  return { ...resultado, maquininha: pag.maquininha_ativa || 'mercadopago_point' };
}

async function consultarPoint(ownerUid, intentId) {
  const { segredos } = await carregarConfig(ownerUid);
  const mpPointAccessToken = (segredos.mpPointAccessToken || segredos.mpAccessTokenProducao || '').trim();
  return mercadoPagoPointService.consultarStatus({
    paymentIntentId: intentId,
    credenciais: { mpPointAccessToken },
  });
}

async function cancelarCobrancaPix(ownerUid, { mpOrderId, txid, externalReference, gateway }) {
  const cfg = await carregarConfig(ownerUid);
  const g = gateway || cfg.gateway;
  if (g === 'mercadopago') {
    const orderId = mpOrderId || (txid && String(txid).startsWith('ORD') ? txid : null);
    if (!orderId) {
      return { cancelado: false, motivo: 'sem_order_id' };
    }
    return mercadoPagoService.cancelarOrder({
      orderId,
      externalReference,
      credenciais: credenciaisDe('mercadopago', cfg.segredos),
    });
  }
  // Efi: cobrança PIX expira sozinha; limpeza local basta no PDV
  return { cancelado: true, gateway: g, localOnly: true };
}

async function cancelarPoint(ownerUid, intentId, deviceId) {
  const { segredos, pag } = await carregarConfig(ownerUid);
  const mpPointAccessToken = (segredos.mpPointAccessToken || segredos.mpAccessTokenProducao || '').trim();
  const dev = deviceId || segredos.mpPointDeviceId || pag.mp_point_device_id;
  return mercadoPagoPointService.cancelarPaymentIntent({
    paymentIntentId: intentId,
    deviceId: dev,
    credenciais: { mpPointAccessToken },
  });
}

module.exports = {
  carregarConfig,
  limparCache,
  gerarCobrancaPix,
  verificarStatusPix,
  processarWebhook,
  cancelarCobrancaPix,
  enviarPoint,
  consultarPoint,
  cancelarPoint,
};
