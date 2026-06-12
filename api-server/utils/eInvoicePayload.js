const { resolveClientInvoiceContact } = require('./invoiceClientDisplay');
const { t: tI18n, tInterp: tInterpI18n } = require('./invoiceI18n');

/**
 * Turn a relative logo path into an absolute URL so it renders in emails
 * and any context outside the Next.js rewrite layer.
 *
 * New format:  /api/companies/logo/<filename>
 * Legacy:      /uploads/company-logos/<filename>
 *
 * Both are served by the API server, so we prefix with API_SERVER_URL.
 */
function resolveLogoUrl(url) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/api/') || url.startsWith('/uploads/')) {
    const base = process.env.API_SERVER_URL || process.env.NEXT_PUBLIC_API_URL || '';
    return base ? `${base.replace(/\/$/, '')}${url}` : url;
  }
  return url;
}

// Locale-aware short-date formatter. Falls back to English month names when
// the invoice has no locale (legacy rows). Adding a locale is a matter of
// adding an array below.
const PUBLIC_MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  da: ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
};
function formatPdfDate(value, locale) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  const loc = locale && PUBLIC_MONTHS[locale] ? locale : 'en';
  const months = PUBLIC_MONTHS[loc];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function daysBetweenCalendar(start, end) {
  if (!start || !end) return 0;
  const a = new Date(start);
  const b = new Date(end);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function effectiveInvoiceNumber(invoice) {
  if (invoice.invoice_number_display != null && String(invoice.invoice_number_display).trim() !== '') {
    return String(invoice.invoice_number_display).trim();
  }
  if (invoice.invoice_number != null && String(invoice.invoice_number).trim() !== '') {
    return String(invoice.invoice_number).trim();
  }
  return String(invoice.id);
}

function replacePaymentTermsPlaceholders(template, invoice) {
  if (template == null || typeof template !== 'string') return '';
  const out = template.replace(/\uFF5B/g, '{').replace(/\uFF5D/g, '}');
  const locale = invoice.invoice_locale || 'en';
  const issueDate = invoice.issue_date || invoice.created_at;
  const due_date = formatPdfDate(invoice.due_date, locale);
  const invoice_date = formatPdfDate(issueDate, locale);
  const overdue_days = daysBetweenCalendar(issueDate, invoice.due_date);
  const invoice_number = effectiveInvoiceNumber(invoice);
  return out
    .replace(/\{due_date\}/g, due_date)
    .replace(/\{overdue_days\}/g, String(overdue_days))
    .replace(/\{invoice_date\}/g, invoice_date)
    .replace(/\{invoice_number\}/g, invoice_number);
}

function calendarDaysUntilDue(dueDateStr) {
  if (!dueDateStr) return null;
  const due = new Date(String(dueDateStr).slice(0, 10) + 'T12:00:00');
  if (isNaN(due.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((dueDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

// Pull the per-invoice snapshot of which providers should appear, when one
// exists. Legacy invoices (created before this gate shipped) have NULL and
// fall back to "use everything that is currently enabled at company level".
function resolveAllowedProviders(invoice) {
  const raw = invoice && invoice.enabled_payment_methods;
  if (raw == null) return null;
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed)) return null;
  return new Set(parsed.map((p) => String(p)));
}

function buildPaymentOptions(companyId, invoice, bankRow) {
  const allowed = resolveAllowedProviders(invoice);
  const isAllowed = (provider) => (allowed ? allowed.has(provider) : true);
  const locale = invoice.invoice_locale || 'en';

  const methods = [];
  if (bankRow && bankRow.enabled && isAllowed('bank_transfer')) {
    const cfg = bankRow.config || {};
    const invNo = effectiveInvoiceNumber(invoice);
    // Same translation key used on the digital view so the label on the
    // "Payment reference" line matches what customers see elsewhere.
    const reference = tInterpI18n(
      locale,
      'invoice.paymentReferenceValue',
      { n: invNo },
      `Invoice number: ${invNo}`,
    );
    methods.push({
      id: 'bank_transfer',
      title: tI18n(locale, 'invoice.bankTransfer', 'Bank transfer'),
      description: tI18n(
        locale,
        'invoice.bankTransferDesc',
        'Pay directly from your bank using the details below.',
      ),
      type: 'bank_transfer',
      bank: {
        accountHolder: cfg.accountHolder || '',
        iban: cfg.iban || '',
        accountNumber: cfg.accountNumber || '',
        registrationNumber: cfg.registrationNumber || '',
        instructions: '',
        paymentReference: reference,
      },
    });
  }
  return methods;
}

/**
 * @param {object} invoice — row with items, transactions, balance, client_name, company fields (same as public loader)
 * @param {object|null} bankRow — company_integrations row for bank_transfer or null
 */
function buildPublicInvoicePayload(invoice, bankRow) {
  const companyId = invoice.company_id;
  // The invoice locale comes from the snapshot on issued invoices and from
  // the live company country on drafts. All user-facing strings on this
  // payload (status badges, payment-method titles, payment reference,
  // formatted dates) go through it so the customer sees one consistent
  // language regardless of the admin's UI locale.
  const locale = invoice.invoice_locale || 'en';
  const tr = (key, fallback) => tI18n(locale, key, fallback);
  const trI = (key, values, fallback) => tInterpI18n(locale, key, values, fallback);

  const paymentTermsResolved = invoice.payment_terms
    ? replacePaymentTermsPlaceholders(invoice.payment_terms, invoice)
    : '';

  const dueDateStr = invoice.due_date;
  const daysUntilDue = calendarDaysUntilDue(dueDateStr);
  const status = invoice.status || 'draft';
  const balance = Number(invoice.balance) || 0;

  let badge = {
    kind: 'open',
    label: tr('invoice.statusOutstanding', 'Outstanding'),
    sublabel: null,
  };
  if (status === 'cancelled') {
    badge = { kind: 'cancelled', label: tr('invoice.statusCancelled', 'Cancelled'), sublabel: null };
  } else if (status === 'credited') {
    badge = { kind: 'credited', label: tr('invoice.statusCredited', 'Credited'), sublabel: null };
  } else if (balance < 0 || status === 'overpaid') {
    badge = { kind: 'overpaid', label: tr('invoice.statusOverpaid', 'Overpaid'), sublabel: null };
  } else if (balance <= 0 && status !== 'draft') {
    badge = { kind: 'paid', label: tr('invoice.statusPaid', 'Paid'), sublabel: null };
  } else if (status === 'draft') {
    badge = { kind: 'draft', label: tr('invoice.statusDraft', 'Draft'), sublabel: null };
  } else if (balance > 0 && daysUntilDue !== null && daysUntilDue < 0) {
    const daysOver = Math.abs(daysUntilDue);
    const key = daysOver === 1 ? 'invoice.daysPastDue' : 'invoice.daysPastDuePlural';
    badge = {
      kind: 'overdue',
      label: tr('invoice.statusOverdue', 'Overdue'),
      sublabel: trI(
        key,
        { n: daysOver },
        `${daysOver} day${daysOver === 1 ? '' : 's'} past due date`,
      ),
      daysOverdue: daysOver,
    };
  } else if (balance > 0 && daysUntilDue !== null && daysUntilDue === 0) {
    badge = {
      kind: 'due_today',
      label: tr('invoice.statusDueToday', 'Due today'),
      sublabel: tr('invoice.statusDueTodayLong', 'Due date is today'),
    };
  } else if (balance > 0 && daysUntilDue !== null && daysUntilDue > 0) {
    const key = daysUntilDue === 1 ? 'invoice.dueInDay' : 'invoice.dueInDays';
    badge = {
      kind: 'due_soon',
      label: tr('invoice.statusOutstanding', 'Outstanding'),
      sublabel: trI(
        key,
        { n: daysUntilDue },
        `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`,
      ),
      daysUntilDue,
    };
  }

  const paymentMethods = buildPaymentOptions(companyId, invoice, bankRow);
  const billTo = resolveClientInvoiceContact(invoice);

  return {
    invoiceNumber: effectiveInvoiceNumber(invoice),
    title: invoice.title || '',
    description: invoice.description || '',
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    currency: invoice.currency || 'DKK',
    subtotal: Number(invoice.subtotal) || 0,
    taxRate: Number(invoice.tax_rate) || 0,
    taxAmount: Number(invoice.tax_amount) || 0,
    total: Number(invoice.total) || 0,
    balance,
    status,
    // Language of this invoice. Consumed by DigitalInvoiceView to pick the
    // right translations regardless of the admin's UI language.
    locale,
    showCompletedDate: Boolean(invoice.show_completed_date),
    paymentTermsResolved,
    client: {
      name: invoice.client_name,
      address: billTo.addressLine || null,
      email: billTo.email || null,
      phone: billTo.phone || null,
    },
    // Sender block. Each field is null when empty so the digital invoice can
    // hide it cleanly — per product spec ("information that is not filled out
    // is just not shown on the invoice"). The country-aware label is included
    // so DK invoices say "CVR no.", DE invoices say "USt-IdNr.", etc.
    company: {
      name: invoice.company_name || null,
      addressLine: [invoice.company_address, invoice.company_zip_code, invoice.company_city]
        .filter(Boolean)
        .join(' \u00b7 ') || null,
      country: invoice.company_country || null,
      countryCode: invoice.company_country_code || null,
      cvr: invoice.company_cvr_number || null,
      cvrLabel: invoice.company_number_label || tr('invoice.companyNoFallback', 'Company no.'),
      vatNumber: invoice.company_vat_number || null,
      email: invoice.company_email || null,
      phone: invoice.company_phone || null,
      website: invoice.company_website || null,
      logoUrl: resolveLogoUrl(invoice.company_logo_url),
    },
    taxLabel: invoice.tax_label || tr('invoice.vatFallback', 'VAT'),
    referenceText:
      invoice.reference_text != null && String(invoice.reference_text).trim() !== ''
        ? String(invoice.reference_text).trim()
        : null,
    lineItems: (invoice.items || []).map((it) => {
      const desc = it.description || it.service_title || '—';
      const completedDate =
        invoice.show_completed_date && it.job_completed_date
          ? formatPdfDate(it.job_completed_date, locale)
          : null;
      return {
        id: it.id,
        description: completedDate ? `${desc} · ${completedDate}` : desc,
        quantity: it.quantity ?? 1,
        unitPrice: Number(it.unit_price) || 0,
        lineTotal: Number(it.line_total) || 0,
      };
    }),
    transactions: (invoice.transactions || []).map((t) => ({
      type: t.type,
      amount: t.amount,
      description: t.description,
      paymentSource: t.payment_source,
      date: t.transaction_date,
    })),
    due: {
      date: dueDateStr,
      daysUntilDue,
      formatted: dueDateStr ? formatPdfDate(dueDateStr, locale) : null,
    },
    badge,
    paymentMethods,
  };
}

module.exports = {
  formatPdfDate,
  buildPaymentOptions,
  buildPublicInvoicePayload,
  replacePaymentTermsPlaceholders,
  effectiveInvoiceNumber,
};
