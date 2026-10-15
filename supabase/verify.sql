-- SELECT-only verification queries. Run manually in Supabase SQL Editor.
select table_name, row_security as rls_enabled
from information_schema.tables t
join pg_class c on c.relname = t.table_name
join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.table_schema
where t.table_schema = 'public'
order by table_name;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select 'app_settings' as table_name, count(*)::bigint as row_count from public.app_settings
union all
select 'profiles', count(*)::bigint from public.profiles;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('user_id','email','full_name','role','plan','bonus_credits','can_create_memorials','can_delete_memorials')
order by column_name;
