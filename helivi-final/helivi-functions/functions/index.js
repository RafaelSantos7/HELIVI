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

// Perfis aceitos para colaboradores (whitelist server-side)
const PERFIS_VALIDOS = ['admin', 'atendente', 'caixa', 'cozinha', 'balcao'];

// 1. CRIAR COLABORADOR — exige admin; vincula ao ownerUid do estabelecimento
exports.criarColaborador = onCall({ cors: CORS }, async (req) => {
  const callerUid = checarAuth(req.auth);
  const { ownerUid } = await assertAdminDoEstabelecimento(callerUid);
  const { nome, email, senha, perfil } = req.data;
  if (!nome || nome.trim().length < 2) throw new HttpsError('invalid-argument', 'Nome inválido.');
  if (!email || !email.includes('@'))  throw new HttpsError('invalid-argument', 'E-mail inválido.');
  if (!senha || senha.length < 6)      throw new HttpsError('invalid-argument', 'Senha mínimo 6 caracteres.');
  const role = PERFIS_VALIDOS.includes(perfil) ? perfil : 'atendente';
  try {
    const userRecord = await auth.createUser({
      email: email.trim().toLowerCase(),
      password: senha,
      displayName: nome.trim(),
    });
    // Claim de tenant usado pelas Firestore Rules para isolar por estabelecimento.
    await auth.setCustomUserClaims(userRecord.uid, { ownerUid });
    await db.collection('usuarios').add({
      uid: userRecord.uid, ownerUid,
      nome: nome.trim(), email: email.trim().toLowerCase(),
      role, ativo: true,
      criadoEm: FieldValue.serverTimestamp(),
    });
    return { sucesso: true, uid: userRecord.uid, mensagem: `Colaborador "${nome}" criado com sucesso!` };
  } catch (err) {
    if (err.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'Este e-mail já está cadastrado.');
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err.message);
  }
});

// 2. EDITAR COLABORADOR — exige admin e mesmo ownerUid do alvo
exports.editarColaborador = onCall({ cors: CORS }, async (req) => {
  const callerUid = checarAuth(req.auth);
  const { ownerUid } = await assertAdminDoEstabelecimento(callerUid);
  const { docId, uid, nome, email, senha, perfil } = req.data;
  if (!docId) throw new HttpsError('invalid-argument', 'ID obrigatório.');
  const alvo = await db.collection('usuarios').doc(docId).get();
  if (!alvo.exists) throw new HttpsError('not-found', 'Colaborador não encontrado.');
  if (alvo.data().ownerUid !== ownerUid) throw new HttpsError('permission-denied', 'Colaborador de outro estabelecimento.');
  const role = PERFIS_VALIDOS.includes(perfil) ? perfil : 'atendente';
  const authUpdate = { displayName: nome.trim() };
  if (email) authUpdate.email = email.trim().toLowerCase();
  if (senha && senha.length >= 6) authUpdate.password = senha;
  try {
    if (uid) {
      await auth.updateUser(uid, authUpdate);
      // Reafirma/backfill do claim de tenant (colaboradores antigos sem claim).
      await auth.setCustomUserClaims(uid, { ownerUid });
    }
    const update = { nome: nome.trim(), role, atualizadoEm: FieldValue.serverTimestamp() };
    if (email) update.email = email.trim().toLowerCase();
    await db.collection('usuarios').doc(docId).update(update);
    return { sucesso: true, mensagem: 'Colaborador atualizado!' };
  } catch (err) {
    if (err.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'E-mail já em uso.');
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err.message);
  }
});

// 3. EXCLUIR COLABORADOR — exige admin e mesmo ownerUid do alvo
exports.excluirColaborador = onCall({ cors: CORS }, async (req) => {
  const callerUid = checarAuth(req.auth);
  const { ownerUid } = await assertAdminDoEstabelecimento(callerUid);
  const { docId, uid } = req.data;
  if (!docId) throw new HttpsError('invalid-argument', 'ID obrigatório.');
  const alvo = await db.collection('usuarios').doc(docId).get();
  if (!alvo.exists) throw new HttpsError('not-found', 'Colaborador não encontrado.');
  if (alvo.data().ownerUid !== ownerUid) throw new HttpsError('permission-denied', 'Colaborador de outro estabelecimento.');
  try {
    if (uid) await auth.deleteUser(uid).catch(() => {});
    await db.collection('usuarios').doc(docId).delete();
    return { sucesso: true, mensagem: 'Colaborador removido.' };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err.message);
  }
});

// Auditoria: quem executou a ação = criadorUid (fallback uid p/ docs legados).
function actorUidDoDoc(doc) {
  return doc?.criadorUid || doc?.uid || null;
}

// 4. ATENDENTE — Pedido
exports.onPedidoCriado = onDocumentCreated('pedidos/{pedidoId}', async (event) => {
  const pedido = event.data?.data();
  const actorUid = actorUidDoDoc(pedido);
  if (!actorUid) return null;
  try {
    const user = await auth.getUser(actorUid);
    await event.data.ref.update({ atendente: user.displayName || user.email.split('@')[0], atendenteEmail: user.email });
  } catch (e) {}
  return null;
});

