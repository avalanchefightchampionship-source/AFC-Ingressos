import assert from 'node:assert/strict';
import test from 'node:test';
import { onPaymentApproved, PAY_PER_VIEW_TICKET_TYPE } from '../services/payment-events.js';
import {
  enviarLinkTransmissaoEmMassa,
  validateTransmissaoLink,
  enviarConfirmacaoPayPerView,
  getPayPerViewTransmissaoLink,
  DEFAULT_PPV_TRANSMISSAO_LINK
} from '../services/pay-per-view-service.js';
import { createEnviarTransmissaoHandler } from '../api/admin/pay-per-view/enviar-transmissao.js';
import { createAdminSessionCookie } from '../lib/admin-auth.js';
import { renderPayPerViewConfirmacaoEmailHtml } from '../templates/pay-per-view-confirmacao-email.js';
import { renderPayPerViewTransmissaoEmailHtml } from '../templates/pay-per-view-transmissao-email.js';

test('validateTransmissaoLink aceita HTTPS e rejeita HTTP', () => {
  assert.equal(validateTransmissaoLink('https://youtube.com/live/abc'), 'https://youtube.com/live/abc');
  assert.throws(() => validateTransmissaoLink('http://youtube.com/live/abc'), /HTTPS/);
  assert.throws(() => validateTransmissaoLink(''), /obrigatório/);
});

test('template de confirmação PPV inclui botão de transmissão quando link informado', () => {
  const html = renderPayPerViewConfirmacaoEmailHtml({
    compradorNome: 'João',
    eventoNome: 'AFC',
    dataEvento: '15 de agosto de 2026',
    horarioEvento: '19h',
    localEvento: 'Ginásio JK',
    enderecoEvento: 'Campo Mourão',
    quantidade: 2,
    codigoPedido: 'AFC-TEST',
    linkTransmissao: 'https://youtube.com/live/sLSnzRoJ2Mo?feature=share'
  });

  assert.match(html, /Pay-Per-View confirmado/);
  assert.match(html, /Assistir transmissão/);
  assert.match(html, /https:\/\/youtube\.com\/live\/sLSnzRoJ2Mo\?feature=share/);
  assert.doesNotMatch(html, /novo e-mail/);
  assert.doesNotMatch(html, /QR Code/);
});

test('template de confirmação PPV sem link mantém aviso de e-mail futuro', () => {
  const html = renderPayPerViewConfirmacaoEmailHtml({
    compradorNome: 'João',
    eventoNome: 'AFC',
    dataEvento: '15 de agosto de 2026',
    horarioEvento: '19h',
    localEvento: 'Ginásio JK',
    enderecoEvento: 'Campo Mourão',
    quantidade: 2,
    codigoPedido: 'AFC-TEST'
  });

  assert.match(html, /novo e-mail/);
});

test('template de transmissão inclui botão com link', () => {
  const html = renderPayPerViewTransmissaoEmailHtml({
    compradorNome: 'Maria',
    eventoNome: 'AFC',
    dataEvento: '15 de agosto de 2026',
    horarioEvento: '19h',
    linkTransmissao: 'https://youtube.com/live/xyz'
  });

  assert.match(html, /Assistir transmissão/);
  assert.match(html, /https:\/\/youtube\.com\/live\/xyz/);
});

test('getPayPerViewTransmissaoLink usa link padrão do YouTube', () => {
  const previous = process.env.PPV_TRANSMISSAO_LINK;
  delete process.env.PPV_TRANSMISSAO_LINK;
  assert.equal(getPayPerViewTransmissaoLink(), DEFAULT_PPV_TRANSMISSAO_LINK);
  if (previous) process.env.PPV_TRANSMISSAO_LINK = previous;
});

test('onPaymentApproved para pay-per-view não emite ingresso físico', async () => {
  const pedido = {
    id: 'pedido-ppv-1',
    codigo_pedido: 'AFC-PPV-1',
    nome: 'João PPV',
    email: 'ppv@example.com',
    tipo_ingresso: PAY_PER_VIEW_TICKET_TYPE,
    quantidade: 1,
    email_enviado: false,
    email_tentativas: 0
  };
  let emitCalls = 0;
  const emit = async () => {
    emitCalls += 1;
    return { quantidade: 1, ingressos: [{ codigo_ingresso: 'SHOULD-NOT-HAPPEN' }] };
  };
  const sentPayloads = [];
  const sendPayPerViewConfirmation = async (payload) => {
    sentPayloads.push(payload);
    return 'email-ppv-1';
  };
  const updateEmailStatus = async () => ({ ...pedido, email_enviado: true });
  let transmissaoRegistrada = false;
  const registrarTransmissao = async (pedidoId, { link }) => {
    transmissaoRegistrada = true;
    assert.equal(pedidoId, pedido.id);
    assert.equal(link, DEFAULT_PPV_TRANSMISSAO_LINK);
  };

  const result = await onPaymentApproved(
    { pedido },
    {
      emit,
      sendEmail: async () => { throw new Error('não deveria enviar ingresso físico'); },
      sendPayPerViewConfirmation,
      updateEmailStatus,
      registrarTransmissao
    }
  );

  assert.equal(emitCalls, 0);
  assert.equal(result.payPerView, true);
  assert.equal(result.emailSent, true);
  assert.equal(sentPayloads.length, 1);
  assert.equal(sentPayloads[0].email, 'ppv@example.com');
  assert.equal(transmissaoRegistrada, true);
});

