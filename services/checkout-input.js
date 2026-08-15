export const normalizeText = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

export const normalizeDigits = (value, maxLength) => {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'number' && Number.isFinite(value)
    ? String(Math.trunc(value))
    : String(value);
  const digits = raw.replace(/\D/g, '');
  return typeof maxLength === 'number' ? digits.slice(0, maxLength) : digits;
};

export const parseCheckoutQuantity = (value) => {
  if (Number.isInteger(value) && value >= 1 && value <= 10) return value;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = Math.trunc(value);
    if (parsed >= 1 && parsed <= 10) return parsed;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 10) return parsed;
  }

  return null;
};

export const normalizeAffiliateReference = (value) => {
  const text = normalizeText(value);
  if (!text) return 'Venda direta';
  return text.slice(0, 100);
};

export const isValidCpf = (cpf) => {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (length) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
};

export const parseCheckoutInput = (body = {}) => {
  const {
    nome,
    telefone,
    email,
    cpfCnpj,
    cep,
    numeroEndereco,
    tipoIngresso,
    quantidade,
    referenciaAfiliado,
    codigoCupom
  } = body;

  const cleanName = normalizeText(nome).replace(/\s+/g, ' ');
  const cleanPhone = normalizeDigits(telefone, 11);
  const cleanEmail = normalizeText(email).toLowerCase();
  const cleanCpfCnpj = normalizeDigits(cpfCnpj, 11);
  const cleanPostalCode = normalizeDigits(cep, 8);
  const cleanAddressNumber = normalizeText(numeroEndereco);
  const cleanReference = normalizeAffiliateReference(referenciaAfiliado);
  const cleanQuantity = parseCheckoutQuantity(quantidade);
  const cleanTicketType = normalizeText(tipoIngresso);
  const cleanCupom = normalizeText(codigoCupom);

  if (cleanName.length < 3 || cleanName.length > 120) {
    return { ok: false, reason: 'nome_invalido', error: 'Nome inválido.' };
  }
  if (cleanPhone.length < 10 || cleanPhone.length > 11) {
    return { ok: false, reason: 'telefone_invalido', error: 'Telefone inválido.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
    return { ok: false, reason: 'email_invalido', error: 'E-mail inválido.' };
  }
  if (!isValidCpf(cleanCpfCnpj)) {
    return { ok: false, reason: 'cpf_invalido', error: 'CPF inválido.' };
  }
  if (!/^\d{8}$/.test(cleanPostalCode)) {
    return { ok: false, reason: 'cep_invalido', error: 'CEP inválido.' };
  }
  if (!cleanAddressNumber || cleanAddressNumber.length > 20) {
    return { ok: false, reason: 'numero_endereco_invalido', error: 'Número do endereço inválido.' };
  }
  if (!cleanTicketType) {
    return { ok: false, reason: 'tipo_ingresso_invalido', error: 'Tipo de ingresso inválido.' };
  }
  if (cleanQuantity === null) {
    return { ok: false, reason: 'quantidade_invalida', error: 'Quantidade inválida.' };
  }

  return {
    ok: true,
    data: {
      cleanName,
      cleanPhone,
      cleanEmail,
      cleanCpfCnpj,
      cleanPostalCode,
      cleanAddressNumber,
      cleanReference,
      cleanQuantity,
      tipoIngresso: cleanTicketType,
      codigoCupom: cleanCupom
    }
  };
};
