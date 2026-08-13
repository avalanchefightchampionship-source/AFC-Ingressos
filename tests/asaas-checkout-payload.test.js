import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_CREDIT_CARD_INSTALLMENTS,
  buildAsaasCheckoutPayload,
  buildAsaasCustomerPayload,
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
    ticket: { name: 'Ingresso Arquibancada', value: 60 }
  });

  assert.deepEqual(payload.billingTypes, ['PIX', 'CREDIT_CARD']);
  assert.deepEqual(payload.chargeTypes, ['DETACHED', 'INSTALLMENT']);
  assert.deepEqual(payload.installment, { maxInstallmentCount: MAX_CREDIT_CARD_INSTALLMENTS });
});

test('payload de vip permite parcelamento em até 3x no cartão', () => {
  const payload = buildAsaasCheckoutPayload({
    ...baseArgs,
    tipoIngresso: 'vip',
    ticket: { name: 'Ingresso Cadeira VIP', value: 150 }
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

test('payload de cliente desabilita notificações automáticas do Asaas', () => {
  const payload = buildAsaasCustomerPayload({
    name: 'Cliente Teste',
    email: 'cliente@example.com',
    mobilePhone: '44999999999',
    cpfCnpj: '39053344705',
    postalCode: '87300000',
    addressNumber: '123'
  });

  assert.equal(payload.notificationDisabled, true);
  assert.equal(payload.province, 'PR');
  assert.equal(payload.email, 'cliente@example.com');
});
