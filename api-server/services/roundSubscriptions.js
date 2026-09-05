/**
 * Round-owned subscriptions.
 *
 * Product model:
 *   - One-time round place → plain jobs (no subscription).
 *   - Recurring round place → one recurring_jobs row per stop, with round_id set.
 *     Those subscriptions power the same materialize / virtual-job path as
 *     standalone subscriptions, but are hidden from the Subscriptions list UI.
 */

async function parseStopServices(stop) {
  if (!stop?.services) return [];
  try {
    const raw = Array.isArray(stop.services) ? stop.services : JSON.parse(stop.services);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

async function copyServicesOntoSubscription(db, subscriptionId, services, sourceJobId) {
  if (sourceJobId != null) {
    try {
      await db.query(
        `INSERT INTO recurring_job_services (recurring_job_id, service_id, custom_price, custom_duration_minutes)
         SELECT $1, js.service_id, js.custom_price, js.custom_duration_minutes
           FROM job_services js
          WHERE js.job_id = $2 AND js.service_id IS NOT NULL
         ON CONFLICT DO NOTHING`,
        [subscriptionId, sourceJobId]
      );
      await db.query(
        `INSERT INTO recurring_job_services (recurring_job_id, custom_title, custom_price, custom_duration_minutes)
         SELECT $1, js.custom_title, js.custom_price, js.custom_duration_minutes
           FROM job_services js
          WHERE js.job_id = $2 AND js.service_id IS NULL AND js.custom_title IS NOT NULL`,
        [subscriptionId, sourceJobId]
      );
      return;
    } catch (e) {
      console.warn('[roundSubscriptions] copy from job failed:', e?.message || e);
    }
  }

  for (const svc of services || []) {
    try {
      if (svc.service_id != null) {
        await db.query(
          `INSERT INTO recurring_job_services (recurring_job_id, service_id, custom_price, custom_duration_minutes)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [
            subscriptionId,
            svc.service_id,
            svc.custom_price ?? null,
            svc.custom_duration_minutes ?? svc.custom_duration ?? null,
          ]
        );
      } else if (svc.custom_title) {
        await db.query(
          `INSERT INTO recurring_job_services (recurring_job_id, custom_title, custom_price, custom_duration_minutes)
           VALUES ($1, $2, $3, $4)`,
          [
            subscriptionId,
            svc.custom_title,
            svc.custom_price ?? null,
            svc.custom_duration_minutes ?? svc.custom_duration ?? null,
          ]
        );
      }
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Ensure a stop has a round-owned subscription matching the round cadence.
 * Returns recurring_job_id.
 */
async function ensureRoundStopSubscription(db, {
  companyId,
  roundId,
  stop,
  assignedUserId,
  cadence,
}) {
  const clientId = stop.client_id != null ? Number(stop.client_id) : null;
  if (clientId == null || !Number.isFinite(clientId)) {
    return { recurringJobId: null, reason: 'missing_client' };
  }

  const title = (stop.label && String(stop.label).trim()) || 'Round stop';
  const startingDate = cadence.startingDate
    || (Array.isArray(cadence.dates) && cadence.dates[0])
    || null;
  if (!startingDate || !/^\d{4}-\d{2}-\d{2}$/.test(startingDate)) {
    return { recurringJobId: null, reason: 'missing_starting_date' };
  }

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

  let recurringJobId = stop.recurring_job_id != null && Number.isFinite(Number(stop.recurring_job_id))
    ? Number(stop.recurring_job_id)
    : null;

  if (recurringJobId != null) {
    const existing = await db.query(
      `SELECT id FROM recurring_jobs
       WHERE id = $1 AND company_id = $2 AND round_id = $3`,
      [recurringJobId, companyId, roundId]
    );
    if (!existing.rows[0]) recurringJobId = null;
  }

  // Do not match by client alone — a round can visit the same client twice.

  if (recurringJobId != null) {
    await db.query(
      `UPDATE recurring_jobs SET
         assigned_user_id = $2,
         title = $3,
         starting_date = $4,
         next_occurrence_date = COALESCE(next_occurrence_date, $4),
         recurrence_type = $5,
         day_of_week = $6,
         day_of_month = $7,
         interval_value = $8,
         is_active = TRUE,
         updated_at = NOW()
       WHERE id = $1`,
      [
        recurringJobId,
        assignedUserId,
        title,
        startingDate,
        recurrenceType,
        dayOfWeek,
        dayOfMonth,
        intervalValue,
      ]
    );
  } else {
    const inserted = await db.query(
      `INSERT INTO recurring_jobs
         (company_id, client_id, assigned_user_id, title, note,
          starting_date, next_occurrence_date,
          recurrence_type, day_of_week, day_of_month, interval_value,
          is_active, round_id)
       VALUES ($1, $2, $3, $4, NULL, $5, $5, $6, $7, $8, $9, TRUE, $10)
       RETURNING id`,
      [
        companyId,
        clientId,
        assignedUserId,
        title,
        startingDate,
        recurrenceType,
        dayOfWeek,
        dayOfMonth,
        intervalValue,
        roundId,
      ]
    );
    recurringJobId = Number(inserted.rows[0].id);

    const services = await parseStopServices(stop);
    const sourceJobId = stop.job_id != null && Number.isFinite(Number(stop.job_id))
      ? Number(stop.job_id)
      : null;
    await copyServicesOntoSubscription(db, recurringJobId, services, sourceJobId);
  }

  await db.query(
    `UPDATE round_stops SET recurring_job_id = $2 WHERE id = $1 AND round_id = $3`,
    [stop.id, recurringJobId, roundId]
  );

  return { recurringJobId, clientId, title };
}

/**
 * Create or reuse a job for a round-owned subscription on a given date.
 */
async function ensureSubscriptionJobOnDate(db, {
  companyId,
  subscriptionId,
  clientId,
  assignedUserId,
  title,
  date,
  durationMinutes,
  lat,
  lng,
  services,
  occurrenceHint,
}) {
  const byDate = await db.query(
    `SELECT id, recurring_occurrence FROM jobs
     WHERE company_id = $1 AND recurring_job_id = $2
       AND LEFT(scheduled_date::text, 10) = $3
       AND COALESCE(status, 'scheduled') NOT IN ('cancelled')
     ORDER BY id ASC LIMIT 1`,
    [companyId, subscriptionId, date]
  );
  if (byDate.rows[0]) {
    const jobId = Number(byDate.rows[0].id);
    await db.query(
      `UPDATE jobs SET assigned_user_id = $2, updated_at = NOW() WHERE id = $1`,
      [jobId, assignedUserId]
    );
    return jobId;
  }

  let occurrence = occurrenceHint;
  if (occurrence == null || !Number.isFinite(Number(occurrence))) {
    const maxRes = await db.query(
      `SELECT COALESCE(MAX(recurring_occurrence), 0) AS max_occ
       FROM jobs WHERE company_id = $1 AND recurring_job_id = $2`,
      [companyId, subscriptionId]
    );
    occurrence = Number(maxRes.rows[0]?.max_occ || 0) + 1;
  }

  const created = await db.query(
    `INSERT INTO jobs
       (company_id, client_id, assigned_user_id, title, scheduled_date,
        status, recurring_job_id, recurring_occurrence,
        is_generated, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, $7, TRUE, NOW(), NOW())
     RETURNING id`,
    [
      companyId,
      clientId,
      assignedUserId,
      title,
      date,
      subscriptionId,
      occurrence,
    ]
  );
  const jobId = Number(created.rows[0].id);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    try {
      await db.query(
        `UPDATE jobs SET lat = $2, lng = $3, updated_at = NOW() WHERE id = $1`,
        [jobId, lat, lng]
      );
    } catch { /* optional */ }
  }

  try {
    await db.query(
      `UPDATE jobs
       SET scheduling_flexibility = 'fixed_weekday',
           allowed_weekdays = ARRAY[(EXTRACT(DOW FROM $2::date))::int]
       WHERE id = $1`,
      [jobId, date]
    );
  } catch { /* scheduling columns optional */ }

  for (const svc of services || []) {
    try {
      await db.query(
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

  // Prefer copying from subscription template when stop services were empty.
  if (!services || services.length === 0) {
    try {
      await db.query(
        `INSERT INTO job_services (job_id, service_id, custom_title, custom_price, custom_duration_minutes, status)
         SELECT $1, rjs.service_id, rjs.custom_title, rjs.custom_price, rjs.custom_duration_minutes, 'scheduled'
           FROM recurring_job_services rjs
          WHERE rjs.recurring_job_id = $2`,
        [jobId, subscriptionId]
      );
    } catch { /* best-effort */ }
  }

  // If still no services, keep a duration stub so the stop has a length.
  if ((!services || services.length === 0) && durationMinutes) {
    const check = await db.query(
      `SELECT COUNT(*)::int AS n FROM job_services WHERE job_id = $1`,
      [jobId]
    );
    if ((check.rows[0]?.n || 0) === 0) {
      try {
        await db.query(
          `INSERT INTO job_services (job_id, custom_title, custom_duration_minutes, status)
           VALUES ($1, $2, $3, 'scheduled')`,
          [jobId, title || 'Stop', durationMinutes]
        );
      } catch { /* best-effort */ }
    }
  }

  return jobId;
}

module.exports = {
  ensureRoundStopSubscription,
  ensureSubscriptionJobOnDate,
  parseStopServices,
};
