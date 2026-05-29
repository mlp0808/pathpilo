const express = require('express');
const { pool } = require('../utils/database');
const { getSendInvoiceDefaults, getInvoiceDueReminderDefaults } = require('../utils/companyInvoiceEmailLocale');

const router = express.Router();
let schemaEnsured = false;

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

const getActiveCompanyId = (req) => {
  const activeCompanyId = req.user?.activeCompanyId;
  if (!activeCompanyId) {
    return { error: 'No active company found in token', status: 400 };
  }
  return { companyId: activeCompanyId };
};

const DEFAULT_TEMPLATES = {
  // Automation emails: message is only the short “opening” line; the HTML body is built in automatedEmails.js.
  job_created_confirmation: {
    subject: 'Your booking with {Company name} is confirmed for {Job date}',
    message: 'Your appointment is booked. Here is a summary of the details.',
  },
  job_day_reminder: {
    subject: 'Reminder: We are coming on {Job date}',
    message: 'We look forward to seeing you. Here is a summary of your appointment.',
  },
  change_date: {
    subject: 'Your appointment — new date: {Job new date}',
    message: 'Dear {Client name},\n\nYour appointment with {Company name} has been rescheduled.\n\n• Previous date: {Job old date}\n• New date: {Job new date}\n{Job time detail}\n\nIf the new date does not work for you, reply to this email and we will help.\n\nBest regards,\n{Company name}'
  },
  change_time: {
    subject: 'Updated time for your job on {Job date}',
    message: 'Hi {Client first name},\n\nThe time for your scheduled job has changed.\n\nPrevious time: {Job old time from} - {Job old time to}\nNew time: {Job new time from} - {Job new time to}\nDate: {Job date}\n\nThank you for your understanding.\n\nBest regards,\n{Company name}'
  },
  change_employee: {
    subject: 'Update: your assigned team member has changed',
    message: 'Hi {Client first name},\n\nYour appointment will now be handled by {Employee new name}.\n\nPrevious team member: {Employee old name}\nNew team member: {Employee new name}\n\nIf you have questions, please reply to this email.\n\nBest regards,\n{Company name}'
  },
  cancel_job: {
    subject: 'Your job on {Job date} has been cancelled',
    message: 'Hi {Client first name},\n\nWe are sorry, but your scheduled job on {Job date} has been cancelled.\n\nOriginal time: {Job time from} - {Job time to}\nServices: {Job services}\n\nPlease contact us if you want to rebook.\n\nBest regards,\n{Company name}'
  },
  on_the_way: {
    subject: 'We are on our way',
    message:
      'Hi {Client first name},\n\n' +
      'We are on our way to you right now and expect to arrive in about {Selected minutes} minutes.\n\n' +
      'The agreed location is {Client location}.\n\n' +
      'Kind regards,\n' +
      '{Owner name}\n' +
      '{Company name}',
  },
  send_invoice: getSendInvoiceDefaults('US'),
  invoice_due_reminder: getInvoiceDueReminderDefaults('US'),
};

const DEFAULT_AUTOMATIONS = {
  // Automations are OFF by default: users must explicitly enable them.
  email_job_created: { enabled: false, lead_value: 5, lead_unit: 'minutes', eligible_since: null },
  email_job_reminder: { enabled: false, lead_value: 24, lead_unit: 'hours', eligible_since: null },
  email_invoice_due_reminder: { enabled: false, lead_value: 48, lead_unit: 'hours', eligible_since: null },
};

async function ensureSchema() {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_automation_settings (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      automation_key VARCHAR(100) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      lead_value NUMERIC(10,4) NOT NULL DEFAULT 24,
      lead_unit VARCHAR(20) NOT NULL DEFAULT 'hours' CHECK (lead_unit IN ('minutes','hours')),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, automation_key)
    )
  `);
  // Backwards compatible: allow decimals even if the column was created as INTEGER previously.
  try {
    await pool.query(`
      ALTER TABLE email_automation_settings
      ALTER COLUMN lead_value TYPE NUMERIC(10,4)
      USING lead_value::numeric
    `);
  } catch (_) {
    // Ignore if column already has the right type or ALTER fails on some environments.
  }
  try {
    await pool.query(
      `ALTER TABLE email_automation_settings ADD COLUMN IF NOT EXISTS eligible_since TIMESTAMPTZ`
    );
  } catch (_) {
    /* ignore */
  }
  try {
    await pool.query(`ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_template_type_check`);
    await pool.query(`
      ALTER TABLE email_templates
      ADD CONSTRAINT email_templates_template_type_check
      CHECK (template_type IN (
        'job_created_confirmation',
        'job_day_reminder',
        'change_date',
        'change_time',
        'change_employee',
        'cancel_job',
        'on_the_way',
        'send_invoice',
        'invoice_due_reminder'
      ))
    `);
  } catch (_) {
    // Keep route resilient if ALTER fails on some environments.
  }
  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS reply_to_email VARCHAR(255)`);
  } catch (_) {
    /* ignore */
  }
  schemaEnsured = true;
}

