import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmailTestHandler } from '../api/testar-email.js';

const createResponse = () => {
  let statusCode = 200;
  let body;

  return {
    response: {
      setHeader() {},
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        body = payload;
        return this;
      }
    },
    getStatusCode: () => statusCode,
    getBody: () => body
  };
};

test('endpoint aceita POST válido com token correto', async () => {
  process.env.EMAIL_TEST_TOKEN = 'a'.repeat(32);
  const handler = createEmailTestHandler(async (destinatario) => ({ id: `sent:${destinatario}` }));
  const { response, getStatusCode, getBody } = createResponse();

  await handler({
    method: 'POST',
    headers: { 'x-afc-test-token': 'a'.repeat(32) },
    body: { email: 'teste@example.com' }
  }, response);

  assert.equal(getStatusCode(), 200);
  assert.equal(getBody().ok, true);
  assert.equal(getBody().id, 'sent:teste@example.com');
});

test('endpoint retorna 401 para token incorreto', async () => {
  process.env.EMAIL_TEST_TOKEN = 'b'.repeat(32);
  const handler = createEmailTestHandler(async () => ({ id: 'sent' }));
  const { response, getStatusCode } = createResponse();

  await handler({
    method: 'POST',
    headers: { 'x-afc-test-token': 'token-incorreto' },
    body: { email: 'teste@example.com' }
  }, response);

  assert.equal(getStatusCode(), 401);
});

test('endpoint retorna 400 para e-mail inválido', async () => {
  process.env.EMAIL_TEST_TOKEN = 'c'.repeat(32);
  const handler = createEmailTestHandler(async () => ({ id: 'sent' }));
  const { response, getStatusCode } = createResponse();

  await handler({
    method: 'POST',
    headers: { 'x-afc-test-token': 'c'.repeat(32) },
    body: { email: 'email-invalido' }
  }, response);

  assert.equal(getStatusCode(), 400);
});
