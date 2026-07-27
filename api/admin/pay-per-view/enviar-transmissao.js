import { getAdminCookieValue, verifyAdminSessionCookie } from '../../../lib/admin-auth.js';
import { enviarLinkTransmissaoEmMassa } from '../../../services/pay-per-view-service.js';

const sendJson = (response, status, body) => {
  response.status(status).json(body);
};

export const createEnviarTransmissaoHandler = (
  { enviarEmMassa = enviarLinkTransmissaoEmMassa } = {}
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

  const { link, reenviar } = request.body || {};

  try {
    const resumo = await enviarEmMassa({
      link,
      reenviar: Boolean(reenviar)
    });

    return sendJson(response, 200, resumo);
  } catch (error) {
    const message = error?.message || 'Falha ao enviar e-mails de transmissão.';
    const status = message.includes('Link') || message.includes('link') ? 400 : 500;
    return sendJson(response, status, { error: message });
  }
};

export default createEnviarTransmissaoHandler();
