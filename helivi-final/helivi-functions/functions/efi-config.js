require('./load-efi-env');

const path = require('path');

const AMBIENTES_VALIDOS = ['homolog', 'producao'];
const AMBIENTE_RAW = (process.env.EFI_AMBIENTE || 'homolog').trim().toLowerCase();
const AMBIENTE = AMBIENTES_VALIDOS.includes(AMBIENTE_RAW) ? AMBIENTE_RAW : 'homolog';

if (AMBIENTE_RAW !== AMBIENTE) {
  console.warn(`[EFI] EFI_AMBIENTE="${process.env.EFI_AMBIENTE}" inválido; usando homolog.`);
}

function credenciais(prefixo, fallback) {
  return {
    clientId: process.env[`EFI_${prefixo}_CLIENT_ID`] || process.env.EFI_CLIENT_ID || fallback.clientId,
    clientSecret: process.env[`EFI_${prefixo}_CLIENT_SECRET`] || process.env.EFI_CLIENT_SECRET || fallback.clientSecret,
    pixKey: process.env[`EFI_${prefixo}_PIX_KEY`] || process.env.EFI_PIX_KEY || fallback.pixKey,
  };
}

const CONFIGS = {
  homolog: {
    apiUrl: 'https://pix-h.api.efipay.com.br',
    certPath: path.join(__dirname, 'homologacao-927842-PDV HELIVI.pem'),
    ...credenciais('HOMOLOG', {
      clientId: '',
      clientSecret: '',
      pixKey: '',
    }),
    timeout: 60000,
    buscarQrImagem: false,
  },
  producao: {
    apiUrl: 'https://pix.api.efipay.com.br',
    certPath: path.join(__dirname, 'producao-927842-PDV HELIVI.pem'),
    ...credenciais('PROD', {
      clientId: '',
      clientSecret: '',
      pixKey: '',
    }),
    timeout: 60000,
    buscarQrImagem: false,
  },
};

const EFI_CONFIG = CONFIGS[AMBIENTE] || CONFIGS.homolog;

function credenciaisConfiguradas() {
  return !!(process.env.EFI_CLIENT_ID
    || process.env.EFI_CLIENT_SECRET
    || process.env.EFI_HOMOLOG_CLIENT_ID
    || process.env.EFI_PROD_CLIENT_ID
    || require('fs').existsSync(path.join(__dirname, 'efi.local.json')));
}

function resumoAmbiente() {
  return {
    ambiente: AMBIENTE,
    producao: AMBIENTE === 'producao',
    apiUrl: EFI_CONFIG.apiUrl,
    certPath: EFI_CONFIG.certPath,
    pixKey: EFI_CONFIG.pixKey,
  };
}

module.exports = {
  AMBIENTE,
  AMBIENTES_VALIDOS,
  CONFIGS,
  EFI_CONFIG,
  credenciaisConfiguradas,
  resumoAmbiente,
};
