/**
 * Planned round packages on daily_routes.
 *
 * A placed library round must stay one movable unit: status=planned + name +
 * round_id + ordered job_ids. Recurring place creates round-owned subscriptions
 * that keep materializing jobs — this module re-binds those jobs into packages
 * whenever the jobs calendar loads a date window.
 */

async function ensureDailyRoutePackageColumns(db) {
  await db.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS name TEXT`).catch(() => {});
  await db.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS status VARCHAR(12) DEFAULT 'draft'`).catch(() => {});
  await db.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS round_id INTEGER`).catch(() => {});
  await db.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS round_job_ids INTEGER[]`).catch(() => {});
  await db.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS is_occurrence_override BOOLEAN DEFAULT FALSE`).catch(() => {});
  // Idempotent unique key so place / repair / Save & Apply share one row per day.
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS daily_routes_company_user_date_uidx
     ON daily_routes (company_id, user_id, scheduled_date)`
  ).catch(() => {});
}

/**
 * Write (or replace) this day's planned package for a library round.
 */
async function upsertPlannedRoundPackage(db, {
  companyId,
  userId,
  date,
  jobIds,
  roundJobIds,
  roundId,
  packageName,
}) {
  const ids = Array.isArray(jobIds)
    ? jobIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];
  if (ids.length === 0) return null;

  const coreIds = Array.isArray(roundJobIds) && roundJobIds.length > 0
    ? roundJobIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : ids;

  await ensureDailyRoutePackageColumns(db);

  const idsSql = `ARRAY[${ids.join(',')}]::int[]`;
  const coreSql = `ARRAY[${coreIds.join(',')}]::int[]`;
  const name = packageName && String(packageName).trim()
    ? String(packageName).trim()
    : 'Untitled round';

  const existing = await db.query(
    `SELECT id FROM daily_routes
     WHERE company_id = $1 AND user_id = $2 AND scheduled_date = $3::date
     LIMIT 1`,
    [companyId, userId, date]
  );

  let row;
  if (existing.rows[0]) {
    const updated = await db.query(
      `UPDATE daily_routes SET
         job_ids = ${idsSql},
         round_job_ids = ${coreSql},
         name = $2,
         status = 'planned',
         round_id = $3,
         is_occurrence_override = FALSE,
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, status, name, round_id, job_ids`,
      [existing.rows[0].id, name, roundId]
    );
    row = updated.rows[0];
  } else {
    const inserted = await db.query(
      `INSERT INTO daily_routes
         (company_id, user_id, scheduled_date, job_ids, round_job_ids, name, status, round_id, updated_at)
       VALUES ($1, $2, $3::date, ${idsSql}, ${coreSql}, $4, 'planned', $5, NOW())
       ON CONFLICT (company_id, user_id, scheduled_date)
       DO UPDATE SET
         job_ids = EXCLUDED.job_ids,
         round_job_ids = EXCLUDED.round_job_ids,
         name = EXCLUDED.name,
         status = 'planned',
         round_id = EXCLUDED.round_id,
         is_occurrence_override = FALSE,
         updated_at = NOW()
       RETURNING id, status, name, round_id, job_ids`,
      [companyId, userId, date, name, roundId]
    );
    row = inserted.rows[0];
  }

  if (!row || row.status !== 'planned' || row.round_id == null) {
    console.error('[upsertPlannedRoundPackage] write did not stick', {
      companyId, userId, date, roundId, row,
    });
    return null;
  }

  for (let i = 0; i < ids.length; i++) {
    await db.query(
      `UPDATE jobs
       SET route_order = $1, sort_order = $1, updated_at = NOW()
       WHERE id = $2 AND company_id = $3`,
      [i, ids[i], companyId]
    ).catch(() => {});
  }

  return row;
}