// 5. ATENDENTE — Comanda
exports.onComandaCriada = onDocumentCreated('comandas/{comandaId}', async (event) => {
  const doc = event.data?.data();
  const actorUid = actorUidDoDoc(doc);
  if (!actorUid) return null;
  try {
    const user = await auth.getUser(actorUid);
    await event.data.ref.update({ atendente: user.displayName || user.email.split('@')[0], atendenteEmail: user.email });
  } catch (e) {}
  return null;
});

// 6. ATENDENTE — KDS Cozinha
exports.onKdsCozinhaCriado = onDocumentCreated('kds_cozinha/{id}', async (event) => {
  const doc = event.data?.data();
  const actorUid = actorUidDoDoc(doc);
  if (!actorUid) return null;
  try {
    const user = await auth.getUser(actorUid);
    await event.data.ref.update({ atendente: user.displayName || user.email.split('@')[0] });
  } catch (e) {}
  return null;
});

// 7. ATENDENTE — KDS Balcão
exports.onKdsBalcaoCriado = onDocumentCreated('kds_balcao/{id}', async (event) => {
  const doc = event.data?.data();
  const actorUid = actorUidDoDoc(doc);
  if (!actorUid) return null;
  try {
    const user = await auth.getUser(actorUid);
    await event.data.ref.update({ atendente: user.displayName || user.email.split('@')[0] });
  } catch (e) {}
  return null;
});

// ═══════════════════════════════════════════════════════════════════════════
// 8-10. INTEGRAÇÃO PIX — Multi-gateway (Factory Pattern)
// ═══════════════════════════════════════════════════════════════════════════
const pixFactory = require('./gateways/pixFactory');
const cartaoFactory = require('./gateways/cartaoFactory');
const { salvarWebhookPix } = require('./gateways/pixWebhookUtil');
const {
  assertUsuarioAdmin,
  assertAdminDoEstabelecimento,
  carregarComandaAutorizada,
  validarValorPix,
  assertTxidDaComanda,
  assertIntentDaComanda,
} = require('./gateways/pixSecurityUtil');

function erroPixInterno(contexto, err) {
  console.error(`[PIX] ${contexto}:`, err.message);
  return new HttpsError('internal', 'Erro ao processar pagamento PIX. Tente novamente.');
}

