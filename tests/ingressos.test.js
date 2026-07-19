import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createQrCodeContent,
  createSecureTicketCode
} from '../lib/qr-code.js';
import { emitIngressos } from '../services/ingressos-service.js';
import { processPaymentEvent } from '../services/payment-events.js';

const createTransactionalEmitter = ({
  quantidade,
  categoria = 'vip',
  statusPagamento = 'PAGO',
  failAfter = null,
  onCommit = () => {}
}) => {
  let ingressos = [];
  let shouldFailAfter = failAfter;
  let queue = Promise.resolve();

  const emit = async (pedidoId) => {
    const previous = queue;
    let unlock;
    queue = new Promise((resolve) => { unlock = resolve; });
    await previous;

    const snapshot = [...ingressos];
    try {
      if (!['PAGAMENTO_CONFIRMADO', 'PAGO'].includes(statusPagamento)) {
        throw new Error('PAGAMENTO_NAO_APROVADO');
      }
      if (ingressos.length > quantidade) throw new Error('QUANTIDADE_INCONSISTENTE');

      const faltantes = quantidade - ingressos.length;
      for (let index = 0; index < faltantes; index += 1) {
        const codigo = createSecureTicketCode();
        ingressos.push({
          id: `ticket-${ingressos.length + 1}`,
          pedido_id: pedidoId,
          codigo_ingresso: codigo,
          categoria,
          status: 'VALIDO',
          utilizado: false,
          qr_code: createQrCodeContent(codigo),
          checkin_at: null,
          created_at: new Date().toISOString(),
          quantidade_esperada: quantidade,
          categoria_pedido: categoria
        });

        if (shouldFailAfter !== null && ingressos.length - snapshot.length >= shouldFailAfter) {
          shouldFailAfter = null;
          throw new Error('FALHA_TRANSACIONAL_SIMULADA');
        }
      }

      onCommit();
      return ingressos.map((ingresso) => ({ ...ingresso }));
    } catch (error) {
      ingressos = snapshot;
      throw error;
    } finally {
      unlock();
    }
  };

  return {
    emit,
    getIngressos: () => ingressos.map((ingresso) => ({ ...ingresso }))
  };
};

test('1. pedido pago com quantidade 1 gera exatamente 1 ingresso', async () => {
  const database = createTransactionalEmitter({ quantidade: 1 });
  const result = await emitIngressos('pedido-1', { emit: database.emit });
  assert.equal(result.quantidade, 1);
  assert.equal(database.getIngressos().length, 1);
});

test('2. pedido pago com quantidade 3 gera exatamente 3 ingressos', async () => {
  const database = createTransactionalEmitter({ quantidade: 3 });
  const result = await emitIngressos('pedido-3', { emit: database.emit });
  assert.equal(result.quantidade, 3);
  assert.equal(database.getIngressos().length, 3);
});

test('3. códigos gerados são diferentes', async () => {
  const database = createTransactionalEmitter({ quantidade: 3 });
  await emitIngressos('pedido-codigos', { emit: database.emit });
  const codigos = database.getIngressos().map(({ codigo_ingresso }) => codigo_ingresso);
  assert.equal(new Set(codigos).size, 3);
});

test('4. conteúdos dos QR Codes são diferentes', async () => {
  const database = createTransactionalEmitter({ quantidade: 3 });
  await emitIngressos('pedido-qr', { emit: database.emit });
  const qrCodes = database.getIngressos().map(({ qr_code }) => qr_code);
  assert.equal(new Set(qrCodes).size, 3);
});

test('5. QR Code não contém CPF, e-mail ou telefone', async () => {
  const database = createTransactionalEmitter({ quantidade: 1 });
  await emitIngressos('pedido-privacidade', { emit: database.emit });
  const qrCode = database.getIngressos()[0].qr_code;
  assert.equal(qrCode.includes('52998224725'), false);
  assert.equal(qrCode.includes('cliente@example.com'), false);
  assert.equal(qrCode.includes('11999999999'), false);
  assert.match(qrCode, /^AFC:1:[A-F0-9]{36}$/);
});

