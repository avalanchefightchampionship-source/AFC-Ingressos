import {
  attachCheckoutToOrder,
  createPendingOrder,
  flagCheckoutFailure
} from '../services/pedidos-service.js';
import {
  buildAsaasCheckoutCustomerData,
  buildAsaasCheckoutPayload
} from '../services/asaas-checkout-payload.js';
import {
  calculatePricingWithCupom,
  CUPOM_INDISPONIVEL_MESSAGE,
  resolveCheckoutItemPricing
} from '../services/cupons-service.js';
import { getTicket } from '../services/ticket-pricing.js';
import { fetchAddressByPostalCode } from '../services/viacep-service.js';
import { parseCheckoutInput, parseCheckoutQuantity } from '../services/checkout-input.js';

const sendJson = (response, status, body) => {
  response.status(status).json(body);
};

const rejectBadRequest = (response, reason, error, extra = {}) => {
  console.warn('Checkout rejeitado na validação.', { reason, ...extra });
  return sendJson(response, 400, { error });
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

const handleValidarCupom = async (body, response) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return sendJson(response, 500, { error: 'Banco de dados nao configurado.' });
  }

  const { tipoIngresso, quantidade, codigoCupom } = body || {};
  const ticket = getTicket(tipoIngresso);
  const cleanQuantity = parseCheckoutQuantity(quantidade);

  if (!ticket) {
    return rejectBadRequest(response, 'tipo_ingresso_invalido', 'Tipo de ingresso inválido.');
  }
  if (cleanQuantity === null) {
    return rejectBadRequest(response, 'quantidade_invalida', 'Quantidade inválida.');
  }
  if (typeof codigoCupom !== 'string' || !codigoCupom.trim()) {
    return rejectBadRequest(response, 'cupom_ausente', 'Informe o código do cupom.');
  }

  try {
    const pricing = await calculatePricingWithCupom({
      tipoIngresso,
      quantidade: cleanQuantity,
      codigoCupom
    });

    return sendJson(response, 200, {
      valid: true,
      cupomCodigo: pricing.cupomCodigo,
      subtotal: pricing.subtotal,
      desconto: pricing.desconto,
      total: pricing.total
    });
  } catch (error) {
    console.warn('Checkout rejeitado na validação.', {
      reason: 'cupom_invalido',
      message: error?.message || CUPOM_INDISPONIVEL_MESSAGE
    });
    return sendJson(response, 400, {
      error: error?.message || CUPOM_INDISPONIVEL_MESSAGE
    });
  }
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Método não permitido.' });
  }

  const body = request.body || {};
  if (body.acao === 'validar-cupom') {
    return handleValidarCupom(body, response);
  }

  if (!process.env.ASAAS_API_KEY) {
    return sendJson(response, 500, { error: 'Integração de pagamento não configurada.' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return sendJson(response, 500, { error: 'Banco de dados nao configurado.' });
  }

  const parsedInput = parseCheckoutInput(body);
  if (!parsedInput.ok) {
    return rejectBadRequest(response, parsedInput.reason, parsedInput.error, {
      tipoIngresso: body?.tipoIngresso || null
    });
  }

  const {
    cleanName,
    cleanPhone,
    cleanEmail,
    cleanCpfCnpj,
    cleanPostalCode,
    cleanAddressNumber,
    cleanReference,
    cleanQuantity,
    tipoIngresso,
    codigoCupom
  } = parsedInput.data;
  const ticket = getTicket(tipoIngresso);

  if (!ticket) {
    return rejectBadRequest(response, 'tipo_ingresso_desconhecido', 'Tipo de ingresso inválido.', {
      tipoIngresso
    });
  }

  const quantidade = cleanQuantity;

  const apiUrl = (process.env.ASAAS_API_URL || 'https://api-sandbox.asaas.com/v3').replace(/\/$/, '');
  if (apiUrl.includes('sandbox') && String(process.env.SITE_URL || '').includes('afcevents.com.br')) {
    console.error('ASAAS_API_URL aponta para sandbox em produção. Configure https://api.asaas.com/v3 na Vercel.');
  }
  let siteUrl;
  try {
    siteUrl = normalizeSiteUrl(process.env.SITE_URL || 'http://localhost:3000');
  } catch {
    console.error('Configuração inválida: SITE_URL não é uma URL absoluta HTTP(S).');
    return sendJson(response, 500, { error: 'Configuração de retorno do pagamento inválida.' });
  }
  const affiliateReference = cleanReference === 'Venda direta' ? null : cleanReference;
  let pricing;

  try {
    pricing = await calculatePricingWithCupom({
      tipoIngresso,
      quantidade,
      codigoCupom: typeof codigoCupom === 'string' ? codigoCupom : ''
    });
  } catch (error) {
    return sendJson(response, 400, {
      error: error?.message || CUPOM_INDISPONIVEL_MESSAGE
    });
  }

  const valorTotal = pricing.total;
  const itemPricing = resolveCheckoutItemPricing(valorTotal, quantidade);
  let pedido;
  let addressData;

  try {
    addressData = await fetchAddressByPostalCode(cleanPostalCode);
  } catch (error) {
    console.warn('Checkout rejeitado na validação.', {
      reason: error?.message === 'CEP não encontrado.' ? 'cep_nao_encontrado' : 'cep_indisponivel',
      postalCode: cleanPostalCode
    });
    return sendJson(response, 400, {
      error: error?.message === 'CEP não encontrado.'
        ? 'CEP não encontrado. Confira o CEP informado.'
        : 'Não foi possível validar o CEP informado.'
    });
  }

  console.info('Checkout flow started.', {
    tipoIngresso,
    quantidade,
    hasAffiliateReference: Boolean(affiliateReference),
    hasCupom: Boolean(pricing.cupomCodigo),
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
      valorSubtotal: pricing.subtotal,
      valorDesconto: pricing.desconto,
      cupomCodigo: pricing.cupomCodigo,
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

  if (!Number.isInteger(addressData.cityCode)) {
    console.warn('Checkout rejeitado na validação.', {
      reason: 'cep_sem_ibge',
      postalCode: cleanPostalCode
    });
    await flagCheckoutFailure(pedido.id);
    return sendJson(response, 400, {
      error: 'Não foi possível validar a cidade do CEP informado. Confira o CEP e tente novamente.'
    });
  }

  const checkoutCustomerData = buildAsaasCheckoutCustomerData({
    name: cleanName,
    email: cleanEmail,
    mobilePhone: cleanPhone,
    cpfCnpj: cleanCpfCnpj,
    postalCode: addressData.postalCode,
    addressNumber: cleanAddressNumber,
    address: addressData.address,
    province: addressData.province,
    state: addressData.state,
    cityCode: addressData.cityCode
  });

  const checkoutPayload = buildAsaasCheckoutPayload({
    tipoIngresso,
    ticket,
    quantidade: itemPricing.quantidade,
    externalReference: pedido.externalReference,
    customerData: checkoutCustomerData,
    unitValue: itemPricing.unitValue,
    callback: {
      cancelUrl: buildReturnUrl(),
      expiredUrl: buildReturnUrl('expirado'),
      successUrl: buildReturnUrl('sucesso')
    }
  });

  console.info('Sending checkout creation to Asaas.', {
    pedidoId: pedido.id,
    codigoPedido: pedido.codigoPedido,
    externalReference: pedido.externalReference,
    customerMode: 'customerData',
    hasCityCode: Number.isInteger(addressData.cityCode)
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
        customerId: null,
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
