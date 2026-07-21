import {
  findPedidoByExternalReference,
  findPedidoByPaymentId,
  updatePedidoEmailStatus,
  updatePedidoPaymentStatus
} from '../repositories/pedidos-repository.js';
import { emitIngressos } from './ingressos-service.js';
import { enviarIngressosPorEmail } from './email-service.js';

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
  dadosEvento: {
    nome: process.env.EVENTO_NOME || 'Avalanche Fight Championship',
    data: process.env.EVENTO_DATA || '15 de agosto de 2026',
    horario: process.env.EVENTO_HORARIO || '19h',
    local: process.env.EVENTO_LOCAL || 'Ginásio de Esportes JK',
    endereco: process.env.EVENTO_ENDERECO || 'Rua Ângelo Amaral, 2 — Jardim Joana D’Arc, Campo Mourão — Paraná',
    dominio: process.env.SITE_URL || 'https://www.afcevents.com.br'
  }
});

export const onPaymentApproved = async (
  { pedido },
  {
    emit = emitIngressos,
    sendEmail = enviarIngressosPorEmail,
    updateEmailStatus = updatePedidoEmailStatus
  } = {}
) => {
  const emission = await emit(pedido.id);

  if (pedido?.email_enviado) {
    return {
      pedidoId: pedido.id,
      emailSent: false,
      skipped: true,
      quantidade: emission?.quantidade ?? null,
      ingressos: emission?.ingressos ?? []
    };
  }

  try {
    const emailPayload = buildEmailPayload(pedido, emission.ingressos);
    const emailResult = await sendEmail(emailPayload);
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
      quantidade: emission.quantidade,
      ingressos: emission.ingressos
    };
  }
};

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
