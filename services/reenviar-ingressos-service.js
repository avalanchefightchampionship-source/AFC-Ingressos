import { enviarIngressosPorEmail } from './email-service.js';
import { buildEventoDados, enviarConfirmacaoPayPerView, getPayPerViewTransmissaoLink, registrarTransmissaoEnviada } from './pay-per-view-service.js';
import { APPROVED_PAYMENT_STATUS_VALUES } from './payment-events.js';
import { findIngressosByPedidoId } from '../repositories/ingressos-repository.js';
import {
  findPedidoParaReenvioEmail,
  findPedidosIngressosFisicosPagos,
  updatePedidoEmailStatus
} from '../repositories/pedidos-repository.js';

const isValidEmail = (value) =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const TIPOS_INGRESSO_FISICO = Object.freeze(['arquibancada', 'vip']);

export const validateMensagemDestaque = (mensagemDestaque) => {
  const clean = typeof mensagemDestaque === 'string' ? mensagemDestaque.trim() : '';
  if (!clean) {
    throw new Error('Informe a mensagem de destaque para o reenvio em massa.');
  }
  if (clean.length > 500) {
    throw new Error('A mensagem de destaque deve ter no máximo 500 caracteres.');
  }
  return clean;
};

export const buildMensagemLembretePadrao = (dadosEvento = buildEventoDados()) => {
  const eventoNome = dadosEvento?.nome || 'Avalanche Fight Championship';
  return `Faltam apenas 10 dias para o ${eventoNome}! Mostre seus ingressos na portaria na entrada do evento.`;
};

const normalizeTipoIngressoFiltro = (tipoIngresso) => {
  if (typeof tipoIngresso !== 'string' || !tipoIngresso.trim()) return null;
  const clean = tipoIngresso.trim();
  if (!TIPOS_INGRESSO_FISICO.includes(clean)) {
    throw new Error('Tipo de ingresso inválido para reenvio em massa.');
  }
  return clean;
};

const enviarIngressosDoPedido = async (
  pedido,
  { mensagemDestaque, listarIngressos, enviarEmail, atualizarStatus }
) => {
  const ingressos = await listarIngressos(pedido.id);
  if (!ingressos?.length) {
    throw new Error('Nenhum ingresso emitido para este pedido.');
  }

  const emailId = await enviarEmail({
    comprador: { nome: pedido.nome },
    email: pedido.email,
    ingressos,
    pedido,
    quantidade: pedido.quantidade,
    dadosEvento: buildEventoDados(),
    mensagemDestaque
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
};

const reenviarConfirmacaoPayPerViewDoPedido = async (
  pedido,
  {
    enviarConfirmacao = enviarConfirmacaoPayPerView,
    atualizarStatus = updatePedidoEmailStatus,
    registrarTransmissao = registrarTransmissaoEnviada
  } = {}
) => {
  const emailId = await enviarConfirmacao({
    comprador: { nome: pedido.nome },
    email: pedido.email,
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

  await registrarTransmissao(pedido.id, {
    link: getPayPerViewTransmissaoLink(),
    tentativasAtuais: pedido.transmissao_tentativas || 0
  });

  return {
    pedidoId: pedido.id,
    codigoPedido: pedido.codigo_pedido,
    nome: pedido.nome,
    email: pedido.email,
    tipoIngresso: 'pay-per-view',
    quantidadeIngressos: 0,
    emailId: typeof emailId === 'string' ? emailId : emailId?.id || null
  };
};

export const reenviarIngressosPorEmail = async (
  { email, codigoPedido },
  {
    buscarPedido = findPedidoParaReenvioEmail,
    listarIngressos = findIngressosByPedidoId,
    enviarEmail = enviarIngressosPorEmail,
    enviarConfirmacao = enviarConfirmacaoPayPerView,
    atualizarStatus = updatePedidoEmailStatus,
    registrarTransmissao = registrarTransmissaoEnviada
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
  if (!APPROVED_PAYMENT_STATUS_VALUES.includes(pedido.status_pagamento)) {
    throw new Error('Só é possível reenviar e-mails de pedidos pagos.');
  }

  try {
    if (pedido.tipo_ingresso === 'pay-per-view') {
      return await reenviarConfirmacaoPayPerViewDoPedido(pedido, {
        enviarConfirmacao,
        atualizarStatus,
        registrarTransmissao
      });
    }

    const ingressos = await listarIngressos(pedido.id);
    if (!ingressos?.length) {
      throw new Error('Nenhum ingresso emitido para este pedido.');
    }

    const result = await enviarIngressosDoPedido(pedido, {
      mensagemDestaque: '',
      listarIngressos,
      enviarEmail,
      atualizarStatus
    });

    return result;
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

export const reenviarIngressosEmMassa = async (
  { mensagemDestaque, tipoIngresso } = {},
  {
    listarPedidos = findPedidosIngressosFisicosPagos,
    listarIngressos = findIngressosByPedidoId,
    enviarEmail = enviarIngressosPorEmail,
    atualizarStatus = updatePedidoEmailStatus
  } = {}
) => {
  const cleanMessage = validateMensagemDestaque(mensagemDestaque);
  const cleanTipo = normalizeTipoIngressoFiltro(tipoIngresso);
  const pedidos = await listarPedidos({ tipoIngresso: cleanTipo });
  const resumo = {
    total: pedidos.length,
    enviados: 0,
    falhas: 0,
    detalhes: []
  };

  for (const pedido of pedidos) {
    try {
      const result = await enviarIngressosDoPedido(pedido, {
        mensagemDestaque: cleanMessage,
        listarIngressos,
        enviarEmail,
        atualizarStatus
      });
      resumo.enviados += 1;
      resumo.detalhes.push({ ...result, status: 'enviado' });
    } catch (error) {
      await atualizarStatus(pedido.id, {
        email_enviado: false,
        email_enviado_em: null,
        email_tentativas: (pedido.email_tentativas || 0) + 1,
        email_ultimo_erro: error?.message || 'Falha ao reenviar e-mail.'
      }).catch(() => {});
      resumo.falhas += 1;
      resumo.detalhes.push({
        pedidoId: pedido.id,
        codigoPedido: pedido.codigo_pedido,
        email: pedido.email,
        status: 'falha',
        erro: error?.message || 'Falha ao reenviar e-mail.'
      });
    }
  }

  return resumo;
};
