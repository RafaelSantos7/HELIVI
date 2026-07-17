// ═══════════════════════════════════════════════════════════════════════════
// PIX.JS — Integração com API EFI Bank PIX
// ═══════════════════════════════════════════════════════════════════════════

const axios = require('axios');
const fs = require('fs');
const https = require('https');
const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');
const { AMBIENTE, EFI_CONFIG, credenciaisConfiguradas } = require('./efi-config');

const db = admin.firestore();

console.log(`[PIX] Ambiente: ${AMBIENTE} | URL: ${EFI_CONFIG.apiUrl} | Client: ${EFI_CONFIG.clientId.slice(0, 8)}...`);

if (!credenciaisConfiguradas()) {
  console.warn(
    '[PIX] Usando credenciais padrão do repositório. ' +
    'Configure helivi-functions/.env.local com Client_Id e Client_Secret do painel Efi.'
  );
}

let httpsAgentCache = null;
let tokenCache = { token: null, expiresAt: 0 };

function criarHttpsAgent() {
  if (!httpsAgentCache) {
    httpsAgentCache = new https.Agent({
      cert: fs.readFileSync(EFI_CONFIG.certPath),
      key: fs.readFileSync(EFI_CONFIG.certPath),
      passphrase: '',
      keepAlive: true,
      maxSockets: 10,
    });
  }
  return httpsAgentCache;
}

function limparTokenCache() {
  tokenCache = { token: null, expiresAt: 0 };
}

async function axiosEfi(config) {
  const { __retried, timeout, ...rest } = config;
  try {
    return await axios({
      ...rest,
      httpsAgent: criarHttpsAgent(),
      timeout: timeout ?? EFI_CONFIG.timeout,
    });
  } catch (erro) {
    if (erro.code === 'ECONNABORTED' && !__retried) {
      return axiosEfi({ ...config, __retried: true });
    }
    throw erro;
  }
}

function logErroEfi(contexto, erro) {
  console.error(`Erro ${contexto}:`, {
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
      'Copie Client_Id e Client_Secret da aba Homologação no painel Efi para helivi-functions/.env.local ' +
      `(ambiente atual: ${AMBIENTE}).`;
  }

  return `${contexto}: ${detalhe}`;
}

async function obterTokenEFI() {
  try {
    if (!fs.existsSync(EFI_CONFIG.certPath)) {
      throw new Error(`Certificado não encontrado em: ${EFI_CONFIG.certPath}`);
    }

    const agora = Date.now();
    if (tokenCache.token && agora < tokenCache.expiresAt - 60000) {
      return tokenCache.token;
    }

    const response = await axiosEfi({
      method: 'post',
      url: `${EFI_CONFIG.apiUrl}/oauth/token`,
      data: { grant_type: 'client_credentials' },
      auth: {
        username: EFI_CONFIG.clientId,
        password: EFI_CONFIG.clientSecret,
      },
      headers: { 'Content-Type': 'application/json' },
    });

    tokenCache = {
      token: response.data.access_token,
      expiresAt: agora + (response.data.expires_in * 1000),
    };

    return tokenCache.token;
  } catch (erro) {
    limparTokenCache();
    throw new Error(formatarErroEfi('Falha na autenticação EFI', erro));
  }
}

async function obterQrCodeLoc(token, locId) {
  const response = await axiosEfi({
    method: 'get',
    url: `${EFI_CONFIG.apiUrl}/v2/loc/${locId}/qrcode`,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 8000,
  });

  return response.data.imagemQrcode || response.data.qrcode || null;
}

async function criarCobPix(valor, descricao, identificador) {
  try {
    if (!valor || valor <= 0) throw new Error('Valor inválido');
    if (!identificador) throw new Error('Identificador obrigatório');

    const token = await obterTokenEFI();

    const payload = {
      calendario: { expiracao: 3600 },
      valor: { original: (valor / 100).toFixed(2) },
      chave: EFI_CONFIG.pixKey,
      solicitacaoPagador: descricao || 'Pagamento de comanda',
      infoAdicionais: [{ nome: 'Identificador', valor: identificador }],
    };

    const response = await axiosEfi({
      method: 'post',
      url: `${EFI_CONFIG.apiUrl}/v2/cob`,
      data: payload,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const { txid, pixCopiaECola, loc } = response.data;
    let qrcodeImagem = null;

    // Opcional: imagem oficial da Efi. O PDV já gera QR a partir do pixCopiaECola.
    if (loc?.id && EFI_CONFIG.buscarQrImagem !== false) {
      try {
        qrcodeImagem = await obterQrCodeLoc(token, loc.id);
      } catch (erroQr) {
        console.warn('QR imagem indisponível, usando pixCopiaECola:', erroQr.message);
      }
    }

    const expiracaoSegundos = payload.calendario.expiracao;
    const validadeEm = new Date(Date.now() + expiracaoSegundos * 1000);

    return {
      sucesso: true,
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

async function verificarStatusPix(txid) {
  try {
    if (!txid) throw new Error('TXID obrigatório');

    const token = await obterTokenEFI();

    const response = await axiosEfi({
      method: 'get',
      url: `${EFI_CONFIG.apiUrl}/v2/cob/${txid}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    const cobData = response.data;
    const pixRecebido = cobData.pix ? Object.values(cobData.pix)[0] : null;

    return {
      sucesso: true,
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

async function salvarWebhookPix(dados) {
  try {
    const txid = dados.txid;
    const valor = dados.valor;
    const pagador = dados.pagador;
    const horario = dados.horario;

    if (!txid || valor === undefined || valor === null) {
      throw new Error('Dados incompletos no webhook');
    }

    await db.collection('pagamentos_pix').doc(txid).set({
      txid,
      valor: parseFloat(valor),
      cpfPagador: pagador?.cpf || 'não informado',
      horarioPagamento: horario || new Date().toISOString(),
      confirmadoEm: Timestamp.now(),
      status: 'confirmado',
    }, { merge: true });

    const cmdSnap = await db.collection('comandas')
      .where('pixTxid', '==', txid)
      .limit(1)
      .get();

    if (!cmdSnap.empty) {
      const cmdId = cmdSnap.docs[0].id;
      await db.collection('comandas').doc(cmdId).update({
        statusPagamento: 'confirmado',
        pixConfirmadoEm: Timestamp.now(),
        pixValor: parseFloat(valor),
      });
    }

    return { sucesso: true, mensagem: 'Webhook processado com sucesso' };
  } catch (erro) {
    throw new Error(formatarErroEfi('Erro ao processar webhook', erro));
  }
}

function parseWebhookEfi(body) {
  if (body?.pix?.[0]) {
    const pix = body.pix[0];
    return {
      txid: pix.txid,
      valor: pix.valor,
      pagador: pix.pagador,
      horario: pix.horario,
    };
  }

  if (body?.txid && body?.valor !== undefined) {
    return body;
  }

  return null;
}

module.exports = {
  obterTokenEFI,
  criarCobPix,
  verificarStatusPix,
  salvarWebhookPix,
  parseWebhookEfi,
  EFI_CONFIG,
  AMBIENTE,
};
