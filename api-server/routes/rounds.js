/**
 * Rounds — reusable stop templates (library packages).
 *
 * Product model:
 *   - Round = ordered stop recipe + the connection between those stops.
 *   - One-time place → creates plain day jobs (no subscriptions).
 *   - Recurring place → creates a round-owned subscription per stop
 *     (recurring_jobs.round_id set). Same job-materialize logic as
 *     standalone subscriptions, but those subs are hidden from the
 *     Subscriptions list so people edit them via the round later.
 *   - daily_routes keeps the day bundle (jobs stay together on the calendar).
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const { ensureRoundsSchema, backfillPlannedRounds } = require('../services/roundSync');
const {
  ensureRoundStopSubscription,
  ensureSubscriptionJobOnDate,
  parseStopServices,
} = require('../services/roundSubscriptions');
const { buildRoundCalendar, asIntArray } = require('../services/roundCalendar');
const {
  ensureDailyRoutePackageColumns,
  upsertPlannedRoundPackage,
  clearFutureRoundPlacements,
  syncRoundOwnedSubscriptionCadence,
} = require('../services/roundPackages');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const VALID_STATUSES = new Set(['playground', 'saved', 'placed']);

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
async function loadRound(companyId, roundId) {
  await ensureRoundsSchema(pool);
  const roundRes = await pool.query(
    `SELECT r.id, r.company_id, r.name, r.status, r.assigned_user_id,
            to_char(r.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
            r.schedule_kind, r.day_of_week, r.interval_value,
            r.recurrence_type, r.day_of_month,
            to_char(r.starting_date, 'YYYY-MM-DD') AS starting_date,
            r.in_library, r.source_round_id,
            r.total_minutes, r.total_km, r.leg_minutes, r.round_template_id,
            r.daily_route_id, r.created_at, r.updated_at,
            u.first_name AS assigned_first_name,
            u.last_name AS assigned_last_name
     FROM rounds r
     LEFT JOIN users u ON u.id = r.assigned_user_id
     WHERE r.id = $1 AND r.company_id = $2`,
    [roundId, companyId]
  );
  if (roundRes.rows.length === 0) return null;
  const stopsRes = await pool.query(
    `SELECT rs.*,
            c.name AS client_name,
            c.last_name AS client_last_name,
            c.address AS client_address,
            c.zip_code AS client_zip_code,
            c.city AS client_city,
            COALESCE(rs.lat, c.lat) AS resolved_lat,
            COALESCE(rs.lng, c.lng) AS resolved_lng,
            rj.id AS linked_subscription_id,
            to_char(rj.paused_at, 'YYYY-MM-DD') AS subscription_paused_at,
            rj.is_active AS subscription_is_active
     FROM round_stops rs
     LEFT JOIN clients c ON c.id = rs.client_id
     LEFT JOIN recurring_jobs rj ON rj.id = rs.recurring_job_id
     WHERE rs.round_id = $1
     ORDER BY rs.position ASC, rs.id ASC`,
    [roundId]
  );
  const placementsRes = await pool.query(
    `SELECT to_char(dr.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
            dr.user_id AS assigned_user_id, dr.id AS daily_route_id,
            dr.name, dr.status,
            COALESCE(cardinality(dr.job_ids), 0) AS job_count,
            u.first_name AS assigned_first_name,
            u.last_name AS assigned_last_name
     FROM daily_routes dr
     LEFT JOIN users u ON u.id = dr.user_id
     WHERE dr.company_id = $1 AND dr.round_id = $2 AND dr.status = 'planned'
     ORDER BY dr.scheduled_date DESC`,
    [companyId, roundId]
  ).catch(() => ({ rows: [] }));

  const subscriptionsRes = await pool.query(
    `SELECT rj.id, rj.title, rj.client_id, rj.assigned_user_id,
            rj.recurrence_type, rj.day_of_week, rj.day_of_month, rj.interval_value,
            to_char(rj.starting_date, 'YYYY-MM-DD') AS starting_date,
            to_char(rj.paused_at, 'YYYY-MM-DD') AS paused_at,
            rj.is_active,
            c.name AS client_name, c.last_name AS client_last_name,
            c.address, c.zip_code, c.city,
            rs.id AS stop_id, rs.position AS stop_position
     FROM recurring_jobs rj
     LEFT JOIN clients c ON c.id = rj.client_id
     LEFT JOIN round_stops rs ON rs.recurring_job_id = rj.id AND rs.round_id = $1
     WHERE rj.company_id = $2 AND rj.round_id = $1 AND rj.is_active = true
     ORDER BY COALESCE(rs.position, 999), rj.id`,
    [roundId, companyId]
  ).catch(() => ({ rows: [] }));

  return {
    ...roundRes.rows[0],
    stops: stopsRes.rows,
    placements: placementsRes.rows || [],
    subscriptions: subscriptionsRes.rows || [],
  };
}

/** Push round placement (date / employee) onto all linked jobs. Null stays "Any". */
async function syncRoundJobsPlacement(companyId, roundId) {
  const roundRes = await pool.query(
    `SELECT assigned_user_id, to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date
     FROM rounds WHERE id = $1 AND company_id = $2`,
    [roundId, companyId]
  );
  if (roundRes.rows.length === 0) return;
  const { assigned_user_id, scheduled_date } = roundRes.rows[0];
  await pool.query(
    `UPDATE jobs j
     SET assigned_user_id = $3,
         scheduled_date = $4,
         updated_at = NOW()
     FROM round_stops rs
     WHERE rs.round_id = $1
       AND rs.job_id = j.id
       AND j.company_id = $2`,
    [roundId, companyId, assigned_user_id, scheduled_date]
  );
}

// POST /api/rounds — create a playground (or placed) round
router.post('/', async (req, res) => {
  try {
    await ensureRoundsSchema(pool);
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;

    const name = (req.body?.name && String(req.body.name).trim()) || null;
    const status = VALID_STATUSES.has(req.body?.status) ? req.body.status : 'playground';
    const assigned_user_id = req.body?.assigned_user_id != null ? Number(req.body.assigned_user_id) : null;
    const scheduled_date = req.body?.scheduled_date || null;
    // Explicit create-from-Rounds / map focus=round sends in_library: true.
    const inLibrary = req.body?.in_library === true || req.body?.in_library === 'true' || req.body?.in_library === 1;

    const result = await pool.query(
      `INSERT INTO rounds (company_id, name, status, assigned_user_id, scheduled_date, in_library)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, company_id, name, status, assigned_user_id,
                 to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
                 in_library`,
      [companyId, name, status, Number.isFinite(assigned_user_id) ? assigned_user_id : null, scheduled_date, inLibrary]
    );
    res.status(201).json({ round: { ...result.rows[0], stops: [], placements: [] } });
  } catch (error) {
    console.error('POST /rounds', error);
    res.status(500).json({ error: 'Failed to create round: ' + error.message });
  }
});

