/**
 * Invoice snapshot helpers.
 *
 * The principle: an invoice is a legal document. Once issued (status leaves
 * 'draft') it must be frozen — future edits to the company profile, the
 * client record, or the services must NEVER change what the customer was sent.
 *
 * Implementation:
 *   • While the invoice is `draft`, we read everything live so the user can
 *     keep tweaking. Snapshots stay NULL.
 *   • The instant the invoice transitions out of `draft`, we snapshot the
 *     "from" (admin company) block, the "bill to" (client) block, and the
 *     tax/currency labels onto the invoice row itself.
 *   • Loaders (PDF + digital + admin view) prefer the snapshot when present
 *     and fall back to the live join only for legacy invoices that pre-date
 *     this snapshot system.
 *
 * The country-aware company-number label (CVR / Org.nr / USt-IdNr. / EIN /
 * VAT) lives here too, so DB rows survive a company moving from DK to SE
 * without rewriting old invoices.
 */

const COUNTRY_COMPANY_NUMBER_LABELS = {
  DK: 'CVR no.',
  SE: 'Org.nr',
  NO: 'Org.nr',
  FI: 'Y-tunnus',
  DE: 'Handelsreg.-Nr.',
  // UK: Companies House registration number — distinct from the VAT number.
  // VAT number (GB123456789) is stored separately in companies.vat_number.
  GB: 'Co. Reg. No.',
  US: 'EIN',
  NL: 'KvK',
  BE: 'KBO/BCE',
  FR: 'SIRET',
  IT: 'Cod. fiscale',
  ES: 'CIF',
  PL: 'NIP',
};

const COUNTRY_TAX_LABELS = {
  DK: 'Moms',
  SE: 'Moms',
  NO: 'MVA',
  FI: 'ALV',
  DE: 'USt',
  GB: 'VAT',
  US: 'Sales tax',
  NL: 'BTW',
  BE: 'BTW',
  FR: 'TVA',
  IT: 'IVA',
  ES: 'IVA',
  PL: 'VAT',
};

const COUNTRY_CURRENCY_DEFAULTS = {
  DK: 'DKK',
  SE: 'SEK',
  NO: 'NOK',
  FI: 'EUR',
  DE: 'EUR',
  GB: 'GBP',
  US: 'USD',
  NL: 'EUR',
  BE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
  PL: 'PLN',
};

// Which language the invoice itself is rendered in (PDF, digital link,
// customer emails). Always derived from the company country — NOT from the
// admin user's UI locale. So a Danish company's invoices are always in
// Danish, even if the user interface is English. Countries not listed fall
// back to English until we ship their translation bundle.
const COUNTRY_INVOICE_LOCALE = {
  DK: 'da',
};

function invoiceLocaleFor(countryCode) {
  if (!countryCode) return 'en';
  return COUNTRY_INVOICE_LOCALE[String(countryCode).toUpperCase()] || 'en';
}

function companyNumberLabelFor(countryCode) {
  if (!countryCode) return 'Company no.';
  return COUNTRY_COMPANY_NUMBER_LABELS[String(countryCode).toUpperCase()] || 'Company no.';
}

function taxLabelFor(countryCode) {
  if (!countryCode) return 'VAT';
  return COUNTRY_TAX_LABELS[String(countryCode).toUpperCase()] || 'VAT';
}

function currencyFor(countryCode) {
  if (!countryCode) return 'DKK';
  return COUNTRY_CURRENCY_DEFAULTS[String(countryCode).toUpperCase()] || 'DKK';
}

/**
 * Idempotently add every column the invoice snapshot system needs. Safe to
 * call from anywhere and runs once per process per column thanks to a tiny
 * in-memory guard.
 */
