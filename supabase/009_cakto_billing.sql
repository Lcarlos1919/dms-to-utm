-- =====================================================================
-- 009_cakto_billing.sql  (pode rodar mais de uma vez)
-- Assinatura Vertix Pro pela Cakto (R$ 69,90/mês).
--   - libera 'cakto' como provedor em subscriptions
--   - 1 linha por assinatura da Cakto (provider + provider_subscription_id)
--   - checkout_tokens: liga o link de checkout ao usuário do Clerk
--     (o token volta no webhook, no campo data.callback)
--   - billing_events: registro idempotente de cada entrega do webhook
-- =====================================================================

alter table public.subscriptions drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions
  add constraint subscriptions_provider_check check (provider in ('stripe','asaas','paddle','cakto'));

alter table public.subscriptions add column if not exists customer_email text;
alter table public.subscriptions add column if not exists last_event text;
alter table public.subscriptions add column if not exists canceled_at timestamptz;

create unique index if not exists subscriptions_provider_sub_uidx
  on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create table if not exists public.checkout_tokens (
  token text primary key,
  user_id text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists checkout_tokens_user_idx on public.checkout_tokens (user_id, created_at desc);

create table if not exists public.billing_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event text not null,
  order_id text,
  subscription_id text,
  user_id text,
  status text not null default 'received',
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create unique index if not exists billing_events_dedupe_uidx
  on public.billing_events (provider, event, order_id)
  where order_id is not null;

alter table public.checkout_tokens enable row level security;
alter table public.billing_events enable row level security;
-- Sem políticas: só o service role (servidor) lê e escreve nessas tabelas.

update public.app_settings
   set value = jsonb_set(value, '{pro}', '{"name":"Pro","price_cents":6990}'::jsonb, true),
       updated_at = now()
 where key = 'plans';

select key, value from public.app_settings where key = 'plans';
