const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatTicketType = (categoria) => {
  if (!categoria) return 'Ingresso';
  if (categoria === 'vip' || categoria === 'VIP') return 'Cadeira VIP';
  if (categoria === 'arquibancada' || categoria === 'arquibancada') return 'Arquibancada';
  return String(categoria);
};

const formatDisplayCode = (value) => {
  if (!value) return '';
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) return '';
  if (normalized.startsWith('AFC-')) {
    const token = normalized.replace(/^AFC-?/, '');
    const compact = token.replace(/[^A-Z0-9]/g, '');
    if (!compact) return normalized;
    const chunks = compact.match(/.{1,4}/g) || [];
    return chunks.length > 0 ? `AFC-${chunks.join('-')}` : normalized;
  }
  return normalized;
};

export const renderIngressosEmailHtml = ({
  compradorNome,
  eventoNome,
  dataEvento,
  horarioEvento,
  localEvento,
  enderecoEvento,
  quantidadeIngressos,
  ingressos,
  qrCodes = [],
  dominio = 'https://www.afcevents.com.br'
}) => {
  const cards = (Array.isArray(ingressos) ? ingressos : []).map((ingresso, index) => {
    const tipo = formatTicketType(ingresso.categoria || ingresso.tipo);
    const lote = ingresso.lote ? escapeHtml(ingresso.lote) : '';
    const codigo = escapeHtml(formatDisplayCode(ingresso.codigo_ingresso || ingresso.codigo || ''));
    const qrSrc = qrCodes[index] ? escapeHtml(qrCodes[index]) : '';
    const loteMarkup = lote
      ? `<p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Lote: <strong style="color:#111827;">${lote}</strong></p>`
      : '';

    return `
      <tr>
        <td style="padding:0 0 16px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;border:1px solid #e5e7eb;border-radius:16px;background:#fafafa;">
            <tr>
              <td style="padding:22px 22px 10px 22px;">
                <div style="font-size:12px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#e10600;">Cartão de ingresso</div>
                <h3 style="margin:8px 0 0;font-size:22px;line-height:1.2;color:#111827;">${escapeHtml(tipo)}</h3>
                ${loteMarkup}
                <p style="margin:10px 0 0;font-size:14px;color:#6b7280;">Código: <strong style="color:#111827;">${codigo}</strong></p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 22px 22px 22px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;">
                  <tr>
                    <td valign="top" width="120" style="padding-right:16px;">
                      ${qrSrc ? `<img src="cid:${qrSrc}" alt="QR Code do ingresso" width="140" height="140" style="display:block;border:1px solid #e5e7eb;border-radius:16px;background:#fff;padding:8px;" />` : ''}
                    </td>
                    <td valign="top" style="font-size:14px;line-height:1.6;color:#4b5563;">
                      <p style="margin:0 0 8px 0;font-weight:700;color:#111827;">QR Code individual</p>
                      <p style="margin:0;">Presente este código no acesso para validar o ingresso de forma rápida e segura.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Seus ingressos — AFC Events</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;background-color:#f4f6fb;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:680px;border-collapse:separate;border-spacing:0;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:32px 32px 18px 32px;background:linear-gradient(135deg,#111111 0%,#1f1f1f 100%);">
                <div style="font-size:12px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#ff2e2e;">Avalanche Fight Championship</div>
                <h1 style="margin:8px 0 6px 0;font-size:28px;line-height:1.2;color:#ffffff;">Seus ingressos confirmados</h1>
                <p style="margin:0;font-size:15px;line-height:1.6;color:#f3f4f6;">Confirmação de compra para ${escapeHtml(compradorNome || 'comprador')}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <p style="margin:0 0 12px 0;font-size:16px;line-height:1.7;color:#374151;">Olá, ${escapeHtml(compradorNome || 'comprador')}. Seu pedido foi confirmado e os ingressos já estão prontos para uso.</p>
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
                <p style="margin:16px 0 12px 0;font-size:14px;line-height:1.7;color:#4b5563;">Quantidade de ingressos: <strong style="color:#111827;">${escapeHtml(String(quantidadeIngressos || 0))}</strong></p>
                <p style="margin:0 0 16px 0;font-size:14px;line-height:1.7;color:#4b5563;">O PDF completo com todos os ingressos foi anexado a este e-mail.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">
                  ${cards}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 32px 32px;">
                <p style="margin:0 0 10px 0;font-size:14px;line-height:1.7;color:#4b5563;">Acesse <a href="${escapeHtml(dominio)}" style="color:#e10600;text-decoration:none;">${escapeHtml(dominio)}</a> para acompanhar o evento.</p>
                <p style="margin:0;font-size:13px;line-height:1.7;color:#6b7280;">AFC Ingressos • Evento oficial • Apresente o ingresso no acesso.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};
