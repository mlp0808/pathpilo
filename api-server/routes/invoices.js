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
const { buildPublicInvoicePayload } = require('../utils/eInvoicePayload');
const {
  scheduleInvoiceDueReminder,
  cancelScheduledInvoiceReminder,
  getPendingInvoiceReminder,
} = require('../utils/invoiceReminderAutomation');
const {
  computeNextSequenceNumber,
  resolveInvoiceNumberDisplay,
  allocateInvoiceNumberIfDraft,
} = require('../utils/invoiceNumberAllocation');

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

// Helper: fetch full invoice with items for the active company (includes company/sender for PDF)
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
           c.billing_address,
           c.billing_zip_code,
           c.billing_city,
           c.billing_email,
           c.billing_phone,
           co.name as company_name,
           co.address as company_address,
           co.city as company_city,
           co.zip_code as company_zip_code,
           co.cvr_number as company_cvr_number,
           u.first_name as created_by_first_name,
           u.last_name as created_by_last_name
    FROM invoices i
    JOIN clients c ON i.client_id = c.id
    JOIN companies co ON i.company_id = co.id
    LEFT JOIN users u ON i.created_by = u.id
    WHERE i.id = $1 AND i.company_id = $2
  `, [invoiceId, companyId]);
  if (invoiceResult.rows.length === 0) return null;
  const row = invoiceResult.rows[0];
  const client_name = [row.name, row.last_name].filter(Boolean).join(' ').trim() || '—';
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
  };
}

// Format date for PDF to match preview: "25 Feb 2026" (en-GB short month)
function formatPdfDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
  const issueDate = invoice.issue_date || invoice.created_at;
  const due_date = formatPdfDate(invoice.due_date);
  const invoice_date = formatPdfDate(issueDate);
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

// Build PDF buffer for an invoice – layout matches the on-screen preview
function buildInvoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const currency = invoice.currency || 'DKK';
      const formatNum = (n) => (Number(n) || 0).toFixed(2);
      const pageWidth = 595;
      const margin = 50;
      const rightEdge = pageWidth - margin;

      // Colors matching preview (Tailwind gray palette)
      const gray50 = '#f9fafb';
      const gray200 = '#e5e7eb';
      const gray500 = '#6b7280';
      const gray600 = '#4b5563';
      const gray700 = '#374151';
      const gray900 = '#111827';

      // ----- Header: Bill to (left) | Company name (right) – same as preview -----
      doc.fontSize(10).fillColor(gray900);
      doc.font('Helvetica-Bold').text(invoice.client_name || '—', margin, doc.y, { width: 260 });
      doc.font('Helvetica');
      doc.y += 6;
      const addressLine =
        (invoice.invoice_to_address && String(invoice.invoice_to_address).trim()) ||
        [invoice.address, invoice.zip_code, invoice.city].filter(Boolean).join(', ');
      if (addressLine) {
        doc.fillColor(gray600).text(addressLine, margin, doc.y, { width: 260 });
        doc.y += 6;
      }
      const billEmail = invoice.invoice_to_email || invoice.email;
      const billPhone = invoice.invoice_to_phone || invoice.phone;
      if (billEmail) {
        doc.text(billEmail, margin, doc.y, { width: 260 });
        doc.y += 5;
      }
      if (billPhone) {
        doc.text(billPhone, margin, doc.y, { width: 260 });
        doc.y += 5;
      }
      const headerLeftEndY = doc.y;

      doc.y = margin;
      doc.fontSize(12).fillColor(gray900).font('Helvetica-Bold');
      doc.text(invoice.company_name || 'Company', rightEdge - 200, doc.y, { width: 200, align: 'right' });
      doc.font('Helvetica').fontSize(10);

      doc.y = Math.max(headerLeftEndY, doc.y) + 16;
      doc.moveTo(margin, doc.y).lineTo(rightEdge, doc.y).strokeColor(gray200).stroke();
      doc.y += 24;

      // ----- Date and Invoice number on one line (as in preview) -----
      const line1Y = doc.y;
      doc.fillColor(gray700).text('Date: ', margin, line1Y);
      doc.font('Helvetica-Bold').fillColor(gray900).text(formatPdfDate(invoice.issue_date), margin + 32, line1Y);
      const numStr = String(invoice.invoice_number_display || invoice.invoice_number || invoice.id);
      doc.font('Helvetica-Bold');
      const numW = doc.widthOfString(numStr);
      doc.text(numStr, rightEdge - numW, line1Y);
      doc.font('Helvetica').fillColor(gray700);
      const labelW = doc.widthOfString('Invoice no. ');
      doc.text('Invoice no. ', rightEdge - numW - labelW - 4, line1Y);
      doc.y = line1Y + 20;

      // ----- Title / description (optional) – same as preview -----
      if (invoice.title || invoice.description) {
        if (invoice.title) {
          doc.fontSize(11).fillColor(gray900).font('Helvetica-Bold').text(invoice.title, margin, doc.y, { width: rightEdge - margin });
          doc.font('Helvetica');
          doc.y += 8;
        }
        if (invoice.description) {
          doc.fontSize(10).fillColor(gray700);
          doc.text(String(invoice.description), margin, doc.y, { width: rightEdge - margin });
          doc.y += 10;
        } else if (invoice.title) doc.y += 4;
      }

      // ----- Table: Description, Qty, Unit price, Amount – header like preview (bg-gray-50, uppercase) -----
      const colDesc = margin;
      const colQty = margin + 200;
      const colUnitPrice = margin + 260;
      const colAmount = rightEdge - 75;
      const tableTop = doc.y + 8;

      doc.fontSize(9).fillColor(gray500);
      doc.rect(margin, tableTop, rightEdge - margin, 22).fill(gray50);
      doc.moveTo(margin, tableTop + 22).lineTo(rightEdge, tableTop + 22).strokeColor(gray200).stroke();
      doc.text('DESCRIPTION', colDesc + 6, tableTop + 6, { width: 190 });
      doc.text('QTY', colQty, tableTop + 6, { width: 58, align: 'right' });
      doc.text('UNIT PRICE', colUnitPrice, tableTop + 6, { width: 70, align: 'right' });
      doc.text('AMOUNT', colAmount, tableTop + 6, { width: 70, align: 'right' });
      doc.y = tableTop + 28;

      doc.fillColor(gray900);
      const items = invoice.items || [];
      const showCompletedDate = Boolean(invoice.show_completed_date);
      if (items.length === 0) {
        doc.fontSize(10).fillColor(gray500).text('No line items', colDesc + 4, doc.y, { width: rightEdge - margin });
        doc.y += 24;
      } else {
      for (const it of items) {
        const desc = it.description || it.service_title || '—';
        const completedDate = showCompletedDate && it.job_completed_date ? formatPdfDate(it.job_completed_date) : null;
        const description = completedDate ? `${desc} - ${completedDate}` : desc;
        const y = doc.y;
        doc.fontSize(10).text(description, colDesc + 4, y, { width: 192 });
        doc.fillColor(gray600).text(String(it.quantity ?? 1), colQty, y, { width: 58, align: 'right' });
        doc.text(formatNum(it.unit_price), colUnitPrice, y, { width: 70, align: 'right' });
        doc.fillColor(gray900).font('Helvetica-Bold').text(formatNum(it.line_total), colAmount, y, { width: 70, align: 'right' });
        doc.font('Helvetica');
        doc.y += 18;
        doc.moveTo(margin, doc.y).lineTo(rightEdge, doc.y).strokeColor('#f3f4f6').stroke();
        doc.y += 2;
      }
      }

      doc.y += 16;

      // ----- Totals – right-aligned block like preview (Subtotal, VAT, Total with gray-50 row) -----
      const totalBlockLeft = rightEdge - 200;
      doc.fontSize(10).fillColor(gray600);
      doc.text('Subtotal', totalBlockLeft, doc.y, { width: 120 });
      doc.text(formatNum(invoice.subtotal), rightEdge - 75, doc.y, { width: 70, align: 'right' });
      doc.y += 16;
      if (Number(invoice.tax_rate) > 0) {
        doc.text(`VAT (${formatNum(invoice.tax_rate)}%)`, totalBlockLeft, doc.y, { width: 120 });
        doc.text(formatNum(invoice.tax_amount), rightEdge - 75, doc.y, { width: 70, align: 'right' });
        doc.y += 16;
      }
      const totalRowY = doc.y;
      doc.rect(totalBlockLeft - 8, totalRowY - 4, 216, 26).fill(gray50);
      doc.moveTo(totalBlockLeft - 8, totalRowY - 4).lineTo(rightEdge + 8, totalRowY - 4).strokeColor(gray200).stroke();
      doc.fillColor(gray900).font('Helvetica-Bold').fontSize(10);
      doc.text(`Total ${currency}`, totalBlockLeft, totalRowY + 4, { width: 120 });
      doc.text(formatNum(invoice.total), rightEdge - 75, totalRowY + 4, { width: 70, align: 'right' });
      doc.font('Helvetica');
      doc.y = totalRowY + 32;

      // ----- Payment terms – border-t then text (as in preview) -----
      if (invoice.payment_terms) {
        doc.y += 16;
        doc.moveTo(margin, doc.y).lineTo(rightEdge, doc.y).strokeColor(gray200).stroke();
        doc.y += 20;
        doc.fontSize(10).fillColor(gray700);
        const termsResolved = replacePaymentTermsPlaceholders(invoice.payment_terms, invoice);
        doc.text(termsResolved, margin, doc.y, { width: rightEdge - margin, lineGap: 2 });
        doc.y += 24;
      }

      // ----- Footer: border-t, centered company details (as in preview) -----
      const footerY = Math.min(800, Math.max(760, doc.y + 40));
      doc.moveTo(margin, footerY - 20).lineTo(rightEdge, footerY - 20).strokeColor(gray200).stroke();
      doc.y = footerY - 12;
      doc.fontSize(8).fillColor(gray500);
      const footerParts = [
        invoice.company_name,
        [invoice.company_address, invoice.company_zip_code, invoice.company_city].filter(Boolean).join(' / '),
        invoice.company_cvr_number ? `CVR no. ${invoice.company_cvr_number}` : null,
      ].filter(Boolean);
      doc.text(footerParts.join(' / '), margin, doc.y, { width: rightEdge - margin, align: 'center' });

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
    const pdfBuffer = await buildInvoicePdf(invoice);
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
    const source = type === 'payment' && payment_source != null ? String(payment_source).trim() : null;

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
    } = req.body;

    const check = await pool.query(
      'SELECT id, status, subtotal FROM invoices WHERE id = $1 AND company_id = $2',
      [invoiceId, companyId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const inv = check.rows[0];
    if (inv.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft invoices can be edited' });
    }

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

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (tax_rate !== undefined) {
      const subtotal = Number(inv.subtotal) || 0;
      const rate = Number(tax_rate) || 0;
      const tax_amount = subtotal * (rate / 100);
      const total = subtotal + tax_amount;
      updates.push(`tax_amount = $${idx++}`);
      values.push(tax_amount);
      updates.push(`total = $${idx++}`);
      values.push(total);
    }

    values.push(invoiceId, companyId);
    const result = await pool.query(
      `UPDATE invoices SET ${updates.join(', ')} WHERE id = $${idx} AND company_id = $${idx + 1} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.json({ invoice: result.rows[0] });
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ error: 'Failed to update invoice', details: error.message });
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

module.exports = router;
