// ═══════════════════════════════════════════════════════════════════════════
// PIX WEBHOOK UTIL — Persistência compartilhada após confirmação de pagamento
// ═══════════════════════════════════════════════════════════════════════════

const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');

const db = admin.firestore();

/**
 * Salva confirmação de pagamento PIX e atualiza a comanda vinculada.
 * @param {{ txid: string, valor: number|string, pagador?: object, horario?: string, gateway?: string }} dados
 */
async function salvarWebhookPix(dados) {
  const { txid, valor, pagador, horario, gateway } = dados;

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
    gateway: gateway || null,
  }, { merge: true });

  const cmdSnap = await db.collection('comandas')
    .where('pixTxid', '==', txid)
    .limit(1)
    .get();

  if (!cmdSnap.empty) {
    await cmdSnap.docs[0].ref.update({
      statusPagamento: 'confirmado',
      pixConfirmadoEm: Timestamp.now(),
      pixValor: parseFloat(valor),
    });
  }

  return { sucesso: true, mensagem: 'Webhook processado com sucesso' };
}

module.exports = { salvarWebhookPix };
