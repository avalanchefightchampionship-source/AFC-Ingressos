export const MAX_CREDIT_CARD_INSTALLMENTS = 3;
export const MIN_INSTALLMENT_VALUE = 20;

const INSTALLMENT_TICKET_TYPES = new Set(['arquibancada', 'vip']);

export const supportsCreditCardInstallments = (tipoIngresso) =>
  INSTALLMENT_TICKET_TYPES.has(tipoIngresso);

export const resolveMaxInstallmentCount = (totalValue, tipoIngresso) => {
  if (!supportsCreditCardInstallments(tipoIngresso)) return 0;

  const total = Number(totalValue);
  if (!Number.isFinite(total) || total <= 0) return 0;

  const byMinimumValue = Math.floor(total / MIN_INSTALLMENT_VALUE);
  if (byMinimumValue <= 1) return 0;

  return Math.min(MAX_CREDIT_CARD_INSTALLMENTS, byMinimumValue);
};

export const buildAsaasCustomerPayload = ({
  name,
  email,
  mobilePhone,
  cpfCnpj,
  postalCode,
  addressNumber,
  address,
  province,
  cityName,
  state,
  cityCode
}) => {
  const payload = {
    name,
    email,
    mobilePhone,
    cpfCnpj,
    postalCode,
    addressNumber,
    notificationDisabled: true
  };

  if (address) payload.address = address;
  if (province) payload.province = province;
  if (cityName) payload.cityName = cityName;
  if (state) payload.state = state;
  if (Number.isInteger(cityCode)) payload.city = cityCode;

  return payload;
};

export const buildAsaasCheckoutCustomerData = ({
  name,
  email,
  mobilePhone,
  cpfCnpj,
  postalCode,
  addressNumber,
  address,
  province,
  state,
  cityCode
}) => {
  const payload = {
    name,
    email,
    phone: mobilePhone,
    cpfCnpj,
    postalCode,
    addressNumber,
    address: address || 'Endereço informado pelo comprador',
    province: province || 'Centro'
  };

  if (state) payload.state = state;
  if (Number.isInteger(cityCode)) payload.city = cityCode;
  return payload;
};

export const buildAsaasCheckoutPayload = ({
  tipoIngresso,
  ticket,
  quantidade,
  externalReference,
  customerId,
  customerData,
  callback,
  unitValue,
  totalValue
}) => {
  const itemValue = unitValue ?? ticket.value;
  const maxInstallmentCount = resolveMaxInstallmentCount(
    totalValue ?? itemValue * quantidade,
    tipoIngresso
  );

  const payload = {
    billingTypes: ['PIX', 'CREDIT_CARD'],
    chargeTypes: maxInstallmentCount > 1 ? ['DETACHED', 'INSTALLMENT'] : ['DETACHED'],
    minutesToExpire: 60,
    externalReference,
    callback,
    items: [{
      externalReference: tipoIngresso,
      name: ticket.name,
      description: 'Avalanche Fight Championship - 15 de agosto de 2026',
      quantity: quantidade,
      value: itemValue
    }]
  };

  // Asaas não permite customer e customerData juntos; preferimos customerData com endereço atual.
  if (customerData) {
    payload.customerData = customerData;
  } else if (customerId) {
    payload.customer = customerId;
  }

  if (maxInstallmentCount > 1) {
    payload.installment = { maxInstallmentCount };
  }

  return payload;
};
