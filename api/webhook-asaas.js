import { timingSafeEqual } from 'node:crypto';
import { processPaymentEvent } from '../services/payment-events.js';
import {
  claimWebhookEvent,
  markWebhookEventProcessed,
  releaseWebhookEvent,
  saveWebhookEvent
} from '../repositories/webhook-events-repository.js';

const sendJson = (response, status, body) => {
  response.status(status).json(body);
};

const getHeader = (request, name) => {
  if (typeof request.headers?.get === 'function') return request.headers.get(name) || '';
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
};

const hasValidToken = (receivedToken, expectedToken) => {
  if (typeof receivedToken !== 'string' || typeof expectedToken !== 'string') return false;
  const received = Buffer.from(receivedToken, 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');
  return received.length === expected.length && timingSafeEqual(received, expected);
};

export const createWebhookHandler = ({
  saveEvent = saveWebhookEvent,
  claimEvent = claimWebhookEvent,
  markEventProcessed = markWebhookEventProcessed,
  releaseEvent = releaseWebhookEvent,
  processEvent = processPaymentEvent
} = {}) => async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Método não permitido.' });
  }

  const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN?.trim() || '';
  if (webhookToken.length < 32 || webhookToken.length > 255) {
    console.error('Configuração inválida do token do Webhook Asaas.');
    return sendJson(response, 500, { error: 'Webhook não configurado.' });
  }

  const receivedToken = getHeader(request, 'asaas-access-token');
  if (!hasValidToken(receivedToken, webhookToken)) {
    return sendJson(response, 401, { error: 'Não autorizado.' });
  }

  const payload = request.body;
  const eventId = typeof payload?.id === 'string' ? payload.id.trim() : '';
  const eventType = typeof payload?.event === 'string' ? payload.event.trim() : '';
  const paymentId = typeof payload?.payment?.id === 'string' ? payload.payment.id.trim() : '';

  if (!eventId || eventId.length > 200 || !eventType || eventType.length > 100 || !paymentId) {
    return sendJson(response, 400, { error: 'Evento inválido.' });
  }

  let storedEvent;
  try {
    storedEvent = await saveEvent({ eventId, eventType, payload });
  } catch (error) {
    console.error('Falha ao salvar Webhook Asaas.', {
      event_id: eventId,
      tipo: eventType,
      horario: new Date().toISOString(),
      resultado: 'ERRO_AO_SALVAR',
      code: error?.code || null
    });
    return sendJson(response, 503, { error: 'Evento não foi persistido.' });
  }

  if (storedEvent.duplicate && storedEvent.processed) {
    return sendJson(response, 200, { received: true, duplicate: true });
  }

  let claimed;
  try {
    claimed = await claimEvent(storedEvent.id);
  } catch (error) {
    console.error('Falha ao reservar Webhook Asaas para processamento.', {
      event_id: eventId,
      tipo: eventType,
      horario: new Date().toISOString(),
      resultado: 'ERRO_AO_RESERVAR',
      code: error?.code || null
    });
    return sendJson(response, 503, { error: 'Evento salvo e aguardando processamento.' });
  }

  if (!claimed) {
    return sendJson(response, 200, { received: true, duplicate: true });
  }

  try {
    const processing = await processEvent(payload);
    await markEventProcessed(storedEvent.id);

    return sendJson(response, 200, {
      received: true,
      processed: true,
      orderFound: processing.result !== 'PEDIDO_NAO_ENCONTRADO'
    });
  } catch (error) {
    try {
      await releaseEvent(storedEvent.id);
    } catch (releaseError) {
      console.error('Falha ao liberar Webhook Asaas para nova tentativa.', {
        event_id: eventId,
        tipo: eventType,
        horario: new Date().toISOString(),
        resultado: 'ERRO_AO_LIBERAR',
        code: releaseError?.code || null
      });
    }
    console.error('Falha ao processar Webhook Asaas.', {
      event_id: eventId,
      tipo: eventType,
      pedido: null,
      horario: new Date().toISOString(),
      resultado: 'ERRO_DE_PROCESSAMENTO',
      code: error?.code || null
    });
    return sendJson(response, 500, { error: 'Evento salvo, mas ainda não processado.' });
  }
};

export default createWebhookHandler();
