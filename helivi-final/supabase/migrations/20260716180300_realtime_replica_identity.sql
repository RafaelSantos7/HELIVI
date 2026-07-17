-- Realtime: DELETE/UPDATE com filtro owner_uid precisam das colunas no OLD row.
-- Com REPLICA IDENTITY DEFAULT o Postgres só envia a PK no DELETE → filtro não casa e a UI não atualiza.

alter table public.produtos replica identity full;
alter table public.comandas replica identity full;
alter table public.pedidos replica identity full;
alter table public.kds_cozinha replica identity full;
alter table public.kds_balcao replica identity full;
alter table public.usuarios replica identity full;
