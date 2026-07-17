# Checklist HELIVI PDV

Use este checklist em ambiente local, staging e antes da produção.

## Banco e Auth

- [ ] Projeto Supabase criado.
- [ ] Migrations `180000` a `180400` aplicadas na ordem.
- [ ] Tabelas visíveis no Table Editor.
- [ ] Trigger `on_auth_user_created` existe.
- [ ] `supabase_realtime` publica comandas, KDS, produtos e usuários.
- [ ] Primeiro usuário possui row `usuarios` com `role=admin` e `owner_uid=id`.
- [ ] Dois tenants testados sem leitura/escrita cruzada.

## Segurança

- [ ] `.env.local`, `js/config.js`, tokens e certificados fora do Git.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` existe somente na API.
- [ ] `segredos_pagamento` e `id_map` são inacessíveis com JWT client.
- [ ] Apenas admin acessa CRUD de colaboradores e configuração de pagamentos.
- [ ] CORS contém somente origens necessárias.
- [ ] `PIX_WEBHOOK_SECRET` forte e diferente de exemplos.

## API Node

```bash
cd helivi-api
npm install
npm run test:smoke
npm run dev
```

- [ ] Smoke sem falhas.
- [ ] `GET /health` retorna `ok: true`.
- [ ] `GET /me` retorna perfil/owner com Bearer token.
- [ ] API usa Node 20 no ambiente de produção.
- [ ] Logs não exibem tokens ou service role.

## Frontend local

- [ ] `js/config.js` criado a partir do exemplo.
- [ ] `dataBackend: 'supabase'`.
- [ ] Somente URL + anon key no frontend.
- [ ] `apiBaseUrl` aponta para `http://127.0.0.1:8787` localmente.
- [ ] Live Server abre em `127.0.0.1:5500` ou origem permitida.
- [ ] Console mostra Supabase client pronto e backend Supabase.
- [ ] Nenhuma tentativa de conexão a Firebase Emulator `:8080`/`:9099`.

## Fluxos do PDV

- [ ] Login e logout.
- [ ] Produto: criar uma vez gera uma única row.
- [ ] Produto: editar/excluir atualiza a tela sem F5.
- [ ] Colaborador: criar/editar/excluir atualiza sem F5.
- [ ] Criar comanda e adicionar itens.
- [ ] Enviar itens para Cozinha/Balcão.
- [ ] KDS recebe e atualiza status em tempo real.
- [ ] Histórico e lucro exibem dados do tenant correto.
- [ ] Usuário cozinha/balcão/admin respeita permissões de tela.

## PIX Mercado Pago

- [ ] Gateway Mercado Pago salvo e selo verde visível.
- [ ] Token começa com `APP_USR-` (não `TEST-`).
- [ ] Produção: chave PIX cadastrada e Modo teste desmarcado.
- [ ] Sandbox: token do vendedor teste e Modo teste marcado.
- [ ] QR Code gerado.
- [ ] `external_reference` aceito (comanda sem hífens, até 64 caracteres).
- [ ] Verificação manual/automática funciona.
- [ ] Cancelar fecha a order no MP, limpa a comanda e libera novo PIX.
- [ ] Pagamento confirmado fecha o fluxo apenas uma vez.

## Efi (se usada)

- [ ] Client ID/Secret/chave PIX salvos pela tela.
- [ ] Certificado `.pem` correto e acessível pela API.
- [ ] Ambiente homologação/produção correto.
- [ ] Selo verde Efi Bank ativo.
- [ ] OAuth, geração e verificação PIX testados.

## Mercado Pago Point (se usado)

- [ ] Device ID configurado.
- [ ] Token Point configurado ou fallback para token de produção.
- [ ] Débito/crédito enviados ao terminal.
- [ ] Verificação e cancelamento de intent funcionam.

## Webhook

- [ ] API pública HTTPS.
- [ ] URL contém `gateway`, `secret` e `owner` corretos.
- [ ] Evento configurado no painel do gateway.
- [ ] Notificação é revalidada na API do gateway.
- [ ] Comanda atualiza para paga apenas no tenant correto.

## Migração de dados/cutover

- [ ] Backup Firestore completo.
- [ ] `node scripts/migrate-firestore.js --dry-run` revisado.
- [ ] `--apply` executado e totais conferidos.
- [ ] Usuários receberam invite/reset de senha.
- [ ] Segredos de pagamentos foram reconfigurados (não migrados).
- [ ] Staging aprovado.
- [ ] Plano de rollback comunicado.
- [ ] Janela de dados sem dual-write aceita/documentada.

## Validação rápida

```bash
cd helivi-api
npm run test:smoke
npm run dev
# Em outro processo: Live Server na raiz
```

Depois execute: login → produto → colaborador → comanda/KDS → PIX gerar/cancelar/gerar → histórico.

Documentos: [README.md](./README.md), [GUIA_CONFIGURACAO_FINAL.md](./GUIA_CONFIGURACAO_FINAL.md), [supabase/README.md](./supabase/README.md), [docs/RUNBOOK_CUTOVER_SUPABASE.md](./docs/RUNBOOK_CUTOVER_SUPABASE.md).
