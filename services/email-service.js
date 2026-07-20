import { Resend } from 'resend';
import { createQrCodeImage } from '../lib/qr-code.js';
import { renderIngressosEmailHtml } from '../templates/ingresso-email.js';

const createEmailHtml = (destinatario) => `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Teste de envio — AFC Events</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#f4f6fb;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:16px;box-shadow:0 12px 32px rgba(15,23,42,0.08);overflow:hidden;">
      <div style="padding:32px 32px 20px;">
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#111827;">Avalanche Fight Championship</h1>
        <p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Olá,</p>
        <p style="margin:0 0 14px;font-size:16px;line-height:1.6;">A integração de e-mail está funcionando corretamente.</p>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Este é um teste de envio para <strong>${destinatario}</strong>.</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">Visite <a href="https://www.afcevents.com.br" style="color:#2563eb;text-decoration:none;">https://www.afcevents.com.br</a> para conhecer mais sobre o evento.</p>
      </div>
    </div>
  </body>
</html>`;

const isValidEmail = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const normalizeIngressos = (ingressos) => {
  if (!Array.isArray(ingressos) || ingressos.length === 0) {
    throw new Error('É necessário informar ao menos um ingresso.');
  }

  return ingressos.map((ingresso) => ({
    ...ingresso,
    codigo_ingresso: ingresso.codigo_ingresso || ingresso.codigo || '',
    qr_code: ingresso.qr_code || ingresso.qrCode || '',
    categoria: ingresso.categoria || ingresso.tipo || 'Ingresso',
    lote: ingresso.lote || null
  }));
};

export const enviarEmailTeste = async (destinatario) => {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('RESEND_API_KEY não configurada.');
  }

  const resend = new Resend(apiKey);
  const response = await resend.emails.send({
    from: 'AFC Ingressos <ingressos@afcevents.com.br>',
    to: [destinatario],
    subject: 'Teste de envio — AFC Events',
    html: createEmailHtml(destinatario)
  });

  if (response.error) {
    throw new Error(response.error.message || 'Falha ao enviar e-mail via Resend.');
  }

  return response.data?.id || null;
};

export const enviarIngressosPorEmail = async (payload, options = {}) => {
  const { comprador, email, ingressos, dadosEvento } = payload || {};
  const { resendClient } = options;

  const apiKey = typeof resendClient === 'undefined' ? process.env.RESEND_API_KEY?.trim() : '';
  if (!resendClient && !apiKey) {
    throw new Error('RESEND_API_KEY não configurada.');
  }

  const destinatario = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!isValidEmail(destinatario)) {
    throw new Error('E-mail inválido.');
  }

  const ingressosNorm = normalizeIngressos(ingressos);
  const qrCodes = [];
  const attachments = [];
  for (const [index, ingresso] of ingressosNorm.entries()) {
    const qrContent = ingresso.qr_code || ingresso.qrCode || '';
    const qrBuffer = await createQrCodeImage(qrContent);
    const cid = `qr-${index}`;
    qrCodes.push(cid);
    attachments.push({
      filename: `qr-${index + 1}.png`,
      content: Buffer.from(qrBuffer),
      contentType: 'image/png',
      contentId: cid
    });
  }

  const html = renderIngressosEmailHtml({
    compradorNome: comprador?.nome || comprador?.name || '',
    eventoNome: dadosEvento?.nome || 'Avalanche Fight Championship',
    dataEvento: dadosEvento?.data || '',
    horarioEvento: dadosEvento?.horario || '',
    localEvento: dadosEvento?.local || '',
    enderecoEvento: dadosEvento?.endereco || '',
    quantidadeIngressos: ingressosNorm.length,
    ingressos: ingressosNorm,
    qrCodes,
    dominio: dadosEvento?.dominio || 'https://www.afcevents.com.br'
  });

  const resend = resendClient || new Resend(apiKey);
  const response = await resend.emails.send({
    from: 'AFC Ingressos <ingressos@afcevents.com.br>',
    to: [destinatario],
    subject: 'Seus ingressos — Avalanche Fight Championship',
    html,
    attachments
  });

  if (response.error) {
    throw new Error(response.error.message || 'Falha ao enviar e-mail via Resend.');
  }

  return response.data?.id || null;
};
