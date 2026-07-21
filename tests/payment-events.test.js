import assert from 'node:assert/strict';
import test from 'node:test';
import { createWebhookHandler } from '../api/webhook-asaas.js';
import { onPaymentApproved, processPaymentEvent } from '../services/payment-events.js';

const createRepository = ({ pedido = null } = {}) => {
  const updates = [];
  return {
    updates,
    async findByExternalReference() {
      return pedido;
    },
    async findByPaymentId() {
      return pedido;
    },
    async updatePaymentStatus(pedidoId, paymentData) {
      updates.push({ pedidoId, paymentData });
      return { ...pedido, ...paymentData };
    }
  };
};

const createEvent = (event, id = `evt_${event}`) => ({
  id,
  event,
  payment: {
    id: 'pay_test',
    externalReference: 'afc-test'
  }
});

const pedido = {
  id: 'pedido-1',
  codigo_pedido: 'AFC-TESTE',
  status_pagamento: 'AGUARDANDO_PAGAMENTO',
  status_pedido: 'CHECKOUT_CRIADO'
};

test('pagamento aprovado atualiza o pedido e chama onPaymentApproved', async () => {
  const repository = createRepository({ pedido });
  let approvedCalls = 0;

  const result = await processPaymentEvent(createEvent('PAYMENT_CONFIRMED'), {
    repository,
    approvedHandler: async () => { approvedCalls += 1; }
  });

  assert.equal(result.result, 'PEDIDO_ATUALIZADO');
  assert.equal(repository.updates[0].paymentData.status_pagamento, 'PAGAMENTO_CONFIRMADO');
  assert.equal(repository.updates[0].paymentData.status_pedido, 'PAGAMENTO_CONFIRMADO');
  assert.equal(repository.updates[0].paymentData.asaas_payment_id, 'pay_test');
  assert.equal(approvedCalls, 1);
});

test('pagamento estornado atualiza os dois status para ESTORNADO', async () => {
  const repository = createRepository({ pedido });

  await processPaymentEvent(createEvent('PAYMENT_REFUNDED'), { repository });

  assert.equal(repository.updates[0].paymentData.status_pagamento, 'ESTORNADO');
  assert.equal(repository.updates[0].paymentData.status_pedido, 'ESTORNADO');
});

test('pagamento vencido atualiza os dois status para VENCIDO', async () => {
  const repository = createRepository({ pedido });

  await processPaymentEvent(createEvent('PAYMENT_OVERDUE'), { repository });

  assert.equal(repository.updates[0].paymentData.status_pagamento, 'VENCIDO');
  assert.equal(repository.updates[0].paymentData.status_pedido, 'VENCIDO');
});

test('evento duplicado retorna sucesso sem processar novamente', async () => {
  Object.assign(process.env, { ASAAS_WEBHOOK_TOKEN: 't'.repeat(40) });
  let processCalls = 0;
  const handler = createWebhookHandler({
    saveEvent: async () => ({ duplicate: true, id: 'stored-event', processed: true }),
    claimEvent: async () => { throw new Error('Evento processado não deve ser reservado.'); },
    markEventProcessed: async () => {},
    releaseEvent: async () => {},
    processEvent: async () => { processCalls += 1; }
  });
  let statusCode;
  let body;
  const response = {
    setHeader() {},
    status(status) { statusCode = status; return this; },
    json(value) { body = value; }
  };

  await handler({
    method: 'POST',
    headers: { 'asaas-access-token': process.env.ASAAS_WEBHOOK_TOKEN },
    body: createEvent('PAYMENT_RECEIVED', 'evt_duplicate')
  }, response);

  assert.equal(statusCode, 200);
  assert.equal(body.duplicate, true);
  assert.equal(processCalls, 0);
});

test('pedido inexistente é preservado no webhook e endpoint retorna HTTP 200', async () => {
  const repository = createRepository();
  const result = await processPaymentEvent(createEvent('PAYMENT_RECEIVED'), { repository });
  assert.equal(result.result, 'PEDIDO_NAO_ENCONTRADO');
  assert.equal(repository.updates.length, 0);

  Object.assign(process.env, { ASAAS_WEBHOOK_TOKEN: 't'.repeat(40) });
  let markedAsProcessed = false;
  let statusCode;
  let body;
  const handler = createWebhookHandler({
    saveEvent: async () => ({ duplicate: false, id: 'stored-event-1' }),
    claimEvent: async () => true,
    markEventProcessed: async () => { markedAsProcessed = true; },
    releaseEvent: async () => {},
    processEvent: async () => result
  });
  const response = {
    setHeader() {},
    status(status) { statusCode = status; return this; },
    json(value) { body = value; }
  };

  await handler({
    method: 'POST',
    headers: { 'asaas-access-token': process.env.ASAAS_WEBHOOK_TOKEN },
    body: createEvent('PAYMENT_RECEIVED', 'evt_missing_order')
  }, response);

  assert.equal(statusCode, 200);
  assert.equal(body.orderFound, false);
  assert.equal(markedAsProcessed, true);
});

test('token de webhook inválido retorna HTTP 401 antes de salvar o evento', async () => {
  Object.assign(process.env, { ASAAS_WEBHOOK_TOKEN: 't'.repeat(40) });
  let saveCalls = 0;
  let statusCode;
  const handler = createWebhookHandler({
    saveEvent: async () => { saveCalls += 1; },
    claimEvent: async () => true,
    markEventProcessed: async () => {},
    releaseEvent: async () => {},
    processEvent: async () => {}
  });
  const response = {
    setHeader() {},
    status(status) { statusCode = status; return this; },
    json() {}
  };

  await handler({
    method: 'POST',
    headers: { 'asaas-access-token': 'token-incorreto' },
    body: createEvent('PAYMENT_RECEIVED', 'evt_unauthorized')
  }, response);

  assert.equal(statusCode, 401);
  assert.equal(saveCalls, 0);
});

