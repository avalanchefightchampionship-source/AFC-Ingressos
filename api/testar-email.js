import { timingSafeEqual } from 'node:crypto';
import { enviarEmailTeste } from '../services/email-service.js';

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

export const createEmailTestHandler = (sendEmail = enviarEmailTeste) => async function handler(request, response) {
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

  try {
    const result = await sendEmail(email);
    const id = typeof result === 'string' ? result : result?.id || null;
    return sendJson(response, 200, { ok: true, id });
  } catch (error) {
    console.error('Falha ao enviar e-mail de teste.', {
      message: error?.message || 'Erro desconhecido'
    });
    return sendJson(response, 500, { error: 'Falha ao enviar e-mail de teste.' });
  }
};

export default createEmailTestHandler();
