import { randomUUID } from 'node:crypto';
import {
  createPedido,
  markPedidoCheckoutFailed,
  updatePedidoCheckout
} from '../repositories/pedidos-repository.js';

export const createPendingOrder = async ({
  nome,
  email,
  telefone,
  cpf,
  tipoIngresso,
  quantidade,
  valorTotal,
  refAfiliado
}) => {
  const uniqueId = randomUUID();
  const codigoPedido = `AFC-${uniqueId.slice(0, 8).toUpperCase()}`;
  const externalReference = `afc-${uniqueId}`;

  const pedido = await createPedido({
    codigo_pedido: codigoPedido,
    nome,
    email,
    telefone,
    cpf,
    tipo_ingresso: tipoIngresso,
    quantidade,
    valor_total: valorTotal,
    status_pagamento: 'AGUARDANDO_PAGAMENTO',
    status_pedido: 'AGUARDANDO_PAGAMENTO',
    ref_afiliado: refAfiliado,
    external_reference: externalReference
  });

  return {
    id: pedido.id,
    codigoPedido: pedido.codigo_pedido,
    externalReference: pedido.external_reference
  };
};

export const attachCheckoutToOrder = (pedidoId, { checkoutId, customerId, externalReference }) =>
  updatePedidoCheckout(pedidoId, {
    asaas_checkout_id: checkoutId,
    asaas_customer_id: customerId,
    external_reference: externalReference,
    status_pedido: 'CHECKOUT_CRIADO'
  });

export const flagCheckoutFailure = async (pedidoId) => {
  try {
    await markPedidoCheckoutFailed(pedidoId);
  } catch (error) {
    console.error('Falha ao registrar o status do pedido.', {
      code: error?.code || null
    });
  }
};
