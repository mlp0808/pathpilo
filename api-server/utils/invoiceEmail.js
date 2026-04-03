const { STANDARD_FOOTER_PLACEHOLDER } = require('./email');

function escapeHtml(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getWebAppBaseUrl() {
  const raw =
    process.env.WEB_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.APP_BASE_URL ||
    'http://localhost:3000';
  return String(raw).replace(/\/$/, '');
}

function getPlatformWatermarkLogoUrl() {
  const raw =
    process.env.PLATFORM_EMAIL_WATERMARK_LOGO_URL ||
    process.env.PLATFORM_EMAIL_LOGO_URL ||
    process.env.PATHPILO_LOGO_URL ||
    '';
  return String(raw).trim();
}

function countryToLang(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  switch (code) {
    case 'DK':
      return 'da';
    case 'SE':
      return 'sv';
    case 'NO':
      return 'nb';
    case 'DE':
      return 'de';
    default:
      return 'en';
  }
}

const UI = {
  en: {
    greetingWord: 'Hi',
    fallbackName: 'there',
    defaultLead:
      'Your invoice is ready. Below is a summary — open your e-invoice for the full breakdown, line items, and payment options.',
    invoiceNumberLabel: 'Invoice number',
    issueDateLabel: 'Issue date',
    dueDateLabel: 'Due date',
    totalLabel: 'Total',
    invoiceDocTitle: 'Invoice',
    fromLabel: 'From',
    billToLabel: 'Bill to',
    amountDueLabel: 'Amount due',
    lineItemsHeading: 'Line items',
    descriptionLabel: 'Description',
    qtyShort: 'Qty',
    lineAmountLabel: 'Amount',
    subtotalLabel: 'Subtotal',
    vatLabel: 'VAT',
    cta: 'View full e-invoice',
    signOff: 'Best regards,',
    plainLinkLine: 'View your e-invoice:',
    moreLinesOnEinvoice: (n) => `+ ${n} more line(s) on the e-invoice`,
  },
  da: {
    greetingWord: 'Hej',
    fallbackName: 'der',
    defaultLead:
      'Din faktura er klar. Her er et resumé — åbn e-fakturaen for det fulde overblik, linjer og betalingsmuligheder.',
    invoiceNumberLabel: 'Fakturanummer',
    issueDateLabel: 'Dato',
    dueDateLabel: 'Forfaldsdato',
    totalLabel: 'I alt',
    invoiceDocTitle: 'Faktura',
    fromLabel: 'Fra',
    billToLabel: 'Faktureres til',
    amountDueLabel: 'Forfaldent beløb',
    lineItemsHeading: 'Linjer',
    descriptionLabel: 'Beskrivelse',
    qtyShort: 'Antal',
    lineAmountLabel: 'Beløb',
    subtotalLabel: 'Subtotal',
    vatLabel: 'Moms',
    cta: 'Se fuld e-faktura',
    signOff: 'Med venlig hilsen,',
    plainLinkLine: 'Se din e-faktura:',
    moreLinesOnEinvoice: (n) => `+ ${n} linje(r) mere på e-fakturaen`,
  },
  sv: {
    greetingWord: 'Hej',
    fallbackName: 'där',
    defaultLead:
      'Din faktura är klar. Här är en sammanfattning — öppna e-fakturan för fullständiga rader och betalningsalternativ.',
    invoiceNumberLabel: 'Fakturanummer',
    issueDateLabel: 'Fakturadatum',
    dueDateLabel: 'Förfallodatum',
    totalLabel: 'Totalt',
    invoiceDocTitle: 'Faktura',
    fromLabel: 'Från',
    billToLabel: 'Fakturera till',
    amountDueLabel: 'Att betala',
    lineItemsHeading: 'Rader',
    descriptionLabel: 'Beskrivning',
    qtyShort: 'Antal',
    lineAmountLabel: 'Belopp',
    subtotalLabel: 'Delsumma',
    vatLabel: 'Moms',
    cta: 'Visa full e-faktura',
    signOff: 'Med vänliga hälsningar,',
    plainLinkLine: 'Visa din e-faktura:',
    moreLinesOnEinvoice: (n) => `+ ${n} rad(er) till på e-fakturan`,
  },
  nb: {
    greetingWord: 'Hei',
    fallbackName: 'der',
    defaultLead:
      'Fakturaen din er klar. Her er et sammendrag — åpne e-fakturaen for full oversikt og betalingsalternativer.',
    invoiceNumberLabel: 'Fakturanummer',
    issueDateLabel: 'Dato',
    dueDateLabel: 'Forfallsdato',
    totalLabel: 'Totalt',
    invoiceDocTitle: 'Faktura',
    fromLabel: 'Fra',
    billToLabel: 'Faktureres til',
    amountDueLabel: 'Forfallsbeløp',
    lineItemsHeading: 'Linjer',
    descriptionLabel: 'Beskrivelse',
    qtyShort: 'Antall',
    lineAmountLabel: 'Beløp',
    subtotalLabel: 'Sum',
    vatLabel: 'MVA',
    cta: 'Se full e-faktura',
    signOff: 'Med vennlig hilsen,',
    plainLinkLine: 'Se e-fakturaen din:',
    moreLinesOnEinvoice: (n) => `+ ${n} linje(r) til på e-fakturaen`,
  },
  de: {
    greetingWord: 'Hallo',
    fallbackName: '',
    defaultLead:
      'Ihre Rechnung ist bereit. Hier eine Kurzfassung — öffnen Sie die E-Rechnung für alle Positionen und Zahlungsoptionen.',
    invoiceNumberLabel: 'Rechnungsnummer',
    issueDateLabel: 'Rechnungsdatum',
    dueDateLabel: 'Fälligkeitsdatum',
    totalLabel: 'Gesamt',
    invoiceDocTitle: 'Rechnung',
    fromLabel: 'Von',
    billToLabel: 'Rechnung an',
    amountDueLabel: 'Fälliger Betrag',
    lineItemsHeading: 'Positionen',
    descriptionLabel: 'Beschreibung',
    qtyShort: 'Menge',
    lineAmountLabel: 'Betrag',
    subtotalLabel: 'Zwischensumme',
    vatLabel: 'MwSt.',
    cta: 'E-Rechnung vollständig ansehen',
    signOff: 'Mit freundlichen Grüßen,',
    plainLinkLine: 'E-Rechnung ansehen:',
    moreLinesOnEinvoice: (n) => `+ ${n} weitere Position(en) in der E-Rechnung`,
  },
};

function getUi(countryCode) {
  const lang = countryToLang(countryCode);
  return UI[lang] || UI.en;
}

function formatMoneyAmount(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const cur = (currency && String(currency).trim()) || 'DKK';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(n);
  } catch {
    return `${n.toFixed(2)} ${cur}`;
  }
}

