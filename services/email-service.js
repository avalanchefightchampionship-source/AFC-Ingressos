import { Resend } from 'resend';

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