test('evento salvo mas não processado pode ser retomado com reserva atômica', async () => {
  Object.assign(process.env, { ASAAS_WEBHOOK_TOKEN: 't'.repeat(40) });
  let processCalls = 0;
  let markedAsProcessed = false;
  let statusCode;
  const handler = createWebhookHandler({
    saveEvent: async () => ({
      duplicate: true,
      id: 'stored-pending-event',
      processed: false,
      processing: false
    }),
    claimEvent: async () => true,
    markEventProcessed: async () => { markedAsProcessed = true; },
    releaseEvent: async () => {},
    processEvent: async () => {
      processCalls += 1;
      return {
        result: 'PEDIDO_ATUALIZADO',
        pedidoId: 'pedido-retry',
        codigoPedido: 'AFC-RETRY'
      };
    }
  });
  const response = {
    setHeader() {},
    status(status) { statusCode = status; return this; },
    json() {}
  };

  await handler({
    method: 'POST',
    headers: { 'asaas-access-token': process.env.ASAAS_WEBHOOK_TOKEN },
    body: createEvent('PAYMENT_CONFIRMED', 'evt_retry')
  }, response);

  assert.equal(statusCode, 200);
  assert.equal(processCalls, 1);
  assert.equal(markedAsProcessed, true);
});

test('envio automático após aprovação envia um único e-mail e marca o pedido', async () => {
  const pedido = {
    id: 'pedido-email-1',
    codigo_pedido: 'AFC-EMAIL-1',
    nome: 'João da Silva',
    email: 'joao@example.com',
    status_pagamento: 'AGUARDANDO_PAGAMENTO',
    status_pedido: 'CHECKOUT_CRIADO',
    email_enviado: false,
    email_tentativas: 0
  };
  const sentPayloads = [];
  const updates = [];
  const emit = async () => [{
    pedido_id: pedido.id,
    codigo_ingresso: 'AFC-111111111111111111111111111111111111',
    categoria: 'vip',
    status: 'VALIDO',
    qr_code: 'AFC:1:111111111111111111111111111111111111',
    quantidade_esperada: 1,
    categoria_pedido: 'vip'
  }];
  const sendEmail = async (payload) => {
    sentPayloads.push(payload);
    return { id: 'sent-1' };
  };
  const updateEmailStatus = async (pedidoId, data) => {
    updates.push({ pedidoId, data });
    Object.assign(pedido, data);
    return { ...pedido, ...data };
  };

  const result = await onPaymentApproved({ pedido }, { emit, sendEmail, updateEmailStatus });

  assert.equal(result.emailSent, true);
  assert.equal(sentPayloads.length, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].data.email_enviado, true);
  assert.ok(updates[0].data.email_enviado_em);
  assert.equal(pedido.email_enviado, true);
});

test('pedido já marcado como enviado não recebe novo e-mail', async () => {
  const pedido = {
    id: 'pedido-email-2',
    codigo_pedido: 'AFC-EMAIL-2',
    nome: 'Maria',
    email: 'maria@example.com',
    status_pagamento: 'AGUARDANDO_PAGAMENTO',
    status_pedido: 'CHECKOUT_CRIADO',
    email_enviado: true,
    email_tentativas: 0
  };
  let sendCalls = 0;
  const emit = async () => [{
    pedido_id: pedido.id,
    codigo_ingresso: 'AFC-222222222222222222222222222222222222',
    categoria: 'arquibancada',
    status: 'VALIDO',
    qr_code: 'AFC:1:222222222222222222222222222222222222',
    quantidade_esperada: 1,
    categoria_pedido: 'arquibancada'
  }];
  const sendEmail = async () => {
    sendCalls += 1;
    return { id: 'sent-2' };
  };
  const updateEmailStatus = async () => { throw new Error('não deveria atualizar'); };

  const result = await onPaymentApproved({ pedido }, { emit, sendEmail, updateEmailStatus });

  assert.equal(result.emailSent, false);
  assert.equal(result.skipped, true);
  assert.equal(sendCalls, 0);
});

test('erro no Resend incrementa tentativas e preserva o fluxo', async () => {
  const pedido = {
    id: 'pedido-email-3',
    codigo_pedido: 'AFC-EMAIL-3',
    nome: 'Carlos',
    email: 'carlos@example.com',
    status_pagamento: 'AGUARDANDO_PAGAMENTO',
    status_pedido: 'CHECKOUT_CRIADO',
    email_enviado: false,
    email_tentativas: 0
  };
  const updates = [];
  const emit = async () => [{
    pedido_id: pedido.id,
    codigo_ingresso: 'AFC-333333333333333333333333333333333333',
    categoria: 'vip',
    status: 'VALIDO',
    qr_code: 'AFC:1:333333333333333333333333333333333333',
    quantidade_esperada: 1,
    categoria_pedido: 'vip'
  }];
  const sendEmail = async () => { throw new Error('resend failed'); };
  const updateEmailStatus = async (pedidoId, data) => {
    updates.push({ pedidoId, data });
    Object.assign(pedido, data);
    return { ...pedido, ...data };
  };

  const result = await onPaymentApproved({ pedido }, { emit, sendEmail, updateEmailStatus });

  assert.equal(result.emailSent, false);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].data.email_tentativas, 1);
  assert.equal(updates[0].data.email_ultimo_erro, 'resend failed');
  assert.equal(pedido.email_enviado, false);
});
