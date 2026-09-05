const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const { linkRoundTemplate } = require('../services/roundSync');

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

// Lazily create the round tables + daily_routes columns so existing installs
// pick the feature up without a dedicated migration (same pattern as
// daily-routes' route_geometry column).
let schemaEnsured = false;
async function ensureRoundSchema() {
  if (schemaEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS round_templates (
        id                SERIAL PRIMARY KEY,
        company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name              VARCHAR(255) NOT NULL,
        description       TEXT,
        assigned_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        recurrence_type   VARCHAR(20) NOT NULL DEFAULT 'weekly',
        day_of_week       INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
        interval_value    INTEGER NOT NULL DEFAULT 1,
        is_active         BOOLEAN DEFAULT TRUE,
        created_from_daily_route_id INTEGER,
        created_at        TIMESTAMP DEFAULT NOW(),
        updated_at        TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS round_template_stops (
        id                SERIAL PRIMARY KEY,
        round_template_id INTEGER NOT NULL REFERENCES round_templates(id) ON DELETE CASCADE,
        position          INTEGER NOT NULL DEFAULT 0,
        recurring_job_id  INTEGER REFERENCES recurring_jobs(id) ON DELETE CASCADE,
        client_id         INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        source_job_id     INTEGER,
        label             TEXT,
        estimated_duration_minutes INTEGER,
        services          JSONB,
        created_at        TIMESTAMP DEFAULT NOW(),
        UNIQUE (round_template_id, recurring_job_id)
      )
    `);
    // Decouple: rounds loop as a unit — stops may reference a client/job snapshot
    // without creating a subscription (recurring_job_id stays null).
    await pool.query(`ALTER TABLE round_template_stops ALTER COLUMN recurring_job_id DROP NOT NULL`);
    await pool.query(`ALTER TABLE round_template_stops ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE round_template_stops ADD COLUMN IF NOT EXISTS source_job_id INTEGER`);
    await pool.query(`ALTER TABLE round_template_stops ADD COLUMN IF NOT EXISTS label TEXT`);
    await pool.query(`ALTER TABLE round_template_stops ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER`);
    await pool.query(`ALTER TABLE round_template_stops ADD COLUMN IF NOT EXISTS services JSONB`);
    // Unique on (template, recurring_job) only when recurring_job_id is set — allow
    // multiple nulls. Drop old unique if it blocks null client-only rows.
    try {
      await pool.query(`ALTER TABLE round_template_stops DROP CONSTRAINT IF EXISTS round_template_stops_round_template_id_recurring_job_id_key`);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS round_template_stops_template_rj_uidx
          ON round_template_stops (round_template_id, recurring_job_id)
          WHERE recurring_job_id IS NOT NULL
      `);
    } catch (e) {
      console.warn('[round-templates] unique index migrate:', e?.message);
    }
    await pool.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS name TEXT`);
    await pool.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS status VARCHAR(12) DEFAULT 'draft'`);
    await pool.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS round_template_id INTEGER`);
    await pool.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS is_occurrence_override BOOLEAN DEFAULT FALSE`);
    schemaEnsured = true;
  } catch (e) {
    console.warn('ensureRoundSchema failed', e?.message || e);
  }
}

/** Ensure every stop job has a subscription; create one (same cadence as the
 * round) when missing. Returns the recurring_job_id for the stop. */
async function ensureSubscriptionForJob(dbClient, {
  companyId, job, assignedUserId, dayOfWeek, intervalValue, startingDate,
}) {
  if (job.recurring_job_id != null) return Number(job.recurring_job_id);

  const title = job.title && String(job.title).trim() !== ''
    ? String(job.title).trim()
    : 'Round stop';

  const subResult = await dbClient.query(
    `INSERT INTO recurring_jobs
       (company_id, client_id, assigned_user_id, title, note, starting_date,
        recurrence_type, day_of_week, interval_value,
        scheduled_time_from, scheduled_time_to, next_occurrence_date, is_active)
     VALUES ($1, $2, $3, $4, NULL, $5, 'weekly', $6, $7, $8, $9, $5, TRUE)
     RETURNING id`,
    [companyId, job.client_id, assignedUserId, title, startingDate,
     dayOfWeek, intervalValue, job.scheduled_time_from, job.scheduled_time_to]
  );
  const subscriptionId = subResult.rows[0].id;

  // Copy the job's services onto the subscription so future occurrences carry
  // the same work. custom_title rows are best-effort (column may not exist on
  // very old installs).
  try {
    await dbClient.query(
      `INSERT INTO recurring_job_services (recurring_job_id, service_id, custom_price, custom_duration_minutes)
       SELECT $1, js.service_id, js.custom_price, js.custom_duration_minutes
         FROM job_services js
        WHERE js.job_id = $2 AND js.service_id IS NOT NULL
       ON CONFLICT DO NOTHING`,
      [subscriptionId, job.id]
    );
    await dbClient.query(
      `INSERT INTO recurring_job_services (recurring_job_id, custom_title, custom_price, custom_duration_minutes)
       SELECT $1, js.custom_title, js.custom_price, js.custom_duration_minutes
         FROM job_services js
        WHERE js.job_id = $2 AND js.service_id IS NULL AND js.custom_title IS NOT NULL`,
      [subscriptionId, job.id]
    );
  } catch (e) {
    console.warn('[round-templates] copying services onto subscription failed:', e?.message);
  }

  // Adopt the existing job as occurrence #1 of the new subscription so the
  // generator continues the loop from here instead of duplicating this day.
  await dbClient.query(
    `UPDATE jobs SET recurring_job_id = $1, recurring_occurrence = 1, updated_at = NOW()
      WHERE id = $2 AND company_id = $3`,
    [subscriptionId, job.id, companyId]
  );

  return subscriptionId;
}

