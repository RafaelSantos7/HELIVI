-- HELIVI — schema inicial Postgres (Fase 3)
-- IDs: uuid nativos; owner_uid = tenant (conta admin do estabelecimento).
-- Conta principal SEMPRE tem row em usuarios (role=admin, owner_uid=id).

create extension if not exists "pgcrypto";

-- ── Enums via CHECK (evita drift de enum type entre ambientes) ─────────────

create table public.usuarios (
  id          uuid primary key references auth.users (id) on delete cascade,
  owner_uid   uuid not null,
  nome        text not null default '',
  email       text not null,
  role        text not null default 'atendente'
                check (role in ('admin', 'atendente', 'caixa', 'cozinha', 'balcao')),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint usuarios_owner_fk foreign key (owner_uid) references public.usuarios (id) deferrable initially deferred
);

-- Conta principal: owner_uid = id. Colaboradores: owner_uid = id do admin.
comment on table public.usuarios is 'Perfil PDV; 1:1 com auth.users. Tenant = owner_uid.';

create index usuarios_owner_uid_idx on public.usuarios (owner_uid);
create index usuarios_email_idx on public.usuarios (email);

create table public.produtos (
  id          uuid primary key default gen_random_uuid(),
  owner_uid   uuid not null references public.usuarios (id),
  nome        text not null,
  categoria   text not null default 'Outros',
  preco       numeric(12,2) not null default 0 check (preco >= 0),
  custo       numeric(12,2) not null default 0 check (custo >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  legacy_id   text unique
);

create index produtos_owner_uid_idx on public.produtos (owner_uid);
create index produtos_owner_cat_idx on public.produtos (owner_uid, categoria);

create table public.comandas (
  id                uuid primary key default gen_random_uuid(),
  owner_uid         uuid not null references public.usuarios (id),
  criador_uid       uuid references public.usuarios (id),
  atendente         text,
  atendente_email   text,
  cliente           text default '',
  mesa              text default '',
  obs               text default '',
  itens             jsonb not null default '[]'::jsonb,
  status            text not null default 'aberta'
                      check (status in ('aberta', 'fechada', 'cancelada')),
  pagamento         text,
  total             numeric(12,2),
  -- PIX
  pix_txid          text,
  pix_gateway       text,
  pix_mp_order_id   text,
  pix_valor         numeric(12,2),
  pix_qr_code       text,
  pix_copia_e_cola  text,
  pix_gerado_em     timestamptz,
  pix_validade_em   timestamptz,
  pix_confirmado_em timestamptz,
  -- Cartão / Point
  cartao_intent_id  text,
  cartao_maquininha text,
  cartao_device_id  text,
  cartao_tipo       text,
  cartao_valor      numeric(12,2),
  cartao_gerado_em  timestamptz,
  cartao_confirmado_em timestamptz,
  cartao_payment_id text,
  cartao_cancelado_em timestamptz,
  status_pagamento  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  fechado_em        timestamptz,
  legacy_id         text unique,
  constraint comandas_itens_array check (jsonb_typeof(itens) = 'array')
);

create index comandas_owner_created_idx on public.comandas (owner_uid, created_at desc);
create index comandas_owner_status_idx on public.comandas (owner_uid, status);
create index comandas_pix_txid_idx on public.comandas (pix_txid) where pix_txid is not null;
create index comandas_cartao_intent_idx on public.comandas (cartao_intent_id) where cartao_intent_id is not null;

create table public.pedidos (
  id              uuid primary key default gen_random_uuid(),
  owner_uid       uuid not null references public.usuarios (id),
  criador_uid     uuid references public.usuarios (id),
  atendente       text,
  atendente_email text,
  cliente         text default '',
  mesa            text default '',
  obs_geral       text default '',
  itens           jsonb not null default '[]'::jsonb,
  total           numeric(12,2) not null default 0,
  lucro           numeric(12,2) not null default 0,
  pagamento       text,
  cartao1         numeric(12,2),
  cartao2         numeric(12,2),
  numero_pedido   integer not null,
  status          text not null default 'pago' check (status in ('pago')),
  comanda_id      uuid references public.comandas (id),
  created_at      timestamptz not null default now(),
  legacy_id       text unique,
  constraint pedidos_itens_array check (jsonb_typeof(itens) = 'array')
);

create index pedidos_owner_created_idx on public.pedidos (owner_uid, created_at desc);
create index pedidos_owner_numero_idx on public.pedidos (owner_uid, numero_pedido);

create table public.kds_cozinha (
  id              uuid primary key default gen_random_uuid(),
  owner_uid       uuid not null references public.usuarios (id),
  criador_uid     uuid references public.usuarios (id),
  atendente       text,
  pedido_id       uuid references public.pedidos (id),
  comanda_id      uuid references public.comandas (id),
  numero_pedido   integer,
  cliente         text default '',
  mesa            text default '',
  obs_geral       text default '',
  itens           jsonb not null default '[]'::jsonb,
  status          text not null default 'novo'
                    check (status in ('novo', 'preparando', 'pronto')),
  status_at_preparando timestamptz,
  status_at_pronto     timestamptz,
  created_at      timestamptz not null default now(),
  legacy_id       text unique,
  constraint kds_cozinha_itens_array check (jsonb_typeof(itens) = 'array')
);

create index kds_cozinha_owner_created_idx on public.kds_cozinha (owner_uid, created_at desc);
create index kds_cozinha_owner_status_idx on public.kds_cozinha (owner_uid, status);

create table public.kds_balcao (
  id              uuid primary key default gen_random_uuid(),
  owner_uid       uuid not null references public.usuarios (id),
  criador_uid     uuid references public.usuarios (id),
  atendente       text,
  pedido_id       uuid references public.pedidos (id),
  comanda_id      uuid references public.comandas (id),
  numero_pedido   integer,
  cliente         text default '',
  mesa            text default '',
  obs_geral       text default '',
  itens           jsonb not null default '[]'::jsonb,
  status          text not null default 'novo'
                    check (status in ('novo', 'preparando', 'pronto', 'entregue')),
  status_at_preparando timestamptz,
  status_at_pronto     timestamptz,
  status_at_entregue   timestamptz,
  created_at      timestamptz not null default now(),
  legacy_id       text unique,
  constraint kds_balcao_itens_array check (jsonb_typeof(itens) = 'array')
);

create index kds_balcao_owner_created_idx on public.kds_balcao (owner_uid, created_at desc);
create index kds_balcao_owner_status_idx on public.kds_balcao (owner_uid, status);

-- Contador atômico por estabelecimento
create table public.contadores (
  owner_uid uuid primary key references public.usuarios (id),
  ultimo    integer not null default 0 check (ultimo >= 0)
);

-- Flags públicas de pagamento (por tenant) — SEM tokens
create table public.configuracoes_pagamentos (
  owner_uid           uuid primary key references public.usuarios (id),
  gateway_ativo       text not null default 'mercadopago'
                        check (gateway_ativo in ('efi', 'mercadopago')),
  efi_configurado     boolean not null default false,
  mp_configurado      boolean not null default false,
  mp_ambiente_teste   boolean not null default false,
  maquininha_ativa    text not null default ''
                        check (maquininha_ativa in ('', 'mercadopago_point')),
  mp_point_device_id  text not null default '',
  mp_point_configurado boolean not null default false,
  atualizado_em       timestamptz not null default now()
);

-- Segredos: NUNCA conceder a anon/authenticated (só service_role)
create table public.segredos_pagamento (
  owner_uid                 uuid primary key references public.usuarios (id),
  efi_client_id             text,
  efi_client_secret         text,
  efi_pix_key               text,
  mp_access_token_producao  text,
  mp_access_token_sandbox   text,
  mp_usar_payer_sandbox_doc boolean default false,
  mp_ambiente_teste         boolean default false,
  mp_point_device_id        text,
  mp_point_access_token     text,
  atualizado_em             timestamptz not null default now()
);

create table public.pagamentos_pix (
  txid               text primary key,
  owner_uid          uuid references public.usuarios (id),
  valor              numeric(12,2) not null,
  cpf_pagador        text,
  horario_pagamento  text,
  confirmado_em      timestamptz not null default now(),
  status             text not null default 'confirmado',
  gateway            text,
  comanda_id         uuid references public.comandas (id)
);

create index pagamentos_pix_owner_idx on public.pagamentos_pix (owner_uid);

-- Mapa de IDs Firebase → Supabase (usado na Fase 7)
create table public.id_map (
  entidade     text not null,
  firebase_id  text not null,
  supabase_id  uuid not null,
  created_at   timestamptz not null default now(),
  primary key (entidade, firebase_id)
);

-- ── RPC: próximo número de pedido (atômico) ───────────────────────────────

create or replace function public.next_pedido_number(p_owner_uid uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prox integer;
begin
  if p_owner_uid is null then
    raise exception 'owner_uid obrigatório';
  end if;

  -- Só o próprio tenant (ou service_role sem auth.uid) pode avançar o contador
  if auth.uid() is not null then
    if public.current_owner_uid() is distinct from p_owner_uid then
      raise exception 'permission denied for next_pedido_number';
    end if;
  end if;

  insert into public.contadores (owner_uid, ultimo)
  values (p_owner_uid, 1)
  on conflict (owner_uid) do update
    set ultimo = public.contadores.ultimo + 1
  returning ultimo into v_prox;

  return v_prox;
end;
$$;

-- Helpers de identidade (usados por RLS e pela RPC acima
-- Definidos aqui; RLS na migration seguinte depende deles.

create or replace function public.current_owner_uid()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.owner_uid from public.usuarios u where u.id = auth.uid() and u.ativo is not false),
    auth.uid()
  );
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.role from public.usuarios u where u.id = auth.uid() and u.ativo is not false;
$$;

create or replace function public.is_tenant_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'admin';
$$;

revoke all on function public.next_pedido_number(uuid) from public;
grant execute on function public.next_pedido_number(uuid) to authenticated;
grant execute on function public.current_owner_uid() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_tenant_admin() to authenticated;

-- Realtime (Fase 5): publicação das tabelas críticas (ambiente Supabase)
do $$
begin
  alter publication supabase_realtime add table public.comandas;
  alter publication supabase_realtime add table public.kds_cozinha;
  alter publication supabase_realtime add table public.kds_balcao;
exception
  when undefined_object then
    raise notice 'publicação supabase_realtime ausente — Realtime será configurado no projeto Supabase';
  when duplicate_object then
    null;
end $$;
