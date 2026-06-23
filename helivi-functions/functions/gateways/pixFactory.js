// ═══════════════════════════════════════════════════════════════════════════
// PIX FACTORY — Centralizador multi-gateway (Efi, Mercado Pago, futuros...)
// Lê gateway ativo + credenciais do Firestore e delega ao service correto.
// ═══════════════════════════════════════════════════════════════════════════

const admin = require('firebase-admin');
const efiService = require('./efiService');
const mercadoPagoService = require('./mercadoPagoService');

const db = admin.firestore();

const SERVICES = {
  efi: efiService,
  mercadopago: mercadoPagoService,
};

const GATEWAYS_VALIDOS = Object.keys(SERVICES);
const CACHE_TTL_MS = 60000;

let cache = { dados: null, expira: 0 };

/**
 * Carrega gateway ativo e segredos do Firestore (com cache de 60s).
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

  if (pag.mpAmbienteTeste !== undefined && segredos.mpAmbienteTeste === undefined) {
    segredos.mpAmbienteTeste = pag.mpAmbienteTeste;
  }
  // Produção por padrão — sandbox só se explicitamente ativado
  if (segredos.mpAmbienteTeste !== true) {
    segredos.mpAmbienteTeste = false;
  }

  let gateway = pag.gatewayAtivo || 'efi';
  if (!GATEWAYS_VALIDOS.includes(gateway)) {
    console.warn(`[PIX Factory] Gateway "${gateway}" inválido; usando efi.`);
    gateway = 'efi';
  }

  const dados = { gateway, segredos, pag };
  cache = { dados, expira: Date.now() + CACHE_TTL_MS };
  return dados;
}

/** Invalida cache após alteração de configuração (opcional, para testes). */
function limparCache() {
  cache = { dados: null, expira: 0 };
}

function obterServico(gateway) {
  return SERVICES[gateway] || efiService;
}

function resolverTokenMp(segredos, sandbox) {
  const sandboxTok = (segredos.mpAccessTokenSandbox || '').trim();
  const teste = (segredos.mpAccessTokenTeste || '').trim();
  const prod = (segredos.mpAccessTokenProducao || '').trim();
  const legado = (segredos.mpAccessToken || '').trim();

  if (sandbox) {
    if (sandboxTok) {
      return { token: sandboxTok, origem: 'sandbox', usarDoc: true };
    }
    return {
      token: teste || legado || prod,
      origem: teste ? 'teste' : legado ? 'legado' : prod ? 'producao' : 'nenhum',
      usarDoc: false,
    };
  }
  return {
    token: prod || legado || teste || sandboxTok,
    origem: prod ? 'producao' : legado ? 'legado' : teste ? 'teste' : sandboxTok ? 'sandbox' : 'nenhum',
    usarDoc: false,
  };
}

function credenciaisDe(gateway, segredos) {
  if (gateway === 'mercadopago') {
    const sandbox = segredos.mpAmbienteTeste === true;
    const { token, origem, usarDoc } = resolverTokenMp(segredos, sandbox);

    return {
      mpAccessToken: token,
      mpAmbienteTeste: sandbox,
      mpPayerEmail: segredos.mpPayerEmail,
      mpUsarPayerSandboxDoc: usarDoc || segredos.mpUsarPayerSandboxDoc === true,
      mpTokenOrigem: origem,
    };
  }
  return {
    clientId: segredos.efiClientId,
    clientSecret: segredos.efiClientSecret,
    pixKey: segredos.efiPixKey,
  };
}

/**
 * Gera cobrança PIX usando o gateway ativo configurado.
 * @returns {Promise<object>} Dados da cobrança + campo `gateway`
 */
async function gerarCobrancaPix(valorCentavos, descricao, identificador) {
  const { gateway, segredos } = await carregarConfig();
  const service = obterServico(gateway);

  console.log(`[PIX Factory] Gerando cobrança via ${gateway}`);

  const creds = credenciaisDe(gateway, segredos);
  if (gateway === 'mercadopago') {
    console.log(`[PIX Factory] MP sandbox=${creds.mpAmbienteTeste} tokenOrigem=${creds.mpTokenOrigem} payerDoc=${creds.mpUsarPayerSandboxDoc}`);
  }

  const resultado = await service.gerarCobranca({
    valorCentavos,
    descricao,
    identificador,
    credenciais: creds,
  });

  return { ...resultado, gateway };
}

/**
 * Verifica status de pagamento. Se `gateway` for informado, usa o service correto
 * (ex.: gateway gravado na comanda no momento da cobrança).
 */
async function verificarStatusPix(txid, gateway, mpOrderId) {
  const cfg = await carregarConfig();
  const g = gateway || cfg.gateway;
  const service = obterServico(g);

  return service.verificarStatus({
    txid,
    mpOrderId,
    credenciais: credenciaisDe(g, cfg.segredos),
  });
}

/**
 * Processa webhook do gateway informado (ou do gateway ativo).
 */
async function processarWebhook(body, gateway) {
  const cfg = await carregarConfig();
  const g = gateway || cfg.gateway;
  const service = obterServico(g);

  return service.processarWebhook({
    body,
    credenciais: credenciaisDe(g, cfg.segredos),
  });
}

module.exports = {
  gerarCobrancaPix,
  verificarStatusPix,
  processarWebhook,
  carregarConfig,
  limparCache,
  GATEWAYS_VALIDOS,
};
