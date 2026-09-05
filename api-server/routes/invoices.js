const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { pool } = require('../utils/database');
const { sendEmail } = require('../utils/email');
const { buildInvoiceCustomerEmailPayload, getWebAppBaseUrl } = require('../utils/invoiceEmail');
const { invoiceCustomerEmailLang } = require('../utils/companyInvoiceEmailLocale');
const {
  loadMergedSendInvoiceTemplate,
  applySendInvoicePlaceholders,
} = require('../utils/invoiceSendTemplate');
const { resolveClientInvoiceContact } = require('../utils/invoiceClientDisplay');
const { buildPublicInvoicePayload, buildPaymentOptions } = require('../utils/eInvoicePayload');
const {
  scheduleInvoiceDueReminder,
  cancelScheduledInvoiceReminder,
  getPendingInvoiceReminder,
  sendInvoiceReminderManually,
} = require('../utils/invoiceReminderAutomation');
const {
  computeNextSequenceNumber,
  resolveInvoiceNumberDisplay,
  allocateInvoiceNumberIfDraft,
} = require('../utils/invoiceNumberAllocation');
const { resolveInvoiceParties } = require('../utils/invoiceSnapshot');
const { t: tI18n, tInterp: tInterpI18n } = require('../utils/invoiceI18n');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

const getActiveCompanyId = (req) => {
  const activeCompanyId = req.user?.activeCompanyId;
  if (!activeCompanyId) {
    return { error: 'No active company found in token', status: 400 };
  }
  return { companyId: activeCompanyId };
};

const INVOICE_LIST_ALLOWED_STATUSES = new Set([
  'draft',
  'sent',
  'overdue',
  'paid',
  'overpaid',
  'cancelled',
  'credited',
]);

function isoDateOnly(value) {
  const t = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

// GET /api/invoices - List all invoices for the active company (optional filters: dateFrom, dateTo on issue_date; status comma-separated; clientId)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const { dateFrom, dateTo, status: statusParam, clientId: clientIdParam } = req.query;

    const conditions = ['i.company_id = $1'];
    const values = [companyId];

    const df = isoDateOnly(dateFrom);
    const dt = isoDateOnly(dateTo);
    if (df) {
      values.push(df);
      conditions.push(`i.issue_date >= $${values.length}::date`);
    }
    if (dt) {
      values.push(dt);
      conditions.push(`i.issue_date <= $${values.length}::date`);
    }

    if (statusParam !== undefined && statusParam !== null && String(statusParam).trim() !== '') {
      const raw = Array.isArray(statusParam) ? statusParam : String(statusParam).split(',');
      const statuses = [
        ...new Set(
          raw
            .map((s) => String(s).trim())
            .filter((s) => INVOICE_LIST_ALLOWED_STATUSES.has(s)),
        ),
      ];
      if (statuses.length > 0) {
        values.push(statuses);
        conditions.push(`i.status = ANY($${values.length}::text[])`);
      }
    }

    if (clientIdParam !== undefined && clientIdParam !== null && String(clientIdParam).trim() !== '') {
      const cid = parseInt(String(clientIdParam), 10);
      if (!Number.isNaN(cid)) {
        values.push(cid);
        conditions.push(`i.client_id = $${values.length}`);
      }
    }

    const whereClause = conditions.join(' AND ');

    let result;
    try {
      result = await pool.query(
        `
        SELECT
          i.id,
          i.invoice_number,
          i.title,
          i.client_id,
          i.issue_date,
          i.due_date,
          i.total,
          i.currency,
          i.status,
          i.created_at,
          c.name as client_name,
          c.last_name as client_last_name
        FROM invoices i
        JOIN clients c ON i.client_id = c.id
        WHERE ${whereClause}
        ORDER BY i.issue_date DESC NULLS LAST, i.created_at DESC
      `,
        values,
      );
    } catch (colErr) {
      if (colErr.code === '42703') {
        result = await pool.query(
          `
          SELECT
            i.id,
            i.invoice_number,
            '' as title,
            i.client_id,
            i.issue_date,
            i.due_date,
            i.total,
            i.currency,
            i.status,
            i.created_at,
            c.name as client_name,
            c.last_name as client_last_name
          FROM invoices i
          JOIN clients c ON i.client_id = c.id
          WHERE ${whereClause}
          ORDER BY i.issue_date DESC NULLS LAST, i.created_at DESC
        `,
          values,
        );
      } else {
        throw colErr;
      }
    }

    const nextPreview = await computeNextSequenceNumber(pool, companyAccess.companyId);
    const invoices = result.rows.map((row) => ({
      ...row,
      client_name: [row.client_name, row.client_last_name].filter(Boolean).join(' ').trim() || '—',
      invoice_number_display: resolveInvoiceNumberDisplay(row, nextPreview),
    }));

    res.json({ invoices });
  } catch (error) {
    console.error('Error fetching company invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices', details: error.message });
  }
});

// Helper: fetch full invoice with items for the active company (includes company/sender for PDF).
// Selects BOTH the live joined columns and the snapshot columns from the invoice
// row itself; `resolveInvoiceParties` then chooses snapshot-when-frozen, live
// otherwise. The returned object exposes a `parties` field (frozen-aware view)
// alongside the legacy column names so older render code keeps working.
async function getInvoiceWithItems(invoiceId, companyId) {
  const invoiceResult = await pool.query(`
    SELECT i.*,
           c.name,
           c.last_name,
           c.address,
           c.zip_code,
           c.city,
           c.email,
           c.phone,
           c.ean_number       AS client_ean,
           c.billing_address,
           c.billing_zip_code,
           c.billing_city,
           c.billing_email,
           c.billing_phone,
           co.name            AS company_name,
           co.address         AS company_address,
           co.city            AS company_city,
           co.zip_code        AS company_zip_code,
           co.country         AS company_country,
           co.country_code    AS company_country_code,
           co.cvr_number      AS company_cvr_number,
           co.vat_number      AS company_vat_number,
           co.email           AS company_email,
           co.phone           AS company_phone,
           co.website         AS company_website,
           co.logo_url        AS company_logo_url,
           u.first_name       AS created_by_first_name,
           u.last_name        AS created_by_last_name
    FROM invoices i
    JOIN clients c ON i.client_id = c.id
    JOIN companies co ON i.company_id = co.id
    LEFT JOIN users u ON i.created_by = u.id
    WHERE i.id = $1 AND i.company_id = $2
  `, [invoiceId, companyId]);
  if (invoiceResult.rows.length === 0) return null;
  const row = invoiceResult.rows[0];
  const parties = resolveInvoiceParties(row);
  const client_name = parties.billTo.name;
  const itemsResult = await pool.query(`
    SELECT ii.*,
           j.title as job_title,
           j.updated_at as job_completed_date,
           COALESCE(s.title, ii.description) as service_title
    FROM invoice_items ii
    LEFT JOIN jobs j ON ii.job_id = j.id
    LEFT JOIN services s ON ii.service_id = s.id
    WHERE ii.invoice_id = $1
    ORDER BY ii.id ASC
  `, [invoiceId]);
  const contact = resolveClientInvoiceContact(row);
  const nextPreview = await computeNextSequenceNumber(pool, companyId);
  const invoice_number_display = resolveInvoiceNumberDisplay(row, nextPreview);
  return {
    ...row,
    client_name,
    items: itemsResult.rows,
    invoice_to_address: contact.addressLine,
    invoice_to_email: contact.email,
    invoice_to_phone: contact.phone,
    invoice_number_display,
    // Frozen-aware view of the From / Bill-To / Tax block. Renderers should
    // prefer `parties.from.*` over `company_*` so historical invoices keep
    // showing what the customer was actually sent.
    parties,
    // Convenience aliases so downstream code can keep using flat column names
    // but receive the snapshotted values when present.
    company_name: parties.from.name || row.company_name,
    company_address: parties.from.address || row.company_address,
    company_city: parties.from.city || row.company_city,
    company_zip_code: parties.from.zipCode || row.company_zip_code,
    company_country: parties.from.country || row.company_country,
    company_country_code: parties.from.countryCode || row.company_country_code,
    company_cvr_number: parties.from.companyNumber || row.company_cvr_number,
    company_number_label: parties.from.companyNumberLabel,
    company_vat_number: parties.from.vatNumber || row.company_vat_number || null,
    company_email: parties.from.email || row.company_email,
    company_phone: parties.from.phone || row.company_phone,
    company_website: parties.from.website || row.company_website,
    company_logo_url: parties.from.logoUrl || row.company_logo_url,
    currency: parties.currency,
    tax_label: parties.taxLabel,
    // Locale for rendering this invoice (snapshot on issued, live-country on
    // drafts). Consumed by the PDF builder and the digital view so that the
    // wording matches the company country at issue time.
    invoice_locale: parties.locale,
  };
}

