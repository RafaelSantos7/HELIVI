#!/usr/bin/env node
/**
 * Script de diagnóstico — OAuth e cobrança PIX Efi
 * Uso:
 *   node test-pix-oauth.js [--cob]
 *   node test-pix-oauth.js --homolog [--cob]
 *   node test-pix-oauth.js --producao [--cob]
 *   node test-pix-oauth.js --ambiente homolog|producao [--cob]
 *
 * Configure credenciais em helivi-functions/.env.local ou functions/efi.local.json
 */

(function aplicarAmbienteCli() {
  const args = process.argv;
  if (args.includes('--producao')) {
    process.env.EFI_AMBIENTE = 'producao';
    process.env.EFI_AMBIENTE_CLI = '1';
  } else if (args.includes('--homolog')) {
    process.env.EFI_AMBIENTE = 'homolog';
    process.env.EFI_AMBIENTE_CLI = '1';
  } else {
    const i = args.indexOf('--ambiente');
    if (i >= 0 && args[i + 1]) {
      process.env.EFI_AMBIENTE = args[i + 1];
      process.env.EFI_AMBIENTE_CLI = '1';
    }
  }
})();

const axios = require('axios');
const fs = require('fs');
const https = require('https');
const { AMBIENTE, EFI_CONFIG, credenciaisConfiguradas } = require('./efi-config');

const testarCob = process.argv.includes('--cob');
const config = EFI_CONFIG;

function criarHttpsAgent() {
  return new https.Agent({
    cert: fs.readFileSync(config.certPath),
    key: fs.readFileSync(config.certPath),
    passphrase: '',
  });
}

function logErro(contexto, erro) {
  console.error(`\n❌ ${contexto}`);
  console.error('  message:', erro.message);
  console.error('  code:', erro.code || '(n/a)');
  if (erro.response) {
    console.error('  status:', erro.response.status);
    console.error('  data:', JSON.stringify(erro.response.data, null, 2));
  }
}

async function testarOAuth() {
  console.log('\n═══ TESTE 1: OAuth /oauth/token ═══');
  console.log('Ambiente:', AMBIENTE);
  console.log('URL:', config.apiUrl);
  console.log('Certificado:', config.certPath);
  console.log('Client ID:', config.clientId.slice(0, 8) + '...');
  console.log('Credenciais customizadas:', credenciaisConfiguradas() ? 'sim' : 'não (padrão do repo)');

  if (!fs.existsSync(config.certPath)) {
    throw new Error(`Certificado não encontrado: ${config.certPath}`);
  }

  const response = await axios.post(
    `${config.apiUrl}/oauth/token`,
    { grant_type: 'client_credentials' },
    {
      auth: { username: config.clientId, password: config.clientSecret },
      httpsAgent: criarHttpsAgent(),
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    }
  );

  console.log('✅ OAuth OK — status', response.status);
  console.log('  token_type:', response.data.token_type);
  console.log('  expires_in:', response.data.expires_in, 's');
  console.log('  access_token:', response.data.access_token?.slice(0, 20) + '...');

  return response.data.access_token;
}

async function testarCobranca(token) {
  console.log('\n═══ TESTE 2: POST /v2/cob ═══');

  const payload = {
    calendario: { expiracao: 3600 },
    valor: { original: '1.00' },
    chave: config.pixKey,
    solicitacaoPagador: 'Teste diagnóstico HELIVI',
  };

  const response = await axios.post(`${config.apiUrl}/v2/cob`, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    httpsAgent: criarHttpsAgent(),
    timeout: 30000,
  });

  console.log('✅ Cobrança criada — status', response.status);
  console.log('  txid:', response.data.txid);
  console.log('  status:', response.data.status);
  console.log('  pixCopiaECola:', response.data.pixCopiaECola ? '(presente)' : '(ausente)');
  console.log('  loc.id:', response.data.loc?.id || '(ausente)');

  if (response.data.loc?.id) {
    console.log('\n═══ TESTE 3: GET /v2/loc/{id}/qrcode ═══');
    const qrRes = await axios.get(
      `${config.apiUrl}/v2/loc/${response.data.loc.id}/qrcode`,
      {
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: criarHttpsAgent(),
        timeout: 30000,
      }
    );
    console.log('✅ QR Code obtido');
    console.log('  imagemQrcode:', qrRes.data.imagemQrcode ? '(presente)' : '(ausente)');
    console.log('  qrcode:', qrRes.data.qrcode ? '(presente)' : '(ausente)');
  }

  return response.data;
}

async function main() {
  console.log('Diagnóstico PIX Efi Bank — HELIVI PDV');

  try {
    const token = await testarOAuth();
    if (testarCob) {
      await testarCobranca(token);
    } else {
      console.log('\n💡 Para testar criação de cobrança, execute: node test-pix-oauth.js --cob');
    }
    console.log('\n✅ Diagnóstico concluído com sucesso.\n');
  } catch (erro) {
    logErro('Falha no diagnóstico', erro);
    console.log('\nDicas:');
    console.log('  1. Copie helivi-functions/.env.example → helivi-functions/.env.local');
    console.log('  2. Cole Client_Id e Client_Secret da aba Homologação no painel Efi');
    console.log('  3. Reinicie o emulador: npm run serve');
    console.log('  4. Certificado + URL + credenciais devem ser do MESMO ambiente\n');
    process.exit(1);
  }
}

main();
