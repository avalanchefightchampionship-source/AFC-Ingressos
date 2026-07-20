import { timingSafeEqual } from 'node:crypto';
import { enviarIngressosPorEmail } from '../services/email-service.js';

// Endpoint temporário para validar o Resend. Deve ser removido após a validação do fluxo.
const sendJson = (response, status, body) => {
  response.status(status).json(body);
};

const getHeader = (request, name) => {
  if (typeof request.headers?.get === 'function') return request.headers.get(name) || '';
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
};

const hasValidToken = (receivedToken, expectedToken) => {
  if (typeof receivedToken !== 'string' || typeof expectedToken !== 'string') return false;
  const received = Buffer.from(receivedToken, 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');
  return received.length === expected.length && timingSafeEqual(received, expected);
};

const isValidEmail = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const isValidName = (value) => typeof value === 'string' && value.trim().length >= 2;

const createTesteIngressos = (nome) => {
  const baseName = ((nome || 'TEST').trim().slice(0, 4).toUpperCase() || 'TEST');
  const createHexToken = (seed) => {
    const alphabet = '0123456789ABCDEF';
    let token = '';
    for (let index = 0; index < 36; index += 1) {
      token += alphabet[(seed.charCodeAt(index % seed.length) + index) % 16];
    }
    return token;
  };

  const vipToken = createHexToken(baseName + 'VIP');
  const pistaToken = createHexToken(baseName + 'PIST');

  return [
    {
      codigo_ingresso: `AFC-${vipToken}`,
      qr_code: `AFC:1:${vipToken}`,
      categoria: 'vip',
      lote: 'Lote teste',
      status: 'VALIDO',
      pedido_id: 'pedido-simulacao'
    },
    {
      codigo_ingresso: `AFC-${pistaToken}`,
      qr_code: `AFC:1:${pistaToken}`,
      categoria: 'arquibancada',
      lote: 'Lote teste',
      status: 'VALIDO',
      pedido_id: 'pedido-simulacao'
    }
  ];
};

export const createEmailTestHandler = (sendEmail = enviarIngressosPorEmail) => async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Método não permitido.' });
  }

  const expectedToken = process.env.EMAIL_TEST_TOKEN?.trim() || '';
  if (expectedToken.length < 32) {
    console.error('Configuração inválida do token de teste de e-mail.');
    return sendJson(response, 500, { error: 'Configuração de teste de e-mail inválida.' });
  }

  const receivedToken = getHeader(request, 'x-afc-test-token');
  if (!hasValidToken(receivedToken, expectedToken)) {
    return sendJson(response, 401, { error: 'Não autorizado.' });
  }

  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  if (!isValidEmail(email)) {
    return sendJson(response, 400, { error: 'E-mail inválido.' });
  }

  const nome = typeof request.body?.nome === 'string' ? request.body.nome.trim() : '';
  if (!isValidName(nome)) {
    return sendJson(response, 400, { error: 'Nome inválido.' });
  }

  try {
    const ingressos = createTesteIngressos(nome);
    const result = await sendEmail({
      comprador: { nome },
      email,
      ingressos,
      dadosEvento: {
        nome: 'Avalanche Fight Championship',
        data: '15 de agosto de 2026',
        horario: '19h',
        local: 'Ginásio de Esportes JK',
        endereco: 'Rua Ângelo Amaral, 2 — Jardim Joana D’Arc, Campo Mourão — Paraná',
        dominio: 'https://www.afcevents.com.br'
      }
    });
    const id = typeof result === 'string' ? result : result?.id || null;
    return sendJson(response, 200, { success: true, emailId: id, quantidadeIngressos: ingressos.length });
  } catch (error) {
    console.error('Falha ao enviar e-mail de teste.', {
      message: error?.message || 'Erro desconhecido'
    });
    return sendJson(response, 500, { error: 'Falha ao enviar e-mail de teste.' });
  }
};

export default createEmailTestHandler();
