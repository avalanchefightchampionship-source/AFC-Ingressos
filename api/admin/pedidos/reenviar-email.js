import { getAdminCookieValue, verifyAdminSessionCookie } from '../../../lib/admin-auth.js';
import {
  reenviarIngressosEmMassa,
  reenviarIngressosPorEmail
} from '../../../services/reenviar-ingressos-service.js';

const sendJson = (response, status, body) => {
  response.status(status).json(body);
};

const isMassResendRequest = (body) =>
  typeof body?.mensagemDestaque === 'string' && body.mensagemDestaque.trim().length > 0;

export const createReenviarIngressosHandler = ({
  reenviar = reenviarIngressosPorEmail,
  reenviarEmMassa = reenviarIngressosEmMassa
} = {}) => async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Método não permitido.' });
  }

  const cookieValue = getAdminCookieValue(request);
  const session = verifyAdminSessionCookie(cookieValue, { secret: process.env.ADMIN_SESSION_SECRET });
  if (!session) {
    return sendJson(response, 401, { error: 'Não autenticado.' });
  }

  const body = request.body || {};

  try {
    if (isMassResendRequest(body)) {
      const resumo = await reenviarEmMassa({
        mensagemDestaque: body.mensagemDestaque,
        tipoIngresso: body.tipoIngresso
      });
      return sendJson(response, 200, resumo);
    }

    const result = await reenviar({
      email: body.email,
      codigoPedido: body.codigoPedido
    });
    return sendJson(response, 200, { success: true, ...result });
  } catch (error) {
    const message = error?.message || 'Falha ao reenviar ingressos.';
    const status = /inválid|Informe|não encontrado|Pay-Per-View|pagos|Nenhum ingresso|máximo/.test(message)
      ? 400
      : 500;
    return sendJson(response, status, { error: message });
  }
};

export default createReenviarIngressosHandler();
