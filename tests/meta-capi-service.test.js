import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { __metaCapiInternals, sendMetaPurchaseEvent } from '../services/meta-capi-service.js';

const hashSha256 = (value) => createHash('sha256').update(value).digest('hex');

const withEnv = async (patch, fn) => {
  const snapshot = {
    META_PIXEL_ID: process.env.META_PIXEL_ID,
    META_CAPI_ACCESS_TOKEN: process.env.META_CAPI_ACCESS_TOKEN,
    META_TEST_EVENT_CODE: process.env.META_TEST_EVENT_CODE,
    SITE_URL: process.env.SITE_URL,
    EVENTO_CIDADE: process.env.EVENTO_CIDADE,
    EVENTO_ESTADO: process.env.EVENTO_ESTADO,
    EVENTO_CEP: process.env.EVENTO_CEP,
    EVENTO_PAIS: process.env.EVENTO_PAIS
  };

  Object.entries(patch).forEach(([key, value]) => {
    if (typeof value === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });

  try {
    await fn();
  } finally {
    Object.entries(snapshot).forEach(([key, value]) => {
      if (typeof value === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
};

test('buildPurchaseEvent monta Purchase com campos obrigatórios', async () => {
  await withEnv({ SITE_URL: 'https://www.afcevents.com.br/' }, async () => {
    const event = __metaCapiInternals.buildPurchaseEvent({
      pedido: {
        id: 'pedido-1',
        nome: 'João da Silva',
        email: 'joao@example.com',
        telefone: '(44) 99999-9999',
        tipo_ingresso: 'arquibancada',
        quantidade: 3,
        valor_total: 150
      },
      eventId: 'evt-1',
      paymentId: 'pay-1',
      eventTime: 1_760_000_000
    });

    assert.equal(event.event_name, 'Purchase');
    assert.equal(event.event_time, 1_760_000_000);
    assert.equal(event.action_source, 'website');
    assert.equal(event.event_source_url, 'https://www.afcevents.com.br/');
    assert.equal(event.custom_data.currency, 'BRL');
    assert.equal(event.custom_data.content_type, 'product');
    assert.deepEqual(event.custom_data.content_ids, ['afc-2026-arquibancada']);
    assert.equal(event.custom_data.value, 150);
    assert.equal(event.custom_data.num_items, 3);
    assert.match(event.event_id, /^purchase_pedido-1_pay-1$/);

    assert.match(event.user_data.em, /^[a-f0-9]{64}$/);
    assert.match(event.user_data.ph, /^[a-f0-9]{64}$/);
    assert.match(event.user_data.fn, /^[a-f0-9]{64}$/);
    assert.match(event.user_data.ln, /^[a-f0-9]{64}$/);
    assert.equal(event.user_data.ct, undefined);
    assert.equal(event.user_data.st, undefined);
    assert.equal(event.user_data.zp, undefined);
    assert.equal(event.user_data.country, hashSha256('br'));
  });
});

test('buildUserData omite campos inválidos e envia city/state/zip somente quando presentes', async () => {
  const emptyAddress = __metaCapiInternals.buildUserData({
    nome: 'Mononome',
    email: 'email-invalido',
    telefone: '1234'
  });

  assert.equal(emptyAddress.em, undefined);
  assert.equal(emptyAddress.ph, undefined);
  assert.match(emptyAddress.fn, /^[a-f0-9]{64}$/);
  assert.equal(emptyAddress.ln, undefined);
  assert.equal(emptyAddress.ct, undefined);
  assert.equal(emptyAddress.st, undefined);
  assert.equal(emptyAddress.zp, undefined);
  assert.equal(emptyAddress.country, hashSha256('br'));

  const fullAddress = __metaCapiInternals.buildUserData({
    nome: 'Maria de Souza',
    email: 'maria@example.com',
    telefone: '(44) 99999-1111',
    cidade: 'Campo Mourão',
    estado: 'PR',
    cep: '87300-000'
  });

  assert.match(fullAddress.em, /^[a-f0-9]{64}$/);
  assert.match(fullAddress.ph, /^[a-f0-9]{64}$/);
  assert.match(fullAddress.fn, /^[a-f0-9]{64}$/);
  assert.match(fullAddress.ln, /^[a-f0-9]{64}$/);
  assert.match(fullAddress.ct, /^[a-f0-9]{64}$/);
  assert.match(fullAddress.st, /^[a-f0-9]{64}$/);
  assert.match(fullAddress.zp, /^[a-f0-9]{64}$/);
  assert.equal(fullAddress.country, hashSha256('br'));
});

test('ausência de city/state/zip não impede envio do Purchase', async () => {
  await withEnv({
    META_PIXEL_ID: '3169175496623984',
    META_CAPI_ACCESS_TOKEN: 'token-test'
  }, async () => {
    const requests = [];
    const fetchImpl = async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return { events_received: 1 };
        }
      };
    };

    const result = await sendMetaPurchaseEvent({
      pedido: {
        id: 'pedido-sem-endereco',
        nome: 'Pedro Alves',
        email: 'pedro@example.com',
        telefone: '44999997777',
        tipo_ingresso: 'arquibancada',
        quantidade: 1,
        valor_total: 50
      },
      eventId: 'evt-sem-endereco',
      paymentId: 'pay-sem-endereco'
    }, { fetchImpl, timeoutMs: 50 });

    assert.equal(result.sent, true);
    assert.equal(requests.length, 1);
    const body = JSON.parse(requests[0].init.body);
    const userData = body.data[0].user_data;
    assert.equal(userData.ct, undefined);
    assert.equal(userData.st, undefined);
    assert.equal(userData.zp, undefined);
    assert.ok(userData.country);
  });
});

test('sendMetaPurchaseEvent inclui test_event_code quando configurado', async () => {
  await withEnv({
    META_PIXEL_ID: '3169175496623984',
    META_CAPI_ACCESS_TOKEN: 'token-test',
    META_TEST_EVENT_CODE: 'TEST123'
  }, async () => {
    const requests = [];
    const fetchImpl = async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return { events_received: 1, fbtrace_id: 'trace-1' };
        }
      };
    };

    const result = await sendMetaPurchaseEvent({
      pedido: {
        id: 'pedido-2',
        nome: 'Maria Oliveira',
        email: 'maria@example.com',
        telefone: '44911112222',
        tipo_ingresso: 'vip',
        quantidade: 1,
        valor_total: 100
      },
      eventId: 'evt-2',
      paymentId: 'pay-2'
    }, { fetchImpl, timeoutMs: 50 });

    assert.equal(result.sent, true);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /graph\.facebook\.com\/v20\.0\/3169175496623984\/events$/);

    const body = JSON.parse(requests[0].init.body);
    assert.equal(body.test_event_code, 'TEST123');
    assert.equal(body.data[0].event_name, 'Purchase');
  });
});

