-- verify.sql (SELECT-only) — TopoCAD
-- 1) RLS por tabela
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by c.relname;

-- 2) Tabelas esperadas que faltam (deve retornar 0 linhas)
select e.t as tabela_faltando
from unnest(array['profiles','projects','project_vertices','project_files','processing_jobs','usage','subscriptions','audit_logs','app_settings','admin_audit_log']) as e(t)
left join pg_class c on c.relname = e.t and c.relnamespace = 'public'::regnamespace
where c.oid is null;

-- 3) Políticas
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname in ('public','storage') order by tablename, policyname;

-- 4) Tabelas administrativas NÃO podem ser acessíveis a anon/authenticated (deve retornar 0 linhas)
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('admin_users','admin_login_attempts','audit_logs','admin_audit_log')
  and grantee in ('anon','authenticated');

-- 5) Contagens
select 'app_settings' as table_name, count(*)::bigint as row_count from public.app_settings
union all select 'profiles', count(*) from public.profiles
union all select 'projects', count(*) from public.projects
union all select 'projects_draft', count(*) from public.projects where status = 'draft'
union all select 'projects_error', count(*) from public.projects where status = 'error'
union all select 'project_vertices', count(*) from public.project_vertices;

-- 6) Colunas de profiles
select column_name, data_type, is_nullable from information_schema.columns
where table_schema='public' and table_name='profiles'
  and column_name in ('user_id','email','full_name','role','plan','bonus_credits','can_create_memorials','can_delete_memorials')
order by column_name;

-- 7) Legado (só existe se 002 foi aplicado): admins e tentativas
select to_regclass('public.admin_users') as admin_users, to_regclass('public.admin_login_attempts') as admin_login_attempts;
