-- =====================================================================
-- 006_feature_access.sql  (pode rodar mais de uma vez; não sobrescreve nada)
-- Cria, em app_settings, as duas linhas de configuração:
--   feature_access   -> quais ferramentas cada plano pode usar
--   fundiario_config -> como o sistema escolhe entre a base no Supabase
--                       e o GeoPortal ao vivo ("auto", "banco" ou "geoportal")
-- Depois de rodar, o resultado mostra as duas linhas.
-- =====================================================================
insert into public.app_settings (key, value, updated_at)
select 'feature_access',
       '{"memorial_azimute":{"free":false,"pro":false},"export_kml":{"free":true,"pro":true}}',
       now()
 where not exists (select 1 from public.app_settings where key = 'feature_access');

insert into public.app_settings (key, value, updated_at)
select 'fundiario_config',
       '{"preferencia":"auto","timeout_ms":8000}',
       now()
 where not exists (select 1 from public.app_settings where key = 'fundiario_config');

select key, value
  from public.app_settings
 where key in ('feature_access', 'fundiario_config')
 order by key;
