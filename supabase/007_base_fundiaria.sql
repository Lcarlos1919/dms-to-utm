-- =====================================================================
-- 007_base_fundiaria.sql
-- Vertix: base fundiaria (lotes da SEDAM/RO) para ancorar memoriais
-- por azimute. So as colunas necessarias; sem nome de proprietario.
--
-- Execute no Supabase > SQL Editor ANTES de rodar o importador.
-- E seguro rodar mais de uma vez (nao apaga dados ja importados).
--
-- Sem PostGIS de proposito: a busca e por nome, gleba e lote; a geometria
-- fica em JSON (graus, SIRGAS 2000) com a caixa delimitadora em colunas.
--
-- Seguranca: a tabela tem RLS ligada e NENHUMA politica, e o acesso do
-- navegador (anon e authenticated) e revogado. So o servidor do Vertix,
-- com a chave de servico (service_role), le a base.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Normalizacao de texto (sem acento, maiuscula, espacos limpos)
--    Usada na tabela e na busca, para as duas lados serem iguais.
-- ---------------------------------------------------------------------
create or replace function public.fundiario_norm(t text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(regexp_replace(
      upper(translate(
        coalesce(t, ''),
        'áàâãäÁÀÂÃÄéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
        'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'
      )),
      '\s+', ' ', 'g'
    )),
    ''
  );
$$;

-- ---------------------------------------------------------------------
-- 2) Tabela
-- ---------------------------------------------------------------------
create table if not exists public.fundiario_lotes (
  id               bigserial primary key,
  source_id        text not null unique,        -- id da feicao no WFS da SEDAM
  nome_imovel      text,                        -- ex.: GLEBA BOM PRINCIPIO
  gleba            text,                        -- ex.: 02A
  lote             text,                        -- ex.: 139
  setor            text,
  nome_setor       text,
  projeto          text,
  area_ha_oficial  numeric,                     -- area "oficial" da base (nao use para validar geometria)
  geom             jsonb not null,              -- GeoJSON Polygon/MultiPolygon, graus SIRGAS 2000
  n_vertices       integer,
  min_lon          double precision,
  min_lat          double precision,
  max_lon          double precision,
  max_lat          double precision,
  nome_norm        text generated always as (public.fundiario_norm(nome_imovel)) stored,
  gleba_norm       text generated always as (public.fundiario_norm(gleba)) stored,
  lote_norm        text generated always as (public.fundiario_norm(lote)) stored,
  base_date        date,                        -- data da copia da base (informada na importacao)
  loaded_at        timestamptz not null default now()
);

create index if not exists fundiario_lotes_lote_norm_idx
  on public.fundiario_lotes (lote_norm);
create index if not exists fundiario_lotes_bbox_idx
  on public.fundiario_lotes (min_lon, max_lon, min_lat, max_lat);

-- ---------------------------------------------------------------------
-- 3) Seguranca: so o servidor (service_role) acessa
-- ---------------------------------------------------------------------
alter table public.fundiario_lotes enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.fundiario_lotes from anon';
    execute 'revoke all on sequence public.fundiario_lotes_id_seq from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.fundiario_lotes from authenticated';
    execute 'revoke all on sequence public.fundiario_lotes_id_seq from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on public.fundiario_lotes to service_role';
    execute 'grant all on sequence public.fundiario_lotes_id_seq to service_role';
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 4) Busca do lote
--    p_nome  : parte do nome da gleba/imovel (ex.: 'BOM PRINC')
--    p_gleba : gleba (ex.: '02A'); pode ser nulo
--    p_lote  : lote (ex.: '139' ou '139A-REM'; se nao achar o texto
--              inteiro, tenta so o numero do inicio, ex.: 139)
--    Devolve ate p_limite lotes, os melhores primeiro:
--      gleba_confere e lote_confere dizem o quao exata foi a busca.
-- ---------------------------------------------------------------------
create or replace function public.buscar_lote(
  p_nome   text,
  p_gleba  text default null,
  p_lote   text default null,
  p_limite integer default 20
)
returns table (
  id               bigint,
  source_id        text,
  nome_imovel      text,
  gleba            text,
  lote             text,
  setor            text,
  nome_setor       text,
  projeto          text,
  area_ha_oficial  numeric,
  geom             jsonb,
  n_vertices       integer,
  gleba_confere    boolean,
  lote_confere     boolean,
  base_date        date
)
language sql
stable
as $$
  with q as (
    select public.fundiario_norm(p_nome)  as nome,
           public.fundiario_norm(p_gleba) as gleba,
           public.fundiario_norm(p_lote)  as lote,
           substring(public.fundiario_norm(p_lote) from '^[0-9]+') as lote_num
  )
  select l.id, l.source_id, l.nome_imovel, l.gleba, l.lote, l.setor, l.nome_setor,
         l.projeto, l.area_ha_oficial, l.geom, l.n_vertices,
         (q.gleba is not null and l.gleba_norm = q.gleba) as gleba_confere,
         (l.lote_norm = q.lote)                          as lote_confere,
         l.base_date
    from public.fundiario_lotes l
    cross join q
   where q.nome is not null
     and l.nome_norm like '%' || q.nome || '%'
     and (q.lote is null or l.lote_norm = q.lote or l.lote_norm = q.lote_num)
   order by (q.gleba is not null and l.gleba_norm = q.gleba) desc,
            (l.lote_norm = q.lote) desc,
            l.id
   limit greatest(1, least(coalesce(p_limite, 20), 100));
$$;

do $$
begin
  execute 'revoke all on function public.buscar_lote(text, text, text, integer) from public';
  execute 'revoke all on function public.fundiario_norm(text) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.buscar_lote(text, text, text, integer) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.buscar_lote(text, text, text, integer) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.buscar_lote(text, text, text, integer) to service_role';
    execute 'grant execute on function public.fundiario_norm(text) to service_role';
  end if;
end
$$;
