-- Assinatura Pro (Cakto) e cota do plano Grátis.
-- Pro: 30 dias a partir da confirmação do pagamento (plan_expires_at).
-- Grátis: 3 memoriais no total; no máximo 1 por azimute, 2 com OCR, 3 comuns.
-- Cada memorial processado com sucesso vira uma linha em memorial_uso (nunca é apagada pelo usuário).

alter table public.profiles add column if not exists plan_expires_at timestamptz;
alter table public.profiles add column if not exists plan_started_at timestamptz;

create table if not exists public.memorial_uso (
  project_id uuid primary key,
  user_id text not null,
  categoria text not null check (categoria in ('azimute', 'ocr', 'comum')),
  created_at timestamptz not null default now()
);
create index if not exists memorial_uso_user_idx on public.memorial_uso (user_id);

-- Chat de suporte: cada linha é uma mensagem de uma conta (autor = usuario) ou da equipe (autor = suporte).
create table if not exists public.suporte_mensagens (
  id bigserial primary key,
  user_id text not null,
  autor text not null check (autor in ('usuario', 'suporte')),
  mensagem text not null check (char_length(mensagem) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists suporte_mensagens_user_idx on public.suporte_mensagens (user_id, created_at);

-- Acesso só pelo servidor (chave service role). Sem políticas: clientes anônimos não leem.
alter table public.memorial_uso enable row level security;
alter table public.suporte_mensagens enable row level security;
