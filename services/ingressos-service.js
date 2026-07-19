import {
  createQrCodeContent,
  isValidQrCodeContent,
  isValidTicketCode
} from '../lib/qr-code.js';
import { emitIngressosForPedido } from '../repositories/ingressos-repository.js';

const VALID_TICKET_STATUSES = new Set([
  'VALIDO',
  'UTILIZADO',
  'CANCELADO',
  'ESTORNADO',
  'INVALIDADO'
]);

export const emitIngressos = async (
  pedidoId,
  { emit = emitIngressosForPedido } = {}
) => {
  if (typeof pedidoId !== 'string' || !pedidoId.trim()) {
    throw new Error('Pedido inválido para emissão.');
  }

  const ingressos = await emit(pedidoId);
  if (!Array.isArray(ingressos) || ingressos.length === 0) {
    throw new Error('A emissão não retornou ingressos.');
  }

  const quantidadeEsperada = Number(ingressos[0].quantidade_esperada);
  const categoriaPedido = ingressos[0].categoria_pedido;
  const codigos = new Set();
  const qrCodes = new Set();

  if (!Number.isInteger(quantidadeEsperada) || quantidadeEsperada < 1) {
    throw new Error('Quantidade oficial inválida na emissão.');
  }
  if (ingressos.length !== quantidadeEsperada) {
    throw new Error('Quantidade emitida diferente da quantidade comprada.');
  }

  for (const ingresso of ingressos) {
    if (ingresso.pedido_id !== pedidoId) throw new Error('Ingresso associado ao pedido incorreto.');
    if (ingresso.categoria !== categoriaPedido) throw new Error('Categoria de ingresso inconsistente.');
    if (!VALID_TICKET_STATUSES.has(ingresso.status)) throw new Error('Status de ingresso inválido.');
    if (!isValidTicketCode(ingresso.codigo_ingresso)) throw new Error('Código de ingresso inválido.');
    if (!isValidQrCodeContent(ingresso.qr_code)) throw new Error('Conteúdo de QR Code inválido.');
    if (ingresso.qr_code !== createQrCodeContent(ingresso.codigo_ingresso)) {
      throw new Error('QR Code não corresponde ao código do ingresso.');
    }
    codigos.add(ingresso.codigo_ingresso);
    qrCodes.add(ingresso.qr_code);
  }

  if (codigos.size !== quantidadeEsperada || qrCodes.size !== quantidadeEsperada) {
    throw new Error('Foram encontrados códigos de ingresso duplicados.');
  }

  return {
    pedidoId,
    quantidade: quantidadeEsperada,
    categoria: categoriaPedido,
    ingressos
  };
};
