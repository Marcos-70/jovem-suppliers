-- Novo papel: inspector. Ficheiro separado porque um valor novo de enum só pode ser usado depois do commit.
alter type public.app_role add value if not exists 'inspector';