function asIntArray(raw) {
  if (Array.isArray(raw)) {
    return raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  }
  if (typeof raw === 'string') {
    return raw
      .replace(/[{}]/g, '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  }
  return [];
}

/**
 * Re-bind round-owned subscription jobs into planned daily_routes packages
 * for the visible calendar window. Safe to call on every GET /daily-routes.
 */
async function repairLibraryRoundPackagesInRange(db, companyId, startDate, endDate) {
  if (!companyId || !startDate || !endDate) return { repaired: 0 };

  await ensureDailyRoutePackageColumns(db);

  // One group per employee + day + library round.
  const groups = await db.query(
    `SELECT
       j.assigned_user_id AS user_id,
       LEFT(j.scheduled_date::text, 10) AS scheduled_date,
       rj.round_id AS round_id,
       COALESCE(NULLIF(TRIM(r.name), ''), 'Untitled round') AS package_name,
       ARRAY_AGG(j.id ORDER BY COALESCE(rs.position, 9999), j.id) AS job_ids
     FROM jobs j
     JOIN recurring_jobs rj
       ON rj.id = j.recurring_job_id
      AND rj.company_id = j.company_id
      AND rj.round_id IS NOT NULL
     JOIN rounds r
       ON r.id = rj.round_id
      AND r.company_id = j.company_id
     LEFT JOIN round_stops rs
       ON rs.round_id = rj.round_id
      AND rs.recurring_job_id = rj.id
     WHERE j.company_id = $1
       AND j.scheduled_date BETWEEN $2::date AND $3::date
       AND j.assigned_user_id IS NOT NULL
       AND COALESCE(j.status, 'scheduled') NOT IN ('cancelled', 'deleted')
     GROUP BY j.assigned_user_id, LEFT(j.scheduled_date::text, 10), rj.round_id, r.name`,
    [companyId, startDate, endDate]
  );

  let repaired = 0;
  for (const g of groups.rows) {
    const userId = Number(g.user_id);
    const roundId = Number(g.round_id);
    const date = String(g.scheduled_date).slice(0, 10);
    const jobIds = asIntArray(g.job_ids);
    if (!Number.isInteger(userId) || userId <= 0) continue;
    if (!Number.isInteger(roundId) || roundId <= 0) continue;
    if (jobIds.length === 0) continue;

    const existing = await db.query(
      `SELECT id, status, round_id, job_ids, round_job_ids, name
       FROM daily_routes
       WHERE company_id = $1 AND user_id = $2 AND scheduled_date = $3::date
       LIMIT 1`,
      [companyId, userId, date]
    );
    const row = existing.rows[0] || null;
    const existingRoundId = row?.round_id != null ? Number(row.round_id) : null;

    // Never steal a day that already belongs to a different library round.
    if (existingRoundId != null && existingRoundId !== roundId) continue;

    const existingIds = asIntArray(row?.job_ids);
    const existingCore = asIntArray(row?.round_job_ids);
    const sameCore =
      existingRoundId === roundId
      && row?.status === 'planned'
      && jobIds.length === existingCore.length
      && jobIds.every((id, i) => id === existingCore[i]);
    // Already a correct planned package for this round — keep fillers in job_ids.
    if (sameCore) {
      const missingFillers = existingIds.filter((id) => !jobIds.includes(id));
      if (missingFillers.length === 0 && existingIds.length >= jobIds.length) continue;
      // Core matches but job_ids lost round stops — refresh while keeping fillers.
      const merged = [...jobIds, ...missingFillers.filter((id) => !jobIds.includes(id))];
      const idsSql = `ARRAY[${merged.join(',')}]::int[]`;
      const coreSql = `ARRAY[${jobIds.join(',')}]::int[]`;
      await db.query(
        `UPDATE daily_routes SET
           job_ids = ${idsSql},
           round_job_ids = ${coreSql},
           status = 'planned',
           round_id = $2,
           name = COALESCE(NULLIF(TRIM(name), ''), $3),
           updated_at = NOW()
         WHERE id = $1`,
        [row.id, roundId, g.package_name]
      );
      repaired += 1;
      continue;
    }

    const needsWrite =
      !row
      || existingRoundId == null
      || row.status !== 'planned'
      || existingCore.length === 0
      || jobIds.some((id) => !existingIds.includes(id));

    if (!needsWrite) continue;

    // Preserve non-round fillers already on the day.
    const fillers = existingIds.filter((id) => !jobIds.includes(id));
    const mergedIds = [...jobIds, ...fillers];

    const written = await upsertPlannedRoundPackage(db, {
      companyId,
      userId,
      date,
      jobIds: mergedIds,
      roundJobIds: jobIds,
      roundId,
      packageName: g.package_name,
    });
    if (written) repaired += 1;
  }

  if (repaired > 0) {
    console.log('[repairLibraryRoundPackagesInRange]', { companyId, startDate, endDate, repaired });
  }
  return { repaired };
}

function todayYmdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function asIntArray(v) {
  if (Array.isArray(v)) return v.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return asIntArray(parsed);
    } catch { /* ignore */ }
  }
  return [];
}

/**
 * Soft-delete future planned packages for a library round (and their round jobs).
 * When `keepDates` is provided, packages on those dates are left alone (for
 * schedule re-apply that rewrites the kept days next).
 */
