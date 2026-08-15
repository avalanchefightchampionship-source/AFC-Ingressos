import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAsaasCheckoutCustomerData,
  buildAsaasCheckoutPayload,
  buildAsaasCustomerPayload
} from '../services/asaas-checkout-payload.js';

const baseArgs = {
  quantidade: 1,
  externalReference: 'ref-123',
  customerId: 'cus_abc',
  callback: {
    cancelUrl: 'https://example.com/',
    expiredUrl: 'https://example.com/?checkout=expirado',
    successUrl: 'https://example.com/?checkout=sucesso'
  }
};

test('payload de arquibancada permite cartão à vista sem parcelamento', () => {
  const payload = buildAsaasCheckoutPayload({
    ...baseArgs,
    tipoIngresso: 'arquibancada',
    ticket: { name: 'Ingresso Arquibancada', value: 60 }
  });

  assert.deepEqual(payload.billingTypes, ['PIX', 'CREDIT_CARD']);
  assert.deepEqual(payload.chargeTypes, ['DETACHED']);
  assert.equal(payload.installment, undefined);
});

test('payload de vip permite cartão à vista sem parcelamento', () => {
  const payload = buildAsaasCheckoutPayload({
    ...baseArgs,
    tipoIngresso: 'vip',
    ticket: { name: 'Ingresso Cadeira VIP', value: 150 }
  });

  assert.deepEqual(payload.chargeTypes, ['DETACHED']);
  assert.equal(payload.installment, undefined);
});

test('payload de pay-per-view permite cartão à vista sem parcelamento', () => {
  const payload = buildAsaasCheckoutPayload({
    ...baseArgs,
    tipoIngresso: 'pay-per-view',
    ticket: { name: 'Pay-Per-View', value: 45 }
  });

  assert.deepEqual(payload.chargeTypes, ['DETACHED']);
  assert.equal(payload.installment, undefined);
});

test('payload usa customer id quando informado', () => {
  const payload = buildAsaasCheckoutPayload({
    ...baseArgs,
    tipoIngresso: 'arquibancada',
    ticket: { name: 'Ingresso Arquibancada', value: 60 },
    customerId: 'cus_abc'
  });

  assert.equal(payload.customer, 'cus_abc');
  assert.equal(payload.customerData, undefined);
});

test('buildAsaasCheckoutCustomerData inclui UF e código IBGE', () => {
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
});

test('payload de cliente inclui endereço completo e desabilita notificações do Asaas', () => {
  const payload = buildAsaasCustomerPayload({
    name: 'Cliente Teste',
    email: 'cliente@example.com',
    mobilePhone: '44999999999',
    cpfCnpj: '39053344705',
    postalCode: '87300000',
    addressNumber: '123',
    address: 'Rua Principal',
    province: 'Centro',
    cityName: 'Campo Mourão',
    state: 'PR',
    cityCode: 4104303
  });

  assert.equal(payload.notificationDisabled, true);
  assert.equal(payload.province, 'Centro');
  assert.equal(payload.cityName, 'Campo Mourão');
  assert.equal(payload.state, 'PR');
  assert.equal(payload.city, 4104303);
  assert.equal(payload.email, 'cliente@example.com');
});
