/**
 * Invoice "Bill to" (layer 1 — client): use billing_* when any billing address part
 * exists; else primary address. Email/phone: billing_* if set, else primary.
 * Company block (layer 2) uses companies.* from business settings. Items/totals (3),
 * due date (4), extensions payment options (5), payment_terms text (6) are separate.
 */
function resolveClientInvoiceContact(row) {
  if (!row || typeof row !== 'object') {
    return { addressLine: '', email: '', phone: '' };
  }

  const trim = (v) => (v == null ? '' : String(v).trim());

  const billingAddrParts = [trim(row.billing_address), trim(row.billing_zip_code), trim(row.billing_city)].filter(
    Boolean
  );
  const hasBillingAddress = billingAddrParts.length > 0;

  const primaryAddrParts = [trim(row.address), trim(row.zip_code), trim(row.city)].filter(Boolean);

  const addressLine = hasBillingAddress
    ? [trim(row.billing_address), trim(row.billing_zip_code), trim(row.billing_city)].filter(Boolean).join(', ')
    : primaryAddrParts.join(', ');

  const email = trim(row.billing_email) || trim(row.email) || '';
  const phone = trim(row.billing_phone) || trim(row.phone) || '';

  return { addressLine, email, phone };
}

module.exports = { resolveClientInvoiceContact };
