import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAsaasCheckoutCustomerData,
  buildAsaasCheckoutPayload,
  parseCheckoutAddressNumber
} from '../services/asaas-checkout-payload.js';

const baseArgs = {
  quantidade: 1,
  externalReference: 'ref-123',
  callback: {
    cancelUrl: 'https://example.com/',
    expiredUrl: 'https://example.com/?checkout=expirado',
    successUrl: 'https://example.com/?checkout=sucesso'
  }
};

const sampleCustomerData = {
  name: 'Cliente Teste',
  email: 'cliente@example.com',
  phone: '44999999999',
  cpfCnpj: '39053344705',
  postalCode: '87300000',
  addressNumber: 123,
  address: 'Rua Principal',
  province: 'Centro',
  state: 'PR',
  city: 4104303
};

test('payload de arquibancada permite somente PIX', () => {
  const payload = buildAsaasCheckoutPayload({
    ...baseArgs,
    tipoIngresso: 'arquibancada',
    ticket: { name: 'Ingresso Arquibancada', value: 60 }
  });

  assert.deepEqual(payload.billingTypes, ['PIX']);
  assert.deepEqual(payload.chargeTypes, ['DETACHED']);
  assert.equal(payload.installment, undefined);
});

test('payload de vip permite somente PIX', () => {
  const payload = buildAsaasCheckoutPayload({
    ...baseArgs,
    tipoIngresso: 'vip',
    ticket: { name: 'Ingresso Cadeira VIP', value: 150 }
  });

  assert.deepEqual(payload.billingTypes, ['PIX']);
  assert.deepEqual(payload.chargeTypes, ['DETACHED']);
  assert.equal(payload.installment, undefined);
});

test('payload de pay-per-view permite somente PIX', () => {
  const payload = buildAsaasCheckoutPayload({
    ...baseArgs,
    tipoIngresso: 'pay-per-view',
    ticket: { name: 'Pay-Per-View', value: 45 }
  });

  assert.deepEqual(payload.billingTypes, ['PIX']);
  assert.deepEqual(payload.chargeTypes, ['DETACHED']);
  assert.equal(payload.installment, undefined);
});

test('payload usa customerData quando informado', () => {
  const payload = buildAsaasCheckoutPayload({
    ...baseArgs,
    tipoIngresso: 'arquibancada',
    ticket: { name: 'Ingresso Arquibancada', value: 60 },
    customerData: sampleCustomerData
  });

  assert.deepEqual(payload.customerData, sampleCustomerData);
  assert.equal(payload.customer, undefined);
});

test('parseCheckoutAddressNumber converte número e trata S/N', () => {
  assert.equal(parseCheckoutAddressNumber('123'), 123);
  assert.equal(parseCheckoutAddressNumber('123A'), 123);
  assert.equal(parseCheckoutAddressNumber('S/N'), 1);
});

test('buildAsaasCheckoutCustomerData inclui UF, IBGE e addressNumber numérico', () => {
  const customerData = buildAsaasCheckoutCustomerData({
    name: 'Cliente Teste',
    email: 'cliente@example.com',
    mobilePhone: '44999999999',
    cpfCnpj: '39053344705',
    postalCode: '87300000',
    addressNumber: '123',
    address: 'Rua Principal',
    province: 'Centro',
    state: 'PR',
    cityCode: 4104303
  });

  assert.equal(customerData.state, 'PR');
  assert.equal(customerData.city, 4104303);
  assert.equal(customerData.addressNumber, 123);
  assert.equal(customerData.email, 'cliente@example.com');
});
