import { getAdminCookieValue, verifyAdminSessionCookie } from '../../../lib/admin-auth.js';
import { processPaymentEvent } from '../../../services/payment-events.js';
import {
  claimWebhookEvent,
  findWebhookEventByEventId,
  markWebhookEventProcessed,
  releaseWebhookEvent,
  reopenWebhookEventForReprocessing
} from '../../../repositories/webhook-events-repository.js';

const sendJson = (response, status, body) => {
  response.status(status).json(body);
};

const parseRequestBody = (request) => {
  const body = request.body;
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return body;

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8'));
    } catch {
      return {};
    }
  }

  return {};
};

export const createAdminWebhookReprocessHandler = ({
  findEvent = findWebhookEventByEventId,
  reopenEvent = reopenWebhookEventForReprocessing,
  claimEvent = claimWebhookEvent,
  processEvent = processPaymentEvent,
  markEventProcessed = markWebhookEventProcessed,
  releaseEvent = releaseWebhookEvent
} = {}) => async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Método não permitido.' });
  }

  const cookieValue = getAdminCookieValue(request);
  const session = verifyAdminSessionCookie(cookieValue, { secret: process.env.ADMIN_SESSION_SECRET });
  if (!session) {
    return sendJson(response, 401, { error: 'Não autenticado.' });
  }

  const body = parseRequestBody(request);
  const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
  if (!eventId || eventId.length > 200) {
    return sendJson(response, 400, { error: 'eventId inválido.' });
  }

  const storedEvent = await findEvent(eventId);
  if (!storedEvent) {
    return sendJson(response, 404, { error: 'Evento não encontrado.' });
  }

  if (storedEvent.event_type !== 'PAYMENT_RECEIVED') {
    return sendJson(response, 400, {
      error: 'Somente eventos PAYMENT_RECEIVED podem ser reprocessados por este endpoint.'
    });
  }

  if (storedEvent.processing) {
    return sendJson(response, 409, { error: 'Evento já está em processamento.' });
  }

  if (storedEvent.processed) {
    await reopenEvent({ webhookEventId: storedEvent.id, eventType: 'PAYMENT_RECEIVED' });
  }

  const claimed = await claimEvent(storedEvent.id);
  if (!claimed) {
    return sendJson(response, 409, { error: 'Não foi possível reservar o evento para reprocessamento.' });
  }

  try {
    const processing = await processEvent(storedEvent.payload || {});
    await markEventProcessed(storedEvent.id);

    return sendJson(response, 200, {
      reprocessed: true,
      result: processing.result,
      orderFound: processing.result !== 'PEDIDO_NAO_ENCONTRADO',
      pedidoId: processing.pedidoId || null,
      codigoPedido: processing.codigoPedido || null
    });
  } catch (error) {
    await releaseEvent(storedEvent.id);
    console.error('Falha ao reprocessar evento de cobrança.', {
      eventId,
      code: error?.code || null,
      message: error?.message || null
    });
    return sendJson(response, 500, { error: 'Falha ao reprocessar evento.' });
  }
};

export default createAdminWebhookReprocessHandler();
