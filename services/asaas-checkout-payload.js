export const MAX_CREDIT_CARD_INSTALLMENTS = 3;

const INSTALLMENT_TICKET_TYPES = new Set(['arquibancada', 'vip']);

export const supportsCreditCardInstallments = (tipoIngresso) =>
  INSTALLMENT_TICKET_TYPES.has(tipoIngresso);

export const buildAsaasCustomerPayload = ({
  name,
  email,
  mobilePhone,
  cpfCnpj,
  postalCode,
  addressNumber,
  province = 'PR'
}) => ({
  name,
  email,
  mobilePhone,
  cpfCnpj,
  postalCode,
  addressNumber,
  province,
  notificationDisabled: true
});

export const buildAsaasCheckoutPayload = ({
  tipoIngresso,
  ticket,
  quantidade,
  externalReference,
  customerId,
  callback
}) => {
  const payload = {
    billingTypes: ['PIX', 'CREDIT_CARD'],
    chargeTypes: supportsCreditCardInstallments(tipoIngresso)
      ? ['DETACHED', 'INSTALLMENT']
      : ['DETACHED'],
    minutesToExpire: 60,
    externalReference,
    callback,
    items: [{
      externalReference: tipoIngresso,
      name: ticket.name,
      description: 'Avalanche Fight Championship - 15 de agosto de 2026',
      quantity: quantidade,
      value: ticket.value
    }],
    customer: customerId
  };

  if (supportsCreditCardInstallments(tipoIngresso)) {
    payload.installment = { maxInstallmentCount: MAX_CREDIT_CARD_INSTALLMENTS };
  }

  return payload;
};
