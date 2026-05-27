// functions/index.js — HELIVI v2 com CORS correto
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated }  = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

admin.initializeApp();
const db   = admin.firestore();
const auth = admin.auth();

const CORS = [
  'http://127.0.0.1:5500','http://127.0.0.1:5501',
  'http://localhost:5500','http://localhost:5501','http://localhost:3000',
  'https://helivi.web.app','https://helivi.firebaseapp.com',
  'https://helivi.webtech.dev.br','http://helivi.webtech.dev.br',
  true // permite qualquer origem autenticada
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
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
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
    const update = { nome: nome.trim(), role: perfil || 'atendente', atualizadoEm: admin.firestore.FieldValue.serverTimestamp() };
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
