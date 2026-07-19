import {
  findPedidoByExternalReference,
  findPedidoByPaymentId,
  updatePedidoPaymentStatus
} from '../repositories/pedidos-repository.js';
import { emitIngressos } from './ingressos-service.js';

export const PAYMENT_EVENT_STATUS = Object.freeze({
  PAYMENT_CONFIRMED: {
    statusPagamento: 'PAGAMENTO_CONFIRMADO',
    statusPedido: 'PAGAMENTO_CONFIRMADO',
    approved: true
  },
  PAYMENT_RECEIVED: {
    statusPagamento: 'PAGO',
    statusPedido: 'PAGO',
    approved: true
  },
  PAYMENT_OVERDUE: {
    statusPagamento: 'VENCIDO',
    statusPedido: 'VENCIDO'
  },
  PAYMENT_DELETED: {
    statusPagamento: 'CANCELADO',
    statusPedido: 'CANCELADO'
  },
  PAYMENT_REFUNDED: {
    statusPagamento: 'ESTORNADO',
    statusPedido: 'ESTORNADO'
  },
  PAYMENT_RESTORED: {
    statusPagamento: 'AGUARDANDO_PAGAMENTO',
    statusPedido: 'CHECKOUT_CRIADO'
  },
  PAYMENT_RECEIVED_IN_CASH_UNDONE: {
    statusPagamento: 'PAGAMENTO_DESFEITO',
    statusPedido: 'PAGAMENTO_DESFEITO'
  },
  PAYMENT_CHARGEBACK_REQUESTED: {
    statusPagamento: 'CHARGEBACK_SOLICITADO',
    statusPedido: 'CHARGEBACK_SOLICITADO'
  },
  PAYMENT_CHARGEBACK_DISPUTE: {
    statusPagamento: 'CHARGEBACK_EM_DISPUTA',
    statusPedido: 'CHARGEBACK_EM_DISPUTA'
  },
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: {
    statusPagamento: 'AGUARDANDO_REVERSAO_CHARGEBACK',
    statusPedido: 'AGUARDANDO_REVERSAO_CHARGEBACK'
  },
  PAYMENT_DUNNING_REQUESTED: {
    statusPagamento: 'NEGATIVACAO_SOLICITADA',
    statusPedido: 'NEGATIVACAO_SOLICITADA'
  }
});

export const onPaymentApproved = async ({ pedido }) => emitIngressos(pedido.id);

const defaultRepository = {
  findByExternalReference: findPedidoByExternalReference,
  findByPaymentId: findPedidoByPaymentId,
  updatePaymentStatus: updatePedidoPaymentStatus
};

const findPedido = async ({ externalReference, paymentId }, repository) => {
  if (externalReference) {
    const pedido = await repository.findByExternalReference(externalReference);
    if (pedido) return pedido;
  }

  if (paymentId) return repository.findByPaymentId(paymentId);
  return null;
};

export const processPaymentEvent = async (
  webhookEvent,
  { repository = defaultRepository, approvedHandler = onPaymentApproved } = {}
) => {
  const mapping = PAYMENT_EVENT_STATUS[webhookEvent.event];
  if (!mapping) {
    return { result: 'EVENTO_NAO_SUPORTADO', pedidoId: null, codigoPedido: null };
  }

  const paymentId = typeof webhookEvent.payment?.id === 'string'
    ? webhookEvent.payment.id.trim()
    : '';
  const externalReference = typeof webhookEvent.payment?.externalReference === 'string'
    ? webhookEvent.payment.externalReference.trim()
    : '';
  const pedido = await findPedido({ externalReference, paymentId }, repository);

  if (!pedido) {
    return { result: 'PEDIDO_NAO_ENCONTRADO', pedidoId: null, codigoPedido: null };
  }

  const statusPedido = mapping.approved && pedido.status_pedido === 'INGRESSOS_EMITIDOS'
    ? 'INGRESSOS_EMITIDOS'
    : mapping.statusPedido;
  const updatedPedido = await repository.updatePaymentStatus(pedido.id, {
    status_pagamento: mapping.statusPagamento,
    status_pedido: statusPedido,
    asaas_payment_id: paymentId || null
  });

  let emissao = null;
  if (mapping.approved) {
    emissao = await approvedHandler({
      pedido: updatedPedido,
      eventId: webhookEvent.id,
      eventType: webhookEvent.event,
      paymentId: paymentId || null
    });
  }

  return {
    result: 'PEDIDO_ATUALIZADO',
    pedidoId: updatedPedido.id,
    codigoPedido: updatedPedido.codigo_pedido,
    ingressosEmitidos: emissao?.quantidade ?? null
  };
};
