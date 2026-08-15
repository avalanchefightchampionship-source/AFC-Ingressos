import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidCpf,
  normalizeAffiliateReference,
  normalizeDigits,
  parseCheckoutInput,
  parseCheckoutQuantity
} from '../services/checkout-input.js';

const validBody = {
  nome: 'Maria Silva',
  telefone: '44999998888',
  email: 'maria@example.com',
  cpfCnpj: '39053344705',
  cep: '87300000',
  numeroEndereco: '123',
  tipoIngresso: 'arquibancada',
  quantidade: 2,
  referenciaAfiliado: 'AFC'
};

test('parseCheckoutInput aceita payload válido', () => {
  const result = parseCheckoutInput(validBody);
  assert.equal(result.ok, true);
  assert.equal(result.data.cleanQuantity, 2);
  assert.equal(result.data.cleanPostalCode, '87300000');
});

test('parseCheckoutInput aceita CEP e telefone numéricos', () => {
  const result = parseCheckoutInput({
    ...validBody,
    telefone: 44999998888,
    cep: 87300000,
    numeroEndereco: 456
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.cleanPostalCode, '87300000');
  assert.equal(result.data.cleanAddressNumber, '456');
});

test('parseCheckoutQuantity aceita string numérica', () => {
  assert.equal(parseCheckoutQuantity('3'), 3);
  assert.equal(parseCheckoutQuantity(4), 4);
  assert.equal(parseCheckoutQuantity(null), null);
});

test('normalizeDigits extrai apenas números', () => {
  assert.equal(normalizeDigits('87300-000', 8), '87300000');
  assert.equal(normalizeDigits(87300000, 8), '87300000');
});

test('normalizeAffiliateReference trunca referências longas', () => {
  const longRef = 'A'.repeat(150);
  assert.equal(normalizeAffiliateReference(longRef).length, 100);
  assert.equal(normalizeAffiliateReference(''), 'Venda direta');
});

test('parseCheckoutInput rejeita CPF inválido com motivo', () => {
  const result = parseCheckoutInput({ ...validBody, cpfCnpj: '11111111111' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cpf_invalido');
});

test('isValidCpf valida dígitos verificadores', () => {
  assert.equal(isValidCpf('39053344705'), true);
  assert.equal(isValidCpf('39053344706'), false);
});
