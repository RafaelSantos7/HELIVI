# Supabase — HELIVI

Este diretório contém o schema versionado do HELIVI. As migrations devem ser aplicadas em ordem cronológica.

## Migrations

1. `20260716180000_init_schema.sql`
   - Cria tabelas, índices, helpers de identidade e RPC `next_pedido_number`.
   - Publica `comandas`, `kds_cozinha` e `kds_balcao` no Realtime.
2. `20260716180100_rls_policies.sql`
   - Ativa RLS e policies por `owner_uid`.
   - Revoga acesso client a `segredos_pagamento` e `id_map`.
   - Concede acesso explícito à `service_role`; bypass de RLS sozinho não substitui privilégios SQL.
3. `20260716180200_auth_bootstrap.sql`
   - Cria `handle_new_user` e o trigger de `auth.users`.
   - Signup comum vira admin do próprio tenant; usuário criado pela API recebe `owner_uid` e perfil informados.
4. `20260716180300_realtime_replica_identity.sql`
   - Define `REPLICA IDENTITY FULL` nas tabelas assinadas pelo frontend.
   - Permite que eventos UPDATE/DELETE filtrados por `owner_uid` contenham as colunas necessárias.
5. `20260716180400_realtime_publication.sql`
   - Adiciona `produtos` e `usuarios` à publicação `supabase_realtime` de forma idempotente.

## Como aplicar

### CLI (recomendado em projeto novo)

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

A CLI solicitará a senha do banco e mostrará a lista antes de aplicar.

### SQL Editor

No Dashboard → SQL Editor, abra cada arquivo e execute na ordem acima. Aguarde sucesso antes do próximo.

Se uma migration falhar com `relation already exists`, o schema provavelmente foi criado parcialmente pelo SQL Editor. Não apague tabelas com dados. Verifique quais objetos já existem e aplique somente os blocos/migrations pendentes.

## Validação após aplicar

No Table Editor devem existir, entre outras:

- `usuarios`, `produtos`, `comandas`, `pedidos`;
- `kds_cozinha`, `kds_balcao`, `contadores`;
- `configuracoes_pagamentos`, `segredos_pagamento`, `pagamentos_pix`, `id_map`.

Confirme no SQL Editor:

```sql
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;
```

Esperado: `comandas`, `kds_balcao`, `kds_cozinha`, `produtos` e `usuarios`.

Confirme o trigger:

```sql
select trigger_name
from information_schema.triggers
where trigger_name = 'on_auth_user_created';
```

## Modelo de tenant

- Conta principal: `usuarios.id = usuarios.owner_uid`, `role='admin'`.
- Colaborador: `owner_uid` aponta para o UUID da conta principal.
- Toda tabela de negócio usa `owner_uid NOT NULL`.
- `criador_uid` identifica o ator que executou a ação; não substitui o tenant.

## RLS e chaves

- `anon`: chave pública usada pelo frontend para Auth/PostgREST sob RLS.
- `authenticated`: acessa apenas linhas permitidas pelas policies.
- `service_role`: usada somente por `helivi-api`; possui GRANT explícito e bypass RLS.
- `segredos_pagamento` e `id_map`: sem acesso para `anon`/`authenticated` e sem policies client.

Nunca coloque `service_role` em `js/config.js`.

## Teste de isolamento

1. Crie admin A e admin B.
2. Como A, crie um produto.
3. Como B, confirme que o produto de A não aparece e não pode ser alterado.
4. Como colaborador não-admin, confirme que `/pagamentos/config` retorna 403.
5. Com JWT client, confirme que `segredos_pagamento` não pode ser lida.

## Realtime e atualização da UI

O frontend assina produtos, usuários, comandas e KDS. Além do Realtime, produtos e colaboradores atualizam o cache local imediatamente após CRUD; isso evita depender da latência do evento e melhora a experiência. O banco continua sendo a fonte da verdade.