test('6. segunda execução para o mesmo pedido não duplica ingressos', async () => {
  const database = createTransactionalEmitter({ quantidade: 3 });
  await emitIngressos('pedido-idempotente', { emit: database.emit });
  await emitIngressos('pedido-idempotente', { emit: database.emit });
  assert.equal(database.getIngressos().length, 3);
});

test('7. PAYMENT_CONFIRMED seguido de PAYMENT_RECEIVED não duplica ingressos', async () => {
  const pedido = {
    id: 'pedido-eventos',
    codigo_pedido: 'AFC-EVENTOS',
    status_pagamento: 'AGUARDANDO_PAGAMENTO',
    status_pedido: 'CHECKOUT_CRIADO'
  };
  const database = createTransactionalEmitter({
    quantidade: 2,
    onCommit: () => { pedido.status_pedido = 'INGRESSOS_EMITIDOS'; }
  });
  const repository = {
    async findByExternalReference() { return { ...pedido }; },
    async findByPaymentId() { return { ...pedido }; },
    async updatePaymentStatus(id, data) { Object.assign(pedido, data); return { ...pedido, id }; }
  };
  const approvedHandler = async ({ pedido: approvedPedido }) =>
    emitIngressos(approvedPedido.id, { emit: database.emit });
  const payment = { id: 'pay-events', externalReference: 'afc-events' };

  await processPaymentEvent({ id: 'evt-confirmed', event: 'PAYMENT_CONFIRMED', payment }, {
    repository,
    approvedHandler
  });
  await processPaymentEvent({ id: 'evt-received', event: 'PAYMENT_RECEIVED', payment }, {
    repository,
    approvedHandler
  });

  assert.equal(database.getIngressos().length, 2);
  assert.equal(pedido.status_pagamento, 'PAGO');
  assert.equal(pedido.status_pedido, 'INGRESSOS_EMITIDOS');
});

for (const [number, label, status] of [
  [8, 'pendente', 'AGUARDANDO_PAGAMENTO'],
  [9, 'vencido', 'VENCIDO'],
  [10, 'estornado', 'ESTORNADO']
]) {
  test(`${number}. pedido ${label} não gera ingresso`, async () => {
    const database = createTransactionalEmitter({ quantidade: 1, statusPagamento: status });
    await assert.rejects(
      emitIngressos(`pedido-${label}`, { emit: database.emit }),
      /PAGAMENTO_NAO_APROVADO/
    );
    assert.equal(database.getIngressos().length, 0);
  });
}

test('11. falha parcial permite nova tentativa transacional segura', async () => {
  const database = createTransactionalEmitter({ quantidade: 3, failAfter: 1 });
  await assert.rejects(
    emitIngressos('pedido-retry', { emit: database.emit }),
    /FALHA_TRANSACIONAL_SIMULADA/
  );
  assert.equal(database.getIngressos().length, 0);

  await emitIngressos('pedido-retry', { emit: database.emit });
  assert.equal(database.getIngressos().length, 3);
});

test('12. execuções concorrentes nunca ultrapassam pedidos.quantidade', async () => {
  const database = createTransactionalEmitter({ quantidade: 3 });
  await Promise.all(
    Array.from({ length: 20 }, () =>
      emitIngressos('pedido-concorrente', { emit: database.emit })
    )
  );
  assert.equal(database.getIngressos().length, 3);
});

test('13. categoria dos ingressos corresponde à categoria oficial do pedido', async () => {
  const database = createTransactionalEmitter({ quantidade: 2, categoria: 'arquibancada' });
  const result = await emitIngressos('pedido-categoria', { emit: database.emit });
  assert.equal(result.categoria, 'arquibancada');
  assert.ok(result.ingressos.every(({ categoria }) => categoria === 'arquibancada'));
});
