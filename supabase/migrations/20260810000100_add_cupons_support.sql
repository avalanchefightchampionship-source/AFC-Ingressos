create table public.cupons (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  valor_desconto numeric(10, 2) not null,
  usado boolean not null default false,
  usado_em timestamptz,
  pedido_id uuid references public.pedidos (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint cupons_codigo_key unique (codigo),
  constraint cupons_valor_desconto_check check (valor_desconto > 0),
  constraint cupons_codigo_format_check check (char_length(btrim(codigo)) between 4 and 40)
);

create index cupons_usado_idx on public.cupons (usado);
create index cupons_created_at_idx on public.cupons (created_at desc);

alter table public.pedidos
  add column if not exists cupom_codigo text,
  add column if not exists valor_subtotal numeric(10, 2),
  add column if not exists valor_desconto numeric(10, 2);

alter table public.pedidos
  add constraint pedidos_cupom_codigo_check check (
    cupom_codigo is null or char_length(btrim(cupom_codigo)) between 4 and 40
  );

alter table public.pedidos
  add constraint pedidos_valor_subtotal_check check (
    valor_subtotal is null or valor_subtotal > 0
  );

alter table public.pedidos
  add constraint pedidos_valor_desconto_check check (
    valor_desconto is null or valor_desconto >= 0
  );

create index pedidos_cupom_codigo_idx on public.pedidos (cupom_codigo)
  where cupom_codigo is not null;
