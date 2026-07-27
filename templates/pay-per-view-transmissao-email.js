const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const renderPayPerViewTransmissaoEmailHtml = ({
  compradorNome,
  eventoNome,
  dataEvento,
  horarioEvento,
  linkTransmissao,
  dominio = 'https://www.afcevents.com.br'
}) => {
  const safeLink = escapeHtml(linkTransmissao || '');

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Acesso à transmissão — AFC Events</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;background-color:#f4f6fb;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:680px;border-collapse:separate;border-spacing:0;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:32px 32px 18px 32px;background:linear-gradient(135deg,#111111 0%,#1f1f1f 100%);">
                <div style="font-size:12px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#ff2e2e;">Avalanche Fight Championship</div>
                <h1 style="margin:8px 0 6px 0;font-size:28px;line-height:1.2;color:#ffffff;">Sua transmissão está pronta</h1>
                <p style="margin:0;font-size:15px;line-height:1.6;color:#f3f4f6;">Olá, ${escapeHtml(compradorNome || 'comprador')}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <p style="margin:0 0 16px 0;font-size:16px;line-height:1.7;color:#374151;">O evento <strong>${escapeHtml(eventoNome || 'Avalanche Fight Championship')}</strong> começa em breve. Use o botão abaixo para acessar a transmissão ao vivo.</p>
                <p style="margin:0 0 20px 0;font-size:14px;line-height:1.7;color:#4b5563;"><strong>Data:</strong> ${escapeHtml(dataEvento || '')} • <strong>Horário:</strong> ${escapeHtml(horarioEvento || '')}</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;">
                  <tr>
                    <td align="center" style="padding:8px 0 24px 0;">
                      <a href="${safeLink}" style="display:inline-block;padding:16px 32px;background:#e10600;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:999px;">Assistir transmissão</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px 0;font-size:14px;line-height:1.7;color:#4b5563;">Se o botão não funcionar, copie e cole este link no navegador:</p>
                <p style="margin:0 0 16px 0;font-size:13px;line-height:1.7;color:#2563eb;word-break:break-all;"><a href="${safeLink}" style="color:#2563eb;">${safeLink}</a></p>
                <p style="margin:0;font-size:14px;line-height:1.7;color:#6b7280;">Este link é pessoal. Não compartilhe com terceiros.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 32px 32px;">
                <p style="margin:0 0 10px 0;font-size:14px;line-height:1.7;color:#4b5563;">Acesse <a href="${escapeHtml(dominio)}" style="color:#e10600;text-decoration:none;">${escapeHtml(dominio)}</a> para mais informações.</p>
                <p style="margin:0;font-size:13px;line-height:1.7;color:#6b7280;">AFC Events • Pay-Per-View</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};