// Format date for PDF to match preview: "25 Feb 2026" (en-GB short month)
// Supports per-locale month names so Danish invoices get Danish months.
const PDF_MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  da: ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
};
function formatPdfDate(value, locale) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  const loc = locale && PDF_MONTHS[locale] ? locale : 'en';
  const months = PDF_MONTHS[loc];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function daysBetween(start, end) {
  if (!start || !end) return 0;
  const a = new Date(start);
  const b = new Date(end);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function replacePaymentTermsPlaceholders(template, invoice) {
  if (template == null || typeof template !== 'string') return '';
  const out = template
    .replace(/\uFF5B/g, '{')
    .replace(/\uFF5D/g, '}');
  const locale = invoice.invoice_locale || 'en';
  const issueDate = invoice.issue_date || invoice.created_at;
  const due_date = formatPdfDate(invoice.due_date, locale);
  const invoice_date = formatPdfDate(issueDate, locale);
  const overdue_days = daysBetween(issueDate, invoice.due_date);
  const invoice_number =
    invoice.invoice_number_display != null && String(invoice.invoice_number_display).trim() !== ''
      ? String(invoice.invoice_number_display).trim()
      : invoice.invoice_number != null
        ? String(invoice.invoice_number)
        : String(invoice.id);
  return out
    .replace(/\{due_date\}/g, due_date)
    .replace(/\{overdue_days\}/g, String(overdue_days))
    .replace(/\{invoice_date\}/g, invoice_date)
    .replace(/\{invoice_number\}/g, invoice_number);
}

// Build PDF buffer for an invoice. The layout intentionally mirrors the
// digital invoice (DigitalInvoiceView.tsx) and the invoice composer document:
// logo + date/#, company | client names aligned, description/title, line items,
// terms + totals, then how to pay.
function buildInvoicePdf(invoice, bankRow = null) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const currency = invoice.currency || 'DKK';
      // Language of the invoice — snapshot on issued invoices, derived from
      // company country on drafts. Every customer-facing label below is
      // translated through this locale.
      const locale = invoice.invoice_locale || 'en';
      const tr = (key, fallback) => tI18n(locale, key, fallback);
      const pageWidth = 595;
      const margin = 48;
      const rightEdge = pageWidth - margin;
      const contentWidth = rightEdge - margin;

      // Brand + neutral palette (matches Tailwind classes in the digital view)
      const brand = '#193434';
      const gray100 = '#f3f4f6';
      const gray400 = '#9ca3af';
      const gray500 = '#6b7280';
      const gray600 = '#4b5563';
      const gray700 = '#374151';
      const gray900 = '#111827';

      const formatMoney = (n) => {
        const v = Number(n) || 0;
        const [intPart, dec] = v.toFixed(2).split('.');
        const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return `${withSep}.${dec} ${currency}`;
      };
      const formatIban = (iban) =>
        iban ? String(iban).replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim() : '';
      const hairline = (y) => {
        doc
          .moveTo(margin, y)
          .lineTo(rightEdge, y)
          .strokeColor(gray100)
          .lineWidth(0.6)
          .stroke();
      };

      // Pre-resolve every label so empty fields can be skipped cleanly. The
      // snapshot lens (resolveInvoiceParties) has already filled these in for
      // frozen invoices; for drafts we read live values.
      const cvrLabel = invoice.company_number_label || 'Company no.';
      const taxLabel = invoice.tax_label || 'VAT';
      const invoiceNumber = String(
        invoice.invoice_number_display || invoice.invoice_number || invoice.id,
      );

      // ── Header: logo left · issue date + # right ──────────────────────────
      const headerTop = margin;
      const logoMaxW = 150;
      const logoMaxH = 44;
      let headerLeftBottom = headerTop;

      if (invoice.company_logo_url) {
        try {
          const pdfPath = require('path');
          const pdfFs = require('fs');
          const url = String(invoice.company_logo_url);
          let localLogoPath = null;
          const LOGO_DIR_PDF = pdfPath.resolve(__dirname, '..', 'uploads', 'company-logos');
          const newMatch = url.match(/\/api\/companies\/logo\/([^/?#]+)$/);
          const legacyMatch = url.match(/\/uploads\/company-logos\/([^/?#]+)$/);
          if (newMatch) localLogoPath = pdfPath.join(LOGO_DIR_PDF, pdfPath.basename(newMatch[1]));
          else if (legacyMatch) localLogoPath = pdfPath.join(LOGO_DIR_PDF, pdfPath.basename(legacyMatch[1]));
          if (localLogoPath && pdfFs.existsSync(localLogoPath)) {
            doc.image(localLogoPath, margin, headerTop, { fit: [logoMaxW, logoMaxH] });
            headerLeftBottom = headerTop + logoMaxH;
          }
        } catch (_) {
          /* no logo */
        }
      }

      doc.font('Helvetica').fillColor(gray900).fontSize(10);
      doc.text(formatPdfDate(invoice.issue_date, locale) || '', rightEdge - 200, headerTop, {
        width: 200,
        align: 'right',
      });
      doc.font('Helvetica-Bold').fillColor(brand).fontSize(20);
      doc.text(`#${invoiceNumber}`, rightEdge - 200, headerTop + 16, {
        width: 200,
        align: 'right',
      });
      const headerRightBottom = headerTop + 16 + 24;
      doc.y = Math.max(headerLeftBottom, headerRightBottom) + 28;

      // ── Parties: company | client (aligned tops, no labels) ───────────────
      const partiesTop = doc.y;
      const gutter = 40;
      const colW = (contentWidth - gutter) / 2;
      const fromX = margin;
      const billToX = margin + colW + gutter;

      const drawPartyLines = (lines, x, align) => {
        let y = partiesTop;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line || !line.text) continue;
          doc.font(line.bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(line.size || 9)
            .fillColor(line.color || gray600);
          doc.text(line.text, x, y, { width: colW, align, lineGap: 1 });
          y = doc.y + (line.after ?? 1.5);
        }
        return y;
      };

      const companyLines = [
        invoice.company_name
          ? { text: invoice.company_name, bold: true, size: 11, color: brand, after: 4 }
          : null,
        invoice.company_address ? { text: invoice.company_address } : null,
        [invoice.company_zip_code, invoice.company_city].filter(Boolean).join(' ')
          ? { text: [invoice.company_zip_code, invoice.company_city].filter(Boolean).join(' ') }
          : null,
        invoice.company_country ? { text: invoice.company_country } : null,
        invoice.company_cvr_number
          ? { text: `${cvrLabel} ${invoice.company_cvr_number}`, after: 1.5 }
          : null,
        invoice.company_vat_number ? { text: `VAT ${invoice.company_vat_number}` } : null,
        invoice.company_email ? { text: invoice.company_email } : null,
        invoice.company_phone ? { text: invoice.company_phone } : null,
      ].filter(Boolean);

      const billStreet =
        (invoice.invoice_to_address && String(invoice.invoice_to_address).trim()) ||
        invoice.address ||
        null;
      const billZipCity = [invoice.zip_code, invoice.city].filter(Boolean).join(', ');
      const billEan = invoice.bill_to_ean || invoice.client_ean;
      const billEmail = invoice.invoice_to_email || invoice.email;
      const billPhone = invoice.invoice_to_phone || invoice.phone;
      const clientLines = [
        { text: invoice.client_name || '\u2014', bold: true, size: 11, color: gray900, after: 4 },
        billStreet ? { text: billStreet } : null,
        billZipCity ? { text: billZipCity } : null,
        invoice.country ? { text: invoice.country } : null,
        billEan ? { text: `${tr('invoice.eanLabel', 'EAN/GLN')} ${billEan}` } : null,
        billEmail ? { text: billEmail } : null,
        billPhone ? { text: billPhone } : null,
      ].filter(Boolean);

      const fromBottom = drawPartyLines(companyLines, fromX, 'left');
      const billBottom = drawPartyLines(clientLines, billToX, 'right');

      doc.y = Math.max(fromBottom, billBottom) + 22;
      hairline(doc.y);
      doc.y += 22;

      // ── Description + title ───────────────────────────────────────────────
      if (invoice.description || invoice.title) {
        if (invoice.description) {
          doc.font('Helvetica').fontSize(10).fillColor(gray700);
          doc.text(String(invoice.description), margin, doc.y, {
            width: contentWidth,
            lineGap: 2.5,
          });
          doc.y += 8;
        }
        if (invoice.title) {
          doc.font('Helvetica-Bold').fontSize(13).fillColor(gray900);
          doc.text(String(invoice.title), margin, doc.y, { width: contentWidth });
          doc.y += 6;
        }
        doc.y += 10;
        hairline(doc.y);
        doc.y += 18;
      }

      // ── Line items ───────────────────────────────────────────────────────
      const amtColW = 100;
      const descW = contentWidth - amtColW - 12;

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(gray400);
      doc.text(tr('invoice.description', 'Description').toUpperCase(), margin, doc.y, {
        width: descW,
        characterSpacing: 0.8,
      });
      doc.text(tr('invoice.amount', 'Amount').toUpperCase(), margin, doc.y, {
        width: contentWidth,
        align: 'right',
        characterSpacing: 0.8,
      });
      doc.y += 14;
      hairline(doc.y);
      doc.y += 10;

      const items = invoice.items || [];
      if (items.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor(gray400);
        doc.text(tr('invoice.noLineItems', 'No line items'), margin, doc.y + 8, {
          width: contentWidth,
          align: 'center',
        });
        doc.y += 36;
      } else {
        for (const it of items) {
          const desc = it.description || it.service_title || '\u2014';
          const y = doc.y;
          const qty = Number(it.quantity ?? 1);
          doc.font('Helvetica').fontSize(10).fillColor(gray900);
          doc.text(desc, margin, y, { width: descW, lineGap: 1.5 });
          let blockH = doc.y - y;
          if (qty !== 1) {
            doc.font('Helvetica').fontSize(8).fillColor(gray400);
            doc.text(`${qty} \u00d7 ${formatMoney(it.unit_price)}`, margin, y + blockH + 2, {
              width: descW,
            });
            blockH = doc.y - y;
          }
          doc.font('Helvetica-Bold').fontSize(10).fillColor(gray900);
          doc.text(formatMoney(it.line_total), margin, y, {
            width: contentWidth,
            align: 'right',
          });
          doc.y = y + Math.max(blockH, 12) + 12;
          hairline(doc.y);
          doc.y += 10;
        }
      }

      doc.y += 14;

      // ── Terms (left) + totals (right) ─────────────────────────────────────
      const blockTop = doc.y;
      const termsW = contentWidth * 0.52;
      const totalsW = 200;
      const totalsX = rightEdge - totalsW;

      let termsBottom = blockTop;
      if (invoice.payment_terms && String(invoice.payment_terms).trim() !== '') {
        doc.font('Helvetica').fontSize(8).fillColor(gray500);
        const termsResolved = replacePaymentTermsPlaceholders(invoice.payment_terms, invoice);
        doc.text(termsResolved, margin, blockTop, { width: termsW, lineGap: 2 });
        termsBottom = doc.y;
      }
      doc.font('Helvetica').fontSize(8).fillColor(gray500);
      const dueLabel = tr('invoice.dueDate', 'Due date');
      const dueValue = formatPdfDate(invoice.due_date, locale) || '\u2014';
      doc.text(`${dueLabel} \u00b7 ${dueValue}`, margin, termsBottom + (termsBottom > blockTop ? 10 : 0), {
        width: termsW,
      });
      termsBottom = doc.y;

      doc.y = blockTop;
      const drawTotalRow = (label, value, opts = {}) => {
        const y = doc.y;
        const size = opts.size || 10;
        doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(size)
          .fillColor(opts.color || gray600);
        doc.text(label, totalsX, y, { width: totalsW - 90 });
        doc.text(value, totalsX, y, { width: totalsW, align: 'right' });
        doc.y = y + (opts.gap || 15);
      };

      drawTotalRow(tr('invoice.subtotal', 'Subtotal'), formatMoney(invoice.subtotal));
      if (Number(invoice.tax_rate) > 0) {
        drawTotalRow(
          `${taxLabel} (${Number(invoice.tax_rate).toFixed(0)}%)`,
          formatMoney(invoice.tax_amount),
        );
      }
      doc
        .moveTo(totalsX, doc.y)
        .lineTo(rightEdge, doc.y)
        .strokeColor(gray100)
        .lineWidth(0.6)
        .stroke();
      doc.y += 8;
      drawTotalRow(tr('invoice.total', 'Total'), formatMoney(invoice.total), {
        bold: true,
        color: gray900,
        size: 11,
        gap: 16,
      });

      const balanceDue =
        invoice.balance != null ? Number(invoice.balance) : Number(invoice.total) || 0;
      if (balanceDue > 0 && Math.abs(balanceDue - Number(invoice.total)) > 0.001) {
        drawTotalRow(tr('invoice.amountDue', 'Amount due'), formatMoney(balanceDue), {
          bold: true,
          color: brand,
          size: 10,
        });
      }
      const totalsBottom = doc.y;

      doc.y = Math.max(termsBottom, totalsBottom) + 24;

      // ── Payment details (label | value rows like digital) ─────────────────
      const paymentMethods = buildPaymentOptions(invoice.company_id, invoice, bankRow);
      const bankMethod = paymentMethods.find((m) => m.type === 'bank_transfer');
      if (bankMethod?.bank && balanceDue > 0) {
        const bank = bankMethod.bank;
        const isUk = String(invoice.company_country_code || '').toUpperCase() === 'GB';

        hairline(doc.y);
        doc.y += 20;

        doc.font('Helvetica-Bold').fontSize(9).fillColor(gray900);
        doc.text(bankMethod.title || tr('invoice.bankTransfer', 'Bank transfer'), margin, doc.y, {
          width: contentWidth,
        });
        doc.y += 4;
        if (bankMethod.description) {
          doc.font('Helvetica').fontSize(8).fillColor(gray500);
          doc.text(String(bankMethod.description), margin, doc.y, {
            width: contentWidth,
            lineGap: 1.5,
          });
          doc.y += 8;
        } else {
          doc.y += 6;
        }

        const labelW = 110;
        const valueX = margin + labelW + 12;
        const valueW = contentWidth - labelW - 12;
        const bankRows = [];
        if (bank.accountHolder) {
          bankRows.push({
            label: tr('invoice.accountHolder', 'Account holder'),
            value: bank.accountHolder,
          });
        }
        if (isUk) {
          if (bank.registrationNumber) {
            bankRows.push({
              label: tr('invoice.sortCode', 'Sort code'),
              value: bank.registrationNumber,
              mono: true,
            });
          }
          if (bank.accountNumber) {
            bankRows.push({
              label: tr('invoice.accountNo', 'Account no.'),
              value: bank.accountNumber,
              mono: true,
            });
          }
          if (bank.iban) {
            bankRows.push({
              label: tr('invoice.iban', 'IBAN'),
              value: formatIban(bank.iban),
              mono: true,
            });
          }
        } else {
          if (bank.iban) {
            bankRows.push({
              label: tr('invoice.iban', 'IBAN'),
              value: formatIban(bank.iban),
              mono: true,
            });
          }
          if (bank.registrationNumber) {
            bankRows.push({
              label: tr('invoice.regNo', 'Reg. no.'),
              value: bank.registrationNumber,
              mono: true,
            });
          }
          if (bank.accountNumber) {
            bankRows.push({
              label: tr('invoice.accountNo', 'Account no.'),
              value: bank.accountNumber,
              mono: true,
            });
          }
        }
        if (bank.paymentReference) {
          bankRows.push({
            label: tr('invoice.paymentReference', 'Payment reference'),
            value: bank.paymentReference,
            mono: true,
            emphasis: true,
          });
        }

        if (bankRows.length > 0) {
          hairline(doc.y);
          for (const row of bankRows) {
            const rowY = doc.y + 8;
            doc.font('Helvetica').fontSize(7).fillColor(gray400);
            doc.text(String(row.label).toUpperCase(), margin, rowY + 1, {
              width: labelW,
              characterSpacing: 0.6,
            });
            doc
              .font(row.emphasis ? 'Courier-Bold' : row.mono ? 'Courier' : 'Helvetica')
              .fontSize(row.emphasis ? 9 : 9)
              .fillColor(gray900);
            doc.text(String(row.value), valueX, rowY, { width: valueW });
            doc.y = Math.max(doc.y, rowY + 12) + 6;
            hairline(doc.y);
          }
        }

        if (bank.instructions) {
          doc.y += 10;
          doc.font('Helvetica').fontSize(8).fillColor(gray500);
          doc.text(String(bank.instructions), margin, doc.y, {
            width: contentWidth,
            lineGap: 2,
          });
        }
      }

      // ── Footer (questions / contact — mirrors digital) ────────────────────
      doc.y += 28;
      hairline(doc.y);
      doc.y += 14;
      const contacts = [invoice.company_email, invoice.company_phone, invoice.company_website].filter(
        Boolean,
      );
      const who = invoice.company_name || tr('invoice.theSender', 'the sender');
      const footerText =
        contacts.length > 0
          ? `Questions? Contact ${who} via ${contacts.join(' \u00b7 ')}.`
          : `Questions? Contact ${who}.`;
      doc.font('Helvetica').fontSize(8).fillColor(gray400);
      doc.text(footerText, margin, doc.y, { width: contentWidth, align: 'center', lineGap: 2 });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// GET /api/invoices/:invoiceId/pdf - Download invoice as PDF
router.get('/:invoiceId/pdf', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const { invoiceId } = req.params;
    const invoice = await getInvoiceWithItems(invoiceId, companyAccess.companyId);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const integ = await pool.query(
      `SELECT provider, enabled, config FROM company_integrations
       WHERE company_id = $1 AND provider = 'bank_transfer'`,
      [companyAccess.companyId],
    );
    const bankRow = integ.rows[0] || null;
    const pdfBuffer = await buildInvoicePdf(invoice, bankRow);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-${invoice.invoice_number_display || invoice.invoice_number || invoiceId}.pdf"`,
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
});

async function ensureInvoicePublicTokensTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_public_tokens (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
      token VARCHAR(128) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_invoice_public_tokens_token ON invoice_public_tokens(token);`);
}

async function getOrCreateInvoicePublicToken(invoiceId) {
  await ensureInvoicePublicTokensTable();
  const existing = await pool.query('SELECT token FROM invoice_public_tokens WHERE invoice_id = $1', [invoiceId]);
  if (existing.rows.length > 0) {
    return existing.rows[0].token;
  }
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO invoice_public_tokens (invoice_id, token) VALUES ($1, $2)', [invoiceId, token]);
  return token;
}

async function companyHasPaymentMethods(companyId) {
  try {
    const r = await pool.query(
      `SELECT 1 FROM company_integrations WHERE company_id = $1 AND provider = 'bank_transfer' AND enabled = TRUE LIMIT 1`,
      [companyId]
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

async function loadInvoiceForEInvoice(invoiceId, companyId) {
  const loaded = await getInvoiceWithItems(invoiceId, companyId);
  if (!loaded) return null;
  const total = Number(loaded.total) || 0;
  let transactions = [];
  let balance = total;
  try {
    const transactionsResult = await pool.query(
      `
      SELECT id, type, amount, description, payment_source, transaction_date, created_at
      FROM invoice_transactions
      WHERE invoice_id = $1
      ORDER BY transaction_date ASC, id ASC
      `,
      [invoiceId]
    );
    let sumCharges = 0;
    let sumPayments = 0;
    transactions = (transactionsResult.rows || []).map((t) => {
      const amount = Number(t.amount) || 0;
      if (t.type === 'charge') sumCharges += amount;
      else if (t.type === 'payment') sumPayments += amount;
      return {
        id: t.id,
        type: t.type,
        amount,
        description: t.description || '',
        payment_source: t.payment_source || null,
        transaction_date: t.transaction_date,
        created_at: t.created_at,
      };
    });
    balance = Math.round((total + sumCharges - sumPayments) * 100) / 100;
  } catch (_) {
    /* no table */
  }
  return { ...loaded, transactions, balance };
}

// POST /api/invoices/:invoiceId/online-link — create or return secure link for client-facing online invoice
router.post('/:invoiceId/online-link', authenticateToken, async (req, res) => {
  try {
    await ensureInvoicePublicTokensTable();
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;

    const inv = await pool.query(
      'SELECT id, status FROM invoices WHERE id = $1 AND company_id = $2',
      [invoiceId, companyId]
    );
    if (inv.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const invRow = inv.rows[0];
    if ((invRow.status || 'draft') === 'draft') {
      return res.status(400).json({
        error:
          'A public client link is only available after the invoice is sent. Use Preview e-invoice while the invoice is still in draft.',
      });
    }
    if (!(await companyHasPaymentMethods(companyId))) {
      return res.status(400).json({
        error: 'Add at least one payment method in Extensions before sharing the online invoice.',
      });
    }

    const existing = await pool.query(
      'SELECT token FROM invoice_public_tokens WHERE invoice_id = $1',
      [invoiceId]
    );
    let token;
    if (existing.rows.length > 0) {
      token = existing.rows[0].token;
    } else {
      token = crypto.randomBytes(32).toString('base64url');
      await pool.query(
        'INSERT INTO invoice_public_tokens (invoice_id, token) VALUES ($1, $2)',
        [invoiceId, token]
      );
    }

    const path = `/i/${token}`;
    res.json({ path });
  } catch (error) {
    console.error('Error creating online invoice link:', error);
    res.status(500).json({ error: 'Failed to create online invoice link' });
  }
});

// POST /api/invoices/:invoiceId/send - Send invoice email to client
router.post('/:invoiceId/send', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const { invoiceId } = req.params;
    const { to, cc } = req.body;
    if (!to || typeof to !== 'string' || !to.trim()) {
      return res.status(400).json({ error: 'Recipient email (to) is required' });
    }
    let invoice = await getInvoiceWithItems(invoiceId, companyAccess.companyId);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const statusBeforeSend = invoice.status || 'draft';
    if ((invoice.status || 'draft') === 'draft' && !(await companyHasPaymentMethods(companyAccess.companyId))) {
      return res.status(400).json({
        error: 'Configure at least one payment method in Extensions before sending an invoice.',
      });
    }
    if ((invoice.status || 'draft') === 'draft') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await allocateInvoiceNumberIfDraft(client, companyAccess.companyId, parseInt(invoiceId, 10));
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      invoice = await getInvoiceWithItems(invoiceId, companyAccess.companyId);
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
    }
    const token = await getOrCreateInvoicePublicToken(parseInt(invoiceId, 10));
    const eInvoiceUrl = `${getWebAppBaseUrl()}/i/${token}`;
    const coRow = await pool.query('SELECT country_code FROM companies WHERE id = $1', [companyAccess.companyId]);
    const countryCode = coRow.rows[0]?.country_code || 'DK';
    const tpl = await loadMergedSendInvoiceTemplate(pool, companyAccess.companyId);
    const invNo = String(
      invoice.invoice_number_display ||
        (invoice.invoice_number != null ? invoice.invoice_number : invoiceId),
    );
    const clientFirst = invoice.name && String(invoice.name).trim() ? String(invoice.name).trim() : '';
    const phCtx = {
      companyName: invoice.company_name || '',
      clientFirstName: clientFirst,
      invoiceNumber: invNo,
    };
    const emailSubject = applySendInvoicePlaceholders(tpl.subject, phCtx).trim();
    const messagePlain = applySendInvoicePlaceholders(tpl.message, phCtx).trim();
    const { html, text: textBody } = buildInvoiceCustomerEmailPayload({
      invoice,
      companyName: invoice.company_name || '',
      countryCode,
      eInvoiceUrl,
      messagePlain,
    });
    await sendEmail({
      to: to.trim(),
      cc: cc && String(cc).trim() ? String(cc).trim() : undefined,
      subject:
        emailSubject ||
        (invoiceCustomerEmailLang(countryCode) === 'da' ? `Faktura ${invNo}` : `Invoice ${invNo}`),
      text: textBody,
      html,
      companyId: companyAccess.companyId,
      fromName: invoice.company_name || undefined,
    });
    // Optionally mark as sent
    await pool.query(
      `UPDATE invoices SET status = 'sent', sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND company_id = $2`,
      [invoiceId, companyAccess.companyId]
    );
    if (statusBeforeSend === 'draft') {
      await scheduleInvoiceDueReminder(pool, companyAccess.companyId, parseInt(invoiceId, 10));
    }
    res.json({ success: true, message: 'Invoice sent' });
  } catch (error) {
    console.error('Error sending invoice email:', error);
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
});

// GET /api/invoices/:invoiceId/e-invoice — same payload as public digital invoice (auth; for admin preview)
router.get('/:invoiceId/e-invoice', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;

    const row = await loadInvoiceForEInvoice(invoiceId, companyId);
    if (!row) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const integ = await pool.query(
      `SELECT provider, enabled, config FROM company_integrations WHERE company_id = $1 AND provider = 'bank_transfer'`,
      [companyId]
    );
    const bankRow = integ.rows[0] || null;
    const hasPaymentMethods = await companyHasPaymentMethods(companyId);
    const publicInvoice = buildPublicInvoicePayload(row, bankRow);
    res.json({ invoice: publicInvoice, hasPaymentMethods });
  } catch (error) {
    console.error('Error building e-invoice:', error);
    res.status(500).json({ error: 'Failed to load invoice', details: error.message });
  }
});

// GET /api/invoices/:invoiceId/invoice-reminder — pending automated due reminder (badge)
router.get('/:invoiceId/invoice-reminder', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;
    const pending = await getPendingInvoiceReminder(pool, invoiceId, companyId);
    res.json({ pending, serverNow: new Date().toISOString() });
  } catch (error) {
    console.error('invoice-reminder GET:', error);
    res.status(500).json({ error: 'Failed to load reminder status' });
  }
});

// DELETE /api/invoices/:invoiceId/invoice-reminder — cancel scheduled automated reminder
router.delete('/:invoiceId/invoice-reminder', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;
    await cancelScheduledInvoiceReminder(pool, companyId, parseInt(invoiceId, 10));
    res.json({ success: true });
  } catch (error) {
    console.error('invoice-reminder DELETE:', error);
    res.status(500).json({ error: 'Failed to cancel reminder' });
  }
});

// POST /api/invoices/:invoiceId/send-reminder — manually send the due-date reminder
// email to the client right now. The scheduled automatic reminder (if any) is
// intentionally left in place so it still sends at its planned time.
router.post('/:invoiceId/send-reminder', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const { invoiceId } = req.params;
    const result = await sendInvoiceReminderManually(
      pool,
      companyAccess.companyId,
      parseInt(invoiceId, 10),
    );
    return res.json({ success: true, ...result });
  } catch (error) {
    const statusByCode = {
      NO_INVOICE: 404,
      INVALID_STATUS: 400,
      NO_CLIENT_EMAIL: 400,
      ALREADY_PAID: 400,
      RATE_LIMITED: 429,
    };
    const status = statusByCode[error?.code] || 500;
    if (status >= 500) console.error('send-reminder POST:', error);
    return res
      .status(status)
      .json({ error: error?.message || 'Failed to send reminder', code: error?.code || 'UNKNOWN' });
  }
});

// GET /api/invoices/:invoiceId - Get single invoice with items
router.get('/:invoiceId', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;

    const loaded = await getInvoiceWithItems(invoiceId, companyId);
    if (!loaded) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const row = loaded;
    const created_by_name = row.created_by_first_name && row.created_by_last_name
      ? `${row.created_by_first_name} ${row.created_by_last_name}`
      : null;

    const total = Number(row.total) || 0;
    let transactions = [];
    let balance = total;
    try {
      const transactionsResult = await pool.query(`
        SELECT id, type, amount, description, payment_source, transaction_date, created_at
        FROM invoice_transactions
        WHERE invoice_id = $1
        ORDER BY transaction_date ASC, id ASC
      `, [invoiceId]);
      let sumCharges = 0;
      let sumPayments = 0;
      transactions = (transactionsResult.rows || []).map((t) => {
        const amount = Number(t.amount) || 0;
        if (t.type === 'charge') sumCharges += amount;
        else if (t.type === 'payment') sumPayments += amount;
        return {
          id: t.id,
          type: t.type,
          amount,
          description: t.description || '',
          payment_source: t.payment_source || null,
          transaction_date: t.transaction_date,
          created_at: t.created_at,
        };
      });
      balance = Math.round((total + sumCharges - sumPayments) * 100) / 100;
    } catch (_) {
      // invoice_transactions table may not exist yet
    }

    const invoice = {
      ...row,
      created_by_name,
      items: row.items,
      transactions,
      balance,
    };

    let pendingInvoiceReminder = null;
    try {
      pendingInvoiceReminder = await getPendingInvoiceReminder(pool, invoiceId, companyId);
    } catch (_) {
      /* optional */
    }

    res.json({ invoice, pendingInvoiceReminder });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice', details: error.message });
  }
});

// POST /api/invoices/:invoiceId/transactions - Add a payment or charge (bookkeeping timeline)
router.post('/:invoiceId/transactions', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;
    const { type, amount, description, payment_source, transaction_date } = req.body;

    if (!type || !['charge', 'payment'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Use: charge or payment' });
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }
    if (type === 'charge' && (!description || String(description).trim() === '')) {
      return res.status(400).json({ error: 'Description is required for charges' });
    }

    // Structured payment-method enum. Required when logging a payment so the
    // bookkeeping export can map every line to the correct ledger account
    // (bank, MobilePay, card, cash, …). 'other' is the catch-all.
    const ALLOWED_PAYMENT_METHODS = new Set([
      'bank_transfer',
      'mobilepay',
      'card',
      'cash',
      'check',
      'other',
    ]);

    if (type === 'payment') {
      const candidate = payment_source != null ? String(payment_source).trim().toLowerCase() : '';
      if (!candidate || !ALLOWED_PAYMENT_METHODS.has(candidate)) {
        return res.status(400).json({
          error: 'Pick how this payment was received (bank_transfer, mobilepay, card, cash, check, other).',
          code: 'payment_method_required',
          allowed: Array.from(ALLOWED_PAYMENT_METHODS),
        });
      }
    }

    const invResult = await pool.query(
      'SELECT id, total, status FROM invoices WHERE id = $1 AND company_id = $2',
      [invoiceId, companyId]
    );
    if (invResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const transactionDate = transaction_date && String(transaction_date).trim()
      ? new Date(transaction_date.trim())
      : new Date();
    const desc = type === 'charge' ? String(description || '').trim() : (description ? String(description).trim() : 'Payment');
    const source = type === 'payment'
      ? String(payment_source).trim().toLowerCase()
      : null;

    const insertResult = await pool.query(`
      INSERT INTO invoice_transactions (invoice_id, type, amount, description, payment_source, transaction_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [invoiceId, type, numAmount, desc || 'Payment', source, transactionDate]);

    const newRow = insertResult.rows[0];

    const sumResult = await pool.query(`
      SELECT type, SUM(amount::numeric) as total
      FROM invoice_transactions
      WHERE invoice_id = $1
      GROUP BY type
    `, [invoiceId]);

    const invoiceTotal = Number(invResult.rows[0].total) || 0;
    let charges = 0;
    let payments = 0;
    (sumResult.rows || []).forEach((r) => {
      const val = Number(r.total) || 0;
      if (r.type === 'charge') charges += val;
      else if (r.type === 'payment') payments += val;
    });
    const balance = Math.round((invoiceTotal + charges - payments) * 100) / 100;

    let newStatus = invResult.rows[0].status;
    if (type === 'payment') {
      if (balance <= 0) {
        newStatus = balance < 0 ? 'overpaid' : 'paid';
        await pool.query(
          `UPDATE invoices SET status = $1, paid_at = COALESCE(paid_at, $2), updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND company_id = $4`,
          [newStatus, transactionDate, invoiceId, companyId]
        );
        await cancelScheduledInvoiceReminder(pool, companyId, parseInt(invoiceId, 10));
      }
    } else if (type === 'charge' && balance > 0) {
      newStatus = 'overdue';
      await pool.query(
        `UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3`,
        [newStatus, invoiceId, companyId]
      );
    }

    const transaction = {
      id: newRow.id,
      type: newRow.type,
      amount: numAmount,
      description: newRow.description || '',
      payment_source: newRow.payment_source || null,
      transaction_date: newRow.transaction_date,
      created_at: newRow.created_at,
    };

    res.status(201).json({
      transaction,
      balance,
      status: newStatus,
    });
  } catch (error) {
    console.error('Error adding invoice transaction:', error);
    res.status(500).json({ error: 'Failed to add transaction', details: error.message });
  }
});

// PUT /api/invoices/:invoiceId - Update draft invoice (metadata only; only when status is draft)
router.put('/:invoiceId', authenticateToken, async (req, res) => {
  let dbClient;
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;
    const {
      title,
      issue_date,
      due_date,
      tax_rate,
      currency,
      payment_terms,
      notes,
      description,
      show_completed_date,
      reference_text,
      // When provided, we rebuild the invoice's line items from these jobs
      // (just like the create flow does). This is what makes "Edit" feel
      // like reopening the creation page.
      job_ids,
      discounts,
      enabled_payment_methods,
    } = req.body;

    dbClient = await pool.connect();
    await dbClient.query('BEGIN');

    const check = await dbClient.query(
      'SELECT id, status, subtotal, client_id, tax_rate FROM invoices WHERE id = $1 AND company_id = $2 FOR UPDATE',
      [invoiceId, companyId]
    );
    if (check.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const inv = check.rows[0];
    if (inv.status !== 'draft') {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'Only draft invoices can be edited' });
    }

    // ── Optional rebuild of line items + jobs link ────────────────────────
    // If job_ids is sent, we drop the existing invoice_items, release the
    // currently-attached jobs back to "uninvoiced", then re-attach the new
    // job set and recompute totals — same logic as the create flow.
    let rebuiltSubtotal = null;
    let rebuiltTaxAmount = null;
    let rebuiltTotal = null;
    if (Array.isArray(job_ids)) {
      if (job_ids.length === 0) {
        await dbClient.query('ROLLBACK');
        return res.status(400).json({ error: 'At least one job must be selected' });
      }

      const clientId = inv.client_id;
      // Verify every requested job belongs to this client AND is either
      // unassigned or already attached to this exact invoice (re-pickable).
      const jobCheck = await dbClient.query(
        `
        SELECT j.id, j.status
        FROM jobs j
        WHERE j.id = ANY($1::int[])
          AND j.client_id = $2
          AND (j.status = 'completed' OR j.status = 'sub_completed')
          AND (j.invoice_id IS NULL OR j.invoice_id = $3)
        `,
        [job_ids, clientId, invoiceId]
      );
      if (jobCheck.rows.length !== job_ids.length) {
        await dbClient.query('ROLLBACK');
        return res.status(400).json({
          error:
            'Some jobs are not invoiceable (must be completed/sub-completed and not already on a different invoice)',
        });
      }

      // Detach any jobs that were on this invoice but are no longer in the
      // new set, so they go back to "available" for invoicing elsewhere.
      await dbClient.query(
        `UPDATE jobs SET invoice_id = NULL WHERE invoice_id = $1 AND id <> ALL($2::int[])`,
        [invoiceId, job_ids]
      );

      await dbClient.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [invoiceId]);

      const effectiveTaxRate =
        tax_rate !== undefined ? Number(tax_rate) || 0 : Number(inv.tax_rate) || 0;
      const safeDiscounts =
        discounts && typeof discounts === 'object' && !Array.isArray(discounts)
          ? discounts
          : {};

      let subtotal = 0;
      const itemsToInsert = [];
      for (const job of jobCheck.rows) {
        const jobServices = await dbClient.query(
          `
          SELECT
            js.*,
            COALESCE(NULLIF(TRIM(js.custom_title), ''), s.title, 'Service') AS service_title,
            s.price
          FROM job_services js
          LEFT JOIN services s ON js.service_id = s.id
          WHERE js.job_id = $1 AND js.status = 'completed'
          `,
          [job.id]
        );
        if (jobServices.rows.length === 0) continue;

        let jobTotal = 0;
        for (const service of jobServices.rows) {
          const unitPrice = parseFloat(service.custom_price ?? service.price ?? 0) || 0;
          jobTotal += unitPrice;
        }
        const jobDiscount = Number(safeDiscounts[job.id]) || 0;

        for (const service of jobServices.rows) {
          const unitPrice = parseFloat(service.custom_price ?? service.price ?? 0) || 0;
          const proportion = jobTotal > 0 ? unitPrice / jobTotal : 0;
          const serviceDiscount = jobDiscount * proportion;
          const finalUnitPrice = unitPrice - serviceDiscount;
          const lineTotal = Math.max(0, finalUnitPrice);
          subtotal += lineTotal;

          itemsToInsert.push({
            job_id: job.id,
            service_id: service.service_id ?? null,
            description: service.service_title || 'Service',
            quantity: 1,
            unit_price: finalUnitPrice,
            line_total: lineTotal,
          });
        }
      }

      if (itemsToInsert.length === 0) {
        await dbClient.query('ROLLBACK');
        return res.status(400).json({
          error: 'No completed services found for the selected jobs.',
        });
      }

      for (const item of itemsToInsert) {
        await dbClient.query(
          `
          INSERT INTO invoice_items (
            invoice_id, job_id, service_id, description, quantity, unit_price, line_total
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [invoiceId, item.job_id, item.service_id, item.description, item.quantity, item.unit_price, item.line_total]
        );
      }

      // Re-attach jobs in the new set (idempotent: already-attached stay so).
      await dbClient.query(
        `UPDATE jobs SET invoice_id = $1 WHERE id = ANY($2::int[])`,
        [invoiceId, job_ids]
      );

      const taxAmount = subtotal * (effectiveTaxRate / 100);
      rebuiltSubtotal = subtotal;
      rebuiltTaxAmount = taxAmount;
      rebuiltTotal = subtotal + taxAmount;
    }

    // ── Validate payment methods snapshot, if provided ────────────────────
    let normalizedPaymentMethods = null;
    if (Array.isArray(enabled_payment_methods)) {
      const enabledProvidersRow = await dbClient.query(
        `
        SELECT ci.provider
        FROM company_integrations ci
        JOIN integration_registry r ON r.provider = ci.provider
        WHERE ci.company_id = $1 AND ci.enabled = TRUE AND r.capabilities ? 'invoice_payment'
        `,
        [companyId]
      ).catch(() => ({ rows: [] }));
      const allowed = new Set(enabledProvidersRow.rows.map((r) => r.provider));
      normalizedPaymentMethods = enabled_payment_methods
        .map((p) => String(p || '').trim())
        .filter((p) => p && allowed.has(p));
      if (normalizedPaymentMethods.length === 0) {
        await dbClient.query('ROLLBACK');
        return res.status(400).json({
          error: 'Pick at least one payment option for this invoice.',
          code: 'no_payment_methods',
        });
      }
    }

    // ── Build the column update list ──────────────────────────────────────
    const updates = [];
    const values = [];
    let idx = 1;
    if (title !== undefined) {
      updates.push(`title = $${idx++}`);
      values.push(String(title).slice(0, 30) || 'Invoice');
    }
    if (issue_date !== undefined) {
      updates.push(`issue_date = $${idx++}`);
      values.push(issue_date);
    }
    if (due_date !== undefined) {
      updates.push(`due_date = $${idx++}`);
      values.push(due_date);
    }
    if (tax_rate !== undefined) {
      updates.push(`tax_rate = $${idx++}`);
      values.push(Number(tax_rate) || 0);
    }
    if (currency !== undefined) {
      updates.push(`currency = $${idx++}`);
      values.push(String(currency).slice(0, 10) || 'DKK');
    }
    if (payment_terms !== undefined) {
      updates.push(`payment_terms = $${idx++}`);
      values.push(payment_terms == null ? null : String(payment_terms));
    }
    if (notes !== undefined) {
      updates.push(`notes = $${idx++}`);
      values.push(notes == null ? null : String(notes));
    }
    if (description !== undefined) {
      updates.push(`description = $${idx++}`);
      values.push(description == null ? '' : String(description));
    }
    if (show_completed_date !== undefined) {
      updates.push(`show_completed_date = $${idx++}`);
      values.push(Boolean(show_completed_date));
    }
    if (reference_text !== undefined) {
      updates.push(`reference_text = $${idx++}`);
      const trimmed = reference_text == null ? '' : String(reference_text).trim();
      values.push(trimmed || null);
    }
    if (normalizedPaymentMethods != null) {
      updates.push(`enabled_payment_methods = $${idx++}::jsonb`);
      values.push(JSON.stringify(normalizedPaymentMethods));
    }

    if (rebuiltSubtotal != null) {
      updates.push(`subtotal = $${idx++}`);
      values.push(rebuiltSubtotal);
      updates.push(`tax_amount = $${idx++}`);
      values.push(rebuiltTaxAmount);
      updates.push(`total = $${idx++}`);
      values.push(rebuiltTotal);
    } else if (tax_rate !== undefined) {
      const subtotal = Number(inv.subtotal) || 0;
      const rate = Number(tax_rate) || 0;
      const tax_amount = subtotal * (rate / 100);
      const total = subtotal + tax_amount;
      updates.push(`tax_amount = $${idx++}`);
      values.push(tax_amount);
      updates.push(`total = $${idx++}`);
      values.push(total);
    }

    if (updates.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    values.push(invoiceId, companyId);
    const result = await dbClient.query(
      `UPDATE invoices SET ${updates.join(', ')} WHERE id = $${idx} AND company_id = $${idx + 1} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    await dbClient.query('COMMIT');
    res.json({ invoice: result.rows[0] });
  } catch (error) {
    if (dbClient) await dbClient.query('ROLLBACK').catch(() => {});
    console.error('Error updating invoice:', error);
    res.status(500).json({ error: 'Failed to update invoice', details: error.message });
  } finally {
    if (dbClient) dbClient.release();
  }
});

const ALLOWED_STATUSES = ['draft', 'sent', 'paid', 'credited', 'overdue', 'cancelled', 'overpaid'];

// PUT /api/invoices/:invoiceId/status - Update invoice status
router.put('/:invoiceId/status', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;
    const { status, sent_at: sentAt, paid_at: paidAt, paid_amount: paidAmount, payment_source: paymentSource } = req.body;

    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Use: draft, sent, paid, credited, overdue, cancelled' });
    }

    const existingResult = await pool.query(
      'SELECT status FROM invoices WHERE id = $1 AND company_id = $2',
      [invoiceId, companyId]
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const previousStatus = existingResult.rows[0].status || 'draft';
    if (previousStatus === 'draft' && status !== 'draft' && !(await companyHasPaymentMethods(companyId))) {
      return res.status(400).json({
        error: 'Configure at least one payment method in Extensions before moving this invoice out of draft.',
      });
    }

    if (status === 'sent' && previousStatus === 'draft') {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await allocateInvoiceNumberIfDraft(c, companyId, parseInt(invoiceId, 10));
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    }

    const updateFields = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [status];

    if (status === 'sent') {
      if (sentAt && typeof sentAt === 'string' && sentAt.trim()) {
        const d = new Date(sentAt.trim());
        if (!isNaN(d.getTime())) {
          updateFields.push('sent_at = $' + (values.length + 1));
          values.push(d.toISOString());
        } else {
          updateFields.push('sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP)');
        }
      } else {
        updateFields.push('sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP)');
      }
    } else if (status === 'paid') {
      if (paidAt && typeof paidAt === 'string' && paidAt.trim()) {
        const d = new Date(paidAt.trim());
        if (!isNaN(d.getTime())) {
          updateFields.push('paid_at = $' + (values.length + 1));
          values.push(d.toISOString());
        } else {
          updateFields.push('paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)');
        }
      } else {
        updateFields.push('paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)');
      }
      if (paidAmount !== undefined && paidAmount !== null && paidAmount !== '') {
        const amount = parseFloat(paidAmount);
        if (!isNaN(amount)) {
          updateFields.push('paid_amount = $' + (values.length + 1));
          values.push(amount);
        }
      }
      if (paymentSource !== undefined && paymentSource !== null && String(paymentSource).trim() !== '') {
        updateFields.push('payment_source = $' + (values.length + 1));
        values.push(String(paymentSource).trim());
      }
    }

    const paramCount = values.length + 2;
    const result = await pool.query(`
      UPDATE invoices
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount - 1} AND company_id = $${paramCount}
      RETURNING *
    `, [...values, invoiceId, companyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (previousStatus === 'draft' && status === 'sent') {
      try {
        await scheduleInvoiceDueReminder(pool, companyId, parseInt(invoiceId, 10));
      } catch (_) {
        /* optional */
      }
    }

    res.json({ invoice: result.rows[0] });
  } catch (error) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({ error: 'Failed to update invoice status', details: error.message });
  }
});

// Export the router as the default. We also expose `getInvoiceWithItems` and
// ─────────────────────────────────────────────────────────────────────────────
// DELETE draft invoice
// Only drafts (invoice_number IS NULL / status = 'draft') can be deleted.
// Query param: ?deleteJobs=true  → also hard-delete the linked jobs
//              (default)         → unlink jobs from the invoice (jobs stay)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:invoiceId', authenticateToken, async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;
    const { invoiceId } = req.params;
    const deleteJobs = req.query.deleteJobs === 'true';

    const client = await pool.connect();
    let jobIds = [];
    try {
      await client.query('BEGIN');

      // Fetch invoice — must belong to this company and still be a draft
      const invRes = await client.query(
        `SELECT id, status, invoice_number FROM invoices WHERE id = $1 AND company_id = $2`,
        [invoiceId, companyId],
      );
      if (invRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Invoice not found' });
      }
      const inv = invRes.rows[0];
      if (inv.status !== 'draft') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Only draft invoices can be deleted. Consider cancelling sent invoices instead.',
        });
      }

      // Gather linked job ids before deleting items
      const itemsRes = await client.query(
        `SELECT job_id FROM invoice_items WHERE invoice_id = $1`,
        [invoiceId],
      );
      jobIds = itemsRes.rows.map(r => r.job_id).filter(Boolean);

      // Remove invoice items and the invoice itself (order matters for FK)
      await client.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [invoiceId]);
      await client.query(`DELETE FROM invoice_transactions WHERE invoice_id = $1`, [invoiceId]).catch(() => {});
      await client.query(`DELETE FROM invoices WHERE id = $1`, [invoiceId]);

      if (deleteJobs && jobIds.length > 0) {
        await client.query(`DELETE FROM jobs WHERE id = ANY($1) AND company_id = $2`, [jobIds, companyId]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    // Best-effort cleanup of ancillary rows that may or may not exist in this
    // deployment (tables are created lazily). Run OUTSIDE the transaction so a
    // missing table can't abort the main delete.
    pool.query(`DELETE FROM invoice_public_tokens WHERE invoice_id = $1`, [invoiceId]).catch(() => {});
    pool.query(`DELETE FROM scheduled_emails WHERE payload->>'invoiceId' = $1`, [String(invoiceId)]).catch(() => {});

    return res.json({ ok: true, deletedJobIds: deleteJobs ? jobIds : [] });
  } catch (err) {
    console.error('DELETE /invoices/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

// `buildInvoicePdf` as named props so the public PDF route in
// routes/public-invoices.js can reuse them — same loader, same builder, same
// PDF bytes for both admin and customer downloads (a hard accounting
// requirement: the digital and PDF invoice must always represent the same
// thing).
module.exports = router;
module.exports.getInvoiceWithItems = getInvoiceWithItems;
module.exports.buildInvoicePdf = buildInvoicePdf;