// POST /api/round-templates
// Create a repeating round from a planned day in the route planner.
// Body: { name, description?, date: 'YYYY-MM-DD', assigned_user_id,
//         interval_value?: number, day_of_week?: 0-6,
//         stops: [{ job_id: number }, ...] (ordered) }
router.post('/', async (req, res) => {
  const dbClient = await pool.connect();
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;

    const { name, description, date, assigned_user_id, interval_value, day_of_week, stops } = req.body || {};
    if (!name || String(name).trim() === '') return res.status(400).json({ error: 'name is required' });
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
    const assignedUserId = Number(assigned_user_id);
    if (!Number.isInteger(assignedUserId) || assignedUserId <= 0) return res.status(400).json({ error: 'assigned_user_id is required' });
    if (!Array.isArray(stops) || stops.length === 0) return res.status(400).json({ error: 'stops are required' });

    const intervalValue = Number.isInteger(Number(interval_value)) && Number(interval_value) > 0
      ? Number(interval_value) : 1;
    // Default weekday = the day being saved (JS getDay: 0=Sun..6=Sat).
    const dayOfWeek = Number.isInteger(Number(day_of_week)) && Number(day_of_week) >= 0 && Number(day_of_week) <= 6
      ? Number(day_of_week)
      : new Date(`${date}T12:00:00`).getDay();

    await ensureRoundSchema();

    const jobIds = stops
      .map(s => Number(s?.job_id))
      .filter(n => Number.isInteger(n) && n > 0);
    if (jobIds.length === 0) return res.status(400).json({ error: 'stops must reference real jobs' });

    const jobsResult = await dbClient.query(
      `SELECT j.id, j.client_id, j.title,
              COALESCE((
                SELECT SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes, 0))
                FROM job_services js
                LEFT JOIN services s ON s.id = js.service_id
                WHERE js.job_id = j.id
              ), 30)::int AS estimated_duration,
              j.scheduled_time_from, j.scheduled_time_to,
              j.address, j.zip_code, j.city, j.lat, j.lng,
              c.name AS client_name, c.last_name AS client_last_name
         FROM jobs j
    LEFT JOIN clients c ON c.id = j.client_id
        WHERE j.company_id = $1 AND j.id = ANY($2::int[])`,
      [companyId, jobIds]
    );
    const jobById = new Map(jobsResult.rows.map(r => [Number(r.id), r]));

    // Snapshot services per job for future materialize (no subscription created).
    const servicesResult = await dbClient.query(
      `SELECT job_id, service_id, custom_title, custom_price, custom_duration_minutes
         FROM job_services
        WHERE job_id = ANY($1::int[])`,
      [jobIds]
    );
    const servicesByJob = new Map();
    for (const row of servicesResult.rows) {
      const jid = Number(row.job_id);
      if (!servicesByJob.has(jid)) servicesByJob.set(jid, []);
      servicesByJob.get(jid).push({
        service_id: row.service_id != null ? Number(row.service_id) : null,
        custom_title: row.custom_title || null,
        custom_price: row.custom_price != null ? Number(row.custom_price) : null,
        custom_duration_minutes: row.custom_duration_minutes != null
          ? Number(row.custom_duration_minutes) : null,
      });
    }

    await dbClient.query('BEGIN');

    const templateResult = await dbClient.query(
      `INSERT INTO round_templates
         (company_id, name, description, assigned_user_id,
          recurrence_type, day_of_week, interval_value, is_active)
       VALUES ($1, $2, $3, $4, 'weekly', $5, $6, TRUE)
       RETURNING *`,
      [companyId, String(name).trim(), description || null, assignedUserId, dayOfWeek, intervalValue]
    );
    const template = templateResult.rows[0];

    const stopRows = [];
    let position = 0;
    for (const jobId of jobIds) {
      const job = jobById.get(jobId);
      if (!job) continue;
      const label = (job.title && String(job.title).trim())
        || [job.client_name, job.client_last_name].filter(Boolean).join(' ').trim()
        || `Stop ${position + 1}`;
      const duration = Number(job.estimated_duration) || null;
      const services = servicesByJob.get(jobId) || [];
      const stopResult = await dbClient.query(
        `INSERT INTO round_template_stops
           (round_template_id, position, client_id, source_job_id, label,
            estimated_duration_minutes, services, recurring_job_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NULL)
         RETURNING *`,
        [
          template.id,
          position,
          job.client_id != null ? Number(job.client_id) : null,
          jobId,
          label,
          duration,
          JSON.stringify(services),
        ]
      );
      stopRows.push(stopResult.rows[0]);
      position += 1;
    }

    // Link (or create) the day's saved route as the first planned occurrence.
    await dbClient.query(
      `INSERT INTO daily_routes (company_id, user_id, scheduled_date, job_ids, name, status, round_template_id, updated_at)
       VALUES ($1, $2, $3, $4::int[], $5, 'planned', $6, NOW())
       ON CONFLICT (company_id, user_id, scheduled_date)
       DO UPDATE SET
         name = EXCLUDED.name,
         status = 'planned',
         round_template_id = EXCLUDED.round_template_id,
         updated_at = NOW()`,
      [companyId, assignedUserId, date, jobIds, String(name).trim(), template.id]
    );

    await dbClient.query(
      `UPDATE round_templates SET created_from_daily_route_id =
         (SELECT id FROM daily_routes WHERE company_id = $1 AND user_id = $2 AND scheduled_date = $3 LIMIT 1)
       WHERE id = $4`,
      [companyId, assignedUserId, date, template.id]
    );

    const dailyRow = await dbClient.query(
      `SELECT id FROM daily_routes WHERE company_id = $1 AND user_id = $2 AND scheduled_date = $3 LIMIT 1`,
      [companyId, assignedUserId, date]
    );
    const dailyRouteId = dailyRow.rows[0]?.id || null;

    await dbClient.query('COMMIT');

    try {
      const roundId = await linkRoundTemplate(pool, {
        companyId,
        userId: assignedUserId,
        scheduledDate: date,
        roundTemplateId: template.id,
        name: String(name).trim(),
        dailyRouteId,
      });
      if (roundId != null && dailyRouteId != null) {
        await pool.query(
          `UPDATE daily_routes SET round_id = $2 WHERE id = $1`,
          [dailyRouteId, roundId]
        );
      }
    } catch (syncErr) {
      console.warn('[round-templates] round link failed:', syncErr?.message || syncErr);
    }

    res.status(201).json({ template, stops: stopRows });
  } catch (error) {
    try { await dbClient.query('ROLLBACK'); } catch { /* not in a tx */ }
    console.error('[round-templates POST] FAILED:', error?.message);
    res.status(500).json({ error: 'Failed to create round', detail: error?.message ?? String(error) });
  } finally {
    dbClient.release();
  }
});

