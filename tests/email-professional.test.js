import assert from 'node:assert/strict';
import test from 'node:test';
import { createQrCodeImage, createQrCodeDataUrl } from '../lib/qr-code.js';
import { renderIngressosEmailHtml } from '../templates/ingresso-email.js';
import { enviarIngressosPorEmail } from '../services/email-service.js';
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

const ingressosBase = [
  {
    codigo_ingresso: 'AFC-111111111111111111111111111111111111',
    qr_code: 'AFC:1:111111111111111111111111111111111111',
    categoria: 'vip',
    lote: 'Lote 1',
    status: 'VALIDO',
    pedido_id: 'pedido-1'
  },
  {
    codigo_ingresso: 'AFC-222222222222222222222222222222222222',
    qr_code: 'AFC:1:222222222222222222222222222222222222',
    categoria: 'arquibancada',
    lote: 'Lote 1',
    status: 'VALIDO',
    pedido_id: 'pedido-1'
  }
];

test('gera erro quando o conteúdo do QR Code está vazio', async () => {
  await assert.rejects(() => createQrCodeImage(''), /vazio/i);
});

test('gera QR Code em buffer e data URL a partir do conteúdo existente', async () => {
  const buffer = await createQrCodeImage('AFC:1:111111111111111111111111111111111111');
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 0);

  const dataUrl = await createQrCodeDataUrl('AFC:1:111111111111111111111111111111111111');
  assert.match(dataUrl, /^data:image\/png;base64,/);
});

test('renderiza HTML com dados do comprador e cartões dos ingressos', () => {
  const html = renderIngressosEmailHtml({
    compradorNome: 'João da Silva',
    eventoNome: 'Avalanche Fight Championship',
    dataEvento: '15 de agosto de 2026',
    horarioEvento: '19h',
    localEvento: 'Ginásio de Esportes JK',
    enderecoEvento: 'Rua Ângelo Amaral, 2 — Jardim Joana D’Arc, Campo Mourão — Paraná',
    quantidadeIngressos: 2,
    ingressos: ingressosBase,
    qrCodes: [
      'data:image/png;base64,AAAA',
      'data:image/png;base64,BBBB'
    ]
  });

  assert.match(html, /João da Silva/);
  assert.match(html, /Avalanche Fight Championship/);
  assert.match(html, /Cartão de ingresso/);
  assert.match(html, /Cadeira VIP/);
  assert.match(html, /Arquibancada/);
});

test('envia e-mail profissional com mock do Resend sem anexar PDF e preserva QR Codes inline', async () => {
  const sent = [];
  const response = await enviarIngressosPorEmail({
    comprador: { nome: 'João da Silva' },
    email: 'cliente@example.com',
    ingressos: ingressosBase,
    dadosEvento: {
      nome: 'Avalanche Fight Championship',
      data: '15 de agosto de 2026',
      horario: '19h',
      local: 'Ginásio de Esportes JK',
      endereco: 'Rua Ângelo Amaral, 2 — Jardim Joana D’Arc, Campo Mourão — Paraná',
      dominio: 'https://www.afcevents.com.br'
    }
  }, {
    resendClient: {
      emails: {
        send: async (payload) => {
          sent.push(payload);
          return { data: { id: 'mocked-id' }, error: null };
        }
      }
    }
  });

  assert.equal(response, 'mocked-id');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['cliente@example.com']);
  assert.equal(sent[0].subject, 'Seus ingressos — Avalanche Fight Championship');
  assert.ok(sent[0].attachments.every((attachment) => attachment.filename !== 'ingressos-afc.pdf'));
  const qrAttachments = sent[0].attachments.filter((attachment) => attachment.contentId);
  assert.equal(qrAttachments.length, ingressosBase.length);
  assert.ok(sent[0].html.includes('cid:qr-0'));
  assert.ok(sent[0].html.includes('Cada QR Code é individual'));
  assert.ok(sent[0].html.includes('Não compartilhe este e-mail'));
  assert.ok(!sent[0].html.includes('PDF'));
});