function formatDisplayDate(value, countryCode) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  const lang = countryToLang(countryCode);
  const localeMap = { en: 'en-GB', da: 'da-DK', sv: 'sv-SE', nb: 'nb-NO', de: 'de-DE' };
  const loc = localeMap[lang] || 'en-GB';
  try {
    return d.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function plainBodyToEmailHtml(plain) {
  const escaped = escapeHtml(plain);
  const blocks = escaped.split(/\n\n+/).filter(Boolean);
  if (blocks.length === 0) return '';
  return blocks
    .map(
      (block) =>
        `<p style="margin:0 0 14px;line-height:1.55;color:#4b5563;font-size:14px;">${block.replace(/\n/g, '<br/>')}</p>`
    )
    .join('');
}

function truncateEmailLineText(s, maxLen) {
  const t = String(s || '').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

function lineItemDescription(row) {
  const a = row.service_title && String(row.service_title).trim();
  const b = row.description && String(row.description).trim();
  return a || b || '—';
}

/**
 * Inner HTML — invoice-style card aligned with the digital invoice (dark header, From / Bill to, lines, totals).
 */
function buildInvoiceEmailInnerHtml({
  ui,
  companyName,
  clientDisplayName,
  clientFirstName,
  invoiceNumberDisplay,
  issueDateDisplay,
  dueDateDisplay,
  totalFormatted,
  subtotalFormatted,
  taxRate,
  taxAmountFormatted,
  currency,
  eInvoiceUrl,
  customMessagePlain,
  items,
}) {
  const rawFirst = clientFirstName && String(clientFirstName).trim();
  const first = escapeHtml(rawFirst || ui.fallbackName || '');
  const greetingLine = first
    ? `${escapeHtml(ui.greetingWord)} <strong>${first}</strong>,`
    : `${escapeHtml(ui.greetingWord)},`;

  const leadBlock =
    customMessagePlain && String(customMessagePlain).trim()
      ? plainBodyToEmailHtml(String(customMessagePlain).trim())
      : `<p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#4b5563;">${escapeHtml(ui.defaultLead)}</p>`;

  const invNo = escapeHtml(invoiceNumberDisplay);
  const issue = escapeHtml(issueDateDisplay);
  const due = escapeHtml(dueDateDisplay);
  const totalEsc = escapeHtml(totalFormatted);
  const subEsc = escapeHtml(subtotalFormatted);
  const taxEsc = escapeHtml(taxAmountFormatted);
  const urlEsc = escapeHtml(eInvoiceUrl);
  const coName = escapeHtml(companyName || '');
  const billTo = escapeHtml(clientDisplayName || '—');
  const taxR = Number(taxRate);
  const showVat = Number.isFinite(taxR) && taxR > 0;

  const list = Array.isArray(items) ? items : [];
  const maxRows = 12;
  const slice = list.slice(0, maxRows);
  const rest = Math.max(0, list.length - slice.length);

  let lineRowsHtml = '';
  for (let i = 0; i < slice.length; i++) {
    const row = slice[i];
    const desc = escapeHtml(truncateEmailLineText(lineItemDescription(row), 80));
    const qty = escapeHtml(String(row.quantity != null ? row.quantity : '—'));
    const lineTot = formatMoneyAmount(row.line_total, currency);
    const amt = escapeHtml(lineTot);
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
    lineRowsHtml += `<tr>
      <td style="padding:10px 12px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;background:${bg};">${desc}</td>
      <td style="padding:10px 10px;font-size:13px;color:#6b7280;text-align:right;border-bottom:1px solid #e5e7eb;background:${bg};white-space:nowrap;">${qty}</td>
      <td style="padding:10px 12px;font-size:13px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #e5e7eb;background:${bg};white-space:nowrap;">${amt}</td>
    </tr>`;
  }

  const lineItemsSection =
    slice.length > 0
      ? `<tr>
    <td style="padding:0;background:#fff;">
      <p style="margin:0;padding:14px 18px 8px 18px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">${escapeHtml(ui.lineItemsHeading)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th align="left" style="padding:8px 12px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #e5e7eb;">${escapeHtml(ui.descriptionLabel)}</th>
            <th align="right" style="padding:8px 10px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #e5e7eb;width:48px;">${escapeHtml(ui.qtyShort)}</th>
            <th align="right" style="padding:8px 12px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #e5e7eb;width:96px;">${escapeHtml(ui.lineAmountLabel)}</th>
          </tr>
        </thead>
        <tbody>${lineRowsHtml}</tbody>
      </table>
      ${rest > 0 ? `<p style="margin:0;padding:8px 18px 14px 18px;font-size:12px;color:#6b7280;font-style:italic;">${escapeHtml(ui.moreLinesOnEinvoice(rest))}</p>` : ''}
    </td>
  </tr>`
      : '';

  const totalsRows = showVat
    ? `<tr>
          <td align="right" style="padding:4px 0;font-size:13px;color:#6b7280;">${escapeHtml(ui.subtotalLabel)}</td>
          <td align="right" style="padding:4px 0 4px 16px;font-size:13px;color:#111827;font-weight:600;white-space:nowrap;">${subEsc}</td>
        </tr>
        <tr>
          <td align="right" style="padding:4px 0;font-size:13px;color:#6b7280;">${escapeHtml(ui.vatLabel)} (${taxR}%)</td>
          <td align="right" style="padding:4px 0 4px 16px;font-size:13px;color:#111827;font-weight:600;white-space:nowrap;">${taxEsc}</td>
        </tr>
        <tr>
          <td align="right" style="padding:10px 0 0 0;font-size:14px;color:#111827;font-weight:700;border-top:1px solid #e5e7eb;">${escapeHtml(ui.totalLabel)}</td>
          <td align="right" style="padding:10px 0 0 16px;font-size:15px;color:#193434;font-weight:700;border-top:1px solid #e5e7eb;white-space:nowrap;">${totalEsc}</td>
        </tr>`
    : `<tr>
          <td align="right" style="padding:4px 0;font-size:14px;color:#111827;font-weight:700;">${escapeHtml(ui.totalLabel)}</td>
          <td align="right" style="padding:4px 0 4px 16px;font-size:15px;color:#193434;font-weight:700;white-space:nowrap;">${totalEsc}</td>
        </tr>`;

  const totalsBlock = `
  <tr>
    <td style="padding:16px 20px 20px 20px;background:#fafafa;border-top:1px solid #e5e7eb;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${totalsRows}
      </table>
    </td>
  </tr>`;

  return `
<p style="margin:0 0 10px;font-size:16px;line-height:1.45;color:#111827;">${greetingLine}</p>
${leadBlock}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;border-collapse:separate;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 10px 15px -3px rgba(15,23,42,0.08),0 4px 6px -2px rgba(15,23,42,0.04);">
  <tr>
    <td style="background:#193434;padding:20px 22px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;">
            <div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:6px;">${escapeHtml(ui.invoiceDocTitle)}</div>
            <div style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;line-height:1.2;">#${invNo}</div>
          </td>
          <td align="right" style="vertical-align:top;">
            <div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">${escapeHtml(ui.amountDueLabel)}</div>
            <div style="font-size:22px;font-weight:700;color:#3DD57A;letter-spacing:-0.02em;line-height:1.2;">${totalEsc}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="background:#f8fafc;padding:18px 20px;border-bottom:1px solid #e5e7eb;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="50%" style="vertical-align:top;padding-right:14px;">
            <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">${escapeHtml(ui.fromLabel)}</div>
            <div style="font-size:15px;font-weight:700;color:#111827;line-height:1.35;">${coName}</div>
          </td>
          <td width="50%" style="vertical-align:top;padding-left:14px;">
            <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">${escapeHtml(ui.billToLabel)}</div>
            <div style="font-size:15px;font-weight:700;color:#111827;line-height:1.35;">${billTo}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="background:#ffffff;padding:16px 20px;border-bottom:1px solid #e5e7eb;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="50%" style="vertical-align:top;padding-right:12px;">
            <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${escapeHtml(ui.issueDateLabel)}</div>
            <div style="font-size:14px;font-weight:600;color:#111827;">${issue}</div>
          </td>
          <td width="50%" style="vertical-align:top;padding-left:12px;">
            <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${escapeHtml(ui.dueDateLabel)}</div>
            <div style="font-size:14px;font-weight:600;color:#111827;">${due}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ${lineItemsSection}
  ${totalsBlock}
  <tr>
    <td style="padding:22px 20px 24px 20px;background:#ffffff;" align="center">
      <a href="${urlEsc}" style="display:inline-block;padding:14px 28px;background:#193434;color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 4px 6px -1px rgba(25,52,52,0.35);">${escapeHtml(ui.cta)}</a>
      <p style="margin:14px 0 0 0;font-size:12px;line-height:1.5;color:#6b7280;max-width:400px;">${escapeHtml(ui.plainLinkLine)} <span style="color:#193434;word-break:break-all;">${urlEsc}</span></p>
    </td>
  </tr>
</table>
<p style="margin:0;font-size:14px;line-height:1.55;color:#111827;">${escapeHtml(ui.signOff)}<br/><strong>${coName}</strong></p>`;
}

/** Same outer shell as automated booking confirmation emails (buildBrandedAutomatedEmail). */
function buildBrandedInvoiceEmailHtml(innerHtml, watermarkLogoUrl) {
  const logoUrl = String(watermarkLogoUrl || '').trim();
  const watermarkRow = logoUrl
    ? `<tr>
         <td align="center" style="padding:14px 0 2px;">
           <img src="${escapeHtml(logoUrl)}" alt="" style="max-width:170px;width:38%;min-width:120px;height:auto;opacity:0.18;display:block;" />
         </td>
       </tr>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-collapse:separate;border-radius:10px;overflow:hidden;border:1px solid #e4e4e7;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.06);">
        <tr>
          <td style="padding:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,sans-serif;font-size:15px;">
            <div style="padding:22px 22px 0 22px;color:#1f2937;">
            ${innerHtml}
            ${STANDARD_FOOTER_PLACEHOLDER}
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ${watermarkRow}
</table>
</body>
</html>`;
}

function buildPlainText({
  ui,
  companyName,
  clientDisplayName,
  clientFirstName,
  invoiceNumberDisplay,
  issueDateDisplay,
  dueDateDisplay,
  totalFormatted,
  subtotalFormatted,
  taxRate,
  taxAmountFormatted,
  eInvoiceUrl,
  customMessagePlain,
  items,
  currency,
}) {
  const rawFirst = clientFirstName && String(clientFirstName).trim();
  const nameStr = rawFirst || ui.fallbackName || '';
  const greeting = nameStr ? `${ui.greetingWord} ${nameStr},` : `${ui.greetingWord},`;
  const lead =
    customMessagePlain && String(customMessagePlain).trim()
      ? String(customMessagePlain).trim()
      : ui.defaultLead;
  const taxR = Number(taxRate);
  const showVat = Number.isFinite(taxR) && taxR > 0;
  const list = Array.isArray(items) ? items : [];
  const itemLines = [];
  const maxPlain = 8;
  for (let i = 0; i < Math.min(list.length, maxPlain); i++) {
    const row = list[i];
    const desc = truncateEmailLineText(lineItemDescription(row), 70);
    const amt = formatMoneyAmount(row.line_total, currency);
    itemLines.push(`  • ${desc}  ${amt}`);
  }
  if (list.length > maxPlain) {
    itemLines.push(`  (${ui.moreLinesOnEinvoice(list.length - maxPlain)})`);
  }

  const lines = [
    greeting,
    lead,
    '',
    `${ui.invoiceDocTitle} #${invoiceNumberDisplay}`,
    `${ui.amountDueLabel}: ${totalFormatted}`,
    '',
    `${ui.fromLabel}: ${companyName || ''}`,
    `${ui.billToLabel}: ${clientDisplayName || ''}`,
    `${ui.issueDateLabel}: ${issueDateDisplay}`,
    `${ui.dueDateLabel}: ${dueDateDisplay}`,
    '',
    ...(list.length
      ? [`${ui.lineItemsHeading}:`, ...itemLines, '']
      : []),
    ...(showVat
      ? [
          `${ui.subtotalLabel}: ${subtotalFormatted}`,
          `${ui.vatLabel} (${taxR}%): ${taxAmountFormatted}`,
          `${ui.totalLabel}: ${totalFormatted}`,
        ]
      : [`${ui.totalLabel}: ${totalFormatted}`]),
    '',
    ui.plainLinkLine,
    eInvoiceUrl,
    '',
    `${ui.signOff}`,
    companyName || '',
  ];
  return lines.join('\n');
}

/**
 * @param {object} params
 * @param {object} params.invoice — row from getInvoiceWithItems (needs invoice_number, issue_date, due_date, total, currency, name)
 * @param {string} params.companyName
 * @param {string} params.countryCode — company country
 * @param {string} params.eInvoiceUrl — full URL to /i/:token
 * @param {string} [params.messagePlain] — optional user message (replaces default lead)
 * @returns {{ html: string, text: string }}
 */
function buildInvoiceCustomerEmailPayload({ invoice, companyName, countryCode, eInvoiceUrl, messagePlain }) {
  const ui = getUi(countryCode);
  const clientFirstName = invoice.name && String(invoice.name).trim();
  const clientDisplayName =
    (invoice.client_name && String(invoice.client_name).trim()) ||
    [invoice.name, invoice.last_name].filter(Boolean).join(' ').trim() ||
    '';
  const invoiceNumberDisplay = String(invoice.invoice_number != null ? invoice.invoice_number : invoice.id);
  const issueDateDisplay = formatDisplayDate(invoice.issue_date || invoice.created_at, countryCode);
  const dueDateDisplay = formatDisplayDate(invoice.due_date, countryCode);
  const cur = invoice.currency;
  const totalFormatted = formatMoneyAmount(invoice.total, cur);
  const subtotalFormatted = formatMoneyAmount(invoice.subtotal, cur);
  const taxAmountFormatted = formatMoneyAmount(invoice.tax_amount, cur);
  const taxRate = invoice.tax_rate;
  const items = invoice.items || [];

  const innerHtml = buildInvoiceEmailInnerHtml({
    ui,
    companyName,
    clientDisplayName,
    clientFirstName,
    invoiceNumberDisplay,
    issueDateDisplay,
    dueDateDisplay,
    totalFormatted,
    subtotalFormatted,
    taxRate,
    taxAmountFormatted,
    currency: cur,
    eInvoiceUrl,
    customMessagePlain: messagePlain,
    items,
  });

  const html = buildBrandedInvoiceEmailHtml(innerHtml, getPlatformWatermarkLogoUrl());
  const text = buildPlainText({
    ui,
    companyName,
    clientDisplayName,
    clientFirstName,
    invoiceNumberDisplay,
    issueDateDisplay,
    dueDateDisplay,
    totalFormatted,
    subtotalFormatted,
    taxRate,
    taxAmountFormatted,
    eInvoiceUrl,
    customMessagePlain: messagePlain,
    items,
    currency: cur,
  });

  return { html, text };
}

module.exports = {
  buildInvoiceCustomerEmailPayload,
  getWebAppBaseUrl,
};
