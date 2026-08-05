import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSessionCookie } from '../lib/admin-auth.js';
import { createReenviarIngressosHandler } from '../api/admin/pedidos/reenviar-email.js';
import {
  buildMensagemLembretePadrao,
  reenviarIngressosEmMassa,
  reenviarIngressosPorEmail
} from '../services/reenviar-ingressos-service.js';

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

test('reenviarIngressosPorEmail reenvia confirmação Pay-Per-View', async () => {
  const pedido = {
    id: 'pedido-ppv-1',
    codigo_pedido: 'AFC-PPV001',
    nome: 'Karla Aono',
    email: 'karlaaono70@gmail.com',
    tipo_ingresso: 'pay-per-view',
    quantidade: 1,
    status_pagamento: 'PAGAMENTO_CONFIRMADO',
    email_tentativas: 1
  };
  let confirmacaoPayload = null;

  const result = await reenviarIngressosPorEmail(
    { email: pedido.email },
    {
      buscarPedido: async () => pedido,
      enviarConfirmacao: async (payload) => {
        confirmacaoPayload = payload;
        return 'ppv-email-123';
      },
      atualizarStatus: async (pedidoId, data) => ({ ...pedido, ...data })
    }
  );

  assert.equal(result.codigoPedido, 'AFC-PPV001');
  assert.equal(result.tipoIngresso, 'pay-per-view');
  assert.equal(result.emailId, 'ppv-email-123');
  assert.equal(confirmacaoPayload.email, 'karlaaono70@gmail.com');
  assert.equal(confirmacaoPayload.pedido.codigo_pedido, 'AFC-PPV001');
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

test('buildMensagemLembretePadrao inclui nome do evento', () => {
  const message = buildMensagemLembretePadrao({ nome: 'Avalanche Fight Championship' });
  assert.match(message, /10 dias/);
  assert.match(message, /Avalanche Fight Championship/);
  assert.match(message, /portaria/i);
});

test('reenviarIngressosEmMassa envia lembrete para pedidos pagos de ingresso físico', async () => {
  const pedidos = [
    {
      id: 'p1',
      codigo_pedido: 'AFC-1',
      nome: 'Ana',
      email: 'ana@example.com',
      tipo_ingresso: 'arquibancada',
      quantidade: 1,
      status_pagamento: 'PAGO',
      email_tentativas: 0
    },
    {
      id: 'p2',
      codigo_pedido: 'AFC-2',
      nome: 'Bruno',
      email: 'bruno@example.com',
      tipo_ingresso: 'vip',
      quantidade: 2,
      status_pagamento: 'PAGAMENTO_CONFIRMADO',
      email_tentativas: 1
    }
  ];
  const payloads = [];

  const resumo = await reenviarIngressosEmMassa(
    { mensagemDestaque: 'Faltam apenas 10 dias para o AFC! Mostre seus ingressos na portaria.' },
    {
      listarPedidos: async () => pedidos,
      listarIngressos: async (pedidoId) => [{
        pedido_id: pedidoId,
        codigo_ingresso: `ING-${pedidoId}`,
        qr_code: 'AFC:1:111111111111111111111111111111111111',
        categoria: pedidoId === 'p2' ? 'vip' : 'arquibancada'
      }],
      enviarEmail: async (payload) => {
        payloads.push(payload);
        return 'email-id';
      },
      atualizarStatus: async () => ({})
    }
  );

  assert.equal(resumo.total, 2);
  assert.equal(resumo.enviados, 2);
  assert.equal(resumo.falhas, 0);
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].mensagemDestaque, 'Faltam apenas 10 dias para o AFC! Mostre seus ingressos na portaria.');
  assert.equal(payloads[1].email, 'bruno@example.com');
});

test('endpoint admin reenviar-email retorna resumo do reenvio em massa', async () => {
  const secret = 'test-session-secret';
  const cookie = createAdminSessionCookie({ sub: 'admin' }, { secret, expiresInMs: 60_000 });
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = secret;

  try {
    const handler = createReenviarIngressosHandler({
      reenviarEmMassa: async () => ({ total: 3, enviados: 3, falhas: 0, detalhes: [] })
    });
    const response = createMockResponse();

    await handler({
      method: 'POST',
      body: { mensagemDestaque: 'Mostre seus ingressos na portaria.' },
      headers: { cookie: `afc_admin_session=${cookie}` }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.total, 3);
    assert.equal(response.body.enviados, 3);
  } finally {
    process.env.ADMIN_SESSION_SECRET = previousSecret;
  }
});
