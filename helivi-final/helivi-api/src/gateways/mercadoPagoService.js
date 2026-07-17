// ═══════════════════════════════════════════════════════════════════════════
// MERCADO PAGO SERVICE — Gateway PIX (Checkout API /v1/orders)
// Doc teste PIX: payer test_user_br@testuser.com + first_name APRO + token de TESTE
// https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix
// ═══════════════════════════════════════════════════════════════════════════

const axios = require('axios');
const crypto = require('crypto');

const ID = 'mercadopago';
const MP_API = 'https://api.mercadopago.com';
const TIMEOUT_MS = 20000;

function headers(token, idempotencyKey) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
  };
}

/** Modo sandbox = Credenciais de TESTE do painel MP (aba Testes). */
function isAmbienteSandbox(_token, credenciais = {}) {
  return credenciais.mpAmbienteTeste === true;
}

function montarPayer(credenciais = {}) {
  if (isAmbienteSandbox(null, credenciais)) {
    // Sandbox MP real (ticket /sandbox/): doc oficial usa test_user_br + APRO.
    // Com token APP_USR da integração helivi-pdv, só funciona payer genérico + APRO (PIX real).
    if (credenciais.mpUsarPayerSandboxDoc) {
      return { email: 'test_user_br@testuser.com', first_name: 'APRO' };
    }
    const email = (credenciais.mpPayerEmail || '').trim() || 'cliente@helivi.app';
    return { email, first_name: 'APRO' };
  }
  const email = (credenciais.mpPayerEmail || '').trim() || 'cliente@helivi.app';
  return { email };
}

function isPixSandboxReal(ticketUrl, pixCopiaECola) {
  if (ticketUrl && ticketUrl.includes('/sandbox/')) return true;
  if (pixCopiaECola && /TESTUSER/i.test(pixCopiaECola)) return true;
  return false;
}

/** Payload sandbox idêntico ao exemplo oficial do MP (sem campos extras). */
function montarPayloadOrder({ valorStr, identificador, descricao, credenciais }) {
  const sandbox = isAmbienteSandbox(null, credenciais);

  if (sandbox) {
    return {
      type: 'online',
      external_reference: identificador,
      total_amount: valorStr,
      payer: montarPayer(credenciais),
      transactions: {
        payments: [
          {
            amount: valorStr,
            payment_method: {
              id: 'pix',
              type: 'bank_transfer',
            },
          },
        ],
      },
    };
  }

  const payload = {
    type: 'online',
    processing_mode: 'automatic',
    external_reference: identificador,
    total_amount: valorStr,
    payer: montarPayer(credenciais),
    transactions: {
      payments: [
        {
          amount: valorStr,
          payment_method: {
            id: 'pix',
            type: 'bank_transfer',
          },
          expiration_time: 'P1D',
        },
      ],
    },
  };

  if (descricao) payload.description = descricao;
  return payload;
}

function extrairPixDaOrder(data) {
  const payments = data?.transactions?.payments;
  const lista = Array.isArray(payments) ? payments : payments ? [payments] : [];
  const pay = lista[0] || {};
  const pm = pay.payment_method || {};

  const qrCode = pm.qr_code || null;
  const qrBase64 = pm.qr_code_base64 || null;
  const ticketUrl = pm.ticket_url || null;

  const paymentId = pay.id ? String(pay.id) : null;
  const orderId = data?.id ? String(data.id) : null;

  return {
    txid: paymentId || orderId,
    orderId,
    paymentId,
    pixCopiaECola: qrCode,
    qrcode: qrCode,
    qrcodeImagem: qrBase64 ? `data:image/png;base64,${qrBase64}` : null,
    ticketUrl,
    orderStatus: data?.status || null,
    paymentStatus: pay.status || null,
  };
}

function orderRespondeComPix(orderData) {
  const st = orderData?.status;
  return st === 'action_required' || st === 'processed' || st === 'paid';
}

function extrairDetalheTransacao(body) {
  const order = body?.data || body;
  const payments = order?.transactions?.payments;
  const pay = Array.isArray(payments) ? payments[0] : payments;

  return {
    orderStatus: order?.status || null,
    orderStatusDetail: order?.status_detail || null,
    paymentStatus: pay?.status || null,
    paymentStatusDetail: pay?.status_detail || null,
  };
}

