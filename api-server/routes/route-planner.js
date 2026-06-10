const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const {
  optimizeDay,
  optimizeWeek,
  ensureSchedulingSchema,
} = require('../services/routePlanner');

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

async function getActiveCompanyId(req) {
  const companyId = req.user?.activeCompanyId;
  const userId = req.user?.userId;
  if (!companyId || !userId) {
    return { error: 'No active company found in token', status: 400 };
  }
  const member = await pool.query(
    'SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2',
    [userId, companyId],
  );
  if (member.rows.length === 0) {
    return { error: 'Not a member of the active company', status: 403 };
  }
  return { companyId };
}

router.use(authenticateToken);

/**
 * POST /api/route-planner/optimize-day
 * Body: { user_id, date, job_ids?, locked_job_ids? }
 */
router.post('/optimize-day', async (req, res) => {
  try {
    await ensureSchedulingSchema();
    const access = await getActiveCompanyId(req);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const userId = parseInt(req.body?.user_id, 10);
    const date = String(req.body?.date || '').trim();
    if (!Number.isInteger(userId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'user_id and date (YYYY-MM-DD) are required' });
    }

    const jobIds = Array.isArray(req.body?.job_ids)
      ? req.body.job_ids.map(Number).filter(n => Number.isInteger(n))
      : null;
    const lockedJobIds = Array.isArray(req.body?.locked_job_ids)
      ? req.body.locked_job_ids.map(Number).filter(n => Number.isInteger(n))
      : null;

    const result = await optimizeDay({
      companyId: access.companyId,
      userId,
      date,
      jobIds,
      lockedJobIds,
    });

    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error('[route-planner] optimize-day failed', error);
    return res.status(500).json({ error: 'Failed to optimize route' });
  }
});

/**
 * POST /api/route-planner/optimize-week
 * Body: { start_date, end_date, user_ids? }
 */
router.post('/optimize-week', async (req, res) => {
  try {
    await ensureSchedulingSchema();
    const access = await getActiveCompanyId(req);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const startDate = String(req.body?.start_date || '').trim();
    const endDate = String(req.body?.end_date || '').trim();
    const userIds = Array.isArray(req.body?.user_ids)
      ? req.body.user_ids.map(Number).filter(n => Number.isInteger(n))
      : null;

    const result = await optimizeWeek({
      companyId: access.companyId,
      startDate,
      endDate,
      userIds,
    });

    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error('[route-planner] optimize-week failed', error);
    return res.status(500).json({ error: 'Failed to optimize week' });
  }
});

/**
 * POST /api/route-planner/apply-week
 * Body: { proposals: [{ jobId, to: { date, userId } }] }
 */
router.post('/apply-week', async (req, res) => {
  try {
    const access = await getActiveCompanyId(req);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const proposals = Array.isArray(req.body?.proposals) ? req.body.proposals : [];
    if (proposals.length === 0) {
      return res.status(400).json({ error: 'No proposals to apply' });
    }

    const applied = [];
    for (const p of proposals) {
      const jobId = parseInt(p.jobId, 10);
      const date = String(p.to?.date || '').trim();
      const userId = parseInt(p.to?.userId, 10);
      if (!Number.isInteger(jobId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(userId)) {
        continue;
      }

      await pool.query(
        `UPDATE jobs
         SET scheduled_date = $1::date, assigned_user_id = $2, updated_at = NOW()
         WHERE id = $3 AND company_id = $4`,
        [date, userId, jobId, access.companyId],
      );
      applied.push({ jobId, date, userId });
    }

    return res.json({ ok: true, applied });
  } catch (error) {
    console.error('[route-planner] apply-week failed', error);
    return res.status(500).json({ error: 'Failed to apply week plan' });
  }
});

module.exports = router;
