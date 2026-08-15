const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const renderPayPerViewConfirmacaoEmailHtml = ({
  compradorNome,
  eventoNome,
  dataEvento,
  horarioEvento,
  localEvento,
  enderecoEvento,
  quantidade,
  codigoPedido,
  dominio = 'https://www.afcevents.com.br',
  linkTransmissao
}) => {
  const safeLink = linkTransmissao ? escapeHtml(linkTransmissao) : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pay-Per-View confirmado — AFC Events</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;background-color:#f4f6fb;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:680px;border-collapse:separate;border-spacing:0;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:32px 32px 18px 32px;background:linear-gradient(135deg,#111111 0%,#1f1f1f 100%);">
                <div style="font-size:12px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#ff2e2e;">Avalanche Fight Championship</div>
                <h1 style="margin:8px 0 6px 0;font-size:28px;line-height:1.2;color:#ffffff;">Pay-Per-View confirmado</h1>
                <p style="margin:0;font-size:15px;line-height:1.6;color:#f3f4f6;">Compra confirmada para ${escapeHtml(compradorNome || 'comprador')}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <p style="margin:0 0 12px 0;font-size:16px;line-height:1.7;color:#374151;">Olá, ${escapeHtml(compradorNome || 'comprador')}. Seu acesso Pay-Per-View foi confirmado com sucesso.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;background:#fafafa;border:1px solid #e5e7eb;border-radius:16px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <div style="font-size:12px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#6b7280;">Evento</div>
                      <div style="margin-top:6px;font-size:18px;font-weight:700;color:#111827;">${escapeHtml(eventoNome || 'Avalanche Fight Championship')}</div>
                      <div style="margin-top:10px;font-size:14px;line-height:1.7;color:#4b5563;">
                        <div><strong>Data:</strong> ${escapeHtml(dataEvento || '')}</div>
                        <div><strong>Horário:</strong> ${escapeHtml(horarioEvento || '')}</div>
                        <div><strong>Local:</strong> ${escapeHtml(localEvento || '')}</div>
                        <div><strong>Endereço:</strong> ${escapeHtml(enderecoEvento || '')}</div>
                      </div>
                    </td>
                  </tr>
                </table>
                <p style="margin:16px 0 12px 0;font-size:14px;line-height:1.7;color:#4b5563;">Pedido: <strong style="color:#111827;">${escapeHtml(codigoPedido || '')}</strong></p>
                <p style="margin:0 0 12px 0;font-size:14px;line-height:1.7;color:#4b5563;">Quantidade de acessos: <strong style="color:#111827;">${escapeHtml(String(quantidade || 1))}</strong></p>
                ${safeLink ? `
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;background:#ecfdf5;border:1px solid #86efac;border-radius:16px;margin-top:16px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <div style="font-size:12px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#047857;">Acesso à transmissão</div>
                      <p style="margin:10px 0 16px;font-size:14px;line-height:1.7;color:#065f46;">Seu acesso já está liberado. Clique no botão abaixo para assistir ao vivo:</p>
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;">
                        <tr>
                          <td align="center" style="padding:0 0 12px 0;">
                            <a href="${safeLink}" style="display:inline-block;padding:16px 32px;background:#e10600;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:999px;">Assistir transmissão</a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:0;font-size:13px;line-height:1.7;color:#047857;word-break:break-all;">Link alternativo: <a href="${safeLink}" style="color:#047857;">${safeLink}</a></p>
                    </td>
                  </tr>
                </table>` : `
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;margin-top:16px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <div style="font-size:12px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#c2410c;">Próximo passo</div>
                      <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#7c2d12;">Você receberá um <strong>novo e-mail</strong> com o botão de acesso à transmissão ao vivo perto da data do evento. Guarde este e-mail para referência.</p>
                    </td>
                  </tr>
                </table>`}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 32px 32px;">
                <p style="margin:0 0 10px 0;font-size:14px;line-height:1.7;color:#4b5563;">Acesse <a href="${escapeHtml(dominio)}" style="color:#e10600;text-decoration:none;">${escapeHtml(dominio)}</a> para acompanhar o evento.</p>
                <p style="margin:0;font-size:13px;line-height:1.7;color:#6b7280;">AFC Events • Pay-Per-View • Transmissão online</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};
