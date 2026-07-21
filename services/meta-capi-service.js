import { createHash } from 'node:crypto';

const META_API_BASE = 'https://graph.facebook.com/v20.0';
const PURCHASE_CONTENT_IDS = {
  arquibancada: 'afc-2026-arquibancada',
  vip: 'afc-2026-vip'
};
const PURCHASE_PRICE_BY_TYPE = {
  arquibancada: 50,
  vip: 100
};

const normalizeText = (value) => {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const normalizeDigits = (value) => {
  if (typeof value !== 'string') return '';
  return value.replace(/\D/g, '');
};

const isValidEmail = (value) => {
  if (typeof value !== 'string') return false;
  const normalized = normalizeText(value);
  if (!normalized || normalized.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
};

const isValidPhone = (value) => {
  const digits = normalizeDigits(value);
  return digits.length >= 10 && digits.length <= 11;
};

const isValidCity = (value) => {
  if (typeof value !== 'string') return false;
  const normalized = normalizeText(value).replace(/\s+/g, ' ').trim();
  return normalized.length >= 2;
};

const isValidState = (value) => {
  if (typeof value !== 'string') return false;
  const normalized = normalizeText(value).replace(/\s+/g, ' ').trim();
  return normalized.length >= 2;
};

const isValidZip = (value) => normalizeDigits(value).length === 8;

const hashSha256 = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return null;
  return createHash('sha256').update(normalized).digest('hex');
};

const splitName = (fullName) => {
  const cleaned = normalizeText(fullName).replace(/\s+/g, ' ').trim();
  if (!cleaned) return { firstName: '', lastName: '' };

  const parts = cleaned.split(' ');
  const firstName = parts[0] || '';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
  return { firstName, lastName };
};

const buildUserData = (pedido) => {
  const { firstName, lastName } = splitName(pedido?.nome || '');
  const userData = {
    country: hashSha256(normalizeText('br'))
  };

  if (isValidEmail(pedido?.email)) {
    userData.em = hashSha256(normalizeText(pedido.email));
  }

  if (isValidPhone(pedido?.telefone)) {
    userData.ph = hashSha256(normalizeDigits(pedido.telefone));
  }

  if (firstName) {
    userData.fn = hashSha256(firstName);
  }

  if (lastName) {
    userData.ln = hashSha256(lastName);
  }

  if (isValidCity(pedido?.cidade)) {
    userData.ct = hashSha256(normalizeText(pedido.cidade));
  }

  if (isValidState(pedido?.estado)) {
    userData.st = hashSha256(normalizeText(pedido.estado));
  }

  if (isValidZip(pedido?.cep)) {
    userData.zp = hashSha256(normalizeDigits(pedido.cep));
  }

  return userData;
};

const buildEventSourceUrl = () => {
  const fallback = 'https://www.afcevents.com.br';
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw);
    parsed.search = '';
    parsed.hash = '';
    return parsed.href;
  } catch {
    return fallback;
  }
};

const resolveValue = (pedido, numItems) => {
  const numericTotal = Number(pedido?.valor_total);
  if (Number.isFinite(numericTotal) && numericTotal > 0) return numericTotal;

  const type = typeof pedido?.tipo_ingresso === 'string' ? pedido.tipo_ingresso : '';
  const price = PURCHASE_PRICE_BY_TYPE[type];
  if (!Number.isFinite(price)) return 0;
  return Number((price * numItems).toFixed(2));
};

const buildPurchaseEvent = ({ pedido, eventId, paymentId, eventTime }) => {
  const type = typeof pedido?.tipo_ingresso === 'string' ? pedido.tipo_ingresso : '';
  const numItems = Number.isInteger(pedido?.quantidade) && pedido.quantidade > 0
    ? pedido.quantidade
    : 1;
  const contentId = PURCHASE_CONTENT_IDS[type] || type || 'afc-2026-arquibancada';

  return {
    event_name: 'Purchase',
    event_time: Number.isInteger(eventTime) ? eventTime : Math.floor(Date.now() / 1000),
    event_id: `purchase_${pedido?.id || 'unknown'}_${paymentId || eventId || 'no_payment'}`,
    action_source: 'website',
    event_source_url: buildEventSourceUrl(),
    user_data: buildUserData(pedido),
    custom_data: {
      value: resolveValue(pedido, numItems),
      currency: 'BRL',
      content_type: 'product',
      content_ids: [contentId],
      num_items: numItems
    }
  };
};

const buildPayload = (event) => {
  const payload = { data: [event] };
  const testEventCode = process.env.META_TEST_EVENT_CODE?.trim();
  if (testEventCode) payload.test_event_code = testEventCode;
  return payload;
};

export const sendMetaPurchaseEvent = async (
  { pedido, eventId, paymentId, eventTime },
  { fetchImpl = fetch, logger = console, timeoutMs = 4000 } = {}
) => {
  const pixelId = process.env.META_PIXEL_ID?.trim();
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN?.trim();

  if (!pixelId || !accessToken) {
    logger.error('Meta CAPI Purchase skipped: missing configuration.', {
      hasPixelId: Boolean(pixelId),
      hasAccessToken: Boolean(accessToken)
    });
    return { sent: false, skipped: true, reason: 'meta_not_configured' };
  }

  const event = buildPurchaseEvent({ pedido, eventId, paymentId, eventTime });
  const payload = buildPayload(event);
  const url = `${META_API_BASE}/${encodeURIComponent(pixelId)}/events`;

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...payload,
        access_token: accessToken
      }),
      signal: abortController.signal
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.error) {
      logger.error('Meta CAPI Purchase failed.', {
        status: response.status,
        eventId: event.event_id,
        error: body?.error || null
      });
      return { sent: false, status: response.status, eventId: event.event_id };
    }

    return {
      sent: true,
      eventId: event.event_id,
      traceId: body?.fbtrace_id || null
    };
  } catch (error) {
    logger.error('Meta CAPI Purchase request error.', {
      eventId: event.event_id,
      name: error?.name || 'Error',
      message: error?.message || 'Unknown error'
    });
    return { sent: false, eventId: event.event_id, error: error?.message || 'request_error' };
  } finally {
    clearTimeout(timeout);
  }
};

export const __metaCapiInternals = {
  buildPurchaseEvent,
  buildUserData,
  hashSha256,
  normalizeText,
  normalizeDigits,
  isValidEmail,
  isValidPhone,
  isValidCity,
  isValidState,
  isValidZip,
  resolveValue
};
