# HELIVI PDV

Sistema de ponto de venda para restaurantes: produtos, comandas, pedidos, KDS de cozinha/balcão, colaboradores, histórico, lucro e pagamentos PIX/Point.

## Stack atual

- Frontend estático (HTML/CSS/JavaScript), executado com Live Server.
- Supabase Auth, Postgres, RLS e Realtime.
- `helivi-api/`: API Node.js/Express para operações privilegiadas, colaboradores e pagamentos.
- Mercado Pago (`/v1/orders`) como gateway PIX recomendado; Efi Bank como alternativa.
- Firebase permanece no repositório como backend legado e opção de rollback.

## Estrutura

```text
helivi-final/
├── *.html                    # telas do PDV
├── js/                       # frontend e adapters Firebase/Supabase
├── css/                      # estilos
├── helivi-api/               # API Node + gateways + migração de dados
├── supabase/migrations/      # schema, RLS, Auth e Realtime
├── docs/                     # runbook de cutover
└── helivi-functions/         # backend Firebase legado/rollback
```

## Pré-requisitos

- Node.js 20 LTS (Node 22 pode funcionar, mas o projeto declara Node 20).
- Projeto Supabase.
- Live Server ou outro servidor estático na porta 5500.
- Conta Mercado Pago com aplicação e chave PIX, se usar PIX.

## Configuração rápida (Supabase)

### 1. Banco

Aplique, na ordem, todas as migrations de `supabase/migrations/`:

1. `20260716180000_init_schema.sql`
2. `20260716180100_rls_policies.sql`
3. `20260716180200_auth_bootstrap.sql`
4. `20260716180300_realtime_replica_identity.sql`
5. `20260716180400_realtime_publication.sql`

Pelo CLI, após `supabase link --project-ref SEU_PROJECT_REF`:

```bash
supabase db push
```

Em projeto onde o schema foi criado manualmente, rode apenas as migrations ainda não aplicadas pelo SQL Editor. Veja [supabase/README.md](./supabase/README.md).

### 2. API

```bash
cd helivi-api
npm install
```

Copie `.env.example` para `.env.local` e preencha:

```env
PORT=8787
NODE_ENV=development
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=CHAVE_ANON
SUPABASE_SERVICE_ROLE_KEY=CHAVE_SERVICE_ROLE
PIX_WEBHOOK_SECRET=UM_SEGREDO_FORTE
CORS_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
```

A `service_role` é exclusiva da API. Nunca a coloque em HTML, `js/config.js` ou Git.

Execute:

```bash
npm run test:smoke
npm run dev
```

Teste: `http://127.0.0.1:8787/health`.

### 3. Frontend

Copie `js/config.example.js` para `js/config.js`:

```js
window.HELIVI_CONFIG = {
  dataBackend: 'supabase',
  supabaseUrl: 'https://SEU_PROJETO.supabase.co',
  supabaseAnonKey: 'CHAVE_ANON',
  apiBaseUrl: 'http://127.0.0.1:8787',
};
window.HELIVI_DATA_BACKEND = window.HELIVI_CONFIG.dataBackend;
```

`js/config.js` aceita a chave pública `anon`, mas nunca `service_role`. O arquivo é ignorado pelo Git para permitir configurações por ambiente.

Abra a raiz com Live Server em `http://127.0.0.1:5500`. No console devem aparecer:

```text
[HELIVI] Supabase client pronto
[HELIVI] data layer ativo — backend: supabase
```

### 4. Primeiro usuário

Crie um usuário em Supabase Dashboard → Authentication → Users. A migration de Auth cria automaticamente a row em `public.usuarios` com `role=admin` e `owner_uid=id`.

Entre no PDV com esse e-mail/senha. Colaboradores seguintes podem ser criados na tela **Colaboradores**.

## Teste manual recomendado

1. Login/logout.
2. Criar, editar e excluir produto (uma alteração por clique e atualização sem F5).
3. Criar colaborador e confirmar que aparece sem F5.
4. Criar comanda, adicionar itens e enviar ao KDS.
5. Abrir Cozinha e Balcão e validar Realtime.
6. Configurar gateway PIX; confirmar o selo verde do gateway ativo.
7. Gerar QR PIX; cancelar; confirmar cancelamento no gateway e que é possível gerar novamente.
8. Finalizar venda e conferir histórico/lucro.
9. Testar dois estabelecimentos para validar isolamento RLS.

## Pagamentos

As credenciais são inseridas em **Configurações → Pagamento PIX** e persistidas em `segredos_pagamento`, legível somente pela API com `service_role`.

- Mercado Pago: Access Token `APP_USR-`; token `TEST-` não é aceito pelo fluxo `/v1/orders`.
- Produção MP exige uma chave PIX cadastrada na conta.
- Ao cancelar o QR, a API chama `/v1/orders/{order_id}/cancel`, limpa os campos PIX da comanda e libera nova tentativa.
- O `external_reference` usa o UUID da comanda sem hífens (máximo de 64 caracteres).

Detalhes: [GUIA_CONFIGURACAO_FINAL.md](./GUIA_CONFIGURACAO_FINAL.md).

## Segurança

Nunca versione:

- `.env`, `.env.local`, `js/config.js` com dados de ambiente;
- `SUPABASE_SERVICE_ROLE_KEY`;
- Access Tokens, Client Secrets ou `PIX_WEBHOOK_SECRET`;
- certificados `.pem`/`.p12`.

RLS isola cada estabelecimento por `owner_uid`. O backend valida JWT, perfil administrativo e tenant antes de operações privilegiadas.

## Firebase legado

Para rollback, altere `dataBackend` para `firebase` e siga [helivi-functions/GUIA_FUNCTIONS.md](./helivi-functions/GUIA_FUNCTIONS.md). Os emuladores Firebase só são ativados em localhost quando o backend selecionado é Firebase.

## Documentação

- [GUIA_TECNICO_PROJETO.md](./GUIA_TECNICO_PROJETO.md) — arquitetura e contratos.
- [GUIA_CONFIGURACAO_FINAL.md](./GUIA_CONFIGURACAO_FINAL.md) — PIX, Point e webhook.
- [CHECKLIST.md](./CHECKLIST.md) — validação operacional.
- [supabase/README.md](./supabase/README.md) — migrations, RLS e Realtime.
- [helivi-api/README.md](./helivi-api/README.md) — API e rotas.
- [MIGRACAO_SUPABASE.md](./MIGRACAO_SUPABASE.md) — histórico da migração.
- [docs/RUNBOOK_CUTOVER_SUPABASE.md](./docs/RUNBOOK_CUTOVER_SUPABASE.md) — cutover e rollback.

Projeto privado — HELIVI.