let snapshotMigrationDone = false;
async function ensureSnapshotColumns(pool) {
  if (snapshotMigrationDone) return;
  snapshotMigrationDone = true;
  const stmts = [
    // Company-side contact info (rendered on every invoice).
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS email TEXT`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone TEXT`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS website TEXT`,
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT`,
    // Separate VAT registration number (UK: GB123456789, EU: country-prefix format).
    // Distinct from cvr_number (Companies House / trade register number).
    `ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_number TEXT`,
    // Optional client-side fields used by Danish public-sector invoicing.
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS ean_number TEXT`,
    // Optional service-side bookkeeping account code, used when exporting to
    // bookkeeping systems (e-conomic, Dinero, Billy, Fortnox…). Most users
    // leave this empty until they connect an integration.
    `ALTER TABLE services ADD COLUMN IF NOT EXISTS bookkeeping_account TEXT`,
    // Per-invoice combined "Reference / PO" field.
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reference_text TEXT`,
    // ── Snapshot of the SENDER (this company), captured on issue. ──
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS from_company_name TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS from_address TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS from_zip_code TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS from_city TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS from_country TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS from_country_code VARCHAR(2)`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS from_company_number TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS from_company_number_label TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS from_vat_number TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS from_email TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS from_phone TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS from_website TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS from_logo_url TEXT`,
    // ── Snapshot of the RECIPIENT (client), captured on issue. ──
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bill_to_name TEXT`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bill_to_ean TEXT`,
    // ── Snapshot of the tax / currency labels at issue time. ──
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_label TEXT`,
    // Snapshot of which *language* this invoice was issued in — derived
    // from the company country at issue time. Freezing it means a future
    // country change never rewrites the wording of a historic invoice.
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_locale VARCHAR(8)`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMP`,
  ];
  for (const s of stmts) {
    try {
      await pool.query(s);
    } catch (e) {
      // Don't crash startup on a single column failure — log and move on.
      console.error('ensureSnapshotColumns:', s, e.message);
    }
  }
}

/**
 * Snapshot the SENDER + RECIPIENT + TAX block onto an invoice row. Called
 * the moment the invoice transitions out of `draft`. Idempotent — calling
 * twice is a no-op since `frozen_at` short-circuits.
 */
async function snapshotInvoiceOnIssue(dbClient, invoiceId) {
  await ensureSnapshotColumns(dbClient);

  const row = await dbClient.query(
    `
    SELECT i.id, i.frozen_at, i.company_id, i.client_id, i.currency, i.tax_label,
           co.name           AS company_name,
           co.address        AS company_address,
           co.zip_code       AS company_zip_code,
           co.city           AS company_city,
           co.country        AS company_country,
           co.country_code   AS company_country_code,
           co.cvr_number     AS company_cvr,
           co.vat_number     AS company_vat_number,
           co.email          AS company_email,
           co.phone          AS company_phone,
           co.website        AS company_website,
           co.logo_url       AS company_logo_url,
           cl.name           AS client_first_name,
           cl.last_name      AS client_last_name,
           cl.ean_number     AS client_ean
    FROM invoices i
    JOIN companies co ON co.id = i.company_id
    JOIN clients   cl ON cl.id = i.client_id
    WHERE i.id = $1
    `,
    [invoiceId],
  );
  if (row.rows.length === 0) return;
  const r = row.rows[0];
  // Already frozen — never overwrite. This is what makes the snapshot legal.
  if (r.frozen_at) return;

  const billToName =
    [r.client_first_name, r.client_last_name].filter(Boolean).join(' ').trim() || '—';
  const numberLabel = companyNumberLabelFor(r.company_country_code);
  const taxLabel = r.tax_label || taxLabelFor(r.company_country_code);
  const currency = r.currency || currencyFor(r.company_country_code);
  // Language of the invoice itself — comes from the company country, so
  // the customer always sees the invoice in the country's language
  // regardless of what the admin has their UI set to.
  const locale = invoiceLocaleFor(r.company_country_code);

  await dbClient.query(
    `
    UPDATE invoices SET
      from_company_name         = $2,
      from_address              = $3,
      from_zip_code             = $4,
      from_city                 = $5,
      from_country              = $6,
      from_country_code         = $7,
      from_company_number       = $8,
      from_company_number_label = $9,
      from_email                = $10,
      from_phone                = $11,
      from_website              = $12,
      from_logo_url             = $13,
      bill_to_name              = $14,
      bill_to_ean               = $15,
      tax_label                 = $16,
      currency                  = $17,
      invoice_locale            = $18,
      from_vat_number           = $19,
      frozen_at                 = CURRENT_TIMESTAMP,
      updated_at                = CURRENT_TIMESTAMP
    WHERE id = $1
    `,
    [
      invoiceId,
      r.company_name,
      r.company_address,
      r.company_zip_code,
      r.company_city,
      r.company_country,
      r.company_country_code,
      r.company_cvr,
      numberLabel,
      r.company_email,
      r.company_phone,
      r.company_website,
      r.company_logo_url,
      billToName,
      r.client_ean,
      taxLabel,
      currency,
      locale,
      r.company_vat_number || null,
    ],
  );
}

/**
 * Build the "effective" view of an invoice for rendering. Prefers snapshot
 * fields when present, falls back to the live joined fields for invoices
 * that pre-date the snapshot system.
 *
 * Input row must already have both the live joined columns (company_*, name,
 * last_name, etc.) AND the new from_* / bill_to_* snapshot columns selected.
 */
function resolveInvoiceParties(row) {
  const pick = (snap, live) => {
    if (snap != null && String(snap).trim() !== '') return String(snap);
    return live != null ? String(live) : '';
  };

  // SENDER block (admin's own company)
  const fromCountryCode =
    pick(row.from_country_code, row.company_country_code) || row.company_country_code || '';
  const from = {
    name: pick(row.from_company_name, row.company_name),
    address: pick(row.from_address, row.company_address),
    zipCode: pick(row.from_zip_code, row.company_zip_code),
    city: pick(row.from_city, row.company_city),
    country: pick(row.from_country, row.company_country),
    countryCode: fromCountryCode,
    companyNumber: pick(row.from_company_number, row.company_cvr_number),
    companyNumberLabel:
      pick(row.from_company_number_label, '') || companyNumberLabelFor(fromCountryCode),
    vatNumber: pick(row.from_vat_number, row.company_vat_number),
    email: pick(row.from_email, row.company_email),
    phone: pick(row.from_phone, row.company_phone),
    website: pick(row.from_website, row.company_website),
    logoUrl: pick(row.from_logo_url, row.company_logo_url),
  };

  // RECIPIENT block (client)
  const liveBillToName = [row.name, row.last_name].filter(Boolean).join(' ').trim();
  const billTo = {
    name: pick(row.bill_to_name, liveBillToName) || '—',
    ean: pick(row.bill_to_ean, row.client_ean) || '',
  };

  // Tax / currency labels
  const taxLabel = pick(row.tax_label, '') || taxLabelFor(fromCountryCode);
  const currency = pick(row.currency, '') || currencyFor(fromCountryCode);
  // Locale to render the invoice in. Drafts compute it live from the
  // current company country; issued invoices use the snapshot.
  const locale =
    pick(row.invoice_locale, '') || invoiceLocaleFor(fromCountryCode);

  return { from, billTo, taxLabel, currency, locale, frozen: Boolean(row.frozen_at) };
}

module.exports = {
  ensureSnapshotColumns,
  snapshotInvoiceOnIssue,
  resolveInvoiceParties,
  companyNumberLabelFor,
  taxLabelFor,
  currencyFor,
  invoiceLocaleFor,
};
