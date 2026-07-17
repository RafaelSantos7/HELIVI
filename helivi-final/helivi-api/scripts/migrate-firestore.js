#!/usr/bin/env node
/**
 * Migração idempotente Firestore → Postgres (Supabase).
 *
 * Pré-requisitos:
 *   - GOOGLE_APPLICATION_CREDENTIALS ou firebase admin default
 *   - helivi-api/.env.local com SUPABASE_URL + SERVICE_ROLE
 *   - Migrations SQL aplicadas
 *
 * Uso:
 *   node scripts/migrate-firestore.js --dry-run
 *   node scripts/migrate-firestore.js --apply
 *
 * Ordem: usuarios → produtos → config → comandas → pedidos → kds → (pagamentos_pix sem tokens)
 * Segredos NÃO são migrados para tabela client-readable — reconfigurar via /pagamentos/config.
 *
 * Usuários Auth: cria no Supabase Admin sem senha conhecida + registra id_map;
 * envie invite/reset depois (hashes Firebase não migram).
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');

const DRY = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
const REPORT = { ok: [], warn: [], err: [], counts: {} };

function log(level, msg) {
  REPORT[level].push(msg);
  const tag = level === 'ok' ? '✓' : level === 'warn' ? '!' : '✗';
  console.log(`  ${tag} ${msg}`);
}

function ts(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v._seconds != null) return new Date(v._seconds * 1000).toISOString();
  if (typeof v === 'string') return v;
  try {
    return new Date(v).toISOString();
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\n═══ HELIVI migrate Firestore → Supabase (${DRY ? 'DRY-RUN' : 'APPLY'}) ═══\n`);

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'helivi' });
  }
  const db = admin.firestore();
  const fauth = admin.auth();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  async function mapGet(entidade, firebaseId) {
    const { data } = await sb
      .from('id_map')
      .select('supabase_id')
      .eq('entidade', entidade)
      .eq('firebase_id', firebaseId)
      .maybeSingle();
    return data?.supabase_id || null;
  }

  async function mapSet(entidade, firebaseId, supabaseId) {
    if (DRY) return;
    await sb.from('id_map').upsert({
      entidade,
      firebase_id: firebaseId,
      supabase_id: supabaseId,
    });
  }

  // ── 1. Usuários / perfis ─────────────────────────────────
  console.log('1. Usuários');
  const usuariosSnap = await db.collection('usuarios').get();
  REPORT.counts.usuarios_firestore = usuariosSnap.size;

  // Contas principais: Auth users sem doc em usuarios
  const principals = new Set();
  let page = await fauth.listUsers(1000);
  for (;;) {
    for (const u of page.users) {
      const isColab = usuariosSnap.docs.some((d) => d.data().uid === u.uid);
      if (!isColab) principals.add(u.uid);
    }
    if (!page.pageToken) break;
    page = await fauth.listUsers(1000, page.pageToken);
  }

  const ownerMap = {}; // firebaseUid → supabaseUuid

  async function ensureAuthUser(email, nome, firebaseUid, meta) {
    const existing = await mapGet('auth_user', firebaseUid);
    if (existing) {
      ownerMap[firebaseUid] = existing;
      return existing;
    }
    if (DRY) {
      log('warn', `[dry] criaria auth ${email} (fb=${firebaseUid})`);
      const fake = firebaseUid; // placeholder só no dry
      ownerMap[firebaseUid] = fake;
      return fake;
    }
    // Busca por e-mail
    const { data: listed } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 });
    // create with random password — force reset
    const tempPass = `Tmp!${Math.random().toString(36).slice(2)}A1`;
    const { data: created, error } = await sb.auth.admin.createUser({
      email,
      password: tempPass,
      email_confirm: true,
      user_metadata: meta,
    });
    if (error) {
      // já existe
      const { data: byEmail } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = (byEmail?.users || []).find((x) => x.email === email);
      if (found) {
        await mapSet('auth_user', firebaseUid, found.id);
        ownerMap[firebaseUid] = found.id;
        log('ok', `auth existente ${email} → ${found.id}`);
        return found.id;
      }
      log('err', `auth ${email}: ${error.message}`);
      return null;
    }
    await mapSet('auth_user', firebaseUid, created.user.id);
    ownerMap[firebaseUid] = created.user.id;
    log('ok', `auth criado ${email} → ${created.user.id} (reset senha necessário)`);
    return created.user.id;
  }

  for (const fbUid of principals) {
    try {
      const u = await fauth.getUser(fbUid);
      const sid = await ensureAuthUser(
        u.email,
        u.displayName || '',
        fbUid,
        { nome: u.displayName || '', migrated_from: 'firebase' },
      );
      if (sid && !DRY) {
        await sb.from('usuarios').upsert({
          id: sid,
          owner_uid: sid,
          nome: u.displayName || (u.email || '').split('@')[0],
          email: u.email || '',
          role: 'admin',
          ativo: true,
        });
      }
    } catch (e) {
      log('err', `principal ${fbUid}: ${e.message}`);
    }
  }

  for (const doc of usuariosSnap.docs) {
    const d = doc.data();
    const fbUid = d.uid;
    const fbOwner = d.ownerUid || fbUid;
    try {
      const u = await fauth.getUser(fbUid);
      const ownerSid = ownerMap[fbOwner] || (await mapGet('auth_user', fbOwner));
      if (!ownerSid && !DRY) {
        log('warn', `colab ${d.email}: owner ${fbOwner} ainda sem map — rode de novo após principals`);
      }
      const sid = await ensureAuthUser(u.email, d.nome || u.displayName, fbUid, {
        nome: d.nome,
        owner_uid: ownerSid || fbOwner,
        role: d.role || 'atendente',
        migrated_from: 'firebase',
      });
      if (sid && ownerSid && !DRY) {
        await sb.from('usuarios').upsert({
          id: sid,
          owner_uid: ownerSid,
          nome: d.nome || '',
          email: d.email || u.email || '',
          role: d.role || 'atendente',
          ativo: d.ativo !== false,
        });
        log('ok', `colab ${d.email} owner=${ownerSid}`);
      }
    } catch (e) {
      log('err', `usuario ${doc.id}: ${e.message}`);
    }
  }

  function resolveOwner(fbOwner) {
    return ownerMap[fbOwner] || null;
  }

  // ── 2. Produtos ──────────────────────────────────────────
  console.log('\n2. Produtos');
  const prodSnap = await db.collection('produtos').get();
  REPORT.counts.produtos = prodSnap.size;
  for (const doc of prodSnap.docs) {
    const d = doc.data();
    const owner = resolveOwner(d.uid);
    if (!owner) {
      log('warn', `produto ${doc.id} sem owner map (${d.uid})`);
      continue;
    }
    const mapped = await mapGet('produto', doc.id);
    if (mapped) {
      log('ok', `produto ${doc.id} já migrado`);
      continue;
    }
    if (DRY) {
      log('warn', `[dry] produto ${d.nome}`);
      continue;
    }
    const { data, error } = await sb
      .from('produtos')
      .insert({
        owner_uid: owner,
        nome: d.nome,
        categoria: d.categoria || 'Outros',
        preco: d.preco || 0,
        custo: d.custo || 0,
        created_at: ts(d.createdAt) || ts(d.updatedAt) || new Date().toISOString(),
        legacy_id: doc.id,
      })
      .select('id')
      .single();
    if (error) log('err', `produto ${doc.id}: ${error.message}`);
    else {
      await mapSet('produto', doc.id, data.id);
      log('ok', `produto ${d.nome}`);
    }
  }

  // ── 3. Contadores ────────────────────────────────────────
  console.log('\n3. Contadores');
  const cntSnap = await db.collection('config').get();
  for (const doc of cntSnap.docs) {
    if (!doc.id.startsWith('cnt_')) continue;
    const fbOwner = doc.id.slice(4);
    const owner = resolveOwner(fbOwner);
    if (!owner) {
      log('warn', `contador ${doc.id} sem owner`);
      continue;
    }
    const ultimo = doc.data().ultimo || 0;
    if (DRY) {
      log('warn', `[dry] contador ${owner}=${ultimo}`);
      continue;
    }
    await sb.from('contadores').upsert({ owner_uid: owner, ultimo });
    log('ok', `contador ${owner}=${ultimo}`);
  }

  // ── 4. Comandas ──────────────────────────────────────────
  console.log('\n4. Comandas');
  const cmdSnap = await db.collection('comandas').get();
  REPORT.counts.comandas = cmdSnap.size;
  for (const doc of cmdSnap.docs) {
    const d = doc.data();
    const owner = resolveOwner(d.ownerUid || d.uid);
    if (!owner) {
      log('warn', `comanda ${doc.id} sem owner`);
      continue;
    }
    if (await mapGet('comanda', doc.id)) continue;
    if (DRY) {
      log('warn', `[dry] comanda ${doc.id} status=${d.status}`);
      continue;
    }
    const criador = d.criadorUid ? resolveOwner(d.criadorUid) : null;
    const { data, error } = await sb
      .from('comandas')
      .insert({
        owner_uid: owner,
        criador_uid: criador,
        atendente: d.atendente,
        cliente: d.cliente || '',
        mesa: d.mesa || '',
        obs: d.obs || '',
        itens: d.itens || [],
        status: d.status || 'aberta',
        pagamento: d.pagamento,
        total: d.total,
        pix_txid: d.pixTxid,
        pix_gateway: d.pixGateway,
        status_pagamento: d.statusPagamento,
        created_at: ts(d.serverTime) || ts(d.createdAt) || new Date().toISOString(),
        legacy_id: doc.id,
      })
      .select('id')
      .single();
    if (error) log('err', `comanda ${doc.id}: ${error.message}`);
    else {
      await mapSet('comanda', doc.id, data.id);
      log('ok', `comanda ${doc.id}`);
    }
  }

  // ── 5. Pedidos ───────────────────────────────────────────
  console.log('\n5. Pedidos');
  const pedSnap = await db.collection('pedidos').get();
  REPORT.counts.pedidos = pedSnap.size;
  let inconsistentes = 0;
  for (const doc of pedSnap.docs) {
    const d = doc.data();
    // Normaliza owner: docs antigos usavam uid do colaborador
    let fbOwner = d.ownerUid || d.uid;
    const owner = resolveOwner(fbOwner);
    if (!owner) {
      log('warn', `pedido ${doc.id} sem owner (${fbOwner})`);
      inconsistentes += 1;
      continue;
    }
    const itens = d.itens || [];
    const soma = itens.reduce((s, i) => s + (Number(i.preco) || 0) * (Number(i.quantidade) || 1), 0);
    if (d.total != null && Math.abs(soma - Number(d.total)) > 0.05) {
      log('warn', `pedido ${doc.id} total=${d.total} soma_itens=${soma.toFixed(2)}`);
      inconsistentes += 1;
    }
    if (await mapGet('pedido', doc.id)) continue;
    if (DRY) continue;
    const { data, error } = await sb
      .from('pedidos')
      .insert({
        owner_uid: owner,
        criador_uid: d.criadorUid ? resolveOwner(d.criadorUid) : null,
        cliente: d.cliente || '',
        mesa: d.mesa || '',
        obs_geral: d.obsGeral || '',
        itens,
        total: d.total || soma,
        lucro: d.lucro || 0,
        pagamento: d.pagamento,
        cartao1: d.cartao1,
        cartao2: d.cartao2,
        numero_pedido: d.numeroPedido || 0,
        status: 'pago',
        created_at: ts(d.serverTime) || ts(d.createdAt) || new Date().toISOString(),
        legacy_id: doc.id,
      })
      .select('id')
      .single();
    if (error) log('err', `pedido ${doc.id}: ${error.message}`);
    else {
      await mapSet('pedido', doc.id, data.id);
      log('ok', `pedido #${d.numeroPedido}`);
    }
  }
  REPORT.counts.pedidos_inconsistentes = inconsistentes;

  // ── 6. KDS ───────────────────────────────────────────────
  for (const col of ['kds_cozinha', 'kds_balcao']) {
    console.log(`\n6. ${col}`);
    const snap = await db.collection(col).get();
    REPORT.counts[col] = snap.size;
    for (const doc of snap.docs) {
      const d = doc.data();
      const owner = resolveOwner(d.ownerUid || d.uid);
      if (!owner) continue;
      if (await mapGet(col, doc.id)) continue;
      if (DRY) continue;
      const { data, error } = await sb
        .from(col)
        .insert({
          owner_uid: owner,
          criador_uid: d.criadorUid ? resolveOwner(d.criadorUid) : null,
          numero_pedido: d.numeroPedido,
          cliente: d.cliente || '',
          mesa: d.mesa || '',
          obs_geral: d.obsGeral || '',
          itens: d.itens || [],
          status: d.status || 'novo',
          created_at: ts(d.serverTime) || ts(d.createdAt) || new Date().toISOString(),
          legacy_id: doc.id,
        })
        .select('id')
        .single();
      if (error) log('err', `${col} ${doc.id}: ${error.message}`);
      else {
        await mapSet(col, doc.id, data.id);
        log('ok', `${col} ${doc.id}`);
      }
    }
  }

  console.log('\n── Relatório ──');
  console.log(JSON.stringify(REPORT.counts, null, 2));
  console.log(`ok=${REPORT.ok.length} warn=${REPORT.warn.length} err=${REPORT.err.length}`);
  console.log('\nSegredos de pagamento NÃO migrados — reconfigure via UI/API.');
  console.log(DRY ? '\nDry-run apenas. Use --apply para gravar.' : '\nApply concluído.');
  process.exit(REPORT.err.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
