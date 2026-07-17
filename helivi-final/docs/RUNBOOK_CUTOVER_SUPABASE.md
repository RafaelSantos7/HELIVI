# Cutover HELIVI — Firebase para Supabase

Runbook de staging, produção e rollback. Não faça cutover direto sem completar o checklist.

## 1. Pré-cutover

### Infraestrutura

- Projeto Supabase criado.
- Migrations aplicadas na ordem `180000`, `180100`, `180200`, `180300`, `180400`.
- Grants de `service_role`, trigger Auth, RLS e publicação Realtime validados.
- `helivi-api` publicada em Node 20 com HTTPS.
- Env da API configurado: URL, anon, service role, webhook secret e CORS.
- Frontend staging com `dataBackend: 'supabase'` e `apiBaseUrl` HTTPS.

### Dados e usuários

1. Faça backup completo do Firestore/Auth.
2. Execute:

```bash
cd helivi-api
node scripts/migrate-firestore.js --dry-run
```

3. Revise contagens, owners, totais e erros.
4. Execute `node scripts/migrate-firestore.js --apply` em staging.
5. Envie invite/reset: hashes de senha Firebase não são migrados.
6. Reconfigure PIX/Point pela tela; tokens não são migrados.

### Testes obrigatórios

- Login admin e colaborador.
- CRUD produtos/colaboradores sem F5.
- Comanda, pedido e KDS Realtime.
- PIX: gerar, verificar, cancelar no gateway e gerar novamente.
- Point, se utilizado.
- Histórico/lucro.
- Isolamento explícito de dois tenants.
- Client sem acesso a `segredos_pagamento`.

Use [../CHECKLIST.md](../CHECKLIST.md).

## 2. Webhooks

Configure:

```text
https://SUA_API/webhooks/pix?gateway=mercadopago&secret=SEU_SECRET&owner=OWNER_UUID
```

Crie uma URL por estabelecimento/owner quando necessário. Teste uma notificação e confirme que a API revalida o pagamento antes de atualizar a comanda.

## 3. Cutover

1. Comunique uma janela de manutenção e congele writes no Firebase.
2. Execute novamente `migrate-firestore.js --apply` (idempotente via `id_map`).
3. Confira contagens e amostras.
4. Publique frontend com backend Supabase.
5. Valide health, login, venda, KDS e PIX real/sandbox.
6. Monitore logs da API, Supabase e gateways sem expor secrets.
7. Registre horário, versão publicada e responsáveis.

## 4. Critérios de abortar

Faça rollback se ocorrer:

- falha de login generalizada;
- isolamento RLS incorreto;
- perda/inconsistência relevante de pedidos;
- API indisponível sem recuperação rápida;
- pagamentos não verificáveis;
- KDS sem atualização operacional.

## 5. Rollback

1. Publique frontend com `dataBackend: 'firebase'`.
2. Reative Firebase Hosting/Functions se necessário.
3. Reaponte webhooks para Functions legadas.
4. Comunique o rollback.
5. Preserve Postgres para investigação; não apague dados.

Dados escritos somente no Postgres durante a janela não voltam automaticamente ao Firestore. Sem dual-write, documente a janela e faça reconciliação manual antes de nova tentativa.

## 6. Pós-cutover

- Acompanhe erros, latência, autenticação e pagamentos por pelo menos uma semana.
- Mantenha `helivi-functions` disponível para rollback nesse período.
- Rotacione secrets temporários usados na migração.
- Confirme backups Postgres e procedimento de restauração.
- Após estabilidade, planeje remover SDKs Firebase do HTML e arquivar código legado.
- Atualize versões e evidências no [../MIGRACAO_SUPABASE.md](../MIGRACAO_SUPABASE.md).
