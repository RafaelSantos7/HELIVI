// ═══════════════════════════════════════════════════════════════════════════
// MERCADO PAGO POINT SERVICE — Maquininha física (Payment Intent API)
// Doc: POST /point/integration-api/devices/{device_id}/payment-intents
// https://www.mercadopago.com.br/developers/en/reference/integrations_api_paymentintent_mlb
// ═══════════════════════════════════════════════════════════════════════════

const axios = require('axios');
const crypto = require('crypto');

const ID = 'mercadopago_point';
const MP_API = 'https://api.mercadopago.com';
const TIMEOUT_MS = 30000;

/** Tipos aceitos pela API Point */
const TIPOS_PAGAMENTO = ['credit_card', 'debit_card'];

function headers(token, idempotencyKey) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
  };
}

function obterToken(credenciais = {}) {
  const token = (
    credenciais.mpPointAccessToken
    || credenciais.mpAccessTokenProducao
    || credenciais.mpAccessToken
    || ''
  ).trim();
  if (!token) {
    throw new Error(
      'Access Token do Mercado Pago Point não configurado. '
      + 'Salve em Configurações → Maquininha de Cartão ou reutilize o Token PRODUÇÃO do PIX.'
    );
  }
  if (!token.startsWith('APP_USR-')) {
    throw new Error('Access Token Point inválido: deve começar com APP_USR-.');
  }
  return token;
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
    if (typeof e === 'string') add(e);
    else {
      add(e.message);
      add(e.description);
      add(e.code);
    }
  });
  add(body?.message);
  add(body?.error);
  return out;
}

function formatarErroPoint(contexto, erro) {
  const data = erro.response?.data || {};
  const status = erro.response?.status;
  const erros = extrairErrosMp(data);
  const texto = erros.join(' ').toLowerCase();

  console.error(`[MercadoPagoPoint] Erro ${contexto}:`, {
    message: erro.message,
    status: status || null,
  });

  if (status === 401) {
    return `${contexto}: Access Token inválido ou expirado. Verifique em Configurações.`;
  }

  if (status === 403) {
    return `${contexto}: Integrador não autorizado para Point. Cadastre a aplicação no painel MP.`;
  }

  if (status === 404) {
    return `${contexto}: Maquininha não encontrada ou offline. Verifique o Device ID e se o terminal está ligado.`;
  }

  if (status === 409) {
    return `${contexto}: Maquininha ocupada — já existe um pagamento em andamento. Aguarde ou cancele na maquininha.`;
  }

  if (texto.includes('device_not_available') || texto.includes('offline')) {
    return `${contexto}: Maquininha offline ou indisponível. Verifique conexão Wi-Fi/dados.`;
  }

  const detalhe = erros[0] || data.message || erro.message;
  return `${contexto}: ${detalhe}`;
}

/**
 * Normaliza o state do Payment Intent para o PDV.
 * Estados legacy: OPEN, ON_TERMINAL, PROCESSING, FINISHED, CANCELED, ERROR
 */
function normalizarStatusIntent(data) {
  const state = (data?.state || data?.status || '').toUpperCase();
  const pay = data?.payment || {};
  const payState = (pay.state || pay.status || '').toUpperCase();
  const paymentId = pay.id ? String(pay.id) : null;
  const valor = data?.amount != null ? data.amount / 100 : null;

  // Cancelado / erro explícito
  if (state === 'CANCELED' || state === 'CANCELLED') {
    return { status: 'cancelado', pago: false, recusado: false, cancelado: true, paymentId, valor, state };
  }
  if (state === 'ERROR') {
    return { status: 'recusado', pago: false, recusado: true, cancelado: false, paymentId, valor, state };
  }

  // Em andamento na maquininha
  if (state === 'OPEN' || state === 'ON_TERMINAL' || state === 'PROCESSING' || !state) {
    return { status: 'pendente', pago: false, recusado: false, cancelado: false, paymentId, valor, state };
  }

  // FINISHED — verificar resultado do pagamento embutido
  if (state === 'FINISHED') {
    if (payState === 'APPROVED' || payState === 'PROCESSED' || payState === 'ACCREDITED') {
      return { status: 'aprovado', pago: true, recusado: false, cancelado: false, paymentId, valor, state };
    }
    if (payState === 'REJECTED' || payState === 'REFUSED' || payState === 'FAILED') {
      return { status: 'recusado', pago: false, recusado: true, cancelado: false, paymentId, valor, state };
    }
    // FINISHED sem estado claro — pendente até consultar payment id
    return { status: 'pendente', pago: false, recusado: false, cancelado: false, paymentId, valor, state, aguardandoConfirmacao: true };
  }

  return { status: 'pendente', pago: false, recusado: false, cancelado: false, paymentId, valor, state };
}

async function consultarPagamentoMp(token, paymentId) {
  try {
    const { data } = await axios.get(`${MP_API}/v1/payments/${paymentId}`, {
      headers: headers(token),
      timeout: 15000,
    });
    return data;
  } catch (e) {
    if (e.response?.status === 404) return null;
    throw e;
  }
}