test('usa anexos inline com cid no HTML e exibe código amigável', async () => {
  const sent = [];
  await enviarIngressosPorEmail({
    comprador: { nome: 'João da Silva' },
    email: 'cliente@example.com',
    ingressos: ingressosBase,
    dadosEvento: {
      nome: 'Avalanche Fight Championship',
      data: '15 de agosto de 2026',
      horario: '19h',
      local: 'Ginásio de Esportes JK',
      endereco: 'Rua Ângelo Amaral, 2 — Jardim Joana D’Arc, Campo Mourão — Paraná',
      dominio: 'https://www.afcevents.com.br'
    }
  }, {
    resendClient: {
      emails: {
        send: async (payload) => {
          sent.push(payload);
          return { data: { id: 'mocked-id' }, error: null };
        }
      }
    }
  });

  assert.equal(sent.length, 1);
  const qrAttachments = sent[0].attachments.filter((attachment) => attachment.contentId);
  assert.equal(qrAttachments.length, ingressosBase.length);
  assert.ok(sent[0].html.includes('cid:qr-0'));
  assert.ok(sent[0].html.includes('AFC-1111-1111-1111-1111'));
});

test('lança erro claro quando o Resend retorna error', async () => {
  await assert.rejects(
    () => enviarIngressosPorEmail({
      comprador: { nome: 'João da Silva' },
      email: 'cliente@example.com',
      ingressos: ingressosBase,
      dadosEvento: {
        nome: 'Avalanche Fight Championship',
        data: '15 de agosto de 2026',
        horario: '19h',
        local: 'Ginásio de Esportes JK',
        endereco: 'Rua Ângelo Amaral, 2 — Jardim Joana D’Arc, Campo Mourão — Paraná',
        dominio: 'https://www.afcevents.com.br'
      }
    }, {
      resendClient: {
        emails: {
          send: async () => ({ data: null, error: { message: 'Falha de envio' } })
        }
      }
    }),
    /Falha de envio/i
  );
});

test('endpoint rejeita requisições sem token, token inválido, e-mail inválido e nome ausente', async () => {
  process.env.EMAIL_TEST_TOKEN = 'd'.repeat(32);
  const handler = createEmailTestHandler(async () => ({ id: 'sent' }));

  const withoutToken = createResponse();
  await handler({ method: 'POST', headers: {}, body: { email: 'cliente@example.com', nome: 'João' } }, withoutToken.response);
  assert.equal(withoutToken.getStatusCode(), 401);

  const invalidToken = createResponse();
  await handler({ method: 'POST', headers: { 'x-afc-test-token': 'token-incorreto' }, body: { email: 'cliente@example.com', nome: 'João' } }, invalidToken.response);
  assert.equal(invalidToken.getStatusCode(), 401);

  const invalidEmail = createResponse();
  await handler({ method: 'POST', headers: { 'x-afc-test-token': 'd'.repeat(32) }, body: { email: 'email-invalido', nome: 'João' } }, invalidEmail.response);
  assert.equal(invalidEmail.getStatusCode(), 400);

  const missingName = createResponse();
  await handler({ method: 'POST', headers: { 'x-afc-test-token': 'd'.repeat(32) }, body: { email: 'cliente@example.com' } }, missingName.response);
  assert.equal(missingName.getStatusCode(), 400);
});

test('endpoint retorna sucesso e informa quantidade de ingressos sem gravar no Supabase', async () => {
  process.env.EMAIL_TEST_TOKEN = 'e'.repeat(32);
  let calls = 0;
  const handler = createEmailTestHandler(async (payload) => {
    calls += 1;
    assert.equal(payload.email, 'cliente@example.com');
    assert.equal(payload.ingressos.length, 2);
    return { id: 'sent:ok' };
  });

  const response = createResponse();
  await handler({ method: 'POST', headers: { 'x-afc-test-token': 'e'.repeat(32) }, body: { email: 'cliente@example.com', nome: 'João' } }, response.response);

  assert.equal(response.getStatusCode(), 200);
  assert.equal(calls, 1);
  assert.equal(response.getBody().quantidadeIngressos, 2);
  assert.equal(response.getBody().success, true);
});
