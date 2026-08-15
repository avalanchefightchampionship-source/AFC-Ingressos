import {
  findPedidoByCheckoutId,
  findPedidoByExternalReference,
  findPedidoByPaymentId,
  updatePedidoEmailStatus,
  updatePedidoPaymentStatus
} from '../repositories/pedidos-repository.js';
import { emitIngressos } from './ingressos-service.js';
import { enviarIngressosPorEmail } from './email-service.js';
import { enviarConfirmacaoPayPerView, buildEventoDados } from './pay-per-view-service.js';
import { sendMetaPurchaseEvent } from './meta-capi-service.js';
import { markCupomAsUsed } from './cupons-service.js';

export const PAY_PER_VIEW_TICKET_TYPE = 'pay-per-view';

export const APPROVED_PAYMENT_STATUS_VALUES = Object.freeze(['PAGAMENTO_CONFIRMADO', 'PAGO']);
export const APPROVED_PAYMENT_STATUSES = new Set(APPROVED_PAYMENT_STATUS_VALUES);

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

const buildEmailPayload = (pedido, ingressos) => ({
  comprador: { nome: pedido?.nome || pedido?.codigo_pedido || 'Comprador' },
  email: pedido?.email,
  ingressos,
  pedido,
  quantidade: pedido?.quantidade,
  dadosEvento: buildEventoDados()
});

const isPayPerViewPedido = (pedido) => pedido?.tipo_ingresso === PAY_PER_VIEW_TICKET_TYPE;

export const onPaymentApproved = async (
  {
    pedido,
    eventId,
    paymentId,
    shouldTrackPurchase = true
  },
  {
    emit = emitIngressos,
    sendEmail = enviarIngressosPorEmail,
    sendPayPerViewConfirmation = enviarConfirmacaoPayPerView,
    updateEmailStatus = updatePedidoEmailStatus,
    trackPurchase = sendMetaPurchaseEvent,
    confirmarCupom = markCupomAsUsed
  } = {}
) => {
  if (shouldTrackPurchase && pedido?.cupom_codigo) {
    try {
      await confirmarCupom({
        codigo: pedido.cupom_codigo,
        pedidoId: pedido.id
      });
    } catch (error) {
      console.error('Falha ao marcar cupom como utilizado.', {
        pedidoId: pedido?.id || null,
        cupomCodigo: pedido?.cupom_codigo || null,
        message: error?.message || 'Erro desconhecido'
      });
    }
  }

  const payPerView = isPayPerViewPedido(pedido);
  const emission = payPerView
    ? { quantidade: pedido?.quantidade ?? null, ingressos: [] }
    : await emit(pedido.id);

  if (shouldTrackPurchase) {
    try {
      await trackPurchase({
        pedido: {
          ...pedido,
          quantidade: Number.isInteger(pedido?.quantidade) ? pedido.quantidade : emission?.quantidade,
          tipo_ingresso: pedido?.tipo_ingresso || emission?.categoria
        },
        eventId,
        paymentId
      });
    } catch (error) {
      console.error('Falha ao enviar Purchase para Meta CAPI.', {
        pedidoId: pedido?.id || null,
        eventId: eventId || null,
        message: error?.message || 'Erro desconhecido'
      });
    }
  }

  if (pedido?.email_enviado) {
    return {
      pedidoId: pedido.id,
      emailSent: false,
      skipped: true,
      payPerView,
      quantidade: emission?.quantidade ?? null,
      ingressos: emission?.ingressos ?? []
    };
  }

  try {
    const emailPayload = buildEmailPayload(pedido, emission.ingressos);
    const emailResult = payPerView
      ? await sendPayPerViewConfirmation(emailPayload)
      : await sendEmail(emailPayload);
    const emailId = typeof emailResult === 'string' ? emailResult : emailResult?.id || null;

    await updateEmailStatus(pedido.id, {
      email_enviado: true,
      email_enviado_em: new Date().toISOString(),
      email_tentativas: (pedido.email_tentativas || 0) + 1,
      email_ultimo_erro: null
    });

    return {
      pedidoId: pedido.id,
      emailSent: true,
      emailId,
      payPerView,
      quantidade: emission.quantidade,
      ingressos: emission.ingressos
    };
  } catch (error) {
    await updateEmailStatus(pedido.id, {
      email_enviado: false,
      email_enviado_em: null,
      email_tentativas: (pedido.email_tentativas || 0) + 1,
      email_ultimo_erro: error?.message || 'Falha ao enviar e-mail.'
    });

    return {
      pedidoId: pedido.id,
      emailSent: false,
      emailError: error?.message || 'Falha ao enviar e-mail.',
      payPerView,
      quantidade: emission.quantidade,
      ingressos: emission.ingressos
    };
  }
};

const defaultRepository = {
  findByCheckoutId: findPedidoByCheckoutId,
  findByExternalReference: findPedidoByExternalReference,
  findByPaymentId: findPedidoByPaymentId,
  updatePaymentStatus: updatePedidoPaymentStatus
};

const maskPaymentId = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim();
  if (normalized.length <= 8) return '***';
  return `***${normalized.slice(-8)}`;
};

