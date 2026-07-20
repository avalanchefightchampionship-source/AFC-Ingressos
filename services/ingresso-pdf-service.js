import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createQrCodeImage } from '../lib/qr-code.js';
import { formatCodigoIngressoParaExibicao } from '../lib/codigo-ingresso.js';

const escapeText = (value) => String(value ?? '');

const renderTicketLabel = (text) => {
  if (!text) return '';
  return String(text).trim();
};

export const gerarPdfIngressos = async (ingressos, dadosEvento = {}) => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const ingresso of ingressos) {
    const page = pdfDoc.addPage([794, 1123]);
    const { width, height } = page.getSize();

    const title = 'Avalanche Fight Championship';
    page.drawText(title, {
      x: 54,
      y: height - 70,
      size: 24,
      font: fontBold,
      color: rgb(0.07, 0.07, 0.07)
    });

    page.drawText('Ingresso individual', {
      x: 54,
      y: height - 102,
      size: 11,
      font,
      color: rgb(0.56, 0.56, 0.56)
    });

    page.drawRectangle({
      x: 54,
      y: height - 140,
      width: width - 108,
      height: 120,
      borderColor: rgb(0.88, 0.14, 0.12),
      borderWidth: 2,
      color: rgb(0.98, 0.98, 0.98)
    });

    page.drawText(`Comprador: ${escapeText(dadosEvento.compradorNome || '')}`, {
      x: 72,
      y: height - 170,
      size: 14,
      font: fontBold,
      color: rgb(0.08, 0.08, 0.08)
    });

    page.drawText(`Tipo: ${escapeText(ingresso.categoria || ingresso.tipo || 'Ingresso')}`, {
      x: 72,
      y: height - 196,
      size: 12,
      font,
      color: rgb(0.3, 0.3, 0.3)
    });

    if (ingresso.lote) {
      page.drawText(`Lote: ${escapeText(ingresso.lote)}`, {
        x: 72,
        y: height - 220,
        size: 12,
        font,
        color: rgb(0.3, 0.3, 0.3)
      });
    }

    page.drawText(`Código: ${escapeText(formatCodigoIngressoParaExibicao(ingresso.codigo_ingresso || ingresso.codigo || ''))}`, {
      x: 72,
      y: height - 246,
      size: 12,
      font,
      color: rgb(0.3, 0.3, 0.3)
    });

    page.drawText(`Evento: ${escapeText(dadosEvento.eventoNome || '')}`, {
      x: 54,
      y: height - 330,
      size: 15,
      font: fontBold,
      color: rgb(0.09, 0.09, 0.09)
    });

    page.drawText(`Data: ${escapeText(dadosEvento.dataEvento || '')}`, {
      x: 54,
      y: height - 360,
      size: 12,
      font,
      color: rgb(0.3, 0.3, 0.3)
    });

    page.drawText(`Horário: ${escapeText(dadosEvento.horarioEvento || '')}`, {
      x: 54,
      y: height - 384,
      size: 12,
      font,
      color: rgb(0.3, 0.3, 0.3)
    });

    page.drawText(`Local: ${escapeText(dadosEvento.localEvento || '')}`, {
      x: 54,
      y: height - 408,
      size: 12,
      font,
      color: rgb(0.3, 0.3, 0.3)
    });

    page.drawText(`Endereço: ${escapeText(dadosEvento.enderecoEvento || '')}`, {
      x: 54,
      y: height - 432,
      size: 12,
      font,
      color: rgb(0.3, 0.3, 0.3)
    });

    const qrContent = ingresso.qr_code || ingresso.qrCode || '';
    if (qrContent) {
      const qrBuffer = await createQrCodeImage(qrContent);
      const qrImage = await pdfDoc.embedPng(qrBuffer);
      page.drawImage(qrImage, {
        x: 72,
        y: 220,
        width: 240,
        height: 240
      });
    }

    page.drawText('QR Code individual', {
      x: 72,
      y: 188,
      size: 12,
      font: fontBold,
      color: rgb(0.08, 0.08, 0.08)
    });

    page.drawText('Apresente este ingresso no acesso.', {
      x: 72,
      y: 164,
      size: 11,
      font,
      color: rgb(0.42, 0.42, 0.42)
    });

    if (renderTicketLabel(ingresso.lote)) {
      page.drawText(`Lote: ${escapeText(ingresso.lote)}`, {
        x: 340,
        y: 266,
        size: 11,
        font,
        color: rgb(0.3, 0.3, 0.3)
      });
    }

    page.drawText('Apresente este ingresso no acesso.', {
      x: 340,
      y: 240,
      size: 10,
      font,
      color: rgb(0.42, 0.42, 0.42)
    });
  }

  return pdfDoc.save();
};
