import { getAdminCookieValue, verifyAdminSessionCookie } from '../../lib/admin-auth.js';
import {
  buildCompradoresExportFilename,
  createCompradoresExportFile
} from '../../services/admin-export-service.js';

const sendJson = (response, status, body) => {
  response.status(status).json(body);
};

export const createAdminExportCompradoresHandler = (
  {
    createExportFile = createCompradoresExportFile,
    getNow = () => new Date()
  } = {}
) => async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { error: 'Método não permitido.' });
  }

  const cookieValue = getAdminCookieValue(request);
  const session = verifyAdminSessionCookie(cookieValue, { secret: process.env.ADMIN_SESSION_SECRET });
  if (!session) {
    return sendJson(response, 401, { error: 'Não autenticado.' });
  }

  try {
    const { buffer, contentType } = await createExportFile();
    const fileName = buildCompradoresExportFilename(getNow());

    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    response.setHeader('Content-Length', String(buffer.length));
    response.status(200);

    if (typeof response.send === 'function') {
      return response.send(buffer);
    }

    if (typeof response.end === 'function') {
      return response.end(buffer);
    }

    return buffer;
  } catch (error) {
    console.error('Falha ao exportar compradores.', {
      code: error?.code || null,
      message: error?.message || null
    });
    return sendJson(response, 500, { error: 'Falha ao exportar compradores.' });
  }
};

export default createAdminExportCompradoresHandler();