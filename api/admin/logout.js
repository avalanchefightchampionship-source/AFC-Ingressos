import { clearAdminSessionCookie } from '../../lib/admin-auth.js';

const sendJson = (response, status, body) => {
  response.status(status).json(body);
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Método não permitido.' });
  }

  response.setHeader('Set-Cookie', clearAdminSessionCookie());
  return sendJson(response, 200, { authenticated: false });
}
