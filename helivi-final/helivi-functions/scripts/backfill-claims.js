#!/usr/bin/env node
/**
 * Backfill de custom claims `ownerUid` para colaboradores existentes.
 *
 * As Firestore Rules (Fase 1 da migração Supabase) isolam por tenant usando
 * `request.auth.token.ownerUid`. Colaboradores criados antes desse claim
 * precisam recebê-lo uma única vez; a conta principal não precisa (as rules
 * caem para `request.auth.uid` quando não há claim).
 *
 * Uso:
 *   # Produção (usa credenciais do gcloud / GOOGLE_APPLICATION_CREDENTIALS):
 *   node scripts/backfill-claims.js
 *
 *   # Emulador:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *   FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
 *   node scripts/backfill-claims.js
 *
 * Idempotente: só grava quando o claim está ausente ou diferente.
 * Colaboradores precisam renovar o token (relogar ou aguardar ~1h) para o
 * claim novo entrar em vigor.
 */

'use strict';

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'helivi' });
}

const db = admin.firestore();
const auth = admin.auth();

async function main() {
  const snap = await db.collection('usuarios').get();
  let atualizados = 0;
  let ignorados = 0;
  let falhas = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const uid = d.uid;
    const ownerUid = d.ownerUid || uid;
    if (!uid) {
      console.warn(`  ! doc ${doc.id} sem uid — ignorado`);
      ignorados += 1;
      continue;
    }
    try {
      const user = await auth.getUser(uid);
      const claimAtual = user.customClaims && user.customClaims.ownerUid;
      if (claimAtual === ownerUid) {
        ignorados += 1;
        continue;
      }
      await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), ownerUid });
      console.log(`  ✓ ${d.email || uid} → ownerUid=${ownerUid}`);
      atualizados += 1;
    } catch (e) {
      console.error(`  ✗ ${uid}: ${e.message}`);
      falhas += 1;
    }
  }

  console.log(`\nBackfill concluído: ${atualizados} atualizados, ${ignorados} já ok/ignorados, ${falhas} falha(s).`);
  process.exit(falhas > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Erro no backfill:', e);
  process.exit(1);
});
