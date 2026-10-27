/**
 * Offers — draft / send / public accept.
 *
 * Authenticated:
 *   POST   /api/offers
 *   GET    /api/offers
 *   GET    /api/offers/:id
 *   PATCH  /api/offers/:id
 *   POST   /api/offers/:id/send
 *   POST   /api/offers/:id/confirm    { job_id? }   (accepted → booked)
 *   POST   /api/offers/:id/archive | /restore
 *   DELETE /api/offers/:id            (revoke)
 *
 * Public (mounted at /api/public/offers):
 *   GET  /:token                       (?preview=1 skips the "viewed" stamp)
 *   POST /:token/accept   { date? }    creates a *pending* job the admin confirms
 *   POST /:token/decline  { reason? }
 *
 * Item prices are excl. tax, same as invoices; tax_rate is applied on top.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../utils/database');
const mapTool = require('../services/mapTool');
const { sendEmail, STANDARD_FOOTER_PLACEHOLDER } = require('../utils/email');
const { setJobAutoTitleIfEmpty } = require('../utils/jobAutoTitle');
const { ensureItemCatalogSchema } = require('../utils/itemCatalogSchema');
const { ensurePipelineSchema } = require('../utils/pipelineSchema');
const { createNotification } = require('../utils/notifications');
const { scheduleAutomationSendsForJob } = require('../utils/automatedEmails');
const {
  ensureSnapshotColumns,
  taxLabelFor,
  currencyFor,
  invoiceLocaleFor,
  companyNumberLabelFor,
} = require('../utils/invoiceSnapshot');
const {
  formatLocality,
  DEFAULT_COUNTRY_CODE,
  displayLocaleForCountry,
  documentDateLocale,
} = require('../utils/countryRules');

const router = express.Router();
const publicRouter = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DATES = 4;
const MAX_ITEMS = 30;
const DEFAULT_VALID_DAYS = 14;

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

const getActiveCompanyId = (req) => {
  const activeCompanyId = req.user?.activeCompanyId;
  if (!activeCompanyId) return { error: 'No active company found in token', status: 400 };
  return { companyId: activeCompanyId };
};

function getWebAppBaseUrl() {
  const raw =
    process.env.WEB_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.APP_BASE_URL ||
    'http://localhost:3000';
  return String(raw).replace(/\/$/, '');
}

/** Absolute logo URL for emails; null when it can't be made absolute. */
function absoluteLogoUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.API_SERVER_URL || process.env.NEXT_PUBLIC_API_URL || '';
  if (base && (url.startsWith('/api/') || url.startsWith('/uploads/'))) {
    return `${base.replace(/\/$/, '')}${url}`;
  }
  return null;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

