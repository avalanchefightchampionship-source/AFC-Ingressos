import { getSupabaseAdmin } from '../lib/supabase-admin.js';

export const emitIngressosForPedido = async (pedidoId) => {
  const { data, error } = await getSupabaseAdmin().rpc(
    'emitir_ingressos_para_pedido',
    { p_pedido_id: pedidoId }
  );

  if (error) throw error;
  return data;
};

export const findIngressosByPedidoId = async (pedidoId) => {
  const { data, error } = await getSupabaseAdmin()
    .from('ingressos')
    .select('id, pedido_id, codigo_ingresso, categoria, status, utilizado, qr_code, checkin_at, created_at')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
};
