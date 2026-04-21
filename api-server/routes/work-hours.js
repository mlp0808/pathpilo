// Work hours per user per company — supports two modes:
//   - 'fixed':    per weekday start_time + end_time + unpaid break minutes.
//                 Daily hours are derived: (end - start) - break/60.
//   - 'flexible': per weekday total hours only (legacy behaviour).
//
// The route also serves optional route-planner addresses that live on the
// same row (start_address, end_address, use_company_default_location) —
// these existed before this feature and are untouched.

const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const {
  ensureWorkHoursSchema,
  companyDefaultRowOrFallback,
  DAYS,
} = require('../utils/workHoursSchema');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const ADMIN_ROLES = new Set(['owner', 'admin']);

const getActiveCompanyId = async (req) => {
  try {
    const userId = req.user.userId;
    const result = await pool.query(
      `SELECT uc.company_id, uc.role
       FROM user_companies uc
       JOIN companies c ON uc.company_id = c.id
       WHERE uc.user_id = $1
       LIMIT 1`,
      [userId],
    );
    if (result.rows.length === 0) return { error: 'No active company found', status: 400 };
    return { companyId: result.rows[0].company_id, userRole: result.rows[0].role };
  } catch (error) {
    console.error('Error getting active company:', error);
    return { error: 'Failed to get company access', status: 500 };
  }
};

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

router.use(authenticateToken);

async function ensureLocationColumns() {
  try {
    await pool.query('ALTER TABLE user_company_work_hours ADD COLUMN IF NOT EXISTS start_address TEXT');
    await pool.query('ALTER TABLE user_company_work_hours ADD COLUMN IF NOT EXISTS end_address TEXT');
    await pool.query('ALTER TABLE user_company_work_hours ADD COLUMN IF NOT EXISTS use_company_default_location BOOLEAN DEFAULT TRUE');
  } catch (e) {
    // ignore
  }
}
ensureLocationColumns();

function normaliseTime(value) {
  if (value == null || value === '') return null;
  const m = String(value).match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  return m ? `${m[1]}:${m[2]}` : null;
}

function normaliseMode(value, fallback = 'flexible') {
  const v = String(value || '').trim().toLowerCase();
  return v === 'fixed' || v === 'flexible' ? v : fallback;
}

// Shape a raw DB row into the JSON response the frontend expects. Converts
// TIME columns to HH:MM strings and fills in any missing legacy columns.
function shapeWorkHoursRow(row) {
  const out = { ...row };
  for (const d of DAYS) {
    const sKey = `${d}_start`;
    const eKey = `${d}_end`;
    // pg returns TIME as "08:00:00" strings by default; trim to HH:MM.
    if (out[sKey]) out[sKey] = String(out[sKey]).slice(0, 5);
    if (out[eKey]) out[eKey] = String(out[eKey]).slice(0, 5);
  }
  return out;
}

// Given a raw workHours row (which may come from the user's row or the
// company defaults) build a flexible-mode hours fallback so the frontend
// always has a number per day, even in fixed mode (it uses that number to
// display the "derived daily hours" hint).
function deriveDailyHours(row) {
  if (!row) return {};
  const out = {};
  for (const d of DAYS) {
    const hrs = Number(row[`${d}_hours`]);
    if (Number.isFinite(hrs) && hrs > 0) {
      out[`${d}_hours`] = hrs;
      continue;
    }
    const s = row[`${d}_start`];
    const e = row[`${d}_end`];
    if (s && e) {
      const [sh, sm] = String(s).split(':').map((n) => parseInt(n, 10));
      const [eh, em] = String(e).split(':').map((n) => parseInt(n, 10));
      if (Number.isFinite(sh) && Number.isFinite(eh)) {
        const minutes = eh * 60 + em - (sh * 60 + sm) - (Number(row[`${d}_break_minutes`]) || 0);
        out[`${d}_hours`] = Math.max(0, Math.round((minutes / 60) * 10) / 10);
        continue;
      }
    }
    out[`${d}_hours`] = 0;
  }
  return out;
}

async function loadCompanyDefault(companyId) {
  try {
    const r = await pool.query(
      `SELECT * FROM company_default_work_hours WHERE company_id = $1`,
      [companyId],
    );
    return companyDefaultRowOrFallback(r.rows[0] || null);
  } catch {
    return companyDefaultRowOrFallback(null);
  }
}

// GET /api/work-hours/:userId
router.get('/:userId', async (req, res) => {
  try {
    await ensureWorkHoursSchema(pool);
    const { userId } = req.params;
    const access = await getActiveCompanyId(req);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const { companyId } = access;

    const member = await pool.query(
      'SELECT id FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, companyId],
    );
    if (member.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied: User not in same company' });
    }

    const result = await pool.query(
      'SELECT * FROM user_company_work_hours WHERE user_id = $1 AND company_id = $2',
      [userId, companyId],
    );

    // If no row yet, seed the response from the company default template so
    // the UI shows the "inherited" schedule but nothing is persisted until
    // the admin saves.
    if (result.rows.length === 0) {
      const tpl = await loadCompanyDefault(companyId);
      const seeded = {
        user_id: parseInt(userId, 10),
        company_id: companyId,
        work_hours_mode: tpl.work_hours_mode,
        start_address: null,
        end_address: null,
        use_company_default_location: true,
      };
      for (const d of DAYS) {
        seeded[`${d}_start`] = tpl[`${d}_start`] ? String(tpl[`${d}_start`]).slice(0, 5) : null;
        seeded[`${d}_end`] = tpl[`${d}_end`] ? String(tpl[`${d}_end`]).slice(0, 5) : null;
        seeded[`${d}_break_minutes`] = Number(tpl[`${d}_break_minutes`]) || 0;
        seeded[`${d}_hours`] = Number(tpl[`${d}_hours`]) || 0;
      }
      return res.json({ workHours: { ...seeded, ...deriveDailyHours(seeded) } });
    }

    const row = shapeWorkHoursRow(result.rows[0]);
    res.json({ workHours: { ...row, ...deriveDailyHours(row) } });
  } catch (error) {
    console.error('Error fetching work hours:', error);
    res.status(500).json({ error: 'Failed to fetch work hours' });
  }
});

