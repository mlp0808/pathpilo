const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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

router.use(authenticateToken);

// GET /api/daily-routes?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
// Returns all saved route data (order, drive times, leg times) for the date range.
router.get('/', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;

    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date query params required' });
    }

    const result = await pool.query(
      `SELECT user_id,
              to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
              total_minutes, total_km, total_job_minutes,
              job_ids, leg_minutes
       FROM daily_routes
       WHERE company_id = $1 AND scheduled_date BETWEEN $2 AND $3
       ORDER BY scheduled_date ASC, user_id ASC`,
      [companyId, start_date, end_date]
    );

    res.json({ routes: result.rows });
  } catch (error) {
    console.error('Error fetching daily routes:', error);
    res.status(500).json({ error: 'Failed to fetch daily routes' });
  }
});

// PUT /api/daily-routes — upsert one day's complete route log
// Body: { user_id, scheduled_date, total_minutes, total_km, total_job_minutes, job_ids, leg_minutes }
//   job_ids      — ordered array of real job IDs reflecting the saved route order
//   leg_minutes  — array of drive minutes between consecutive stops (null for first stop)
//   total_minutes     — total drive time in minutes
//   total_job_minutes — sum of estimated_duration for all jobs that day (minutes)
//   total_km          — total driving distance in km
router.put('/', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;

    const { user_id, scheduled_date, total_minutes, total_km, total_job_minutes, job_ids, leg_minutes } = req.body;
    if (!user_id || !scheduled_date) {
      return res.status(400).json({ error: 'user_id and scheduled_date are required' });
    }

    console.log('[daily-routes PUT] saving:', {
      companyId, user_id, scheduled_date,
      total_minutes, total_km, total_job_minutes,
      job_ids_type: typeof job_ids, job_ids_len: Array.isArray(job_ids) ? job_ids.length : job_ids,
      leg_minutes_type: typeof leg_minutes, leg_minutes_len: Array.isArray(leg_minutes) ? leg_minutes.length : leg_minutes,
    });

    // job_ids column is INTEGER[] — use PostgreSQL array literal.
    // All values are filtered to integers on the frontend, so no SQL injection risk.
    const jobIdsArr = Array.isArray(job_ids)
      ? job_ids.map(n => parseInt(n, 10)).filter(n => !isNaN(n))
      : [];
    const jobIdsClause = jobIdsArr.length > 0 ? `ARRAY[${jobIdsArr.join(',')}]` : 'NULL';

    // leg_minutes column is REAL[] — use PostgreSQL array literal.
    // Values are only finite floats or nulls, so no SQL injection risk.
    const legMinsArr = Array.isArray(leg_minutes) ? leg_minutes : [];
    const legMinsClause = legMinsArr.length > 0
      ? `ARRAY[${legMinsArr.map(v => (v == null || isNaN(v)) ? 'NULL' : parseFloat(v)).join(',')}]::real[]`
      : 'NULL';

    await pool.query(
      `INSERT INTO daily_routes
         (company_id, user_id, scheduled_date,
          total_minutes, total_km, total_job_minutes,
          job_ids, leg_minutes, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, ${jobIdsClause}, ${legMinsClause}, NOW())
       ON CONFLICT (company_id, user_id, scheduled_date)
       DO UPDATE SET
         total_minutes     = EXCLUDED.total_minutes,
         total_km          = EXCLUDED.total_km,
         total_job_minutes = EXCLUDED.total_job_minutes,
         job_ids           = ${jobIdsClause},
         leg_minutes       = ${legMinsClause},
         updated_at        = NOW()`,
      [
        companyId,
        user_id,
        scheduled_date,
        total_minutes ?? null,
        total_km ?? null,
        total_job_minutes ?? null,
      ]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('[daily-routes PUT] FAILED:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      stack: error?.stack?.split('\n').slice(0, 3).join(' | '),
    });
    res.status(500).json({ error: 'Failed to save daily route', detail: error?.message ?? String(error) });
  }
});

module.exports = router;
