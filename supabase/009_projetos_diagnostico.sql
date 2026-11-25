-- =====================================================================
-- 009_projetos_diagnostico.sql  (pode rodar mais de uma vez)
-- Guarda, em cada projeto, o diagnóstico técnico do processamento
-- (eventos por etapa: download, OCR, motor, detecção de azimute e erro).
-- Aparece no admin em Projetos > detalhes > "Diagnóstico técnico".
--
-- Não guarda o texto do PDF nem chaves de API.
-- Não mexe em políticas: valem as da tabela projects.
-- Rode no SQL Editor do Supabase.
-- =====================================================================
alter table public.projects
  add column if not exists diagnostico jsonb;
