alter table public.ingressos
  drop constraint ingressos_status_check,
  add constraint ingressos_status_check check (
    status in ('PENDENTE', 'VALIDO', 'UTILIZADO', 'CANCELADO', 'ESTORNADO', 'INVALIDADO')
  ),
  add constraint ingressos_codigo_formato_check check (
    codigo_ingresso ~ '^AFC-[A-F0-9]{36}$'
  ),
  add constraint ingressos_qr_code_formato_check check (
    (status = 'PENDENTE' and qr_code is null)
    or qr_code ~ '^AFC:1:[A-F0-9]{36}$'
  );

alter table public.pedidos
  drop constraint pedidos_status_pedido_check,
  add constraint pedidos_status_pedido_check check (
    status_pedido in (
      'AGUARDANDO_PAGAMENTO',
      'CHECKOUT_CRIADO',
      'FALHA_CHECKOUT',
      'PAGAMENTO_CONFIRMADO',
      'PAGO',
      'INGRESSOS_EMITIDOS',
      'VENCIDO',
      'CANCELADO',
      'EXPIRADO',
      'ESTORNADO',
      'PAGAMENTO_DESFEITO',
      'CHARGEBACK_SOLICITADO',
      'CHARGEBACK_EM_DISPUTA',
      'AGUARDANDO_REVERSAO_CHARGEBACK',
      'NEGATIVACAO_SOLICITADA'
    )
  );

alter table public.webhook_events
  add column processing boolean not null default false,
  add constraint webhook_events_processing_check check (not (processed and processing));

create index ingressos_pedido_status_idx
  on public.ingressos (pedido_id, status);

create index webhook_events_available_processing_idx
  on public.webhook_events (created_at)
  where processed = false and processing = false;

create or replace function public.emitir_ingressos_para_pedido(p_pedido_id uuid)
returns table (
  id uuid,
  pedido_id uuid,
  codigo_ingresso text,
  categoria text,
  status text,
  utilizado boolean,
  qr_code text,
  checkin_at timestamptz,
  created_at timestamptz,
  quantidade_esperada integer,
  categoria_pedido text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_existentes integer;
  v_faltantes integer;
  v_indice integer;
  v_tentativas integer;
  v_token text;
  v_codigo text;
  v_qr_code text;
begin
  select p.*
    into v_pedido
    from public.pedidos as p
   where p.id = p_pedido_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'PEDIDO_NAO_ENCONTRADO';
  end if;

  if v_pedido.status_pagamento not in ('PAGAMENTO_CONFIRMADO', 'PAGO') then
    raise exception using
      errcode = 'P0001',
      message = 'PAGAMENTO_NAO_APROVADO';
  end if;

  select count(*)::integer
    into v_existentes
    from public.ingressos as i
   where i.pedido_id = p_pedido_id;

  if v_existentes > v_pedido.quantidade then
    raise exception using
      errcode = 'P0001',
      message = 'QUANTIDADE_DE_INGRESSOS_INCONSISTENTE';
  end if;

  if exists (
    select 1
      from public.ingressos as i
     where i.pedido_id = p_pedido_id
       and i.categoria <> v_pedido.tipo_ingresso
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'CATEGORIA_DE_INGRESSO_INCONSISTENTE';
  end if;

  v_faltantes := v_pedido.quantidade - v_existentes;

  if v_faltantes > 0 then
    for v_indice in 1..v_faltantes loop
      v_tentativas := 0;

      loop
        v_tentativas := v_tentativas + 1;
        v_token := upper(encode(extensions.gen_random_bytes(18), 'hex'));
        v_codigo := 'AFC-' || v_token;
        v_qr_code := 'AFC:1:' || v_token;

        begin
          insert into public.ingressos (
            pedido_id,
            codigo_ingresso,
            categoria,
            status,
            utilizado,
            qr_code,
            checkin_at
          ) values (
            p_pedido_id,
            v_codigo,
            v_pedido.tipo_ingresso,
            'VALIDO',
            false,
            v_qr_code,
            null
          );
          exit;
        exception
          when unique_violation then
            if v_tentativas >= 5 then
              raise;
            end if;
        end;
      end loop;
    end loop;
  end if;

  select count(*)::integer
    into v_existentes
    from public.ingressos as i
   where i.pedido_id = p_pedido_id;

  if v_existentes <> v_pedido.quantidade then
    raise exception using
      errcode = 'P0001',
      message = 'EMISSAO_DE_INGRESSOS_INCOMPLETA';
  end if;

  update public.pedidos as p
     set status_pedido = 'INGRESSOS_EMITIDOS'
   where p.id = p_pedido_id;

  return query
    select
      i.id,
      i.pedido_id,
      i.codigo_ingresso,
      i.categoria,
      i.status,
      i.utilizado,
      i.qr_code,
      i.checkin_at,
      i.created_at,
      v_pedido.quantidade,
      v_pedido.tipo_ingresso
    from public.ingressos as i
    where i.pedido_id = p_pedido_id
    order by i.created_at, i.id;
end;
$$;

revoke execute on function public.emitir_ingressos_para_pedido(uuid)
  from public, anon, authenticated;

grant execute on function public.emitir_ingressos_para_pedido(uuid)
  to service_role;
