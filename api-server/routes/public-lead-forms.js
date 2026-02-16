const express = require('express');
const { pool } = require('../utils/database');

const router = express.Router();

// GET /api/public/lead-forms/:token - Get public lead form (no auth)
router.get('/lead-forms/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(`
      SELECT lf.settings, c.name as company_name
      FROM lead_forms lf
      JOIN companies c ON lf.company_id = c.id
      WHERE lf.token = $1
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead form not found or inactive' });
    }

    res.json({
      companyName: result.rows[0].company_name,
      settings: result.rows[0].settings
    });
  } catch (error) {
    console.error('Error fetching public lead form:', error);
    res.status(500).json({ error: 'Failed to fetch lead form' });
  }
});

// POST /api/public/lead-forms/:token/submit - Submit lead (no auth)
router.post('/lead-forms/:token/submit', async (req, res) => {
  try {
    const { token } = req.params;
    const body = req.body;

    const formResult = await pool.query(`
      SELECT company_id FROM lead_forms
      WHERE token = $1
    `, [token]);

    if (formResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead form not found or inactive' });
    }

    const companyId = formResult.rows[0].company_id;

    // Map submitted fields to leads columns; store extra in meta
    const {
      first_name, last_name, country, address, zip_code, city, email, phone,
      message, preferred_date, preferred_time, meta: submittedMeta
    } = body;

    const result = await pool.query(`
      INSERT INTO leads (
        company_id, first_name, last_name, country, address, zip_code, city,
        email, phone, message, preferred_date, preferred_time, meta
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      companyId,
      first_name ?? null,
      last_name ?? null,
      country ?? null,
      address ?? null,
      zip_code ?? null,
      city ?? null,
      email ?? null,
      phone ?? null,
      message ?? null,
      preferred_date || null,
      preferred_time || null,
      submittedMeta ? JSON.stringify(submittedMeta) : null
    ]);

    res.status(201).json({
      message: 'Lead submitted successfully',
      leadId: result.rows[0].id
    });
  } catch (error) {
    console.error('Error submitting lead:', error);
    res.status(500).json({ error: 'Failed to submit lead' });
  }
});

module.exports = router;
