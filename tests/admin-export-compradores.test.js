import assert from 'node:assert/strict';
import test from 'node:test';
import XLSX from 'xlsx';
import { createAdminSessionSetCookie } from '../lib/admin-auth.js';
import { createAdminExportCompradoresHandler } from '../api/admin/exportar-compradores.js';
import {
  APPROVED_PAYMENT_STATUS_VALUES
} from '../services/payment-events.js';
import {
  COMPRADORES_EXPORT_HEADERS,
  buildCompradoresExportFilename,
  createCompradoresExportFile
} from '../services/admin-export-service.js';

const createAuthCookieHeader = () => {
  const secret = 's'.repeat(64);
  process.env.ADMIN_SESSION_SECRET = secret;
  return createAdminSessionSetCookie({ sub: 'admin', role: 'admin' }, {
    secret,
    isProduction: false
  });
};

const createBinaryResponse = () => {
  let statusCode = 200;
  let jsonBody = null;
  let body = null;
  const headers = new Map();

  return {
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonBody = payload;
      return this;
    },
    send(payload) {
      body = payload;
      return this;
    },
    end(payload) {
      body = payload;
      return this;
    },
    get statusCode() {
      return statusCode;
    },
    get jsonBody() {
      return jsonBody;
    },
    get body() {
      return body;
    },
    get headers() {
      return headers;
    }
  };
};

const readWorkbookRows = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
};

test('exporta apenas compradores aprovados, usa APPROVED_PAYMENT_STATUS_VALUES, inclui colunas reais e gera xlsx válido', async () => {
  let receivedStatuses = null;
  const approvedPedidos = [
    {
      id: 'pedido-2',
      created_at: '2026-08-15T12:30:00.000Z',
      codigo_pedido: 'AFC-0002',
      nome: 'Maria Silva',
      email: 'maria@example.com',
      telefone: '44999999999',
      cpf: '12345678901',
      tipo_ingresso: 'vip',
      quantidade: 2,
      valor_total: '500.00',
      status_pagamento: 'PAGAMENTO_CONFIRMADO',
      asaas_checkout_id: 'chk_2',
      asaas_payment_id: 'pay_2',
      ref_afiliado: 'AFILIADO-1'
    },
    {
      id: 'pedido-1',
      created_at: '2026-08-14T11:00:00.000Z',
      codigo_pedido: 'AFC-0001',
      nome: 'João Souza',
      email: 'joao@example.com',
      telefone: '44988888888',
      cpf: '10987654321',
      tipo_ingresso: 'arquibancada',
      quantidade: 1,
      valor_total: '150.00',
      status_pagamento: 'PAGO',
      asaas_checkout_id: 'chk_1',
      asaas_payment_id: 'pay_1',
      ref_afiliado: ''
    }
  ];

  const { buffer } = await createCompradoresExportFile({
    listPedidos: async (statuses) => {
      receivedStatuses = statuses;
      return approvedPedidos;
    },
    listIngressos: async (pedidoIds) => {
      assert.deepEqual(pedidoIds, ['pedido-2', 'pedido-1']);
      return [
        {
          pedido_id: 'pedido-2',
          codigo_ingresso: 'ING-2A',
          qr_code: 'AFC:1:222222222222222222222222222222222222',
          created_at: '2026-08-15T12:31:00.000Z'
        },
        {
          pedido_id: 'pedido-2',
          codigo_ingresso: 'ING-2B',
          qr_code: 'AFC:1:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          created_at: '2026-08-15T12:32:00.000Z'
        },
        {
          pedido_id: 'pedido-1',
          codigo_ingresso: 'ING-1A',
          qr_code: 'AFC:1:111111111111111111111111111111111111',
          created_at: '2026-08-14T11:01:00.000Z'
        },
        {
          pedido_id: 'pedido-pendente',
          codigo_ingresso: 'IGNORAR',
          qr_code: 'AFC:1:IGNORARIGNORARIGNORARIGNORARIGNORA',
          created_at: '2026-08-13T10:00:00.000Z'
        }
      ];
    }
  });

  assert.strictEqual(receivedStatuses, APPROVED_PAYMENT_STATUS_VALUES);

  const rows = readWorkbookRows(buffer);
  assert.equal(rows.length, 3);
  assert.deepEqual(Object.keys(rows[0]), COMPRADORES_EXPORT_HEADERS);
  assert.equal(rows[0]['Código do pedido'], 'AFC-0002');
  assert.equal(rows[1]['Código do pedido'], 'AFC-0002');
  assert.equal(rows[2]['Código do pedido'], 'AFC-0001');
  assert.equal(rows[0]['Status do pagamento'], 'PAGAMENTO_CONFIRMADO');
  assert.equal(rows[2]['Status do pagamento'], 'PAGO');
  assert.equal(rows.some((row) => row['Status do pagamento'] === 'AGUARDANDO_PAGAMENTO'), false);
  assert.equal(rows.some((row) => row['Status do pagamento'] === 'CANCELADO'), false);
  assert.equal(rows[0]['Código do checkout Asaas'], 'chk_2');
  assert.equal(rows[0]['Código do pagamento Asaas'], 'pay_2');
  assert.equal(rows[0]['Referência do afiliado'], 'AFILIADO-1');
  assert.equal(rows[0]['QR Code'], 'AFC:1:222222222222222222222222222222222222');
});

