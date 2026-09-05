/**
 * Keep `rounds` / `round_stops` in sync with planned day routes.
 *
 * Product rule:
 *   - Library packages (`in_library=true`) appear on the Rounds page and are
 *     reusable recipes. Placing them onto days copies jobs; the package stays.
 *   - Day instances (`in_library=false`) are calendar sync rows from planned
 *     daily_routes. Editing/moving day jobs updates those jobs (with history);
 *     it does not rewrite the library package.
 */

let schemaEnsured = false;

async function ensureRoundsSchema(pool) {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rounds (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'playground',
      assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      scheduled_date DATE,
      total_minutes INTEGER,
      total_km NUMERIC(8,1),
      leg_minutes REAL[],
      round_template_id INTEGER,
      daily_route_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS round_stops (
      id SERIAL PRIMARY KEY,
      round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      job_id INTEGER,
      label TEXT,
      address TEXT,
      zip_code TEXT,
      city TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      estimated_duration_minutes INTEGER DEFAULT 30,
      services JSONB
    )
  `);
  await pool.query(`ALTER TABLE round_stops ADD COLUMN IF NOT EXISTS services JSONB`);
  await pool.query(`ALTER TABLE rounds ADD COLUMN IF NOT EXISTS daily_route_id INTEGER`);
  // schedule_kind: null = draft, 'manual' = reusable multi-day placements, 'recurring' = cadence
  await pool.query(`ALTER TABLE rounds ADD COLUMN IF NOT EXISTS schedule_kind VARCHAR(20)`);
  await pool.query(`ALTER TABLE rounds ADD COLUMN IF NOT EXISTS day_of_week SMALLINT`);
  await pool.query(`ALTER TABLE rounds ADD COLUMN IF NOT EXISTS interval_value INTEGER`);
  // Recurring cadence extras (align with subscription weekly/monthly).
  await pool.query(`ALTER TABLE rounds ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(20)`);
  await pool.query(`ALTER TABLE rounds ADD COLUMN IF NOT EXISTS day_of_month SMALLINT`);
  await pool.query(`ALTER TABLE rounds ADD COLUMN IF NOT EXISTS starting_date DATE`);
  // Library packages appear on the Rounds page. Day-synced placed rounds stay false.
  await pool.query(`ALTER TABLE rounds ADD COLUMN IF NOT EXISTS in_library BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE rounds ADD COLUMN IF NOT EXISTS source_round_id INTEGER`);
  // Round-owned subscriptions: recurring stops create recurring_jobs linked here.
  // Those rows stay out of the standalone Subscriptions UI (round_id IS NOT NULL).
  await pool.query(`ALTER TABLE recurring_jobs ADD COLUMN IF NOT EXISTS round_id INTEGER`);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE recurring_jobs
        ADD CONSTRAINT fk_recurring_jobs_round
        FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `).catch(() => {});
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_recurring_jobs_round_id ON recurring_jobs(round_id) WHERE round_id IS NOT NULL`
  ).catch(() => {});
  await pool.query(`ALTER TABLE round_stops ADD COLUMN IF NOT EXISTS recurring_job_id INTEGER`);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE round_stops
        ADD CONSTRAINT fk_round_stops_recurring_job
        FOREIGN KEY (recurring_job_id) REFERENCES recurring_jobs(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `).catch(() => {});
  // Existing playground drafts were created as intentional library packages.
  await pool.query(
    `UPDATE rounds SET in_library = TRUE WHERE status = 'playground' AND in_library = FALSE`
  ).catch(() => {});
  try {
    await pool.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS round_id INTEGER`);
  } catch { /* table may not exist yet in fresh envs */ }
  await pool.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS round_job_ids INTEGER[]`).catch(() => {});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rounds_company_status ON rounds(company_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rounds_company_library ON rounds(company_id, in_library)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rounds_placement ON rounds(company_id, assigned_user_id, scheduled_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_round_stops_round ON round_stops(round_id, position)`);
  schemaEnsured = true;
}

/**
 * Upsert a placed round from a planned daily_routes row + job ids.
 * Replaces stops to match current job order. Does not mutate round_templates.
 */
async function upsertPlacedRound(pool, {
  companyId,
  userId,
  scheduledDate,
  name = null,
  totalMinutes = null,
  totalKm = null,
  legMinutes = null,
  jobIds = [],
  roundTemplateId = null,
  dailyRouteId = null,
}) {
  await ensureRoundsSchema(pool);

  const uid = Number(userId);
  if (!Number.isFinite(uid) || !scheduledDate) return null;

  let roundId = null;
  if (dailyRouteId != null) {
    const byDaily = await pool.query(
      `SELECT id FROM rounds
       WHERE company_id = $1 AND daily_route_id = $2
         AND COALESCE(in_library, FALSE) = FALSE
       LIMIT 1`,
      [companyId, dailyRouteId]
    );
    if (byDaily.rows[0]) roundId = byDaily.rows[0].id;
  }
  if (roundId == null) {
    const byPlacement = await pool.query(
      `SELECT id FROM rounds
       WHERE company_id = $1 AND assigned_user_id = $2 AND scheduled_date = $3
         AND status IN ('placed', 'saved')
         AND COALESCE(in_library, FALSE) = FALSE
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1`,
      [companyId, uid, scheduledDate]
    );
    if (byPlacement.rows[0]) roundId = byPlacement.rows[0].id;
  }

  const legs = Array.isArray(legMinutes) ? legMinutes : null;
  const legsClause = legs && legs.length > 0
    ? `ARRAY[${legs.map(v => (v == null || Number.isNaN(Number(v)) ? 'NULL' : Number(v))).join(',')}]::real[]`
    : null;

  if (roundId == null) {
    const insert = await pool.query(
      `INSERT INTO rounds (
         company_id, name, status, assigned_user_id, scheduled_date,
         total_minutes, total_km, leg_minutes, round_template_id, daily_route_id,
         in_library, updated_at
       ) VALUES (
         $1, $2, 'placed', $3, $4, $5, $6, ${legsClause || 'NULL'}, $7, $8,
         FALSE, NOW()
       ) RETURNING id`,
      [
        companyId,
        name && String(name).trim() ? String(name).trim() : null,
        uid,
        scheduledDate,
        totalMinutes != null ? Math.round(Number(totalMinutes)) : null,
        totalKm != null ? Number(totalKm) : null,
        roundTemplateId != null ? Number(roundTemplateId) : null,
        dailyRouteId != null ? Number(dailyRouteId) : null,
      ]
    );
    roundId = insert.rows[0].id;
  } else {
    // Day sync must never flip a library package — only update placement fields
    // when this row is the day instance (in_library = false).
    await pool.query(
      `UPDATE rounds SET
         name = COALESCE($2, name),
         status = 'placed',
         assigned_user_id = $3,
         scheduled_date = $4,
         total_minutes = COALESCE($5, total_minutes),
         total_km = COALESCE($6, total_km),
         leg_minutes = COALESCE(${legsClause || 'NULL'}, leg_minutes),
         round_template_id = COALESCE($7, round_template_id),
         daily_route_id = COALESCE($8, daily_route_id),
         updated_at = NOW()
       WHERE id = $1 AND in_library = FALSE`,
      [
        roundId,
        name && String(name).trim() ? String(name).trim() : null,
        uid,
        scheduledDate,
        totalMinutes != null ? Math.round(Number(totalMinutes)) : null,
        totalKm != null ? Number(totalKm) : null,
        roundTemplateId != null ? Number(roundTemplateId) : null,
        dailyRouteId != null ? Number(dailyRouteId) : null,
      ]
    );
  }

  const ids = Array.isArray(jobIds)
    ? jobIds.map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0)
    : [];

  if (ids.length > 0) {
    try {
      const jobsRes = await pool.query(
        `SELECT j.id, j.client_id, j.title, j.lat, j.lng,
                c.name AS client_name, c.last_name AS client_last_name,
                c.address AS c_address, c.zip_code AS c_zip, c.city AS c_city,
                c.lat AS c_lat, c.lng AS c_lng,
                COALESCE((
                  SELECT SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes, 0))
                    FROM job_services js
                    LEFT JOIN services s ON s.id = js.service_id
                   WHERE js.job_id = j.id
                ), 30)::int AS estimated_duration_minutes
           FROM jobs j
           LEFT JOIN clients c ON c.id = j.client_id
          WHERE j.company_id = $1 AND j.id = ANY($2::int[])`,
        [companyId, ids]
      );
      const byId = new Map(jobsRes.rows.map(r => [Number(r.id), r]));

      await pool.query(`DELETE FROM round_stops WHERE round_id = $1`, [roundId]);
      let position = 0;
      for (const jobId of ids) {
        const job = byId.get(jobId);
        if (!job) continue;
        const label = [job.client_name, job.client_last_name].filter(Boolean).join(' ').trim()
          || job.title
          || `Job #${jobId}`;
        await pool.query(
          `INSERT INTO round_stops (
             round_id, position, client_id, job_id, label, address, zip_code, city,
             lat, lng, estimated_duration_minutes
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            roundId,
            position,
            job.client_id || null,
            jobId,
            label,
            job.c_address || null,
            job.c_zip || null,
            job.c_city || null,
            job.lat != null ? Number(job.lat) : (job.c_lat != null ? Number(job.c_lat) : null),
            job.lng != null ? Number(job.lng) : (job.c_lng != null ? Number(job.c_lng) : null),
            job.estimated_duration_minutes != null ? Number(job.estimated_duration_minutes) : 30,
          ]
        );
        position += 1;
      }
    } catch (stopErr) {
      // Round row still counts — stops are enrichment.
      console.warn('[roundSync] stop rebuild failed:', stopErr?.message || stopErr);
    }
  }

  return roundId;
}

/**
 * Create Round rows for any planned daily_routes that were saved before
 * round sync existed (or when sync silently failed).
 */
async function backfillPlannedRounds(pool, companyId) {
  await ensureRoundsSchema(pool);
  try {
    await pool.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS round_id INTEGER`);
  } catch { /* ignore */ }

  const missing = await pool.query(
    `SELECT id, user_id,
            to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
            name, total_minutes, total_km, leg_minutes, job_ids, round_template_id
       FROM daily_routes
      WHERE company_id = $1
        AND status = 'planned'
        AND (round_id IS NULL)
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 200`,
    [companyId]
  );

  for (const row of missing.rows) {
    try {
      const roundId = await upsertPlacedRound(pool, {
        companyId,
        userId: row.user_id,
        scheduledDate: row.scheduled_date,
        name: row.name,
        totalMinutes: row.total_minutes,
        totalKm: row.total_km,
        legMinutes: row.leg_minutes,
        jobIds: row.job_ids || [],
        roundTemplateId: row.round_template_id,
        dailyRouteId: row.id,
      });
      if (roundId != null) {
        await pool.query(`UPDATE daily_routes SET round_id = $2 WHERE id = $1`, [row.id, roundId]);
      }
    } catch (err) {
      console.warn('[roundSync] backfill failed for daily_route', row.id, err?.message || err);
    }
  }
}

/** Attach a template id onto the placed round for a day (after Save as Round → Repeat). */
async function linkRoundTemplate(pool, {
  companyId,
  userId,
  scheduledDate,
  roundTemplateId,
  name = null,
  dailyRouteId = null,
}) {
  await ensureRoundsSchema(pool);
  const roundId = await upsertPlacedRound(pool, {
    companyId,
    userId,
    scheduledDate,
    name,
    roundTemplateId,
    dailyRouteId,
    jobIds: [],
  });
  if (roundId != null && roundTemplateId != null) {
    await pool.query(
      `UPDATE rounds SET round_template_id = $2, name = COALESCE($3, name), updated_at = NOW()
       WHERE id = $1`,
      [roundId, roundTemplateId, name && String(name).trim() ? String(name).trim() : null]
    );
  }
  return roundId;
}

module.exports = {
  ensureRoundsSchema,
  upsertPlacedRound,
  linkRoundTemplate,
  backfillPlannedRounds,
};
