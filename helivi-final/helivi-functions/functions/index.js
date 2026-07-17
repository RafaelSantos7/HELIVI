// functions/index.js — HELIVI v2 com CORS correto
require('./load-efi-env');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated }  = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

admin.initializeApp();
const db   = admin.firestore();
const auth = admin.auth();

const CORS = [
  'http://127.0.0.1:5500','http://127.0.0.1:5501',
  'http://localhost:5500','http://localhost:5501','http://localhost:3000',
  'https://helivi.web.app','https://helivi.firebaseapp.com',
];

function checarAuth(authCtx) {
  if (!authCtx) throw new HttpsError('unauthenticated', 'Você precisa estar logado.');
  return authCtx.uid;
}

// 1. CRIAR COLABORADOR
exports.criarColaborador = onCall({ cors: CORS }, async (req) => {
  const ownerUid = checarAuth(req.auth);
  const { nome, email, senha, perfil } = req.data;
  if (!nome || nome.trim().length < 2) throw new HttpsError('invalid-argument', 'Nome inválido.');
  if (!email || !email.includes('@'))  throw new HttpsError('invalid-argument', 'E-mail inválido.');
  if (!senha || senha.length < 6)      throw new HttpsError('invalid-argument', 'Senha mínimo 6 caracteres.');
  try {
    const userRecord = await auth.createUser({
      email: email.trim().toLowerCase(),
      password: senha,
      displayName: nome.trim(),
    });
    await db.collection('usuarios').add({
      uid: userRecord.uid, ownerUid,
      nome: nome.trim(), email: email.trim().toLowerCase(),
      role: perfil || 'atendente', ativo: true,
      criadoEm: FieldValue.serverTimestamp(),
    });
    return { sucesso: true, uid: userRecord.uid, mensagem: `Colaborador "${nome}" criado com sucesso!` };
  } catch (err) {
    if (err.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'Este e-mail já está cadastrado.');
    throw new HttpsError('internal', err.message);
  }
});

// 2. EDITAR COLABORADOR
exports.editarColaborador = onCall({ cors: CORS }, async (req) => {
  checarAuth(req.auth);
  const { docId, uid, nome, email, senha, perfil } = req.data;
  if (!docId) throw new HttpsError('invalid-argument', 'ID obrigatório.');
  const authUpdate = { displayName: nome.trim() };
  if (email) authUpdate.email = email.trim().toLowerCase();
  if (senha && senha.length >= 6) authUpdate.password = senha;
  try {
    if (uid) await auth.updateUser(uid, authUpdate);
    const update = { nome: nome.trim(), role: perfil || 'atendente', atualizadoEm: FieldValue.serverTimestamp() };
    if (email) update.email = email.trim().toLowerCase();
    await db.collection('usuarios').doc(docId).update(update);
    return { sucesso: true, mensagem: 'Colaborador atualizado!' };
  } catch (err) {
    if (err.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'E-mail já em uso.');
    throw new HttpsError('internal', err.message);
  }
});

// 3. EXCLUIR COLABORADOR
exports.excluirColaborador = onCall({ cors: CORS }, async (req) => {
  checarAuth(req.auth);
  const { docId, uid } = req.data;
  try {
    if (uid) await auth.deleteUser(uid).catch(() => {});
    await db.collection('usuarios').doc(docId).delete();
    return { sucesso: true, mensagem: 'Colaborador removido.' };
  } catch (err) {
    throw new HttpsError('internal', err.message);
  }
});

// 4. ATENDENTE — Pedido
exports.onPedidoCriado = onDocumentCreated('pedidos/{pedidoId}', async (event) => {
  const pedido = event.data?.data();
  if (!pedido?.uid) return null;
  try {
    const user = await auth.getUser(pedido.uid);
    await event.data.ref.update({ atendente: user.displayName || user.email.split('@')[0], atendenteEmail: user.email });
  } catch (e) {}
  return null;
});

// 5. ATENDENTE — Comanda
exports.onComandaCriada = onDocumentCreated('comandas/{comandaId}', async (event) => {
  const doc = event.data?.data();
  if (!doc?.uid) return null;
  try {
    const user = await auth.getUser(doc.uid);
    await event.data.ref.update({ atendente: user.displayName || user.email.split('@')[0], atendenteEmail: user.email });
  } catch (e) {}
  return null;
});

// 6. ATENDENTE — KDS Cozinha
exports.onKdsCozinhaCriado = onDocumentCreated('kds_cozinha/{id}', async (event) => {
  const doc = event.data?.data();
  if (!doc?.uid) return null;
  try {
    const user = await auth.getUser(doc.uid);
    await event.data.ref.update({ atendente: user.displayName || user.email.split('@')[0] });
  } catch (e) {}
  return null;
});

// 7. ATENDENTE — KDS Balcão
exports.onKdsBalcaoCriado = onDocumentCreated('kds_balcao/{id}', async (event) => {
  const doc = event.data?.data();
  if (!doc?.uid) return null;
  try {
    const user = await auth.getUser(doc.uid);
    await event.data.ref.update({ atendente: user.displayName || user.email.split('@')[0] });
  } catch (e) {}
  return null;
});

