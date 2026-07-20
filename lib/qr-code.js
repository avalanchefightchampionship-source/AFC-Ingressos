import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';

const TOKEN_BYTES = 18;
const TICKET_CODE_PATTERN = /^AFC-[A-F0-9]{36}$/;
const QR_CODE_PATTERN = /^AFC:1:[A-F0-9]{36}$/;

export const createSecureTicketCode = () =>
  `AFC-${randomBytes(TOKEN_BYTES).toString('hex').toUpperCase()}`;

export const isValidTicketCode = (value) =>
  typeof value === 'string' && TICKET_CODE_PATTERN.test(value);

export const createQrCodeContent = (ticketCode) => {
  if (!isValidTicketCode(ticketCode)) throw new Error('Código de ingresso inválido.');
  return `AFC:1:${ticketCode.slice(4)}`;
};

export const isValidQrCodeContent = (value) =>
  typeof value === 'string' && QR_CODE_PATTERN.test(value);

export const createQrCodeImage = async (content) => {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Conteúdo do QR Code vazio.');
  }

  if (!isValidQrCodeContent(content)) {
    throw new Error('Conteúdo do QR Code inválido.');
  }

  return QRCode.toBuffer(content, {
    type: 'png',
    margin: 1,
    scale: 6
  });
};

export const createQrCodeDataUrl = async (content) => {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Conteúdo do QR Code vazio.');
  }

  if (!isValidQrCodeContent(content)) {
    throw new Error('Conteúdo do QR Code inválido.');
  }

  return QRCode.toDataURL(content, {
    margin: 1,
    scale: 6
  });
};
