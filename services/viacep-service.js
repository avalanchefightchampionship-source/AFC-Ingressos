const VIACEP_URL = 'https://viacep.com.br/ws';

export const normalizePostalCode = (value) => {
  if (typeof value !== 'string') return '';
  return value.replace(/\D/g, '').slice(0, 8);
};

export const fetchAddressByPostalCode = async (
  postalCode,
  { fetchImpl = fetch, timeoutMs = 5000 } = {}
) => {
  const cleanPostalCode = normalizePostalCode(postalCode);
  if (cleanPostalCode.length !== 8) {
    throw new Error('CEP inválido.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${VIACEP_URL}/${cleanPostalCode}/json/`, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.erro) {
      throw new Error('CEP não encontrado.');
    }

    const address = typeof data.logradouro === 'string' ? data.logradouro.trim() : '';
    const province = typeof data.bairro === 'string' ? data.bairro.trim() : '';
    const cityName = typeof data.localidade === 'string' ? data.localidade.trim() : '';
    const state = typeof data.uf === 'string' ? data.uf.trim().toUpperCase() : '';
    const cityCode = Number.parseInt(String(data.ibge || ''), 10);

    if (!cityName || !state) {
      throw new Error('CEP incompleto.');
    }

    return {
      postalCode: cleanPostalCode,
      address: address || 'Endereço informado pelo comprador',
      province: province || cityName,
      cityName,
      state,
      cityCode: Number.isInteger(cityCode) ? cityCode : null
    };
  } finally {
    clearTimeout(timeout);
  }
};
