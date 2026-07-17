-- HELIVI — completa publicação Realtime usada pelos adapters do frontend.
-- A migration inicial já publica comandas e tabelas KDS.
-- Produtos e usuários também possuem subscriptions em js/data-supabase.js.

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'produtos'
  ) then
    execute 'alter publication supabase_realtime add table public.produtos';
  end if;

  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'usuarios'
  ) then
    execute 'alter publication supabase_realtime add table public.usuarios';
  end if;
end
$$;
