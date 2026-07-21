import { getSupabaseAdmin } from '../lib/supabase-admin.js';

const TABLE = 'pedidos';
export const PEDIDO_SELECT = 'id, codigo_pedido, nome, email, telefone, tipo_ingresso, quantidade, valor_total, status_pagamento, status_pedido, asaas_payment_id, email_enviado, email_enviado_em, email_tentativas, email_ultimo_erro';

export const createPedido = async (pedido) => {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert(pedido)
    .select('id, codigo_pedido, external_reference')
    .single();

  if (error) {
    console.error('Supabase insert on pedidos failed.', {
      code: error?.code || null,
      message: error?.message || null,
      details: error?.details || null,
      hint: error?.hint || null
    });
    throw error;
  }

  console.info('Supabase insert on pedidos succeeded.', {
    pedidoId: data?.id || null,
    codigoPedido: data?.codigo_pedido || null,
    externalReference: data?.external_reference || null
  });
  return data;
};

export const updatePedidoCheckout = async (pedidoId, checkoutData) => {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(checkoutData)
    .eq('id', pedidoId)
    .select('id')
    .single();

  if (error) {
    console.error('Supabase update on pedidos checkout data failed.', {
      pedidoId,
      code: error?.code || null,
      message: error?.message || null,
      details: error?.details || null,
      hint: error?.hint || null
    });
    throw error;
  }
  return data;
};

export const markPedidoCheckoutFailed = async (pedidoId) => {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ status_pedido: 'FALHA_CHECKOUT' })
    .eq('id', pedidoId);

  if (error) {
    console.error('Supabase update on pedidos failure status failed.', {
      pedidoId,
      code: error?.code || null,
      message: error?.message || null,
      details: error?.details || null,
      hint: error?.hint || null
    });
    throw error;
  }
};

export const findPedidoByExternalReference = async (externalReference) => {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(PEDIDO_SELECT)
    .eq('external_reference', externalReference)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const findPedidoByPaymentId = async (paymentId) => {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(PEDIDO_SELECT)
    .eq('asaas_payment_id', paymentId)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const findPedidoByCheckoutId = async (checkoutId) => {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(PEDIDO_SELECT)
    .eq('asaas_checkout_id', checkoutId)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const updatePedidoPaymentStatus = async (pedidoId, paymentData) => {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(paymentData)
    .eq('id', pedidoId)
    .select(PEDIDO_SELECT)
    .single();

  if (error) {
    console.error('Supabase update on pedidos payment status failed.', {
      pedidoId,
      code: error?.code || null,
      message: error?.message || null,
      details: error?.details || null,
      hint: error?.hint || null
    });
    throw error;
  }

  console.info('Supabase payment status updated.', {
    pedidoId: data?.id || pedidoId,
    codigoPedido: data?.codigo_pedido || null,
    statusPagamento: data?.status_pagamento || null,
    statusPedido: data?.status_pedido || null,
    asaasPaymentIdSaved: Boolean(data?.asaas_payment_id)
  });
  return data;
};

export const updatePedidoEmailStatus = async (pedidoId, emailData) => {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(emailData)
    .eq('id', pedidoId)
    .select(PEDIDO_SELECT)
    .single();

  if (error) throw error;
  return data;
};
