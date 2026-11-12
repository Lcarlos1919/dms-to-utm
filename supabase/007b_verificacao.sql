-- =====================================================================
-- 007b_verificacao.sql (v2) - só leitura, UMA consulta (o SQL Editor mostra
-- apenas o último resultado, por isso as quatro conferências vêm juntas).
-- Funciona com a tabela do 007 atual (colunas nome_imovel, source_id, base_date...).
-- Esperado:
--   total_lotes      -> ~114256 lotes; base de 2026-10-29
--   lote139          -> 1ª linha: gleba 02A, 4 vertices, area_oficial 35.5075
--   acento_quebrado  -> 0
--   acesso_navegador -> nenhum
-- =====================================================================
select 'total_lotes' as verificacao,
       count(*)::text || ' lotes; base de ' || coalesce(max(base_date)::text, '-') as resultado
  from public.fundiario_lotes

union all
select 'lote139',
       'gleba=' || coalesce(gleba, '-') || ' lote=' || coalesce(lote, '-') ||
       ' nome=' || coalesce(nome_imovel, '-') || ' vertices=' || coalesce(n_vertices::text, '-') ||
       ' area_oficial=' || coalesce(area_ha_oficial::text, '-') ||
       ' gleba_confere=' || gleba_confere
  from public.buscar_lote('BOM PRINC', '02A', '139A-REM', 3)

union all
select 'acento_quebrado', count(*)::text
  from public.fundiario_lotes
 where nome_imovel ~ ('[ÃÂ][^OEÕ ]|[' || chr(128) || '-' || chr(159) || ']')
    or projeto     ~ ('[ÃÂ][^OEÕ ]|[' || chr(128) || '-' || chr(159) || ']')

union all
select 'acesso_navegador',
       case when count(*) = 0 then 'nenhum' else 'ATENCAO: ' || string_agg(grantee || ':' || privilege_type, ', ') end
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'fundiario_lotes'
   and grantee in ('anon', 'authenticated', 'PUBLIC');
