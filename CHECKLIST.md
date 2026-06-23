# ✅ CHECKLIST HELIVI PDV

Checklist operacional para validar o projeto antes de uso, deploy ou entrega ao cliente.

---

## 🗂️ Estrutura do projeto

| Item | Status |
|------|--------|
| Frontend (`index.html`, `dashboard.html`, demais telas) | ☐ |
| Scripts JS (`js/*.js`) referenciados nas páginas HTML | ☐ |
| CSS (`css/styles.css`) e logo (`image/logo.svg`) | ☐ |
| Firebase Functions (`helivi-functions/functions/`) | ☐ |
| Gateways PIX: `mercadoPagoService`, `efiService`, `pixFactory` | ☐ |
| Documentação: `README.md`, `GUIA_CONFIGURACAO_FINAL.md`, `GUIA_FUNCTIONS.md` | ☐ |

---

## 🧹 Limpeza e arquivos

| Item | Notas |
|------|-------|
| Sem `node_modules` versionado | No `.gitignore` |
| Sem `.env.local` / certificados no Git | No `.gitignore` |
| Certificados Efi: apenas `.pem` em `functions/` | `.p12` removidos (código usa `.pem`) |
| Dependência `node-rsa` removida | Não era usada no código |
| Logs de emulador (`*-debug.log`) não commitados | No `.gitignore` |

---

## ⚙️ Configuração PIX

### Mercado Pago (recomendado)

| Passo | Status |
|-------|--------|
| Access Token `APP_USR-` de produção salvo em **Configurações → Pagamento PIX** | ☐ |
| Chave PIX cadastrada no app Mercado Pago | ☐ |
| Gateway ativo = **Mercado Pago** | ☐ |
| Modo teste desmarcado (produção) ou configurado corretamente (sandbox) | ☐ |

### Efi Bank (alternativo)

| Passo | Status |
|-------|--------|
| Credenciais salvas em **Configurações → Pagamento PIX** ou `.env.local` | ☐ |
| Certificado `.pem` correto em `helivi-functions/functions/` | ☐ |
| `npm run efi:status` alinhado ao ambiente | ☐ |

### Webhook

| Passo | Status |
|-------|--------|
| `PIX_WEBHOOK_SECRET` em `helivi-functions/.env.local` (local) | ☐ |
| `PIX_WEBHOOK_SECRET` no Cloud Run (produção) | ☐ |
| URL do webhook no painel do gateway com `?gateway=mercadopago&secret=...` | ☐ |

---

## 🧪 Testes automatizados

Execute na pasta `helivi-functions`:

```bash
npm run test:smoke          # sintaxe + imports + validação token MP
npm run test:pix            # OAuth Efi (só se usar Efi)
npm run test:pix:cob        # OAuth + cobrança teste Efi
```

| Teste | Comando | Esperado |
|-------|---------|----------|
| Smoke (sintaxe + módulos) | `npm run test:smoke` | 0 falhas |
| OAuth Efi homolog | `npm run test:pix` | ✅ OAuth OK |
| Cobrança Efi homolog | `npm run test:pix:cob` | ✅ Cobrança criada |

---

## 🖥️ Testes locais (emulador + Live Server)

```bash
cd helivi-functions
npm run serve
```

Abra `helivi-final` com **Live Server** → `http://127.0.0.1:5500`

| Fluxo | Status |
|-------|--------|
| Login / logout | ☐ |
| Criar comanda no PDV | ☐ |
| Adicionar produtos à comanda | ☐ |
| Pagamento PIX → QR Code gerado | ☐ |
| Verificação automática de pagamento | ☐ |
| Simular pagamento (emulador, botão 🧪) | ☐ |
| KDS cozinha / balcão recebe pedido | ☐ |
| Colaboradores: criar / editar / excluir | ☐ |
| Configurações: salvar gateway PIX (admin) | ☐ |
| Histórico e impressão | ☐ |

---

## 🚀 Deploy produção

| Passo | Status |
|-------|--------|
| Plano Blaze ativo no Firebase | ☐ |
| `npm run deploy` sem erros | ☐ |
| `firebase functions:list` — 12 functions publicadas | ☐ |
| Webhook configurado no Mercado Pago / Efi | ☐ |
| PIX real testado no PDV em produção | ☐ |

Functions esperadas:

- `criarColaborador`, `editarColaborador`, `excluirColaborador`
- `onPedidoCriado`, `onComandaCriada`, `onKdsCozinhaCriado`, `onKdsBalcaoCriado`
- `criarPagamentoPix`, `verificarPagamentoPix`, `salvarConfigPagamentoPix`
- `simularConfirmacaoPixTeste`, `webhookPagamentoPix`

---

## 🔐 Segurança final

| Item | Status |
|------|--------|
| Nenhum secret no código-fonte | ☐ |
| `configuracoes/segredos_pagamento` bloqueado no Firestore (cliente não lê) | ☐ |
| Apenas admin altera PIX (`salvarConfigPagamentoPix`) | ☐ |
| Webhook protegido com `PIX_WEBHOOK_SECRET` | ☐ |

---

## 📋 Validação rápida (pré-entrega)

```bash
cd helivi-functions
npm run test:smoke
npm run serve          # terminal 1
# Live Server + testar PDV manualmente
```

- [ ] `test:smoke` passou
- [ ] PIX gera QR no emulador
- [ ] Deploy OK (se for produção)
- [ ] Webhook testado
- [ ] Documentação atualizada

---

**Docs relacionados:** [GUIA_CONFIGURACAO_FINAL.md](./GUIA_CONFIGURACAO_FINAL.md) · [helivi-functions/GUIA_FUNCTIONS.md](./helivi-functions/GUIA_FUNCTIONS.md)
