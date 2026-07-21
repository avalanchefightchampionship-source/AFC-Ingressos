import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminWebhookReprocessHandler } from '../api/admin/webhook/reprocess.js';
import { createAdminSessionSetCookie } from '../lib/admin-auth.js';

const createResponse = () => {
  let statusCode = 200;
  let jsonBody = null;
  return {
    setHeader() {},
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
    },
    get statusCode() {
      return statusCode;
    },
    get jsonBody() {
      return jsonBody;
    }
  };
};

const createAuthCookieHeader = () => {
  const secret = 's'.repeat(64);
  process.env.ADMIN_SESSION_SECRET = secret;
  return createAdminSessionSetCookie({ sub: 'admin', role: 'admin' }, {
    secret,
    isProduction: false
  });
};

test('reprocessa PAYMENT_RECEIVED já salvo com reserva atômica', async () => {
  const calls = {
    reopen: 0,
    claim: 0,
    process: 0,
    mark: 0,
    release: 0
  };

  const handler = createAdminWebhookReprocessHandler({
    findEvent: async () => ({
      id: 'stored-1',
      event_id: 'evt_paid_1',
      event_type: 'PAYMENT_RECEIVED',
      processed: true,
      processing: false,
      payload: {
        id: 'evt_paid_1',
        event: 'PAYMENT_RECEIVED',
        payment: { id: 'pay_1', externalReference: null, checkoutSession: 'chk_1' }
      }
    }),
    reopenEvent: async () => { calls.reopen += 1; return { id: 'stored-1' }; },
    claimEvent: async () => { calls.claim += 1; return true; },
    processEvent: async () => {
      calls.process += 1;
      return { result: 'PEDIDO_ATUALIZADO', pedidoId: 'pedido-1', codigoPedido: 'AFC-1' };
    },
    markEventProcessed: async () => { calls.mark += 1; },
    releaseEvent: async () => { calls.release += 1; }
  });

  const response = createResponse();
  await handler({
    method: 'POST',
    headers: { cookie: createAuthCookieHeader() },
    body: { eventId: 'evt_paid_1' }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.jsonBody.reprocessed, true);
  assert.equal(response.jsonBody.orderFound, true);
  assert.equal(calls.reopen, 1);
  assert.equal(calls.claim, 1);
  assert.equal(calls.process, 1);
  assert.equal(calls.mark, 1);
  assert.equal(calls.release, 0);
});

test('bloqueia reprocessamento para evento diferente de PAYMENT_RECEIVED', async () => {
  const handler = createAdminWebhookReprocessHandler({
    findEvent: async () => ({
      id: 'stored-2',
      event_id: 'evt_other',
      event_type: 'PAYMENT_CONFIRMED',
      processed: true,
      processing: false,
      payload: {}
    })
  });

  const response = createResponse();
  await handler({
    method: 'POST',
    headers: { cookie: createAuthCookieHeader() },
    body: { eventId: 'evt_other' }
  }, response);

  assert.equal(response.statusCode, 400);
});

test('não reprocessa quando não consegue reservar evento', async () => {
  const calls = { claim: 0, process: 0 };
  const handler = createAdminWebhookReprocessHandler({
    findEvent: async () => ({
      id: 'stored-3',
      event_id: 'evt_paid_2',
      event_type: 'PAYMENT_RECEIVED',
      processed: false,
      processing: false,
      payload: {}
    }),
    claimEvent: async () => { calls.claim += 1; return false; },
    processEvent: async () => { calls.process += 1; }
  });

  const response = createResponse();
  await handler({
    method: 'POST',
    headers: { cookie: createAuthCookieHeader() },
    body: { eventId: 'evt_paid_2' }
  }, response);

  assert.equal(response.statusCode, 409);
  assert.equal(calls.claim, 1);
  assert.equal(calls.process, 0);
});