// GET /api/rounds?status=playground|saved|placed&in_library=1
router.get('/', async (req, res) => {
  try {
    await ensureRoundsSchema(pool);
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const status = req.query.status ? String(req.query.status) : null;
    const inLibraryOnly = req.query.in_library === '1' || req.query.in_library === 'true';

    // Pull in any planned day routes that never got a Round row (older saves /
    // failed syncs). Those stay in_library=false and won't appear on the library page.
    try {
      await backfillPlannedRounds(pool, companyId);
    } catch (bfErr) {
      console.warn('[GET /rounds] backfill failed:', bfErr?.message || bfErr);
    }

    const params = [companyId];
    let where = 'r.company_id = $1';
    if (status && VALID_STATUSES.has(status)) {
      params.push(status);
      where += ` AND r.status = $${params.length}`;
    }
    if (inLibraryOnly) {
      where += ` AND r.in_library = TRUE`;
      // Empty create shells should never land in the library list.
      where += ` AND NOT (
        r.status = 'playground'
        AND NOT EXISTS (SELECT 1 FROM round_stops s WHERE s.round_id = r.id)
      )`;
    }

    const result = await pool.query(
      `SELECT r.id, r.name, r.status, r.assigned_user_id,
              to_char(r.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
              r.schedule_kind, r.day_of_week, r.interval_value,
              r.in_library, r.source_round_id,
              r.total_minutes, r.total_km, r.round_template_id, r.daily_route_id,
              r.created_at, r.updated_at,
              (r.round_template_id IS NOT NULL OR r.schedule_kind = 'recurring') AS is_recurring,
              rt.name AS template_name,
              rt.is_active AS template_active,
              COALESCE(r.day_of_week, rt.day_of_week) AS template_day_of_week,
              COALESCE(r.interval_value, rt.interval_value) AS template_interval_value,
              u.first_name AS assigned_first_name,
              u.last_name AS assigned_last_name,
              (SELECT COUNT(*)::int FROM round_stops s WHERE s.round_id = r.id) AS stop_count,
              (SELECT COUNT(*)::int FROM daily_routes dr
                WHERE dr.round_id = r.id AND dr.status = 'planned') AS placement_count
       FROM rounds r
       LEFT JOIN round_templates rt ON rt.id = r.round_template_id
       LEFT JOIN users u ON u.id = r.assigned_user_id
       WHERE ${where}
       ORDER BY r.updated_at DESC NULLS LAST, r.id DESC
       LIMIT 500`,
      params
    );
    res.json({ rounds: result.rows });
  } catch (error) {
    console.error('GET /rounds', error);
    res.status(500).json({ error: 'Failed to list rounds: ' + error.message });
  }
});

