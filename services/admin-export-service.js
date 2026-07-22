import XLSX from 'xlsx';
import { findIngressosByPedidoIds } from '../repositories/ingressos-repository.js';
import { findPedidosByPaymentStatuses } from '../repositories/pedidos-repository.js';
import { APPROVED_PAYMENT_STATUS_VALUES } from './payment-events.js';

export const COMPRADORES_EXPORT_HEADERS = Object.freeze([
  'Data da compra',
  'Código do pedido',
  'Nome',
  'E-mail',
  'Telefone',
  'CPF',
  'Tipo de ingresso',
  'Quantidade',
  'Valor pago',
  'Status do pagamento',
  'Código do ingresso',
  'QR Code',
  'Código do checkout Asaas',
  'Código do pagamento Asaas',
  'Referência do afiliado'
]);

const EXCEL_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const pad = (value) => String(value).padStart(2, '0');

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
};

const mapIngressosByPedidoId = (ingressos) => {
  const grouped = new Map();

  for (const ingresso of ingressos || []) {
    const pedidoId = typeof ingresso?.pedido_id === 'string' ? ingresso.pedido_id : '';
    if (!pedidoId) continue;
    if (!grouped.has(pedidoId)) {
      grouped.set(pedidoId, []);
    }
    grouped.get(pedidoId).push(ingresso);
  }

  return grouped;
};

export const buildCompradoresExportRows = (pedidos, ingressos) => {
  const ingressosByPedidoId = mapIngressosByPedidoId(ingressos);

  return (pedidos || []).flatMap((pedido) => {
    const pedidoIngressos = ingressosByPedidoId.get(pedido.id) || [null];

    return pedidoIngressos.map((ingresso) => ({
      'Data da compra': formatDateTime(pedido.created_at),
      'Código do pedido': pedido.codigo_pedido || '',
      'Nome': pedido.nome || '',
      'E-mail': pedido.email || '',
      'Telefone': pedido.telefone || '',
      'CPF': pedido.cpf || '',
      'Tipo de ingresso': pedido.tipo_ingresso || '',
      'Quantidade': Number(pedido.quantidade || 0),
      'Valor pago': Number(pedido.valor_total || 0),
      'Status do pagamento': pedido.status_pagamento || '',
      'Código do ingresso': ingresso?.codigo_ingresso || '',
      'QR Code': ingresso?.qr_code || '',
      'Código do checkout Asaas': pedido.asaas_checkout_id || '',
      'Código do pagamento Asaas': pedido.asaas_payment_id || '',
      'Referência do afiliado': pedido.ref_afiliado || ''
    }));
  });
};

export const buildCompradoresWorkbook = (rows) => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    COMPRADORES_EXPORT_HEADERS,
    ...(rows || []).map((row) => COMPRADORES_EXPORT_HEADERS.map((header) => row?.[header] ?? ''))
  ]);

  worksheet['!cols'] = [
    { wch: 20 },
    { wch: 18 },
    { wch: 28 },
    { wch: 32 },
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 12 },
    { wch: 14 },
    { wch: 24 },
    { wch: 42 },
    { wch: 42 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Compradores');
  return workbook;
};

export const buildCompradoresExportFilename = (date = new Date()) => {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `compradores-afc-${safeDate.toISOString().slice(0, 10)}.xlsx`;
};

export const createCompradoresExportFile = async (
  {
    listPedidos = findPedidosByPaymentStatuses,
    listIngressos = findIngressosByPedidoIds
  } = {}
) => {
  const pedidos = await listPedidos(APPROVED_PAYMENT_STATUS_VALUES);
  const ingressos = await listIngressos(pedidos.map((pedido) => pedido.id));
  const rows = buildCompradoresExportRows(pedidos, ingressos);
  const workbook = buildCompradoresWorkbook(rows);
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return {
    buffer,
    rows,
    contentType: EXCEL_MIME_TYPE
  };
};