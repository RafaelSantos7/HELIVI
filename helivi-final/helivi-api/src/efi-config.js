'use strict';

const path = require('path');

const AMBIENTES_VALIDOS = ['homolog', 'producao'];
const AMBIENTE_RAW = (process.env.EFI_AMBIENTE || 'homolog').trim().toLowerCase();
const AMBIENTE = AMBIENTES_VALIDOS.includes(AMBIENTE_RAW) ? AMBIENTE_RAW : 'homolog';

const CERT_DIR = process.env.EFI_CERT_DIR
  || path.join(__dirname, '..', '..', 'helivi-functions', 'functions');

const CONFIGS = {
  homolog: {
    apiUrl: 'https://pix-h.api.efipay.com.br',
    certPath: process.env.EFI_CERT_PATH_HOMOLOG
      || path.join(CERT_DIR, 'homologacao-927842-PDV HELIVI.pem'),
    clientId: process.env.EFI_HOMOLOG_CLIENT_ID || process.env.EFI_CLIENT_ID || '',
    clientSecret: process.env.EFI_HOMOLOG_CLIENT_SECRET || process.env.EFI_CLIENT_SECRET || '',
    pixKey: process.env.EFI_HOMOLOG_PIX_KEY || process.env.EFI_PIX_KEY || '',
    timeout: 60000,
    buscarQrImagem: false,
  },
  producao: {
    apiUrl: 'https://pix.api.efipay.com.br',
    certPath: process.env.EFI_CERT_PATH_PRODUCAO
      || path.join(CERT_DIR, 'producao-927842-PDV HELIVI.pem'),
    clientId: process.env.EFI_PROD_CLIENT_ID || process.env.EFI_CLIENT_ID || '',
    clientSecret: process.env.EFI_PROD_CLIENT_SECRET || process.env.EFI_CLIENT_SECRET || '',
    pixKey: process.env.EFI_PROD_PIX_KEY || process.env.EFI_PIX_KEY || '',
    timeout: 60000,
    buscarQrImagem: false,
  },
};

const EFI_CONFIG = CONFIGS[AMBIENTE] || CONFIGS.homolog;

module.exports = { AMBIENTE, AMBIENTES_VALIDOS, CONFIGS, EFI_CONFIG };
