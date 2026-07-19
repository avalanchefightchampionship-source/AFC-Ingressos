alter table public.pedidos
  drop constraint pedidos_status_pagamento_check,
  add constraint pedidos_status_pagamento_check check (
    status_pagamento in (
      'AGUARDANDO_PAGAMENTO',
      'PAGAMENTO_CONFIRMADO',
      'PAGO',
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

alter table public.pedidos
  drop constraint pedidos_status_pedido_check,
  add constraint pedidos_status_pedido_check check (
    status_pedido in (
      'AGUARDANDO_PAGAMENTO',
      'CHECKOUT_CRIADO',
      'FALHA_CHECKOUT',
      'PAGAMENTO_CONFIRMADO',
      'PAGO',
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
