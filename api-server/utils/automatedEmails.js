const { DateTime } = require('luxon');
const { sendEmail, STANDARD_FOOTER_PLACEHOLDER } = require('./email');
const { normalizeCompanyTimezone } = require('./companyTimezone');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeScheduledDateYmd(scheduledDate) {
  if (scheduledDate == null) return null;
  const s = String(scheduledDate).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  if (scheduledDate instanceof Date && !Number.isNaN(scheduledDate.getTime())) {
    return scheduledDate.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Automation 2 send time: midnight (00:00) of job's scheduled date in the company
 * timezone, minus leadHours. So lead=0 → 00:00; lead=2 → 22:00 prev day; lead=24 → 00:00 prev day.
 */
function computeReminderSendAt(scheduledDateYmd, leadHours, countryCode, companyTimezone) {
  const ymd = normalizeScheduledDateYmd(scheduledDateYmd);
  if (!ymd) return null;
  const zone = normalizeCompanyTimezone(companyTimezone, countryCode);
  const midnight = DateTime.fromISO(`${ymd}T00:00:00`, { zone });
  if (!midnight.isValid) return null;
  return midnight.minus({ hours: Number(leadHours) }).toJSDate();
}

const AUTOMATION_DEFAULTS = {
  email_job_created: { enabled: false, lead_value: 5, lead_unit: 'minutes' },
  email_job_reminder: { enabled: false, lead_value: 24, lead_unit: 'hours' },
  sms_day_before: { enabled: false, lead_value: 24, lead_unit: 'hours' },
};

function leadHoursFromSetting(setting) {
  if (!setting) return 0;
  return setting.lead_unit === 'hours'
    ? setting.lead_value
    : Math.max(0, Math.ceil(setting.lead_value / 60));
}

/** Schedule or refresh a day-before reminder (email or SMS) at midnight(job day) − lead hours. */
async function upsertDayBeforeReminderSchedule(pool, companyId, jobId, automationKey, job, setting) {
  const now = new Date();
  if (!setting?.enabled || !job.scheduled_date) {
    await pool.query(
      `DELETE FROM scheduled_automation_sends
       WHERE job_id = $1 AND company_id = $2 AND automation_key = $3`,
      [jobId, companyId, automationKey]
    );
    return;
  }
  const sendAt = computeReminderSendAt(
    job.scheduled_date,
    leadHoursFromSetting(setting),
    job.country_code,
    job.timezone
  );
  if (!sendAt || sendAt <= now) {
    await pool.query(
      `DELETE FROM scheduled_automation_sends
       WHERE job_id = $1 AND company_id = $2 AND automation_key = $3`,
      [jobId, companyId, automationKey]
    );
    return;
  }
  await pool.query(
    `INSERT INTO scheduled_automation_sends (company_id, job_id, automation_key, send_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id, job_id, automation_key)
     DO UPDATE SET send_at = EXCLUDED.send_at`,
    [companyId, jobId, automationKey, sendAt]
  );
}

// ─── UI string translations for automated email HTML ─────────────────────────

function countryToLang(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  switch (code) {
    case 'DK': return 'da';
    case 'SE': return 'sv';
    case 'NO': return 'nb';
    case 'DE': return 'de';
    default:   return 'en';
  }
}

const EMAIL_UI_STRINGS = {
  en: {
    greetingWord: 'Hi',
    fallbackName: 'there',
    dateLabel: 'Date',
    arrivalLabel: 'Est. Arrival',
    locationLabel: 'Location',
    serviceLabel: 'Service',
    priceLabel: 'Price',
    totalLabel: 'Total',
    noServicesText: 'No services listed',
    notPlanned: 'not planned',
    signOffConfirmation: 'Best regards,',
    signOffReminder: 'See you soon,',
  },
  da: {
    greetingWord: 'Hej',
    fallbackName: 'der',
    dateLabel: 'Dato',
    arrivalLabel: 'Forventet ankomst',
    locationLabel: 'Adresse',
    serviceLabel: 'Ydelse',
    priceLabel: 'Pris',
    totalLabel: 'I alt',
    noServicesText: 'Ingen ydelser angivet',
    notPlanned: 'ikke planlagt',
    signOffConfirmation: 'Med venlig hilsen,',
    signOffReminder: 'Vi ses snart,',
  },
  sv: {
    greetingWord: 'Hej',
    fallbackName: 'där',
    dateLabel: 'Datum',
    arrivalLabel: 'Beräknad ankomst',
    locationLabel: 'Plats',
    serviceLabel: 'Tjänst',
    priceLabel: 'Pris',
    totalLabel: 'Totalt',
    noServicesText: 'Inga tjänster listade',
    notPlanned: 'inte planerad',
    signOffConfirmation: 'Med vänliga hälsningar,',
    signOffReminder: 'Vi ses snart,',
  },
  nb: {
    greetingWord: 'Hei',
    fallbackName: 'der',
    dateLabel: 'Dato',
    arrivalLabel: 'Forventet ankomst',
    locationLabel: 'Adresse',
    serviceLabel: 'Tjeneste',
    priceLabel: 'Pris',
    totalLabel: 'Totalt',
    noServicesText: 'Ingen tjenester angitt',
    notPlanned: 'ikke planlagt',
    signOffConfirmation: 'Med vennlig hilsen,',
    signOffReminder: 'Vi sees snart,',
  },
  de: {
    greetingWord: 'Hallo',
    fallbackName: '',
    dateLabel: 'Datum',
    arrivalLabel: 'Geschätzte Ankunft',
    locationLabel: 'Ort',
    serviceLabel: 'Leistung',
    priceLabel: 'Preis',
    totalLabel: 'Gesamt',
    noServicesText: 'Keine Leistungen aufgelistet',
    notPlanned: 'nicht geplant',
    signOffConfirmation: 'Mit freundlichen Grüßen,',
    signOffReminder: 'Bis bald,',
  },
};

function getEmailUiStrings(countryCode) {
  const lang = countryToLang(countryCode);
  return EMAIL_UI_STRINGS[lang] || EMAIL_UI_STRINGS['en'];
}

// For automation emails the "message" field stores only the lead/description sentence shown
// directly under the greeting in the rich HTML email. Everything else is structured automatically.
const TEMPLATE_DEFAULTS_BY_LANG = {
  en: {
    job_created_confirmation: {
      subject: 'Your booking with {Company name} is confirmed for {Job date}',
      message: 'Your appointment is booked. Here is a summary of the details.',
    },
    job_day_reminder: {
      subject: 'Reminder: We are coming on {Job date}',
      message: 'We look forward to seeing you. Here is a summary of your appointment.',
    },
  },
  da: {
    job_created_confirmation: {
      subject: 'Din booking hos {Company name} er bekræftet den {Job date}',
      message: 'Din aftale er bekræftet. Her er en oversigt over detaljerne.',
    },
    job_day_reminder: {
      subject: 'Påmindelse: Vi kommer den {Job date}',
      message: 'Vi glæder os til at se dig. Her er en oversigt over din aftale.',
    },
  },
  sv: {
    job_created_confirmation: {
      subject: 'Din bokning hos {Company name} är bekräftad den {Job date}',
      message: 'Din bokning är bekräftad. Här är en sammanfattning av detaljerna.',
    },
    job_day_reminder: {
      subject: 'Påminnelse: Vi kommer {Job date}',
      message: 'Vi ser fram emot att träffa dig. Här är en sammanfattning av din bokning.',
    },
  },
  nb: {
    job_created_confirmation: {
      subject: 'Din bestilling hos {Company name} er bekreftet den {Job date}',
      message: 'Din time er bekreftet. Her er en oversikt over detaljene.',
    },
    job_day_reminder: {
      subject: 'Påminnelse: Vi kommer den {Job date}',
      message: 'Vi ser frem til å se deg. Her er en oversikt over din time.',
    },
  },
  de: {
    job_created_confirmation: {
      subject: 'Ihre Buchung bei {Company name} ist bestätigt für den {Job date}',
      message: 'Ihr Termin ist gebucht. Hier ist eine Übersicht der Details.',
    },
    job_day_reminder: {
      subject: 'Erinnerung: Wir kommen am {Job date}',
      message: 'Wir freuen uns, Sie zu sehen. Hier ist eine Übersicht Ihres Termins.',
    },
  },
};

function getTemplateDefaults(countryCode) {
  const lang = countryToLang(countryCode);
  return TEMPLATE_DEFAULTS_BY_LANG[lang] || TEMPLATE_DEFAULTS_BY_LANG['en'];
}

const SMS_TEMPLATE_DEFAULTS_BY_LANG = {
  en: {
    sms_day_before:
      'Reminder from {Company name}: We are visiting you on {Job date} at {Job time from}. Reply if you need to reschedule.',
  },
  da: {
    sms_day_before:
      'Påmindelse fra {Company name}: Vi besøger dig den {Job date} kl. {Job time from}. Svar venligst, hvis du ønsker at ændre tidspunktet.',
  },
  sv: {
    sms_day_before:
      'Påminnelse från {Company name}: Vi besöker dig den {Job date} kl. {Job time from}. Svara om du behöver boka om.',
  },
  nb: {
    sms_day_before:
      'Påminnelse fra {Company name}: Vi besøker deg den {Job date} kl. {Job time from}. Svar hvis du trenger å ombooke.',
  },
  de: {
    sms_day_before:
      'Erinnerung von {Company name}: Wir besuchen Sie am {Job date} um {Job time from} Uhr. Antworten Sie, wenn Sie umbuchen möchten.',
  },
};

function getSmsTemplateDefault(countryCode, automationKey) {
  const lang = countryToLang(countryCode);
  const bucket = SMS_TEMPLATE_DEFAULTS_BY_LANG[lang] || SMS_TEMPLATE_DEFAULTS_BY_LANG.en;
  return bucket[automationKey] || SMS_TEMPLATE_DEFAULTS_BY_LANG.en[automationKey] || '';
}

let running = false;
let schemaEnsured = false;

// ─── Schema ───────────────────────────────────────────────────────────────────

async function ensureSchema(pool) {
  if (schemaEnsured) return;

  // Core "already sent" audit/dedup log (keep for dedup safety)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automated_email_sends (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      automation_key VARCHAR(100) NOT NULL,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, job_id, automation_key)
    )
  `);

  // The scheduling queue: one row per job per automation, deleted after send.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scheduled_automation_sends (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      automation_key VARCHAR(100) NOT NULL,
      send_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, job_id, automation_key)
    )
  `);

  // email_automation_settings (UI settings)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_automation_settings (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      automation_key VARCHAR(100) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      lead_value NUMERIC(10,4) NOT NULL DEFAULT 24,
      lead_unit VARCHAR(20) NOT NULL DEFAULT 'hours' CHECK (lead_unit IN ('minutes','hours')),
      eligible_since TIMESTAMPTZ,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, automation_key)
    )
  `);

  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS timezone VARCHAR(64)`);
  } catch (_) { /* ignore */ }

  try {
    await pool.query(`
      ALTER TABLE email_automation_settings
      ALTER COLUMN lead_value TYPE NUMERIC(10,4)
      USING lead_value::numeric
    `);
  } catch (_) { /* ignore */ }

  schemaEnsured = true;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function loadAutomationSettings(pool, companyId) {
  const result = await pool.query(
    `SELECT automation_key, enabled, lead_value, lead_unit
     FROM email_automation_settings
     WHERE company_id = $1
       AND automation_key IN ('email_job_created', 'email_job_reminder', 'sms_day_before')`,
    [companyId]
  );
  const settings = {
    email_job_created: { ...AUTOMATION_DEFAULTS.email_job_created },
    email_job_reminder: { ...AUTOMATION_DEFAULTS.email_job_reminder },
    sms_day_before: { ...AUTOMATION_DEFAULTS.sms_day_before },
  };
  result.rows.forEach((row) => {
    const rawValue = Number(row.lead_value);
    const normalizedValue = Number.isFinite(rawValue) ? rawValue : 24;
    const normalizedUnit = row.lead_unit === 'minutes' ? 'minutes' : 'hours';
    const isJobCreated = row.automation_key === 'email_job_created';
    if (!settings[row.automation_key]) return;
    settings[row.automation_key] = {
      enabled: !!row.enabled,
      lead_value: isJobCreated
        ? Math.max(1, Math.round(normalizedValue))
        : Math.max(0, normalizedValue),
      lead_unit: isJobCreated ? 'minutes' : normalizedUnit,
    };
  });
  return settings;
}

