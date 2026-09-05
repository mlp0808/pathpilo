// Company-level default work-hours template. Owners / admins can set the
// default once; the settings page also edits per-employee schedules via
// /work-hours/:userId. Model: start time + daily work hours (no end/break UI).

const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const {
  ensureWorkHoursSchema,
  companyDefaultRowOrFallback,
  addHoursToTime,
  DAYS,
} = require('../utils/workHoursSchema');

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

function normaliseHours(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(24, Math.round(num * 10) / 10));
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
// Body: per day `{day}_start` (HH:MM|null) + `{day}_hours` (number). End is derived.
router.put('/work-hours', async (req, res) => {
  try {
    await ensureWorkHoursSchema(pool);
    if (!ADMIN_ROLES.has(String(req.user?.role || '').toLowerCase())) {
      return res.status(403).json({ error: 'Only owners and admins can edit defaults' });
    }
    const access = getActiveCompanyId(req);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const body = req.body || {};
    const cols = ['company_id', 'work_hours_mode'];
    const values = [access.companyId, 'flexible'];

    for (const d of DAYS) {
      const hours = normaliseHours(body[`${d}_hours`]);
      const start = hours > 0 ? (normaliseTime(body[`${d}_start`]) || '08:00') : null;
      const end = hours > 0 ? (normaliseTime(body[`${d}_end`]) || addHoursToTime(start, hours)) : null;
      cols.push(`${d}_start`, `${d}_end`, `${d}_break_minutes`, `${d}_hours`);
      values.push(start, end, 0, hours);
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
    res.json({ defaults: companyDefaultRowOrFallback(r.rows[0] || null) });
  } catch (err) {
    console.error('PUT /company-defaults/work-hours:', err);
    res.status(500).json({ error: 'Failed to save company defaults' });
  }
});

module.exports = router;
