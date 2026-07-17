# Guia técnico do HELIVI PDV

Este documento descreve o estado atual do código. Em caso de divergência, o código e as migrations versionadas são a fonte da verdade.

## 1. Visão geral

O HELIVI é um frontend estático com uma camada de dados intercambiável:

```text
Telas HTML + js/*.js
        │
        ▼
window.data / window.heliviData
        │
        ├── data-supabase.js ── Supabase Auth/PostgREST/Realtime
        │                       └── helivi-api (operações privilegiadas)
        │
        └── data-firebase.js ── Firebase legado/rollback
```

No desenvolvimento atual, `js/config.js` seleciona `dataBackend: 'supabase'`. Sem configuração, `data.js` ainda possui fallback Firebase para compatibilidade; não dependa desse fallback em deploy.

## 2. Componentes

### Frontend

- `index.html`: login/cadastro.
- `dashboard.html`: PDV, comandas e pagamentos.
- `produtos.html`: catálogo.
- `usuarios.html`: colaboradores.
- `cozinha.html` / `balcao.html`: KDS.
- `historico.html`, `lucro.html`, `config.html`.
- `js/data.js`: escolhe o adapter.
- `js/data-supabase.js`: traduz snake_case Postgres para contrato camelCase das telas.
- `js/data-firebase.js`: adapter legado.
- `js/auth.js`: sessão, perfil, tenant e autorização de tela.

### API Node

`helivi-api/` é Express/Node 20:

- valida JWT com Supabase Auth;
- usa service role para operações privilegiadas;
- gerencia colaboradores;
- integra Mercado Pago, Point e Efi;
- recebe webhooks;
- contém o script idempotente de migração Firestore → Postgres.

### Supabase

- Auth: identidade e sessão.
- Postgres: dados transacionais.
- RLS: isolamento multi-tenant.
- Realtime: produtos, usuários, comandas e KDS.
- Trigger Auth: provisiona `usuarios`.

### Firebase

`helivi-functions/` e o adapter Firebase são mantidos para rollback e histórico. Não são o caminho padrão de teste Supabase.

## 3. Ordem dos scripts nas páginas

As páginas carregam, em essência:

```html
<!-- SDKs Firebase ainda presentes para compatibilidade -->
<script src="js/config.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/supabase-init.js"></script>
<script src="js/firebase.js"></script>
<script src="js/data-firebase.js"></script>
<script src="js/data-supabase.js"></script>
<script src="js/data.js"></script>
<script src="js/auth.js"></script>
```

`config.js` precisa vir antes de `firebase.js`, pois define o backend. No modo Supabase, `firebase.js` não aponta Auth/Firestore para emuladores locais.

## 4. Configuração por ambiente

### Frontend

`js/config.js` (gitignored):

```js
window.HELIVI_CONFIG = {
  dataBackend: 'supabase',
  supabaseUrl: 'https://SEU_PROJETO.supabase.co',
  supabaseAnonKey: 'CHAVE_ANON',
  apiBaseUrl: 'http://127.0.0.1:8787',
};
window.HELIVI_DATA_BACKEND = window.HELIVI_CONFIG.dataBackend;
```

A anon key é pública por projeto, mas continua sujeita a RLS. A service role nunca vai ao frontend.

### API

`helivi-api/.env.local` (gitignored): URL, anon, service role, webhook secret, CORS e opções Efi. Consulte `helivi-api/.env.example`.

## 5. Identidade e tenant

Conceitos obrigatórios:

- `owner_uid`: estabelecimento/tenant.
- `criador_uid`: usuário que executou a ação.
- conta principal: `usuarios.id = owner_uid`, perfil `admin`;
- colaborador: `usuarios.owner_uid` aponta para a conta principal.

Nunca derive tenant apenas do payload do navegador. A API usa o perfil carregado pelo JWT. RLS usa `auth.uid()` + helpers SQL.

## 6. Auth e autorização

1. Supabase autentica e entrega access token.
2. `data-supabase.js` publica o usuário no contrato do app.
3. `requireAuth` busca `usuarios` e define `window.OWNER_UID`/`PERFIL_ATUAL`.
4. O callback de inicialização executa uma única vez por UID, mesmo com eventos `INITIAL_SESSION`/refresh.
5. A API repete a validação; proteção visual do frontend não substitui autorização server-side.

Perfis: `admin`, `atendente`, `caixa`, `cozinha`, `balcao`.

## 7. Modelo Postgres

Tabelas principais:

- `usuarios`: perfil 1:1 com Auth.
- `produtos`: catálogo por tenant.
- `comandas`: itens e estado de pagamento.
- `pedidos`: histórico imutável de vendas.
- `kds_cozinha`, `kds_balcao`: filas operacionais.
- `contadores`: sequência atômica de pedido.
- `configuracoes_pagamentos`: flags públicas do gateway.
- `segredos_pagamento`: tokens/secrets somente backend.
- `pagamentos_pix`: eventos de pagamento.
- `id_map`: idempotência da migração de dados.

A RPC `next_pedido_number(owner_uid)` evita colisões de numeração.

## 8. Migrations

A ordem atual é:

1. `180000_init_schema`: schema/RPC/helpers/publicação inicial.
2. `180100_rls_policies`: RLS, policies e GRANTs explícitos.
3. `180200_auth_bootstrap`: trigger de perfil.
4. `180300_realtime_replica_identity`: OLD rows completas em UPDATE/DELETE.
5. `180400_realtime_publication`: produtos/usuários na publicação.

Veja [supabase/README.md](./supabase/README.md).

## 9. CRUD e Realtime