// ─── Scheduling helpers ───────────────────────────────────────────────────────

/**
 * Schedule automation emails for a newly-created job.
 * Called right after a job is committed to the DB.
 * - Confirmation: send_at = job.created_at + lead_minutes
 * - Reminder: send_at = midnight(scheduled_date in company tz) - lead_hours
 *   (only scheduled if that time is still in the future)
 */
async function scheduleAutomationSendsForJob(pool, companyId, jobId) {
  try {
    await ensureSchema(pool);

    const jobRes = await pool.query(
      `SELECT j.created_at, j.scheduled_date, j.status,
              co.country_code, co.timezone,
              COALESCE(NULLIF(TRIM(c.email), ''), '') AS client_email,
              COALESCE(NULLIF(TRIM(c.phone), ''), '') AS client_phone
       FROM jobs j
       JOIN companies co ON co.id = j.company_id
       JOIN clients c ON c.id = j.client_id
       WHERE j.id = $1 AND j.company_id = $2`,
      [jobId, companyId]
    );
    if (jobRes.rows.length === 0) return;
    const job = jobRes.rows[0];
    if (job.status === 'cancelled') return;

    const settings = await loadAutomationSettings(pool, companyId);

    // Automation 1: job confirmation (email only)
    if (settings.email_job_created?.enabled && job.client_email) {
      const delayMinutes = settings.email_job_created.lead_value;
      await pool.query(
        `INSERT INTO scheduled_automation_sends (company_id, job_id, automation_key, send_at)
         VALUES ($1, $2, 'email_job_created', NOW() + ($3 * INTERVAL '1 minute'))
         ON CONFLICT (company_id, job_id, automation_key) DO NOTHING`,
        [companyId, jobId, delayMinutes]
      );
    }

    // Automation 2: day-before email reminder
    if (job.client_email) {
      await upsertDayBeforeReminderSchedule(
        pool,
        companyId,
        jobId,
        'email_job_reminder',
        job,
        settings.email_job_reminder
      );
    }

    // Automation 3: day-before SMS reminder (same timing as email reminder)
    if (job.client_phone) {
      await upsertDayBeforeReminderSchedule(
        pool,
        companyId,
        jobId,
        'sms_day_before',
        job,
        settings.sms_day_before
      );
    }
  } catch (err) {
    console.error('scheduleAutomationSendsForJob error for job', jobId, err.message || err);
  }
}

