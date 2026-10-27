const { formatLocality } = require('./countryRules');

/**
 * Invoice "Bill to" (layer 1 — client): use billing_* when any billing address part
 * exists; else primary address. Email/phone: billing_* if set, else primary.
 * Company block (layer 2) uses companies.* from business settings. Items/totals (3),
 * due date (4), extensions payment options (5), payment_terms text (6) are separate.
 *
 * The postal line is written in the company country's format ("2100 København",
 * "Austin, TX 78701"); pass the company country code, or the row's company_country_code is used.
 */
function resolveClientInvoiceContact(row, countryCode) {
  if (!row || typeof row !== 'object') {
    return { addressLine: '', street: '', locality: '', email: '', phone: '' };
  }

  const trim = (v) => (v == null ? '' : String(v).trim());
  const cc = countryCode || row.company_country_code;

  const hasBillingAddress = [row.billing_address, row.billing_zip_code, row.billing_city].some((v) => trim(v));
  const street = trim(hasBillingAddress ? row.billing_address : row.address);
  const locality = hasBillingAddress
    ? formatLocality({ zip: row.billing_zip_code, city: row.billing_city, state: row.billing_state }, cc)
    : formatLocality({ zip: row.zip_code, city: row.city, state: row.state }, cc);

  const addressLine = [street, locality].filter(Boolean).join(', ');
  const email = trim(row.billing_email) || trim(row.email) || '';
  const phone = trim(row.billing_phone) || trim(row.phone) || '';

  return { addressLine, street, locality, email, phone };
}

module.exports = { resolveClientInvoiceContact };
