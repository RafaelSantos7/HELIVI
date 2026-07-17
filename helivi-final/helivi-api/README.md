# helivi-api — API Node do HELIVI

Backend Express para Supabase Auth, operações com `service_role`, colaboradores, pagamentos e webhooks. Substitui as callables Firebase no backend Supabase.

## Configuração

```bash
cd helivi-api
npm install
```

Copie `.env.example` para `.env.local`:

```env
PORT=8787
NODE_ENV=development
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=CHAVE_ANON
SUPABASE_SERVICE_ROLE_KEY=CHAVE_SERVICE_ROLE
PIX_WEBHOOK_SECRET=SEGREDO_FORTE
CORS_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
EFI_AMBIENTE=homolog
```

- `SUPABASE_ANON_KEY` valida sessões do usuário.
- `SUPABASE_SERVICE_ROLE_KEY` acessa operações privilegiadas e nunca deve sair do servidor.
- Credenciais de gateways são salvas pelo app em `segredos_pagamento`, não no frontend.

## Executar

```bash
npm run test:smoke
npm run dev
```

Health check: `GET http://127.0.0.1:8787/health`.

## Autenticação

Rotas protegidas exigem:

```http
Authorization: Bearer <access_token do Supabase Auth>
```

A API valida o JWT, carrega `usuarios`, define `ownerUid` e aplica `requireAdmin` quando necessário.

## Rotas

### Sessão e colaboradores

- `GET /me` — perfil e tenant atuais.
- `POST /colaboradores` — cria usuário Auth + row `usuarios` (admin).
- `PATCH /colaboradores/:id` — edita colaborador do mesmo tenant (admin).
- `DELETE /colaboradores/:id` — remove colaborador do mesmo tenant (admin).

Body de criação: `{ nome, email, senha, perfil }`. `:id` é `usuarios.id`/UUID do Auth.

### Configuração de pagamentos

- `POST /pagamentos/config` — grava flags públicas em `configuracoes_pagamentos` e segredos em `segredos_pagamento` (admin).

### PIX

- `POST /pagamentos/pix` — gera cobrança, valida comanda e total.
- `POST /pagamentos/pix/verificar` — consulta o gateway e atualiza a comanda quando paga.
- `POST /pagamentos/pix/cancelar` — cancela a order pendente no Mercado Pago e limpa o estado PIX da comanda.
- `POST /pagamentos/pix/simular` — confirmação simulada, somente fora de produção.

No Mercado Pago:

- usa Checkout API `POST /v1/orders`;
- `external_reference` é o UUID da comanda sem hífens (até 64 caracteres);
- cancelamento usa `POST /v1/orders/{order_id}/cancel` para orders `created`/`action_required`.

### Mercado Pago Point

- `POST /pagamentos/maquininha`
- `POST /pagamentos/maquininha/verificar`
- `POST /pagamentos/maquininha/cancelar`

### Webhook

```text
POST /webhooks/pix?gateway=mercadopago|efi&secret=SEU_SECRET&owner=OWNER_UUID
```

Em produção, `PIX_WEBHOOK_SECRET` é obrigatório. A API não confia apenas no payload: consulta o gateway antes de confirmar pagamento.

## Segurança

- `service_role` somente em `.env.local`/secret manager do servidor.
- CORS restrito às origens do frontend.
- Admin e `owner_uid` validados no servidor.
- Não registrar tokens, secrets nem QR completo em logs.
- Rotacione `PIX_WEBHOOK_SECRET` e tokens periodicamente.

## Migração Firebase → Supabase

```bash
node scripts/migrate-firestore.js --dry-run
node scripts/migrate-firestore.js --apply
```

O script é idempotente via `id_map`. Senhas Firebase não são copiadas: usuários precisam de invite/reset. Tokens de pagamentos também não são migrados; reconfigure-os na tela Configurações.

Mais detalhes: [../GUIA_CONFIGURACAO_FINAL.md](../GUIA_CONFIGURACAO_FINAL.md) e [../docs/RUNBOOK_CUTOVER_SUPABASE.md](../docs/RUNBOOK_CUTOVER_SUPABASE.md).
