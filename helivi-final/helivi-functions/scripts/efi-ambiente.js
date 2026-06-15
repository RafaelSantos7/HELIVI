#!/usr/bin/env node
/**
 * Alterna o ambiente Efi (homolog ↔ producao) em helivi-functions/.env.local
 *
 * Uso:
 *   node scripts/efi-ambiente.js homolog
 *   node scripts/efi-ambiente.js producao
 *   node scripts/efi-ambiente.js status
 *   node scripts/efi-ambiente.js toggle
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.local');
const ENV_EXAMPLE = path.join(ROOT, '.env.example');
const VALIDOS = new Set(['homolog', 'producao']);

function parseArgs() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const quiet = process.argv.includes('--quiet');
  return { cmd: args[0] || 'status', quiet };
}

function lerEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return { lines: [], map: new Map() };
  const raw = fs.readFileSync(ENV_FILE, 'utf8');
  const lines = raw.split(/\r?\n/);
  const map = new Map();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return { lines, map };
}

function criarEnvLocal(modelo) {
  if (fs.existsSync(ENV_EXAMPLE)) {
    fs.copyFileSync(ENV_EXAMPLE, ENV_FILE);
    return;
  }
  fs.writeFileSync(modelo || ENV_FILE, [
    '# Ambiente Efi: homolog | producao',
    'EFI_AMBIENTE=homolog',
    '',
    '# Credenciais por ambiente (recomendado — troque só EFI_AMBIENTE depois)',
    'EFI_HOMOLOG_CLIENT_ID=',
    'EFI_HOMOLOG_CLIENT_SECRET=',
    'EFI_HOMOLOG_PIX_KEY=',
    '',
    'EFI_PROD_CLIENT_ID=',
    'EFI_PROD_CLIENT_SECRET=',
    'EFI_PROD_PIX_KEY=',
    '',
  ].join('\n'), 'utf8');
}

function definirAmbiente(novo) {
  if (!VALIDOS.has(novo)) {
    console.error(`Ambiente inválido: "${novo}". Use: homolog ou producao`);
    process.exit(1);
  }

  if (!fs.existsSync(ENV_FILE)) {
    criarEnvLocal();
    console.log(`Criado ${path.relative(process.cwd(), ENV_FILE)} a partir do exemplo.`);
  }

  const { lines, map } = lerEnvFile();
  map.set('EFI_AMBIENTE', novo);

  let substituido = false;
  const novasLinhas = lines.map((line) => {
    if (/^\s*EFI_AMBIENTE\s*=/.test(line)) {
      substituido = true;
      return `EFI_AMBIENTE=${novo}`;
    }
    return line;
  });

  if (!substituido) {
    if (novasLinhas.length && novasLinhas[novasLinhas.length - 1] !== '') {
      novasLinhas.push('');
    }
    novasLinhas.push(`EFI_AMBIENTE=${novo}`);
  }

  fs.writeFileSync(ENV_FILE, novasLinhas.join('\n').replace(/\n?$/, '\n'), 'utf8');
  return { novo, map };
}

function atualizarJsonAmbiente(novo) {
  const jsonPath = path.join(ROOT, 'functions', 'efi.local.json');
  if (!fs.existsSync(jsonPath)) return;
  try {
    const cfg = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    cfg.ambiente = novo;
    fs.writeFileSync(jsonPath, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
  } catch {
    // efi.local.json é opcional
  }
}

function carregarConfig() {
  delete require.cache[require.resolve('../functions/load-efi-env')];
  delete require.cache[require.resolve('../functions/efi-config')];
  require('../functions/load-efi-env');
  return require('../functions/efi-config');
}

function imprimirStatus(cfg, quiet) {
  const { AMBIENTE, EFI_CONFIG, credenciaisConfiguradas } = cfg;
  const certOk = fs.existsSync(EFI_CONFIG.certPath);

  if (quiet) return;

  console.log('\n── Ambiente Efi ──');
  console.log('  Ativo:      ', AMBIENTE);
  console.log('  API:        ', EFI_CONFIG.apiUrl);
  console.log('  Certificado:', certOk ? 'OK' : 'AUSENTE — ' + EFI_CONFIG.certPath);
  console.log('  Client ID:  ', EFI_CONFIG.clientId ? EFI_CONFIG.clientId.slice(0, 12) + '...' : '(vazio)');
  console.log('  PIX Key:    ', EFI_CONFIG.pixKey || '(vazio)');
  console.log('  Credenciais customizadas:', credenciaisConfiguradas() ? 'sim' : 'não (fallback do repo)');
  console.log('  Arquivo:    ', path.relative(process.cwd(), ENV_FILE));

  if (AMBIENTE === 'producao') {
    console.log('\n  ⚠️  PRODUÇÃO — pagamentos reais serão processados.');
  } else {
    console.log('\n  Homologação — ambiente de testes Efi.');
  }
  console.log('');
}

function main() {
  const { cmd, quiet } = parseArgs();

  if (cmd === 'status') {
    imprimirStatus(carregarConfig(), quiet);
    return;
  }

  if (cmd === 'toggle') {
    const atual = carregarConfig().AMBIENTE;
    const novo = atual === 'producao' ? 'homolog' : 'producao';
    definirAmbiente(novo);
    atualizarJsonAmbiente(novo);
    if (!quiet) console.log(`Ambiente alterado: ${atual} → ${novo}`);
    imprimirStatus(carregarConfig(), quiet);
    if (!quiet) console.log('Reinicie o emulador (npm run serve) se estiver rodando.\n');
    return;
  }

  if (!VALIDOS.has(cmd)) {
    console.log(`Uso: node scripts/efi-ambiente.js <homolog|producao|status|toggle>`);
    process.exit(1);
  }

  definirAmbiente(cmd);
  atualizarJsonAmbiente(cmd);
  if (!quiet) console.log(`Ambiente definido: ${cmd}`);
  imprimirStatus(carregarConfig(), quiet);
  if (!quiet) console.log('Reinicie o emulador (npm run serve) se estiver rodando.\n');
}

main();