/**
 * Recalculate the reminder send time when a job's scheduled_date changes.
 * - If automation is off, or the new send time is in the past, removes any pending reminder.
 * - Otherwise updates the pending reminder (or inserts if it didn't exist).
 */
async function rescheduleReminderForJob(pool, companyId, jobId) {
  try {
    await ensureSchema(pool);

    const jobRes = await pool.query(
      `SELECT j.scheduled_date, j.status,
              co.country_code, co.timezone,
              COALESCE(NULLIF(TRIM(c.email), ''), '') AS client_email,
              COALESCE(NULLIF(TRIM(c.phone), ''), '') AS client_phone
       FROM jobs j
       JOIN companies co ON co.id = j.company_id
       JOIN clients c ON c.id = j.client_id
       WHERE j.id = $1 AND j.company_id = $2`,
      [jobId, companyId]
    );
    if (jobRes.rows.length === 0) return;
    const job = jobRes.rows[0];

    if (job.status === 'cancelled') {
      await pool.query(
        `DELETE FROM scheduled_automation_sends
         WHERE job_id = $1 AND company_id = $2
           AND automation_key IN ('email_job_reminder', 'sms_day_before')`,
        [jobId, companyId]
      );
      return;
    }

    const settings = await loadAutomationSettings(pool, companyId);

    if (job.client_email) {
      await upsertDayBeforeReminderSchedule(
        pool,
        companyId,
        jobId,
        'email_job_reminder',
        job,
        settings.email_job_reminder
      );
    } else {
      await pool.query(
        `DELETE FROM scheduled_automation_sends
         WHERE job_id = $1 AND company_id = $2 AND automation_key = 'email_job_reminder'`,
        [jobId, companyId]
      );
    }

    if (job.client_phone) {
      await upsertDayBeforeReminderSchedule(
        pool,
        companyId,
        jobId,
        'sms_day_before',
        job,
        settings.sms_day_before
      );
    } else {
      await pool.query(
        `DELETE FROM scheduled_automation_sends
         WHERE job_id = $1 AND company_id = $2 AND automation_key = 'sms_day_before'`,
        [jobId, companyId]
      );
    }
  } catch (err) {
    console.error('rescheduleReminderForJob error for job', jobId, err.message || err);
  }
}

/**
 * Remove all pending scheduled automation sends for a job (e.g. when cancelled).
 * Delete is handled by ON DELETE CASCADE when the job is hard-deleted.
 */
