import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSessionCookie } from '../lib/admin-auth.js';
import { createReenviarIngressosHandler } from '../api/admin/pedidos/reenviar-email.js';
import { reenviarIngressosPorEmail } from '../services/reenviar-ingressos-service.js';

const createMockResponse = () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader() {
      return this;
    }
  };
  return response;
};

test('reenviarIngressosPorEmail envia ingressos existentes para o e-mail do pedido', async () => {
  const pedido = {
    id: 'pedido-1',
    codigo_pedido: 'AFC-DDB90F82',
    nome: 'Marcílio ramos Ferreira',
    email: 'fran_naberezny@hotmail.com',
    tipo_ingresso: 'arquibancada',
    quantidade: 1,
    status_pagamento: 'PAGAMENTO_CONFIRMADO',
    email_tentativas: 1
  };
  const ingressos = [{ codigo_ingresso: 'AFC-123', qr_code: 'AFC:1:123', categoria: 'arquibancada' }];
  let emailPayload = null;

  const result = await reenviarIngressosPorEmail(
    { email: pedido.email },
    {
      buscarPedido: async () => pedido,
      listarIngressos: async () => ingressos,
      enviarEmail: async (payload) => {
        emailPayload = payload;
        return 'email-123';
      },
      atualizarStatus: async (pedidoId, data) => ({ ...pedido, ...data })
    }
  );

  assert.equal(result.codigoPedido, 'AFC-DDB90F82');
  assert.equal(result.emailId, 'email-123');
  assert.equal(emailPayload.email, 'fran_naberezny@hotmail.com');
  assert.equal(emailPayload.ingressos.length, 1);
});

test('endpoint admin reenviar-email exige autenticação', async () => {
  const handler = createReenviarIngressosHandler({
    reenviar: async () => ({ codigoPedido: 'AFC-1' })
  });
  const response = createMockResponse();

  await handler({ method: 'POST', body: { email: 'a@example.com' }, headers: {} }, response);

  assert.equal(response.statusCode, 401);
});

test('endpoint admin reenviar-email retorna sucesso', async () => {
  const secret = 'test-session-secret';
  const cookie = createAdminSessionCookie({ sub: 'admin' }, { secret, expiresInMs: 60_000 });
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = secret;

  try {
    const handler = createReenviarIngressosHandler({
      reenviar: async () => ({
        codigoPedido: 'AFC-DDB90F82',
        email: 'fran_naberezny@hotmail.com',
        quantidadeIngressos: 1,
        emailId: 'email-123'
      })
    });
    const response = createMockResponse();

    await handler({
      method: 'POST',
      body: { email: 'fran_naberezny@hotmail.com' },
      headers: { cookie: `afc_admin_session=${cookie}` }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.codigoPedido, 'AFC-DDB90F82');
  } finally {
    process.env.ADMIN_SESSION_SECRET = previousSecret;
  }
});