function extrairErrosMp(body) {
  const out = [];

  function add(val) {
    if (!val) return;
    const s = String(val).trim();
    if (s && !out.includes(s)) out.push(s);
  }

  const lista = body?.errors || body?.cause || [];
  (Array.isArray(lista) ? lista : []).forEach((e) => {
    if (typeof e === 'string') {
      add(e);
      return;
    }
    add(e.message);
    add(e.description);
    add(e.code);
    (e.details || []).forEach((d) => {
      if (typeof d === 'string') add(d);
      else {
        add(d.message);
        add(d.description);
        add(d.code);
      }
    });
  });

  add(body?.message);
  add(body?.error);
  add(body?.code);

  const tx = extrairDetalheTransacao(body);
  add(tx.paymentStatusDetail);
  add(tx.orderStatusDetail);

  return out;
}

function mensagemErro402(body, sandbox) {
  const erros = extrairErrosMp(body);
  const texto = erros.join(' ').toLowerCase();
  const tx = extrairDetalheTransacao(body);

  if (texto.includes('invalid_users')) {
    if (sandbox) {
      return 'Token de PRODUÇÃO da conta real não funciona no Modo teste MP. '
        + 'Salve o Access Token APP_USR da aba Testes → Credenciais de teste '
        + '(campo Token TESTE). Ou desmarque Modo teste MP para PIX real.';
    }
    return 'Conflito de credenciais: em produção use Token PRODUÇÃO e desmarque Modo teste MP.';
  }

  if (
    texto.includes('13253')
    || texto.includes('without key')
    || (texto.includes('key') && (texto.includes('qr') || texto.includes('pix')))
  ) {
    return 'Conta sem chave PIX. Cadastre uma chave no app Mercado Pago '
      + 'ou use Modo teste MP com Token TESTE (Credenciais de teste).';
  }

  if (tx.orderStatus === 'failed' || texto.includes('transactions failed')) {
    if (sandbox) {
      return 'Sandbox falhou: confira o Token TESTE (APP_USR de Testes → Credenciais de teste). '
        + 'Não use token de Produção da conta real nem token TEST-.';
    }
    return 'Transação PIX falhou. Verifique chave PIX na conta e se o Token PRODUÇÃO está correto.';
  }

  return erros[0] || 'Transação PIX recusada pelo Mercado Pago (402).';
}

function validarTokenMp(token, sandbox) {
  const t = (token || '').trim();
  if (!t) {
    throw new Error(
      sandbox
        ? 'Token TESTE não configurado. Salve o APP_USR de Testes → Credenciais de teste.'
        : 'Token PRODUÇÃO não configurado. Salve o APP_USR de Credenciais de produção.'
    );
  }
  if (t.startsWith('TEST-')) {
    throw new Error(
      'Token TEST- não funciona na API /v1/orders. '
      + 'Na aba Testes → Credenciais de teste, copie o Access Token APP_USR (não o TEST-).'
    );
  }
  if (!t.startsWith('APP_USR-')) {
    throw new Error('Access Token inválido: deve começar com APP_USR-.');
  }
}

function mensagemErro401(body, sandbox) {
  const erros = extrairErrosMp(body);
  const texto = erros.join(' ').toLowerCase();

  if (texto.includes('test credentials') && texto.includes('not supported')) {
    return 'Token TEST- não funciona em /v1/orders. Use APP_USR de Testes → Credenciais de teste.';
  }

  if (
    texto.includes('invalid access token')
    || texto.includes('invalid_credentials')
    || texto.includes('unauthorized')
  ) {
    return sandbox
      ? 'Access Token TESTE inválido ou expirado. No painel MP: Testes → Credenciais de teste → copie o APP_USR- e salve em Configurações → Token TESTE.'
      : 'Access Token PRODUÇÃO inválido ou expirado. No painel MP: Credenciais de produção → copie o APP_USR- e salve em Configurações → Token PRODUÇÃO.';
  }

  return erros[0] || (sandbox
    ? 'Token TESTE rejeitado pelo Mercado Pago. Gere um novo APP_USR em Credenciais de teste.'
    : 'Token PRODUÇÃO rejeitado pelo Mercado Pago. Gere um novo APP_USR em Credenciais de produção.');
}

