import { getSupabaseAdmin } from '../lib/supabase-admin.js';

const TABLE = 'pedidos';
const PEDIDO_SELECT = 'id, codigo_pedido, status_pagamento, status_pedido, email_enviado, email_enviado_em, email_tentativas, email_ultimo_erro';

export const createPedido = async (pedido) => {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert(pedido)
    .select('id, codigo_pedido, external_reference')
    .single();

  if (error) throw error;
  return data;
};

export const updatePedidoCheckout = async (pedidoId, checkoutData) => {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(checkoutData)
    .eq('id', pedidoId)
    .select('id')
    .single();

  if (error) throw error;
  return data;
};

export const markPedidoCheckoutFailed = async (pedidoId) => {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ status_pedido: 'FALHA_CHECKOUT' })
    .eq('id', pedidoId);

  if (error) throw error;
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

export const updatePedidoPaymentStatus = async (pedidoId, paymentData) => {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(paymentData)
    .eq('id', pedidoId)
    .select(PEDIDO_SELECT)
    .single();

  if (error) throw error;
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
