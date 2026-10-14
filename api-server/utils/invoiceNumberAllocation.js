/**
 * Invoice numbers are allocated when an invoice is first sent (not when a draft is created).
 * companies.invoice_next_number is the next number to assign; drafts do not consume sequence slots.
 * companies.invoice_number_pad_width controls leading zeros (e.g. width 5 → 00001, 00002, …).
 *
 * NOTE: Allocating a number is the single moment an invoice transitions from
 * mutable (draft) → immutable (issued). We therefore also call
 * `snapshotInvoiceOnIssue` here, which freezes the company / client / tax
 * blocks onto the invoice row. After this point the customer-facing data
 * never changes, even if the company profile or client record is edited.
 */
const { snapshotInvoiceOnIssue } = require('./invoiceSnapshot');

const MAX_PAD_WIDTH = 18;

/** Allow NULL on draft rows; safe to run repeatedly. */
async function ensureInvoiceNumberNullable(pool) {
  try {
    await pool.query(`ALTER TABLE invoices ALTER COLUMN invoice_number DROP NOT NULL`);
  } catch (_) {
    /* already nullable or permission */
  }
  // Match job_services.quantity (fractional qty like 1.5).
  try {
    await pool.query(
      `ALTER TABLE invoice_items ALTER COLUMN quantity TYPE NUMERIC(12,3) USING quantity::numeric`
    );
  } catch (_) {
    /* already numeric or permission */
  }
}

