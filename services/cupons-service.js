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

export const CUPOM_INDISPONIVEL_MESSAGE = 'Cupom de desconto não disponível';

export const isCupomInfrastructureError = (error) => {
  const message = String(error?.message || error || '');
  const code = String(error?.code || '');
  return code === 'PGRST205'
    || /public\.cupons/i.test(message)
    || /schema cache/i.test(message)
    || /relation.*cupons.*does not exist/i.test(message);
};

export const toCupomPublicError = () => new Error(CUPOM_INDISPONIVEL_MESSAGE);

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

  try {
    validateCupomCodigoInput(cleanCodigo);
    const cupom = await buscarCupom(cleanCodigo);
    if (!cupom || cupom.usado) {
      throw toCupomPublicError();
    }

    const maxDesconto = roundMoney(subtotal - MIN_CHECKOUT_TOTAL);
    if (maxDesconto <= 0) {
      throw toCupomPublicError();
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
  } catch (error) {
    if (error?.message === CUPOM_INDISPONIVEL_MESSAGE) {
      throw error;
    }
    if (isCupomInfrastructureError(error)) {
      throw toCupomPublicError();
    }
    throw toCupomPublicError();
  }
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

export const resolveCheckoutItemPricing = (valorTotal, quantidade) => {
  const total = roundMoney(valorTotal);
  const safeQuantity = Number.isInteger(quantidade) && quantidade > 0 ? quantidade : 1;
  const unitValue = calculateUnitValueForCheckout(total, safeQuantity);

  if (roundMoney(unitValue * safeQuantity) === total) {
    return {
      unitValue,
      quantidade: safeQuantity,
      total
    };
  }

  return {
    unitValue: total,
    quantidade: 1,
    total
  };
};
