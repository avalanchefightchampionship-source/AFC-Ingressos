import { getAdminCookieValue, verifyAdminSessionCookie } from '../../../../lib/admin-auth.js';
import { getSupabaseAdmin } from '../../../../lib/supabase-admin.js';

const sendJson = (response, status, body) => {
  response.status(status).json(body);
};

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { error: 'Método não permitido.' });
  }

  const cookieValue = getAdminCookieValue(request);
  const session = verifyAdminSessionCookie(cookieValue, { secret: process.env.ADMIN_SESSION_SECRET });
  if (!session) {
    return sendJson(response, 401, { error: 'Não autenticado.' });
  }

  const id = request.query?.id || request.query?.['id'] || '';
  if (!id) {
    return sendJson(response, 400, { error: 'ID inválido.' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('pedidos')
      .select('id, codigo_pedido, nome, email, telefone, cpf, quantidade, valor_total, status_pagamento, status_pedido, created_at, updated_at, external_reference, ref_afiliado, asaas_checkout_id, asaas_payment_id, asaas_customer_id, status_pagamento, status_pedido, email_enviado, email_enviado_em, email_tentativas, email_ultimo_erro')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return sendJson(response, 404, { error: 'Pedido não encontrado.' });

    const { data: ingressos, error: ingressosError } = await supabase
      .from('ingressos')
      .select('id, codigo_ingresso, categoria, status, utilizado, qr_code, created_at')
      .eq('pedido_id', id)
      .order('created_at', { ascending: true });

    if (ingressosError) throw ingressosError;

    return sendJson(response, 200, {
      pedido: data,
      ingressos: ingressos || []
    });
  } catch (error) {
    return sendJson(response, 500, { error: 'Falha ao consultar detalhes do pedido.' });
  }
}
