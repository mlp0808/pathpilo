// Company-level default work-hours template. Owners / admins can set the
// default once and every future employee invite inherits it.

const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const { ensureWorkHoursSchema, companyDefaultRowOrFallback, DAYS } = require('../utils/workHoursSchema');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const ADMIN_ROLES = new Set(['owner', 'admin']);

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

function getActiveCompanyId(req) {
  const companyId = req.user?.activeCompanyId;
  if (!companyId) return { error: 'No active company found in token', status: 400 };
  return { companyId };
}

function normaliseTime(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  return m ? `${m[1]}:${m[2]}` : null;
}

function normaliseMode(value, fallback = 'fixed') {
  const v = String(value || '').trim().toLowerCase();
  return v === 'fixed' || v === 'flexible' ? v : fallback;
}

router.use(authenticateToken);

// GET /api/company-defaults/work-hours
router.get('/work-hours', async (req, res) => {
  try {
    await ensureWorkHoursSchema(pool);
    const access = getActiveCompanyId(req);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const r = await pool.query(
      `SELECT * FROM company_default_work_hours WHERE company_id = $1`,
      [access.companyId],
    );
    const row = companyDefaultRowOrFallback(r.rows[0] || null);
    res.json({ defaults: row });
  } catch (err) {
    console.error('GET /company-defaults/work-hours:', err);
    res.status(500).json({ error: 'Failed to load company defaults' });
  }
});

// PUT /api/company-defaults/work-hours — admins only
router.put('/work-hours', async (req, res) => {
  try {
    await ensureWorkHoursSchema(pool);
    if (!ADMIN_ROLES.has(String(req.user?.role || '').toLowerCase())) {
      return res.status(403).json({ error: 'Only owners and admins can edit defaults' });
    }
    const access = getActiveCompanyId(req);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const body = req.body || {};
    const mode = normaliseMode(body.work_hours_mode);

    // Build column list + values. Dates without a start/end mean "day off"
    // for that weekday (both columns stored as NULL).
    const cols = ['company_id', 'work_hours_mode'];
    const values = [access.companyId, mode];

    for (const d of DAYS) {
      const start = normaliseTime(body[`${d}_start`]);
      const end = normaliseTime(body[`${d}_end`]);
      const breakRaw = body[`${d}_break_minutes`];
      const breakMinutes = Number.isFinite(Number(breakRaw))
        ? Math.max(0, Math.min(480, Math.round(Number(breakRaw))))
        : 0;
      const hoursRaw = body[`${d}_hours`];
      const hours = Number.isFinite(Number(hoursRaw))
        ? Math.max(0, Math.min(24, Math.round(Number(hoursRaw) * 10) / 10))
        : 0;
      cols.push(`${d}_start`, `${d}_end`, `${d}_break_minutes`, `${d}_hours`);
      values.push(start, end, breakMinutes, hours);
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const updateCols = cols
      .filter((c) => c !== 'company_id')
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(', ');

    await pool.query(
      `INSERT INTO company_default_work_hours (${cols.join(', ')})
       VALUES (${placeholders})
       ON CONFLICT (company_id) DO UPDATE SET ${updateCols}, updated_at = NOW()`,
      values,
    );

    const r = await pool.query(
      `SELECT * FROM company_default_work_hours WHERE company_id = $1`,
      [access.companyId],
    );
    res.json({ defaults: r.rows[0] });
  } catch (err) {
    console.error('PUT /company-defaults/work-hours:', err);
    res.status(500).json({ error: 'Failed to save company defaults' });
  }
});

module.exports = router;