async function cancelPendingForJob(pool, companyId, jobId) {
  try {
    await pool.query(
      `DELETE FROM scheduled_automation_sends WHERE job_id = $1 AND company_id = $2`,
      [jobId, companyId]
    );
  } catch (err) {
    console.error('cancelPendingForJob error for job', jobId, err.message || err);
  }
}

/**
 * Remove a single pending scheduled send by key (user-initiated cancel from UI).
 */
async function cancelPendingByKey(pool, companyId, jobId, automationKey) {
  await pool.query(
    `DELETE FROM scheduled_automation_sends
     WHERE job_id = $1 AND company_id = $2 AND automation_key = $3`,
    [jobId, companyId, automationKey]
  );
}

// ─── Email building ───────────────────────────────────────────────────────────

function timePart(value) {
  if (!value) return '';
  const s = String(value);
  return s.length >= 5 ? s.substring(0, 5) : s;
}

function applyTemplate(text, data) {
  if (!text) return '';
  const jobTotal =
    data.jobTotalPrice != null && data.jobTotalPrice !== '' ? data.jobTotalPrice : '—';
  return text
    .replace(/{Client name}/g, data.clientName || 'Customer')
    .replace(/{Client first name}/g, data.clientFirstName || 'Customer')
    .replace(/{Client last name}/g, data.clientLastName || '')
    .replace(/{Job date}/g, data.jobDate || '')
    .replace(/{Job time from}/g, data.jobTimeFrom || '')
    .replace(/{Job time to}/g, data.jobTimeTo || '')
    .replace(/{Company name}/g, data.companyName || '')
    .replace(/{Job address}/g, data.jobAddress || '')
    .replace(/{Job city}/g, data.jobCity || '')
    .replace(/{Job services}/g, data.jobServices || '')
    .replace(/{Job total price}/g, jobTotal)
    .replace(/\[Insert total price\]/gi, jobTotal)
    .replace(/{Job time range}/g, data.jobTimeRange || '');
}

function currencyForCountry(countryCode) {
  const m = { DK: 'DKK', SE: 'SEK', NO: 'NOK', DE: 'EUR', FR: 'EUR', US: 'USD', GB: 'GBP' };
  return m[(countryCode || 'DK').toUpperCase()] || 'DKK';
}

function localeForCountry(countryCode) {
  const m = { DK: 'da-DK', SE: 'sv-SE', NO: 'nb-NO', DE: 'de-DE', FR: 'fr-FR', US: 'en-US', GB: 'en-GB' };
  return m[(countryCode || 'DK').toUpperCase()] || 'da-DK';
}

