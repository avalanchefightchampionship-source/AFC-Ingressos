import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';

const TABLE = 'cupons';
const CUPOM_SELECT = 'id, codigo, valor_desconto, usado, usado_em, pedido_id, created_at';

export const normalizeCupomCodigo = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase().replace(/\s+/g, '-');
};

export const findCupomByCodigo = async (codigo) => {
  const cleanCodigo = normalizeCupomCodigo(codigo);
  if (!cleanCodigo) return null;

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select(CUPOM_SELECT)
    .eq('codigo', cleanCodigo)
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const listCupons = async ({ limit = 50, client } = {}) => {
  const supabase = client || getSupabaseAdmin();
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const { data, error } = await supabase
    .from(TABLE)
    .select(CUPOM_SELECT)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data || [];
};

export const createCupom = async ({ codigo, valorDesconto }) => {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({
      codigo,
      valor_desconto: valorDesconto
    })
    .select(CUPOM_SELECT)
    .single();

  if (error) throw error;
  return data;
};

export const generateCupomCodigo = () => `AFC-${randomUUID().slice(0, 8).toUpperCase()}`;

export const markCupomAsUsed = async ({ codigo, pedidoId }) => {
  const cleanCodigo = normalizeCupomCodigo(codigo);
  if (!cleanCodigo) return null;

  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      usado: true,
      usado_em: new Date().toISOString(),
      pedido_id: pedidoId
    })
    .eq('codigo', cleanCodigo)
    .eq('usado', false)
    .select(CUPOM_SELECT)
    .maybeSingle();

  if (error) throw error;
  return data;
};
