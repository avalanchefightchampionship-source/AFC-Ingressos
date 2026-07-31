import { enviarIngressosPorEmail } from './email-service.js';
import { buildEventoDados } from './pay-per-view-service.js';
import { APPROVED_PAYMENT_STATUS_VALUES } from './payment-events.js';
import { findIngressosByPedidoId } from '../repositories/ingressos-repository.js';
import {
  findPedidoParaReenvioIngressos,
  updatePedidoEmailStatus
} from '../repositories/pedidos-repository.js';

const isValidEmail = (value) =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const reenviarIngressosPorEmail = async (
  { email, codigoPedido },
  {
    buscarPedido = findPedidoParaReenvioIngressos,
    listarIngressos = findIngressosByPedidoId,
    enviarEmail = enviarIngressosPorEmail,
    atualizarStatus = updatePedidoEmailStatus
  } = {}
) => {
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const cleanCodigo = typeof codigoPedido === 'string' ? codigoPedido.trim().toUpperCase() : '';

  if (!cleanEmail && !cleanCodigo) {
    throw new Error('Informe o e-mail ou o código do pedido.');
  }
  if (cleanEmail && !isValidEmail(cleanEmail)) {
    throw new Error('E-mail inválido.');
  }

  const pedido = await buscarPedido({ email: cleanEmail || null, codigoPedido: cleanCodigo || null });
  if (!pedido) {
    throw new Error('Pedido não encontrado.');
  }
  if (pedido.tipo_ingresso === 'pay-per-view') {
    throw new Error('Este pedido é Pay-Per-View. Use o envio de link da transmissão.');
  }
  if (!APPROVED_PAYMENT_STATUS_VALUES.includes(pedido.status_pagamento)) {
    throw new Error('Só é possível reenviar ingressos de pedidos pagos.');
  }

  const ingressos = await listarIngressos(pedido.id);
  if (!ingressos?.length) {
    throw new Error('Nenhum ingresso emitido para este pedido.');
  }

  try {
    const emailId = await enviarEmail({
      comprador: { nome: pedido.nome },
      email: pedido.email,
      ingressos,
      pedido,
      quantidade: pedido.quantidade,
      dadosEvento: buildEventoDados()
    });

    await atualizarStatus(pedido.id, {
      email_enviado: true,
      email_enviado_em: new Date().toISOString(),
      email_tentativas: (pedido.email_tentativas || 0) + 1,
      email_ultimo_erro: null
    });

    return {
      pedidoId: pedido.id,
      codigoPedido: pedido.codigo_pedido,
      nome: pedido.nome,
      email: pedido.email,
      quantidadeIngressos: ingressos.length,
      emailId: typeof emailId === 'string' ? emailId : emailId?.id || null
    };
  } catch (error) {
    await atualizarStatus(pedido.id, {
      email_enviado: false,
      email_enviado_em: null,
      email_tentativas: (pedido.email_tentativas || 0) + 1,
      email_ultimo_erro: error?.message || 'Falha ao reenviar e-mail.'
    }).catch(() => {});

    throw error;
  }
};
