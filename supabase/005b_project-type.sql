-- 005b_project-type.sql (antes 005_project-type.sql; renomeado para não colidir com
-- 005_vertices_codigo_repetido.sql). Idempotente. Rode depois do 005.
begin;

alter table public.projects
  add column if not exists memorial_type text not null default 'coordenadas'
    check (memorial_type in ('coordenadas', 'azimute')),
  add column if not exists planta_path text,
  add column if not exists datum text,
  add column if not exists utm_zone smallint,
  add column if not exists hemisphere char(1)
    check (hemisphere in ('S', 'N')),
  add column if not exists anchor_source text
    check (anchor_source in ('base_fundiaria', 'manual', 'mapa'));

comment on column public.projects.memorial_type is
  'Tipo de memorial enviado: coordenadas ou azimute.';
comment on column public.projects.planta_path is
  'Caminho no Storage do PDF da planta do lote, usado em memoriais por azimute.';
comment on column public.projects.datum is
  'Datum das coordenadas do projeto; valores previstos: SIRGAS2000, WGS84 ou SAD69.';
comment on column public.projects.utm_zone is
  'Fuso UTM do projeto. O schema base já define esta coluna como text (por exemplo, 23S); o tipo existente é preservado para manter compatibilidade.';
comment on column public.projects.hemisphere is
  'Hemisfério das coordenadas UTM: S ou N.';
comment on column public.projects.anchor_source is
  'Origem do ponto de amarração: base_fundiaria, manual ou mapa.';

-- O acesso por plano (memorial_azimute, export_kml) fica em app_settings,
-- chave 'feature_access', criada pelo 006_feature_access.sql.

commit;
