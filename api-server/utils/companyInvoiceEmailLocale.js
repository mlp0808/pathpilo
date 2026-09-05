/**
 * Customer-facing invoice emails: Danish for Denmark (company country DK), English otherwise.
 */

function invoiceCustomerEmailLang(countryCode) {
  return String(countryCode || '').trim().toUpperCase() === 'DK' ? 'da' : 'en';
}

const SEND_INVOICE = {
  en: {
    subject: 'Invoice {invoice_number} from {Company name}',
    message:
      'Hi {Client first name},\n\nYour invoice is ready. Open the e-invoice using the button in the email to view details and payment options.\n\nBest regards,\n{Company name}',
  },
  da: {
    subject: 'Faktura {invoice_number} fra {Company name}',
    message:
      'Hej {Client first name},\n\nDin faktura er klar. Åbn e-fakturaen via knappen i mailen for at se detaljer og betalingsmuligheder.\n\nMed venlig hilsen,\n{Company name}',
  },
};

const INVOICE_DUE_REMINDER = {
  en: {
    subject: 'Reminder: Invoice {invoice_number}',
    message:
      'Hi,\n\nThis is a friendly reminder that payment is coming due. You can view and pay using the link below.',
  },
  da: {
    subject: 'Påmindelse: Faktura {invoice_number}',
    message: 'Hej,\n\nVenlig påmindelse om betaling. Se og betal via linket nedenfor.',
  },
};

function getSendInvoiceDefaults(countryCode) {
  const lang = invoiceCustomerEmailLang(countryCode);
  return { ...SEND_INVOICE[lang] };
}

/** Same shape as email_templates.message (not "body"). */
function getInvoiceDueReminderDefaults(countryCode) {
  const lang = invoiceCustomerEmailLang(countryCode);
  return { ...INVOICE_DUE_REMINDER[lang] };
}

/** Standard payment-terms template when the company has not saved its own yet. */
const DEFAULT_PAYMENT_TERMS = {
  en:
    'Payment is due no later than {due_date}. Please use invoice number {invoice_number} as the payment reference.\n\nIf payment is not received by the due date, we reserve the right to charge interest on overdue amounts in accordance with applicable law, and to recover reasonable costs of collection.',
  da:
    'Betaling skal ske senest {due_date}. Anfør venligst fakturanummer {invoice_number} som betalingsreference.\n\nHvis betaling ikke er modtaget inden forfaldsdatoen, forbeholder vi os retten til at opkræve renter af forfaldne beløb i henhold til gældende lovgivning, samt at inddrive rimelige inkassoomkostninger.',
};

function getDefaultPaymentTerms(countryCode) {
  const lang = invoiceCustomerEmailLang(countryCode);
  return DEFAULT_PAYMENT_TERMS[lang];
}

module.exports = {
  invoiceCustomerEmailLang,
  getSendInvoiceDefaults,
  getInvoiceDueReminderDefaults,
  getDefaultPaymentTerms,
  SEND_INVOICE,
  INVOICE_DUE_REMINDER,
  DEFAULT_PAYMENT_TERMS,
};
