/**
 * Merged "first invoice email" template (send_invoice) — same rules as GET /api/email-templates.
 */

const { getSendInvoiceDefaults } = require('./companyInvoiceEmailLocale');

/**
 * @param {string} str
 * @param {{ companyName?: string, clientFirstName?: string, invoiceNumber?: string }} ctx
 */
function applySendInvoicePlaceholders(str, ctx) {
  const invNo = String(ctx.invoiceNumber ?? '');
  const co = String(ctx.companyName ?? '');
  const first = String(ctx.clientFirstName ?? '').trim();
  return String(str || '')
    .replace(/\{invoice_number\}/g, invNo)
    .replace(/\{Company name\}/g, co)
    .replace(/\{Client first name\}/g, first);
}

/**
 * @param {string} [countryCode] Company country (ISO); DK → Danish defaults, else English.
 */
async function loadMergedSendInvoiceTemplate(pool, companyId, countryCode) {
  const base = getSendInvoiceDefaults(countryCode);
  /** @type {{ subject: string, message: string }} */
  let merged = { ...base };
  try {
    const result = await pool.query(
      'SELECT subject, message FROM email_templates WHERE company_id = $1 AND template_type = $2',
      [companyId, 'send_invoice']
    );
    if (result.rows[0]) {
      merged = {
        ...base,
        subject: result.rows[0].subject != null ? String(result.rows[0].subject) : base.subject,
        message: result.rows[0].message != null ? String(result.rows[0].message) : base.message,
      };
    }
  } catch (_) {
    merged = { ...base };
  }

  let invFromCompany = null;
  try {
    const invCo = await pool.query(
      `SELECT invoice_email_default_subject, invoice_email_default_body FROM companies WHERE id = $1`,
      [companyId]
    );
    invFromCompany = invCo.rows[0] || null;
  } catch (_) {
    invFromCompany = null;
  }

  if (invFromCompany) {
    if (!merged.subject?.trim() && invFromCompany.invoice_email_default_subject) {
      merged.subject = invFromCompany.invoice_email_default_subject;
    }
    if (!merged.message?.trim() && invFromCompany.invoice_email_default_body) {
      merged.message = invFromCompany.invoice_email_default_body;
    }
  }

  return {
    subject: merged.subject?.trim() || base.subject,
    message: merged.message?.trim() || base.message,
  };
}

module.exports = {
  DEFAULT_SEND_INVOICE: getSendInvoiceDefaults('US'),
  applySendInvoicePlaceholders,
  loadMergedSendInvoiceTemplate,
};
