// ═══════════════════════════════════════════════════════════════════════════
// EFI SERVICE — Gateway PIX Efi Bank (contrato unificado para pixFactory)
// ═══════════════════════════════════════════════════════════════════════════

const axios = require('axios');
const fs = require('fs');
const https = require('https');
const { AMBIENTE, EFI_CONFIG } = require('../efi-config');

const ID = 'efi';

let httpsAgentCache = null;
let tokenCache = { token: null, expiresAt: 0, clientId: null };

// Mescla credenciais do Firestore com defaults de efi-config (apiUrl, certPath, etc.)
function resolverConfig(credenciais = {}) {
  return {
    ...EFI_CONFIG,
    clientId: credenciais.clientId || EFI_CONFIG.clientId,
    clientSecret: credenciais.clientSecret || EFI_CONFIG.clientSecret,
    pixKey: credenciais.pixKey || EFI_CONFIG.pixKey,
  };
}

function criarHttpsAgent(cfg) {
  if (!httpsAgentCache) {
    httpsAgentCache = new https.Agent({
      cert: fs.readFileSync(cfg.certPath),
      key: fs.readFileSync(cfg.certPath),
      passphrase: '',
      keepAlive: true,
      maxSockets: 10,
    });
  }
  return httpsAgentCache;
}

function limparTokenCache() {
  tokenCache = { token: null, expiresAt: 0, clientId: null };
}

async function axiosEfi(cfg, config) {
  const { __retried, timeout, ...rest } = config;
  try {
    return await axios({
      ...rest,
      httpsAgent: criarHttpsAgent(cfg),
      timeout: timeout ?? cfg.timeout,
    });
  } catch (erro) {
    if (erro.code === 'ECONNABORTED' && !__retried) {
      return axiosEfi(cfg, { ...config, __retried: true });
    }
    throw erro;
  }
}

function logErroEfi(contexto, erro) {
  console.error(`[EFI] Erro ${contexto}:`, {
    ambiente: AMBIENTE,
    message: erro.message,
    code: erro.code || null,
    status: erro.response?.status || null,
    data: erro.response?.data || null,
  });
}

function formatarErroEfi(contexto, erro) {
  logErroEfi(contexto, erro);
  const detalhe = erro.response?.data?.error_description
    || erro.response?.data?.mensagem
    || erro.response?.data?.nome
    || erro.message;

  if (String(detalhe).includes('Invalid or inactive credentials')) {
    return `${contexto}: credenciais Efi inválidas ou inativas. ` +
      'Configure Client_Id e Client_Secret em Configurações ou em helivi-functions/.env.local ' +
      `(ambiente atual: ${AMBIENTE}).`;
  }

  return `${contexto}: ${detalhe}`;
}

async function obterToken(cfg) {
  try {
    if (!fs.existsSync(cfg.certPath)) {
      throw new Error(`Certificado não encontrado em: ${cfg.certPath}`);
    }

    const agora = Date.now();
    if (
      tokenCache.token
      && tokenCache.clientId === cfg.clientId
      && agora < tokenCache.expiresAt - 60000
    ) {
      return tokenCache.token;
    }

    const response = await axiosEfi(cfg, {
      method: 'post',
      url: `${cfg.apiUrl}/oauth/token`,
      data: { grant_type: 'client_credentials' },
      auth: {
        username: cfg.clientId,
        password: cfg.clientSecret,
      },
      headers: { 'Content-Type': 'application/json' },
    });

    tokenCache = {
      token: response.data.access_token,
      expiresAt: agora + (response.data.expires_in * 1000),
      clientId: cfg.clientId,
    };

    return tokenCache.token;
  } catch (erro) {
    limparTokenCache();
    throw new Error(formatarErroEfi('Falha na autenticação EFI', erro));
  }
}

async function obterQrCodeLoc(cfg, token, locId) {
  const response = await axiosEfi(cfg, {
    method: 'get',
    url: `${cfg.apiUrl}/v2/loc/${locId}/qrcode`,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 8000,
  });

  return response.data.imagemQrcode || response.data.qrcode || null;
}

/**
 * Gera cobrança PIX na Efi.
 * @param {{ valorCentavos: number, descricao: string, identificador: string, credenciais?: object }} params
 */
async function gerarCobranca({ valorCentavos, descricao, identificador, credenciais }) {
  try {
    if (!valorCentavos || valorCentavos <= 0) throw new Error('Valor inválido');
    if (!identificador) throw new Error('Identificador obrigatório');

    const cfg = resolverConfig(credenciais);
    const token = await obterToken(cfg);

    const payload = {
      calendario: { expiracao: 3600 },
      valor: { original: (valorCentavos / 100).toFixed(2) },
      chave: cfg.pixKey,
      solicitacaoPagador: descricao || 'Pagamento de comanda',
      infoAdicionais: [{ nome: 'Identificador', valor: identificador }],
    };

    const response = await axiosEfi(cfg, {
      method: 'post',
      url: `${cfg.apiUrl}/v2/cob`,
      data: payload,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const { txid, pixCopiaECola, loc } = response.data;
    let qrcodeImagem = null;

    if (loc?.id && cfg.buscarQrImagem !== false) {
      try {
        qrcodeImagem = await obterQrCodeLoc(cfg, token, loc.id);
      } catch (erroQr) {
        console.warn('[EFI] QR imagem indisponível, usando pixCopiaECola:', erroQr.message);
      }
    }

    const expiracaoSegundos = payload.calendario.expiracao;
    const validadeEm = new Date(Date.now() + expiracaoSegundos * 1000);

    return {
      txid,
      pixCopiaECola: pixCopiaECola || null,
      qrcode: pixCopiaECola || qrcodeImagem || null,
      qrcodeImagem,
      validadeEm,
      expiracaoSegundos,
    };
  } catch (erro) {
    throw new Error(formatarErroEfi('Erro ao criar cobrança', erro));
  }
}

/**
 * Consulta status de uma cobrança Efi pelo txid.
 */
async function verificarStatus({ txid, credenciais }) {
  try {
    if (!txid) throw new Error('TXID obrigatório');

    const cfg = resolverConfig(credenciais);
    const token = await obterToken(cfg);

    const response = await axiosEfi(cfg, {
      method: 'get',
      url: `${cfg.apiUrl}/v2/cob/${txid}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    const cobData = response.data;
    const pixRecebido = cobData.pix ? Object.values(cobData.pix)[0] : null;

    return {
      status: pixRecebido ? 'pago' : 'pendente',
      pago: !!pixRecebido,
      txid,
      dataPagamento: pixRecebido?.horario || null,
      valor: cobData.valor?.original || null,
    };
  } catch (erro) {
    throw new Error(formatarErroEfi('Erro ao verificar status', erro));
  }
}

/**
 * Interpreta webhook da Efi e REVALIDA na API antes de confirmar.
 * Não confia apenas no corpo do POST (que pode ser forjado); reconsulta a
 * cobrança pelo txid, igual ao fluxo do Mercado Pago.
 * Retorna dados normalizados ou null se não confirmado/ inválido.
 */
async function processarWebhook({ body, credenciais }) {
  let txid = null;
  if (body?.pix?.[0]?.txid) txid = body.pix[0].txid;
  else if (body?.txid) txid = body.txid;
  if (!txid) return null;

  const status = await verificarStatus({ txid, credenciais });
  if (!status.pago) return null;

  return {
    txid,
    valor: status.valor,
    pagador: null,
    horario: status.dataPagamento,
  };
}

module.exports = {
  id: ID,
  gerarCobranca,
  verificarStatus,
  processarWebhook,
};
