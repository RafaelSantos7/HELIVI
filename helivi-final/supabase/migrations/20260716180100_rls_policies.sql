-- HELIVI — RLS por estabelecimento (Fase 3)
-- Nenhuma policy USING (true) em tabelas de negócio.
-- Segredos: sem GRANT para anon/authenticated.

-- ── Grants base ───────────────────────────────────────────────────────────

revoke all on table public.segredos_pagamento from anon, authenticated;
revoke all on table public.id_map from anon, authenticated;

grant select, insert, update, delete on table public.usuarios to authenticated;
grant select, insert, update, delete on table public.produtos to authenticated;
grant select, insert, update, delete on table public.comandas to authenticated;
grant select, insert on table public.pedidos to authenticated;
grant select, insert, update on table public.kds_cozinha to authenticated;
grant select, insert, update on table public.kds_balcao to authenticated;
grant select on table public.contadores to authenticated;
grant select, insert, update on table public.configuracoes_pagamentos to authenticated;
grant select on table public.pagamentos_pix to authenticated;

-- Backend (helivi-api): service_role precisa de GRANT explícito (não basta bypass RLS)
grant all on table public.usuarios to service_role;
grant all on table public.produtos to service_role;
grant all on table public.comandas to service_role;
grant all on table public.pedidos to service_role;
grant all on table public.kds_cozinha to service_role;
grant all on table public.kds_balcao to service_role;
grant all on table public.contadores to service_role;
grant all on table public.configuracoes_pagamentos to service_role;
grant all on table public.segredos_pagamento to service_role;
grant all on table public.pagamentos_pix to service_role;
grant all on table public.id_map to service_role;
grant execute on function public.next_pedido_number(uuid) to service_role;

-- ── Enable RLS ────────────────────────────────────────────────────────────

alter table public.usuarios enable row level security;
alter table public.produtos enable row level security;
alter table public.comandas enable row level security;
alter table public.pedidos enable row level security;
alter table public.kds_cozinha enable row level security;
alter table public.kds_balcao enable row level security;
alter table public.contadores enable row level security;
alter table public.configuracoes_pagamentos enable row level security;
alter table public.segredos_pagamento enable row level security;
alter table public.pagamentos_pix enable row level security;
alter table public.id_map enable row level security;

-- ── usuarios ──────────────────────────────────────────────────────────────
-- Leitura: próprio tenant. Escrita: só admin do tenant (CRUD de colaboradores
-- preferencialmente via Edge/API com service role — policies cobrem o mínimo).

create policy usuarios_select_tenant on public.usuarios
  for select to authenticated
  using (owner_uid = public.current_owner_uid() or id = auth.uid());

create policy usuarios_insert_admin on public.usuarios
  for insert to authenticated
  with check (
    (
      public.is_tenant_admin()
      and owner_uid = public.current_owner_uid()
    )
    -- Bootstrap da conta principal (signup): única row self-owned como admin.
    or (
      id = auth.uid()
      and owner_uid = auth.uid()
      and role = 'admin'
      and not exists (select 1 from public.usuarios u where u.id = auth.uid())
    )
  );

create policy usuarios_update_admin on public.usuarios
  for update to authenticated
  using (public.is_tenant_admin() and owner_uid = public.current_owner_uid())
  with check (public.is_tenant_admin() and owner_uid = public.current_owner_uid());

create policy usuarios_delete_admin on public.usuarios
  for delete to authenticated
  using (public.is_tenant_admin() and owner_uid = public.current_owner_uid() and id <> auth.uid());

-- ── produtos ──────────────────────────────────────────────────────────────
-- Leitura/escrita no tenant; cozinha/balcão só leem.

create policy produtos_select_tenant on public.produtos
  for select to authenticated
  using (owner_uid = public.current_owner_uid());

create policy produtos_insert_staff on public.produtos
  for insert to authenticated
  with check (
    owner_uid = public.current_owner_uid()
    and public.current_user_role() in ('admin', 'atendente', 'caixa')
  );

create policy produtos_update_staff on public.produtos
  for update to authenticated
  using (
    owner_uid = public.current_owner_uid()
    and public.current_user_role() in ('admin', 'atendente', 'caixa')
  )
  with check (owner_uid = public.current_owner_uid());

create policy produtos_delete_staff on public.produtos
  for delete to authenticated
  using (
    owner_uid = public.current_owner_uid()
    and public.current_user_role() in ('admin', 'atendente', 'caixa')
  );

