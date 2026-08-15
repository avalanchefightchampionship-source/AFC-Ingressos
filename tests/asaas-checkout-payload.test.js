import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_CREDIT_CARD_INSTALLMENTS,
  buildAsaasCheckoutCustomerData,
  buildAsaasCheckoutPayload,
  buildAsaasCustomerPayload,
  resolveMaxInstallmentCount,
  supportsCreditCardInstallments
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

test('supportsCreditCardInstallments habilita arquibancada e vip', () => {
  assert.equal(supportsCreditCardInstallments('arquibancada'), true);
  assert.equal(supportsCreditCardInstallments('vip'), true);
  assert.equal(supportsCreditCardInstallments('pay-per-view'), false);
});

test('payload de arquibancada permite parcelamento em até 3x no cartão', () => {
  const payload = buildAsaasCheckoutPayload({
    ...baseArgs,
    tipoIngresso: 'arquibancada',
    ticket: { name: 'Ingresso Arquibancada', value: 60 },
    totalValue: 60
  });

  assert.deepEqual(payload.billingTypes, ['PIX', 'CREDIT_CARD']);
  assert.deepEqual(payload.chargeTypes, ['DETACHED', 'INSTALLMENT']);
  assert.deepEqual(payload.installment, { maxInstallmentCount: MAX_CREDIT_CARD_INSTALLMENTS });
});

test('payload de arquibancada com valor baixo não oferece parcelamento', () => {
  const payload = buildAsaasCheckoutPayload({
    ...baseArgs,
    tipoIngresso: 'arquibancada',
    ticket: { name: 'Ingresso Arquibancada', value: 15 },
    totalValue: 15,
    unitValue: 15
  });

  assert.deepEqual(payload.chargeTypes, ['DETACHED']);
  assert.equal(payload.installment, undefined);
});

test('resolveMaxInstallmentCount respeita valor mínimo por parcela', () => {
  assert.equal(resolveMaxInstallmentCount(180, 'arquibancada'), 3);
  assert.equal(resolveMaxInstallmentCount(60, 'arquibancada'), 3);
  assert.equal(resolveMaxInstallmentCount(45, 'arquibancada'), 2);
  assert.equal(resolveMaxInstallmentCount(15, 'arquibancada'), 0);
});

test('payload de vip permite parcelamento em até 3x no cartão', () => {
  const payload = buildAsaasCheckoutPayload({
    ...baseArgs,
    tipoIngresso: 'vip',
    ticket: { name: 'Ingresso Cadeira VIP', value: 150 },
    totalValue: 150
  });

  assert.deepEqual(payload.chargeTypes, ['DETACHED', 'INSTALLMENT']);
  assert.equal(payload.installment.maxInstallmentCount, 3);
});

test('payload de pay-per-view não inclui parcelamento', () => {
  const payload = buildAsaasCheckoutPayload({
    ...baseArgs,
    tipoIngresso: 'pay-per-view',
    ticket: { name: 'Pay-Per-View', value: 45 }
  });

  assert.deepEqual(payload.chargeTypes, ['DETACHED']);
  assert.equal(payload.installment, undefined);
});

test('payload prefere customerData e não envia customer id junto', () => {
  const customerData = {
    name: 'Cliente Teste',
    email: 'cliente@example.com',
    phone: '44999999999',
    cpfCnpj: '39053344705',
    postalCode: '87300000',
    addressNumber: '123',
    address: 'Rua Principal',
    province: 'Centro',
    state: 'PR',
    city: 4104303
  };

  const payload = buildAsaasCheckoutPayload({
    ...baseArgs,
    tipoIngresso: 'arquibancada',
    ticket: { name: 'Ingresso Arquibancada', value: 60 },
    totalValue: 60,
    customerId: 'cus_abc',
    customerData
  });

  assert.deepEqual(payload.customerData, customerData);
  assert.equal(payload.customer, undefined);
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
