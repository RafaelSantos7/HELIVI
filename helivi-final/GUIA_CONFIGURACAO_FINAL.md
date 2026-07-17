# Configuração do HELIVI — Supabase, API e pagamentos

Guia prático para configurar um ambiente local ou de produção. O caminho atual usa Supabase + `helivi-api`; Firebase Functions é legado/rollback.

## 1. Criar o projeto Supabase

1. Crie um projeto em https://supabase.com/dashboard.
2. Guarde a senha do banco.
3. Em Project Settings → API, copie:
   - Project URL;
   - chave `anon`/publishable;
   - chave `service_role`/secret.
4. Data API deve estar habilitada e RLS automático é recomendado.

A `anon` pode ir ao frontend. A `service_role` nunca pode ir ao navegador.

## 2. Aplicar migrations

Aplique na ordem:

```text
20260716180000_init_schema.sql
20260716180100_rls_policies.sql
20260716180200_auth_bootstrap.sql
20260716180300_realtime_replica_identity.sql
20260716180400_realtime_publication.sql
```

Consulte [supabase/README.md](./supabase/README.md) para CLI, SQL Editor e validações.

## 3. Configurar e iniciar a API

```bash
cd helivi-api
npm install
```

Copie `.env.example` para `.env.local` e preencha URL, anon e service role. Exemplo:

```env
PORT=8787
NODE_ENV=development
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=CHAVE_ANON
SUPABASE_SERVICE_ROLE_KEY=CHAVE_SERVICE_ROLE
PIX_WEBHOOK_SECRET=SEGREDO_ALEATORIO_FORTE
CORS_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
EFI_AMBIENTE=homolog
```

Execute:

```bash
npm run test:smoke
npm run dev
```

Abra `http://127.0.0.1:8787/health`. `Cannot GET /` na raiz é normal; use `/health`.

## 4. Configurar o frontend

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

Abra a raiz com Live Server na porta 5500. O console deve indicar backend Supabase. Em modo Supabase, os emuladores Firebase de `:8080`/`:9099` não são usados.

## 5. Criar o administrador

No Supabase Dashboard → Authentication → Users, crie um usuário e confirme o e-mail. O trigger `handle_new_user` cria o perfil admin em `public.usuarios`.

Teste a API com o JWT em `GET /me`. Depois faça login pelo `index.html`.

## 6. Mercado Pago PIX (recomendado)

### Requisitos

- Conta Mercado Pago.
- Aplicação em Mercado Pago Developers.
- Access Token começando com `APP_USR-`.
- Chave PIX cadastrada na conta para produção.

Token `TEST-` não funciona no endpoint `/v1/orders` usado pelo HELIVI.

### Produção

1. Entre como admin.
2. Abra Configurações → Pagamento PIX.
3. Selecione Mercado Pago.
4. Cole o Access Token de produção.
5. Deixe Modo teste desmarcado.
6. Salve.
7. Confirme o selo verde **Mercado Pago ativo**.

### Sandbox

1. Crie um vendedor de teste no painel Mercado Pago.
2. Obtenha o `APP_USR-` desse vendedor.
3. Em opções avançadas, cole em Token Sandbox.
4. Marque Modo teste e salve.

Não misture token de produção com Modo teste.

### Fluxo técnico

- Criar: `POST /pagamentos/pix` → MP `POST /v1/orders`.
- Verificar: `POST /pagamentos/pix/verificar`.
- Cancelar: `POST /pagamentos/pix/cancelar` → MP `POST /v1/orders/{order_id}/cancel`.
- O `external_reference` é derivado da comanda sem hífens e limitado a 64 caracteres.
- Cancelar limpa o estado da comanda e permite gerar novo QR.

## 7. Efi Bank (alternativa)

Na tela Configurações, selecione Efi Bank e informe Client ID, Client Secret e chave PIX. O selo muda para **Efi Bank ativo** após salvar.

A Efi exige certificado mTLS `.pem`. Defina o diretório pelo ambiente da API (`EFI_CERT_DIR`) ou mantenha a localização configurada no projeto. Em produção, prefira secret manager/volume seguro. Nunca versione o certificado.

## 8. Mercado Pago Point

Em Configurações → Maquininha:

1. Selecione Mercado Pago Point.
2. Informe o Device ID do terminal.
3. Informe o token Point ou deixe vazio para reutilizar o token de produção PIX.
4. Salve e teste débito/crédito.

O PDV permite criar, verificar e cancelar Payment Intent.

## 9. Webhook

Configure no gateway uma URL pública HTTPS:

```text
https://SUA_API/webhooks/pix?gateway=mercadopago&secret=SEU_SECRET&owner=OWNER_UUID
```

Para Efi, troque `gateway=efi`. O `owner` é o UUID da conta principal do estabelecimento.

Regras:

- o secret da URL deve ser igual a `PIX_WEBHOOK_SECRET` da API;
- use HTTPS;
- não compartilhe a URL completa em logs públicos;
- a API revalida o pagamento no gateway antes de marcar como pago.

## 10. Teste local completo

Com a API e Live Server ativos:

1. Login.
2. CRUD de produto sem duplicação e sem F5.
3. CRUD de colaborador sem F5.
4. Comanda e KDS em duas abas.
5. Salvar gateway e observar selo verde.
6. Gerar QR PIX.
7. Cancelar QR; confirmar no log da API `Order cancelada` e gerar outro QR.
8. Pagar/testar sandbox e verificar atualização da comanda.
9. Conferir histórico e lucro.

## 11. Solução de problemas

### `/me`: permission denied for table usuarios

Aplique a migration `20260716180100_rls_policies.sql`, que contém GRANT explícito para `service_role`.

### Produto/colaborador só aparece após F5

Aplique `20260716180300_realtime_replica_identity.sql` e `20260716180400_realtime_publication.sql`. O frontend também possui refresh local após CRUD.

### `localhost:9099` recusou conexão

Confirme que `js/config.js` está carregado e contém `dataBackend: 'supabase'`. Os emuladores só devem ligar no modo Firebase.

### Mercado Pago retorna HTTP 400

Leia o detalhe no terminal da API. Causas comuns: token/ambiente incompatível, conta sem chave PIX ou payload inválido. O HELIVI já limita `external_reference` a 64 caracteres.

### Botão Finalizar trava após cancelar PIX

Atualize o frontend/API. O fluxo atual chama `/pagamentos/pix/cancelar`, limpa timers/estado e reabilita o botão.

### CORS / Failed to fetch

Confirme API em `:8787`, Live Server em origem listada em `CORS_ORIGINS` e `apiBaseUrl` correto.

## 12. Produção

- Hospede `helivi-api` em serviço Node 20 com HTTPS.
- Configure envs em secret manager; não envie `.env.local`.
- Publique frontend com `apiBaseUrl` HTTPS e `dataBackend='supabase'`.
- Configure webhooks.
- Execute o checklist e o runbook antes do cutover.

Veja [CHECKLIST.md](./CHECKLIST.md) e [docs/RUNBOOK_CUTOVER_SUPABASE.md](./docs/RUNBOOK_CUTOVER_SUPABASE.md).