// POST /api/rounds/from-day — snapshot a planned day into a library package (copy).
// Body: { user_id, date, name? }
// Does not change the day's jobs — only creates a reusable round in the library.
router.post('/from-day', async (req, res) => {
  try {
    await ensureRoundsSchema(pool);
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;

    const userId = Number(req.body?.user_id);
    const date = req.body?.date ? String(req.body.date).slice(0, 10) : null;
    const name = (req.body?.name && String(req.body.name).trim()) || null;
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
    }

    const routeRes = await pool.query(
      `SELECT id, job_ids, name, total_minutes, total_km
       FROM daily_routes
       WHERE company_id = $1 AND user_id = $2 AND scheduled_date = $3
       LIMIT 1`,
      [companyId, userId, date]
    );
    const route = routeRes.rows[0];
    const jobIds = Array.isArray(route?.job_ids)
      ? route.job_ids.map(Number).filter(n => Number.isInteger(n) && n > 0)
      : [];

    // Fallback: jobs assigned that day if no daily_routes row yet.
    let ids = jobIds;
    if (ids.length === 0) {
      const jobsRes = await pool.query(
        `SELECT id FROM jobs
         WHERE company_id = $1 AND assigned_user_id = $2 AND scheduled_date = $3
           AND COALESCE(status, 'scheduled') NOT IN ('cancelled')
         ORDER BY sort_order ASC NULLS LAST, id ASC`,
        [companyId, userId, date]
      );
      ids = jobsRes.rows.map(r => Number(r.id));
    }
    if (ids.length === 0) {
      return res.status(400).json({ error: 'No jobs on that day to save as a round' });
    }

    const insert = await pool.query(
      `INSERT INTO rounds (
         company_id, name, status, assigned_user_id, scheduled_date,
         total_minutes, total_km, in_library, schedule_kind, updated_at
       ) VALUES ($1, $2, 'saved', $3, NULL, $4, $5, TRUE, NULL, NOW())
       RETURNING id`,
      [
        companyId,
        name || (route?.name && String(route.name).trim()) || `Round ${date}`,
        userId,
        route?.total_minutes != null ? Math.round(Number(route.total_minutes)) : null,
        route?.total_km != null ? Number(route.total_km) : null,
      ]
    );
    const roundId = insert.rows[0].id;

    const jobsDetail = await pool.query(
      `SELECT j.id, j.client_id, j.title, j.lat, j.lng,
              COALESCE((
                SELECT SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes, 0))
                FROM job_services js
                LEFT JOIN services s ON s.id = js.service_id
                WHERE js.job_id = j.id
              ), 30)::int AS estimated_duration,
              c.name AS client_name, c.last_name AS client_last_name,
              c.address, c.zip_code, c.city, c.lat AS c_lat, c.lng AS c_lng
       FROM jobs j
       LEFT JOIN clients c ON c.id = j.client_id
       WHERE j.company_id = $1 AND j.id = ANY($2::int[])`,
      [companyId, ids]
    );
    const byId = new Map(jobsDetail.rows.map(r => [Number(r.id), r]));

    let position = 0;
    for (const jobId of ids) {
      const job = byId.get(jobId);
      if (!job) continue;
      const label = [job.client_name, job.client_last_name].filter(Boolean).join(' ').trim()
        || job.title
        || `Stop ${position + 1}`;

      const svcRes = await pool.query(
        `SELECT service_id, custom_title, custom_price, custom_duration_minutes
         FROM job_services WHERE job_id = $1`,
        [jobId]
      );

      await pool.query(
        `INSERT INTO round_stops (
           round_id, position, client_id, job_id, label, address, zip_code, city,
           lat, lng, estimated_duration_minutes, services
         ) VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
        [
          roundId,
          position,
          job.client_id || null,
          label,
          job.address || null,
          job.zip_code || null,
          job.city || null,
          job.lat != null ? Number(job.lat) : (job.c_lat != null ? Number(job.c_lat) : null),
          job.lng != null ? Number(job.lng) : (job.c_lng != null ? Number(job.c_lng) : null),
          job.estimated_duration != null ? Number(job.estimated_duration) : 30,
          JSON.stringify(svcRes.rows.map(s => ({
            service_id: s.service_id,
            custom_title: s.custom_title,
            custom_price: s.custom_price,
            custom_duration_minutes: s.custom_duration_minutes,
          }))),
        ]
      );
      position += 1;
    }

    const round = await loadRound(companyId, roundId);
    res.status(201).json({ round });
  } catch (error) {
    console.error('POST /rounds/from-day', error);
    res.status(500).json({ error: 'Failed to save round to library: ' + error.message });
  }
});

// GET /api/rounds/:id
router.get('/:id', async (req, res) => {
  try {
    await ensureRoundsSchema(pool);
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const round = await loadRound(companyAccess.companyId, Number(req.params.id));
    if (!round) return res.status(404).json({ error: 'Round not found' });
    res.json({ round });
  } catch (error) {
    console.error('GET /rounds/:id', error);
    res.status(500).json({ error: 'Failed to load round: ' + error.message });
  }
});

// GET /api/rounds/:id/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/:id/calendar', async (req, res) => {
  try {
    await ensureRoundsSchema(pool);
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const roundId = Number(req.params.id);
    const round = await loadRound(companyId, roundId);
    if (!round) return res.status(404).json({ error: 'Round not found' });

    let from = req.query.from ? String(req.query.from).slice(0, 10) : null;
    let to = req.query.to ? String(req.query.to).slice(0, 10) : null;
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const last = new Date(y, m + 1, 0).getDate();
      to = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    }

    const calendar = await buildRoundCalendar(pool, { companyId, round, fromYmd: from, toYmd: to });
    res.json({ round_id: roundId, ...calendar });
  } catch (error) {
    console.error('GET /rounds/:id/calendar', error);
    res.status(500).json({ error: 'Failed to load calendar: ' + error.message });
  }
});

// POST /api/rounds/:id/calendar/cancel
// Body: { date, scope: 'round_only' | 'all' }
router.post('/:id/calendar/cancel', async (req, res) => {
  const dbClient = await pool.connect();
  try {
    await ensureRoundsSchema(pool);
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const roundId = Number(req.params.id);
    const date = req.body?.date ? String(req.body.date).slice(0, 10) : null;
    const scope = req.body?.scope === 'all' ? 'all' : 'round_only';
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
    }

    const round = await loadRound(companyId, roundId);
    if (!round) return res.status(404).json({ error: 'Round not found' });

    const routeRes = await dbClient.query(
      `SELECT id, job_ids, round_job_ids, user_id
       FROM daily_routes
       WHERE company_id = $1 AND round_id = $2 AND scheduled_date = $3 AND status = 'planned'
       LIMIT 1`,
      [companyId, roundId, date]
    );
    if (!routeRes.rows[0]) return res.status(404).json({ error: 'No placed round on that day' });
    const route = routeRes.rows[0];
    const jobIds = asIntArray(route.job_ids);
    let roundJobIds = asIntArray(route.round_job_ids);
    if (roundJobIds.length === 0) roundJobIds = jobIds;
    const cancelIds = scope === 'all' ? jobIds : roundJobIds;

    await dbClient.query('BEGIN');
    if (cancelIds.length > 0) {
      await dbClient.query(
        `UPDATE jobs SET status = 'cancelled', updated_at = NOW()
         WHERE company_id = $1 AND id = ANY($2::int[])
           AND COALESCE(status, 'scheduled') NOT IN ('completed', 'sub_completed')
           AND invoice_id IS NULL`,
        [companyId, cancelIds]
      );
    }

    if (scope === 'all') {
      await dbClient.query(
        `DELETE FROM daily_routes WHERE id = $1 AND company_id = $2`,
        [route.id, companyId]
      );
    } else {
      const remaining = jobIds.filter(id => !roundJobIds.includes(id));
      if (remaining.length === 0) {
        await dbClient.query(
          `DELETE FROM daily_routes WHERE id = $1 AND company_id = $2`,
          [route.id, companyId]
        );
      } else {
        await dbClient.query(
          `UPDATE daily_routes SET
             job_ids = $2::int[],
             round_job_ids = NULL,
             round_id = NULL,
             name = COALESCE(name, 'Route'),
             updated_at = NOW()
           WHERE id = $1`,
          [route.id, remaining]
        );
      }
    }
    await dbClient.query('COMMIT');
    res.json({ ok: true, cancelled: cancelIds.length, scope });
  } catch (error) {
    try { await dbClient.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('POST /rounds/:id/calendar/cancel', error);
    res.status(500).json({ error: 'Failed to cancel: ' + error.message });
  } finally {
    dbClient.release();
  }
});

// POST /api/rounds/:id/calendar/move
// Body: { from_date, to_date, scope: 'round_only' | 'all', to_user_id? }
router.post('/:id/calendar/move', async (req, res) => {
  const dbClient = await pool.connect();
  try {
    await ensureRoundsSchema(pool);
    await pool.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS round_job_ids INTEGER[]`).catch(() => {});
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const roundId = Number(req.params.id);
    const fromDate = req.body?.from_date ? String(req.body.from_date).slice(0, 10) : null;
    const toDate = req.body?.to_date ? String(req.body.to_date).slice(0, 10) : null;
    const scope = req.body?.scope === 'all' ? 'all' : 'round_only';
    const toUserId = req.body?.to_user_id != null ? Number(req.body.to_user_id) : null;
    if (!fromDate || !toDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      return res.status(400).json({ error: 'from_date and to_date are required' });
    }
    if (fromDate === toDate && (toUserId == null || !Number.isFinite(toUserId))) {
      return res.status(400).json({ error: 'Pick a different day (or employee)' });
    }

    const round = await loadRound(companyId, roundId);
    if (!round) return res.status(404).json({ error: 'Round not found' });

    const srcRes = await dbClient.query(
      `SELECT id, job_ids, round_job_ids, user_id, name
       FROM daily_routes
       WHERE company_id = $1 AND round_id = $2 AND scheduled_date = $3 AND status = 'planned'
       LIMIT 1`,
      [companyId, roundId, fromDate]
    );
    if (!srcRes.rows[0]) return res.status(404).json({ error: 'No placed round on that day' });
    const src = srcRes.rows[0];
    const targetUser = (Number.isInteger(toUserId) && toUserId > 0) ? toUserId : Number(src.user_id);
    const jobIds = asIntArray(src.job_ids);
    let roundJobIds = asIntArray(src.round_job_ids);
    if (roundJobIds.length === 0) roundJobIds = jobIds;
    const moveIds = scope === 'all' ? jobIds : roundJobIds;
    const stayIds = scope === 'all' ? [] : jobIds.filter(id => !roundJobIds.includes(id));
    const packageName = (src.name && String(src.name).trim())
      || (round.name && String(round.name).trim())
      || 'Untitled round';

    const clash = await dbClient.query(
      `SELECT id, round_id, job_ids FROM daily_routes
       WHERE company_id = $1 AND user_id = $2 AND scheduled_date = $3
       LIMIT 1`,
      [companyId, targetUser, toDate]
    );
    if (clash.rows[0] && Number(clash.rows[0].id) !== Number(src.id)) {
      // Allow merge only when target is empty of a different package — refuse hard clash with another planned package.
      const otherJobs = asIntArray(clash.rows[0].job_ids);
      if (otherJobs.length > 0 && clash.rows[0].round_id != null && Number(clash.rows[0].round_id) !== roundId) {
        return res.status(409).json({ error: 'That day already has another round package' });
      }
    }

    await dbClient.query('BEGIN');

    if (moveIds.length > 0) {
      await dbClient.query(
        `UPDATE jobs SET scheduled_date = $1, assigned_user_id = $2, updated_at = NOW()
         WHERE company_id = $3 AND id = ANY($4::int[])`,
        [toDate, targetUser, companyId, moveIds]
      );
    }

    if (scope === 'all') {
      if (clash.rows[0] && Number(clash.rows[0].id) !== Number(src.id)) {
        await dbClient.query(`DELETE FROM daily_routes WHERE id = $1`, [clash.rows[0].id]);
      }
      await dbClient.query(
        `UPDATE daily_routes SET
           scheduled_date = $1,
           user_id = $2,
           job_ids = $3::int[],
           round_job_ids = $4::int[],
           name = $5,
           status = 'planned',
           round_id = $6,
           route_geometry = NULL,
           updated_at = NOW()
         WHERE id = $7`,
        [toDate, targetUser, moveIds, roundJobIds, packageName, roundId, src.id]
      );
    } else {
      // Leave extras on the source day; move round jobs to target.
      if (stayIds.length === 0) {
        await dbClient.query(`DELETE FROM daily_routes WHERE id = $1`, [src.id]);
      } else {
        await dbClient.query(
          `UPDATE daily_routes SET
             job_ids = $2::int[],
             round_job_ids = NULL,
             round_id = NULL,
             updated_at = NOW()
           WHERE id = $1`,
          [src.id, stayIds]
        );
      }

      if (clash.rows[0]) {
        const existingIds = asIntArray(clash.rows[0].job_ids);
        const merged = [...moveIds, ...existingIds.filter(id => !moveIds.includes(id))];
        await dbClient.query(
          `UPDATE daily_routes SET
             job_ids = $2::int[],
             round_job_ids = $3::int[],
             name = $4,
             status = 'planned',
             round_id = $5,
             updated_at = NOW()
           WHERE id = $1`,
          [clash.rows[0].id, merged, moveIds, packageName, roundId]
        );
      } else {
        await dbClient.query(
          `INSERT INTO daily_routes
             (company_id, user_id, scheduled_date, job_ids, round_job_ids, name, status, round_id, updated_at)
           VALUES ($1, $2, $3, $4::int[], $5::int[], $6, 'planned', $7, NOW())`,
          [companyId, targetUser, toDate, moveIds, moveIds, packageName, roundId]
        );
      }
    }

    await dbClient.query('COMMIT');
    res.json({ ok: true, moved: moveIds.length, scope, to_date: toDate, to_user_id: targetUser });
  } catch (error) {
    try { await dbClient.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('POST /rounds/:id/calendar/move', error);
    res.status(500).json({ error: 'Failed to move: ' + error.message });
  } finally {
    dbClient.release();
  }
});

// POST /api/rounds/:id/stops — append a stop (client and/or lat/lng location)
router.post('/:id/stops', async (req, res) => {
  try {
    await ensureRoundsSchema(pool);
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const roundId = Number(req.params.id);
    if (!Number.isFinite(roundId)) return res.status(400).json({ error: 'Invalid round id' });

    const existing = await pool.query(
      `SELECT id FROM rounds WHERE id = $1 AND company_id = $2`,
      [roundId, companyId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Round not found' });

    let client_id = req.body?.client_id != null ? Number(req.body.client_id) : null;
    let label = (req.body?.label && String(req.body.label).trim()) || null;
    let address = (req.body?.address && String(req.body.address).trim()) || null;
    let zip_code = (req.body?.zip_code && String(req.body.zip_code).trim()) || null;
    let city = (req.body?.city && String(req.body.city).trim()) || null;
    let lat = req.body?.lat != null ? Number(req.body.lat) : null;
    let lng = req.body?.lng != null ? Number(req.body.lng) : null;
    let duration = req.body?.estimated_duration_minutes != null
      ? Number(req.body.estimated_duration_minutes)
      : null;
    let services = Array.isArray(req.body?.services) ? req.body.services : null;
    const job_id = req.body?.job_id != null && Number.isFinite(Number(req.body.job_id))
      ? Number(req.body.job_id)
      : null;

    // When linking a real job, hydrate client / duration from that job.
    if (job_id != null) {
      const jobRes = await pool.query(
        `SELECT j.id, j.client_id, j.lat, j.lng,
                c.name, c.last_name, c.address, c.zip_code, c.city, c.lat AS c_lat, c.lng AS c_lng,
                COALESCE((
                  SELECT SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes, 0))
                  FROM job_services js
                  LEFT JOIN services s ON s.id = js.service_id
                  WHERE js.job_id = j.id
                ), 30) AS duration_minutes
         FROM jobs j
         LEFT JOIN clients c ON c.id = j.client_id
         WHERE j.id = $1 AND j.company_id = $2`,
        [job_id, companyId]
      );
      if (jobRes.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
      const row = jobRes.rows[0];
      if (!Number.isFinite(client_id) && row.client_id != null) client_id = Number(row.client_id);
      label = label || [row.name, row.last_name].filter(Boolean).join(' ').trim() || `Job #${row.id}`;
      address = address || row.address;
      zip_code = zip_code || row.zip_code;
      city = city || row.city;
      if (!Number.isFinite(lat)) {
        lat = row.lat != null ? Number(row.lat) : (row.c_lat != null ? Number(row.c_lat) : null);
      }
      if (!Number.isFinite(lng)) {
        lng = row.lng != null ? Number(row.lng) : (row.c_lng != null ? Number(row.c_lng) : null);
      }
      if (!Number.isFinite(duration)) duration = Number(row.duration_minutes) || 30;
    }

    if (!Number.isFinite(duration)) duration = 30;

    if (Number.isFinite(client_id)) {
      const c = await pool.query(
        `SELECT id, name, last_name, address, zip_code, city, lat, lng
         FROM clients WHERE id = $1 AND company_id = $2`,
        [client_id, companyId]
      );
      if (c.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
      const row = c.rows[0];
      label = label || [row.name, row.last_name].filter(Boolean).join(' ').trim() || `Client #${row.id}`;
      address = address || row.address;
      zip_code = zip_code || row.zip_code;
      city = city || row.city;
      if (!Number.isFinite(lat)) lat = row.lat != null ? Number(row.lat) : null;
      if (!Number.isFinite(lng)) lng = row.lng != null ? Number(row.lng) : null;
    }

    if (!label && !Number.isFinite(client_id) && job_id == null) {
      return res.status(400).json({ error: 'client_id, job_id, or label required' });
    }

    // Skip exact duplicate client stop already on this round.
    if (Number.isFinite(client_id)) {
      const dup = await pool.query(
        `SELECT id FROM round_stops WHERE round_id = $1 AND client_id = $2 LIMIT 1`,
        [roundId, client_id]
      );
      if (dup.rows.length > 0) {
        // If the duplicate was missing a job link, attach it now.
        if (job_id != null) {
          await pool.query(
            `UPDATE round_stops SET job_id = COALESCE(job_id, $3) WHERE round_id = $1 AND client_id = $2`,
            [roundId, client_id, job_id]
          );
        }
        const round = await loadRound(companyId, roundId);
        return res.json({ round, duplicated: true });
      }
    }

    const posRes = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM round_stops WHERE round_id = $1`,
      [roundId]
    );
    const position = Number(posRes.rows[0].next_pos) || 0;

    await pool.query(
      `INSERT INTO round_stops (
         round_id, position, client_id, job_id, label, address, zip_code, city, lat, lng, estimated_duration_minutes, services
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
      [
        roundId,
        position,
        Number.isFinite(client_id) ? client_id : null,
        job_id,
        label,
        address,
        zip_code,
        city,
        Number.isFinite(lat) ? lat : null,
        Number.isFinite(lng) ? lng : null,
        Number.isFinite(duration) ? duration : 30,
        services ? JSON.stringify(services) : null,
      ]
    );
    await pool.query(`UPDATE rounds SET updated_at = NOW() WHERE id = $1`, [roundId]);

    const round = await loadRound(companyId, roundId);
    res.status(201).json({ round });
  } catch (error) {
    console.error('POST /rounds/:id/stops', error);
    res.status(500).json({ error: 'Failed to add stop: ' + error.message });
  }
});

// PUT /api/rounds/:id/stops/order — body: { stop_ids: number[] }
router.put('/:id/stops/order', async (req, res) => {
  try {
    await ensureRoundsSchema(pool);
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const roundId = Number(req.params.id);
    const stopIds = Array.isArray(req.body?.stop_ids) ? req.body.stop_ids.map(Number).filter(Number.isFinite) : [];

    const existing = await pool.query(
      `SELECT id FROM rounds WHERE id = $1 AND company_id = $2`,
      [roundId, companyId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Round not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < stopIds.length; i++) {
        await client.query(
          `UPDATE round_stops SET position = $1 WHERE id = $2 AND round_id = $3`,
          [i, stopIds[i], roundId]
        );
      }
      await client.query(`UPDATE rounds SET updated_at = NOW() WHERE id = $1`, [roundId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const round = await loadRound(companyId, roundId);
    res.json({ round });
  } catch (error) {
    console.error('PUT /rounds/:id/stops/order', error);
    res.status(500).json({ error: 'Failed to reorder stops: ' + error.message });
  }
});

// PATCH /api/rounds/:id/stops/:stopId/pause — pause/resume the stop's round-owned subscription
router.patch('/:id/stops/:stopId/pause', async (req, res) => {
  try {
    await ensureRoundsSchema(pool);
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const roundId = Number(req.params.id);
    const stopId = Number(req.params.stopId);
    const paused = req.body?.paused === true;

    const stopRes = await pool.query(
      `SELECT rs.id, rs.recurring_job_id
       FROM round_stops rs
       JOIN rounds r ON r.id = rs.round_id
       WHERE rs.id = $1 AND rs.round_id = $2 AND r.company_id = $3`,
      [stopId, roundId, companyId]
    );
    if (!stopRes.rows[0]) return res.status(404).json({ error: 'Stop not found' });
    const subId = stopRes.rows[0].recurring_job_id != null
      ? Number(stopRes.rows[0].recurring_job_id)
      : null;
    if (subId == null) {
      return res.status(400).json({ error: 'This stop has no subscription yet — place the round as Repeat first.' });
    }

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    if (paused) {
      const { deleteFutureNonCompletedJobsForSubscription } = require('../utils/subscriptionStopCleanup');
      await deleteFutureNonCompletedJobsForSubscription(pool, companyId, subId, { asOfDate: todayStr }).catch(() => {});
      await pool.query(
        `UPDATE recurring_jobs SET paused_at = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3`,
        [todayStr, subId, companyId]
      );
    } else {
      await pool.query(
        `UPDATE recurring_jobs SET paused_at = NULL, updated_at = NOW() WHERE id = $1 AND company_id = $2`,
        [subId, companyId]
      );
    }

    const round = await loadRound(companyId, roundId);
    res.json({ round, paused });
  } catch (error) {
    console.error('PATCH /rounds/:id/stops/:stopId/pause', error);
    res.status(500).json({ error: 'Failed to pause stop: ' + error.message });
  }
});

// DELETE /api/rounds/:id/stops/:stopId
router.delete('/:id/stops/:stopId', async (req, res) => {
  try {
    await ensureRoundsSchema(pool);
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const roundId = Number(req.params.id);
    const stopId = Number(req.params.stopId);

    const existing = await pool.query(
      `SELECT id FROM rounds WHERE id = $1 AND company_id = $2`,
      [roundId, companyId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Round not found' });

    await pool.query(`DELETE FROM round_stops WHERE id = $1 AND round_id = $2`, [stopId, roundId]);
    await pool.query(`UPDATE rounds SET updated_at = NOW() WHERE id = $1`, [roundId]);
    const round = await loadRound(companyId, roundId);
    res.json({ round });
  } catch (error) {
    console.error('DELETE /rounds/:id/stops/:stopId', error);
    res.status(500).json({ error: 'Failed to remove stop: ' + error.message });
  }
});

// DELETE /api/rounds/:id — remove the library round setup.
// Future planned day packages (and their round jobs) are soft-deleted.
// Past placements are left alone for history.
router.delete('/:id', async (req, res) => {
  const dbClient = await pool.connect();
  try {
    await ensureRoundsSchema(pool);
    await ensureDailyRoutePackageColumns(pool);

    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const roundId = Number(req.params.id);
    if (!Number.isFinite(roundId)) return res.status(400).json({ error: 'Invalid round id' });

    const existing = await dbClient.query(
      `SELECT id FROM rounds WHERE id = $1 AND company_id = $2`,
      [roundId, companyId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Round not found' });

    const todayYmd = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    })();

    await dbClient.query('BEGIN');

    // Future day packages for this round.
    const futureRoutes = await dbClient.query(
      `SELECT id, job_ids, round_job_ids, LEFT(scheduled_date::text, 10) AS scheduled_date
       FROM daily_routes
       WHERE company_id = $1
         AND round_id = $2
         AND status = 'planned'
         AND LEFT(scheduled_date::text, 10) >= $3`,
      [companyId, roundId, todayYmd]
    );

    let cancelledJobs = 0;
    let removedPackages = 0;

    for (const route of futureRoutes.rows) {
      const jobIds = asIntArray(route.job_ids);
      let roundJobIds = asIntArray(route.round_job_ids);
      if (roundJobIds.length === 0) roundJobIds = jobIds;
      // Soft-delete the round unit; leave same-day fillers (jobs outside round_job_ids).
      const cancelIds = roundJobIds;

      if (cancelIds.length > 0) {
        const cancelled = await dbClient.query(
          `UPDATE jobs SET status = 'deleted', updated_at = NOW()
           WHERE company_id = $1 AND id = ANY($2::int[])
             AND COALESCE(status, 'scheduled') NOT IN ('completed', 'sub_completed', 'deleted')
             AND invoice_id IS NULL
           RETURNING id`,
          [companyId, cancelIds]
        );
        cancelledJobs += cancelled.rows.length;
      }

      const remaining = jobIds.filter(id => !roundJobIds.includes(id));
      if (remaining.length === 0) {
        await dbClient.query(
          `DELETE FROM daily_routes WHERE id = $1 AND company_id = $2`,
          [route.id, companyId]
        );
      } else {
        await dbClient.query(
          `UPDATE daily_routes SET
             job_ids = $2::int[],
             round_job_ids = NULL,
             round_id = NULL,
             name = COALESCE(NULLIF(name, ''), 'Route'),
             updated_at = NOW()
           WHERE id = $1`,
          [route.id, remaining]
        );
      }
      removedPackages += 1;
    }

    // Past packages: drop the library link but keep history on the calendar.
    await dbClient.query(
      `UPDATE daily_routes SET round_id = NULL, updated_at = NOW()
       WHERE company_id = $1 AND round_id = $2
         AND LEFT(scheduled_date::text, 10) < $3`,
      [companyId, roundId, todayYmd]
    );

    // Round-owned subscriptions: deactivate and cancel their future jobs.
    const subs = await dbClient.query(
      `SELECT id FROM recurring_jobs WHERE company_id = $1 AND round_id = $2`,
      [companyId, roundId]
    );
    const subIds = subs.rows.map(r => Number(r.id)).filter(n => Number.isInteger(n) && n > 0);
    if (subIds.length > 0) {
      await dbClient.query(
        `UPDATE recurring_jobs SET is_active = FALSE, updated_at = NOW()
         WHERE company_id = $1 AND id = ANY($2::int[])`,
        [companyId, subIds]
      );
      const futureSubJobs = await dbClient.query(
        `UPDATE jobs SET status = 'deleted', updated_at = NOW()
         WHERE company_id = $1
           AND recurring_job_id = ANY($2::int[])
           AND LEFT(scheduled_date::text, 10) >= $3
           AND COALESCE(status, 'scheduled') NOT IN ('completed', 'sub_completed', 'cancelled', 'deleted')
           AND invoice_id IS NULL
         RETURNING id`,
        [companyId, subIds, todayYmd]
      );
      cancelledJobs += futureSubJobs.rows.length;
    }

    await dbClient.query(`DELETE FROM round_stops WHERE round_id = $1`, [roundId]);
    await dbClient.query(`DELETE FROM rounds WHERE id = $1 AND company_id = $2`, [roundId, companyId]);

    await dbClient.query('COMMIT');
    res.json({
      ok: true,
      removed_future_packages: removedPackages,
      deleted_jobs: cancelledJobs,
    });
  } catch (error) {
    try { await dbClient.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('DELETE /rounds/:id', error);
    res.status(500).json({ error: 'Failed to delete round: ' + error.message });
  } finally {
    dbClient.release();
  }
});

// POST /api/rounds/:id/place — apply a library round onto calendar day(s).
// Body: { assigned_user_id, dates: ['YYYY-MM-DD', ...], schedule_kind?, cadence fields? }
//
// One-time (manual): plain jobs only — no subscriptions.
// Recurring: create/update round-owned subscriptions per stop, then materialize
// jobs for each date (linked via recurring_job_id) and bundle them on daily_routes.
//
// Each date is written as a planned round package (name + round_id + round_job_ids).
// Other jobs already on that day stay outside as fillers until the day route is planned.
router.post('/:id/place', async (req, res) => {
  try {
    await ensureRoundsSchema(pool);
    await ensureDailyRoutePackageColumns(pool);

    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const roundId = Number(req.params.id);
    if (!Number.isFinite(roundId)) return res.status(400).json({ error: 'Invalid round id' });

    const assignedUserId = Number(req.body?.assigned_user_id);
    if (!Number.isInteger(assignedUserId) || assignedUserId <= 0) {
      return res.status(400).json({ error: 'assigned_user_id is required' });
    }
    const todayYmd = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    })();
    // Never place round jobs on past days — first day is today or later.
    const dates = Array.isArray(req.body?.dates)
      ? [...new Set(
          req.body.dates
            .map(d => String(d).slice(0, 10))
            .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= todayYmd),
        )].sort()
      : [];
    if (dates.length === 0) {
      return res.status(400).json({
        error: 'dates are required (on or after today — past days cannot be placed)',
      });
    }

    const round = await loadRound(companyId, roundId);
    if (!round) return res.status(404).json({ error: 'Round not found' });
    if (!Array.isArray(round.stops) || round.stops.length === 0) {
      return res.status(400).json({ error: 'Add at least one stop before placing' });
    }

    const userCheck = await pool.query(
      `SELECT user_id FROM user_companies WHERE user_id = $1 AND company_id = $2`,
      [assignedUserId, companyId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Assigned user not found' });
    }

    const keepRecurring = req.body?.schedule_kind === 'recurring';
    const dayOfWeek = req.body?.day_of_week != null ? Number(req.body.day_of_week) : null;
    const intervalValue = req.body?.interval_value != null ? Number(req.body.interval_value) : null;
    const recurrenceType = req.body?.recurrence_type === 'monthly' ? 'monthly'
      : (req.body?.recurrence_type === 'weekly' || keepRecurring ? 'weekly' : null);
    const dayOfMonth = req.body?.day_of_month != null ? Number(req.body.day_of_month) : null;
    const startingDateRaw = req.body?.starting_date
      ? String(req.body.starting_date).slice(0, 10)
      : (dates[0] || null);
    const startingDate = startingDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(startingDateRaw)
      ? (startingDateRaw < todayYmd ? todayYmd : startingDateRaw)
      : dates[0];

    const packageName = (round.name && String(round.name).trim()) || 'Untitled round';

    const placed = [];
    const skippedStops = [];
    const createdSubscriptions = [];

    // Full schedule re-apply: drop future packages/jobs that are no longer on
    // the new cadence dates so old Wednesdays don't linger after a move to Fridays.
    const replaceFuture = req.body?.replace_future === true
      || req.body?.replace_schedule === true;
    if (replaceFuture) {
      await clearFutureRoundPlacements(pool, {
        companyId,
        roundId,
        keepDates: dates,
        asOfDate: todayYmd,
      });
    }

    // Recurring: ensure one round-owned subscription per stop up front.
    const stopSubs = new Map(); // stop.id → { recurringJobId, clientId, title }
    if (keepRecurring) {
      for (const stop of round.stops) {
        const ensured = await ensureRoundStopSubscription(pool, {
          companyId,
          roundId,
          stop,
          assignedUserId,
          cadence: {
            recurrenceType: recurrenceType || 'weekly',
            dayOfWeek,
            dayOfMonth,
            intervalValue: intervalValue || 1,
            startingDate,
            dates,
          },
        });
        if (!ensured.recurringJobId) {
          skippedStops.push({ stop_id: stop.id, reason: ensured.reason || 'subscription_failed' });
          continue;
        }
        stopSubs.set(Number(stop.id), ensured);
        createdSubscriptions.push(ensured.recurringJobId);
      }
      if (stopSubs.size === 0) {
        return res.status(400).json({
          error: skippedStops.some(s => s.reason === 'missing_client')
            ? 'Could not place round: stops need a client before subscriptions can be created.'
            : 'Could not create subscriptions for round stops.',
          skippedStops,
        });
      }
    }

    for (let dateIndex = 0; dateIndex < dates.length; dateIndex++) {
      const date = dates[dateIndex];
      const orderedJobIds = [];

      for (const stop of round.stops) {
        let jobId = null;
        const sourceJobId = stop.job_id != null && Number.isFinite(Number(stop.job_id))
          ? Number(stop.job_id)
          : null;

        let clientId = stop.client_id != null ? Number(stop.client_id) : null;
        let title = (stop.label && String(stop.label).trim()) || 'Round stop';
        let duration = Number(stop.estimated_duration_minutes) || 30;
        let lat = stop.lat != null ? Number(stop.lat) : (stop.resolved_lat != null ? Number(stop.resolved_lat) : null);
        let lng = stop.lng != null ? Number(stop.lng) : (stop.resolved_lng != null ? Number(stop.resolved_lng) : null);
        let services = await parseStopServices(stop);

        if (sourceJobId != null) {
          const jobRes = await pool.query(
            `SELECT id, client_id, title, lat, lng,
                    LEFT(scheduled_date::text, 10) AS scheduled_date,
                    COALESCE((
                      SELECT SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes, 0))
                      FROM job_services js
                      LEFT JOIN services s ON s.id = js.service_id
                      WHERE js.job_id = jobs.id
                    ), 30)::int AS estimated_duration
             FROM jobs WHERE id = $1 AND company_id = $2`,
            [sourceJobId, companyId]
          );
          const job = jobRes.rows[0];
          if (job && job.scheduled_date === date && !keepRecurring) {
            jobId = Number(job.id);
            await pool.query(
              `UPDATE jobs SET assigned_user_id = $2, updated_at = NOW() WHERE id = $1`,
              [jobId, assignedUserId]
            );
          } else if (job) {
            if (clientId == null && job.client_id != null) clientId = Number(job.client_id);
            if (title === 'Round stop' && job.title) title = String(job.title);
            if (job.estimated_duration != null) duration = Number(job.estimated_duration) || duration;
            if (lat == null && job.lat != null) lat = Number(job.lat);
            if (lng == null && job.lng != null) lng = Number(job.lng);
            if (!services.length) {
              const svcRes = await pool.query(
                `SELECT service_id, custom_title, custom_price, custom_duration_minutes
                 FROM job_services WHERE job_id = $1`,
                [sourceJobId]
              );
              services = svcRes.rows;
            }
          }
        }

        if (keepRecurring) {
          const sub = stopSubs.get(Number(stop.id));
          if (!sub?.recurringJobId) {
            skippedStops.push({ date, stop_id: stop.id, reason: 'missing_subscription' });
            continue;
          }
          jobId = await ensureSubscriptionJobOnDate(pool, {
            companyId,
            subscriptionId: sub.recurringJobId,
            clientId: sub.clientId || clientId,
            assignedUserId,
            title: sub.title || title,
            date,
            durationMinutes: duration,
            lat,
            lng,
            services,
            occurrenceHint: dateIndex + 1,
          });
        } else if (jobId == null) {
          // One-time: plain jobs only — never create subscriptions.
          if (clientId == null || !Number.isFinite(clientId)) {
            skippedStops.push({ date, stop_id: stop.id, reason: 'missing_client' });
            continue;
          }

          const existing = await pool.query(
            `SELECT id FROM jobs
             WHERE company_id = $1 AND client_id = $2 AND scheduled_date = $3
               AND assigned_user_id = $4
               AND recurring_job_id IS NULL
               AND COALESCE(status, 'scheduled') NOT IN ('cancelled')
             ORDER BY id ASC LIMIT 1`,
            [companyId, clientId, date, assignedUserId]
          );
          if (existing.rows[0]) {
            jobId = Number(existing.rows[0].id);
          } else {
            const created = await pool.query(
              `INSERT INTO jobs
                 (company_id, client_id, assigned_user_id, title, scheduled_date,
                  status, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, 'scheduled', NOW(), NOW())
               RETURNING id`,
              [companyId, clientId, assignedUserId, title, date]
            );
            jobId = Number(created.rows[0].id);

            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              try {
                await pool.query(
                  `UPDATE jobs SET lat = $2, lng = $3, updated_at = NOW() WHERE id = $1`,
                  [jobId, lat, lng]
                );
              } catch { /* optional coords */ }
            }

            for (const svc of services || []) {
              try {
                await pool.query(
                  `INSERT INTO job_services (job_id, service_id, custom_title, custom_price, custom_duration_minutes, status)
                   VALUES ($1, $2, $3, $4, $5, 'scheduled')`,
                  [
                    jobId,
                    svc.service_id || null,
                    svc.custom_title || null,
                    svc.custom_price ?? null,
                    svc.custom_duration_minutes ?? svc.custom_duration ?? null,
                  ]
                );
              } catch { /* best-effort */ }
            }

            if (!services || services.length === 0) {
              try {
                await pool.query(
                  `INSERT INTO job_services (job_id, custom_title, custom_duration_minutes, status)
                   VALUES ($1, $2, $3, 'scheduled')`,
                  [jobId, title || 'Round stop', duration || 30]
                );
              } catch { /* best-effort */ }
            }
          }
        }

        if (jobId != null) orderedJobIds.push(jobId);
      }

      if (orderedJobIds.length === 0) {
        placed.push({ date, job_ids: [], skipped: 'no_jobs' });
        continue;
      }

      // Always write a planned package — stops stay one movable round unit.
      // (Do not skip on is_occurrence_override: placing a library round is
      // intentional and must re-bind the day as that round.)
      const packageRow = await upsertPlannedRoundPackage(pool, {
        companyId,
        userId: assignedUserId,
        date,
        jobIds: orderedJobIds,
        roundId,
        packageName,
      });
      if (!packageRow) {
        placed.push({ date, job_ids: orderedJobIds, skipped: 'package_write_failed' });
        continue;
      }
      placed.push({
        date,
        job_ids: orderedJobIds,
        round_job_ids: orderedJobIds,
        name: packageName,
        daily_route_id: packageRow.id,
        status: 'planned',
      });
    }

    const placedPackages = placed.filter(p => p.status === 'planned' && p.daily_route_id);
    if (placedPackages.length === 0) {
      return res.status(500).json({
        error: skippedStops.some(s => s.reason === 'missing_client')
          ? 'Could not place round: stops need a client before jobs can be created on days.'
          : 'Could not save the day as a planned round package. Jobs may exist — try placing again.',
        skippedStops,
        placed,
      });
    }

    await pool.query(
      `UPDATE rounds SET
         status = CASE WHEN status = 'placed' THEN status ELSE 'saved' END,
         assigned_user_id = $2,
         scheduled_date = NULL,
         schedule_kind = $3,
         day_of_week = $4,
         interval_value = $5,
         recurrence_type = $6,
         day_of_month = $7,
         starting_date = $8,
         in_library = TRUE,
         updated_at = NOW()
       WHERE id = $1`,
      [
        roundId,
        assignedUserId,
        keepRecurring ? 'recurring' : 'manual',
        Number.isInteger(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6 ? dayOfWeek : null,
        Number.isInteger(intervalValue) && intervalValue > 0 ? intervalValue : null,
        keepRecurring ? recurrenceType : null,
        Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31 ? dayOfMonth : null,
        startingDate && /^\d{4}-\d{2}-\d{2}$/.test(startingDate) ? startingDate : null,
      ]
    );

    const next = await loadRound(companyId, roundId);
    res.json({
      round: next,
      placed,
      subscriptions_created: keepRecurring
        ? [...new Set(createdSubscriptions)]
        : [],
    });
  } catch (error) {
    console.error('POST /rounds/:id/place', error);
    res.status(500).json({ error: 'Failed to place round: ' + error.message });
  }
});

// POST /api/rounds/:id/save — commit playground → saved (processed unit, still unplaced)
router.post('/:id/save', async (req, res) => {
  try {
    await ensureRoundsSchema(pool);
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const roundId = Number(req.params.id);
    if (!Number.isFinite(roundId)) return res.status(400).json({ error: 'Invalid round id' });

    const existing = await pool.query(
      `SELECT id, status FROM rounds WHERE id = $1 AND company_id = $2`,
      [roundId, companyId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Round not found' });

    const stopCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM round_stops WHERE round_id = $1`,
      [roundId]
    );
    if ((stopCount.rows[0]?.n || 0) < 1) {
      return res.status(400).json({ error: 'Add at least one stop before saving' });
    }

    const name = req.body?.name !== undefined
      ? (req.body.name ? String(req.body.name).trim() : null)
      : undefined;
    const totalMinutes = req.body?.total_minutes != null ? Math.round(Number(req.body.total_minutes)) : null;
    const totalKm = req.body?.total_km != null ? Number(req.body.total_km) : null;
    const legMinutes = Array.isArray(req.body?.leg_minutes) ? req.body.leg_minutes : null;
    const legsClause = legMinutes && legMinutes.length > 0
      ? `ARRAY[${legMinutes.map(v => (v == null || Number.isNaN(Number(v)) ? 'NULL' : Number(v))).join(',')}]::real[]`
      : null;

    const nextStatus = existing.rows[0].status === 'placed' ? 'placed' : 'saved';

    await pool.query(
      `UPDATE rounds SET
         status = $2,
         name = CASE WHEN $3::boolean THEN $4 ELSE name END,
         total_minutes = COALESCE($5, total_minutes),
         total_km = COALESCE($6, total_km),
         leg_minutes = COALESCE(${legsClause || 'NULL'}, leg_minutes),
         in_library = CASE WHEN in_library THEN TRUE ELSE COALESCE($7, in_library) END,
         updated_at = NOW()
       WHERE id = $1`,
      [
        roundId,
        nextStatus,
        name !== undefined,
        name ?? null,
        Number.isFinite(totalMinutes) ? totalMinutes : null,
        Number.isFinite(totalKm) ? totalKm : null,
        req.body?.in_library === true || req.body?.in_library === 'true' ? true : null,
      ]
    );

    // Placement chosen at save time → apply to every job linked from this round.
    await syncRoundJobsPlacement(companyId, roundId);

    const round = await loadRound(companyId, roundId);
    res.json({ round });
  } catch (error) {
    console.error('POST /rounds/:id/save', error);
    res.status(500).json({ error: 'Failed to save round: ' + error.message });
  }
});

// PATCH /api/rounds/:id — rename / place / update totals
router.patch('/:id', async (req, res) => {
  try {
    await ensureRoundsSchema(pool);
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const roundId = Number(req.params.id);

    const fields = [];
    const values = [];
    const set = (col, val) => {
      values.push(val);
      fields.push(`${col} = $${values.length}`);
    };
    if (req.body?.name !== undefined) set('name', req.body.name ? String(req.body.name).trim() : null);
    if (VALID_STATUSES.has(req.body?.status)) set('status', req.body.status);
    if (req.body?.assigned_user_id !== undefined) {
      const uid = req.body.assigned_user_id == null ? null : Number(req.body.assigned_user_id);
      set('assigned_user_id', Number.isFinite(uid) ? uid : null);
    }
    if (req.body?.scheduled_date !== undefined) set('scheduled_date', req.body.scheduled_date || null);
    if (req.body?.schedule_kind !== undefined) {
      const kind = req.body.schedule_kind;
      set('schedule_kind', kind === 'manual' || kind === 'recurring' ? kind : null);
    }
    if (req.body?.day_of_week !== undefined) {
      const d = req.body.day_of_week == null ? null : Number(req.body.day_of_week);
      set('day_of_week', Number.isInteger(d) && d >= 0 && d <= 6 ? d : null);
    }
    if (req.body?.interval_value !== undefined) {
      const n = req.body.interval_value == null ? null : Number(req.body.interval_value);
      set('interval_value', Number.isInteger(n) && n > 0 ? n : null);
    }
    if (req.body?.recurrence_type !== undefined) {
      const rt = req.body.recurrence_type;
      set('recurrence_type', rt === 'weekly' || rt === 'monthly' ? rt : null);
    }
    if (req.body?.day_of_month !== undefined) {
      const d = req.body.day_of_month == null ? null : Number(req.body.day_of_month);
      set('day_of_month', Number.isInteger(d) && d >= 1 && d <= 31 ? d : null);
    }
    if (req.body?.starting_date !== undefined) {
      set('starting_date', req.body.starting_date || null);
    }
    if (req.body?.total_minutes !== undefined) {
      const n = req.body.total_minutes == null ? null : Math.round(Number(req.body.total_minutes));
      set('total_minutes', Number.isFinite(n) ? n : null);
    }
    if (req.body?.total_km !== undefined) {
      const n = req.body.total_km == null ? null : Number(req.body.total_km);
      set('total_km', Number.isFinite(n) ? n : null);
    }
    if (req.body?.in_library !== undefined) {
      set('in_library', req.body.in_library === true || req.body.in_library === 'true' || req.body.in_library === 1);
    }
    if (req.body?.source_round_id !== undefined) {
      const sid = req.body.source_round_id == null ? null : Number(req.body.source_round_id);
      set('source_round_id', Number.isFinite(sid) ? sid : null);
    }
    if (req.body?.round_template_id !== undefined) {
      const tid = req.body.round_template_id == null ? null : Number(req.body.round_template_id);
      set('round_template_id', Number.isFinite(tid) ? tid : null);
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push('updated_at = NOW()');
    values.push(roundId, companyId);

    const cadenceTouched = req.body?.schedule_kind !== undefined
      || req.body?.day_of_week !== undefined
      || req.body?.interval_value !== undefined
      || req.body?.recurrence_type !== undefined
      || req.body?.day_of_month !== undefined
      || req.body?.starting_date !== undefined
      || req.body?.assigned_user_id !== undefined;

    const result = await pool.query(
      `UPDATE rounds SET ${fields.join(', ')}
       WHERE id = $${values.length - 1} AND company_id = $${values.length}
       RETURNING id`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Round not found' });

    // Keep day packages titled with the round name.
    if (req.body?.name !== undefined) {
      const packageName = req.body.name ? String(req.body.name).trim() : null;
      if (packageName) {
        await pool.query(
          `UPDATE daily_routes SET name = $2, updated_at = NOW()
           WHERE company_id = $1 AND round_id = $3 AND status = 'planned'`,
          [companyId, packageName, roundId]
        ).catch(() => {});
      }
    }

    // Cadence / assignee changes must cascade to round-owned subscriptions.
    // Future day wipe + re-place happens on POST /place with replace_future
    // (client calls that when applying a new schedule).
    if (cadenceTouched) {
      const round = await loadRound(companyId, roundId);
      if (round && round.schedule_kind === 'recurring') {
        await syncRoundOwnedSubscriptionCadence(pool, {
          companyId,
          roundId,
          assignedUserId: round.assigned_user_id != null ? Number(round.assigned_user_id) : null,
          cadence: {
            recurrenceType: round.recurrence_type || 'weekly',
            dayOfWeek: round.day_of_week,
            dayOfMonth: round.day_of_month,
            intervalValue: round.interval_value || 1,
            startingDate: round.starting_date,
          },
        }).catch((err) => {
          console.warn('[PATCH /rounds] syncRoundOwnedSubscriptionCadence', err?.message || err);
        });
      }
    }

    const round = await loadRound(companyId, roundId);
    res.json({ round });
  } catch (error) {
    console.error('PATCH /rounds/:id', error);
    res.status(500).json({ error: 'Failed to update round: ' + error.message });
  }
});

module.exports = router;
