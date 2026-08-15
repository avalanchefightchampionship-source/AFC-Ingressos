export const parseCheckoutAddressNumber = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  const parsed = Number.parseInt(digits, 10);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return 1;
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
    addressNumber: parseCheckoutAddressNumber(addressNumber),
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
  unitValue
}) => {
  const itemValue = unitValue ?? ticket.value;

  const payload = {
    billingTypes: ['PIX'],
    chargeTypes: ['DETACHED'],
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

  if (customerData) {
    payload.customerData = customerData;
  } else if (customerId) {
    payload.customer = customerId;
  }

  return payload;
};