// GET /api/round-templates — all rounds for the company (cards on the Rounds page).
router.get('/', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;

    await ensureRoundSchema();
    const result = await pool.query(
      `SELECT rt.*,
              u.first_name AS assigned_first_name,
              u.last_name  AS assigned_last_name,
              (SELECT COUNT(*)::int FROM round_template_stops s WHERE s.round_template_id = rt.id) AS stop_count
         FROM round_templates rt
    LEFT JOIN users u ON u.id = rt.assigned_user_id
        WHERE rt.company_id = $1
        ORDER BY rt.is_active DESC, rt.name ASC`,
      [companyId]
    );
    res.json({ templates: result.rows });
  } catch (error) {
    console.error('[round-templates GET] FAILED:', error?.message);
    res.status(500).json({ error: 'Failed to fetch rounds' });
  }
});

// GET /api/round-templates/:id — one round with its ordered stops.
router.get('/:id', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const templateId = parseInt(req.params.id, 10);
    if (!Number.isInteger(templateId)) return res.status(400).json({ error: 'Invalid id' });

    await ensureRoundSchema();
    const templateResult = await pool.query(
      `SELECT rt.*,
              u.first_name AS assigned_first_name,
              u.last_name  AS assigned_last_name
         FROM round_templates rt
    LEFT JOIN users u ON u.id = rt.assigned_user_id
        WHERE rt.id = $1 AND rt.company_id = $2
        LIMIT 1`,
      [templateId, companyId]
    );
    if (templateResult.rows.length === 0) return res.status(404).json({ error: 'Round not found' });

    const stopsResult = await pool.query(
      `SELECT s.id, s.position, s.recurring_job_id, s.client_id, s.source_job_id,
              s.label, s.estimated_duration_minutes, s.services,
              rj.title AS subscription_title, rj.is_active AS subscription_active,
              COALESCE(c.id, c2.id) AS resolved_client_id,
              COALESCE(c.name, c2.name) AS client_name,
              COALESCE(c.last_name, c2.last_name) AS last_name,
              COALESCE(c.address, c2.address) AS address,
              COALESCE(c.zip_code, c2.zip_code) AS zip_code,
              COALESCE(c.city, c2.city) AS city
         FROM round_template_stops s
    LEFT JOIN recurring_jobs rj ON rj.id = s.recurring_job_id
    LEFT JOIN clients c ON c.id = rj.client_id
    LEFT JOIN clients c2 ON c2.id = s.client_id
        WHERE s.round_template_id = $1
        ORDER BY s.position ASC`,
      [templateId]
    );

    res.json({ template: templateResult.rows[0], stops: stopsResult.rows });
  } catch (error) {
    console.error('[round-templates GET:id] FAILED:', error?.message);
    res.status(500).json({ error: 'Failed to fetch round' });
  }
});

