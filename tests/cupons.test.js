import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUPOM_INDISPONIVEL_MESSAGE,
  calculatePricingWithCupom,
  calculateUnitValueForCheckout,
  criarCupomDesconto,
  markCupomAsUsed,
  normalizeCupomCodigo,
  validateValorDesconto
} from '../services/cupons-service.js';

test('normalizeCupomCodigo padroniza código em maiúsculas', () => {
  assert.equal(normalizeCupomCodigo(' afc-karla20 '), 'AFC-KARLA20');
});

test('validateValorDesconto aceita valor positivo', () => {
  assert.equal(validateValorDesconto('20'), 20);
});

test('validateValorDesconto rejeita valor inválido', () => {
  assert.throws(() => validateValorDesconto(0), /valor de desconto válido/i);
});

test('calculatePricingWithCupom aplica desconto fixo em reais', async () => {
  const pricing = await calculatePricingWithCupom(
    { tipoIngresso: 'arquibancada', quantidade: 1, codigoCupom: 'AFC-KARLA20' },
    {
      buscarCupom: async () => ({
        codigo: 'AFC-KARLA20',
        valor_desconto: 20,
        usado: false
      })
    }
  );

  assert.equal(pricing.subtotal, 60);
  assert.equal(pricing.desconto, 20);
  assert.equal(pricing.total, 40);
  assert.equal(pricing.cupomCodigo, 'AFC-KARLA20');
});

test('calculatePricingWithCupom rejeita cupom usado', async () => {
  await assert.rejects(
    () => calculatePricingWithCupom(
      { tipoIngresso: 'vip', quantidade: 1, codigoCupom: 'AFC-USADO' },
      {
        buscarCupom: async () => ({
          codigo: 'AFC-USADO',
          valor_desconto: 20,
          usado: true
        })
      }
    ),
    /Cupom de desconto não disponível/i
  );
});

test('calculatePricingWithCupom limita desconto ao total mínimo do checkout', async () => {
  const pricing = await calculatePricingWithCupom(
    { tipoIngresso: 'pay-per-view', quantidade: 1, codigoCupom: 'AFC-PPV50' },
    {
      buscarCupom: async () => ({
        codigo: 'AFC-PPV50',
        valor_desconto: 50,
        usado: false
      })
    }
  );

  assert.equal(pricing.subtotal, 45);
  assert.equal(pricing.desconto, 44);
  assert.equal(pricing.total, 1);
});

test('calculatePricingWithCupom traduz erro de infraestrutura do Supabase', async () => {
  await assert.rejects(
    () => calculatePricingWithCupom(
      { tipoIngresso: 'arquibancada', quantidade: 1, codigoCupom: 'AFC-TESTE' },
      {
        buscarCupom: async () => {
          throw new Error("Could not find the table 'public.cupons' in the schema cache");
        }
      }
    ),
    (error) => error.message === CUPOM_INDISPONIVEL_MESSAGE
  );
});

test('calculateUnitValueForCheckout calcula valor unitário com desconto', () => {
  assert.equal(calculateUnitValueForCheckout(100, 2), 50);
});

test('criarCupomDesconto gera código automático quando não informado', async () => {
  let inserted = null;

  const cupom = await criarCupomDesconto(
    { valorDesconto: 20 },
    {
      gerarCodigo: () => 'AFC-AUTO123',
      buscarCupom: async () => null,
      inserirCupom: async (payload) => {
        inserted = payload;
        return {
          codigo: payload.codigo,
          valor_desconto: payload.valorDesconto,
          usado: false,
          created_at: new Date().toISOString()
        };
      }
    }
  );

  assert.equal(cupom.codigo, 'AFC-AUTO123');
  assert.equal(inserted.valorDesconto, 20);
});

test('markCupomAsUsed marca cupom como utilizado', async () => {
  let payload = null;

  const result = await markCupomAsUsed(
    { codigo: 'AFC-KARLA20', pedidoId: 'pedido-1' },
    {
      atualizarCupom: async (data) => {
        payload = data;
        return { codigo: data.codigo, usado: true };
      }
    }
  );

  assert.equal(result.usado, true);
  assert.equal(payload.pedidoId, 'pedido-1');
});
