import { getAdminCookieValue, verifyAdminSessionCookie } from '../../../lib/admin-auth.js';
import { reenviarIngressosEmMassa } from '../../../services/reenviar-ingressos-service.js';

const sendJson = (response, status, body) => {
  response.status(status).json(body);
};

export const createReenviarIngressosEmMassaHandler = (
  { reenviarEmMassa = reenviarIngressosEmMassa } = {}
) => async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Método não permitido.' });
  }

  const cookieValue = getAdminCookieValue(request);
  const session = verifyAdminSessionCookie(cookieValue, { secret: process.env.ADMIN_SESSION_SECRET });
  if (!session) {
    return sendJson(response, 401, { error: 'Não autenticado.' });
  }

  const { mensagemDestaque, tipoIngresso } = request.body || {};

  try {
    const resumo = await reenviarEmMassa({ mensagemDestaque, tipoIngresso });
    return sendJson(response, 200, resumo);
  } catch (error) {
    const message = error?.message || 'Falha ao reenviar ingressos em massa.';
    const status = /Informe|inválid|máximo/.test(message) ? 400 : 500;
    return sendJson(response, status, { error: message });
  }
};

export default createReenviarIngressosEmMassaHandler();