// PATCH /api/round-templates/:id — edit the repeating round itself
// (name, description, cadence, assignee, active flag).
router.patch('/:id', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const templateId = parseInt(req.params.id, 10);
    if (!Number.isInteger(templateId)) return res.status(400).json({ error: 'Invalid id' });

    const { name, description, assigned_user_id, interval_value, day_of_week, is_active } = req.body || {};

    await ensureRoundSchema();
    const result = await pool.query(
      `UPDATE round_templates SET
         name             = COALESCE($1, name),
         description      = COALESCE($2, description),
         assigned_user_id = COALESCE($3, assigned_user_id),
         interval_value   = COALESCE($4, interval_value),
         day_of_week      = COALESCE($5, day_of_week),
         is_active        = COALESCE($6, is_active),
         updated_at       = NOW()
       WHERE id = $7 AND company_id = $8
       RETURNING *`,
      [
        name != null && String(name).trim() !== '' ? String(name).trim() : null,
        description !== undefined ? description : null,
        Number.isInteger(Number(assigned_user_id)) && Number(assigned_user_id) > 0 ? Number(assigned_user_id) : null,
        Number.isInteger(Number(interval_value)) && Number(interval_value) > 0 ? Number(interval_value) : null,
        Number.isInteger(Number(day_of_week)) && Number(day_of_week) >= 0 && Number(day_of_week) <= 6 ? Number(day_of_week) : null,
        typeof is_active === 'boolean' ? is_active : null,
        templateId, companyId,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Round not found' });
    res.json({ template: result.rows[0] });
  } catch (error) {
    console.error('[round-templates PATCH] FAILED:', error?.message);
    res.status(500).json({ error: 'Failed to update round' });
  }
});

// DELETE /api/round-templates/:id — remove the round. Day snapshots lose the link.
// Subscriptions are independent and are never created/owned by rounds anymore.
router.delete('/:id', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const templateId = parseInt(req.params.id, 10);
    if (!Number.isInteger(templateId)) return res.status(400).json({ error: 'Invalid id' });

    await ensureRoundSchema();
    await pool.query(
      `UPDATE daily_routes SET round_template_id = NULL WHERE round_template_id = $1 AND company_id = $2`,
      [templateId, companyId]
    );
    const result = await pool.query(
      `DELETE FROM round_templates WHERE id = $1 AND company_id = $2 RETURNING id`,
      [templateId, companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Round not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error('[round-templates DELETE] FAILED:', error?.message);
    res.status(500).json({ error: 'Failed to delete round' });
  }
});

