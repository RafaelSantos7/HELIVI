#!/usr/bin/env node
/**
 * Smoke tests — valida sintaxe, imports e contratos dos módulos PIX.
 * Uso: node scripts/smoke-test.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FUNCTIONS = path.join(ROOT, 'functions');
const FRONTEND_JS = path.join(ROOT, '..', 'js');

let passou = 0;
let falhou = 0;

function ok(msg) {
  passou += 1;
  console.log(`  ✅ ${msg}`);
}

function fail(msg, err) {
  falhou += 1;
  console.error(`  ❌ ${msg}`);
  if (err) console.error(`     ${err.message || err}`);
}

function listarJs(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listarJs(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

console.log('\n═══ HELIVI — Smoke Tests ═══\n');

// 1. Sintaxe de todos os .js (functions + frontend + scripts)
console.log('1. Sintaxe JavaScript');
const arquivosJs = [
  ...listarJs(FUNCTIONS),
  ...listarJs(FRONTEND_JS),
  ...listarJs(path.join(ROOT, 'scripts')),
].filter((f) => !f.includes('node_modules'));

for (const arquivo of arquivosJs) {
  try {
    execSync(`node --check "${arquivo}"`, { stdio: 'pipe' });
    ok(path.relative(ROOT, arquivo));
  } catch (e) {
    fail(path.relative(ROOT, arquivo), e);
  }
}

// 2. Módulos gateway exportam contrato esperado
console.log('\n2. Contratos dos gateways PIX');
try {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'helivi' });
  }

  const efi = require(path.join(FUNCTIONS, 'gateways', 'efiService'));
  const mp = require(path.join(FUNCTIONS, 'gateways', 'mercadoPagoService'));
  const factory = require(path.join(FUNCTIONS, 'gateways', 'pixFactory'));

  for (const [nome, mod] of [['efiService', efi], ['mercadoPagoService', mp]]) {
    if (typeof mod.gerarCobranca !== 'function') fail(`${nome}.gerarCobranca ausente`);
    else ok(`${nome}.gerarCobranca`);
    if (typeof mod.verificarStatus !== 'function') fail(`${nome}.verificarStatus ausente`);
    else ok(`${nome}.verificarStatus`);
    if (typeof mod.processarWebhook !== 'function') fail(`${nome}.processarWebhook ausente`);
    else ok(`${nome}.processarWebhook`);
  }

  for (const fn of ['gerarCobrancaPix', 'verificarStatusPix', 'processarWebhook', 'carregarConfig', 'limparCache']) {
    if (typeof factory[fn] !== 'function') fail(`pixFactory.${fn} ausente`);
    else ok(`pixFactory.${fn}`);
  }

  if (!Array.isArray(factory.GATEWAYS_VALIDOS) || !factory.GATEWAYS_VALIDOS.includes('mercadopago')) {
    fail('pixFactory.GATEWAYS_VALIDOS deve incluir mercadopago');
  } else {
    ok('pixFactory.GATEWAYS_VALIDOS inclui mercadopago e efi');
  }

  const point = require(path.join(FUNCTIONS, 'gateways', 'mercadoPagoPointService'));
  const cartaoFactory = require(path.join(FUNCTIONS, 'gateways', 'cartaoFactory'));

  for (const fn of ['criarPaymentIntent', 'consultarStatus', 'cancelarPaymentIntent']) {
    if (typeof point[fn] !== 'function') fail(`mercadoPagoPointService.${fn} ausente`);
    else ok(`mercadoPagoPointService.${fn}`);
  }

  for (const fn of ['enviarPagamentoMaquininha', 'consultarStatusMaquininha', 'cancelarPagamentoMaquininha', 'carregarConfig', 'limparCache']) {
    if (typeof cartaoFactory[fn] !== 'function') fail(`cartaoFactory.${fn} ausente`);
    else ok(`cartaoFactory.${fn}`);
  }

  if (!Array.isArray(cartaoFactory.MAQUININHAS_VALIDAS) || !cartaoFactory.MAQUININHAS_VALIDAS.includes('mercadopago_point')) {
    fail('cartaoFactory.MAQUININHAS_VALIDAS deve incluir mercadopago_point');
  } else {
    ok('cartaoFactory.MAQUININHAS_VALIDAS inclui mercadopago_point');
  }
} catch (e) {
  fail('Carregar gateways', e);
}

// 3. Validação de token Mercado Pago (lógica interna via gerarCobranca)
console.log('\n3. Validação token Mercado Pago');
try {
  const mp = require(path.join(FUNCTIONS, 'gateways', 'mercadoPagoService'));

  async function deveFalhar(label, promise, contem) {
    try {
      await promise;
      fail(label);
    } catch (e) {
      if (contem && !String(e.message).includes(contem)) {
        fail(`${label} (mensagem inesperada: ${e.message})`);
      } else {
        ok(label);
      }
    }
  }

  (async () => {
    await deveFalhar(
      'Rejeita token TEST-',
      mp.gerarCobranca({
        valorCentavos: 100,
        descricao: 'teste',
        identificador: 'test-1',
        credenciais: { mpAccessToken: 'TEST-1234567890', mpAmbienteTeste: false },
      }),
      'TEST-'
    );

    await deveFalhar(
      'Rejeita token vazio em produção',
      mp.gerarCobranca({
        valorCentavos: 100,
        descricao: 'teste',
        identificador: 'test-2',
        credenciais: { mpAccessToken: '', mpAmbienteTeste: false },
      }),
      'PRODUÇÃO'
    );

    console.log(`\n═══ Resultado: ${passou} ok, ${falhou} falha(s) ═══\n`);
    process.exit(falhou > 0 ? 1 : 0);
  })();
} catch (e) {
  fail('Testes Mercado Pago', e);
  console.log(`\n═══ Resultado: ${passou} ok, ${falhou} falha(s) ═══\n`);
  process.exit(1);
}