// GET /api/email-templates
router.get('/', authenticateToken, async (req, res) => {
  try {
    await ensureSchema();
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const result = await pool.query(
      'SELECT template_type, subject, message FROM email_templates WHERE company_id = $1',
      [companyId]
    );

    const templates = {};
    result.rows.forEach(row => {
      templates[row.template_type] = {
        subject: row.subject || '',
        message: row.message || ''
      };
    });

    let invFromCompany = null;
    try {
      const invCo = await pool.query(
        `SELECT invoice_email_default_subject, invoice_email_default_body,
                invoice_reminder_default_subject, invoice_reminder_default_body,
                country_code
         FROM companies WHERE id = $1`,
        [companyId]
      );
      invFromCompany = invCo.rows[0] || null;
    } catch (_) {
      invFromCompany = null;
    }

    const countryCode = invFromCompany?.country_code || 'DK';
    const localeInvoice = {
      send_invoice: getSendInvoiceDefaults(countryCode),
      invoice_due_reminder: getInvoiceDueReminderDefaults(countryCode),
    };
    const merged = { ...DEFAULT_TEMPLATES, ...localeInvoice, ...templates };
    if (invFromCompany) {
      if (!merged.send_invoice?.subject?.trim() && invFromCompany.invoice_email_default_subject) {
        merged.send_invoice = merged.send_invoice || {};
        merged.send_invoice.subject = invFromCompany.invoice_email_default_subject;
      }
      if (!merged.send_invoice?.message?.trim() && invFromCompany.invoice_email_default_body) {
        merged.send_invoice = merged.send_invoice || {};
        merged.send_invoice.message = invFromCompany.invoice_email_default_body;
      }
      if (!merged.invoice_due_reminder?.subject?.trim() && invFromCompany.invoice_reminder_default_subject) {
        merged.invoice_due_reminder = merged.invoice_due_reminder || {};
        merged.invoice_due_reminder.subject = invFromCompany.invoice_reminder_default_subject;
      }
      if (!merged.invoice_due_reminder?.message?.trim() && invFromCompany.invoice_reminder_default_body) {
        merged.invoice_due_reminder = merged.invoice_due_reminder || {};
        merged.invoice_due_reminder.message = invFromCompany.invoice_reminder_default_body;
      }
    }

    const automationResult = await pool.query(
      'SELECT automation_key, enabled, lead_value, lead_unit, eligible_since FROM email_automation_settings WHERE company_id = $1',
      [companyId]
    );
    const automationSettings = {};
    automationResult.rows.forEach((row) => {
      const key = row.automation_key;
      const rawValue = Number(row.lead_value);
      const normalizedValue = Number.isFinite(rawValue) ? rawValue : 24;
      const normalizedUnit = row.lead_unit === 'minutes' ? 'minutes' : 'hours';
      const isJobCreated = key === 'email_job_created';
      automationSettings[row.automation_key] = {
        enabled: !!row.enabled,
        // Safety: booking confirmation must be minute-based and at least 1 minute.
        lead_value: isJobCreated ? Math.max(1, Math.round(normalizedValue)) : Math.max(0, normalizedValue),
        lead_unit: isJobCreated ? 'minutes' : normalizedUnit,
        eligible_since: row.eligible_since ? new Date(row.eligible_since).toISOString() : null,
      };
    });

    let repliesToEmail = '';
    try {
      const rt = await pool.query('SELECT reply_to_email FROM companies WHERE id = $1', [companyId]);
      repliesToEmail = rt.rows[0]?.reply_to_email ? String(rt.rows[0].reply_to_email).trim() : '';
    } catch (_) {
      /* ignore */
    }

    res.json({
      templates: merged,
      automationSettings: { ...DEFAULT_AUTOMATIONS, ...automationSettings },
      repliesToEmail,
    });
  } catch (error) {
    console.error('Error fetching email templates:', error);
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      return res.json({ templates: DEFAULT_TEMPLATES, automationSettings: DEFAULT_AUTOMATIONS, repliesToEmail: '' });
    }
    res.status(500).json({ error: 'Failed to fetch email templates', details: error.message });
  }
});

