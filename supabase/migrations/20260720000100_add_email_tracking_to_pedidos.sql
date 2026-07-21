alter table public.pedidos
  add column if not exists email_enviado boolean not null default false,
  add column if not exists email_enviado_em timestamptz,
  add column if not exists email_tentativas integer not null default 0,
  add column if not exists email_ultimo_erro text;

create index if not exists pedidos_email_enviado_idx
  on public.pedidos (email_enviado);
