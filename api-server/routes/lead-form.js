const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../utils/database');
const { sanitizeConfig } = require('../utils/leadForm');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

router.use(authenticateToken);

// Resolve the active company for the request, preferring the JWT's
// activeCompanyId and verifying membership (falls back to first membership).
const resolveCompanyId = async (req) => {
  const userId = req.user.userId;
  let companyId = req.user.activeCompanyId;
  if (companyId) {
    const member = await pool.query(
      'SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, companyId]
    );
    if (member.rows.length === 0) {
      return { error: 'Not a member of the active company', status: 403 };
    }
    return { companyId };
  }
  const result = await pool.query(
    'SELECT company_id FROM user_companies WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  if (result.rows.length === 0) {
    return { error: 'No active company found', status: 400 };
  }
  return { companyId: result.rows[0].company_id };
};

// Idempotently make sure the gate column exists.
let columnsEnsured = false;
async function ensureLeadColumns() {
  if (columnsEnsured) return;
  await pool
    .query('ALTER TABLE companies ADD COLUMN IF NOT EXISTS leads_enabled BOOLEAN NOT NULL DEFAULT FALSE')
    .catch(() => {});
  columnsEnsured = true;
}

// GET /api/lead-form — form config + activation state for the active company
router.get('/', async (req, res) => {
  try {
    await ensureLeadColumns();
    const resolved = await resolveCompanyId(req);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const { companyId } = resolved;

    const formResult = await pool.query(
      'SELECT token, settings FROM lead_forms WHERE company_id = $1',
      [companyId]
    );
    const enabledRow = await pool.query('SELECT leads_enabled FROM companies WHERE id = $1', [companyId]);
    const enabled = Boolean(enabledRow.rows[0]?.leads_enabled);

    if (formResult.rows.length === 0) {
      return res.json({ form: { token: null, settings: null, enabled } });
    }

    res.json({
      form: {
        token: formResult.rows[0].token,
        settings: formResult.rows[0].settings,
        enabled,
      },
    });
  } catch (error) {
    console.error('Error fetching lead form:', error);
    res.status(500).json({ error: 'Failed to fetch lead form settings' });
  }
});

// PUT /api/lead-form — save form config and/or flip the activation gate
router.put('/', async (req, res) => {
  try {
    await ensureLeadColumns();
    const resolved = await resolveCompanyId(req);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }
    const { companyId } = resolved;
    const { settings, enabled } = req.body || {};

    // Activation toggle (saved immediately, independent of form config).
    if (enabled !== undefined) {
      await pool.query('UPDATE companies SET leads_enabled = $1 WHERE id = $2', [Boolean(enabled), companyId]);
    }

    let token = null;
    if (settings !== undefined) {
      const clean = sanitizeConfig(settings);
      if (!clean) {
        return res.status(400).json({ error: 'Invalid form configuration' });
      }

      const existing = await pool.query('SELECT token FROM lead_forms WHERE company_id = $1', [companyId]);
      if (existing.rows.length === 0) {
        token = crypto.randomBytes(32).toString('hex');
        await pool.query(
          'INSERT INTO lead_forms (company_id, token, settings) VALUES ($1, $2, $3)',
          [companyId, token, JSON.stringify(clean)]
        );
      } else {
        token = existing.rows[0].token;
        await pool.query(
          'UPDATE lead_forms SET settings = $1, updated_at = NOW() WHERE company_id = $2',
          [JSON.stringify(clean), companyId]
        );
      }
    } else {
      const existing = await pool.query('SELECT token FROM lead_forms WHERE company_id = $1', [companyId]);
      token = existing.rows[0]?.token || null;
    }

    const enabledRow = await pool.query('SELECT leads_enabled FROM companies WHERE id = $1', [companyId]);

    res.json({
      message: 'Lead form saved',
      form: {
        token,
        settings: settings !== undefined ? sanitizeConfig(settings) : undefined,
        enabled: Boolean(enabledRow.rows[0]?.leads_enabled),
      },
    });
  } catch (error) {
    console.error('Error updating lead form:', error);
    res.status(500).json({ error: 'Failed to update lead form settings' });
  }
});

module.exports = router;