// PUT /api/email-templates
router.put('/', authenticateToken, async (req, res) => {
  try {
    await ensureSchema();
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) {
      return res.status(companyAccess.status).json({ error: companyAccess.error });
    }
    const companyId = companyAccess.companyId;

    const { templates, automationSettings, repliesToEmail } = req.body;
    const hasTemplates = templates && typeof templates === 'object';
    const hasAutomations = automationSettings && typeof automationSettings === 'object';
    const hasReplyTo = typeof repliesToEmail === 'string';
    if (!hasTemplates && !hasAutomations && !hasReplyTo) {
      return res.status(400).json({ error: 'templates, automationSettings, or repliesToEmail required' });
    }

    if (hasReplyTo) {
      const trimmed = repliesToEmail.trim();
      const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const value = trimmed && SIMPLE_EMAIL_RE.test(trimmed) ? trimmed : null;
      await pool.query(
        `UPDATE companies SET reply_to_email = $1, updated_at = NOW() WHERE id = $2`,
        [value, companyId]
      );
    }

    if (hasTemplates) {
      for (const [templateType, templateData] of Object.entries(templates)) {
        const { subject, message } = templateData;
        await pool.query(
          `INSERT INTO email_templates (company_id, template_type, subject, message)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (company_id, template_type)
           DO UPDATE SET subject = EXCLUDED.subject, message = EXCLUDED.message, updated_at = NOW()`,
          [companyId, templateType, subject || '', message || '']
        );
      }
      const si = templates.send_invoice;
      if (si && typeof si === 'object') {
        await pool.query(
          `UPDATE companies SET invoice_email_default_subject = $1, invoice_email_default_body = $2, updated_at = NOW() WHERE id = $3`,
          [si.subject || '', si.message || '', companyId]
        );
      }
      const ir = templates.invoice_due_reminder;
      if (ir && typeof ir === 'object') {
        await pool.query(
          `UPDATE companies SET invoice_reminder_default_subject = $1, invoice_reminder_default_body = $2, updated_at = NOW() WHERE id = $3`,
          [ir.subject || '', ir.message || '', companyId]
        );
      }
    }

    if (hasAutomations) {
      for (const [automationKey, setting] of Object.entries(automationSettings)) {
        const enabled = !!setting.enabled;
        const rawLeadValue = Number(setting.lead_value ?? setting.leadValue ?? 24);
        const normalizedLeadValue = Number.isFinite(rawLeadValue) ? rawLeadValue : 24;
        const rawLeadUnit = setting.lead_unit ?? setting.leadUnit;
        const normalizedLeadUnit = rawLeadUnit === 'minutes' ? 'minutes' : 'hours';
        const isJobCreated = automationKey === 'email_job_created';
        const leadValue = isJobCreated
          ? Math.max(1, Math.round(normalizedLeadValue))
          : Math.max(0, normalizedLeadValue);
        const leadUnit = isJobCreated ? 'minutes' : normalizedLeadUnit;

        const prevRes = await pool.query(
          `SELECT enabled, eligible_since FROM email_automation_settings WHERE company_id = $1 AND automation_key = $2`,
          [companyId, automationKey]
        );
        const prev = prevRes.rows[0];
        const wasEnabled = prev?.enabled === true;
        let eligibleSince = prev?.eligible_since ?? null;
        if (!enabled) {
          eligibleSince = null;
        } else if (!wasEnabled) {
          eligibleSince = new Date();
        } else if (eligibleSince == null) {
          eligibleSince = new Date();
        }

        await pool.query(
          `INSERT INTO email_automation_settings (company_id, automation_key, enabled, lead_value, lead_unit, eligible_since, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (company_id, automation_key)
           DO UPDATE SET
             enabled = EXCLUDED.enabled,
             lead_value = EXCLUDED.lead_value,
             lead_unit = EXCLUDED.lead_unit,
             eligible_since = EXCLUDED.eligible_since,
             updated_at = NOW()`,
          [companyId, automationKey, enabled, leadValue, leadUnit, eligibleSince]
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving email templates:', error);
    res.status(500).json({ error: 'Failed to save email templates', details: error.message });
  }
});

module.exports = router;
