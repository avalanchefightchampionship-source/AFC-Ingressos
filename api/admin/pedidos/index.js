import { getAdminCookieValue, verifyAdminSessionCookie } from '../../../lib/admin-auth.js';
import { getSupabaseAdmin } from '../../../lib/supabase-admin.js';

const sendJson = (response, status, body) => {
  response.status(status).json(body);
};

const parseIntParam = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
};

const normalizeStatusEmail = (value) => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  if (['enviado', 'pendente', 'falha'].includes(normalized)) return normalized;
  return '';
};

const buildStatusEmail = (pedido) => {
  if (pedido?.email_enviado) return 'enviado';
  if ((pedido?.email_tentativas || 0) > 0 && pedido?.email_ultimo_erro) return 'falha';
  return 'pendente';
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

  const { searchParams } = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
  const busca = (searchParams.get('busca') || '').trim();
  const statusPagamento = (searchParams.get('status_pagamento') || '').trim();
  const statusEmail = normalizeStatusEmail(searchParams.get('status_email'));
  const pagina = parseIntParam(searchParams.get('pagina'), 1);
  const limite = parseIntParam(searchParams.get('limite'), 20);
  const safeLimite = Math.min(Math.max(limite, 1), 100);
  const offset = (pagina - 1) * safeLimite;

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('pedidos')
      .select('id, codigo_pedido, nome, email, telefone, quantidade, valor_total, status_pagamento, status_pedido, created_at, external_reference, ref_afiliado, email_enviado, email_enviado_em, email_tentativas, email_ultimo_erro', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + safeLimite - 1);

    if (busca) {
      const searchValue = `%${busca}%`;
      query = query.or(`nome.ilike.${searchValue},email.ilike.${searchValue},codigo_pedido.ilike.${searchValue},external_reference.ilike.${searchValue}`);
    }

    if (statusPagamento) {
      query = query.eq('status_pagamento', statusPagamento);
    }

    if (statusEmail) {
      if (statusEmail === 'enviado') {
        query = query.eq('email_enviado', true);
      } else if (statusEmail === 'falha') {
        query = query.or('email_ultimo_erro.not.is.null,email_tentativas.gte.1');
      } else {
        query = query.eq('email_enviado', false);
      }
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const pedidos = (data || []).map((pedido) => ({
      ...pedido,
      status_email: buildStatusEmail(pedido)
    }));

    return sendJson(response, 200, {
      pedidos,
      pagina,
      limite: safeLimite,
      total: count || 0,
      totalPaginas: Math.max(1, Math.ceil((count || 0) / safeLimite))
    });
  } catch (error) {
    return sendJson(response, 500, { error: 'Falha ao consultar pedidos.' });
  }
}