function erroCartaoInterno(contexto, err) {
  console.error(`[Cartão] ${contexto}:`, err.message);
  const msg = err.message || 'Erro ao processar pagamento com cartão.';
  return new HttpsError('internal', msg);
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
    maquininhaAtiva,
    mpPointDeviceId,
    mpPointAccessToken,
  } = req.data || {};

  if (!['efi', 'mercadopago'].includes(gatewayAtivo)) {
    throw new HttpsError('invalid-argument', 'Gateway inválido.');
  }

  const maquininha = maquininhaAtiva || '';
  if (maquininha && !cartaoFactory.MAQUININHAS_VALIDAS.includes(maquininha)) {
    throw new HttpsError('invalid-argument', 'Maquininha de cartão inválida.');
  }

  const tokens = [mpAccessTokenProducao, mpAccessTokenSandbox, mpPointAccessToken].filter(Boolean);
  if (tokens.some((t) => String(t).startsWith('TEST-'))) {
    throw new HttpsError('invalid-argument', 'Token TEST- não é suportado. Use APP_USR-.');
  }

  try {
    await db.doc('configuracoes/pagamentos').set({
      gatewayAtivo,
      efiConfigurado: !!(efiClientId || gatewayAtivo === 'efi'),
      mpConfigurado: gatewayAtivo === 'mercadopago',
      mpAmbienteTeste: mpAmbienteTeste === true,
      maquininhaAtiva: maquininha || '',
      mpPointDeviceId: mpPointDeviceId ? String(mpPointDeviceId).trim() : '',
      mpPointConfigurado: maquininha === 'mercadopago_point',
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
    if (mpPointDeviceId) segredos.mpPointDeviceId = String(mpPointDeviceId).trim();
    if (mpPointAccessToken) segredos.mpPointAccessToken = String(mpPointAccessToken).trim();
    if (gatewayAtivo === 'mercadopago') {
      segredos.mpAmbienteTeste = mpAmbienteTeste === true;
    }

    if (Object.keys(segredos).length) {
      await db.doc('configuracoes/segredos_pagamento').set(segredos, { merge: true });
    }

    pixFactory.limparCache();
    cartaoFactory.limparCache();
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

  const emEmulador = !!process.env.FUNCTIONS_EMULATOR;
  const webhookSecret = process.env.PIX_WEBHOOK_SECRET;
  // Em produção o secret é OBRIGATÓRIO — sem ele o endpoint fica indisponível.
  if (!emEmulador && !webhookSecret) {
    console.error('[PIX Webhook] PIX_WEBHOOK_SECRET ausente em produção');
    res.status(503).json({ erro: 'Webhook indisponível: secret não configurado.' });
    return;
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// 11-13. INTEGRAÇÃO CARTÃO — Maquininha física (Factory Pattern)
// ═══════════════════════════════════════════════════════════════════════════

// 11. CRIAR PAGAMENTO MAQUININHA — Envia valor para terminal Point
exports.criarPagamentoMaquininha = onCall({ cors: CORS }, async (req) => {
  const uid = checarAuth(req.auth);
  const { comandaId, valorCentavos, tipoPagamento, descricao } = req.data;

  if (!comandaId) throw new HttpsError('invalid-argument', 'ID da comanda obrigatório.');
  if (!tipoPagamento || !['credit_card', 'debit_card'].includes(tipoPagamento)) {
    throw new HttpsError('invalid-argument', 'tipoPagamento deve ser credit_card ou debit_card.');
  }

  try {
    const cfgCartao = await cartaoFactory.carregarConfig();
    if (!cartaoFactory.maquininhaConfigurada(cfgCartao)) {
      throw new HttpsError('failed-precondition', 'Nenhuma maquininha de cartão configurada.');
    }

    const { ref: comandaRef, data: comanda, ownerUid } = await carregarComandaAutorizada(uid, comandaId);
    validarValorPix(valorCentavos, comanda);

    const identificador = `${ownerUid}-${comandaId}`;

    const resultado = await cartaoFactory.enviarPagamentoMaquininha(
      valorCentavos,
      tipoPagamento,
      identificador,
      descricao || 'Pagamento HELIVI PDV'
    );

    await comandaRef.update({
      cartaoIntentId: resultado.intentId,
      cartaoMaquininha: resultado.maquininha,
      cartaoDeviceId: resultado.deviceId,
      cartaoTipo: tipoPagamento,
      cartaoValor: valorCentavos / 100,
      cartaoGeradoEm: FieldValue.serverTimestamp(),
      statusPagamento: 'aguardando_cartao',
    });

    return {
      sucesso: true,
      intentId: resultado.intentId,
      deviceId: resultado.deviceId,
      maquininha: resultado.maquininha,
      mensagem: 'Pagamento enviado à maquininha. Aguardando cartão...',
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw erroCartaoInterno('criarPagamentoMaquininha', err);
  }
});

// 12. VERIFICAR STATUS DO PAGAMENTO NA MAQUININHA (polling)
exports.verificarPagamentoMaquininha = onCall({ cors: CORS }, async (req) => {
  const uid = checarAuth(req.auth);
  const { intentId } = req.data;

  if (!intentId) throw new HttpsError('invalid-argument', 'intentId obrigatório.');

  try {
    const cmdSnap = await assertIntentDaComanda(uid, intentId);

    let maquininha = null;
    if (!cmdSnap.empty) {
      maquininha = cmdSnap.docs[0].data().cartaoMaquininha || null;
    }

    const statusCartao = await cartaoFactory.consultarStatusMaquininha(intentId, maquininha);

    if (statusCartao.pago && !cmdSnap.empty) {
      await cmdSnap.docs[0].ref.update({
        statusPagamento: 'confirmado',
        cartaoConfirmadoEm: FieldValue.serverTimestamp(),
        cartaoPaymentId: statusCartao.paymentId || null,
      });
    }

    return {
      sucesso: true,
      status: statusCartao.status,
      pago: statusCartao.pago,
      recusado: statusCartao.recusado || false,
      cancelado: statusCartao.cancelado || false,
      intentId: statusCartao.intentId,
      paymentId: statusCartao.paymentId || null,
      valor: statusCartao.valor,
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw erroCartaoInterno('verificarPagamentoMaquininha', err);
  }
});

// 13. CANCELAR PAGAMENTO NA MAQUININHA
exports.cancelarPagamentoMaquininha = onCall({ cors: CORS }, async (req) => {
  const uid = checarAuth(req.auth);
  const { intentId, comandaId } = req.data;

  if (!intentId) throw new HttpsError('invalid-argument', 'intentId obrigatório.');

  try {
    let maquininha = null;
    let deviceId = null;

    if (comandaId) {
      const { data: cmd } = await carregarComandaAutorizada(uid, comandaId);
      maquininha = cmd.cartaoMaquininha || null;
      deviceId = cmd.cartaoDeviceId || null;
    } else {
      const cmdSnap = await assertIntentDaComanda(uid, intentId);
      if (!cmdSnap.empty) {
        const cmd = cmdSnap.docs[0].data();
        maquininha = cmd.cartaoMaquininha || null;
        deviceId = cmd.cartaoDeviceId || null;
      }
    }

    const resultado = await cartaoFactory.cancelarPagamentoMaquininha(intentId, maquininha, deviceId);

    if (comandaId) {
      await db.collection('comandas').doc(comandaId).update({
        statusPagamento: 'cartao_cancelado',
        cartaoCanceladoEm: FieldValue.serverTimestamp(),
      });
    }

    return { sucesso: true, ...resultado };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    throw erroCartaoInterno('cancelarPagamentoMaquininha', err);
  }
});
