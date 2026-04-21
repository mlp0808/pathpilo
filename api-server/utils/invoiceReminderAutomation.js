const crypto = require('crypto');
const { DateTime } = require('luxon');
const { normalizeCompanyTimezone } = require('./companyTimezone');
const { sendEmail } = require('./email');
const { buildInvoiceCustomerEmailPayload, getWebAppBaseUrl } = require('./invoiceEmail');
const { getInvoiceDueReminderDefaults } = require('./companyInvoiceEmailLocale');

let schemaEnsured = false;

function normalizeDateYmd(d) {
  if (d == null) return null;
  const s = String(d).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/** Same anchor as job day reminder: midnight on due date (company TZ) minus lead hours. */
function computeDueReminderSendAt(dueDateYmd, leadHours, countryCode, companyTimezone) {
  const ymd = normalizeDateYmd(dueDateYmd);
  if (!ymd) return null;
  const zone = normalizeCompanyTimezone(companyTimezone, countryCode);
  const midnight = DateTime.fromISO(`${ymd}T00:00:00`, { zone });
  if (!midnight.isValid) return null;
  return midnight.minus({ hours: Number(leadHours) }).toJSDate();
}

async function ensureInvoicePublicTokensTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_public_tokens (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
      token VARCHAR(128) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function getOrCreateInvoicePublicToken(pool, invoiceId) {
  await ensureInvoicePublicTokensTable(pool);
  const existing = await pool.query('SELECT token FROM invoice_public_tokens WHERE invoice_id = $1', [invoiceId]);
  if (existing.rows.length > 0) return existing.rows[0].token;
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO invoice_public_tokens (invoice_id, token) VALUES ($1, $2)', [invoiceId, token]);
  return token;
}

async function ensureInvoiceReminderSchema(pool) {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scheduled_invoice_reminder_sends (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      send_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, invoice_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automated_invoice_email_sends (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      automation_key VARCHAR(100) NOT NULL DEFAULT 'email_invoice_due_reminder',
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, invoice_id, automation_key)
    )
  `);
  // Tracks the timestamp of the most recent *manual* reminder nudge for the invoice.
  // Kept separate from automation tracking so sending a manual notification never
  // consumes or cancels the one scheduled automated reminder.
  await pool.query(`
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_manual_reminder_at TIMESTAMPTZ
  `);
  schemaEnsured = true;
}

async function loadInvoiceReminderSettings(pool, companyId) {
  const result = await pool.query(
    `SELECT enabled, lead_value, lead_unit
     FROM email_automation_settings
     WHERE company_id = $1 AND automation_key = 'email_invoice_due_reminder'`,
    [companyId]
  );
  const row = result.rows[0];
  const raw = Number(row?.lead_value);
  const leadValue = Number.isFinite(raw) ? Math.max(0, raw) : 48;
  const leadUnit = row?.lead_unit === 'minutes' ? 'minutes' : 'hours';
  return {
    enabled: !!row?.enabled,
    lead_value: leadUnit === 'hours' ? leadValue : Math.max(0, Math.ceil(leadValue / 60)),
    lead_unit: 'hours',
  };
}

async function computeInvoiceBalance(pool, invoiceId, total) {
  const t = Number(total) || 0;
  try {
    const tr = await pool.query(
      `SELECT type, amount FROM invoice_transactions WHERE invoice_id = $1`,
      [invoiceId]
    );
    let sumCharges = 0;
    let sumPayments = 0;
    for (const row of tr.rows || []) {
      const a = Number(row.amount) || 0;
      if (row.type === 'charge') sumCharges += a;
      else if (row.type === 'payment') sumPayments += a;
    }
    return Math.round((t + sumCharges - sumPayments) * 100) / 100;
  } catch {
    return t;
  }
}

function applyInvoiceNumberTokens(template, invoiceNumber) {
  return String(template || '').replace(/\{invoice_number\}/g, String(invoiceNumber ?? ''));
}

/**
 * Schedule a one-time due-date reminder (if automation enabled, client has email, unpaid, send time in future).
 */
async function scheduleInvoiceDueReminder(pool, companyId, invoiceId) {
  try {
    await ensureInvoiceReminderSchema(pool);
    const settings = await loadInvoiceReminderSettings(pool, companyId);
    if (!settings.enabled) return;

    const invRes = await pool.query(
      `SELECT i.id, i.status, i.due_date, i.total, i.invoice_number,
              COALESCE(NULLIF(TRIM(c.billing_email), ''), NULLIF(TRIM(c.email), ''), '') AS client_email,
              co.country_code, co.timezone
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       JOIN companies co ON co.id = i.company_id
       WHERE i.id = $1 AND i.company_id = $2`,
      [invoiceId, companyId]
    );
    if (invRes.rows.length === 0) return;
    const inv = invRes.rows[0];
    const st = inv.status || 'draft';
    if (st !== 'sent' && st !== 'overdue') return;
    if (!inv.client_email) return;

    const balance = await computeInvoiceBalance(pool, invoiceId, inv.total);
    if (balance <= 0) return;

    const sentRes = await pool.query(
      `SELECT 1 FROM automated_invoice_email_sends
       WHERE company_id = $1 AND invoice_id = $2 AND automation_key = 'email_invoice_due_reminder'`,
      [companyId, invoiceId]
    );
    if (sentRes.rows.length > 0) return;

    const leadHours = settings.lead_value;
    const sendAt = computeDueReminderSendAt(
      inv.due_date,
      leadHours,
      inv.country_code,
      inv.timezone
    );
    const now = new Date();
    if (!sendAt || sendAt <= now) return;

    await pool.query(
      `INSERT INTO scheduled_invoice_reminder_sends (company_id, invoice_id, send_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (company_id, invoice_id)
       DO UPDATE SET send_at = EXCLUDED.send_at`,
      [companyId, invoiceId, sendAt]
    );
  } catch (err) {
    console.error('scheduleInvoiceDueReminder', invoiceId, err.message || err);
  }
}

async function cancelScheduledInvoiceReminder(pool, companyId, invoiceId) {
  try {
    await ensureInvoiceReminderSchema(pool);
    await pool.query(
      `DELETE FROM scheduled_invoice_reminder_sends WHERE company_id = $1 AND invoice_id = $2`,
      [companyId, invoiceId]
    );
  } catch (err) {
    console.error('cancelScheduledInvoiceReminder', invoiceId, err.message || err);
  }
}

async function getPendingInvoiceReminder(pool, invoiceId, companyId) {
  await ensureInvoiceReminderSchema(pool);
  const r = await pool.query(
    `SELECT send_at FROM scheduled_invoice_reminder_sends WHERE invoice_id = $1 AND company_id = $2`,
    [invoiceId, companyId]
  );
  if (r.rows.length === 0) return null;
  return { sendAt: new Date(r.rows[0].send_at).toISOString() };
}

async function loadReminderSubjectBody(pool, companyId, countryCode) {
  const co = await pool.query(
    `SELECT invoice_reminder_default_subject, invoice_reminder_default_body FROM companies WHERE id = $1`,
    [companyId]
  );
  const row = co.rows[0] || {};
  let subject = String(row.invoice_reminder_default_subject || '').trim();
  let body = String(row.invoice_reminder_default_body || '').trim();
  try {
    const tpl = await pool.query(
      `SELECT subject, message FROM email_templates WHERE company_id = $1 AND template_type = 'invoice_due_reminder'`,
      [companyId]
    );
    if (tpl.rows[0]) {
      if (String(tpl.rows[0].subject || '').trim()) subject = String(tpl.rows[0].subject).trim();
      if (String(tpl.rows[0].message || '').trim()) body = String(tpl.rows[0].message).trim();
    }
  } catch {
    /* ignore */
  }
  const fallback = getInvoiceDueReminderDefaults(countryCode);
  if (!subject) subject = fallback.subject;
  if (!body) body = fallback.message;
  return { subject, body };
}

async function sendInvoiceReminderForRow(pool, row) {
  const invoiceId = row.invoice_id;
  const companyId = row.company_id;
  const schedId = row.sched_id;

  const invRes = await pool.query(
    `SELECT i.*, c.name, c.last_name,
            COALESCE(NULLIF(TRIM(c.billing_email), ''), NULLIF(TRIM(c.email), ''), '') AS client_email,
            co.name AS company_name, co.country_code, co.timezone
     FROM invoices i
     JOIN clients c ON c.id = i.client_id
     JOIN companies co ON co.id = i.company_id
     WHERE i.id = $1 AND i.company_id = $2`,
    [invoiceId, companyId]
  );
  if (invRes.rows.length === 0) {
    await pool.query(`DELETE FROM scheduled_invoice_reminder_sends WHERE id = $1`, [schedId]);
    return;
  }
  const inv = invRes.rows[0];
  const st = inv.status || 'draft';
  if (st !== 'sent' && st !== 'overdue') {
    await pool.query(`DELETE FROM scheduled_invoice_reminder_sends WHERE id = $1`, [schedId]);
    return;
  }
  if (!inv.client_email) {
    await pool.query(`DELETE FROM scheduled_invoice_reminder_sends WHERE id = $1`, [schedId]);
    return;
  }

  const balance = await computeInvoiceBalance(pool, invoiceId, inv.total);
  if (balance <= 0) {
    await pool.query(`DELETE FROM scheduled_invoice_reminder_sends WHERE id = $1`, [schedId]);
    return;
  }

  const dup = await pool.query(
    `SELECT 1 FROM automated_invoice_email_sends
     WHERE company_id = $1 AND invoice_id = $2 AND automation_key = 'email_invoice_due_reminder'`,
    [companyId, invoiceId]
  );
  if (dup.rows.length > 0) {
    await pool.query(`DELETE FROM scheduled_invoice_reminder_sends WHERE id = $1`, [schedId]);
    return;
  }

  const itemsRes = await pool.query(
    `SELECT ii.*, COALESCE(s.title, ii.description) AS service_title
     FROM invoice_items ii
     LEFT JOIN services s ON s.id = ii.service_id
     WHERE ii.invoice_id = $1 ORDER BY ii.id`,
    [invoiceId]
  );
  const client_name = [inv.name, inv.last_name].filter(Boolean).join(' ').trim() || '—';
  const invoice = {
    ...inv,
    client_name,
    items: itemsRes.rows,
  };

  const invNo = String(invoice.invoice_number != null ? invoice.invoice_number : invoice.id);
  const { subject: subjTpl, body: bodyTpl } = await loadReminderSubjectBody(
    pool,
    companyId,
    inv.country_code || 'DK'
  );
  const subject = applyInvoiceNumberTokens(subjTpl, invNo);
  const messagePlain = applyInvoiceNumberTokens(bodyTpl, invNo);

  const token = await getOrCreateInvoicePublicToken(pool, invoiceId);
  const eInvoiceUrl = `${getWebAppBaseUrl()}/i/${token}`;
  const { html, text } = buildInvoiceCustomerEmailPayload({
    invoice,
    companyName: invoice.company_name || '',
    countryCode: inv.country_code || 'DK',
    eInvoiceUrl,
    messagePlain,
  });

  await sendEmail({
    to: inv.client_email.trim(),
    subject,
    text,
    html,
    companyId,
    fromName: invoice.company_name || undefined,
  });

  await pool.query(
    `INSERT INTO automated_invoice_email_sends (company_id, invoice_id, automation_key)
     VALUES ($1, $2, 'email_invoice_due_reminder')
     ON CONFLICT (company_id, invoice_id, automation_key) DO NOTHING`,
    [companyId, invoiceId]
  );

  await pool.query(`DELETE FROM scheduled_invoice_reminder_sends WHERE id = $1`, [schedId]);
}

function manualReminderError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Manually send a due-date reminder email right now.
 *
 * This is the "Send notification" action on an invoice. It reuses the same
 * template / email builder as the automated reminder so the customer sees a
 * consistent message, but it deliberately does NOT touch
 * `scheduled_invoice_reminder_sends` or `automated_invoice_email_sends`.
 * That means the scheduled automatic reminder (if any) will still fire at
 * its planned time — this is a nudge *in addition to* automation.
 *
 * Throws errors with a `.code` string so the caller can map them to HTTP
 * statuses: NO_INVOICE, INVALID_STATUS, NO_CLIENT_EMAIL, ALREADY_PAID,
 * RATE_LIMITED.
 */
async function sendInvoiceReminderManually(pool, companyId, invoiceId) {
  await ensureInvoiceReminderSchema(pool);

  const invRes = await pool.query(
    `SELECT i.*, c.name, c.last_name,
            COALESCE(NULLIF(TRIM(c.billing_email), ''), NULLIF(TRIM(c.email), ''), '') AS client_email,
            co.name AS company_name, co.country_code, co.timezone
     FROM invoices i
     JOIN clients c ON c.id = i.client_id
     JOIN companies co ON co.id = i.company_id
     WHERE i.id = $1 AND i.company_id = $2`,
    [invoiceId, companyId]
  );
  if (invRes.rows.length === 0) {
    throw manualReminderError('Invoice not found', 'NO_INVOICE');
  }
  const inv = invRes.rows[0];
  const st = inv.status || 'draft';
  if (st !== 'sent' && st !== 'overdue') {
    throw manualReminderError(
      'Only sent or overdue invoices can receive a reminder notification.',
      'INVALID_STATUS'
    );
  }
  if (!inv.client_email) {
    throw manualReminderError(
      'No email address on file for this client — add a billing email before sending a notification.',
      'NO_CLIENT_EMAIL'
    );
  }
  const balance = await computeInvoiceBalance(pool, invoiceId, inv.total);
  if (balance <= 0) {
    throw manualReminderError(
      'This invoice is already fully paid, so no reminder was sent.',
      'ALREADY_PAID'
    );
  }

  // Light throttle to protect against rapid double-clicks / accidental spamming.
  if (inv.last_manual_reminder_at) {
    const last = new Date(inv.last_manual_reminder_at).getTime();
    if (!Number.isNaN(last) && Date.now() - last < 30 * 1000) {
      throw manualReminderError(
        'A notification was just sent — please wait a moment before sending another.',
        'RATE_LIMITED'
      );
    }
  }

  const itemsRes = await pool.query(
    `SELECT ii.*, COALESCE(s.title, ii.description) AS service_title
     FROM invoice_items ii
     LEFT JOIN services s ON s.id = ii.service_id
     WHERE ii.invoice_id = $1 ORDER BY ii.id`,
    [invoiceId]
  );
  const client_name = [inv.name, inv.last_name].filter(Boolean).join(' ').trim() || '—';
  const invoice = { ...inv, client_name, items: itemsRes.rows };

  const invNo = String(invoice.invoice_number != null ? invoice.invoice_number : invoice.id);
  const { subject: subjTpl, body: bodyTpl } = await loadReminderSubjectBody(
    pool,
    companyId,
    inv.country_code || 'DK'
  );
  const subject = applyInvoiceNumberTokens(subjTpl, invNo);
  const messagePlain = applyInvoiceNumberTokens(bodyTpl, invNo);

  const token = await getOrCreateInvoicePublicToken(pool, invoiceId);
  const eInvoiceUrl = `${getWebAppBaseUrl()}/i/${token}`;
  const { html, text } = buildInvoiceCustomerEmailPayload({
    invoice,
    companyName: invoice.company_name || '',
    countryCode: inv.country_code || 'DK',
    eInvoiceUrl,
    messagePlain,
  });

  const sentTo = inv.client_email.trim();
  await sendEmail({
    to: sentTo,
    subject,
    text,
    html,
    companyId,
    fromName: invoice.company_name || undefined,
  });

  const upd = await pool.query(
    `UPDATE invoices
     SET last_manual_reminder_at = NOW()
     WHERE id = $1 AND company_id = $2
     RETURNING last_manual_reminder_at`,
    [invoiceId, companyId]
  );
  const sentAt = upd.rows[0]?.last_manual_reminder_at
    ? new Date(upd.rows[0].last_manual_reminder_at).toISOString()
    : new Date().toISOString();

  return { sentAt, sentTo };
}

/**
 * Process due invoice reminders (call from same tick as job automations).
 */
async function runInvoiceReminderTick(pool) {
  try {
    await ensureInvoiceReminderSchema(pool);
    const pendingRes = await pool.query(
      `SELECT id AS sched_id, company_id, invoice_id, send_at
       FROM scheduled_invoice_reminder_sends
       WHERE send_at <= NOW()
       ORDER BY send_at ASC
       LIMIT 25`
    );
    for (const row of pendingRes.rows) {
      try {
        await sendInvoiceReminderForRow(pool, row);
      } catch (e) {
        console.error('Invoice reminder send failed', row.invoice_id, e.message || e);
      }
    }
  } catch (e) {
    console.error('runInvoiceReminderTick', e.message || e);
  }
}

module.exports = {
  ensureInvoiceReminderSchema,
  scheduleInvoiceDueReminder,
  cancelScheduledInvoiceReminder,
  getPendingInvoiceReminder,
  sendInvoiceReminderManually,
  runInvoiceReminderTick,
  computeDueReminderSendAt,
  loadInvoiceReminderSettings,
};
