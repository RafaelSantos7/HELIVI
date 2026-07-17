'use strict';

const express = require('express');
const cors = require('cors');
const { requireUser } = require('./auth');

const app = express();
const PORT = Number(process.env.PORT) || 8787;

const origins = (process.env.CORS_ORIGINS || 'http://127.0.0.1:5500,http://localhost:5500')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({ origin: origins, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'helivi-api', ts: new Date().toISOString() });
});

/** Perfil da sessão atual (equivale a buscarPerfilEOwner) */
app.get('/me', requireUser, (req, res) => {
  res.json({
    uid: req.user.id,
    email: req.user.email,
    perfil: req.perfil.role,
    ownerUid: req.ownerUid,
    nome: req.perfil.nome,
    ativo: req.perfil.ativo,
  });
});

app.use('/colaboradores', require('./routes/colaboradores'));
app.use('/pagamentos', require('./routes/pagamentos'));
app.use('/webhooks', require('./routes/webhooks'));

app.use((err, _req, res, _next) => {
  console.error('[helivi-api]', err);
  res.status(500).json({ erro: 'internal', mensagem: 'Erro interno' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[helivi-api] listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = app;
