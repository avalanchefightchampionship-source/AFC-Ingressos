import { createAdminSessionSetCookie, getAdminCookieValue, getLoginAttemptState, isAdminPasswordValid, registerLoginAttempt, resetLoginAttempts, verifyAdminSessionCookie } from '../../lib/admin-auth.js';
import { getSupabaseAdmin } from '../../lib/supabase-admin.js';

const sendJson = (response, status, body) => {
  response.status(status).json(body);
};

const isProduction = () => process.env.NODE_ENV === 'production';

const parseRequestBody = (request) => {
  const body = request.body;
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
    return body;
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8'));
    } catch {
      return {};
    }
  }

  return {};
};

export default async function handler(request, response) {
  if (request.method === 'GET') {
    const cookieValue = getAdminCookieValue(request);
    const payload = verifyAdminSessionCookie(cookieValue, { secret: process.env.ADMIN_SESSION_SECRET });
    return sendJson(response, payload ? 200 : 401, { authenticated: Boolean(payload) });
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST,GET');
    return sendJson(response, 405, { error: 'Método não permitido.' });
  }

  const body = parseRequestBody(request);
  const password = typeof body.password === 'string' ? body.password : '';
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim() || '';
  const key = request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown';
  const attemptState = getLoginAttemptState(key);
  const now = Date.now();

  if (attemptState.blocked && attemptState.expiresAt > now) {
    response.status(429);
    return response.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' });
  }

  const attempt = registerLoginAttempt(key);
  const isValid = passwordHash && await isAdminPasswordValid(password, passwordHash);

  if (!isValid) {
    if (attempt.blocked) {
      response.status(429);
      return response.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' });
    }
    return sendJson(response, 401, { error: 'Credenciais inválidas.' });
  }

  resetLoginAttempts(key);

  const session = { sub: 'admin', role: 'admin' };
  const cookie = createAdminSessionSetCookie(session, {
    secret: process.env.ADMIN_SESSION_SECRET,
    isProduction: isProduction()
  });
  response.setHeader('Set-Cookie', cookie);

  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('pedidos').select('id').limit(1);
  } catch {
    // Garantir que o backend tenha credenciais válidas para o painel sem expor segredos.
  }

  return sendJson(response, 200, { authenticated: true });
}
