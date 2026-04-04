/**
 * Invoice numbers are allocated when an invoice is first sent (not when a draft is created).
 * companies.invoice_next_number is the next number to assign; drafts do not consume sequence slots.
 */

/** Allow NULL on draft rows; safe to run repeatedly. */
async function ensureInvoiceNumberNullable(pool) {
  try {
    await pool.query(`ALTER TABLE invoices ALTER COLUMN invoice_number DROP NOT NULL`);
  } catch (_) {
    /* already nullable or permission */
  }
}

/** One-time behaviour: existing drafts should not hold a sequence number (Dinero-style). */
async function clearInvoiceNumbersOnDrafts(pool) {
  try {
    await pool.query(`UPDATE invoices SET invoice_number = NULL WHERE status = 'draft'`);
  } catch (_) {
    /* ignore */
  }
}

/**
 * Next numeric invoice number that would be assigned (read-only; same rules as allocation).
 * @param {import('pg').Pool|import('pg').PoolClient} pool
 */
async function computeNextSequenceNumber(pool, companyId) {
  await pool
    .query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_next_number BIGINT NOT NULL DEFAULT 1`)
    .catch(() => {});

  const lock = await pool.query(`SELECT invoice_next_number FROM companies WHERE id = $1`, [companyId]);
  let nextNum = Number(lock.rows[0]?.invoice_next_number);
  if (!Number.isFinite(nextNum) || nextNum < 1) nextNum = 1;

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
  return nextNum;
}

/**
 * @param {import('pg').PoolClient} client — must be inside a transaction with BEGIN
 * @returns {Promise<string>} The invoice_number string now on the row (existing or newly allocated)
 */
async function allocateInvoiceNumberIfDraft(client, companyId, invoiceId) {
  await client
    .query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS invoice_next_number BIGINT NOT NULL DEFAULT 1`)
    .catch(() => {});
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
    return row.invoice_number != null && String(row.invoice_number).trim() !== ''
      ? String(row.invoice_number).trim()
      : String(invoiceId);
  }
  if (row.invoice_number != null && String(row.invoice_number).trim() !== '') {
    return String(row.invoice_number).trim();
  }

  const lock = await client.query(`SELECT invoice_next_number FROM companies WHERE id = $1 FOR UPDATE`, [
    companyId,
  ]);
  let nextNum = Number(lock.rows[0]?.invoice_next_number);
  if (!Number.isFinite(nextNum) || nextNum < 1) nextNum = 1;

  const maxR = await client.query(
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

  const numStr = String(nextNum);
  await client.query(`UPDATE invoices SET invoice_number = $1, updated_at = NOW() WHERE id = $2`, [
    numStr,
    invoiceId,
  ]);
  await client.query(`UPDATE companies SET invoice_next_number = $1, updated_at = NOW() WHERE id = $2`, [
    nextNum + 1,
    companyId,
  ]);
  return numStr;
}

function resolveInvoiceNumberDisplay(row, nextSequencePreview) {
  const raw = row.invoice_number;
  if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  if ((row.status || 'draft') === 'draft') return String(nextSequencePreview);
  return String(row.id);
}

module.exports = {
  ensureInvoiceNumberNullable,
  clearInvoiceNumbersOnDrafts,
  computeNextSequenceNumber,
  allocateInvoiceNumberIfDraft,
  resolveInvoiceNumberDisplay,
};
