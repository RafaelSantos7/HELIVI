# Migração HELIVI: Firebase → Supabase

Logbook da migração faseada. Atualizado ao final de cada fase relevante.
Regra de ouro: quando doc divergir do código, o **código** manda.

## Estado atual (16/07/2026)

- Fases 0–8 concluídas em código; cutover de produção ainda depende do runbook.
- Desenvolvimento local validado com `dataBackend: 'supabase'`, Live Server e `helivi-api` em `:8787`.
- Cinco migrations versionadas (`180000` a `180400`): schema, RLS/GRANTs, Auth, replica identity e publicação Realtime.
- CRUD de produtos/colaboradores atualiza cache local e Realtime; callbacks Auth são deduplicados.
- Mercado Pago PIX validado via `/v1/orders`; `external_reference` usa comanda sem hífens (≤64).
- Cancelar PIX chama `/pagamentos/pix/cancelar`, cancela a order MP, limpa a comanda e libera nova tentativa.
- Configurações exibem selo verde com o gateway PIX persistido ativo.
- Firebase permanece disponível apenas como legado/rollback.

---

## Fase 0 — Inventário e baseline

Status: concluída em 16/07/2026.

### Baseline de testes

```
cd helivi-functions
npm run test:smoke   # 47 ok, 0 falha(s)
```

Este é o baseline que deve continuar verde após cada mudança da Fase 1.

### Convenção de tenant (contrato-alvo)

- `ownerUid` (Firestore, camelCase) / `owner_uid` (Postgres, snake_case) = **UID da conta principal do estabelecimento** (chave de tenant).
- `criadorUid` / `criador_uid` = **UID de quem executou a ação** (auditoria).
- `atendente` / `atendenteEmail` = rótulos de UI derivados de `criadorUid` (preenchidos por trigger).

### Matriz tela → coleções → callables → realtime → permissão

| Tela | Script | Coleções Firestore | Callables | Realtime (`onSnapshot`) | Permissão necessária |
|------|--------|--------------------|-----------|-------------------------|----------------------|
| `index.html` | `auth.js` | Auth apenas | — | — | público (login) / criar conta principal |
| `dashboard.html` | `pdv.js`, `print.js` | `produtos` (r), `comandas` (rw), `pedidos` (w), `kds_cozinha` (w), `kds_balcao` (w), `config/cnt_*` (rw), `configuracoes/pagamentos` (r) | PIX (criar/verificar/simular), Maquininha (criar/verificar/cancelar) | `produtos`, `comandas`, comanda PIX monitor | atendente+ do próprio `ownerUid` |
| `produtos.html` | `produtos.js` | `produtos` (rw) | — | `produtos` | atendente+ do próprio `ownerUid` |
| `usuarios.html` | `usuarios.js` | `usuarios` (r) | `criarColaborador`, `editarColaborador`, `excluirColaborador` | `usuarios` | **admin** do próprio `ownerUid` |
| `cozinha.html` | `kds.js` (`KDS_SETOR='cozinha'`) | `kds_cozinha` (rw status) | — | `kds_cozinha` | cozinha/admin do próprio `ownerUid` |
| `balcao.html` | `kds.js` (`KDS_SETOR='balcao'`) | `kds_balcao` (rw status) | — | `kds_balcao` | balcao/admin do próprio `ownerUid` |
| `historico.html` | `historico.js`, `print.js` | `pedidos` (r) | — | — | **admin** do próprio `ownerUid` |
| `lucro.html` | `lucro.js` | `pedidos` (r) | — | — | **admin** do próprio `ownerUid` |
| `config.html` | inline + `auth.js` | `configuracoes/pagamentos` (r) | `salvarConfigPagamentoPix` | — | **admin** do próprio `ownerUid` |

### Backend (Firebase Functions v2, Node 20) — 15 exports

