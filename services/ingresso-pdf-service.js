import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createQrCodeImage } from '../lib/qr-code.js';
import { formatCodigoIngressoParaPdf } from '../lib/codigo-ingresso.js';

const PAGE_WIDTH_MM = 90;
const PAGE_HEIGHT_MM = 200;
const PAGE_WIDTH_PT = PAGE_WIDTH_MM * 2.83465;
const PAGE_HEIGHT_PT = PAGE_HEIGHT_MM * 2.83465;
const PAGE_MARGIN_X = 18;
const PAGE_MARGIN_Y = 18;
const HEADER_HEIGHT = 55;
const QR_SIZE = 150;
const QR_X = (PAGE_WIDTH_PT - QR_SIZE) / 2;
const QR_Y = 120;

const escapeText = (value) => String(value ?? '');
const truncateText = (value, maxLength) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
};
const breakLines = (value, maxChars) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.length <= maxChars ? text : text.match(new RegExp(`.{1,${maxChars}}`, 'g'))?.join('\n') || text;
};
const formatCategory = (value) => {
  if (!value) return 'INGRESSO';
  const normalized = String(value).trim().toUpperCase();
  if (normalized === 'VIP') return 'CADEIRA VIP';
  if (normalized === 'ARQUIBANCADA') return 'ARQUIBANCADA';
  if (normalized === 'PISTA') return 'PISTA';
  return normalized;
};
const formatShortDate = (value) => {
  if (!value) return '';
  return String(value).trim();
};
const formatAddress = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= 60) return text;
  return truncateText(text, 60);
};

export const buildTicketVisualData = (ingresso, dadosEvento = {}, index = 1, total = 1) => {
  const rawCode = ingresso.codigo_ingresso || ingresso.codigo || '';
  const displayCode = formatCodigoIngressoParaPdf(rawCode);
  const category = formatCategory(ingresso.categoria || ingresso.tipo || 'Ingresso');
  const buyerName = truncateText(dadosEvento.compradorNome || '', 28);
  const eventName = truncateText(dadosEvento.eventoNome || 'Avalanche Fight Championship', 32);
  const shortDate = formatShortDate(dadosEvento.dataEvento || '');
  const shortTime = truncateText(dadosEvento.horarioEvento || '', 16);
  const venue = truncateText(dadosEvento.localEvento || '', 30);
  const address = formatAddress(dadosEvento.enderecoEvento || '');
  return {
    displayCode,
    category,
    buyerName,
    eventName,
    shortDate,
    shortTime,
    venue,
    address,
    positionLabel: `Ingresso ${index} de ${total}`,
    visualCode: displayCode || 'AFC-0000'
  };
};