async function ensureNumberingColumns(pool) {
  await pool
    .query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_next_number BIGINT NOT NULL DEFAULT 1`)
    .catch(() => {});
  await pool
    .query(
      `ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_number_pad_width INTEGER NOT NULL DEFAULT 0`,
    )
    .catch(() => {});
}

/**
 * Format a sequence integer with optional leading zeros.
 * Width only pads when the number is shorter; larger values grow naturally (100000 stays 100000).
 */
function formatInvoiceSequenceNumber(n, padWidth) {
  const num = Number(n);
  const safe = Number.isFinite(num) && num >= 1 ? Math.floor(num) : 1;
  const width = Math.min(MAX_PAD_WIDTH, Math.max(0, Math.floor(Number(padWidth) || 0)));
  const s = String(safe);
  if (width <= 1) return s;
  return s.padStart(width, '0');
}

/**
 * Parse a user-entered next number that may include leading zeros ("00001").
 * @returns {{ n: number, padWidth: number, display: string } | { error: string }}
 */
function parseInvoiceNextNumberInput(raw) {
  const digits = String(raw ?? '').trim();
  if (!digits || !/^\d+$/.test(digits)) {
    return { error: 'Next invoice number must be a positive integer' };
  }
  if (digits.length > MAX_PAD_WIDTH) {
    return { error: `Next invoice number can be at most ${MAX_PAD_WIDTH} digits` };
  }
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 1) {
    return { error: 'Next invoice number must be a positive integer' };
  }
  const padWidth = digits.length;
  return { n, padWidth, display: formatInvoiceSequenceNumber(n, padWidth) };
}

/** One-time behaviour: existing drafts should not hold a sequence number (Dinero-style). */
async function clearInvoiceNumbersOnDrafts(pool) {
  try {
    await pool.query(`UPDATE invoices SET invoice_number = NULL WHERE status = 'draft'`);
  } catch (_) {
    /* ignore */
  }
}

async function readNextSequenceState(pool, companyId, { forUpdate = false } = {}) {
  await ensureNumberingColumns(pool);
  const lockSql = forUpdate
    ? `SELECT invoice_next_number, COALESCE(invoice_number_pad_width, 0) AS pad_width FROM companies WHERE id = $1 FOR UPDATE`
    : `SELECT invoice_next_number, COALESCE(invoice_number_pad_width, 0) AS pad_width FROM companies WHERE id = $1`;
  const lock = await pool.query(lockSql, [companyId]);
  let nextNum = Number(lock.rows[0]?.invoice_next_number);
  if (!Number.isFinite(nextNum) || nextNum < 1) nextNum = 1;
  const padWidth = Math.min(MAX_PAD_WIDTH, Math.max(0, Number(lock.rows[0]?.pad_width) || 0));

  const maxR = await pool.query(
    `SELECT COALESCE(MAX(CAST(invoice_number AS BIGINT)), 0) AS m
     FROM invoices
     WHERE company_id = $1
       AND invoice_number IS NOT NULL
       AND TRIM(invoice_number::text) <> ''
       AND invoice_number ~ '^[0-9]+$'
       AND LENGTH(invoice_number::text) <= 18
       AND COALESCE(status, '') <> 'draft'`,
    [companyId],
  );
  const maxN = Number(maxR.rows[0].m) || 0;
  if (nextNum <= maxN) nextNum = maxN + 1;
  return { nextNum, padWidth };
}

/**
 * Next invoice number that would be assigned (read-only), already padded for display.
 * @param {import('pg').Pool|import('pg').PoolClient} pool
 * @returns {Promise<string>}
 */
async function computeNextSequenceNumber(pool, companyId) {
  const { nextNum, padWidth } = await readNextSequenceState(pool, companyId);
  return formatInvoiceSequenceNumber(nextNum, padWidth);
}

/**
 * @param {import('pg').PoolClient} client — must be inside a transaction with BEGIN
 * @returns {Promise<string>} The invoice_number string now on the row (existing or newly allocated)
 */
async function allocateInvoiceNumberIfDraft(client, companyId, invoiceId) {
  await ensureNumberingColumns(client);
  await ensureInvoiceNumberNullable(client);

  const invRes = await client.query(
    `SELECT id, status, invoice_number FROM invoices WHERE id = $1 AND company_id = $2 FOR UPDATE`,
    [invoiceId, companyId],
  );
  if (invRes.rows.length === 0) {
    throw new Error('Invoice not found');
  }
  const row = invRes.rows[0];
  if ((row.status || 'draft') !== 'draft') {
    // Already issued — snapshot would be a no-op (frozen_at gates it) but call
    // anyway so legacy invoices that pre-date snapshots get back-filled the
    // first time anyone touches them.
    await snapshotInvoiceOnIssue(client, invoiceId).catch((e) =>
      console.error('snapshotInvoiceOnIssue (already-issued):', e.message),
    );
    return row.invoice_number != null && String(row.invoice_number).trim() !== ''
      ? String(row.invoice_number).trim()
      : String(invoiceId);
  }
  if (row.invoice_number != null && String(row.invoice_number).trim() !== '') {
    // Has a number but still draft (rare). Don't freeze yet — snapshot only
    // happens together with the actual draft → issued transition below.
    return String(row.invoice_number).trim();
  }

  const { nextNum, padWidth } = await readNextSequenceState(client, companyId, { forUpdate: true });
  const numStr = formatInvoiceSequenceNumber(nextNum, padWidth);

  await client.query(`UPDATE invoices SET invoice_number = $1, updated_at = NOW() WHERE id = $2`, [
    numStr,
    invoiceId,
  ]);
  await client.query(`UPDATE companies SET invoice_next_number = $1, updated_at = NOW() WHERE id = $2`, [
    nextNum + 1,
    companyId,
  ]);

  // The invoice is now numbered. The caller will set status away from 'draft'
  // immediately after this returns (every call site does so atomically). We
  // freeze the from / bill-to / tax block right now so the very first PDF or
  // digital render sees the snapshot, not the live data. If anything fails the
  // outer transaction rolls back, leaving the invoice as a pristine draft.
  await snapshotInvoiceOnIssue(client, invoiceId);
  return numStr;
}

function resolveInvoiceNumberDisplay(row, nextSequencePreview) {
  const raw = row.invoice_number;
  if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  if ((row.status || 'draft') === 'draft') {
    return nextSequencePreview != null && String(nextSequencePreview).trim() !== ''
      ? String(nextSequencePreview).trim()
      : '';
  }
  return String(row.id);
}

module.exports = {
  ensureInvoiceNumberNullable,
  ensureNumberingColumns,
  clearInvoiceNumbersOnDrafts,
  formatInvoiceSequenceNumber,
  parseInvoiceNextNumberInput,
  computeNextSequenceNumber,
  allocateInvoiceNumberIfDraft,
  resolveInvoiceNumberDisplay,
  MAX_PAD_WIDTH,
};