async function clearFutureRoundPlacements(db, {
  companyId,
  roundId,
  keepDates = null,
  asOfDate = null,
}) {
  const today = asOfDate && /^\d{4}-\d{2}-\d{2}$/.test(String(asOfDate).slice(0, 10))
    ? String(asOfDate).slice(0, 10)
    : todayYmdLocal();
  const keep = keepDates == null
    ? null
    : new Set(
      (Array.isArray(keepDates) ? keepDates : [])
        .map((d) => String(d).slice(0, 10))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    );

  await ensureDailyRoutePackageColumns(db);

  const futureRoutes = await db.query(
    `SELECT id, job_ids, round_job_ids, LEFT(scheduled_date::text, 10) AS scheduled_date
     FROM daily_routes
     WHERE company_id = $1
       AND round_id = $2
       AND status = 'planned'
       AND LEFT(scheduled_date::text, 10) >= $3`,
    [companyId, roundId, today],
  );

  let cancelledJobs = 0;
  let removedPackages = 0;

  for (const route of futureRoutes.rows) {
    const date = String(route.scheduled_date).slice(0, 10);
    if (keep && keep.has(date)) continue;

    const jobIds = asIntArray(route.job_ids);
    let roundJobIds = asIntArray(route.round_job_ids);
    if (roundJobIds.length === 0) roundJobIds = jobIds;

    if (roundJobIds.length > 0) {
      const cancelled = await db.query(
        `UPDATE jobs SET status = 'deleted', updated_at = NOW()
         WHERE company_id = $1 AND id = ANY($2::int[])
           AND COALESCE(status, 'scheduled') NOT IN ('completed', 'sub_completed', 'deleted')
           AND invoice_id IS NULL
         RETURNING id`,
        [companyId, roundJobIds],
      );
      cancelledJobs += cancelled.rows.length;
    }

    const remaining = jobIds.filter((id) => !roundJobIds.includes(id));
    if (remaining.length === 0) {
      await db.query(
        `DELETE FROM daily_routes WHERE id = $1 AND company_id = $2`,
        [route.id, companyId],
      );
    } else {
      await db.query(
        `UPDATE daily_routes SET
           job_ids = $2::int[],
           round_job_ids = NULL,
           round_id = NULL,
           name = COALESCE(NULLIF(name, ''), 'Route'),
           updated_at = NOW()
         WHERE id = $1`,
        [route.id, remaining],
      );
    }
    removedPackages += 1;
  }

  // Also soft-delete orphaned future subscription jobs for this round that
  // were never packaged (or were detached from daily_routes).
  const subs = await db.query(
    `SELECT id FROM recurring_jobs WHERE company_id = $1 AND round_id = $2`,
    [companyId, roundId],
  );
  const subIds = subs.rows.map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
  if (subIds.length > 0) {
    const params = [companyId, subIds, today];
    let keepClause = '';
    if (keep && keep.size > 0) {
      params.push([...keep]);
      keepClause = ` AND LEFT(scheduled_date::text, 10) <> ALL($${params.length}::text[])`;
    }
    const orphaned = await db.query(
      `UPDATE jobs SET status = 'deleted', updated_at = NOW()
       WHERE company_id = $1
         AND recurring_job_id = ANY($2::int[])
         AND LEFT(scheduled_date::text, 10) >= $3
         ${keepClause}
         AND COALESCE(status, 'scheduled') NOT IN ('completed', 'sub_completed', 'cancelled', 'deleted')
         AND invoice_id IS NULL
       RETURNING id`,
      params,
    );
    cancelledJobs += orphaned.rows.length;
  }

  return { removedPackages, cancelledJobs };
}

/**
 * Push the round's cadence onto every round-owned subscription.
 */
async function syncRoundOwnedSubscriptionCadence(db, {
  companyId,
  roundId,
  assignedUserId = null,
  cadence,
}) {
  const recurrenceType = cadence.recurrenceType === 'monthly' ? 'monthly' : 'weekly';
  const intervalValue = Math.max(1, Number(cadence.intervalValue) || 1);
  const dayOfWeek = recurrenceType === 'weekly'
    && Number.isInteger(Number(cadence.dayOfWeek))
    && Number(cadence.dayOfWeek) >= 0
    && Number(cadence.dayOfWeek) <= 6
    ? Number(cadence.dayOfWeek)
    : null;
  const dayOfMonth = recurrenceType === 'monthly'
    && Number.isInteger(Number(cadence.dayOfMonth))
    && Number(cadence.dayOfMonth) >= 1
    && Number(cadence.dayOfMonth) <= 31
    ? Number(cadence.dayOfMonth)
    : 1;
  const startingDate = cadence.startingDate
    && /^\d{4}-\d{2}-\d{2}$/.test(String(cadence.startingDate).slice(0, 10))
    ? String(cadence.startingDate).slice(0, 10)
    : null;

  const result = await db.query(
    `UPDATE recurring_jobs SET
       assigned_user_id = COALESCE($3, assigned_user_id),
       starting_date = COALESCE($4, starting_date),
       next_occurrence_date = COALESCE($4, next_occurrence_date, starting_date),
       recurrence_type = $5,
       day_of_week = $6,
       day_of_month = $7,
       interval_value = $8,
       is_active = TRUE,
       updated_at = NOW()
     WHERE company_id = $1 AND round_id = $2 AND is_active = TRUE
     RETURNING id`,
    [
      companyId,
      roundId,
      Number.isInteger(assignedUserId) && assignedUserId > 0 ? assignedUserId : null,
      startingDate,
      recurrenceType,
      dayOfWeek,
      dayOfMonth,
      intervalValue,
    ],
  );
  return result.rows.map((r) => Number(r.id));
}

module.exports = {
  ensureDailyRoutePackageColumns,
  upsertPlannedRoundPackage,
  repairLibraryRoundPackagesInRange,
  clearFutureRoundPlacements,
  syncRoundOwnedSubscriptionCadence,
};