export const gerarPdfIngressos = async (ingressos, dadosEvento = {}) => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  for (const [index, ingresso] of (Array.isArray(ingressos) ? ingressos : []).entries()) {
    const page = pdfDoc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
    const { width, height } = page.getSize();
    const ticket = buildTicketVisualData(ingresso, dadosEvento, index + 1, ingressos.length);

    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: rgb(0.06, 0.06, 0.06)
    });

    page.drawRectangle({
      x: 0,
      y: height - HEADER_HEIGHT - 10,
      width,
      height: HEADER_HEIGHT + 10,
      color: rgb(0.08, 0.08, 0.08)
    });

    page.drawRectangle({
      x: 0,
      y: height - 88,
      width,
      height: 18,
      color: rgb(0.82, 0.08, 0.08)
    });

    page.drawText('INGRESSO OFICIAL', {
      x: PAGE_MARGIN_X,
      y: height - 30,
      size: 10,
      font: fontBold,
      color: rgb(0.99, 0.99, 0.99)
    });

    page.drawText('AVALANCHE', {
      x: PAGE_MARGIN_X,
      y: height - 52,
      size: 15,
      font: fontBold,
      color: rgb(0.99, 0.99, 0.99)
    });

    page.drawText('FIGHT CHAMPIONSHIP', {
      x: PAGE_MARGIN_X,
      y: height - 70,
      size: 11,
      font: fontBold,
      color: rgb(0.99, 0.99, 0.99)
    });

    const categoryText = ticket.category;
    page.drawText(categoryText, {
      x: PAGE_MARGIN_X,
      y: height - 116,
      size: 16,
      font: fontBold,
      color: rgb(0.99, 0.99, 0.99)
    });

    page.drawRectangle({
      x: PAGE_MARGIN_X,
      y: height - 150,
      width: width - (PAGE_MARGIN_X * 2),
      height: 70,
      color: rgb(0.97, 0.97, 0.97)
    });

    page.drawText('COMPRADOR', {
      x: PAGE_MARGIN_X + 8,
      y: height - 130,
      size: 8,
      font: fontBold,
      color: rgb(0.4, 0.4, 0.4)
    });

    page.drawText(ticket.buyerName, {
      x: PAGE_MARGIN_X + 8,
      y: height - 146,
      size: 12,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1)
    });

    page.drawText(ticket.eventName, {
      x: PAGE_MARGIN_X,
      y: height - 186,
      size: 10,
      font: fontBold,
      color: rgb(0.99, 0.99, 0.99)
    });

    const detailsY = height - 212;
    const details = [
      { label: 'DATA', value: ticket.shortDate },
      { label: 'HORÁRIO', value: ticket.shortTime },
      { label: 'LOCAL', value: ticket.venue },
      { label: 'ENDEREÇO', value: ticket.address }
    ];

    details.forEach((detail, idx) => {
      const detailY = detailsY - (idx * 28);
      page.drawText(detail.label, {
        x: PAGE_MARGIN_X,
        y: detailY,
        size: 8,
        font: fontBold,
        color: rgb(0.93, 0.93, 0.93)
      });
      page.drawText(truncateText(detail.value, 34), {
        x: PAGE_MARGIN_X,
        y: detailY - 14,
        size: 10,
        font,
        color: rgb(0.99, 0.99, 0.99)
      });
    });

    const qrContent = ingresso.qr_code || ingresso.qrCode || '';
    if (qrContent) {
      const qrBuffer = await createQrCodeImage(qrContent);
      const qrImage = await pdfDoc.embedPng(qrBuffer);
      page.drawRectangle({
        x: QR_X - 8,
        y: QR_Y - 8,
        width: QR_SIZE + 16,
        height: QR_SIZE + 16,
        color: rgb(1, 1, 1)
      });
      page.drawImage(qrImage, {
        x: QR_X,
        y: QR_Y,
        width: QR_SIZE,
        height: QR_SIZE
      });
    }

    page.drawText('CÓDIGO DE REFERÊNCIA', {
      x: PAGE_MARGIN_X,
      y: 72,
      size: 8,
      font: fontBold,
      color: rgb(0.93, 0.93, 0.93)
    });

    page.drawText(ticket.visualCode, {
      x: PAGE_MARGIN_X,
      y: 54,
      size: 16,
      font: fontBold,
      color: rgb(0.99, 0.99, 0.99)
    });

    page.drawText('Este QR Code é individual.', {
      x: PAGE_MARGIN_X,
      y: 30,
      size: 8,
      font: fontItalic,
      color: rgb(0.85, 0.85, 0.85)
    });

    page.drawText('Permite uma única validação.', {
      x: PAGE_MARGIN_X + 110,
      y: 30,
      size: 8,
      font: fontItalic,
      color: rgb(0.85, 0.85, 0.85)
    });

    page.drawText('Apresente este ingresso na entrada.', {
      x: PAGE_MARGIN_X,
      y: 12,
      size: 8,
      font: fontItalic,
      color: rgb(0.85, 0.85, 0.85)
    });

    page.drawText(ticket.positionLabel, {
      x: width - 70,
      y: 12,
      size: 8,
      font: fontBold,
      color: rgb(0.99, 0.99, 0.99)
    });
  }

  return pdfDoc.save();
};
