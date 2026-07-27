-- Pay-Per-View: aceitar novo tipo de ingresso e rastrear envio do link de transmissão

alter table public.pedidos
  drop constraint if exists pedidos_tipo_ingresso_check;

alter table public.pedidos
  add constraint pedidos_tipo_ingresso_check
  check (tipo_ingresso in ('arquibancada', 'vip', 'pay-per-view'));

alter table public.pedidos
  add column if not exists transmissao_link text,
  add column if not exists transmissao_enviada boolean not null default false,
  add column if not exists transmissao_enviada_em timestamptz,
  add column if not exists transmissao_tentativas integer not null default 0,
  add column if not exists transmissao_ultimo_erro text;

create index if not exists pedidos_ppv_transmissao_pendente_idx
  on public.pedidos (created_at desc)
  where tipo_ingresso = 'pay-per-view'
    and transmissao_enviada = false;
