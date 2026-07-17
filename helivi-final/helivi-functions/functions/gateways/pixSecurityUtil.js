// ═══════════════════════════════════════════════════════════════════════════
// PIX SECURITY — Autorização e validação de valores (backend only)
// ═══════════════════════════════════════════════════════════════════════════

const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');

const db = admin.firestore();
const VALOR_MAX_CENTAVOS = 5000000; // R$ 50.000,00

async function resolverOwnerUid(uid) {
  const snap = await db.collection('usuarios').where('uid', '==', uid).limit(1).get();
  if (!snap.empty) {
    const d = snap.docs[0].data();
    return d.ownerUid || uid;
  }
  return uid;
}

async function assertUsuarioAdmin(uid) {
  const snap = await db.collection('usuarios').where('uid', '==', uid).limit(1).get();
  if (!snap.empty && snap.docs[0].data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Apenas administradores podem alterar pagamentos.');
  }
}

// Exige que o chamador seja admin e retorna o ownerUid (tenant) dele.
// Conta principal (sem doc em `usuarios`) é admin do próprio UID.
async function assertAdminDoEstabelecimento(uid) {
  const snap = await db.collection('usuarios').where('uid', '==', uid).limit(1).get();
  if (snap.empty) {
    return { ownerUid: uid, docId: null, ehContaPrincipal: true };
  }
  const d = snap.docs[0].data();
  if (d.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Apenas administradores podem gerenciar colaboradores.');
  }
  return { ownerUid: d.ownerUid || uid, docId: snap.docs[0].id, ehContaPrincipal: false };
}

function calcularTotalCentavos(comanda) {
  const itens = comanda.itens || [];
  const total = itens.reduce((s, i) => s + (Number(i.preco) || 0) * (Number(i.quantidade) || 1), 0);
  return Math.round(total * 100);
}

async function carregarComandaAutorizada(uid, comandaId) {
  const snap = await db.collection('comandas').doc(comandaId).get();
  if (!snap.exists) {
    throw new HttpsError(
      'not-found',
      `Comanda "${comandaId}" não encontrada. Em localhost, crie a comanda com o emulador Firestore ativo (npm run serve).`
    );
  }

  const cmd = snap.data();
  const ownerUid = await resolverOwnerUid(uid);
  const cmdOwner = cmd.ownerUid || cmd.uid;

  if (cmdOwner !== ownerUid && cmd.uid !== uid) {
    throw new HttpsError('permission-denied', 'Sem permissão para esta comanda.');
  }

  return { ref: snap.ref, data: cmd, ownerUid };
}

function validarValorPix(valorCentavos, comanda) {
  const valor = Number(valorCentavos);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new HttpsError('invalid-argument', 'Valor inválido.');
  }
  if (valor > VALOR_MAX_CENTAVOS) {
    throw new HttpsError('invalid-argument', 'Valor acima do limite permitido.');
  }

  const esperado = calcularTotalCentavos(comanda);
  if (esperado > 0 && Math.abs(valor - esperado) > 1) {
    throw new HttpsError('invalid-argument', 'Valor não confere com o total da comanda.');
  }
}

async function assertTxidDaComanda(uid, txid) {
  const cmdSnap = await db.collection('comandas').where('pixTxid', '==', txid).limit(1).get();
  if (cmdSnap.empty) {
    throw new HttpsError('not-found', 'Transação PIX não encontrada.');
  }
  const comandaId = cmdSnap.docs[0].id;
  await carregarComandaAutorizada(uid, comandaId);
  return cmdSnap;
}

async function assertIntentDaComanda(uid, intentId) {
  const cmdSnap = await db.collection('comandas').where('cartaoIntentId', '==', intentId).limit(1).get();
  if (cmdSnap.empty) {
    throw new HttpsError('not-found', 'Pagamento de cartão não encontrado.');
  }
  const comandaId = cmdSnap.docs[0].id;
  await carregarComandaAutorizada(uid, comandaId);
  return cmdSnap;
}

module.exports = {
  assertUsuarioAdmin,
  assertAdminDoEstabelecimento,
  carregarComandaAutorizada,
  validarValorPix,
  assertTxidDaComanda,
  assertIntentDaComanda,
  resolverOwnerUid,
};
