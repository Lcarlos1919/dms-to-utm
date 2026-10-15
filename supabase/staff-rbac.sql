-- TopoCAD: estrutura opcional de auditoria para ações do Staff RBAC.
-- Execute manualmente no Supabase SQL Editor.

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id text not null,
  target_user_id text,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_actor_created_idx
  on public.admin_audit_log (actor_id, created_at desc);
create index if not exists admin_audit_log_action_created_idx
  on public.admin_audit_log (action, created_at desc);

alter table public.admin_audit_log enable row level security;
drop policy if exists "admin audit service role only" on public.admin_audit_log;
create policy "admin audit service role only"
  on public.admin_audit_log for all to service_role
  using (true) with check (true);
revoke all on public.admin_audit_log from anon, authenticated;
grant all on public.admin_audit_log to service_role;
grant usage, select on sequence public.admin_audit_log_id_seq to service_role;

notify pgrst, 'reload schema';