function formatarErroMp(contexto, erro, credenciais = {}) {
  const data = erro.response?.data || {};
  const status = erro.response?.status;
  const sandbox = isAmbienteSandbox(credenciais?.mpAccessToken, credenciais);

  const causes = Array.isArray(data.cause)
    ? data.cause.map((c) => c.description || c.code || JSON.stringify(c)).filter(Boolean)
    : [];
  const erros = Array.isArray(data.errors)
    ? data.errors.map((e) => e.message || e.code || JSON.stringify(e)).filter(Boolean)
    : [];

  console.error(`[MercadoPago] Erro ${contexto}:`, {
    message: erro.message,
    status: status || null,
    sandbox,
    mp_message: data.message || null,
    mp_error: data.error || null,
    mp_causes: causes.length ? causes : null,
    mp_errors: erros.length ? erros : null,
    // corpo resumido (sem token)
    mp_body: typeof data === 'object' ? JSON.stringify(data).slice(0, 800) : null,
  });

  if (status === 401) {
    return `${contexto}: ${mensagemErro401(data, sandbox)}`;
  }

  if (status === 402) {
    return `${contexto}: ${mensagemErro402(data, sandbox)}`;
  }

  const detalhe =
    causes[0] ||
    erros[0] ||
    data.message ||
    data.error ||
    erro.message;

  if (status === 400) {
    return `${contexto}: ${detalhe}. Confira: chave PIX no app Mercado Pago, Access Token de PRODUÇÃO (APP_USR-) e Modo teste desmarcado (ou use token sandbox + Modo teste).`;
  }

  return `${contexto}: ${detalhe}`;
}

function montarRetornoPix(pix, sandbox) {
  if (!pix.txid) {
    throw new Error('Resposta MP sem ID de pagamento/pedido');
  }

  const pixSandboxReal = isPixSandboxReal(pix.ticketUrl, pix.pixCopiaECola);

  return {
    txid: pix.txid,
    mpOrderId: pix.orderId,
    mpPaymentId: pix.paymentId,
    pixCopiaECola: pix.pixCopiaECola,
    qrcode: pix.qrcode,
    qrcodeImagem: pix.qrcodeImagem,
    ticketUrl: pix.ticketUrl,
    ambienteTeste: sandbox,
    pixSandboxReal,
    pixSimulacaoLocal: sandbox && !pixSandboxReal,
    validadeEm: new Date(Date.now() + 86400 * 1000),
    expiracaoSegundos: 86400,
  };
}

/**
 * Gera cobrança PIX via POST /v1/orders.
 */
async function gerarCobranca({ valorCentavos, descricao, identificador, credenciais }) {
  const token = (credenciais?.mpAccessToken || '').trim();
  const sandbox = isAmbienteSandbox(token, credenciais);
  validarTokenMp(token, sandbox);
  const valorStr = (valorCentavos / 100).toFixed(2);
  const payload = montarPayloadOrder({ valorStr, identificador, descricao, credenciais });

  console.log('[MercadoPago] POST /v1/orders', {
    sandbox,
    valor: valorStr,
    modo: sandbox ? 'sandbox' : 'producao',
  });

  try {
    const response = await axios.post(`${MP_API}/v1/orders`, payload, {
      headers: headers(token, crypto.randomUUID()),
      timeout: TIMEOUT_MS,
      validateStatus: (s) => s === 201 || s === 402,
    });

    const { status: httpStatus, data } = response;
    const orderData = data?.data || data;

    if (httpStatus === 201 && orderRespondeComPix(orderData)) {
      const pix = extrairPixDaOrder(orderData);
      console.log('[MercadoPago] Order OK', {
        orderId: pix.orderId,
        paymentId: pix.paymentId,
        orderStatus: pix.orderStatus,
        ticketUrl: pix.ticketUrl,
      });
      return montarRetornoPix(pix, sandbox);
    }

    if (httpStatus === 402) {
      if (orderRespondeComPix(orderData)) {
        const pix = extrairPixDaOrder(orderData);
        if (pix.pixCopiaECola || pix.ticketUrl) {
          return montarRetornoPix(pix, sandbox);
        }
      }
      throw Object.assign(new Error('402'), { response: { status: 402, data } });
    }

    const pix = extrairPixDaOrder(orderData);
    return montarRetornoPix(pix, sandbox);
  } catch (erro) {
    throw new Error(formatarErroMp('Erro ao criar cobrança', erro, credenciais));
  }
}