/**
 * Cria Payment Intent e envia valor para a maquininha Point.
 * @param {object} params
 * @param {number} params.valorCentavos - Valor em centavos (ex: 1750 = R$ 17,50)
 * @param {string} params.tipoPagamento - 'credit_card' | 'debit_card'
 * @param {string} params.deviceId - ID do terminal Point
 * @param {string} params.externalReference - Referência externa (comanda)
 * @param {string} [params.descricao] - Descrição opcional
 */
async function criarPaymentIntent({
  valorCentavos,
  tipoPagamento,
  deviceId,
  externalReference,
  descricao,
  credenciais,
}) {
  const token = obterToken(credenciais);
  const tipo = (tipoPagamento || '').trim();

  if (!TIPOS_PAGAMENTO.includes(tipo)) {
    throw new Error(`Tipo de pagamento inválido: "${tipo}". Use credit_card ou debit_card.`);
  }
  if (!deviceId) {
    throw new Error('Device ID da maquininha não configurado.');
  }

  const valor = Number(valorCentavos);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error('Valor inválido para envio à maquininha.');
  }

  const payload = {
    amount: Math.round(valor),
    description: descricao || 'Pagamento HELIVI PDV',
    payment: {
      type: tipo,
      installments: tipo === 'credit_card' ? 1 : undefined,
      installments_cost: tipo === 'credit_card' ? 'seller' : undefined,
    },
    additional_info: {
      external_reference: String(externalReference || '').slice(0, 64),
      print_on_terminal: true,
    },
  };

  // Remove campos undefined do payment
  Object.keys(payload.payment).forEach((k) => {
    if (payload.payment[k] === undefined) delete payload.payment[k];
  });

  const url = `${MP_API}/point/integration-api/devices/${encodeURIComponent(deviceId)}/payment-intents`;

  console.log('[MercadoPagoPoint] POST payment-intent', {
    deviceId,
    valor: payload.amount,
    tipo,
  });

  try {
    const { data } = await axios.post(url, payload, {
      headers: headers(token, crypto.randomUUID()),
      timeout: TIMEOUT_MS,
    });

    if (!data?.id) {
      throw new Error('Resposta MP Point sem ID do payment intent.');
    }

    return {
      intentId: String(data.id),
      deviceId: data.device_id || deviceId,
      amount: data.amount,
      state: data.state || 'OPEN',
      paymentType: tipo,
    };
  } catch (erro) {
    throw new Error(formatarErroPoint('Erro ao enviar pagamento à maquininha', erro));
  }
}

/**
 * Consulta status do Payment Intent (polling).
 * Se FINISHED sem resultado claro, consulta GET /v1/payments/{id}.
 */
async function consultarStatus({ paymentIntentId, credenciais }) {
  const token = obterToken(credenciais);
  if (!paymentIntentId) {
    throw new Error('ID do payment intent obrigatório.');
  }

  const url = `${MP_API}/point/integration-api/payment-intents/${encodeURIComponent(paymentIntentId)}`;

  try {
    const { data } = await axios.get(url, {
      headers: headers(token),
      timeout: TIMEOUT_MS,
    });

    let resultado = normalizarStatusIntent(data);

    // FINISHED sem confirmação — consulta payment id na API de pagamentos
    if (resultado.aguardandoConfirmacao && resultado.paymentId) {
      const payment = await consultarPagamentoMp(token, resultado.paymentId);
      if (payment) {
        const pago = payment.status === 'approved';
        resultado = {
          ...resultado,
          status: pago ? 'aprovado' : payment.status === 'rejected' ? 'recusado' : 'pendente',
          pago,
          recusado: payment.status === 'rejected',
          valor: payment.transaction_amount ?? resultado.valor,
        };
      }
    }

    return {
      ...resultado,
      intentId: paymentIntentId,
      rawState: data?.state || null,
    };
  } catch (erro) {
    throw new Error(formatarErroPoint('Erro ao consultar status na maquininha', erro));
  }
}

/**
 * Cancela Payment Intent na maquininha (usuário desistiu ou timeout).
 */
async function cancelarPaymentIntent({ deviceId, paymentIntentId, credenciais }) {
  const token = obterToken(credenciais);
  if (!deviceId || !paymentIntentId) {
    throw new Error('Device ID e Payment Intent ID obrigatórios para cancelamento.');
  }

  const url = `${MP_API}/point/integration-api/devices/${encodeURIComponent(deviceId)}/payment-intents/${encodeURIComponent(paymentIntentId)}`;

  try {
    await axios.delete(url, {
      headers: headers(token, crypto.randomUUID()),
      timeout: TIMEOUT_MS,
    });
    return { cancelado: true, intentId: paymentIntentId };
  } catch (erro) {
    // 404 = intent já finalizado/cancelado — não é erro crítico
    if (erro.response?.status === 404) {
      return { cancelado: true, intentId: paymentIntentId, jaFinalizado: true };
    }
    throw new Error(formatarErroPoint('Erro ao cancelar pagamento na maquininha', erro));
  }
}

module.exports = {
  id: ID,
  criarPaymentIntent,
  consultarStatus,
  cancelarPaymentIntent,
  TIPOS_PAGAMENTO,
};
