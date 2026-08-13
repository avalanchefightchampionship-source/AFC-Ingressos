import {
  createCupom,
  findCupomByCodigo,
  generateCupomCodigo,
  markCupomAsUsed as markCupomAsUsedInRepository,
  normalizeCupomCodigo
} from '../repositories/cupons-repository.js';
import {
  MIN_CHECKOUT_TOTAL,
  calculateSubtotal,
  roundMoney
} from './ticket-pricing.js';

export { normalizeCupomCodigo };

export const validateValorDesconto = (valorDesconto) => {
  const value = Number(valorDesconto);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Informe um valor de desconto válido.');
  }
  if (value > 9999.99) {
    throw new Error('O valor do desconto é muito alto.');
  }
  return roundMoney(value);
};

export const validateCupomCodigoInput = (codigo) => {
  const cleanCodigo = normalizeCupomCodigo(codigo);
  if (cleanCodigo.length < 4 || cleanCodigo.length > 40) {
    throw new Error('Código do cupom inválido.');
  }
  if (!/^[A-Z0-9-]+$/.test(cleanCodigo)) {
    throw new Error('Código do cupom inválido.');
  }
  return cleanCodigo;
};

export const calculatePricingWithCupom = async (
  { tipoIngresso, quantidade, codigoCupom },
  { buscarCupom = findCupomByCodigo } = {}
) => {
  const subtotal = calculateSubtotal(tipoIngresso, quantidade);
  const cleanCodigo = typeof codigoCupom === 'string' ? normalizeCupomCodigo(codigoCupom) : '';

  if (!cleanCodigo) {
    return {
      subtotal,
      desconto: 0,
      total: subtotal,
      cupomCodigo: null,
      valorDescontoCupom: null
    };
  }

  validateCupomCodigoInput(cleanCodigo);
  const cupom = await buscarCupom(cleanCodigo);
  if (!cupom) {
    throw new Error('Cupom inválido ou já utilizado.');
  }
  if (cupom.usado) {
    throw new Error('Cupom inválido ou já utilizado.');
  }

  const maxDesconto = roundMoney(subtotal - MIN_CHECKOUT_TOTAL);
  if (maxDesconto <= 0) {
    throw new Error('Este pedido não permite desconto.');
  }

  const desconto = roundMoney(Math.min(Number(cupom.valor_desconto), maxDesconto));
  const total = roundMoney(subtotal - desconto);

  return {
    subtotal,
    desconto,
    total,
    cupomCodigo: cupom.codigo,
    valorDescontoCupom: Number(cupom.valor_desconto)
  };
};

export const criarCupomDesconto = async (
  { valorDesconto, codigo },
  { gerarCodigo = generateCupomCodigo, inserirCupom = createCupom, buscarCupom = findCupomByCodigo } = {}
) => {
  const cleanValor = validateValorDesconto(valorDesconto);
  const cleanCodigo = codigo ? validateCupomCodigoInput(codigo) : gerarCodigo();

  if (await buscarCupom(cleanCodigo)) {
    throw new Error('Já existe um cupom com este código.');
  }

  const cupom = await inserirCupom({
    codigo: cleanCodigo,
    valorDesconto: cleanValor
  });

  return cupom;
};

export const markCupomAsUsed = async (
  { codigo, pedidoId },
  { atualizarCupom = markCupomAsUsedInRepository } = {}
) => {
  if (!codigo || !pedidoId) return null;
  return atualizarCupom({ codigo, pedidoId });
};

export const calculateUnitValueForCheckout = (valorTotal, quantidade) =>
  roundMoney(valorTotal / quantidade);
