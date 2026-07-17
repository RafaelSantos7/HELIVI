-- HELIVI — bootstrap Auth
-- Signup self-service → admin do próprio uid.
-- createUser via Admin API com user_metadata.owner_uid ≠ → colaborador do tenant.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_nome text;
  v_role text;
begin
  v_nome := coalesce(new.raw_user_meta_data->>'nome', split_part(coalesce(new.email, ''), '@', 1), '');

  if new.raw_user_meta_data ? 'owner_uid'
     and (new.raw_user_meta_data->>'owner_uid') ~ '^[0-9a-fA-F-]{36}$'
     and (new.raw_user_meta_data->>'owner_uid')::uuid is distinct from new.id then
    -- Colaborador criado pela API
    v_owner := (new.raw_user_meta_data->>'owner_uid')::uuid;
    v_role := coalesce(new.raw_user_meta_data->>'role', 'atendente');
    if v_role not in ('admin', 'atendente', 'caixa', 'cozinha', 'balcao') then
      v_role := 'atendente';
    end if;
  else
    -- Conta principal (signup)
    v_owner := new.id;
    v_role := 'admin';
  end if;

  insert into public.usuarios (id, owner_uid, nome, email, role, ativo)
  values (new.id, v_owner, v_nome, coalesce(new.email, ''), v_role, true)
  on conflict (id) do update set
    owner_uid = excluded.owner_uid,
    nome = excluded.nome,
    email = excluded.email,
    role = excluded.role,
    atualizado_em = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
