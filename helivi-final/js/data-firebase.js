// data-firebase.js — adapter Firebase para window.heliviData
'use strict';

window.__heliviCreateFirebaseData = function createFirebaseData() {
  function callable(name) {
    return firebase.functions().httpsCallable(name);
  }

  function mapSnap(snap) {
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  function serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  const authApi = {
    onAuthStateChanged(cb) {
      return auth.onAuthStateChanged(cb);
    },
    async signIn(email, senha) {
      return auth.signInWithEmailAndPassword(email, senha);
    },
    async createUser(email, senha) {
      return auth.createUserWithEmailAndPassword(email, senha);
    },
    async signOut() {
      return auth.signOut();
    },
    currentUser() {
      return auth.currentUser || null;
    },
    async getAccessToken() {
      const u = auth.currentUser;
      if (!u) return null;
      return u.getIdToken();
    },
  };

  const produtosApi = {
    subscribeByOwner(ownerUid, onData, onError) {
      return db
        .collection('produtos')
        .where('uid', '==', ownerUid)
        .onSnapshot(
          (snap) => onData(mapSnap(snap)),
          (err) => onError && onError(err),
        );
    },
    async create(dados) {
      const ref = await db.collection('produtos').add(dados);
      return { id: ref.id };
    },
    async update(id, dados) {
      await db.collection('produtos').doc(id).update(dados);
    },
    async remove(id) {
      await db.collection('produtos').doc(id).delete();
    },
  };

  const usuariosApi = {
    subscribeByOwner(ownerUid, onData, onError) {
      return db
        .collection('usuarios')
        .where('ownerUid', '==', ownerUid)
        .onSnapshot(
          (snap) =>
            onData(
              snap.docs.map((d) => ({ docId: d.id, id: d.id, ...d.data() })),
            ),
          (err) => onError && onError(err),
        );
    },
    async buscarPerfilPorUid(uid) {
      const snap = await db
        .collection('usuarios')
        .where('uid', '==', uid)
        .limit(1)
        .get();
      if (snap.empty) return null;
      const d = snap.docs[0];
      return { docId: d.id, id: d.id, ...d.data() };
    },
    async listByOwner(ownerUid) {
      const snap = await db
        .collection('usuarios')
        .where('ownerUid', '==', ownerUid)
        .get();
      return snap.docs.map((d) => ({ docId: d.id, id: d.id, ...d.data() }));
    },
    async criarColaborador(payload) {
      const r = await callable('criarColaborador')(payload);
      return r.data;
    },
    async editarColaborador(payload) {
      const r = await callable('editarColaborador')(payload);
      return r.data;
    },
    async excluirColaborador(payload) {
      const r = await callable('excluirColaborador')(payload);
      return r.data;
    },
  };

  const comandasApi = {
    subscribeByOwner(ownerUid, onData, onError) {
      return db
        .collection('comandas')
        .where('ownerUid', '==', ownerUid)
        .limit(200)
        .onSnapshot(
          (snap) => onData(mapSnap(snap)),
          (err) => onError && onError(err),
        );
    },
    subscribeByUidField(ownerUid, onData, onError) {
      return db
        .collection('comandas')
        .where('uid', '==', ownerUid)
        .limit(100)
        .onSnapshot(
          (snap) => onData(mapSnap(snap)),
          (err) => onError && onError(err),
        );
    },
    subscribeDoc(comandaId, onData, onError) {
      return db
        .collection('comandas')
        .doc(comandaId)
        .onSnapshot(
          (doc) => {
            if (!doc.exists) {
              onData(null);
              return;
            }
            onData({ id: doc.id, ...doc.data() });
          },
          (err) => onError && onError(err),
        );
    },
    async get(comandaId) {
      const snap = await db.collection('comandas').doc(comandaId).get();
      if (!snap.exists) return null;
      return { id: snap.id, ...snap.data() };
    },
    async create(dados) {
      const ref = await db.collection('comandas').add(dados);
      return { id: ref.id };
    },
    async update(comandaId, patch) {
      await db.collection('comandas').doc(comandaId).update(patch);
    },
  };

  const pedidosApi = {
    async listByOwner(ownerUid, limitN) {
      const snap = await db
        .collection('pedidos')
        .where('uid', '==', ownerUid)
        .limit(limitN || 500)
        .get();
      return mapSnap(snap);
    },
    async get(pedidoId) {
      const snap = await db.collection('pedidos').doc(pedidoId).get();
      if (!snap.exists) return null;
      return { id: snap.id, ...snap.data() };
    },
    async create(dados) {
      const ref = await db.collection('pedidos').add(dados);
      return { id: ref.id };
    },
  };

  function colecaoKds(setor) {
    return setor === 'balcao' ? 'kds_balcao' : 'kds_cozinha';
  }

  const kdsApi = {
    subscribe(setor, ownerUid, onData, onError) {
      return db
        .collection(colecaoKds(setor))
        .where('uid', '==', ownerUid)
        .limit(200)
        .onSnapshot(
          (snap) => onData(mapSnap(snap)),
          (err) => onError && onError(err),
        );
    },
    async create(setor, dados) {
      const ref = await db.collection(colecaoKds(setor)).add(dados);
      return { id: ref.id };
    },
    async update(setor, id, patch) {
      await db.collection(colecaoKds(setor)).doc(id).update(patch);
    },
  };

  const configApi = {
    async nextPedidoNumber(ownerUid) {
      const ref = db.collection('config').doc('cnt_' + ownerUid);
      return db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        const prox = (s.exists ? s.data().ultimo || 0 : 0) + 1;
        tx.set(ref, { ultimo: prox }, { merge: true });
        return prox;
      });
    },
    async getPagamentos() {
      const snap = await db.doc('configuracoes/pagamentos').get();
      return snap.exists ? snap.data() : null;
    },
    async salvarPagamentoPix(payload) {
      const r = await callable('salvarConfigPagamentoPix')(payload);
      return r.data;
    },
  };

  const pagamentosApi = {
    async criarPix(payload) {
      const r = await callable('criarPagamentoPix')(payload);
      return r.data;
    },
    async verificarPix(payload) {
      const r = await callable('verificarPagamentoPix')(payload);
      return r.data;
    },
    async simularConfirmacaoPix(payload) {
      const r = await callable('simularConfirmacaoPixTeste')(payload);
      return r.data;
    },
    async cancelarPix(payload) {
      // Firebase: ainda não há callable dedicado — limpeza local no PDV basta
      console.warn('[firebase] cancelarPix: sem callable; só limpeza local', payload);
      return { sucesso: true, localOnly: true };
    },
    async criarMaquininha(payload) {
      const r = await callable('criarPagamentoMaquininha')(payload);
      return r.data;
    },
    async verificarMaquininha(payload) {
      const r = await callable('verificarPagamentoMaquininha')(payload);
      return r.data;
    },
    async cancelarMaquininha(payload) {
      const r = await callable('cancelarPagamentoMaquininha')(payload);
      return r.data;
    },
  };

  return {
    backend: 'firebase',
    serverTimestamp,
    auth: authApi,
    produtos: produtosApi,
    usuarios: usuariosApi,
    comandas: comandasApi,
    pedidos: pedidosApi,
    kds: kdsApi,
    config: configApi,
    pagamentos: pagamentosApi,
  };
};