| Função | Tipo | Autorização atual | Gap P0 |
|--------|------|-------------------|--------|
| `criarColaborador` | onCall | só login | sem check admin/owner |
| `editarColaborador` | onCall | só login | sem check admin/owner |
| `excluirColaborador` | onCall | só login | sem check admin/owner |
| `salvarConfigPagamentoPix` | onCall | `assertUsuarioAdmin` | passa se caller não tem doc em `usuarios` |
| `criarPagamentoPix` | onCall | comanda autorizada + valor | — |
| `verificarPagamentoPix` | onCall | txid→comanda | — |
| `simularConfirmacaoPixTeste` | onCall | emulador + comanda | — |
| `criarPagamentoMaquininha` | onCall | comanda + valor | — |
| `verificarPagamentoMaquininha` | onCall | intent→comanda | — |
| `cancelarPagamentoMaquininha` | onCall | comanda/intent | — |
| `webhookPagamentoPix` | onRequest público | secret **opcional** | secret deve ser obrigatório em prod; Efi não revalida na API |
| `onPedidoCriado` | trigger | — | enriquece `atendente` de `doc.uid` (será `criadorUid`) |
| `onComandaCriada` | trigger | — | idem |
| `onKdsCozinhaCriado` | trigger | — | idem |
| `onKdsBalcaoCriado` | trigger | — | idem |

### Bugs P0 confirmados no código (a corrigir na Fase 1)

1. **KDS não isola tenant** — escrita usa `getCurrentUID()` (`js/pdv.js` ~169, 191, 202, 465-466); leitura usa `user.uid` (`js/kds.js` L23/L32). Contas dedicadas cozinha/balcão nunca veem os pedidos.
2. **Pedidos somem de histórico/lucro** — escrita `pedido.uid = getCurrentUID()` (`js/pdv.js` ~430); leitura filtra por `ownerUid` (`js/historico.js` L35, `js/lucro.js` L34).
3. **Contador fragmentado + race** — `config/cnt_{currentUid}` com read-then-write sem transação (`js/pdv.js` L182, L427).
4. **Rules inseguras** — qualquer autenticado lê/escreve quase tudo (`firestore.rules`); `configuracoes/pagamentos` gravável no client.
5. **Colaboradores sem autorização** — CRUD sem admin/owner (`index.js` 24-80); `assertUsuarioAdmin` passa quando caller não tem doc.
6. **Webhook** — secret opcional; Efi confia no body sem reconsultar API.

Nenhuma mudança de provedor foi feita nesta fase.

---

## Fase 1 — Correções P0 no Firebase atual

Status: concluída (código). Requer passo de deploy manual das rules + backfill.

### Contrato de dados corrigido (Firestore)

Documentos de negócio agora carregam, de forma uniforme:

- `uid` = `ownerUid` (tenant) — mantido por compatibilidade com queries existentes.
- `ownerUid` = tenant (chave canônica).
- `criadorUid` = UID de quem executou (auditoria).

`pedidos`, `kds_cozinha`, `kds_balcao` deixaram de usar o UID do colaborador como
chave e passam a usar `ownerUid`. `comandas` e `produtos` já estavam corretos.

### Mudanças de código

Frontend:
- `js/pdv.js`: novo `proximoNumeroPedido(ownerUid)` (transação atômica) substituindo
  o contador `cnt_{uid}` sem transação; `enviarParaComanda` e `fecharComandaComPagamento`
  gravam `uid:ownerUid, ownerUid, criadorUid` em pedidos e KDS.
- `js/kds.js`: `iniciarKDS(uidAtual)` (tenant) em vez de `iniciarKDS(user.uid)`.
- `js/auth.js`: callback do `requireAuth` passa `safeOwnerUid`; `usuarios.html` entra
  em `APENAS_ADMIN`.

Backend:
- `pixSecurityUtil.js`: novo `assertAdminDoEstabelecimento(uid)` (admin + resolve ownerUid;
  conta principal sem doc = admin do próprio uid).
- `index.js`: `criar/editar/excluirColaborador` exigem admin e mesmo `ownerUid`, com
  whitelist de perfis; triggers de atendente usam `criadorUid` (fallback `uid`);
  claim `ownerUid` setado na criação/edição de colaborador.
