import { Resend } from 'resend';
import { renderPayPerViewConfirmacaoEmailHtml } from '../templates/pay-per-view-confirmacao-email.js';
import { renderPayPerViewTransmissaoEmailHtml } from '../templates/pay-per-view-transmissao-email.js';
import {
  findPedidosPayPerViewParaTransmissao,
  updatePedidoTransmissaoStatus
} from '../repositories/pedidos-repository.js';
import { APPROVED_PAYMENT_STATUS_VALUES } from './payment-events.js';

const isValidEmail = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const buildEventoDados = () => ({
  nome: process.env.EVENTO_NOME || 'Avalanche Fight Championship',
  data: process.env.EVENTO_DATA || '15 de agosto de 2026',
  horario: process.env.EVENTO_HORARIO || '19h',
  local: process.env.EVENTO_LOCAL || 'Ginásio de Esportes JK',
  endereco: process.env.EVENTO_ENDERECO || 'Rua Ângelo Amaral, 2 — Jardim Joana D\'Arc, Campo Mourão — Paraná',
  dominio: process.env.SITE_URL || 'https://www.afcevents.com.br'
});

export const validateTransmissaoLink = (link) => {
  if (typeof link !== 'string' || !link.trim()) {
    throw new Error('Link da transmissão é obrigatório.');
  }

  let parsed;
  try {
    parsed = new URL(link.trim());
  } catch {
    throw new Error('Link da transmissão inválido.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('O link da transmissão deve usar HTTPS.');
  }

  return parsed.href;
};

export const enviarConfirmacaoPayPerView = async (payload, options = {}) => {
  const { comprador, email, pedido, quantidade, dadosEvento } = payload || {};
  const { resendClient } = options;
  const evento = dadosEvento || buildEventoDados();

  const apiKey = typeof resendClient === 'undefined' ? process.env.RESEND_API_KEY?.trim() : '';
  if (!resendClient && !apiKey) {
    throw new Error('RESEND_API_KEY não configurada.');
  }

  const destinatario = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!isValidEmail(destinatario)) {
    throw new Error('E-mail inválido.');
  }

  const html = renderPayPerViewConfirmacaoEmailHtml({
    compradorNome: comprador?.nome || comprador?.name || '',
    eventoNome: evento.nome,
    dataEvento: evento.data,
    horarioEvento: evento.horario,
    localEvento: evento.local,
    enderecoEvento: evento.endereco,
    quantidade: quantidade || pedido?.quantidade || 1,
    codigoPedido: pedido?.codigo_pedido || '',
    dominio: evento.dominio
  });

  const resend = resendClient || new Resend(apiKey);
  const response = await resend.emails.send({
    from: 'AFC Ingressos <ingressos@afcevents.com.br>',
    to: [destinatario],
    subject: 'Pay-Per-View confirmado — Avalanche Fight Championship',
    html
  });

  if (response.error) {
    throw new Error(response.error.message || 'Falha ao enviar e-mail via Resend.');
  }

  return response.data?.id || null;
};

export const enviarLinkTransmissao = async ({ pedido, link, dadosEvento }, options = {}) => {
  const { resendClient } = options;
  const evento = dadosEvento || buildEventoDados();
  const safeLink = validateTransmissaoLink(link);

  const apiKey = typeof resendClient === 'undefined' ? process.env.RESEND_API_KEY?.trim() : '';
  if (!resendClient && !apiKey) {
    throw new Error('RESEND_API_KEY não configurada.');
  }

  const destinatario = typeof pedido?.email === 'string' ? pedido.email.trim().toLowerCase() : '';
  if (!isValidEmail(destinatario)) {
    throw new Error('E-mail inválido.');
  }

  const html = renderPayPerViewTransmissaoEmailHtml({
    compradorNome: pedido?.nome || '',
    eventoNome: evento.nome,
    dataEvento: evento.data,
    horarioEvento: evento.horario,
    linkTransmissao: safeLink,
    dominio: evento.dominio
  });

  const resend = resendClient || new Resend(apiKey);
  const response = await resend.emails.send({
    from: 'AFC Ingressos <ingressos@afcevents.com.br>',
    to: [destinatario],
    subject: 'Acesso à transmissão — Avalanche Fight Championship',
    html
  });

  if (response.error) {
    throw new Error(response.error.message || 'Falha ao enviar e-mail via Resend.');
  }

  return response.data?.id || null;
};

export const listarPedidosParaTransmissao = async ({ reenviar = false } = {}) => {
  return findPedidosPayPerViewParaTransmissao({
    reenviar,
    approvedStatuses: APPROVED_PAYMENT_STATUS_VALUES
  });
};

export const enviarLinkTransmissaoEmMassa = async (
  { link, reenviar = false },
  {
    listar = listarPedidosParaTransmissao,
    enviar = enviarLinkTransmissao,
    atualizarStatus = updatePedidoTransmissaoStatus
  } = {}
) => {
  const safeLink = validateTransmissaoLink(link);
  const pedidos = await listar({ reenviar });
  const resumo = {
    total: pedidos.length,
    enviados: 0,
    falhas: 0,
    detalhes: []
  };

  for (const pedido of pedidos) {
    try {
      const emailId = await enviar({ pedido, link: safeLink });
      await atualizarStatus(pedido.id, {
        transmissao_link: safeLink,
        transmissao_enviada: true,
        transmissao_enviada_em: new Date().toISOString(),
        transmissao_tentativas: (pedido.transmissao_tentativas || 0) + 1,
        transmissao_ultimo_erro: null
      });
      resumo.enviados += 1;
      resumo.detalhes.push({
        pedidoId: pedido.id,
        codigoPedido: pedido.codigo_pedido,
        email: pedido.email,
        status: 'enviado',
        emailId
      });
    } catch (error) {
      await atualizarStatus(pedido.id, {
        transmissao_link: safeLink,
        transmissao_enviada: false,
        transmissao_tentativas: (pedido.transmissao_tentativas || 0) + 1,
        transmissao_ultimo_erro: error?.message || 'Falha ao enviar e-mail.'
      }).catch(() => {});
      resumo.falhas += 1;
      resumo.detalhes.push({
        pedidoId: pedido.id,
        codigoPedido: pedido.codigo_pedido,
        email: pedido.email,
        status: 'falha',
        erro: error?.message || 'Falha ao enviar e-mail.'
      });
    }
  }

  return resumo;
};