`subscribeByOwner` faz carga inicial e assina `postgres_changes`. Produtos e colaboradores também atualizam o cache da tela após create/update/delete:

- resposta visual imediata;
- evita depender da latência do Realtime;
- Realtime continua sincronizando outras abas/dispositivos.

Deletes retornam a row afetada; zero rows é tratado como erro de permissão/não encontrado, em vez de exibir sucesso falso.

## 10. Fluxo de produtos

- `produtos.js` registra o submit uma única vez.
- O botão é desabilitado antes do await para impedir duplo clique.
- O adapter retorna a row criada/alterada.
- Cache e tela são atualizados imediatamente.

Isso evita o bug histórico em que múltiplos eventos Auth registravam vários listeners e um clique gerava vários inserts.

## 11. Colaboradores

A tela chama a API, nunca Supabase Admin diretamente:

- criação: Auth Admin + `usuarios` com mesmo `owner_uid`;
- edição/exclusão: alvo precisa pertencer ao tenant;
- somente admin;
- a lista é recarregada após mutação para não exigir F5.

## 12. Comandas, pedidos e KDS

- Comanda agrega itens e estado de pagamento.
- Pedido fechado registra `owner_uid` e `criador_uid`.
- Itens são encaminhados a cozinha/balcão conforme categoria.
- Realtime atualiza filas KDS.
- Numeração usa RPC atômica por tenant.

## 13. Pagamentos

### Mercado Pago PIX

1. PDV chama `POST /pagamentos/pix` com comanda e valor em centavos.
2. API valida existência, tenant e total.
3. Factory lê configuração/segredos do owner.
4. Gateway cria order em `/v1/orders`.
5. API grava txid, order id, QR e validade na comanda.
6. PDV verifica periodicamente e/ou recebe atualização por webhook.

`external_reference` é o ID da comanda sem hífens, limitado a 64 caracteres. Isso evita HTTP 400 do Mercado Pago.

### Cancelamento PIX

- PDV chama `POST /pagamentos/pix/cancelar`.
- Para Mercado Pago, a API cancela `/v1/orders/{order_id}/cancel`.
- A comanda tem campos PIX limpos e `status_pagamento='pix_cancelado'`.
- Timers/estado local são limpos e o botão Finalizar é reabilitado.
- Para Efi, o fluxo atual limpa local/banco e a cobrança expira conforme o gateway.

### Point

A API cria/verifica/cancela Payment Intent e valida Device ID/configuração do tenant.

### Webhook

`POST /webhooks/pix?gateway=&secret=&owner=`. O payload é revalidado no gateway antes da atualização. O secret é obrigatório em produção.

## 14. Configurações

A tela grava configurações por API. Tokens não voltam ao navegador após salvar. Um selo verde indica o gateway persistido ativo: Mercado Pago ou Efi Bank. Alterar o select sem salvar não muda o gateway efetivo.

## 15. Segurança

- RLS em todas as tabelas de negócio.
- service role só no servidor.
- segredos sem policies client.
- API valida admin + tenant.
- CORS restrito.
- `escHtml()` em interpolações sensíveis; novos componentes devem continuar escapando dados.
- webhook com secret e revalidação.
- `.env.local`, `config.js`, tokens e certificados fora do Git.

## 16. Desenvolvimento local

Terminal da API:

```bash
cd helivi-api
npm install
npm run test:smoke
npm run dev
```

Frontend: Live Server na raiz (`http://127.0.0.1:5500`).

Health: `http://127.0.0.1:8787/health`.

Use Ctrl+Shift+R após mudanças de scripts para evitar cache antigo.

## 17. Testes essenciais

- Auth e `/me`.
- CRUD produto/colaborador sem duplicação e sem F5.
- Comanda → KDS → status.
- PIX gerar → cancelar → gerar de novo.
- PIX pago → fechamento único.
- Point se configurado.
- dois tenants isolados.
- JWT client sem leitura de segredos.

Checklist completo: [CHECKLIST.md](./CHECKLIST.md).

## 18. Deploy e cutover

- API Node 20 com HTTPS e secret manager.
- Frontend com URL/API de produção.
- Migrations aplicadas antes do frontend.
- Webhooks configurados.
- Migração Firestore com dry-run/apply.
- Reset de senha para usuários migrados.
- Rollback via `dataBackend='firebase'` durante a janela suportada.

Runbook: [docs/RUNBOOK_CUTOVER_SUPABASE.md](./docs/RUNBOOK_CUTOVER_SUPABASE.md).

## 19. Limitações conhecidas

- Não há paridade com persistência offline do Firestore.
- Firebase SDK ainda é carregado por compatibilidade; pode ser removido após estabilização pós-cutover.
- Cancelamento remoto Efi não está implementado como cancel de cobrança; o estado HELIVI é limpo e a cobrança expira.
- Sem dual-write, dados criados no Supabase não retornam automaticamente ao Firebase em rollback.

## 20. Documentos relacionados

- [README.md](./README.md)
- [GUIA_CONFIGURACAO_FINAL.md](./GUIA_CONFIGURACAO_FINAL.md)
- [supabase/README.md](./supabase/README.md)
- [helivi-api/README.md](./helivi-api/README.md)
- [MIGRACAO_SUPABASE.md](./MIGRACAO_SUPABASE.md)
- [docs/RUNBOOK_CUTOVER_SUPABASE.md](./docs/RUNBOOK_CUTOVER_SUPABASE.md)
- [helivi-functions/GUIA_FUNCTIONS.md](./helivi-functions/GUIA_FUNCTIONS.md) — legado Firebase.