test('falha da Meta retorna sent=false e não lança erro', async () => {
  await withEnv({
    META_PIXEL_ID: '3169175496623984',
    META_CAPI_ACCESS_TOKEN: 'token-test',
    META_TEST_EVENT_CODE: undefined
  }, async () => {
    const errors = [];
    const logger = {
      error(message, details) {
        errors.push({ message, details });
      }
    };
    const fetchImpl = async () => ({
      ok: false,
      status: 503,
      async json() {
        return { error: { message: 'service unavailable' } };
      }
    });

    const result = await sendMetaPurchaseEvent({
      pedido: {
        id: 'pedido-3',
        nome: 'Carlos',
        email: 'carlos@example.com',
        telefone: '44933334444',
        tipo_ingresso: 'arquibancada',
        quantidade: 1,
        valor_total: 50
      },
      eventId: 'evt-3',
      paymentId: 'pay-3'
    }, { fetchImpl, logger, timeoutMs: 50 });

    assert.equal(result.sent, false);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /Meta CAPI Purchase failed\./);
  });
});

test('quando não configurado, serviço não envia evento', async () => {
  await withEnv({
    META_PIXEL_ID: undefined,
    META_CAPI_ACCESS_TOKEN: undefined,
    META_TEST_EVENT_CODE: undefined
  }, async () => {
    let fetchCalls = 0;
    const errors = [];
    const logger = {
      error(message, details) {
        errors.push({ message, details });
      }
    };
    const fetchImpl = async () => {
      fetchCalls += 1;
      return { ok: true, status: 200, async json() { return {}; } };
    };

    const result = await sendMetaPurchaseEvent({
      pedido: {
        id: 'pedido-4',
        nome: 'Sem Config',
        email: 'sem-config@example.com',
        telefone: '44900000000',
        tipo_ingresso: 'arquibancada',
        quantidade: 1,
        valor_total: 50
      },
      eventId: 'evt-4',
      paymentId: 'pay-4'
    }, { fetchImpl, logger });

    assert.equal(result.sent, false);
    assert.equal(result.skipped, true);
    assert.equal(fetchCalls, 0);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /missing configuration/);
  });
});
