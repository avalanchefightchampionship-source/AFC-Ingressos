import {
  attachCheckoutToOrder,
  createPendingOrder,
  flagCheckoutFailure
} from '../services/pedidos-service.js';

const TICKETS = {
  arquibancada: { name: 'Ingresso Arquibancada', value: 50 },
  vip: { name: 'Ingresso Cadeira VIP', value: 100 }
};

const sendJson = (response, status, body) => {
  response.status(status).json(body);
};

const isValidCpf = (cpf) => {
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

const normalizeSiteUrl = (value) => {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Protocolo inválido');
  url.search = '';
  url.hash = '';
  return url.href.replace(/\/+$/, '');
};

const getSupabaseHost = () => {
  try {
    const rawUrl = process.env.SUPABASE_URL?.trim() || '';
    if (!rawUrl) return 'missing';
    return new URL(rawUrl).host;
  } catch {
    return 'invalid';
  }
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Método não permitido.' });
  }

  if (!process.env.ASAAS_API_KEY) {
    return sendJson(response, 500, { error: 'Integração de pagamento não configurada.' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return sendJson(response, 500, { error: 'Banco de dados nao configurado.' });
  }

  const { nome, telefone, email, cpfCnpj, cep, numeroEndereco, tipoIngresso, quantidade, referenciaAfiliado } = request.body || {};
  const cleanName = typeof nome === 'string' ? nome.trim().replace(/\s+/g, ' ') : '';
  const cleanPhone = typeof telefone === 'string' ? telefone.replace(/\D/g, '') : '';
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const cleanCpfCnpj = typeof cpfCnpj === 'string' ? cpfCnpj.replace(/\D/g, '') : '';
  const cleanPostalCode = typeof cep === 'string' ? cep.replace(/\D/g, '') : '';
  const cleanAddressNumber = typeof numeroEndereco === 'string' ? numeroEndereco.trim() : '';
  const cleanReference =
  typeof referenciaAfiliado === 'string' && referenciaAfiliado.trim()
    ? referenciaAfiliado.trim()
    : 'Venda direta';
  const ticket = TICKETS[tipoIngresso];

  if (cleanName.length < 3 || cleanName.length > 120) {
    return sendJson(response, 400, { error: 'Nome inválido.' });
  }
  if (cleanPhone.length < 10 || cleanPhone.length > 11) {
    return sendJson(response, 400, { error: 'Telefone inválido.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
    return sendJson(response, 400, { error: 'E-mail inválido.' });
  }
  if (!isValidCpf(cleanCpfCnpj)) {
    return sendJson(response, 400, { error: 'CPF inválido.' });
  }
  if (!/^\d{8}$/.test(cleanPostalCode)) {
    return sendJson(response, 400, { error: 'CEP inválido.' });
  }
  if (!cleanAddressNumber || cleanAddressNumber.length > 20) {
    return sendJson(response, 400, { error: 'Número do endereço inválido.' });
  }
  if (!ticket) {
    return sendJson(response, 400, { error: 'Tipo de ingresso inválido.' });
  }
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 10) {
    return sendJson(response, 400, { error: 'Quantidade inválida.' });
  }
  if (cleanReference.length > 100) {
    return sendJson(response, 400, { error: 'Referência de afiliado inválida.' });
  }

  const apiUrl = (process.env.ASAAS_API_URL || 'https://api-sandbox.asaas.com/v3').replace(/\/$/, '');
  let siteUrl;
  try {
    siteUrl = normalizeSiteUrl(process.env.SITE_URL || 'http://localhost:3000');
  } catch {
    console.error('Configuração inválida: SITE_URL não é uma URL absoluta HTTP(S).');
    return sendJson(response, 500, { error: 'Configuração de retorno do pagamento inválida.' });
  }
  const affiliateReference = cleanReference === 'Venda direta' ? null : cleanReference;
  const valorTotal = ticket.value * quantidade;
  let pedido;

  console.info('Checkout flow started.', {
    tipoIngresso,
    quantidade,
    hasAffiliateReference: Boolean(affiliateReference),
    supabaseHost: getSupabaseHost()
  });

  try {
    console.info('Creating pending order in Supabase.');
    pedido = await createPendingOrder({
      nome: cleanName,
      email: cleanEmail,
      telefone: cleanPhone,
      cpf: cleanCpfCnpj,
      tipoIngresso,
      quantidade,
      valorTotal,
      refAfiliado: affiliateReference
    });
    console.info('Pending order created in Supabase.', {
      pedidoId: pedido.id,
      codigoPedido: pedido.codigoPedido,
      externalReference: pedido.externalReference
    });
  } catch (error) {
    console.error('Falha ao criar pedido antes do checkout.', {
      code: error?.code || null,
      name: error?.name || null,
      message: error?.message || null,
      details: error?.details || null,
      hint: error?.hint || null
    });
    return sendJson(response, 503, {
      error: 'Nao foi possivel registrar o pedido. Tente novamente.'
    });
  }

  const buildReturnUrl = (checkoutStatus) => {
    const returnUrl = new URL(`${siteUrl}/`);
    if (checkoutStatus) returnUrl.searchParams.set('checkout', checkoutStatus);
    if (affiliateReference) returnUrl.searchParams.set('ref', affiliateReference);
    return returnUrl.href;
  };

  const asaasHeaders = {
    accept: 'application/json',
    'content-type': 'application/json',
    access_token: process.env.ASAAS_API_KEY
  };

  const customerPayload = {
    name: cleanName,
    email: cleanEmail,
    mobilePhone: cleanPhone,
    cpfCnpj: cleanCpfCnpj,
    postalCode: cleanPostalCode,
    addressNumber: cleanAddressNumber,
    province: 'PR'
  };

  let customerId;
  try {
    const customerSearchResponse = await fetch(
      `${apiUrl}/customers?cpfCnpj=${encodeURIComponent(cleanCpfCnpj)}&limit=1`,
      { method: 'GET', headers: { accept: 'application/json', access_token: process.env.ASAAS_API_KEY } }
    );
    const customerSearchData = await customerSearchResponse.json().catch(() => ({}));

    if (!customerSearchResponse.ok) {
      console.error('Falha ao consultar cliente no Asaas.', {
        status: customerSearchResponse.status,
        errorCodes: Array.isArray(customerSearchData.errors)
          ? customerSearchData.errors.map(({ code }) => code)
          : []
      });
      await flagCheckoutFailure(pedido.id);
      return sendJson(response, 502, { error: 'Não foi possível preparar os dados do comprador.' });
    }

    const existingCustomer = Array.isArray(customerSearchData.data)
      ? customerSearchData.data[0]
      : null;
    const customerResponse = existingCustomer?.id
      ? await fetch(`${apiUrl}/customers/${encodeURIComponent(existingCustomer.id)}`, {
          method: 'PUT',
          headers: asaasHeaders,
          body: JSON.stringify(customerPayload)
        })
      : await fetch(`${apiUrl}/customers`, {
          method: 'POST',
          headers: asaasHeaders,
          body: JSON.stringify(customerPayload)
        });
    const customerData = await customerResponse.json().catch(() => ({}));

    if (!customerResponse.ok || !customerData.id) {
      console.error('Falha ao sincronizar cliente no Asaas.', {
        operation: existingCustomer?.id ? 'update' : 'create',
        status: customerResponse.status,
        errorCodes: Array.isArray(customerData.errors)
          ? customerData.errors.map(({ code }) => code)
          : []
      });
      await flagCheckoutFailure(pedido.id);
      return sendJson(response, 502, { error: 'Não foi possível preparar os dados do comprador.' });
    }

    customerId = customerData.id;
  } catch (error) {
    console.error('Erro de comunicação ao preparar cliente no Asaas.', {
      name: error?.name || 'Error',
      message: error?.message || 'Erro desconhecido'
    });
    await flagCheckoutFailure(pedido.id);
    return sendJson(response, 502, { error: 'Não foi possível preparar os dados do comprador.' });
  }

  const checkoutPayload = {
    billingTypes: ['PIX', 'CREDIT_CARD'],
    chargeTypes: ['DETACHED'],
    minutesToExpire: 60,
    externalReference: pedido.externalReference,
    callback: {
      cancelUrl: buildReturnUrl(),
      expiredUrl: buildReturnUrl('expirado'),
      successUrl: buildReturnUrl('sucesso')
    },
    items: [{
      externalReference: tipoIngresso,
      name: ticket.name,
      description: 'Avalanche Fight Championship - 15 de agosto de 2026',
      quantity: quantidade,
      value: ticket.value
    }],
    customer: customerId
  };

  console.info('Sending checkout creation to Asaas.', {
    pedidoId: pedido.id,
    codigoPedido: pedido.codigoPedido,
    externalReference: pedido.externalReference
  });

  try {
    const asaasResponse = await fetch(`${apiUrl}/checkouts`, {
      method: 'POST',
      headers: asaasHeaders,
      body: JSON.stringify(checkoutPayload)
    });
    const data = await asaasResponse.json().catch(() => ({}));

    if (!asaasResponse.ok || !data.id || !data.link) {
      const errors = Array.isArray(data.errors)
        ? data.errors.map(({ code, description }) => ({ code, description }))
        : [];
      console.error('Falha ao criar Checkout Asaas.', {
        status: asaasResponse.status,
        errors,
        tipoIngresso,
        quantidade,
        possuiReferenciaAfiliado: cleanReference !== 'Venda direta'
      });
      await flagCheckoutFailure(pedido.id);
      return sendJson(response, asaasResponse.status || 502, {
        error: asaasResponse.status === 400
          ? 'Os dados da compra foram recusados pelo serviço de pagamento. Revise-os e tente novamente.'
          : 'O serviço de pagamento não conseguiu criar o checkout. Tente novamente.'
      });
    }

    let checkoutUrl;
    try {
      const parsedCheckoutUrl = new URL(data.link);
      const isAsaasHost = parsedCheckoutUrl.hostname === 'asaas.com'
        || parsedCheckoutUrl.hostname.endsWith('.asaas.com');
      if (parsedCheckoutUrl.protocol !== 'https:' || !isAsaasHost) throw new Error('URL não confiável');
      checkoutUrl = parsedCheckoutUrl.href;
    } catch {
      console.error('Checkout Asaas criado sem uma URL de redirecionamento válida.', {
        status: asaasResponse.status
      });
      await flagCheckoutFailure(pedido.id);
      return sendJson(response, 502, { error: 'O serviço de pagamento retornou uma URL inválida.' });
    }

    try {
      await attachCheckoutToOrder(pedido.id, {
        checkoutId: data.id,
        customerId,
        externalReference: pedido.externalReference
      });
      console.info('Order updated with checkout data in Supabase.', {
        pedidoId: pedido.id,
        codigoPedido: pedido.codigoPedido,
        checkoutId: data.id,
        externalReference: pedido.externalReference
      });
    } catch (error) {
      console.error('Checkout criado, mas o pedido não foi atualizado.', {
        code: error?.code || null,
        checkoutId: data.id
      });
      return sendJson(response, 503, {
        error: 'O pagamento foi preparado, mas o pedido não pôde ser finalizado. Tente novamente.'
      });
    }

    // O redirecionamento não confirma o pagamento; a confirmação real deverá ser feita por webhook.
    return sendJson(response, 200, { checkoutUrl });
  } catch (error) {
    console.error('Erro de comunicação com o Asaas.', {
      name: error?.name || 'Error',
      message: error?.message || 'Erro desconhecido'
    });
    await flagCheckoutFailure(pedido.id);
    return sendJson(response, 502, { error: 'Não foi possível conectar ao Asaas.' });
  }
}