let schemaEnsured = false;
async function ensureOffersSchema() {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS offers (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      client_id INTEGER,
      lead_id INTEGER,
      token VARCHAR(64) UNIQUE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      title TEXT,
      message TEXT,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      address TEXT,
      zip_code TEXT,
      city TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      service_minutes INTEGER,
      price NUMERIC,
      proposed_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
      accepted_date DATE,
      accepted_user_id INTEGER,
      created_job_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  const alters = [
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS offer_number INTEGER`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS tax_rate NUMERIC`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS valid_until DATE`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS zip_code TEXT`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS city TEXT`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS accepted_user_id INTEGER`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS created_job_id INTEGER`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS lead_id INTEGER`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS declined_at TIMESTAMP`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS decline_reason TEXT`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP`,
    `ALTER TABLE offers ADD COLUMN IF NOT EXISTS state TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_offers_company ON offers(company_id)`,
    `CREATE INDEX IF NOT EXISTS idx_offers_token ON offers(token)`,
    `CREATE INDEX IF NOT EXISTS idx_offers_lead ON offers(lead_id)`,
  ];
  for (const sql of alters) await pool.query(sql);
  await ensureSnapshotColumns(pool).catch(() => {});
  await ensurePipelineSchema(pool);
  schemaEnsured = true;
}

function sanitizeItems(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const it of raw.slice(0, MAX_ITEMS)) {
    if (!it || typeof it !== 'object') continue;
    const title = String(it.title || '').trim().slice(0, 200);
    if (!title) continue;
    const qty = Number(it.quantity);
    const priceRaw = it.unit_price ?? it.price;
    const unit = priceRaw != null && priceRaw !== '' ? Number(priceRaw) : 0;
    const mins = it.duration_minutes != null && it.duration_minutes !== ''
      ? parseInt(it.duration_minutes, 10)
      : null;
    const sid = it.service_id != null && it.service_id !== '' ? parseInt(it.service_id, 10) : null;
    out.push({
      service_id: Number.isFinite(sid) && sid > 0 ? sid : null,
      title,
      unit_price: Number.isFinite(unit) ? round2(unit) : 0,
      duration_minutes: Number.isFinite(mins) && mins > 0 ? mins : null,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
    });
  }
  return out;
}

function sanitizeProposedDates(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  const out = [];
  const seen = new Set();
  for (const d of raw) {
    if (out.length >= MAX_DATES) break;
    if (d == null) continue;
    const date = String(typeof d === 'string' ? d : d.date || '').slice(0, 10);
    if (!DATE_RE.test(date) || seen.has(date)) continue;
    seen.add(date);
    const userRaw = typeof d === 'object' ? d.user_id : null;
    const userId = userRaw != null && userRaw !== '' ? parseInt(String(userRaw), 10) : null;
    const extra = typeof d === 'object' && d.extra_minutes != null ? Number(d.extra_minutes) : null;
    out.push({
      date,
      user_id: Number.isFinite(userId) ? userId : null,
      user_name: typeof d === 'object' && typeof d.user_name === 'string' ? d.user_name.slice(0, 120) : null,
      extra_minutes: Number.isFinite(extra) ? extra : null,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

function sanitizeTaxRate(raw, fallback) {
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
  return fallback;
}

function sanitizeDate(raw) {
  const s = String(raw || '').slice(0, 10);
  return DATE_RE.test(s) ? s : null;
}

/** null = forever. Omitted on create → default window. */
function resolveValidUntil(raw, { fallbackDefault = false } = {}) {
  if (raw === null || raw === '' || raw === 'forever') return null;
  if (raw === undefined) {
    if (!fallbackDefault) return undefined;
    const d = new Date();
    d.setDate(d.getDate() + DEFAULT_VALID_DAYS);
    return ymd(d);
  }
  return sanitizeDate(raw);
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeItem(it) {
  const qty = Number(it.quantity) > 0 ? Number(it.quantity) : 1;
  const unit = Number(it.unit_price ?? it.price) || 0;
  return {
    service_id: it.service_id || null,
    title: it.title || 'Item',
    quantity: qty,
    unit_price: unit,
    line_total: round2(unit * qty),
    duration_minutes: it.duration_minutes || null,
  };
}

function computeTotals(items, taxRate) {
  const normalized = items.map(normalizeItem);
  const subtotal = round2(normalized.reduce((s, it) => s + it.line_total, 0));
  const rate = Number(taxRate) || 0;
  const taxAmount = round2(subtotal * (rate / 100));
  const minutes = normalized.reduce((s, it) => s + (Number(it.duration_minutes) || 0) * it.quantity, 0);
  return { items: normalized, subtotal, taxRate: rate, taxAmount, total: round2(subtotal + taxAmount), minutes };
}

function publicUrlFor(token) {
  return `${getWebAppBaseUrl()}/o/${token}`;
}

function formatNumber(n) {
  return n != null ? String(n).padStart(4, '0') : '';
}

function recipientName(offer) {
  if (offer.client_name) {
    return `${offer.client_name}${offer.client_last_name ? ` ${offer.client_last_name}` : ''}`.trim();
  }
  return (offer.contact_name || '').trim();
}

async function loadCompany(companyId) {
  const res = await pool.query(
    `SELECT id, name, slug, address, zip_code, city, state, country, country_code, cvr_number,
            vat_number, email, phone, website, logo_url
     FROM companies WHERE id = $1`,
    [companyId]
  );
  return res.rows[0] || null;
}

/** Shape shared by the public page, admin detail and email. */
function buildDocument(offer, company) {
  const countryCode = company?.country_code || DEFAULT_COUNTRY_CODE;
  const totals = computeTotals(parseJsonArray(offer.items), offer.tax_rate);
  const proposed = parseJsonArray(offer.proposed_dates);
  const clientAddress = [
    offer.address,
    formatLocality({ zip: offer.zip_code, city: offer.city, state: offer.state || offer.client_state }, countryCode),
  ].filter(Boolean).join('\n');

  return {
    number: formatNumber(offer.offer_number),
    status: offer.status,
    title: offer.title || totals.items[0]?.title || '',
    message: offer.message || '',
    createdAt: offer.created_at,
    sentAt: offer.sent_at,
    viewedAt: offer.viewed_at,
    validUntil: offer.valid_until,
    acceptedAt: offer.accepted_at,
    acceptedDate: offer.accepted_date,
    confirmedAt: offer.confirmed_at || null,
    declinedAt: offer.declined_at || null,
    locale: invoiceLocaleFor(countryCode),
    moneyLocale: displayLocaleForCountry(countryCode),
    dateLocale: documentDateLocale(countryCode),
    countryCode,
    currency: currencyFor(countryCode),
    taxLabel: taxLabelFor(countryCode),
    taxRate: totals.taxRate,
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    total: totals.total,
    durationMinutes: totals.minutes,
    company: {
      name: company?.name || '',
      address: company?.address || '',
      zipCity: formatLocality({ zip: company?.zip_code, city: company?.city, state: company?.state }, countryCode),
      cvr: company?.cvr_number || '',
      cvrLabel: companyNumberLabelFor(countryCode),
      vatNumber: company?.vat_number || '',
      email: company?.email || '',
      phone: company?.phone || '',
      website: company?.website || '',
      logoUrl: company?.logo_url || '',
    },
    client: {
      name: recipientName(offer),
      address: clientAddress,
      email: offer.client_email || offer.contact_email || '',
      phone: offer.client_phone || offer.contact_phone || '',
    },
    items: totals.items.map((it) => ({
      title: it.title,
      quantity: it.quantity,
      unitPrice: it.unit_price,
      lineTotal: it.line_total,
      durationMinutes: it.duration_minutes,
    })),
    days: proposed.map((d) => ({ date: d.date })),
  };
}

/** Offer + client + the job it created + the lead it came from. */
const OFFER_SELECT = `
  SELECT o.*,
         c.name AS client_name, c.last_name AS client_last_name,
         c.email AS client_email, c.phone AS client_phone, c.state AS client_state,
         j.scheduled_date AS job_date, j.booking_status AS job_booking_status,
         j.status AS job_status, j.assigned_user_id AS job_user_id,
         NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS job_user_name,
         l.created_at AS lead_created_at, l.source AS lead_source
  FROM offers o
  LEFT JOIN clients c ON c.id = o.client_id
  LEFT JOIN jobs j ON j.id = o.created_job_id
  LEFT JOIN users u ON u.id = j.assigned_user_id
  LEFT JOIN leads l ON l.id = o.lead_id AND l.company_id = o.company_id`;

async function loadOffer(companyId, id) {
  const result = await pool.query(`${OFFER_SELECT} WHERE o.id = $1 AND o.company_id = $2`, [id, companyId]);
  return result.rows[0] || null;
}

/** Moves the lead behind an offer forward, never backwards. */
async function advanceLead(db, companyId, leadId, status, clientId) {
  if (!leadId) return;
  const from = status === 'won' ? ['new', 'contacted', 'quoted'] : ['new', 'contacted'];
  await db.query(
    `UPDATE leads
     SET status = CASE WHEN status = ANY($3::text[]) THEN $4 ELSE status END,
         client_id = COALESCE(client_id, $5),
         converted_at = CASE WHEN $5::int IS NOT NULL AND converted_at IS NULL THEN NOW() ELSE converted_at END,
         updated_at = NOW()
     WHERE id = $1 AND company_id = $2`,
    [leadId, companyId, from, status, clientId || null]
  ).catch((e) => console.warn('[offers] lead update failed:', e?.message || e));
}

function listRow(offer) {
  const totals = computeTotals(parseJsonArray(offer.items), offer.tax_rate);
  // pg parses DATE as local midnight; JSON would shift it to the previous day west of UTC+0.
  const day = (v) => (v instanceof Date ? ymd(v) : v);
  return {
    ...offer,
    accepted_date: day(offer.accepted_date),
    valid_until: day(offer.valid_until),
    number: formatNumber(offer.offer_number),
    recipient_name: recipientName(offer),
    total: totals.total,
    public_url: publicUrlFor(offer.token),
  };
}

// ── Email ───────────────────────────────────────────────────────────────────

const EMAIL_UI = {
  en: {
    doc: 'Offer',
    total: 'Total',
    from: 'From',
    to: 'To',
    date: 'Date',
    validUntil: 'Valid until',
    forever: 'No expiry',
    description: 'Description',
    qty: 'Qty',
    amount: 'Amount',
    subtotal: 'Subtotal',
    days: 'Suggested days',
    cta: 'View and accept offer',
    plainLink: 'Or open this link:',
    hello: 'Hi',
    lead: (company) => `Thank you for your interest. Here is your offer from ${company}.`,
    signOff: 'Kind regards',
    subject: (company, num) => `Offer${num ? ` #${num}` : ''} from ${company}`,
    acceptedSubject: (name, num) => `${name || 'A client'} accepted offer${num ? ` #${num}` : ''}`,
    acceptedBody: 'accepted the offer',
    booked: 'Wants',
    confirmHint: 'It’s on your schedule in yellow. Verify the job to make it a normal visit.',
    openInApp: 'Verify job',
    declinedSubject: (name, num) => `${name || 'A client'} declined offer${num ? ` #${num}` : ''}`,
    declinedBody: 'declined the offer',
    confirmedSubject: (company) => `Your booking with ${company} is confirmed`,
    confirmedLead: 'Your booking is confirmed. We look forward to seeing you.',
    when: 'When',
    where: 'Where',
  },
  da: {
    doc: 'Tilbud',
    total: 'Total',
    from: 'Fra',
    to: 'Til',
    date: 'Dato',
    validUntil: 'Gyldigt til',
    forever: 'Uden udløb',
    description: 'Beskrivelse',
    qty: 'Antal',
    amount: 'Beløb',
    subtotal: 'Subtotal',
    days: 'Forslag til dage',
    cta: 'Se og accepter tilbud',
    plainLink: 'Eller åbn dette link:',
    hello: 'Hej',
    lead: (company) => `Tak for din interesse. Her er dit tilbud fra ${company}.`,
    signOff: 'Venlig hilsen',
    subject: (company, num) => `Tilbud${num ? ` #${num}` : ''} fra ${company}`,
    acceptedSubject: (name, num) => `${name || 'En kunde'} har accepteret tilbud${num ? ` #${num}` : ''}`,
    acceptedBody: 'har accepteret tilbuddet',
    booked: 'Ønsker',
    confirmHint: 'Det ligger gult i din kalender. Verificér jobbet for at gøre det til et almindeligt besøg.',
    openInApp: 'Verificér job',
    declinedSubject: (name, num) => `${name || 'En kunde'} har afvist tilbud${num ? ` #${num}` : ''}`,
    declinedBody: 'har afvist tilbuddet',
    confirmedSubject: (company) => `Din booking hos ${company} er bekræftet`,
    confirmedLead: 'Din booking er bekræftet. Vi glæder os til at se dig.',
    when: 'Hvornår',
    where: 'Hvor',
  },
};

const LOCALE_TAG = { en: 'en-GB', da: 'da-DK' };

function moneyFmt(amount, currency, locale) {
  try {
    return new Intl.NumberFormat(LOCALE_TAG[locale] || locale || 'en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0);
  } catch {
    return `${(Number(amount) || 0).toFixed(2)} ${currency}`;
  }
}

function dateFmt(value, locale, opts) {
  if (!value) return '—';
  const s = String(value instanceof Date ? ymd(value) : value).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y) return '—';
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE_TAG[locale] || locale || 'en-GB', opts || {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function buildOfferEmail(doc, link) {
  const ui = EMAIL_UI[doc.locale] || EMAIL_UI.en;
  const money = (n) => escapeHtml(moneyFmt(n, doc.currency, doc.moneyLocale));
  const logo = absoluteLogoUrl(doc.company.logoUrl);
  const company = escapeHtml(doc.company.name);
  const firstName = escapeHtml(String(doc.client.name || '').split(/\s+/)[0] || '');
  const cell = 'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;';
  const label = `font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;margin:0 0 4px;`;

  const rows = doc.items.map((it) => {
    const sub = it.quantity !== 1
      ? `<div style="font-size:12px;color:#9ca3af;margin-top:2px;">${escapeHtml(String(it.quantity))} × ${money(it.unitPrice)}</div>`
      : '';
    return `<tr>
      <td style="padding:12px 0;font-size:14px;color:#374151;border-bottom:1px solid #f3f4f6;${cell}">${escapeHtml(it.title)}${sub}</td>
      <td style="padding:12px 0 12px 16px;font-size:14px;color:#111827;font-weight:500;text-align:right;border-bottom:1px solid #f3f4f6;white-space:nowrap;vertical-align:top;${cell}">${money(it.lineTotal)}</td>
    </tr>`;
  }).join('');

  const taxRow = doc.taxRate > 0
    ? `<tr><td align="right" style="padding:4px 0;font-size:13px;color:#6b7280;${cell}">${escapeHtml(doc.taxLabel)} (${doc.taxRate}%)</td>
         <td align="right" style="padding:4px 0 4px 16px;font-size:13px;color:#111827;white-space:nowrap;${cell}">${money(doc.taxAmount)}</td></tr>`
    : '';

  const daysBlock = doc.days.length
    ? `<div style="margin:0 0 28px;">
        <p style="${label}${cell}">${escapeHtml(ui.days)}</p>
        <div>
          ${doc.days.map((d) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:7px 12px;border-radius:8px;border:1px solid #e5e7eb;background:#ffffff;color:#111827;font-size:13px;font-weight:500;${cell}">${escapeHtml(dateFmt(d.date, doc.dateLocale, { weekday: 'short', day: 'numeric', month: 'short' }))}</span>`).join('')}
        </div>
      </div>`
    : '';

  const lead = doc.message
    ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;${cell}">${escapeHtml(doc.message).replace(/\n/g, '<br>')}</p>`
    : `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;${cell}">${escapeHtml(ui.lead(doc.company.name))}</p>`;

  const offerTitle = doc.number ? `#${escapeHtml(doc.number)}` : escapeHtml(doc.title);

  const inner = `
${logo
    ? `<div style="margin:0 0 28px;"><img src="${escapeHtml(logo)}" alt="${company}" style="max-height:40px;max-width:160px;height:auto;display:block;" /></div>`
    : `<p style="margin:0 0 28px;font-size:15px;font-weight:600;color:#111827;${cell}">${company}</p>`
}
<p style="margin:0 0 6px;font-size:15px;color:#111827;${cell}">${escapeHtml(ui.hello)}${firstName ? ` ${firstName}` : ''},</p>
${lead}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border-collapse:separate;border:1px solid #e5e7eb;border-radius:10px;background:#ffffff;">
  <tr>
    <td style="padding:20px 22px;border-bottom:1px solid #e5e7eb;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:top;">
          <p style="${label}${cell}">${escapeHtml(ui.doc)}</p>
          <p style="margin:0;font-size:20px;font-weight:600;color:#111827;line-height:1.25;${cell}">${offerTitle}</p>
        </td>
        <td align="right" style="vertical-align:top;">
          <p style="${label}${cell}">${escapeHtml(ui.total)}</p>
          <p style="margin:0;font-size:20px;font-weight:600;color:#111827;line-height:1.25;${cell}">${money(doc.total)}</p>
        </td>
      </tr></table>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 22px;border-bottom:1px solid #e5e7eb;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="50%" style="vertical-align:top;padding-right:12px;">
          <p style="${label}${cell}">${escapeHtml(ui.from)}</p>
          <p style="margin:0;font-size:14px;font-weight:500;color:#111827;${cell}">${company}</p>
        </td>
        <td width="50%" style="vertical-align:top;padding-left:12px;">
          <p style="${label}${cell}">${escapeHtml(ui.to)}</p>
          <p style="margin:0;font-size:14px;font-weight:500;color:#111827;${cell}">${escapeHtml(doc.client.name || '—')}</p>
        </td>
      </tr></table>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 22px;border-bottom:1px solid #e5e7eb;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="50%" style="vertical-align:top;padding-right:12px;">
          <p style="${label}${cell}">${escapeHtml(ui.date)}</p>
          <p style="margin:0;font-size:14px;color:#374151;${cell}">${escapeHtml(dateFmt(doc.sentAt || doc.createdAt, doc.dateLocale))}</p>
        </td>
        <td width="50%" style="vertical-align:top;padding-left:12px;">
          <p style="${label}${cell}">${escapeHtml(ui.validUntil)}</p>
          <p style="margin:0;font-size:14px;color:#374151;${cell}">${escapeHtml(doc.validUntil ? dateFmt(doc.validUntil, doc.dateLocale) : ui.forever)}</p>
        </td>
      </tr></table>
    </td>
  </tr>
  <tr>
    <td style="padding:8px 22px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb;${cell}">${escapeHtml(ui.description)}</td>
          <td align="right" style="padding:8px 0;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb;width:110px;${cell}">${escapeHtml(ui.amount)}</td>
        </tr>
        ${rows}
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 22px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${doc.taxRate > 0 ? `<tr><td align="right" style="padding:4px 0;font-size:13px;color:#6b7280;${cell}">${escapeHtml(ui.subtotal)}</td><td align="right" style="padding:4px 0 4px 16px;font-size:13px;color:#111827;white-space:nowrap;${cell}">${money(doc.subtotal)}</td></tr>` : ''}
        ${taxRow}
        <tr>
          <td align="right" style="padding:12px 0 0;font-size:14px;font-weight:600;color:#111827;border-top:1px solid #e5e7eb;${cell}">${escapeHtml(ui.total)}</td>
          <td align="right" style="padding:12px 0 0 16px;font-size:16px;font-weight:600;color:#111827;border-top:1px solid #e5e7eb;white-space:nowrap;${cell}">${money(doc.total)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

${daysBlock}

<div style="margin:0 0 28px;text-align:center;">
  <a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 28px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;${cell}">${escapeHtml(ui.cta)}</a>
  <p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;${cell}">${escapeHtml(ui.plainLink)}<br/><span style="color:#6b7280;word-break:break-all;">${escapeHtml(link)}</span></p>
</div>

<p style="margin:0;font-size:14px;line-height:1.55;color:#374151;${cell}">${escapeHtml(ui.signOff)}<br/><strong style="color:#111827;">${company}</strong></p>`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fafafa;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:separate;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;background:#ffffff;">
      <tr><td style="padding:32px 28px;${cell}font-size:15px;color:#111827;">
        ${inner}
        ${STANDARD_FOOTER_PLACEHOLDER}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = [
    `${ui.hello}${firstName ? ` ${doc.client.name.split(/\s+/)[0]}` : ''},`,
    '',
    doc.message || ui.lead(doc.company.name),
    '',
    ...doc.items.map((it) => `${it.quantity !== 1 ? `${it.quantity} × ` : ''}${it.title} — ${moneyFmt(it.lineTotal, doc.currency, doc.moneyLocale)}`),
    '',
    `${ui.total}: ${moneyFmt(doc.total, doc.currency, doc.moneyLocale)}`,
    '',
    `${ui.cta}: ${link}`,
  ].join('\n');

  return { html, text, subject: ui.subject(doc.company.name, doc.number) };
}

async function sendOfferEmail(offer, company, toOverride) {
  const to = String(toOverride || offer.client_email || offer.contact_email || '').trim();
  if (!to) return { sent: false, error: 'No email address' };
  const doc = buildDocument(offer, company);
  const { html, text, subject } = buildOfferEmail(doc, publicUrlFor(offer.token));
  await sendEmail({ to, subject, html, text, companyId: offer.company_id, fromName: company?.name || undefined });
  return { sent: true, to };
}

function pipelineLink(company, offerId) {
  const slug = company?.slug ? `/${company.slug}` : '';
  return `${getWebAppBaseUrl()}${slug}/offers?id=${offerId}`;
}

async function notifyCompanyAccepted(offer, company, chosenDate) {
  const to = String(company?.email || '').trim();
  if (!to) return;
  const doc = buildDocument({ ...offer, status: 'accepted', accepted_date: chosenDate }, company);
  const ui = EMAIL_UI[doc.locale] || EMAIL_UI.en;
  const name = doc.client.name || '';
  const when = chosenDate ? `${ui.booked} ${dateFmt(chosenDate, doc.dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })}` : '';
  const link = pipelineLink(company, offer.id);
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#111827;">
    <p style="margin:0 0 8px;"><strong>${escapeHtml(name)}</strong> ${escapeHtml(ui.acceptedBody)}${doc.number ? ` #${escapeHtml(doc.number)}` : ''}.</p>
    <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#193434;">${escapeHtml(moneyFmt(doc.total, doc.currency, doc.moneyLocale))}</p>
    ${when ? `<p style="margin:0 0 6px;color:#374151;">${escapeHtml(when)}</p>` : ''}
    <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">${escapeHtml(ui.confirmHint)}</p>
    <a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 20px;background:#193434;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(ui.openInApp)}</a>
  </div>`;
  await sendEmail({
    to,
    subject: ui.acceptedSubject(name, doc.number),
    html,
    text: `${name} ${ui.acceptedBody}. ${when}\n${ui.confirmHint}\n${link}`.trim(),
    companyId: offer.company_id,
    skipFooter: true,
  });
}

async function notifyCompanyDeclined(offer, company, reason) {
  const to = String(company?.email || '').trim();
  if (!to) return;
  const doc = buildDocument(offer, company);
  const ui = EMAIL_UI[doc.locale] || EMAIL_UI.en;
  const name = doc.client.name || '';
  const link = pipelineLink(company, offer.id);
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#111827;">
    <p style="margin:0 0 8px;"><strong>${escapeHtml(name)}</strong> ${escapeHtml(ui.declinedBody)}${doc.number ? ` #${escapeHtml(doc.number)}` : ''}.</p>
    ${reason ? `<p style="margin:0 0 16px;padding:10px 14px;border-left:3px solid #e5e7eb;color:#374151;">${escapeHtml(reason)}</p>` : ''}
    <a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 20px;background:#193434;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">PathPilo</a>
  </div>`;
  await sendEmail({
    to,
    subject: ui.declinedSubject(name, doc.number),
    html,
    text: `${name} ${ui.declinedBody}. ${reason || ''}\n${link}`.trim(),
    companyId: offer.company_id,
    skipFooter: true,
  });
}

async function sendBookingConfirmedEmail(offer, company, jobDate) {
  const to = String(offer.client_email || offer.contact_email || '').trim();
  if (!to) return false;
  const doc = buildDocument(offer, company);
  const ui = EMAIL_UI[doc.locale] || EMAIL_UI.en;
  const firstName = escapeHtml(String(doc.client.name || '').split(/\s+/)[0] || '');
  const logo = absoluteLogoUrl(doc.company.logoUrl);
  const when = jobDate ? dateFmt(jobDate, doc.dateLocale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const where = doc.client.address.replace(/\n/g, ', ');
  const label = 'font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;';
  const inner = `
${logo ? `<div style="margin:0 0 18px;"><img src="${escapeHtml(logo)}" alt="${escapeHtml(doc.company.name)}" style="max-height:48px;max-width:180px;height:auto;display:block;" /></div>` : ''}
<p style="margin:0 0 10px;font-size:16px;color:#111827;">${escapeHtml(ui.hello)}${firstName ? ` <strong>${firstName}</strong>` : ''},</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;">${escapeHtml(ui.confirmedLead)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;border:1px solid #e5e7eb;border-radius:12px;">
  ${when ? `<tr><td style="padding:14px 18px;border-bottom:1px solid #f3f4f6;"><div style="${label}">${escapeHtml(ui.when)}</div><div style="font-size:15px;font-weight:700;color:#111827;">${escapeHtml(when)}</div></td></tr>` : ''}
  ${where ? `<tr><td style="padding:14px 18px;border-bottom:1px solid #f3f4f6;"><div style="${label}">${escapeHtml(ui.where)}</div><div style="font-size:14px;color:#111827;">${escapeHtml(where)}</div></td></tr>` : ''}
  <tr><td style="padding:14px 18px;"><div style="${label}">${escapeHtml(ui.total)}</div><div style="font-size:15px;font-weight:600;color:#111827;">${escapeHtml(moneyFmt(doc.total, doc.currency, doc.moneyLocale))}</div></td></tr>
</table>
<p style="margin:0;font-size:14px;line-height:1.55;color:#111827;">${escapeHtml(ui.signOff)}<br/><strong>${escapeHtml(doc.company.name)}</strong></p>`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-radius:10px;border:1px solid #e4e4e7;background:#fff;">
    <tr><td style="padding:24px 22px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">${inner}${STANDARD_FOOTER_PLACEHOLDER}</td></tr>
  </table>
</td></tr></table></body></html>`;
  await sendEmail({
    to,
    subject: ui.confirmedSubject(doc.company.name),
    html,
    text: `${ui.confirmedLead}\n${when}\n${where}`.trim(),
    companyId: offer.company_id,
    fromName: company?.name || undefined,
  });
  return true;
}

function notificationMeta(offer, extra = {}) {
  return {
    name: recipientName(offer) || offer.contact_name || '',
    number: formatNumber(offer.offer_number),
    total: computeTotals(parseJsonArray(offer.items), offer.tax_rate).total,
    ...extra,
  };
}

// ── Authenticated routes ────────────────────────────────────────────────────
router.use(authenticateToken);

function readBody(body, existing) {
  const pick = (key, fallback) => (body[key] !== undefined ? body[key] : fallback);
  return {
    client_id: pick('client_id', existing?.client_id ?? null) || null,
    contact_name: String(pick('contact_name', existing?.contact_name ?? '') || '').trim() || null,
    contact_email: String(pick('contact_email', existing?.contact_email ?? '') || '').trim() || null,
    contact_phone: String(pick('contact_phone', existing?.contact_phone ?? '') || '').trim() || null,
    address: pick('address', existing?.address ?? null) || null,
    zip_code: pick('zip_code', existing?.zip_code ?? null) || null,
    city: pick('city', existing?.city ?? null) || null,
    state: String(pick('state', existing?.state ?? '') || '').trim().slice(0, 40) || null,
    lat: Number.isFinite(Number(pick('lat', existing?.lat))) && pick('lat', existing?.lat) != null ? Number(pick('lat', existing?.lat)) : null,
    lng: Number.isFinite(Number(pick('lng', existing?.lng))) && pick('lng', existing?.lng) != null ? Number(pick('lng', existing?.lng)) : null,
    message: String(pick('message', existing?.message ?? '') || '').trim() || null,
  };
}

router.post('/', async (req, res) => {
  try {
    await ensureOffersSchema();
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;

    const body = req.body || {};
    const items = sanitizeItems(body.items);
    if (!items || items.length === 0) return res.status(400).json({ error: 'Add at least one item' });
    const dates = sanitizeProposedDates(body.proposed_dates);
    if (dates == null) return res.status(400).json({ error: 'Invalid dates' });

    const fields = readBody(body, null);
    if (!fields.client_id && !fields.contact_name) {
      return res.status(400).json({ error: 'Pick a client or add a name' });
    }
    if (fields.client_id) {
      const check = await pool.query('SELECT id FROM clients WHERE id = $1 AND company_id = $2', [fields.client_id, companyId]);
      if (check.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    }
    let leadId = null;
    if (body.lead_id != null && body.lead_id !== '') {
      const check = await pool.query('SELECT id FROM leads WHERE id = $1 AND company_id = $2', [body.lead_id, companyId]);
      if (check.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
      leadId = check.rows[0].id;
    }

    const taxRate = sanitizeTaxRate(body.tax_rate, 0);
    const totals = computeTotals(items, taxRate);
    const validUntil = resolveValidUntil(body.valid_until, { fallbackDefault: true });
    const title = String(body.title || items[0].title).trim().slice(0, 200);
    const status = body.status === 'sent' ? 'sent' : 'draft';

    const numberRes = await pool.query(
      'SELECT COALESCE(MAX(offer_number), 0) + 1 AS next FROM offers WHERE company_id = $1',
      [companyId]
    );
    const offerNumber = Number(numberRes.rows[0]?.next) || 1;
    const token = crypto.randomBytes(24).toString('hex');

    const result = await pool.query(
      `INSERT INTO offers
         (company_id, client_id, token, status, title, message,
          contact_name, contact_email, contact_phone,
          address, zip_code, city, lat, lng,
          service_minutes, price, items, proposed_dates,
          offer_number, tax_rate, valid_until, sent_at, lead_id, state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19,$20,$21,
               CASE WHEN $22::boolean THEN NOW() ELSE NULL END, $23, $24)
       RETURNING *`,
      [
        companyId, fields.client_id, token, status, title, fields.message,
        fields.contact_name, fields.contact_email, fields.contact_phone,
        fields.address, fields.zip_code, fields.city, fields.lat, fields.lng,
        totals.minutes || null, totals.total, JSON.stringify(items), JSON.stringify(dates),
        offerNumber, taxRate, validUntil, status === 'sent', leadId, fields.state,
      ]
    );

    await advanceLead(pool, companyId, leadId, 'quoted', fields.client_id);
    const offer = await loadOffer(companyId, result.rows[0].id);
    res.status(201).json({ offer: listRow(offer) });
  } catch (error) {
    console.error('Error creating offer:', error);
    res.status(500).json({ error: 'Failed to create offer' });
  }
});

router.get('/', async (req, res) => {
  try {
    await ensureOffersSchema();
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });

    // ?all=1 includes withdrawn and archived offers (the pipeline's archive).
    const params = [companyAccess.companyId];
    let where = req.query.all === '1'
      ? 'o.company_id = $1'
      : 'o.company_id = $1 AND o.status != \'revoked\' AND o.archived_at IS NULL';
    if (req.query.client_id) {
      params.push(parseInt(String(req.query.client_id), 10));
      where += ` AND o.client_id = $${params.length}`;
    }

    const result = await pool.query(
      `${OFFER_SELECT}
       WHERE ${where}
       ORDER BY o.created_at DESC
       LIMIT 500`,
      params
    );
    res.json({ offers: result.rows.map(listRow) });
  } catch (error) {
    console.error('Error listing offers:', error);
    res.status(500).json({ error: 'Failed to list offers' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await ensureOffersSchema();
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const offer = await loadOffer(companyAccess.companyId, req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    const company = await loadCompany(companyAccess.companyId);
    res.json({ offer: listRow(offer), document: buildDocument(offer, company) });
  } catch (error) {
    console.error('Error fetching offer:', error);
    res.status(500).json({ error: 'Failed to fetch offer' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    await ensureOffersSchema();
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const existing = await loadOffer(companyAccess.companyId, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Offer not found' });
    if (existing.status === 'accepted') return res.status(409).json({ error: 'Accepted offers cannot be edited' });

    const body = req.body || {};
    const items = body.items !== undefined ? sanitizeItems(body.items) : parseJsonArray(existing.items);
    if (!items || items.length === 0) return res.status(400).json({ error: 'Add at least one item' });
    const dates = body.proposed_dates !== undefined
      ? sanitizeProposedDates(body.proposed_dates)
      : parseJsonArray(existing.proposed_dates);
    if (dates == null) return res.status(400).json({ error: 'Invalid dates' });

    const fields = readBody(body, existing);
    if (!fields.client_id && !fields.contact_name) {
      return res.status(400).json({ error: 'Pick a client or add a name' });
    }
    const taxRate = body.tax_rate !== undefined ? sanitizeTaxRate(body.tax_rate, 0) : Number(existing.tax_rate) || 0;
    const totals = computeTotals(items, taxRate);
    const validUntil = body.valid_until !== undefined
      ? resolveValidUntil(body.valid_until)
      : existing.valid_until;
    const status = body.status === 'sent' ? 'sent' : body.status === 'draft' ? 'draft' : existing.status;

    await pool.query(
      `UPDATE offers SET
         client_id = $1, title = $2, message = $3,
         contact_name = $4, contact_email = $5, contact_phone = $6,
         address = $7, zip_code = $8, city = $9, lat = $10, lng = $11,
         service_minutes = $12, price = $13, items = $14::jsonb, proposed_dates = $15::jsonb,
         tax_rate = $16, valid_until = $17, status = $18::text,
         sent_at = CASE WHEN $18::text = 'sent' AND sent_at IS NULL THEN NOW() ELSE sent_at END,
         declined_at = CASE WHEN $18::text = 'declined' THEN declined_at ELSE NULL END,
         state = $21,
         updated_at = NOW()
       WHERE id = $19 AND company_id = $20`,
      [
        fields.client_id, String(body.title || items[0].title).slice(0, 200), fields.message,
        fields.contact_name, fields.contact_email, fields.contact_phone,
        fields.address, fields.zip_code, fields.city, fields.lat, fields.lng,
        totals.minutes || null, totals.total, JSON.stringify(items), JSON.stringify(dates),
        taxRate, validUntil, status,
        existing.id, companyAccess.companyId, fields.state,
      ]
    );
    const offer = await loadOffer(companyAccess.companyId, existing.id);
    res.json({ offer: listRow(offer) });
  } catch (error) {
    console.error('Error updating offer:', error);
    res.status(500).json({ error: 'Failed to update offer' });
  }
});

router.post('/:id/send', async (req, res) => {
  try {
    await ensureOffersSchema();
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const offer = await loadOffer(companyAccess.companyId, req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.status === 'accepted') return res.status(409).json({ error: 'Offer already accepted' });

    const toOverride = String(req.body?.to || '').trim() || null;
    const company = await loadCompany(companyAccess.companyId);
    const sentAt = offer.sent_at || new Date();
    let result;
    try {
      result = await sendOfferEmail({ ...offer, sent_at: sentAt, contact_email: toOverride || offer.contact_email }, company, toOverride);
    } catch (err) {
      console.error('Error sending offer email:', err?.message || err);
      return res.status(502).json({ error: 'Email could not be sent' });
    }
    if (!result.sent) return res.status(400).json({ error: result.error });

    await pool.query(
      `UPDATE offers SET status = 'sent', sent_at = COALESCE(sent_at, NOW()), declined_at = NULL,
              archived_at = NULL, updated_at = NOW(),
              contact_email = COALESCE($2, contact_email)
       WHERE id = $1`,
      [offer.id, toOverride]
    );
    await advanceLead(pool, companyAccess.companyId, offer.lead_id, 'quoted', offer.client_id);
    const updated = await loadOffer(companyAccess.companyId, offer.id);
    res.json({ offer: listRow(updated), emailed: result.to });
  } catch (error) {
    console.error('Error sending offer:', error);
    res.status(500).json({ error: 'Failed to send offer' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await ensureOffersSchema();
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const result = await pool.query(
      `UPDATE offers SET status = 'revoked', updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status != 'accepted'
       RETURNING id`,
      [req.params.id, companyAccess.companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Offer not found or already accepted' });
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting offer:', error);
    res.status(500).json({ error: 'Failed to delete offer' });
  }
});

/**
 * Final admin check. With a pending job: books it (automations + client email).
 * Without one (accepted with no day): links the job the admin just created.
 */
router.post('/:id/confirm', async (req, res) => {
  try {
    await ensureOffersSchema();
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const offer = await loadOffer(companyId, req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.status !== 'accepted') return res.status(409).json({ error: 'Only accepted offers can be confirmed' });
    if (offer.confirmed_at) {
      return res.json({ offer: listRow(offer), alreadyConfirmed: true });
    }

    const jobGone = !offer.job_status || ['deleted', 'cancelled'].includes(offer.job_status);
    let jobId = offer.created_job_id && !jobGone ? offer.created_job_id : null;
    const fromOffer = !!jobId;
    if (!jobId) {
      const linkId = parseInt(String(req.body?.job_id || ''), 10);
      if (!Number.isFinite(linkId)) return res.status(400).json({ error: 'Schedule a job first' });
      const check = await pool.query('SELECT id FROM jobs WHERE id = $1 AND company_id = $2', [linkId, companyId]);
      if (check.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
      jobId = linkId;
    }

    const jobRes = await pool.query(
      `UPDATE jobs SET booking_status = NULL, offer_id = $3, updated_at = NOW()
       WHERE id = $1 AND company_id = $2
       RETURNING id, scheduled_date, booking_status`,
      [jobId, companyId, offer.id]
    );
    const job = jobRes.rows[0];
    if (!job) return res.status(404).json({ error: 'Job not found' });

    await pool.query(
      `UPDATE offers SET confirmed_at = NOW(), created_job_id = $2, updated_at = NOW() WHERE id = $1`,
      [offer.id, jobId]
    );
    await advanceLead(pool, companyId, offer.lead_id, 'won', offer.client_id);

    // Reminders now apply; our own confirmation replaces the generic "job created" email.
    const notify = req.body?.notify !== false && fromOffer;
    await scheduleAutomationSendsForJob(pool, companyId, jobId);
    let emailed = false;
    if (notify) {
      const company = await loadCompany(companyId);
      emailed = await sendBookingConfirmedEmail(offer, company, job.scheduled_date).catch((e) => {
        console.warn('[offers] confirmation email failed:', e?.message || e);
        return false;
      });
      if (emailed) {
        await pool.query(
          `DELETE FROM scheduled_automation_sends
           WHERE job_id = $1 AND company_id = $2 AND automation_key = 'email_job_created'`,
          [jobId, companyId]
        ).catch(() => {});
      }
    }

    mapTool.invalidateCompany(companyId);
    const updated = await loadOffer(companyId, offer.id);
    res.json({ offer: listRow(updated), emailed });
  } catch (error) {
    console.error('Error confirming offer:', error);
    res.status(500).json({ error: 'Failed to confirm booking' });
  }
});

router.post('/:id/archive', async (req, res) => {
  try {
    await ensureOffersSchema();
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const result = await pool.query(
      `UPDATE offers SET archived_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND company_id = $2
         AND NOT (status = 'accepted' AND confirmed_at IS NULL)
       RETURNING id`,
      [req.params.id, companyAccess.companyId]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Confirm or cancel the booking before archiving' });
    }
    const offer = await loadOffer(companyAccess.companyId, req.params.id);
    res.json({ offer: listRow(offer) });
  } catch (error) {
    console.error('Error archiving offer:', error);
    res.status(500).json({ error: 'Failed to archive offer' });
  }
});

router.post('/:id/restore', async (req, res) => {
  try {
    await ensureOffersSchema();
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const result = await pool.query(
      `UPDATE offers
       SET archived_at = NULL,
           status = CASE WHEN status = 'revoked' THEN 'draft' ELSE status END,
           updated_at = NOW()
       WHERE id = $1 AND company_id = $2
       RETURNING id`,
      [req.params.id, companyAccess.companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Offer not found' });
    const offer = await loadOffer(companyAccess.companyId, req.params.id);
    res.json({ offer: listRow(offer) });
  } catch (error) {
    console.error('Error restoring offer:', error);
    res.status(500).json({ error: 'Failed to restore offer' });
  }
});

// ── Public token routes ─────────────────────────────────────────────────────

async function findOfferByToken(token) {
  await ensureOffersSchema();
  const result = await pool.query(
    `SELECT o.*, c.name AS client_name, c.last_name AS client_last_name,
            c.email AS client_email, c.phone AS client_phone
     FROM offers o
     LEFT JOIN clients c ON c.id = o.client_id
     WHERE o.token = $1`,
    [token]
  );
  return result.rows[0] || null;
}

publicRouter.get('/:token', async (req, res) => {
  try {
    const offer = await findOfferByToken(String(req.params.token));
    if (!offer || offer.status === 'revoked') return res.status(404).json({ error: 'Offer not found' });

    if (req.query.preview !== '1' && !offer.viewed_at && offer.status === 'sent') {
      await pool.query(
        'UPDATE offers SET viewed_at = NOW() WHERE id = $1 AND viewed_at IS NULL',
        [offer.id]
      );
    }
    const company = await loadCompany(offer.company_id);
    res.json({ document: buildDocument(offer, company) });
  } catch (error) {
    console.error('Error fetching public offer:', error);
    res.status(500).json({ error: 'Failed to fetch offer' });
  }
});

publicRouter.post('/:token/accept', async (req, res) => {
  try {
    const offer = await findOfferByToken(String(req.params.token));
    if (!offer || offer.status === 'revoked') return res.status(404).json({ error: 'Offer not found' });
    if (offer.status === 'accepted') {
      return res.status(409).json({ error: 'Offer already accepted', accepted_date: offer.accepted_date });
    }
    if (offer.valid_until && String(offer.valid_until instanceof Date ? ymd(offer.valid_until) : offer.valid_until).slice(0, 10) < ymd(new Date())) {
      return res.status(410).json({ error: 'This offer has expired' });
    }

    const proposed = parseJsonArray(offer.proposed_dates);
    const items = parseJsonArray(offer.items).map(normalizeItem);
    let chosen = null;
    if (proposed.length > 0) {
      const chosenDate = String(req.body?.date || '').slice(0, 10);
      chosen = proposed.find((d) => d.date === chosenDate) || null;
      if (!chosen) return res.status(400).json({ error: 'Pick one of the suggested days' });
    }

    // Schema DDL takes table locks; running it inside the transaction below deadlocks against our own inserts.
    if (chosen) await ensureItemCatalogSchema(pool);

    const dbClient = await pool.connect();
    let jobId = null;
    let clientId = offer.client_id;
    try {
      await dbClient.query('BEGIN');

      if (!clientId) {
        const clientResult = await dbClient.query(
          `INSERT INTO clients
             (company_id, name, client_type, address, zip_code, city, email, phone, lat, lng, state)
           VALUES ($1, $2, 'person', $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id`,
          [
            offer.company_id, offer.contact_name || 'New client',
            offer.address, offer.zip_code, offer.city,
            offer.contact_email, offer.contact_phone,
            offer.lat, offer.lng, offer.state || null,
          ]
        );
        clientId = clientResult.rows[0].id;
      }

      if (chosen) {
        const assignedUserId = chosen.user_id || null;
        const maxSortResult = await dbClient.query(
          `SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM jobs
           WHERE company_id = $1
             AND scheduled_date IS NOT DISTINCT FROM $2
             AND assigned_user_id IS NOT DISTINCT FROM $3`,
          [offer.company_id, chosen.date, assignedUserId]
        );
        const nextSortOrder = (maxSortResult.rows[0]?.max_sort || 0) + 1;

        const jobResult = await dbClient.query(
          `INSERT INTO jobs
             (company_id, client_id, assigned_user_id, title, scheduled_date, sort_order, lat, lng,
              booking_status, offer_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
           RETURNING id`,
          [
            offer.company_id, clientId, assignedUserId,
            offer.title || items[0]?.title || 'Offer',
            chosen.date, nextSortOrder, offer.lat, offer.lng, offer.id,
          ]
        );
        jobId = jobResult.rows[0].id;

        for (const it of items) {
          if (it.service_id) {
            await dbClient.query(
              `INSERT INTO job_services (job_id, service_id, custom_price, custom_duration_minutes, quantity, status)
               VALUES ($1, $2, $3, $4, $5, 'scheduled')`,
              [jobId, it.service_id, it.unit_price, it.duration_minutes, it.quantity]
            );
          } else {
            await dbClient.query(
              `INSERT INTO job_services (job_id, custom_title, custom_price, custom_duration_minutes, quantity, status)
               VALUES ($1, $2, $3, $4, $5, 'scheduled')`,
              [jobId, it.title, it.unit_price, it.duration_minutes, it.quantity]
            );
          }
        }
        await setJobAutoTitleIfEmpty(dbClient, jobId);
      }

      await dbClient.query(
        `UPDATE offers
         SET status = 'accepted', accepted_date = $1, accepted_user_id = $2,
             created_job_id = $3, client_id = $4, accepted_at = NOW(),
             viewed_at = COALESCE(viewed_at, NOW()), updated_at = NOW()
         WHERE id = $5`,
        [chosen?.date || null, chosen?.user_id || null, jobId, clientId, offer.id]
      );
      await dbClient.query('COMMIT');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      dbClient.release();
    }

    mapTool.invalidateCompany(offer.company_id);
    advanceLead(pool, offer.company_id, offer.lead_id, 'quoted', clientId);
    createNotification(pool, {
      companyId: offer.company_id,
      type: 'offer.accepted',
      entityType: 'offer',
      entityId: offer.id,
      meta: notificationMeta(offer, { date: chosen?.date || null, job_id: jobId }),
    });
    loadCompany(offer.company_id)
      .then((company) => notifyCompanyAccepted(offer, company, chosen?.date || null))
      .catch((e) => console.warn('[offers] accept notify failed:', e?.message || e));

    res.json({ accepted: true, date: chosen?.date || null });
  } catch (error) {
    console.error('Error accepting offer:', error);
    res.status(500).json({ error: 'Failed to accept offer' });
  }
});

publicRouter.post('/:token/decline', async (req, res) => {
  try {
    const offer = await findOfferByToken(String(req.params.token));
    if (!offer || offer.status === 'revoked') return res.status(404).json({ error: 'Offer not found' });
    if (offer.status === 'accepted') return res.status(409).json({ error: 'Offer already accepted' });
    if (offer.status === 'declined') return res.json({ declined: true });

    const reason = String(req.body?.reason || '').trim().slice(0, 1000) || null;
    await pool.query(
      `UPDATE offers SET status = 'declined', declined_at = NOW(), decline_reason = $2,
              viewed_at = COALESCE(viewed_at, NOW()), updated_at = NOW()
       WHERE id = $1`,
      [offer.id, reason]
    );
    createNotification(pool, {
      companyId: offer.company_id,
      type: 'offer.declined',
      entityType: 'offer',
      entityId: offer.id,
      meta: notificationMeta(offer, { reason }),
    });
    loadCompany(offer.company_id)
      .then((company) => notifyCompanyDeclined(offer, company, reason))
      .catch((e) => console.warn('[offers] decline notify failed:', e?.message || e));

    res.json({ declined: true });
  } catch (error) {
    console.error('Error declining offer:', error);
    res.status(500).json({ error: 'Failed to decline offer' });
  }
});

module.exports = router;
module.exports.publicRouter = publicRouter;