// ═══════════════════════════════════════════════════════════════════════════
// 8-10. INTEGRAÇÃO PIX — EFI BANK
// ═══════════════════════════════════════════════════════════════════════════
// Módulo para pagamentos via PIX (Pix Instantâneo do Banco Central)
const pix = require('./pix');

// 8. CRIAR PAGAMENTO PIX — Gera QR Code para cliente pagar
// Entrada: { comandaId, valor, descricao }
// Retorno: { sucesso, txid, qrcode, validadeEm }
exports.criarPagamentoPix = onCall({ cors: "*", invoker: 'public' }, async (req) => {
  const uid = checarAuth(req.auth);
  const { comandaId, valor, descricao } = req.data;

  // Valida entrada
  if (!comandaId) throw new HttpsError('invalid-argument', 'ID da comanda obrigatório.');
  if (!valor || valor <= 0) throw new HttpsError('invalid-argument', 'Valor inválido.');

  try {
    // Cria o identificador único concatenando UID + ID da comanda
    const identificador = `${uid}-${comandaId}`;

    // Chama função do módulo PIX para gerar cobrança
    const cobPix = await pix.criarCobPix(valor, descricao || 'Pagamento de comanda', identificador);

    // Salva a transação PIX no Firestore para referência futura
    const comandaRef = db.collection('comandas').doc(comandaId);
    const comandaSnap = await comandaRef.get();

    if (!comandaSnap.exists) {
      throw new HttpsError(
        'not-found',
        `Comanda "${comandaId}" não encontrada. Em localhost, crie a comanda com o emulador Firestore ativo (npm run serve).`
      );
    }

    await comandaRef.update({
      pixTxid: cobPix.txid,
      pixValor: valor / 100,
      pixQrCode: cobPix.qrcode,
      pixCopiaECola: cobPix.pixCopiaECola || null,
      pixGeradoEm: FieldValue.serverTimestamp(),
      pixValidadeEm: cobPix.validadeEm,
      statusPagamento: 'aguardando_pix',
    });

    return {
      sucesso: true,
      txid: cobPix.txid,
      qrcode: cobPix.qrcode,
      pixCopiaECola: cobPix.pixCopiaECola,
      qrcodeImagem: cobPix.qrcodeImagem,
      validadeEm: cobPix.validadeEm.toISOString(),
      expiracaoSegundos: cobPix.expiracaoSegundos,
      mensagem: 'QR Code PIX gerado com sucesso!',
    };
  } catch (err) {
    console.error('Erro ao criar pagamento PIX:', err.message);
    throw new HttpsError('internal', `Erro ao gerar PIX: ${err.message}`);
  }
});

// 9. VERIFICAR STATUS DO PAGAMENTO PIX
// Entrada: { txid }
// Retorno: { sucesso, status, pago, dataPagamento, valor }
exports.verificarPagamentoPix = onCall({ cors: CORS }, async (req) => {
  const uid = checarAuth(req.auth);
  const { txid } = req.data;

  // Valida entrada
  if (!txid) throw new HttpsError('invalid-argument', 'TXID obrigatório.');

  try {
    // Consulta a API EFI para verificar status do PIX
    const statusPix = await pix.verificarStatusPix(txid);

    // Se o PIX foi pago, atualiza a comanda no Firestore
    if (statusPix.pago) {
      const cmdSnap = await db.collection('comandas')
        .where('pixTxid', '==', txid)
        .limit(1)
        .get();

      if (!cmdSnap.empty) {
        await cmdSnap.docs[0].ref.update({
          statusPagamento: 'confirmado',
          pixConfirmadoEm: FieldValue.serverTimestamp(),
        });
      }
    }

    return {
      sucesso: true,
      status: statusPix.status,
      pago: statusPix.pago,
      txid: statusPix.txid,
      dataPagamento: statusPix.dataPagamento,
      valor: statusPix.valor,
    };
  } catch (err) {
    console.error('Erro ao verificar PIX:', err.message);
    throw new HttpsError('internal', `Erro ao verificar status: ${err.message}`);
  }
});

// 10. WEBHOOK PIX — Recebe confirmação de pagamento do EFI Bank (HTTP POST)
exports.webhookPagamentoPix = onRequest({ cors: false, invoker: 'public' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const dados = pix.parseWebhookEfi(req.body);

    if (!dados || !dados.txid || dados.valor === undefined) {
      console.error('Webhook PIX payload inválido:', JSON.stringify(req.body));
      res.status(400).json({ erro: 'Dados incompletos no webhook.' });
      return;
    }

    const resultado = await pix.salvarWebhookPix(dados);
    res.status(200).json({ sucesso: true, mensagem: resultado.mensagem });
  } catch (err) {
    console.error('Erro ao processar webhook:', err.message);
    res.status(500).json({ erro: err.message });
  }
});