- `efiService.processarWebhook`: revalida a cobrança na API Efi (não confia só no body).
- `webhookPagamentoPix`: `PIX_WEBHOOK_SECRET` obrigatório em produção (503 se ausente).

Regras:
- `firestore.rules`: isolamento por tenant via `ownerAtual()` (claim `ownerUid`, com
  fallback para `auth.uid` na conta principal). Coleções server-only (`usuarios`,
  `configuracoes/*`, `pagamentos_pix`) com `write:false`; `config/cnt_{ownerUid}`
  restrito ao próprio tenant; nenhuma policy `if true` em dados de negócio.

Novo utilitário:
- `helivi-functions/scripts/backfill-claims.js`: seta o claim `ownerUid` para
  colaboradores criados antes desta fase.

### Sequência de deploy obrigatória (não quebrar o app)

As rules dependem do claim `ownerUid`. Ordem:

1. Deploy das Functions (passam a setar claim): `npm run deploy`.
2. Backfill dos colaboradores existentes:
   `node scripts/backfill-claims.js` (usa credenciais do projeto).
3. Só então publicar as rules: `firebase deploy --only firestore:rules`.
4. Colaboradores devem relogar (ou aguardar ~1h) para o token novo com o claim.

Restrição temporária documentada (regra #10): entre os passos 3 e 4, colaboradores com
token antigo (sem claim) ficam limitados ao próprio uid. Mitigação: executar em janela de
manutenção. Solução definitiva: RLS no Supabase (Fase 3).

### Teste manual antes da Fase 2

- [ ] Admin cria colaborador atendente (perfil inválido cai para `atendente`).
- [ ] Não-admin não abre `usuarios.html` nem cria/edita colaborador (permission-denied).
- [ ] Atendente faz venda direta + comanda multi-envio.
- [ ] Pedido do atendente aparece no histórico/lucro do admin.
- [ ] KDS cozinha/balcão (contas dedicadas) recebem os tickets do atendente.
- [ ] Dois atendentes simultâneos: numeração monotônica por estabelecimento, sem repetir.
- [ ] Config PIX salva só por admin; cliente não grava `configuracoes/pagamentos`.
- [ ] Isolamento cruzado: usuário do tenant A não lê comandas/pedidos do tenant B.
- [ ] `npm run test:smoke` = 0 falhas (baseline: 48 ok).

---

## Fase 2 — Camada de abstração de dados (frontend)

Status histórico da fase: concluída em 16/07/2026; naquele momento o backend ainda era Firebase. O estado atual está no topo deste documento.

### Entregável

- Novo [`js/data.js`](js/data.js): API estável em `window.heliviData` / `window.data`.
- Adapter Firebase por baixo (`db.collection`, callables, Auth).
- Telas e `auth.js` **não** chamam mais Firestore/Functions diretamente.
- Ordem de scripts: `firebase.js` → `data.js` → `icons.js` → `auth.js` → tela.
- Naquela fase, `window.HELIVI_DATA_BACKEND` ainda era futura e o default era Firebase; hoje `js/config.js` seleciona Supabase no desenvolvimento local.

### Superfície da API

| Namespace | Métodos principais |
|-----------|-------------------|
| `data.auth` | `onAuthStateChanged`, `signIn`, `createUser`, `signOut`, `currentUser` |
| `data.produtos` | `subscribeByOwner`, `create`, `update`, `remove` |
| `data.usuarios` | `subscribeByOwner`, `buscarPerfilPorUid`, CRUD callables |
| `data.comandas` | `subscribeByOwner`, `subscribeByUidField`, `subscribeDoc`, `get`, `create`, `update` |
| `data.pedidos` | `listByOwner`, `get`, `create` |
| `data.kds` | `subscribe`, `create`, `update` |
| `data.config` | `nextPedidoNumber`, `getPagamentos`, `salvarPagamentoPix` |
| `data.pagamentos` | PIX + Point callables |
| `data.serverTimestamp()` | FieldValue do backend atual |

### Arquivos refatorados

`auth.js`, `pdv.js`, `produtos.js`, `usuarios.js`, `kds.js`, `historico.js`, `lucro.js`,
`index.html`, `config.html`, e inclusão de `data.js` em todas as páginas HTML.

### Smoke

`npm run test:smoke` → **49 ok, 0 falhas**.

---

## Fase 3 — Schema Postgres + RLS (Supabase)

Status: concluída (SQL versionado no repositório). Aplicação no projeto Supabase fica para o cutover/staging (Fase 8); Auth/adapter nas Fases 4–5.

### Arquivos

- [`supabase/migrations/20260716180000_init_schema.sql`](supabase/migrations/20260716180000_init_schema.sql)
- [`supabase/migrations/20260716180100_rls_policies.sql`](supabase/migrations/20260716180100_rls_policies.sql)
- [`supabase/migrations/20260716180200_auth_bootstrap.sql`](supabase/migrations/20260716180200_auth_bootstrap.sql)
- [`supabase/migrations/20260716180300_realtime_replica_identity.sql`](supabase/migrations/20260716180300_realtime_replica_identity.sql)
- [`supabase/migrations/20260716180400_realtime_publication.sql`](supabase/migrations/20260716180400_realtime_publication.sql)
- [`supabase/README.md`](supabase/README.md)

### Tabelas

`usuarios`, `produtos`, `comandas`, `pedidos`, `kds_cozinha`, `kds_balcao`, `contadores`,
`configuracoes_pagamentos` (por `owner_uid`), `segredos_pagamento` (service role only),
`pagamentos_pix`, `id_map` (migração).

### Invariantes

- Conta principal: row explícita `usuarios` com `role=admin`, `owner_uid=id` (bootstrap via policy de signup ou API Fase 4).
- `owner_uid NOT NULL` em dados de estabelecimento.
- RPC `next_pedido_number(p_owner_uid)` atômica (`INSERT … ON CONFLICT DO UPDATE … RETURNING`).
- Helpers: `current_owner_uid()`, `current_user_role()`, `is_tenant_admin()`.
- RLS: isolamento por tenant; cozinha/balcão limitados ao próprio KDS; **nenhuma** policy `USING (true)`.
- `segredos_pagamento` / `id_map`: RLS on + revoke de `anon`/`authenticated` + sem policies client.
- Realtime: `comandas`, `kds_cozinha`, `kds_balcao`, `produtos` e `usuarios` na publication após as migrations complementares.

### Teste de isolamento (após Fase 4 ter Auth)

Dois tenants distintos: leitura/escrita cruzada deve falhar; colaborador não-admin não altera config; JWT não lê segredos.

---

## Fase 4 — Auth Supabase + colaboradores (API Node)

Status: concluída e validada com projeto Supabase real. O ambiente local atual usa `dataBackend: 'supabase'`.

### Entregáveis

- [`helivi-api/`](helivi-api/) — Express Node 20, JWT Supabase, service role só no servidor.
  - `GET /health`, `GET /me`
  - `POST/PATCH/DELETE /colaboradores` (admin + mesmo `owner_uid`, whitelist de perfis)
- [`supabase/migrations/20260716180200_auth_bootstrap.sql`](supabase/migrations/20260716180200_auth_bootstrap.sql) — trigger `handle_new_user`:
  - signup → admin do próprio uid;
  - Admin API com `user_metadata.owner_uid` → colaborador do tenant.
- [`js/config.example.js`](js/config.example.js) — flag `dataBackend` + URLs (copiar para `js/config.js`, gitignored).

### Migração de usuários (hashes Firebase)

Senhas Firebase **não** migram trivialmente. Plano: criar users no Supabase via Admin API + invite/reset password; mapear IDs em `id_map` (script na Fase 7).

### Smoke

```bash
cd helivi-api && npm run test:smoke   # esperado: 0 falhas
```

### Como testar com Supabase real

1. Criar projeto; `supabase db push` (ou SQL Editor nas cinco migrations).
2. Preencher `helivi-api/.env.local`.
3. `npm run dev` na API.
4. Signup no Auth (e-mail/senha) → row admin em `usuarios`.
5. `POST /colaboradores` com Bearer do admin.
6. Colaborador não-admin recebe 403 em `/colaboradores`.

---

## Fase 5 — Adapter Supabase + Realtime + escape HTML

Status: concluída. Desenvolvimento local validado em Supabase; produção só deve mudar após o runbook.

### Entregáveis

- `js/data-firebase.js` / `js/data-supabase.js` / `js/data.js` (seletor)
- `js/supabase-init.js` + `escHtml()` em `auth.js` (KDS, PDV nomes, usuários)
- Realtime via `postgres_changes` em comandas/KDS/produtos/usuarios; migrations `180300` e `180400` completam replica identity e publication.
- Pagamentos no adapter Supabase apontam para `helivi-api` (`/pagamentos/*` — Fase 6)

### Limitação

Offline Firestore sem paridade no Supabase; adapters fazem unsubscribe no unload e superficiam erros de rede.

### Smoke

`npm run test:smoke` (helivi-functions) → **53 ok, 0 falhas**.

---

## Fase 6 — Backend pagamentos (helivi-api)

Status: concluída (código). Gateways reaproveitados; config/segredos por `owner_uid` no Postgres.

### Rotas

| Método | Rota | Notas |
|--------|------|-------|
| POST | `/pagamentos/config` | admin; grava `configuracoes_pagamentos` + `segredos_pagamento` |
| POST | `/pagamentos/pix` | centavos; valida comanda + total |
| POST | `/pagamentos/pix/verificar` | consulta gateway e atualiza comanda |
| POST | `/pagamentos/pix/cancelar` | cancela order MP pendente e limpa estado PIX |
| POST | `/pagamentos/pix/simular` | bloqueado se `NODE_ENV=production` |
| POST | `/pagamentos/maquininha` (+ verificar/cancelar) | Point MP |
| POST | `/webhooks/pix?gateway=&secret=&owner=` | secret obrigatório em prod; Efi/MP revalidam via factory |

Arquivos: `helivi-api/src/payments/factory.js`, `routes/pagamentos.js`, `routes/webhooks.js`, `gateways/*`.

Smoke API: execute `npm run test:smoke`; o critério é **0 falhas**, sem depender de contagem fixa.

---

## Fase 7 — Migração de dados

Status: script pronto. Execução exige credenciais Firebase Admin + Supabase service role.

### Script

[`helivi-api/scripts/migrate-firestore.js`](helivi-api/scripts/migrate-firestore.js)

```bash
cd helivi-api
node scripts/migrate-firestore.js --dry-run
node scripts/migrate-firestore.js --apply
```

Idempotente via `id_map`. Ordem: auth/usuarios → produtos → contadores → comandas → pedidos → kds.  
Normaliza `owner_uid` (docs legados com UID de colaborador). Relatório de totais inconsistentes.  
**Não** migra tokens — reconfigurar pagamentos.

---

## Fase 8 — Cutover / hardening / docs

Status: runbook e checklist atualizados. Cutover de produção **não** executado automaticamente.

- [docs/RUNBOOK_CUTOVER_SUPABASE.md](docs/RUNBOOK_CUTOVER_SUPABASE.md)
- [CHECKLIST.md](CHECKLIST.md) — seção Supabase
- Rollback: republicar frontend com `dataBackend: 'firebase'`

### Riscos residuais

- Offline reduzido vs Firestore
- Limit 500 pedidos no client (paginação server-side futura)
- Usuários precisam resetar senha no go-live
- Webhook exige `owner` na query (multi-tenant)
- Sem dual-write, rollback não replica automaticamente dados Supabase ao Firestore
- Efi ainda não possui cancelamento remoto de cobrança; o HELIVI limpa o estado local/banco e aguarda expiração