async function consultarPagamento(token, txid) {
  try {
    const { data } = await axios.get(`${MP_API}/v1/payments/${txid}`, {
      headers: headers(token),
      timeout: 15000,
    });
    return data;
  } catch (e) {
    if (e.response?.status === 404) return null;
    throw e;
  }
}

async function consultarOrder(token, orderId) {
  const { data } = await axios.get(`${MP_API}/v1/orders/${orderId}`, {
    headers: headers(token),
    timeout: 15000,
  });
  return data?.data || data;
}

/**
 * Cancela order PIX pendente (status action_required/created).
 * POST /v1/orders/{id}/cancel
 */
async function cancelarOrder({ orderId, externalReference, credenciais }) {
  const token = (credenciais?.mpAccessToken || '').trim();
  if (!token) throw new Error('Access Token do Mercado Pago não configurado.');
  if (!orderId) throw new Error('Order ID obrigatório para cancelar PIX.');

  const body = {};
  if (externalReference) body.external_reference = String(externalReference);

  try {
    await axios.post(`${MP_API}/v1/orders/${orderId}/cancel`, body, {
      headers: headers(token, crypto.randomUUID()),
      timeout: TIMEOUT_MS,
    });
    console.log('[MercadoPago] Order cancelada', { orderId });
    return { cancelado: true, orderId };
  } catch (erro) {
    const status = erro.response?.status;
    // Já cancelada / finalizada — não bloquear o PDV
    if (status === 404 || status === 409) {
      console.warn('[MercadoPago] Cancelamento ignorado:', status, erro.response?.data);
      return { cancelado: true, orderId, jaFinalizado: true };
    }
    throw new Error(formatarErroMp('Erro ao cancelar cobrança PIX', erro, credenciais));
  }
}

function pagamentoConfirmado(order, payObj) {
  if (order?.status === 'processed' || order?.status === 'paid') return true;
  const st = payObj?.status;
  return st === 'approved' || st === 'processed' || st === 'accredited';
}

/**
 * Consulta status — payment id, order id ou mpOrderId gravado na comanda.
 */
async function verificarStatus({ txid, credenciais, mpOrderId }) {
  const token = credenciais?.mpAccessToken;
  if (!token) {
    throw new Error('Access Token do Mercado Pago não configurado.');
  }

  try {
    const payment = await consultarPagamento(token, txid);
    if (payment) {
      const pago = payment.status === 'approved';
      return {
        status: pago ? 'pago' : 'pendente',
        pago,
        txid: String(payment.id),
        dataPagamento: payment.date_approved || null,
        valor: payment.transaction_amount ?? null,
      };
    }

    const orderId = mpOrderId || (String(txid).startsWith('ORD') ? txid : null);
    if (orderId) {
      const order = await consultarOrder(token, orderId);
      const pay = order?.transactions?.payments;
      const payObj = Array.isArray(pay) ? pay[0] : pay;
      const pago = pagamentoConfirmado(order, payObj);

      return {
        status: pago ? 'pago' : 'pendente',
        pago,
        txid: payObj?.id ? String(payObj.id) : String(orderId),
        dataPagamento: null,
        valor: parseFloat(payObj?.amount || order?.total_amount) || null,
      };
    }

    return { status: 'pendente', pago: false, txid, dataPagamento: null, valor: null };
  } catch (erro) {
    throw new Error(formatarErroMp('Erro ao verificar status', erro, credenciais));
  }
}

async function processarWebhook({ body, credenciais }) {
  const id = body?.data?.id || body?.['data.id'];
  if (!id) return null;

  const status = await verificarStatus({ txid: String(id), credenciais });
  if (!status.pago) return null;

  return {
    txid: String(id),
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
  cancelarOrder,
};
