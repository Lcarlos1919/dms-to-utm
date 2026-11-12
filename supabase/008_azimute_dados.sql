-- =====================================================================
-- 008_azimute_dados.sql  (pode rodar mais de uma vez)
-- Guarda, no projeto do tipo "azimute", o resultado da leitura do memorial
-- e da revisão feita pelo usuário (tabela de segmentos, cabeçalho, relatório).
--
--   azimute_status : pendente -> lido -> revisado   (ou erro_leitura)
--   azimute_dados  : JSON com cabeçalho, segmentos, dados da planta e fuso
--
-- NÃO guarda o texto completo do PDF nem o nome do proprietário.
-- Não mexe em políticas de segurança: valem as da tabela projects.
-- Rode ANTES do prompt D1 do v0.
-- =====================================================================
alter table public.projects
  add column if not exists azimute_status text not null default 'pendente',
  add column if not exists azimute_dados  jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'azimute_status_valido') then
    alter table public.projects
      add constraint azimute_status_valido
      check (azimute_status in ('pendente', 'lido', 'revisado', 'erro_leitura'));
  end if;
end $$;

-- Conferência (uma consulta): deve listar as 2 colunas novas
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'projects'
   and column_name in ('azimute_status', 'azimute_dados')
 order by column_name;
