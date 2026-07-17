const fs = require('fs');
const path = require('path');

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  return { key, val };
}

function loadEnvFile(filePath, override = false) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    if (override || process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.val.trim();
    }
  }
  return true;
}

function loadLocalJson(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const cfg = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // .env.local tem prioridade; json só define ambiente se ainda não foi setado
  if (!process.env.EFI_AMBIENTE && cfg.ambiente) {
    process.env.EFI_AMBIENTE = String(cfg.ambiente).trim();
  }

  const map = {
    EFI_HOMOLOG_CLIENT_ID: cfg.homolog?.clientId,
    EFI_HOMOLOG_CLIENT_SECRET: cfg.homolog?.clientSecret,
    EFI_HOMOLOG_PIX_KEY: cfg.homolog?.pixKey,
    EFI_PROD_CLIENT_ID: cfg.producao?.clientId,
    EFI_PROD_CLIENT_SECRET: cfg.producao?.clientSecret,
    EFI_PROD_PIX_KEY: cfg.producao?.pixKey,
  };

  for (const [key, val] of Object.entries(map)) {
    if (val && process.env[key] === undefined) {
      process.env[key] = String(val).trim();
    }
  }
  return true;
}

const functionsDir = __dirname;
const rootDir = path.join(functionsDir, '..');

const ambienteCli = process.env.EFI_AMBIENTE_CLI ? process.env.EFI_AMBIENTE : null;

loadEnvFile(path.join(rootDir, '.env'));
// .env.local sempre prevalece (evita EFI_AMBIENTE=producao preso no shell)
loadEnvFile(path.join(rootDir, '.env.local'), true);
loadEnvFile(path.join(functionsDir, '.env.local'), true);
loadLocalJson(path.join(functionsDir, 'efi.local.json'));

if (ambienteCli) {
  process.env.EFI_AMBIENTE = ambienteCli;
  delete process.env.EFI_AMBIENTE_CLI;
}

module.exports = { loadEnvFile, loadLocalJson };
