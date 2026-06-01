const express = require('express');
const { pool } = require('../utils/database');
const { mapSubmission } = require('../utils/leadForm');

const router = express.Router();

let sendEmail = null;
try {
  ({ sendEmail } = require('../utils/email'));
} catch (_) {
  sendEmail = null;
}

// GET /api/public/lead-forms/:token — public form config (no auth)
router.get('/lead-forms/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(
      `
      SELECT lf.settings, c.name AS company_name, c.leads_enabled
      FROM lead_forms lf
      JOIN companies c ON lf.company_id = c.id
      WHERE lf.token = $1
    `,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead form not found' });
    }

    const row = result.rows[0];
    res.json({
      companyName: row.company_name,
      settings: row.settings,
      enabled: Boolean(row.leads_enabled),
    });
  } catch (error) {
    console.error('Error fetching public lead form:', error);
    res.status(500).json({ error: 'Failed to fetch lead form' });
  }
});

// POST /api/public/lead-forms/:token/submit — submit a lead (no auth)
router.post('/lead-forms/:token/submit', async (req, res) => {
  try {
    const { token } = req.params;
    const body = req.body || {};

    // Honeypot: bots fill hidden fields. Pretend success, store nothing.
    if (body.website) {
      return res.status(201).json({ message: 'Lead submitted successfully' });
    }

    const formResult = await pool.query(
      `
      SELECT lf.company_id, lf.settings, c.leads_enabled, c.name AS company_name
      FROM lead_forms lf
      JOIN companies c ON lf.company_id = c.id
      WHERE lf.token = $1
    `,
      [token]
    );

    if (formResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead form not found' });
    }

    const { company_id: companyId, settings, leads_enabled, company_name: companyName } = formResult.rows[0];

    if (!leads_enabled) {
      return res.status(403).json({ error: 'This form is not currently accepting submissions.' });
    }

    const config = settings && typeof settings === 'object' ? settings : { fields: [] };
    const submittedValues = body && typeof body.values === 'object' && body.values ? body.values : body;

    const { columns, answers, missingRequired } = mapSubmission(config, submittedValues);

    if (missingRequired.length > 0) {
      return res.status(400).json({
        error: 'Please fill out all required fields.',
        missing: missingRequired,
      });
    }

    const meta = { answers, version: 3 };

    const result = await pool.query(
      `
      INSERT INTO leads (
        company_id, source, first_name, last_name, country, address, zip_code, city,
        email, phone, message, preferred_date, preferred_time, meta
      )
      VALUES ($1, 'form', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `,
      [
        companyId,
        columns.first_name ?? null,
        columns.last_name ?? null,
        columns.country ?? null,
        columns.address ?? null,
        columns.zip_code ?? null,
        columns.city ?? null,
        columns.email ?? null,
        columns.phone ?? null,
        columns.message ?? null,
        columns.preferred_date || null,
        columns.preferred_time || null,
        JSON.stringify(meta),
      ]
    );

    // Fire-and-forget notification to the company's chosen address.
    const notifyEmail = typeof config.notifyEmail === 'string' ? config.notifyEmail.trim() : '';
    if (notifyEmail && sendEmail) {
      const name = [columns.first_name, columns.last_name].filter(Boolean).join(' ') || 'New lead';
      const lines = answers.map((a) => `${a.label}: ${a.value}`).join('\n');
      sendEmail({
        to: notifyEmail,
        companyId,
        subject: `New lead: ${name}`,
        text: `You have a new lead from your ${companyName} form.\n\n${lines}`,
        html: `<p>You have a new lead from your <strong>${companyName}</strong> form.</p>${answers
          .map((a) => `<p><strong>${a.label}:</strong> ${String(a.value).replace(/</g, '&lt;')}</p>`)
          .join('')}`,
      }).catch((e) => console.warn('[lead-form] notify email failed:', e?.message || e));
    }

    res.status(201).json({
      message: 'Lead submitted successfully',
      leadId: result.rows[0].id,
    });
  } catch (error) {
    console.error('Error submitting lead:', error);
    res.status(500).json({ error: 'Failed to submit lead' });
  }
});

module.exports = router;
