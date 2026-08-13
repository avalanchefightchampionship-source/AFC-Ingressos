export const TICKET_PRICES = {
  arquibancada: { name: 'Ingresso Arquibancada', value: 60 },
  vip: { name: 'Ingresso Cadeira VIP', value: 150 },
  'pay-per-view': { name: 'Pay-Per-View', value: 35 }
};

export const MIN_CHECKOUT_TOTAL = 1;

export const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

export const getTicket = (tipoIngresso) => TICKET_PRICES[tipoIngresso] || null;

export const calculateSubtotal = (tipoIngresso, quantidade) => {
  const ticket = getTicket(tipoIngresso);
  if (!ticket) {
    throw new Error('Tipo de ingresso inválido.');
  }
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 10) {
    throw new Error('Quantidade inválida.');
  }
  return roundMoney(ticket.value * quantidade);
};
