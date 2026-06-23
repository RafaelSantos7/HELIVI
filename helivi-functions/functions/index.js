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
// 8-10. INTEGRAÇÃO PIX — Multi-gateway (Factory Pattern)
// ═══════════════════════════════════════════════════════════════════════════
const pixFactory = require('./gateways/pixFactory');
const { salvarWebhookPix } = require('./gateways/pixWebhookUtil');
const {
  assertUsuarioAdmin,
  carregarComandaAutorizada,
  validarValorPix,
  assertTxidDaComanda,
} = require('./gateways/pixSecurityUtil');

function erroPixInterno(contexto, err) {
  console.error(`[PIX] ${contexto}:`, err.message);
  return new HttpsError('internal', 'Erro ao processar pagamento PIX. Tente novamente.');
}

// 8. CRIAR PAGAMENTO PIX — Gera QR Code para cliente pagar
exports.criarPagamentoPix = onCall({ cors: CORS }, async (req) => {
  const uid = checarAuth(req.auth);
  const { comandaId, valor, descricao } = req.data;

  if (!comandaId) throw new HttpsError('invalid-argument', 'ID da comanda obrigatório.');

  try {
    const { ref: comandaRef, data: comanda, ownerUid } = await carregarComandaAutorizada(uid, comandaId);
    validarValorPix(valor, comanda);

    const identificador = `${ownerUid}-${comandaId}`;

    const cobPix = await pixFactory.gerarCobrancaPix(
      valor,
      descricao || 'Pagamento de comanda',
      identificador
    );

    await comandaRef.update({
      pixTxid: cobPix.txid,
      pixGateway: cobPix.gateway,
      pixMpOrderId: cobPix.mpOrderId || null,
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
      ticketUrl: cobPix.ticketUrl || null,
      ambienteTeste: cobPix.ambienteTeste || false,
      pixSandboxReal: cobPix.pixSandboxReal || false,
      pixSimulacaoLocal: cobPix.pixSimulacaoLocal || false,
      validadeEm: cobPix.validadeEm.toISOString(),
      expiracaoSegundos: cobPix.expiracaoSegundos,
      gateway: cobPix.gateway,
      mensagem: 'QR Code PIX gerado com sucesso!',
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw erroPixInterno('criarPagamentoPix', err);
  }
});

// 9. VERIFICAR STATUS DO PAGAMENTO PIX
exports.verificarPagamentoPix = onCall({ cors: CORS }, async (req) => {
  const uid = checarAuth(req.auth);
  const { txid } = req.data;

  if (!txid) throw new HttpsError('invalid-argument', 'TXID obrigatório.');

  try {
    const cmdSnap = await assertTxidDaComanda(uid, txid);

    let gateway = null;
    let mpOrderId = null;
    if (!cmdSnap.empty) {
      const cmd = cmdSnap.docs[0].data();
      gateway = cmd.pixGateway || null;
      mpOrderId = cmd.pixMpOrderId || null;
    }

    const statusPix = await pixFactory.verificarStatusPix(txid, gateway, mpOrderId);

    if (statusPix.pago && !cmdSnap.empty) {
      await cmdSnap.docs[0].ref.update({
        statusPagamento: 'confirmado',
        pixConfirmadoEm: FieldValue.serverTimestamp(),
      });
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
    if (err instanceof HttpsError) throw err;
    throw erroPixInterno('verificarPagamentoPix', err);
  }
});

// 9b. SALVAR CONFIG PIX — Apenas admin; segredos nunca expostos ao cliente
exports.salvarConfigPagamentoPix = onCall({ cors: CORS }, async (req) => {
  const uid = checarAuth(req.auth);
  await assertUsuarioAdmin(uid);

  const {
    gatewayAtivo,
    mpAmbienteTeste,
    efiClientId,
    efiClientSecret,
    efiPixKey,
    mpAccessTokenProducao,
    mpAccessTokenSandbox,
  } = req.data || {};

  if (!['efi', 'mercadopago'].includes(gatewayAtivo)) {
    throw new HttpsError('invalid-argument', 'Gateway inválido.');
  }

  const tokens = [mpAccessTokenProducao, mpAccessTokenSandbox].filter(Boolean);
  if (tokens.some((t) => String(t).startsWith('TEST-'))) {
    throw new HttpsError('invalid-argument', 'Token TEST- não é suportado. Use APP_USR-.');
  }

  try {
    await db.doc('configuracoes/pagamentos').set({
      gatewayAtivo,
      efiConfigurado: !!(efiClientId || gatewayAtivo === 'efi'),
      mpConfigurado: gatewayAtivo === 'mercadopago',
      mpAmbienteTeste: mpAmbienteTeste === true,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });

    const segredos = {};
    if (efiClientId) segredos.efiClientId = String(efiClientId).trim();
    if (efiClientSecret) segredos.efiClientSecret = String(efiClientSecret).trim();
    if (efiPixKey) segredos.efiPixKey = String(efiPixKey).trim();
    if (mpAccessTokenProducao) segredos.mpAccessTokenProducao = String(mpAccessTokenProducao).trim();
    if (mpAccessTokenSandbox) {
      segredos.mpAccessTokenSandbox = String(mpAccessTokenSandbox).trim();
      segredos.mpUsarPayerSandboxDoc = true;
    }
    if (gatewayAtivo === 'mercadopago') {
      segredos.mpAmbienteTeste = mpAmbienteTeste === true;
    }

    if (Object.keys(segredos).length) {
      await db.doc('configuracoes/segredos_pagamento').set(segredos, { merge: true });
    }

    pixFactory.limparCache();
    return { sucesso: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw erroPixInterno('salvarConfigPagamentoPix', err);
  }
});

// 9c. SIMULAR CONFIRMAÇÃO PIX — Apenas emulador local
exports.simularConfirmacaoPixTeste = onCall({ cors: CORS }, async (req) => {
  if (!process.env.FUNCTIONS_EMULATOR) {
    throw new HttpsError('failed-precondition', 'Disponível somente no emulador local.');
  }

  const uid = checarAuth(req.auth);
  const { comandaId, txid } = req.data;
  if (!comandaId || !txid) {
    throw new HttpsError('invalid-argument', 'comandaId e txid obrigatórios.');
  }

  const comandaRef = db.collection('comandas').doc(comandaId);
  const snap = await comandaRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Comanda não encontrada.');
  }

  const cmd = snap.data();
  if (cmd.pixTxid !== txid) {
    throw new HttpsError('failed-precondition', 'TXID não corresponde à comanda.');
  }
  await carregarComandaAutorizada(uid, comandaId);
  if (cmd.statusPagamento === 'confirmado') {
    return { sucesso: true, jaConfirmado: true };
  }

  await comandaRef.update({
    statusPagamento: 'confirmado',
    pixConfirmadoEm: FieldValue.serverTimestamp(),
    pixSimuladoEm: FieldValue.serverTimestamp(),
  });

  return { sucesso: true, mensagem: 'Pagamento simulado (emulador).' };
});

// 10. WEBHOOK PIX — Confirmação de pagamento (validação via consulta à API do gateway)
exports.webhookPagamentoPix = onRequest({ cors: false, invoker: 'public' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const webhookSecret = process.env.PIX_WEBHOOK_SECRET;
  if (webhookSecret && req.query.secret !== webhookSecret) {
    console.warn('[PIX Webhook] Tentativa com secret inválido');
    res.status(403).json({ erro: 'Não autorizado' });
    return;
  }

  try {
    const gateway = req.query.gateway || null;
    const dados = await pixFactory.processarWebhook(req.body, gateway);

    if (!dados || !dados.txid || dados.valor === undefined) {
      console.error('Webhook PIX payload inválido');
      res.status(400).json({ erro: 'Dados incompletos.' });
      return;
    }

    const cfg = await pixFactory.carregarConfig();
    const resultado = await salvarWebhookPix({
      ...dados,
      gateway: gateway || cfg.gateway,
    });

    res.status(200).json({ sucesso: true, mensagem: resultado.mensagem });
  } catch (err) {
    console.error('Erro ao processar webhook:', err.message);
    res.status(500).json({ erro: 'Erro interno' });
  }
});
