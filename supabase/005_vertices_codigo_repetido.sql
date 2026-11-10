-- 005: permite códigos de vértice repetidos no mesmo projeto (a ordem é dada por seq).
-- Execute em bancos que já aplicaram a 001 antiga. Idempotente.
alter table public.project_vertices drop constraint if exists project_vertices_project_id_code_key;