const findPedido = async ({ externalReference, paymentId, checkoutSession }, repository) => {
  if (externalReference) {
    const pedido = await repository.findByExternalReference(externalReference);
    if (pedido) return pedido;
  }

  if (paymentId) {
    const pedido = await repository.findByPaymentId(paymentId);
    if (pedido) return pedido;
  }

  if (checkoutSession && typeof repository.findByCheckoutId === 'function') {
    return repository.findByCheckoutId(checkoutSession);
  }

  return null;
};

const finalizePedidoPaymentUpdate = async ({
  pedido,
  mapping,
  webhookEvent,
  paymentId,
  repository,
  approvedHandler
}) => {
  const statusPedido = mapping.approved && pedido.status_pedido === 'INGRESSOS_EMITIDOS'
    ? 'INGRESSOS_EMITIDOS'
    : mapping.statusPedido;
  const shouldTrackPurchase = mapping.approved && !APPROVED_PAYMENT_STATUSES.has(pedido.status_pagamento);
  const updatedPedido = await repository.updatePaymentStatus(pedido.id, {
    status_pagamento: mapping.statusPagamento,
    status_pedido: statusPedido,
    asaas_payment_id: paymentId || pedido.asaas_payment_id || null
  });

  let emissao = null;
  if (mapping.approved) {
    emissao = await approvedHandler({
      pedido: updatedPedido,
      eventId: webhookEvent.id,
      eventType: webhookEvent.event,
      paymentId: paymentId || null,
      shouldTrackPurchase
    });
  }

  return {
    result: 'PEDIDO_ATUALIZADO',
    pedidoId: updatedPedido.id,
    codigoPedido: updatedPedido.codigo_pedido,
    ingressosEmitidos: emissao?.quantidade ?? null
  };
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
  const checkoutSession = typeof webhookEvent.payment?.checkoutSession === 'string'
    ? webhookEvent.payment.checkoutSession.trim()
    : '';
  console.info('Processing payment webhook lookup.', {
    eventType: webhookEvent.event,
    hasExternalReference: Boolean(externalReference),
    externalReference: externalReference || null,
    checkoutSession: checkoutSession || null,
    paymentIdMasked: maskPaymentId(paymentId)
  });

  const pedido = await findPedido({ externalReference, paymentId, checkoutSession }, repository);

  if (!pedido) {
    console.warn('Pedido não encontrado para webhook do Asaas.', {
      eventType: webhookEvent.event,
      externalReference: externalReference || null,
      checkoutSession: checkoutSession || null,
      paymentIdMasked: maskPaymentId(paymentId)
    });
    return { result: 'PEDIDO_NAO_ENCONTRADO', pedidoId: null, codigoPedido: null };
  }

  return finalizePedidoPaymentUpdate({
    pedido,
    mapping,
    webhookEvent,
    paymentId: paymentId || null,
    repository,
    approvedHandler
  });
};

export const CHECKOUT_EVENT_STATUS = Object.freeze({
  CHECKOUT_PAID: {
    statusPagamento: 'PAGAMENTO_CONFIRMADO',
    statusPedido: 'PAGAMENTO_CONFIRMADO',
    approved: true
  },
  CHECKOUT_EXPIRED: {
    statusPagamento: 'VENCIDO',
    statusPedido: 'VENCIDO'
  },
  CHECKOUT_CANCELED: {
    statusPagamento: 'CANCELADO',
    statusPedido: 'CANCELADO'
  }
});

export const processCheckoutEvent = async (
  webhookEvent,
  { repository = defaultRepository, approvedHandler = onPaymentApproved } = {}
) => {
  if (webhookEvent.event === 'CHECKOUT_CREATED') {
    return { result: 'EVENTO_IGNORADO', pedidoId: null, codigoPedido: null };
  }

  const mapping = CHECKOUT_EVENT_STATUS[webhookEvent.event];
  if (!mapping) {
    return { result: 'EVENTO_NAO_SUPORTADO', pedidoId: null, codigoPedido: null };
  }

  const checkoutId = typeof webhookEvent.checkout?.id === 'string'
    ? webhookEvent.checkout.id.trim()
    : '';
  const externalReference = typeof webhookEvent.checkout?.externalReference === 'string'
    ? webhookEvent.checkout.externalReference.trim()
    : '';

  console.info('Processing checkout webhook lookup.', {
    eventType: webhookEvent.event,
    checkoutId: checkoutId || null,
    externalReference: externalReference || null
  });

  let pedido = null;
  if (checkoutId) {
    pedido = await repository.findByCheckoutId(checkoutId);
  }
  if (!pedido && externalReference) {
    pedido = await repository.findByExternalReference(externalReference);
  }

  if (!pedido) {
    console.warn('Pedido não encontrado para webhook de checkout do Asaas.', {
      eventType: webhookEvent.event,
      checkoutId: checkoutId || null,
      externalReference: externalReference || null
    });
    return { result: 'PEDIDO_NAO_ENCONTRADO', pedidoId: null, codigoPedido: null };
  }

  return finalizePedidoPaymentUpdate({
    pedido,
    mapping,
    webhookEvent,
    paymentId: null,
    repository,
    approvedHandler
  });
};

export const processWebhookEvent = async (webhookEvent, deps = {}) => {
  const eventType = typeof webhookEvent?.event === 'string' ? webhookEvent.event : '';
  if (eventType.startsWith('CHECKOUT_')) {
    return processCheckoutEvent(webhookEvent, deps);
  }
  return processPaymentEvent(webhookEvent, deps);
};