// PUT /api/work-hours/:userId
router.put('/:userId', async (req, res) => {
  try {
    await ensureWorkHoursSchema(pool);
    const { userId } = req.params;
    const currentUserId = req.user.userId;

    const access = await getActiveCompanyId(req);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const { companyId, userRole } = access;

    const isAdmin = ADMIN_ROLES.has(String(userRole || '').toLowerCase());
    const editingSelf = String(userId) === String(currentUserId);
    if (!isAdmin && !editingSelf) {
      return res.status(403).json({
        error: 'Access denied: Only owners and admins can edit other users, or you can edit your own',
      });
    }

    const member = await pool.query(
      'SELECT id FROM user_companies WHERE user_id = $1 AND company_id = $2',
      [userId, companyId],
    );
    if (member.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied: User not in same company' });
    }

    // Load current row (or company default) so we never overwrite a field
    // with undefined when the client only sends a partial update.
    const existing = await pool.query(
      'SELECT * FROM user_company_work_hours WHERE user_id = $1 AND company_id = $2',
      [userId, companyId],
    );
    const current = existing.rows[0] || (await loadCompanyDefault(companyId));

    const workHours = req.body && req.body.workHours;
    const bodyMode = normaliseMode(
      (workHours && workHours.work_hours_mode) || req.body.work_hours_mode,
      current.work_hours_mode || 'flexible',
    );

    const valueFor = (key, fallback) => {
      if (workHours && workHours[key] !== undefined) return workHours[key];
      if (req.body[key] !== undefined) return req.body[key];
      return fallback;
    };

    const fields = {
      work_hours_mode: bodyMode,
    };
    for (const d of DAYS) {
      const sKey = `${d}_start`;
      const eKey = `${d}_end`;
      const bKey = `${d}_break_minutes`;
      const hKey = `${d}_hours`;

      fields[sKey] = normaliseTime(valueFor(sKey, current[sKey]));
      fields[eKey] = normaliseTime(valueFor(eKey, current[eKey]));

      const breakVal = valueFor(bKey, current[bKey]);
      fields[bKey] = Number.isFinite(Number(breakVal))
        ? Math.max(0, Math.min(480, Math.round(Number(breakVal))))
        : 0;

      // For flexible mode trust the number the client sent; for fixed mode
      // derive from start/end - break so the two stay consistent.
      let hoursVal;
      if (bodyMode === 'fixed' && fields[sKey] && fields[eKey]) {
        const [sh, sm] = fields[sKey].split(':').map((n) => parseInt(n, 10));
        const [eh, em] = fields[eKey].split(':').map((n) => parseInt(n, 10));
        const minutes = eh * 60 + em - (sh * 60 + sm) - fields[bKey];
        hoursVal = Math.max(0, Math.round((minutes / 60) * 10) / 10);
      } else if (bodyMode === 'fixed') {
        hoursVal = 0;
      } else {
        const raw = valueFor(hKey, current[hKey]);
        const num = Number(raw);
        hoursVal = Number.isFinite(num) ? Math.max(0, Math.min(24, Math.round(num * 10) / 10)) : 0;
      }
      fields[hKey] = hoursVal;
    }

    const startAddress = req.body.start_address !== undefined ? req.body.start_address : (current.start_address ?? null);
    const endAddress = req.body.end_address !== undefined ? req.body.end_address : (current.end_address ?? null);
    const useDefaultLoc = req.body.use_company_default_location !== undefined
      ? Boolean(req.body.use_company_default_location)
      : (current.use_company_default_location !== false);

    const dayCols = DAYS.flatMap((d) => [`${d}_hours`, `${d}_start`, `${d}_end`, `${d}_break_minutes`]);
    const cols = [
      'user_id',
      'company_id',
      'work_hours_mode',
      ...dayCols,
      'start_address',
      'end_address',
      'use_company_default_location',
    ];
    const values = [
      userId,
      companyId,
      fields.work_hours_mode,
      ...dayCols.map((c) => fields[c]),
      startAddress,
      endAddress,
      useDefaultLoc,
    ];
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const updateCols = cols
      .filter((c) => c !== 'user_id' && c !== 'company_id')
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(', ');

    const result = await pool.query(
      `INSERT INTO user_company_work_hours (${cols.join(', ')})
       VALUES (${placeholders})
       ON CONFLICT (user_id, company_id)
       DO UPDATE SET ${updateCols}, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      values,
    );

    const row = shapeWorkHoursRow(result.rows[0]);
    res.json({
      message: 'Work hours updated successfully',
      workHours: { ...row, ...deriveDailyHours(row) },
    });
  } catch (error) {
    console.error('Error updating work hours:', error);
    res.status(500).json({ error: 'Failed to update work hours' });
  }
});

module.exports = router;
