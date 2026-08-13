import { getAdminCookieValue, verifyAdminSessionCookie } from '../../lib/admin-auth.js';
import { getSupabaseAdmin } from '../../lib/supabase-admin.js';
import { APPROVED_PAYMENT_STATUS_VALUES } from '../../services/payment-events.js';
import { criarCupomDesconto } from '../../services/cupons-service.js';
import { listCupons } from '../../repositories/cupons-repository.js';

const sendJson = (response, status, body) => {
  response.status(status).json(body);
};

export const getDashboardData = async (supabase) => {
  const { data: pedidos, error: pedidosError } = await supabase
    .from('pedidos')
    .select('id, nome, email, quantidade, valor_total, created_at, status_pagamento, tipo_ingresso, email_enviado, email_tentativas, email_ultimo_erro, transmissao_enviada, transmissao_tentativas, transmissao_ultimo_erro')
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

  const { count: emailsEnviados, error: emailsEnviadosError } = await supabase
    .from('pedidos')
    .select('*', { count: 'exact', head: true })
    .in('status_pagamento', APPROVED_PAYMENT_STATUS_VALUES)
    .eq('email_enviado', true);

  if (emailsEnviadosError) throw emailsEnviadosError;

  const { count: emailsFalhas, error: emailsFalhasError } = await supabase
    .from('pedidos')
    .select('*', { count: 'exact', head: true })
    .in('status_pagamento', APPROVED_PAYMENT_STATUS_VALUES)
    .eq('email_enviado', false)
    .not('email_ultimo_erro', 'is', null);

  if (emailsFalhasError) throw emailsFalhasError;

  const { count: ppvPagos, error: ppvPagosError } = await supabase
    .from('pedidos')
    .select('*', { count: 'exact', head: true })
    .eq('tipo_ingresso', 'pay-per-view')
    .in('status_pagamento', APPROVED_PAYMENT_STATUS_VALUES);

  if (ppvPagosError) throw ppvPagosError;

  const { count: ppvTransmissaoPendente, error: ppvTransmissaoError } = await supabase
    .from('pedidos')
    .select('*', { count: 'exact', head: true })
    .eq('tipo_ingresso', 'pay-per-view')
    .in('status_pagamento', APPROVED_PAYMENT_STATUS_VALUES)
    .eq('transmissao_enviada', false);

  if (ppvTransmissaoError) throw ppvTransmissaoError;

  const cupons = await listCupons({ limit: 50, client: supabase });

  return {
    dashboard: {
      totalPedidos: totalPedidos || 0,
      pedidosPagos: pedidosPagos || 0,
      pedidosPendentes: pedidosPendentes || 0,
      pedidosCancelados: pedidosCancelados || 0,
      totalIngressos: totalIngressos || 0,
      valorTotalVendido,
      emailsEnviados: emailsEnviados || 0,
      emailsFalhas: emailsFalhas || 0,
      ppvPagos: ppvPagos || 0,
      ppvTransmissaoPendente: ppvTransmissaoPendente || 0
    },
    pedidos: (pedidos || []).map((pedido) => ({
      ...pedido,
      status_email: pedido.email_enviado ? 'enviado' : (pedido.email_ultimo_erro ? 'falha' : 'pendente')
    })),
    cupons: (cupons || []).map((cupom) => ({
      ...cupom,
      status: cupom.usado ? 'usado' : 'disponivel'
    }))
  };
};

export default async function handler(request, response) {
  const cookieValue = getAdminCookieValue(request);
  const session = verifyAdminSessionCookie(cookieValue, { secret: process.env.ADMIN_SESSION_SECRET });
  if (!session) {
    return sendJson(response, 401, { error: 'Não autenticado.' });
  }

  if (request.method === 'POST') {
    const { acao, valorDesconto, codigo } = request.body || {};
    if (acao !== 'criar-cupom') {
      response.setHeader('Allow', 'GET, POST');
      return sendJson(response, 405, { error: 'Método não permitido.' });
    }

    try {
      const cupom = await criarCupomDesconto({ valorDesconto, codigo });
      return sendJson(response, 201, {
        success: true,
        cupom: {
          ...cupom,
          status: cupom.usado ? 'usado' : 'disponivel'
        }
      });
    } catch (error) {
      console.error(error);
      return sendJson(response, 400, {
        error: error?.message || 'Não foi possível criar o cupom.'
      });
    }
  }

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET, POST');
    return sendJson(response, 405, { error: 'Método não permitido.' });
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