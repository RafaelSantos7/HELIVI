// ═══════════════════════════════════════════════════════════════════════════
// CARTÃO FACTORY — Centralizador multi-maquininha (Point MP, Stone, PagBank...)
// Lê maquininha ativa + credenciais do Firestore e delega ao service correto.
// ═══════════════════════════════════════════════════════════════════════════

const admin = require('firebase-admin');
const mercadoPagoPointService = require('./mercadoPagoPointService');

const db = admin.firestore();

const SERVICES = {
  mercadopago_point: mercadoPagoPointService,
};

const MAQUININHAS_VALIDAS = Object.keys(SERVICES);
const CACHE_TTL_MS = 60000;

let cache = { dados: null, expira: 0 };

/**
 * Carrega maquininha ativa e segredos do Firestore (com cache de 60s).
 */
async function carregarConfig() {
  if (cache.dados && Date.now() < cache.expira) {
    return cache.dados;
  }

  const [pagSnap, segSnap] = await Promise.all([
    db.doc('configuracoes/pagamentos').get(),
    db.doc('configuracoes/segredos_pagamento').get(),
  ]);

  const pag = pagSnap.exists ? pagSnap.data() : {};
  const segredos = segSnap.exists ? segSnap.data() : {};

  let maquininha = pag.maquininhaAtiva || '';
  if (maquininha && !MAQUININHAS_VALIDAS.includes(maquininha)) {
    console.warn(`[Cartão Factory] Maquininha "${maquininha}" inválida; desativada.`);
    maquininha = '';
  }

  const dados = { maquininha, segredos, pag };
  cache = { dados, expira: Date.now() + CACHE_TTL_MS };
  return dados;
}

/** Invalida cache após alteração de configuração. */
function limparCache() {
  cache = { dados: null, expira: 0 };
}

function obterServico(maquininha) {
  return SERVICES[maquininha] || null;
}

function maquininhaConfigurada(cfg) {
  return !!(cfg?.maquininha && MAQUININHAS_VALIDAS.includes(cfg.maquininha));
}

function credenciaisDe(maquininha, segredos, pag = {}) {
  if (maquininha === 'mercadopago_point') {
    const deviceId = (
      segredos.mpPointDeviceId
      || pag.mpPointDeviceId
      || ''
    ).trim();

    const mpPointAccessToken = (segredos.mpPointAccessToken || '').trim();
    const mpAccessTokenProducao = (
      segredos.mpAccessTokenProducao
      || segredos.mpAccessToken
      || ''
    ).trim();

    return {
      mpPointDeviceId: deviceId,
      mpPointAccessToken: mpPointAccessToken || mpAccessTokenProducao,
      mpAccessTokenProducao,
    };
  }
  return {};
}

/**
 * Envia pagamento para a maquininha ativa.
 * @param {number} valorCentavos
 * @param {string} tipoPagamento - 'credit_card' | 'debit_card'
 * @param {string} externalReference - Identificador da comanda/venda
 * @param {string} [descricao]
 */
async function enviarPagamentoMaquininha(valorCentavos, tipoPagamento, externalReference, descricao) {
  const cfg = await carregarConfig();

  if (!maquininhaConfigurada(cfg)) {
    throw new Error('Nenhuma maquininha de cartão configurada. Configure em Configurações → Maquininha de Cartão.');
  }

  const service = obterServico(cfg.maquininha);
  const creds = credenciaisDe(cfg.maquininha, cfg.segredos, cfg.pag);

  if (!creds.mpPointDeviceId) {
    throw new Error('Device ID da maquininha não configurado.');
  }

  console.log(`[Cartão Factory] Enviando pagamento via ${cfg.maquininha}`, {
    valorCentavos,
    tipoPagamento,
  });

  const resultado = await service.criarPaymentIntent({
    valorCentavos,
    tipoPagamento,
    deviceId: creds.mpPointDeviceId,
    externalReference,
    descricao,
    credenciais: creds,
  });

  return { ...resultado, maquininha: cfg.maquininha };
}

/**
 * Consulta status do pagamento na maquininha (polling).
 * @param {string} paymentIntentId
 * @param {string} [maquininha] - Marca gravada na comanda no momento da cobrança
 */
async function consultarStatusMaquininha(paymentIntentId, maquininha) {
  const cfg = await carregarConfig();
  const m = maquininha || cfg.maquininha;

  if (!m || !MAQUININHAS_VALIDAS.includes(m)) {
    throw new Error('Maquininha não identificada para consulta de status.');
  }

  const service = obterServico(m);
  const creds = credenciaisDe(m, cfg.segredos, cfg.pag);

  return service.consultarStatus({
    paymentIntentId,
    credenciais: creds,
  });
}

/**
 * Cancela pagamento em andamento na maquininha.
 */
async function cancelarPagamentoMaquininha(paymentIntentId, maquininha, deviceId) {
  const cfg = await carregarConfig();
  const m = maquininha || cfg.maquininha;
  const service = obterServico(m);

  if (!service?.cancelarPaymentIntent) {
    throw new Error('Cancelamento não suportado para esta maquininha.');
  }

  const creds = credenciaisDe(m, cfg.segredos, cfg.pag);
  const devId = deviceId || creds.mpPointDeviceId;

  return service.cancelarPaymentIntent({
    deviceId: devId,
    paymentIntentId,
    credenciais: creds,
  });
}

module.exports = {
  enviarPagamentoMaquininha,
  consultarStatusMaquininha,
  cancelarPagamentoMaquininha,
  carregarConfig,
  limparCache,
  maquininhaConfigurada,
  MAQUININHAS_VALIDAS,
};