// POST /api/round-templates/:id/materialize — make sure a planned daily_routes
// occurrence exists for the given date, ordered by the template's stops.
// Body: { date: 'YYYY-MM-DD' }
router.post('/:id/materialize', async (req, res) => {
  try {
    const companyAccess = getActiveCompanyId(req);
    if (companyAccess.error) return res.status(companyAccess.status).json({ error: companyAccess.error });
    const { companyId } = companyAccess;
    const templateId = parseInt(req.params.id, 10);
    if (!Number.isInteger(templateId)) return res.status(400).json({ error: 'Invalid id' });
    const { date } = req.body || {};
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });

    await ensureRoundSchema();
    const templateResult = await pool.query(
      `SELECT * FROM round_templates WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [templateId, companyId]
    );
    if (templateResult.rows.length === 0) return res.status(404).json({ error: 'Round not found' });
    const template = templateResult.rows[0];

    // Prefer jobs already on that day that match template stops (by source_job
    // client, or legacy subscription link). Otherwise create fresh day jobs
    // from the stop snapshot — rounds do not go through subscriptions.
    const stops = await pool.query(
      `SELECT * FROM round_template_stops WHERE round_template_id = $1 ORDER BY position ASC`,
      [templateId]
    );

    const orderedJobIds = [];
    for (const stop of stops.rows) {
      let jobId = null;

      if (stop.recurring_job_id != null) {
        const existingSubJob = await pool.query(
          `SELECT id FROM jobs
            WHERE company_id = $1 AND recurring_job_id = $2 AND scheduled_date = $3
              AND COALESCE(status, 'scheduled') NOT IN ('cancelled')
            ORDER BY id ASC LIMIT 1`,
          [companyId, stop.recurring_job_id, date]
        );
        if (existingSubJob.rows[0]) jobId = Number(existingSubJob.rows[0].id);
      }

      if (jobId == null && stop.client_id != null) {
        const existingClientJob = await pool.query(
          `SELECT id FROM jobs
            WHERE company_id = $1 AND client_id = $2 AND scheduled_date = $3
              AND assigned_user_id = $4
              AND COALESCE(status, 'scheduled') NOT IN ('cancelled')
            ORDER BY id ASC LIMIT 1`,
          [companyId, stop.client_id, date, template.assigned_user_id]
        );
        if (existingClientJob.rows[0]) jobId = Number(existingClientJob.rows[0].id);
      }

      if (jobId == null && stop.client_id != null) {
        const created = await pool.query(
          `INSERT INTO jobs
             (company_id, client_id, assigned_user_id, title, scheduled_date,
              status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'scheduled', NOW(), NOW())
           RETURNING id`,
          [
            companyId,
            stop.client_id,
            template.assigned_user_id,
            stop.label || 'Round stop',
            date,
          ]
        );
        jobId = Number(created.rows[0].id);
        const services = Array.isArray(stop.services) ? stop.services
          : (typeof stop.services === 'string' ? JSON.parse(stop.services || '[]') : []);
        for (const svc of services) {
          try {
            await pool.query(
              `INSERT INTO job_services (job_id, service_id, custom_title, custom_price, custom_duration_minutes)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                jobId,
                svc.service_id || null,
                svc.custom_title || null,
                svc.custom_price ?? null,
                svc.custom_duration_minutes ?? null,
              ]
            );
          } catch { /* best-effort */ }
        }
        if (!services.length) {
          try {
            await pool.query(
              `INSERT INTO job_services (job_id, custom_title, custom_duration_minutes, status)
               VALUES ($1, $2, $3, 'scheduled')`,
              [jobId, stop.label || 'Round stop', stop.estimated_duration_minutes || 30]
            );
          } catch { /* best-effort */ }
        }
      }

      if (jobId != null) orderedJobIds.push(jobId);
    }

    // Don't stomp an occurrence the admin already customised.
    const existing = await pool.query(
      `SELECT id, is_occurrence_override FROM daily_routes
        WHERE company_id = $1 AND user_id = $2 AND scheduled_date = $3
        LIMIT 1`,
      [companyId, template.assigned_user_id, date]
    );
    if (existing.rows.length > 0 && existing.rows[0].is_occurrence_override) {
      return res.json({ ok: true, skipped: 'occurrence_override', job_ids: orderedJobIds });
    }

    await pool.query(
      `INSERT INTO daily_routes (company_id, user_id, scheduled_date, job_ids, name, status, round_template_id, updated_at)
       VALUES ($1, $2, $3, $4::int[], $5, 'planned', $6, NOW())
       ON CONFLICT (company_id, user_id, scheduled_date)
       DO UPDATE SET
         job_ids = EXCLUDED.job_ids,
         name = EXCLUDED.name,
         status = 'planned',
         round_template_id = EXCLUDED.round_template_id,
         updated_at = NOW()`,
      [companyId, template.assigned_user_id, date, orderedJobIds, template.name, templateId]
    );

    res.json({ ok: true, job_ids: orderedJobIds });
  } catch (error) {
    console.error('[round-templates materialize] FAILED:', error?.message);
    res.status(500).json({ error: 'Failed to materialize round occurrence' });
  }
});

module.exports = router;