function formatMoneyForEmail(countryCode, amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const currency = currencyForCountry(countryCode);
  const locale = localeForCountry(countryCode);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

async function fetchJobServiceLines(pool, jobId) {
  const result = await pool.query(
    `SELECT
       COALESCE(NULLIF(TRIM(js.custom_title), ''), NULLIF(TRIM(s.title), ''), 'Service') AS title,
       COALESCE(js.custom_price, s.price, 0)::numeric AS price,
       COALESCE(js.custom_duration_minutes, s.duration_minutes) AS duration_minutes
     FROM job_services js
     LEFT JOIN services s ON s.id = js.service_id
     WHERE js.job_id = $1
     ORDER BY js.id`,
    [jobId]
  );
  const lines = result.rows.map((r) => ({
    title: r.title || 'Service',
    price: parseFloat(r.price) || 0,
    durationMin: r.duration_minutes != null ? parseInt(r.duration_minutes, 10) : null,
  }));
  const total = lines.reduce((sum, l) => sum + l.price, 0);
  return { lines, total };
}

function getPlatformBrandName() {
  const raw = process.env.PLATFORM_EMAIL_BRAND || process.env.FROM_NAME || 'PathPilo';
  return String(raw).trim() || 'PathPilo';
}

function getPlatformWatermarkLogoUrl() {
  const raw =
    process.env.PLATFORM_EMAIL_WATERMARK_LOGO_URL ||
    process.env.PLATFORM_EMAIL_LOGO_URL ||
    process.env.PATHPILO_LOGO_URL ||
    '';
  return String(raw).trim();
}

function isLegacyAutomatedTemplateMessage(raw) {
  const text = String(raw || '').trim();
  if (!text) return false;
  // Old full-body templates (saved before we switched to a short opening line only).
  if (
    text.includes('Hi {Client first name}') &&
    (text.includes('{Job services}') || text.includes('Services:')) &&
    (text.includes('{Job total price}') || text.includes('Total:'))
  ) {
    return true;
  }
  if (text.includes('Time: {Job time range}') && text.includes('Address: {Job address}')) {
    return true;
  }
  if (
    text.includes('Reminder: we are scheduled to visit you') &&
    (text.includes('{Job services}') || text.includes('Services:'))
  ) {
    return true;
  }
  return false;
}

function escapeHtml(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainBodyToEmailHtml(plain) {
  const escaped = escapeHtml(plain);
  const blocks = escaped.split(/\n\n+/).filter(Boolean);
  if (blocks.length === 0) return '';
  return blocks
    .map(
      (block) =>
        `<p style="margin:0 0 14px;line-height:1.55;color:#1f2937;">${block.replace(
          /\n/g,
          '<br/>'
        )}</p>`
    )
    .join('');
}

function automationTimeDisplay(data, countryCode) {
  const raw = (data.jobTimeRange || '').trim();
  const ui = getEmailUiStrings(countryCode);
  if (!raw || raw === '—') return ui.notPlanned;
  return raw;
}

function buildRichJobAutomationInnerHtml(variant, data, serviceLines, countryCode, totalPrice, customLead) {
  const ui = getEmailUiStrings(countryCode);
  const rawFirst = data.clientFirstName && String(data.clientFirstName).trim();
  const first = escapeHtml(rawFirst || ui.fallbackName || '');
  const jobDate = escapeHtml(data.jobDate || '—');
  const timeLabel = escapeHtml(automationTimeDisplay(data, countryCode));
  const addressLine = [data.jobAddress, data.jobCity].filter(Boolean).join(', ');
  const address = escapeHtml(addressLine || '—');
  const totalFormatted = formatMoneyForEmail(countryCode, totalPrice);
  const defaults = getTemplateDefaults(countryCode);
  const defaultLead =
    variant === 'confirmation'
      ? defaults.job_created_confirmation.message
      : defaults.job_day_reminder.message;
  const lead = (customLead && customLead.trim()) ? customLead.trim() : defaultLead;

  const rowsHtml = serviceLines
    .map((line) => {
      const title = escapeHtml(line.title);
      const price = escapeHtml(formatMoneyForEmail(countryCode, line.price));
      return `<tr>
          <td style="padding:11px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${title}</td>
          <td style="padding:11px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;font-weight:600;white-space:nowrap;">${price}</td>
        </tr>`;
    })
    .join('');

  const emptyRow =
    serviceLines.length === 0
      ? `<tr><td colspan="2" style="padding:14px;font-size:14px;color:#6b7280;border-bottom:1px solid #e5e7eb;">${escapeHtml(ui.noServicesText)}</td></tr>`
      : '';

  const signOff = variant === 'confirmation' ? ui.signOffConfirmation : ui.signOffReminder;

  const greetingLine = first
    ? `${escapeHtml(ui.greetingWord)} <strong>${first}</strong>,`
    : `${escapeHtml(ui.greetingWord)},`;
  return `
<p style="margin:0 0 10px;font-size:16px;line-height:1.45;color:#111827;">${greetingLine}</p>
<p style="margin:0 0 22px;font-size:14px;line-height:1.55;color:#4b5563;">${escapeHtml(lead)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;border-collapse:separate;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
  <tr>
    <td width="50%" style="padding:12px 14px;background:#fff;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;vertical-align:top;">
      <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">${escapeHtml(ui.dateLabel)}</div>
      <div style="font-size:15px;color:#111827;font-weight:600;">${jobDate}</div>
    </td>
    <td width="50%" style="padding:12px 14px;background:#fff;border-bottom:1px solid #e5e7eb;vertical-align:top;">
      <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">${escapeHtml(ui.arrivalLabel)}</div>
      <div style="font-size:15px;color:#111827;font-weight:600;">${timeLabel}</div>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding:12px 14px;background:#fff;vertical-align:top;">
      <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">${escapeHtml(ui.locationLabel)}</div>
      <div style="font-size:15px;color:#111827;">${address}</div>
    </td>
  </tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:12px;">
  <thead>
    <tr style="background:#f3f4f6;">
      <th align="left" style="padding:9px 14px;font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(ui.serviceLabel)}</th>
      <th align="right" style="padding:9px 14px;font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(ui.priceLabel)}</th>
    </tr>
  </thead>
  <tbody>${rowsHtml || emptyRow}</tbody>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
  <tr>
    <td align="right" style="padding:10px 0 0;border-top:1px solid #e5e7eb;">
      <span style="font-size:13px;color:#6b7280;font-weight:500;margin-right:6px;">${escapeHtml(ui.totalLabel)}</span>
      <span style="font-size:15px;color:#111827;font-weight:600;">${escapeHtml(totalFormatted)}</span>
    </td>
  </tr>
</table>
<p style="margin:0;font-size:14px;line-height:1.55;color:#111827;">${escapeHtml(signOff)}<br/><strong>${escapeHtml(data.companyName || '')}</strong></p>`;
}

function buildBrandedAutomatedEmail({ companyName, bodyPlain, innerHtml, watermarkLogoUrl }) {
  const bodyHtml = innerHtml != null ? innerHtml : plainBodyToEmailHtml(bodyPlain);
  const logoUrl = String(watermarkLogoUrl || '').trim();
  const watermarkRow = logoUrl
    ? `<tr>
         <td align="center" style="padding:14px 0 2px;">
           <img src="${escapeHtml(logoUrl)}" alt="PathPilo" style="max-width:170px;width:38%;min-width:120px;height:auto;opacity:0.18;display:block;" />
         </td>
       </tr>`
    : '';
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:separate;border-radius:10px;overflow:hidden;border:1px solid #e4e4e7;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.06);">
        <tr>
          <td style="padding:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,sans-serif;font-size:15px;">
            <div style="padding:22px 22px 0 22px;color:#1f2937;">
            ${bodyHtml}
            ${STANDARD_FOOTER_PLACEHOLDER}
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ${watermarkRow}
</table>
</body>
</html>`;
  return { html, text: bodyPlain };
}

// ─── Templates ────────────────────────────────────────────────────────────────

async function loadTemplatesForCompany(pool, companyId, countryCode) {
  const rows = await pool.query(
    `SELECT template_type, subject, message
     FROM email_templates
     WHERE company_id = $1
       AND template_type IN ('job_created_confirmation', 'job_day_reminder')`,
    [companyId]
  );
  const map = {};
  rows.rows.forEach((row) => {
    map[row.template_type] = { subject: row.subject, message: row.message };
  });

  const defaults = getTemplateDefaults(countryCode);

  const resolvedJobCreatedMessage = map.job_created_confirmation?.message?.trim()
    ? map.job_created_confirmation.message
    : defaults.job_created_confirmation.message;
  const resolvedReminderMessage = map.job_day_reminder?.message?.trim()
    ? map.job_day_reminder.message
    : defaults.job_day_reminder.message;

  return {
    job_created_confirmation: {
      subject: map.job_created_confirmation?.subject?.trim()
        ? map.job_created_confirmation.subject
        : defaults.job_created_confirmation.subject,
      message: isLegacyAutomatedTemplateMessage(resolvedJobCreatedMessage)
        ? defaults.job_created_confirmation.message
        : resolvedJobCreatedMessage,
    },
    job_day_reminder: {
      subject: map.job_day_reminder?.subject?.trim()
        ? map.job_day_reminder.subject
        : defaults.job_day_reminder.subject,
      message: isLegacyAutomatedTemplateMessage(resolvedReminderMessage)
        ? defaults.job_day_reminder.message
        : resolvedReminderMessage,
    },
  };
}

function parseJobDateLabel(scheduledDate, countryCode, companyTimezone) {
  const ymd = normalizeScheduledDateYmd(scheduledDate);
  if (!ymd) return '';
  const zone = normalizeCompanyTimezone(companyTimezone, countryCode);
  const dt = DateTime.fromISO(`${ymd}T12:00:00`, { zone });
  if (!dt.isValid) return '';
  return dt.setLocale(localeForCountry(countryCode)).toLocaleString(DateTime.DATE_SHORT);
}

async function appendAutomationJobLog(pool, jobId, automationKey, recipient, channel = 'email') {
  try {
    const labelByKey = {
      email_job_created: 'Booking confirmation',
      email_job_reminder: 'Job day reminder',
      sms_day_before: 'Day-before SMS reminder',
      sms_on_the_way: 'On the way SMS',
    };
    const label = labelByKey[automationKey] || automationKey;
    const sentAt = new Date();
    const action = channel === 'sms' ? 'automated_sms' : 'automated_email';
    const desc = `${label} ${channel} sent to ${recipient} (${sentAt.toISOString()})`;
    await pool.query(
      `INSERT INTO job_logs (job_id, user_id, action, description) VALUES ($1, NULL, $2, $3)`,
      [jobId, action, desc]
    );
  } catch (e) {
    console.error('appendAutomationJobLog:', e.message || e);
  }
}

/**
 * Build a structured plain-text version of the automation email.
 * The `descriptionText` is the company-customisable lead sentence.
 */
function buildAutomationPlainText(variant, data, serviceLines, countryCode, totalPrice, descriptionText) {
  const ui = getEmailUiStrings(countryCode);
  const defaults = getTemplateDefaults(countryCode);
  const rawFirst = data.clientFirstName && String(data.clientFirstName).trim();
  const nameStr = rawFirst || ui.fallbackName || '';
  const greeting = nameStr ? `${ui.greetingWord} ${nameStr},` : `${ui.greetingWord},`;
  const lead = (descriptionText && descriptionText.trim())
    ? descriptionText.trim()
    : (variant === 'confirmation'
        ? defaults.job_created_confirmation.message
        : defaults.job_day_reminder.message);
  const timeLine = `${ui.arrivalLabel}: ${automationTimeDisplay(data, countryCode)}`;
  const details = [
    `${ui.dateLabel}: ${data.jobDate || '—'}`,
    timeLine,
    `${ui.locationLabel}: ${[data.jobAddress, data.jobCity].filter(Boolean).join(', ') || '—'}`,
  ].join('\n');
  const serviceRows = serviceLines.length
    ? serviceLines.map((l) => `  • ${l.title} — ${formatMoneyForEmail(countryCode, l.price)}`).join('\n')
    : `  • ${ui.noServicesText}`;
  const total = `${ui.totalLabel}: ${formatMoneyForEmail(countryCode, totalPrice)}`;
  const signOff = variant === 'confirmation'
    ? `${ui.signOffConfirmation}\n${data.companyName || ''}`
    : `${ui.signOffReminder}\n${data.companyName || ''}`;
  return [greeting, lead, details, serviceRows, total, signOff].join('\n\n');
}

// ─── Send ─────────────────────────────────────────────────────────────────────

async function sendForJob(pool, row, automationKey, template) {
  const { lines, total } = await fetchJobServiceLines(pool, row.job_id);
  const countryCode = row.company_country_code || 'DK';
  const serviceTitles = lines.map((l) => l.title).filter(Boolean).join(', ');
  const tf = timePart(row.scheduled_time_from);
  const tt = timePart(row.scheduled_time_to);
  const jobTimeRange = tf && tt ? `${tf} – ${tt}` : tf || tt || '—';
  const data = {
    clientName: `${row.client_name || ''} ${row.client_last_name || ''}`.trim(),
    clientFirstName: row.client_name || '',
    clientLastName: row.client_last_name || '',
    jobDate: parseJobDateLabel(row.scheduled_date, countryCode, row.company_timezone),
    jobTimeFrom: tf,
    jobTimeTo: tt,
    jobTimeRange,
    companyName: row.company_name || '',
    jobAddress: row.address || '',
    jobCity: row.city || '',
    jobServices: serviceTitles,
    jobTotalPrice: formatMoneyForEmail(countryCode, total),
  };

  // template.message is the company-customisable description/lead sentence only.
  // The full email structure is fixed and generated programmatically.
  const leadTemplate = template.message && template.message.trim() ? template.message.trim() : undefined;
  const leadText = leadTemplate ? applyTemplate(leadTemplate, data) : undefined;
  const variant = automationKey === 'email_job_created' ? 'confirmation' : 'reminder';
  const bodyPlain = buildAutomationPlainText(variant, data, lines, countryCode, total, leadText);
  const innerHtml = buildRichJobAutomationInnerHtml(variant, data, lines, countryCode, total, leadText);
  const branded = buildBrandedAutomatedEmail({
    companyName: data.companyName || 'Your business',
    bodyPlain,
    innerHtml,
    watermarkLogoUrl: getPlatformWatermarkLogoUrl(),
  });

  await sendEmail({
    to: row.client_email,
    subject: applyTemplate(template.subject, data),
    fromName: row.company_name || data.companyName,
    text: branded.text,
    html: branded.html,
    companyId: row.company_id,
  });

  const ins = await pool.query(
    `INSERT INTO automated_email_sends (company_id, job_id, automation_key)
     VALUES ($1, $2, $3)
     ON CONFLICT (company_id, job_id, automation_key) DO NOTHING
     RETURNING id`,
    [row.company_id, row.job_id, automationKey]
  );
  if (ins.rows.length > 0) {
    await appendAutomationJobLog(pool, row.job_id, automationKey, row.client_email, 'email');
  }
}

async function loadSmsMessageForAutomation(pool, companyId, automationKey, countryCode) {
  try {
    const rows = await pool.query(
      `SELECT message FROM email_templates WHERE company_id = $1 AND template_type = $2`,
      [companyId, automationKey]
    );
    const custom = rows.rows[0]?.message?.trim();
    if (custom) return custom;
  } catch (_) {
    /* template_type may not exist yet in older DB constraints */
  }
  return getSmsTemplateDefault(countryCode, automationKey);
}

async function sendSmsForJob(pool, row, automationKey, messageTemplate) {
  const { isTwilioConfigured, sendSms } = require('./twilioSms');
  if (!isTwilioConfigured()) {
    throw new Error('Twilio is not configured');
  }

  const { lines, total } = await fetchJobServiceLines(pool, row.job_id);
  const countryCode = row.company_country_code || 'DK';
  const serviceTitles = lines.map((l) => l.title).filter(Boolean).join(', ');
  const tf = timePart(row.scheduled_time_from);
  const tt = timePart(row.scheduled_time_to);
  const jobTimeRange = tf && tt ? `${tf} – ${tt}` : tf || tt || '—';
  const data = {
    clientName: `${row.client_name || ''} ${row.client_last_name || ''}`.trim(),
    clientFirstName: row.client_name || '',
    clientLastName: row.client_last_name || '',
    jobDate: parseJobDateLabel(row.scheduled_date, countryCode, row.company_timezone),
    jobTimeFrom: tf || '—',
    jobTimeTo: tt || '',
    jobTimeRange,
    companyName: row.company_name || '',
    jobAddress: row.address || '',
    jobCity: row.city || '',
    jobServices: serviceTitles,
    jobTotalPrice: formatMoneyForEmail(countryCode, total),
  };

  const body = applyTemplate(messageTemplate, data).trim();
  if (!body) throw new Error('SMS body is empty');

  const result = await sendSms({ to: row.client_phone, body });

  const ins = await pool.query(
    `INSERT INTO automated_email_sends (company_id, job_id, automation_key)
     VALUES ($1, $2, $3)
     ON CONFLICT (company_id, job_id, automation_key) DO NOTHING
     RETURNING id`,
    [row.company_id, row.job_id, automationKey]
  );
  if (ins.rows.length > 0) {
    await appendAutomationJobLog(pool, row.job_id, automationKey, result.to, 'sms');
    try {
      const { recordSmsUsage } = require('./smsBilling');
      await recordSmsUsage(pool, row.company_id, result.segments, {
        source: 'automation',
        note: `${automationKey} job ${row.job_id}`,
      });
    } catch (e) {
      console.error('recordSmsUsage after SMS send:', e.message || e);
    }
  }

  return result;
}

async function runAutomatedSmsTick(pool) {
  const { isTwilioConfigured } = require('./twilioSms');
  if (!isTwilioConfigured()) return;

  const pendingRes = await pool.query(
    `SELECT
       sas.id AS sched_id,
       sas.automation_key,
       sas.send_at,
       j.id AS job_id,
       j.company_id,
       j.scheduled_date,
       j.scheduled_time_from,
       j.scheduled_time_to,
       j.status AS job_status,
       c.phone AS client_phone,
       c.name AS client_name,
       c.last_name AS client_last_name,
       c.address,
       c.city,
       co.name AS company_name,
       co.country_code AS company_country_code,
       co.timezone AS company_timezone
     FROM scheduled_automation_sends sas
     JOIN jobs j ON j.id = sas.job_id
     JOIN clients c ON c.id = j.client_id
     JOIN companies co ON co.id = j.company_id
     LEFT JOIN automated_email_sends aes
       ON aes.job_id = j.id
       AND aes.company_id = j.company_id
       AND aes.automation_key = sas.automation_key
     WHERE sas.send_at <= NOW()
       AND j.status <> 'cancelled'
       AND sas.automation_key LIKE 'sms_%'
       AND c.phone IS NOT NULL
       AND TRIM(c.phone) <> ''
       AND aes.id IS NULL`
  );

  if (pendingRes.rows.length === 0) return;

  const byCompany = {};
  for (const row of pendingRes.rows) {
    const key = String(row.company_id);
    if (!byCompany[key]) byCompany[key] = [];
    byCompany[key].push(row);
  }

  for (const [companyIdStr, rows] of Object.entries(byCompany)) {
    const companyCountryCode = rows[0]?.company_country_code || 'DK';
    for (const row of rows) {
      let messageTemplate;
      try {
        messageTemplate = await loadSmsMessageForAutomation(
          pool,
          parseInt(companyIdStr, 10),
          row.automation_key,
          companyCountryCode
        );
      } catch (e) {
        console.error('Failed to load SMS template for company', companyIdStr, e.message);
        continue;
      }

      try {
        await sendSmsForJob(pool, row, row.automation_key, messageTemplate);
        await pool.query(`DELETE FROM scheduled_automation_sends WHERE id = $1`, [row.sched_id]);
      } catch (e) {
        console.error(
          'Failed to send automation SMS for job',
          row.job_id,
          row.automation_key,
          e.message || e
        );
      }
    }
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

async function runAutomatedEmailTick(pool) {
  if (running) return;
  running = true;
  try {
    await ensureSchema(pool);

    // Fetch all due scheduled sends where the job is not cancelled and email not already sent
    const pendingRes = await pool.query(
      `SELECT
         sas.id AS sched_id,
         sas.automation_key,
         sas.send_at,
         j.id AS job_id,
         j.company_id,
         j.scheduled_date,
         j.scheduled_time_from,
         j.scheduled_time_to,
         j.status AS job_status,
         j.created_at,
         c.email AS client_email,
         c.name AS client_name,
         c.last_name AS client_last_name,
         c.address,
         c.city,
         co.name AS company_name,
         co.country_code AS company_country_code,
         co.timezone AS company_timezone,
         u.email AS admin_email
       FROM scheduled_automation_sends sas
       JOIN jobs j ON j.id = sas.job_id
       JOIN clients c ON c.id = j.client_id
       JOIN companies co ON co.id = j.company_id
       LEFT JOIN users u ON co.owner_id = u.id
       LEFT JOIN automated_email_sends aes
         ON aes.job_id = j.id
         AND aes.company_id = j.company_id
         AND aes.automation_key = sas.automation_key
       WHERE sas.send_at <= NOW()
         AND j.status <> 'cancelled'
         AND sas.automation_key LIKE 'email_%'
         AND c.email IS NOT NULL
         AND c.email <> ''
         AND aes.id IS NULL`
    );

    if (pendingRes.rows.length > 0) {
      // Group by company so we load templates once per company
      const byCompany = {};
      for (const row of pendingRes.rows) {
        const key = String(row.company_id);
        if (!byCompany[key]) byCompany[key] = [];
        byCompany[key].push(row);
      }

      for (const [companyIdStr, rows] of Object.entries(byCompany)) {
        let templates;
        const companyCountryCode = rows[0]?.company_country_code || 'DK';
        try {
          templates = await loadTemplatesForCompany(pool, parseInt(companyIdStr, 10), companyCountryCode);
        } catch (e) {
          console.error('Failed to load templates for company', companyIdStr, e.message);
          continue;
        }

        for (const row of rows) {
          const template =
            row.automation_key === 'email_job_created'
              ? templates.job_created_confirmation
              : templates.job_day_reminder;

          try {
            await sendForJob(pool, row, row.automation_key, template);
            // Remove from queue after successful send
            await pool.query(
              `DELETE FROM scheduled_automation_sends WHERE id = $1`,
              [row.sched_id]
            );
          } catch (e) {
            console.error(
              'Failed to send automation email for job',
              row.job_id,
              row.automation_key,
              e.message || e
            );
          }
        }
      }
    }

    try {
      await runAutomatedSmsTick(pool);
    } catch (e) {
      console.error('Automated SMS tick:', e.message || e);
    }

    try {
      const { runInvoiceReminderTick } = require('./invoiceReminderAutomation');
      await runInvoiceReminderTick(pool);
    } catch (e) {
      console.error('Invoice reminder tick:', e.message || e);
    }
  } catch (error) {
    console.error('Automated email tick error:', error.message || error);
  } finally {
    running = false;
  }
}

// ─── Badge ────────────────────────────────────────────────────────────────────

/**
 * Returns pending automation sends for one job (for countdown badges in the UI).
 */
async function getPendingAutomationBadgesForJob(pool, jobId, companyId) {
  await ensureSchema(pool);
  const now = new Date();
  const serverNow = now.toISOString();

  const jobRes = await pool.query(
    `SELECT j.status,
            COALESCE(NULLIF(TRIM(c.email), ''), '') AS client_email,
            COALESCE(NULLIF(TRIM(c.phone), ''), '') AS client_phone
     FROM jobs j
     JOIN clients c ON c.id = j.client_id
     WHERE j.id = $1 AND j.company_id = $2`,
    [jobId, companyId]
  );
  if (jobRes.rows.length === 0 || jobRes.rows[0].status === 'cancelled') {
    return { pending: [], serverNow };
  }

  const pendingRes = await pool.query(
    `SELECT automation_key, send_at
     FROM scheduled_automation_sends
     WHERE job_id = $1 AND company_id = $2`,
    [jobId, companyId]
  );

  const hasEmail = !!jobRes.rows[0].client_email;
  const hasPhone = !!jobRes.rows[0].client_phone;

  const pending = pendingRes.rows
    .filter((row) => {
      const key = row.automation_key;
      if (key.startsWith('sms_')) return hasPhone;
      if (key.startsWith('email_')) return hasEmail;
      return true;
    })
    .map((row) => ({
    key: row.automation_key,
    sendAt: new Date(row.send_at).toISOString(),
    phase: new Date(row.send_at) > now ? 'scheduled' : 'due',
  }));

  return { pending, serverNow };
}

/** Re-schedule day-before email + SMS reminders for all upcoming jobs (after settings change). */
async function backfillDayBeforeRemindersForCompany(pool, companyId) {
  try {
    await ensureSchema(pool);
    const jobsRes = await pool.query(
      `SELECT j.id
       FROM jobs j
       WHERE j.company_id = $1
         AND j.status IS DISTINCT FROM 'cancelled'
         AND j.scheduled_date IS NOT NULL
       ORDER BY j.scheduled_date ASC`,
      [companyId]
    );
    for (const row of jobsRes.rows) {
      await rescheduleReminderForJob(pool, companyId, row.id);
    }
  } catch (err) {
    console.error('backfillDayBeforeRemindersForCompany error:', err.message || err);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  runAutomatedEmailTick,
  getPendingAutomationBadgesForJob,
  scheduleAutomationSendsForJob,
  rescheduleReminderForJob,
  backfillDayBeforeRemindersForCompany,
  cancelPendingForJob,
  cancelPendingByKey,
  ensureSchema,
  buildBrandedAutomatedEmail,
  getPlatformWatermarkLogoUrl,
};