test('onPaymentApproved para arquibancada continua emitindo ingresso físico', async () => {
  const pedido = {
    id: 'pedido-arq-1',
    codigo_pedido: 'AFC-ARQ-1',
    nome: 'Maria',
    email: 'maria@example.com',
    tipo_ingresso: 'arquibancada',
    quantidade: 1,
    email_enviado: false,
    email_tentativas: 0
  };
  let emitCalls = 0;
  const emit = async () => {
    emitCalls += 1;
    return { quantidade: 1, ingressos: [{ codigo_ingresso: 'AFC-123' }] };
  };
  let ppvCalls = 0;
  const sendPayPerViewConfirmation = async () => {
    ppvCalls += 1;
    return 'ppv-should-not-run';
  };
  const sendEmail = async () => 'email-arq-1';
  const updateEmailStatus = async () => ({ ...pedido, email_enviado: true });

  const result = await onPaymentApproved(
    { pedido },
    { emit, sendEmail, sendPayPerViewConfirmation, updateEmailStatus }
  );

  assert.equal(emitCalls, 1);
  assert.equal(ppvCalls, 0);
  assert.equal(result.payPerView, false);
  assert.equal(result.emailSent, true);
});

test('enviarLinkTransmissaoEmMassa envia apenas pendentes por padrão', async () => {
  const pedidos = [
    { id: 'p1', codigo_pedido: 'AFC-1', nome: 'A', email: 'a@example.com', transmissao_tentativas: 0 },
    { id: 'p2', codigo_pedido: 'AFC-2', nome: 'B', email: 'b@example.com', transmissao_tentativas: 1 }
  ];
  const enviados = [];
  const atualizados = [];

  const resumo = await enviarLinkTransmissaoEmMassa(
    { link: 'https://youtube.com/live/test' },
    {
      listar: async () => pedidos,
      enviar: async ({ pedido }) => {
        enviados.push(pedido.id);
        return `email-${pedido.id}`;
      },
      atualizarStatus: async (pedidoId, data) => {
        atualizados.push({ pedidoId, data });
        return {};
      }
    }
  );

  assert.equal(resumo.total, 2);
  assert.equal(resumo.enviados, 2);
  assert.equal(resumo.falhas, 0);
  assert.deepEqual(enviados, ['p1', 'p2']);
  assert.equal(atualizados[0].data.transmissao_enviada, true);
});

test('enviarLinkTransmissaoEmMassa registra falhas sem interromper lote', async () => {
  const pedidos = [
    { id: 'p1', codigo_pedido: 'AFC-1', nome: 'A', email: 'a@example.com', transmissao_tentativas: 0 },
    { id: 'p2', codigo_pedido: 'AFC-2', nome: 'B', email: 'invalid', transmissao_tentativas: 0 }
  ];

  const resumo = await enviarLinkTransmissaoEmMassa(
    { link: 'https://youtube.com/live/test' },
    {
      listar: async () => pedidos,
      enviar: async ({ pedido }) => {
        if (pedido.id === 'p2') throw new Error('resend failed');
        return 'email-ok';
      },
      atualizarStatus: async () => ({})
    }
  );

  assert.equal(resumo.enviados, 1);
  assert.equal(resumo.falhas, 1);
  assert.equal(resumo.detalhes[1].status, 'falha');
});

test('endpoint admin de transmissão exige autenticação', async () => {
  const handler = createEnviarTransmissaoHandler({
    enviarEmMassa: async () => ({ total: 0, enviados: 0, falhas: 0, detalhes: [] })
  });
  let statusCode;
  const response = {
    setHeader() {},
    status(status) { statusCode = status; return this; },
    json() {}
  };

  await handler({ method: 'POST', headers: {}, body: { link: 'https://youtube.com/live/x' } }, response);
  assert.equal(statusCode, 401);
});

test('endpoint admin de transmissão retorna resumo do envio', async () => {
  const secret = 'test-session-secret-ppv';
  Object.assign(process.env, { ADMIN_SESSION_SECRET: secret });

  const cookie = createAdminSessionCookie({ sub: 'admin' }, { secret });
  const handler = createEnviarTransmissaoHandler({
    enviarEmMassa: async ({ link, reenviar }) => ({
      total: 1,
      enviados: 1,
      falhas: 0,
      detalhes: [{ pedidoId: 'p1', status: 'enviado' }],
      link,
      reenviar
    })
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
    headers: { cookie: cookie },
    body: { link: 'https://youtube.com/live/ok', reenviar: true }
  }, response);

  assert.equal(statusCode, 200);
  assert.equal(body.enviados, 1);
  assert.equal(body.total, 1);
});

test('enviarConfirmacaoPayPerView valida e-mail', async () => {
  const resendClient = {
    emails: {
      send: async () => ({ data: { id: 'test' }, error: null })
    }
  };

  await assert.rejects(
    () => enviarConfirmacaoPayPerView(
      { email: 'invalid', comprador: { nome: 'Test' } },
      { resendClient }
    ),
    /E-mail inválido/
  );
});