test('exporta todos os compradores aprovados sem limite de 10 e mantém ordenação por data decrescente', async () => {
  const pedidos = Array.from({ length: 12 }, (_, index) => {
    const day = String(31 - index).padStart(2, '0');
    return {
      id: `pedido-${index + 1}`,
      created_at: `2026-08-${day}T12:00:00.000Z`,
      codigo_pedido: `AFC-${String(index + 1).padStart(4, '0')}`,
      nome: `Comprador ${index + 1}`,
      email: `comprador${index + 1}@example.com`,
      telefone: '44999999999',
      cpf: '12345678901',
      tipo_ingresso: 'vip',
      quantidade: 1,
      valor_total: '250.00',
      status_pagamento: 'PAGO',
      asaas_checkout_id: `chk_${index + 1}`,
      asaas_payment_id: `pay_${index + 1}`,
      ref_afiliado: ''
    };
  });

  const { rows } = await createCompradoresExportFile({
    listPedidos: async () => pedidos,
    listIngressos: async () => []
  });

  assert.equal(rows.length, 12);
  assert.equal(rows[0]['Código do pedido'], 'AFC-0001');
  assert.equal(rows[11]['Código do pedido'], 'AFC-0012');
});

test('endpoint exige autenticação e usuário sem login recebe 401', async () => {
  process.env.ADMIN_SESSION_SECRET = 's'.repeat(64);
  let exportCalls = 0;
  const handler = createAdminExportCompradoresHandler({
    createExportFile: async () => {
      exportCalls += 1;
      return { buffer: Buffer.from('x'), contentType: 'application/octet-stream' };
    }
  });
  const response = createBinaryResponse();

  await handler({ method: 'GET', headers: {} }, response);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.jsonBody, { error: 'Não autenticado.' });
  assert.equal(exportCalls, 0);
});

test('endpoint retorna download xlsx com nome esperado', async () => {
  const exportBuffer = Buffer.from('xlsx-content');
  const handler = createAdminExportCompradoresHandler({
    createExportFile: async () => ({
      buffer: exportBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }),
    getNow: () => new Date('2026-08-15T03:00:00.000Z')
  });
  const response = createBinaryResponse();

  await handler({ method: 'GET', headers: { cookie: createAuthCookieHeader() } }, response);

  assert.equal(response.statusCode, 200);
  assert.strictEqual(response.body, exportBuffer);
  assert.equal(
    response.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  assert.equal(
    response.headers.get('content-disposition'),
    `attachment; filename="${buildCompradoresExportFilename(new Date('2026-08-15T03:00:00.000Z'))}"`
  );
});