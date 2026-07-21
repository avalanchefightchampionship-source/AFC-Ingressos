import { getAdminCookieValue, verifyAdminSessionCookie } from '../../lib/admin-auth.js';
import { getSupabaseAdmin } from '../../lib/supabase-admin.js';
import { APPROVED_PAYMENT_STATUS_VALUES } from '../../services/payment-events.js';

const sendJson = (response, status, body) => {
  response.status(status).json(body);
};

export const getDashboardData = async (supabase) => {
  const { data: pedidos, error: pedidosError } = await supabase
    .from('pedidos')
    .select('id, nome, email, quantidade, valor_total, created_at, status_pagamento, email_enviado, email_tentativas, email_ultimo_erro')
    .order('created_at', { ascending: false })
    .limit(10);

  if (pedidosError) throw pedidosError;

  const { count: totalPedidos, error: totalError } = await supabase
    .from('pedidos')
    .select('*', { count: 'exact', head: true });

  if (totalError) throw totalError;

  const { count: pedidosPagos, error: pagosError } = await supabase
    .from('pedidos')
    .select('*', { count: 'exact', head: true })
    .in('status_pagamento', APPROVED_PAYMENT_STATUS_VALUES);

  if (pagosError) throw pagosError;

  const { count: pedidosPendentes, error: pendentesError } = await supabase
    .from('pedidos')
    .select('*', { count: 'exact', head: true })
    .eq('status_pagamento', 'AGUARDANDO_PAGAMENTO');

  if (pendentesError) throw pendentesError;

  const { count: pedidosCancelados, error: canceladosError } = await supabase
    .from('pedidos')
    .select('*', { count: 'exact', head: true })
    .eq('status_pagamento', 'CANCELADO');

  if (canceladosError) throw canceladosError;

  const { count: totalIngressos, error: ingressosError } = await supabase
    .from('ingressos')
    .select('*', { count: 'exact', head: true });

  if (ingressosError) throw ingressosError;

  const { data: valorData, error: valorError } = await supabase
    .from('pedidos')
    .select('valor_total')
    .in('status_pagamento', APPROVED_PAYMENT_STATUS_VALUES);

  if (valorError) throw valorError;

  const valorTotalVendido = (valorData || []).reduce((sum, item) => sum + Number(item.valor_total || 0), 0);
  const emailsEnviados = (pedidos || []).filter((pedido) => pedido.email_enviado).length;
  const emailsFalhas = (pedidos || []).filter((pedido) => (pedido.email_tentativas || 0) > 0 && pedido.email_ultimo_erro).length;

  return {
    dashboard: {
      totalPedidos: totalPedidos || 0,
      pedidosPagos: pedidosPagos || 0,
      pedidosPendentes: pedidosPendentes || 0,
      pedidosCancelados: pedidosCancelados || 0,
      totalIngressos: totalIngressos || 0,
      valorTotalVendido,
      emailsEnviados,
      emailsFalhas
    },
    pedidos: (pedidos || []).map((pedido) => ({
      ...pedido,
      status_email: pedido.email_enviado ? 'enviado' : (pedido.email_ultimo_erro ? 'falha' : 'pendente')
    }))
  };
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

  try {
    const supabase = getSupabaseAdmin();
    const dashboardData = await getDashboardData(supabase);

    return sendJson(response, 200, dashboardData);
 } catch (error) {
  console.error(error);

  return sendJson(response, 500, {
    error: error.message,
    stack: process.env.NODE_ENV !== 'production'
      ? error.stack
      : undefined
  });
}
}