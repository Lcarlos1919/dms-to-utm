-- TopoCAD: segurança e painel administrativo
-- Execute manualmente no Supabase SQL Editor.
-- Este script é idempotente e não cria usuários administrativos automaticamente.

create extension if not exists pgcrypto;

alter table if exists public.profiles
  add column if not exists can_create_memorials boolean not null default true,
  add column if not exists can_delete_memorials boolean not null default true;

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_users_email_normalized check (email = lower(trim(email)))
);

create table if not exists public.admin_login_attempts (
  id bigint generated always as identity primary key,
  user_id text,
  success boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists admin_login_attempts_user_created_idx
  on public.admin_login_attempts (user_id, created_at desc);

create index if not exists admin_users_active_email_idx
  on public.admin_users (email) where active;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists admin_users_updated on public.admin_users;
create trigger admin_users_updated
before update on public.admin_users
for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.admin_login_attempts enable row level security;

-- Administrador inicial autorizado para o painel.
insert into public.admin_users (email, active)
values ('luizcarlosilvasaccoman@gmail.com', true)
on conflict (email) do update set active = excluded.active, updated_at = now();

-- O backend usa a chave service role. Não exponha estas tabelas via Data API.
drop policy if exists "admin users service role only" on public.admin_users;
create policy "admin users service role only"
  on public.admin_users for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "admin login attempts service role only" on public.admin_login_attempts;
create policy "admin login attempts service role only"
  on public.admin_login_attempts for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.admin_login_attempts from anon, authenticated;
grant all on table public.admin_users to service_role;
grant all on table public.admin_login_attempts to service_role;

grant usage, select on sequence public.admin_login_attempts_id_seq to service_role;

-- Auditoria não deve ser legível nem alterável por clientes.
alter table if exists public.audit_logs enable row level security;
drop policy if exists "audit logs service role only" on public.audit_logs;
create policy "audit logs service role only"
  on public.audit_logs for all
  to service_role
  using (true)
  with check (true);
revoke all on table public.audit_logs from anon, authenticated;
grant all on table public.audit_logs to service_role;

-- Para ativar o primeiro administrador, insira manualmente um e-mail verificado:
-- insert into public.admin_users (email) values ('admin@exemplo.com')
-- on conflict (email) do update set active = true;

-- Para o painel, configure também no ambiente do projeto:
-- ADMIN_PANEL_PASSWORD_HASH=scrypt$<salt>$<hash_hex>
-- ADMIN_SESSION_SECRET=<segredo longo e aleatório>
-- O código permanece inacessível até essas duas variáveis existirem.

-- Verificação segura após a execução:
-- select email, active from public.admin_users order by created_at desc;
-- select count(*) from public.admin_login_attempts;
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'profiles'
--   and column_name in ('can_create_memorials', 'can_delete_memorials');

-- Limpeza opcional de tentativas antigas (retenção de 90 dias):
-- delete from public.admin_login_attempts
-- where created_at < now() - interval '90 days';

-- Observação: exclusão de projeto deve usar a função de aplicação
-- excluirProjetoCompleto(id), que também remove arquivos do Storage.
-- Não use CASCADE para remover objetos do bucket; Storage é independente do banco.

notify pgrst, 'reload schema';

-- NOTA: se a role service_role não existir no seu projeto (instalação incomum),
-- remova apenas as linhas de GRANT/POLICY relacionadas a ela e mantenha RLS ativo.

-- Fim do script.

-- Consulta final de conferência:
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('admin_users', 'admin_login_attempts')
order by table_name;
