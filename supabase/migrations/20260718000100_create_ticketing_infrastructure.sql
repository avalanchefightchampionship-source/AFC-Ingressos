create extension if not exists pgcrypto with schema extensions;

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  codigo_pedido text not null,
  nome text not null,
  email text not null,
  telefone text not null,
  cpf text not null,
  tipo_ingresso text not null,
  quantidade integer not null,
  valor_total numeric(10, 2) not null,
  status_pagamento text not null default 'AGUARDANDO_PAGAMENTO',
  status_pedido text not null default 'AGUARDANDO_PAGAMENTO',
  ref_afiliado text,
  asaas_checkout_id text,
  asaas_customer_id text,
  asaas_payment_id text,
  external_reference text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pedidos_codigo_pedido_key unique (codigo_pedido),
  constraint pedidos_external_reference_key unique (external_reference),
  constraint pedidos_nome_check check (char_length(btrim(nome)) between 3 and 120),
  constraint pedidos_email_check check (
    char_length(email) <= 254
    and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint pedidos_telefone_check check (telefone ~ '^[0-9]{10,11}$'),
  constraint pedidos_cpf_check check (cpf ~ '^[0-9]{11}$'),
  constraint pedidos_tipo_ingresso_check check (tipo_ingresso in ('arquibancada', 'vip')),
  constraint pedidos_quantidade_check check (quantidade between 1 and 10),
  constraint pedidos_valor_total_check check (valor_total > 0),
  constraint pedidos_status_pagamento_check check (
    status_pagamento in ('AGUARDANDO_PAGAMENTO', 'PAGO', 'CANCELADO', 'EXPIRADO', 'ESTORNADO')
  ),
  constraint pedidos_status_pedido_check check (
    status_pedido in ('AGUARDANDO_PAGAMENTO', 'CHECKOUT_CRIADO', 'FALHA_CHECKOUT', 'PAGO', 'CANCELADO', 'EXPIRADO')
  ),
  constraint pedidos_ref_afiliado_check check (
    ref_afiliado is null or char_length(ref_afiliado) between 1 and 100
  )
);

create table public.ingressos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null,
  codigo_ingresso text not null,
  categoria text not null,
  status text not null default 'PENDENTE',
  utilizado boolean not null default false,
  qr_code text,
  checkin_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint ingressos_pedido_id_fkey foreign key (pedido_id)
    references public.pedidos (id) on delete cascade,
  constraint ingressos_codigo_ingresso_key unique (codigo_ingresso),
  constraint ingressos_qr_code_key unique (qr_code),
  constraint ingressos_categoria_check check (categoria in ('arquibancada', 'vip')),
  constraint ingressos_status_check check (status in ('PENDENTE', 'ATIVO', 'UTILIZADO', 'CANCELADO')),
  constraint ingressos_checkin_check check (checkin_at is null or utilizado = true)
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  constraint webhook_events_event_id_key unique (event_id),
  constraint webhook_events_event_id_check check (char_length(event_id) between 1 and 200),
  constraint webhook_events_event_type_check check (char_length(event_type) between 1 and 100)
);

create unique index pedidos_asaas_checkout_id_key on public.pedidos (asaas_checkout_id)
  where asaas_checkout_id is not null;
create unique index pedidos_asaas_payment_id_key on public.pedidos (asaas_payment_id)
  where asaas_payment_id is not null;
create index pedidos_asaas_customer_id_idx on public.pedidos (asaas_customer_id);
create index pedidos_status_pagamento_idx on public.pedidos (status_pagamento);
create index pedidos_status_pedido_idx on public.pedidos (status_pedido);
create index pedidos_created_at_idx on public.pedidos (created_at desc);
create index pedidos_ref_afiliado_idx on public.pedidos (ref_afiliado)
  where ref_afiliado is not null;
create index ingressos_pedido_id_idx on public.ingressos (pedido_id);
create index ingressos_status_idx on public.ingressos (status);
create index ingressos_pendentes_checkin_idx on public.ingressos (pedido_id)
  where utilizado = false;
create index webhook_events_event_type_idx on public.webhook_events (event_type);
create index webhook_events_pending_idx on public.webhook_events (created_at)
  where processed = false;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger pedidos_set_updated_at
before update on public.pedidos
for each row execute function public.set_updated_at();

alter table public.pedidos enable row level security;
alter table public.ingressos enable row level security;
alter table public.webhook_events enable row level security;

revoke all on table public.pedidos from anon, authenticated;
revoke all on table public.ingressos from anon, authenticated;
revoke all on table public.webhook_events from anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

grant select, insert, update, delete on table public.pedidos to service_role;
grant select, insert, update, delete on table public.ingressos to service_role;
grant select, insert, update, delete on table public.webhook_events to service_role;