-- ── comandas ──────────────────────────────────────────────────────────────

create policy comandas_select_tenant on public.comandas
  for select to authenticated
  using (owner_uid = public.current_owner_uid());

create policy comandas_insert_staff on public.comandas
  for insert to authenticated
  with check (
    owner_uid = public.current_owner_uid()
    and public.current_user_role() in ('admin', 'atendente', 'caixa')
  );

create policy comandas_update_staff on public.comandas
  for update to authenticated
  using (
    owner_uid = public.current_owner_uid()
    and public.current_user_role() in ('admin', 'atendente', 'caixa')
  )
  with check (owner_uid = public.current_owner_uid());

-- ── pedidos ───────────────────────────────────────────────────────────────
-- Insert: staff. Select: admin (histórico/lucro) + staff do dia no PDV.
-- Delete: negado (sem policy).

create policy pedidos_select_tenant on public.pedidos
  for select to authenticated
  using (
    owner_uid = public.current_owner_uid()
    and public.current_user_role() in ('admin', 'atendente', 'caixa')
  );

create policy pedidos_insert_staff on public.pedidos
  for insert to authenticated
  with check (
    owner_uid = public.current_owner_uid()
    and public.current_user_role() in ('admin', 'atendente', 'caixa')
  );

-- ── KDS cozinha ───────────────────────────────────────────────────────────

create policy kds_cozinha_select on public.kds_cozinha
  for select to authenticated
  using (
    owner_uid = public.current_owner_uid()
    and public.current_user_role() in ('admin', 'atendente', 'caixa', 'cozinha')
  );

create policy kds_cozinha_insert on public.kds_cozinha
  for insert to authenticated
  with check (
    owner_uid = public.current_owner_uid()
    and public.current_user_role() in ('admin', 'atendente', 'caixa')
  );

create policy kds_cozinha_update on public.kds_cozinha
  for update to authenticated
  using (
    owner_uid = public.current_owner_uid()
    and public.current_user_role() in ('admin', 'cozinha', 'atendente', 'caixa')
  )
  with check (owner_uid = public.current_owner_uid());

-- ── KDS balcão ────────────────────────────────────────────────────────────

create policy kds_balcao_select on public.kds_balcao
  for select to authenticated
  using (
    owner_uid = public.current_owner_uid()
    and public.current_user_role() in ('admin', 'atendente', 'caixa', 'balcao')
  );

create policy kds_balcao_insert on public.kds_balcao
  for insert to authenticated
  with check (
    owner_uid = public.current_owner_uid()
    and public.current_user_role() in ('admin', 'atendente', 'caixa')
  );

create policy kds_balcao_update on public.kds_balcao
  for update to authenticated
  using (
    owner_uid = public.current_owner_uid()
    and public.current_user_role() in ('admin', 'balcao', 'atendente', 'caixa')
  )
  with check (owner_uid = public.current_owner_uid());

-- ── contadores ────────────────────────────────────────────────────────────
-- Escrita só via RPC next_pedido_number (security definer).

create policy contadores_select_own on public.contadores
  for select to authenticated
  using (owner_uid = public.current_owner_uid());

-- ── configuracoes_pagamentos (flags públicas; SEM tokens) ─────────────────
-- Leitura: tenant. Escrita: só admin (tokens vão para segredos via service role).

create policy config_pag_select on public.configuracoes_pagamentos
  for select to authenticated
  using (owner_uid = public.current_owner_uid());

create policy config_pag_upsert_admin on public.configuracoes_pagamentos
  for insert to authenticated
  with check (public.is_tenant_admin() and owner_uid = public.current_owner_uid());

create policy config_pag_update_admin on public.configuracoes_pagamentos
  for update to authenticated
  using (public.is_tenant_admin() and owner_uid = public.current_owner_uid())
  with check (public.is_tenant_admin() and owner_uid = public.current_owner_uid());

-- ── segredos_pagamento: SEM policies para authenticated/anon ──────────────
-- RLS ligado + revoke = inacessível ao client. Só service_role (backend).

-- ── pagamentos_pix ────────────────────────────────────────────────────────
-- Leitura admin do tenant; escrita só backend (service role).

create policy pagamentos_pix_select_admin on public.pagamentos_pix
  for select to authenticated
  using (
    owner_uid = public.current_owner_uid()
    and public.is_tenant_admin()
  );

-- ── id_map: sem acesso client ─────────────────────────────────────────────
-- RLS on + sem policies + revoke = só service_role.
