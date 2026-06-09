const express = require('express');
const crypto = require('crypto');
const { pool } = require('../utils/database');
const { buildPublicInvoicePayload } = require('../utils/eInvoicePayload');
const { computeNextSequenceNumber, resolveInvoiceNumberDisplay } = require('../utils/invoiceNumberAllocation');
const { resolveInvoiceParties } = require('../utils/invoiceSnapshot');

const router = express.Router();

const TOKEN_BYTES = 32;
const TOKEN_REGEX = /^[A-Za-z0-9_-]{40,128}$/;

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

async function ensureIntegrationTablesMinimal() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS integration_registry (
      id SERIAL PRIMARY KEY,
      provider VARCHAR(100) UNIQUE NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS company_integrations (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      provider VARCHAR(100) NOT NULL REFERENCES integration_registry(provider) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      secret_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, provider)
    );
  `);
}

async function loadInvoiceForPublic(invoiceId) {
  const invoiceResult = await pool.query(
    `
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
           co.email           AS company_email,
           co.phone           AS company_phone,
           co.website         AS company_website,
           co.logo_url        AS company_logo_url
    FROM invoices i
    JOIN clients c ON i.client_id = c.id
    JOIN companies co ON i.company_id = co.id
    WHERE i.id = $1
    `,
    [invoiceId]
  );
  if (invoiceResult.rows.length === 0) return null;
  const row = invoiceResult.rows[0];
  // Apply the snapshot lens: frozen invoices return their captured data, drafts
  // and legacy invoices fall back to the live join. The public surface MUST
  // never leak post-issue edits — this is the choke point that guarantees it.
  const parties = resolveInvoiceParties(row);
  const client_name = parties.billTo.name;

  const itemsResult = await pool.query(
    `
    SELECT ii.*,
           j.title as job_title,
           j.updated_at as job_completed_date,
           COALESCE(s.title, ii.description) as service_title
    FROM invoice_items ii
    LEFT JOIN jobs j ON ii.job_id = j.id
    LEFT JOIN services s ON ii.service_id = s.id
    WHERE ii.invoice_id = $1
    ORDER BY ii.id ASC
    `,
    [invoiceId]
  );

  const total = Number(row.total) || 0;
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
    // invoice_transactions may not exist
  }

  const nextPreview = await computeNextSequenceNumber(pool, row.company_id);
  const invoice_number_display = resolveInvoiceNumberDisplay(row, nextPreview);

  return {
    ...row,
    client_name,
    items: itemsResult.rows,
    transactions,
    balance,
    invoice_number_display,
    // Frozen-aware view consumed by buildPublicInvoicePayload.
    parties,
    // Mirror the snapshot back into the flat column names so any downstream
    // code that already reads company_*/currency keeps working unchanged.
    company_name: parties.from.name || row.company_name,
    company_address: parties.from.address || row.company_address,
    company_city: parties.from.city || row.company_city,
    company_zip_code: parties.from.zipCode || row.company_zip_code,
    company_country: parties.from.country || row.company_country,
    company_country_code: parties.from.countryCode || row.company_country_code,
    company_cvr_number: parties.from.companyNumber || row.company_cvr_number,
    company_number_label: parties.from.companyNumberLabel,
    company_email: parties.from.email || row.company_email,
    company_phone: parties.from.phone || row.company_phone,
    company_website: parties.from.website || row.company_website,
    company_logo_url: parties.from.logoUrl || row.company_logo_url,
    currency: parties.currency,
    tax_label: parties.taxLabel,
    // Locale for rendering (snapshot on issued, live-country on drafts).
    // `buildPublicInvoicePayload` forwards this to the digital view so the
    // client sees labels in the company's country language.
    invoice_locale: parties.locale,
  };
}

// GET /api/public/invoices/:token — public view (no auth)
router.get('/:token', async (req, res) => {
  try {
    await ensureInvoicePublicTokensTable();
    await ensureIntegrationTablesMinimal();

    const raw = String(req.params.token || '').trim();
    if (!TOKEN_REGEX.test(raw)) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const linkResult = await pool.query(`SELECT invoice_id FROM invoice_public_tokens WHERE token = $1`, [raw]);
    if (linkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoiceId = linkResult.rows[0].invoice_id;
    const invoice = await loadInvoiceForPublic(invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const companyId = invoice.company_id;
    const integ = await pool.query(
      `
      SELECT provider, enabled, config
      FROM company_integrations
      WHERE company_id = $1 AND provider = 'bank_transfer'
      `,
      [companyId]
    );
    const bankRow = integ.rows[0] || null;

    const publicInvoice = buildPublicInvoicePayload(invoice, bankRow);

    res.json({ invoice: publicInvoice });
  } catch (error) {
    console.error('Public invoice error:', error);
    res.status(500).json({ error: 'Failed to load invoice' });
  }
});

// GET /api/public/invoices/:token/pdf — public PDF download (no auth required;
// the token itself is the secret). Mirrors the admin /invoices/:id/pdf route
// but resolves identity via the public token. We reuse the same PDF builder so
// the customer's PDF and the admin's PDF are byte-identical.
router.get('/:token/pdf', async (req, res) => {
  try {
    await ensureInvoicePublicTokensTable();
    const raw = String(req.params.token || '').trim();
    if (!TOKEN_REGEX.test(raw)) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const linkResult = await pool.query(
      `SELECT invoice_id FROM invoice_public_tokens WHERE token = $1`,
      [raw],
    );
    if (linkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const invoiceId = linkResult.rows[0].invoice_id;

    // Reuse the admin loader+builder. They live in routes/invoices.js, so we
    // require lazily to avoid a cyclic import at module load time.
    const { getInvoiceWithItems, buildInvoicePdf } = require('./invoices');
    const ownerRow = await pool.query('SELECT company_id FROM invoices WHERE id = $1', [invoiceId]);
    const companyId = ownerRow.rows[0]?.company_id;
    if (!companyId) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = await getInvoiceWithItems(invoiceId, companyId);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const integ = await pool.query(
      `SELECT provider, enabled, config FROM company_integrations
       WHERE company_id = $1 AND provider = 'bank_transfer'`,
      [companyId],
    );
    const bankRow = integ.rows[0] || null;
    const pdfBuffer = await buildInvoicePdf(invoice, bankRow);
    const filename = `invoice-${invoice.invoice_number_display || invoice.invoice_number || invoiceId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    // `inline` so the browser previews it; the frontend's Download button uses
    // the `download` attribute to force-save when the user explicitly asks.
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-cache');
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Public invoice PDF error:', error);
    return res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

module.exports = router;
