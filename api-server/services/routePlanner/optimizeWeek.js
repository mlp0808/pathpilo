const { pool } = require('../../utils/database');
const { ensureSchedulingSchema } = require('./ensureSchedulingSchema');
const { weekdayIndexFromDate, loadCompanyCountry } = require('./loadDayData');
const { optimizeDay } = require('./optimizeDay');

function parseDateRange(startDate, endDate) {
  const dates = [];
  const cur = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function isJobFixedOnDay(job, dateStr) {
  const flex = String(job.scheduling_flexibility || 'fixed_date').toLowerCase();
  if (flex === 'flexible') return false;
  if (flex === 'fixed_weekday') {
    const allowed = job.allowed_weekdays;
    if (Array.isArray(allowed) && allowed.length > 0) {
      const dow = weekdayIndexFromDate(dateStr);
      return allowed.includes(dow);
    }
  }
  // fixed_date: locked to scheduled_date
  const sd = String(job.scheduled_date).substring(0, 10);
  return sd === dateStr;
}

function allowedWeekdaysForJob(job) {
  const flex = String(job.scheduling_flexibility || 'fixed_date').toLowerCase();
  if (flex !== 'flexible' && flex !== 'fixed_weekday') return null;
  const allowed = job.allowed_weekdays;
  if (Array.isArray(allowed) && allowed.length > 0) return allowed;
  if (flex === 'flexible') return [0, 1, 2, 3, 4, 5, 6];
  return null;
}

async function loadWeekJobs(companyId, startDate, endDate, userIds = null) {
  const params = [companyId, startDate, endDate];
  let userClause = '';
  if (Array.isArray(userIds) && userIds.length > 0) {
    const ids = userIds.map(Number).filter(n => Number.isInteger(n));
    if (ids.length > 0) {
      userClause = ' AND j.assigned_user_id = ANY($4::int[])';
      params.push(ids);
    }
  }

  const r = await pool.query(
    `
    SELECT
      j.id,
      j.assigned_user_id,
      j.scheduled_date::text AS scheduled_date,
      COALESCE(
        j.scheduling_flexibility,
        CASE WHEN j.recurring_job_id IS NOT NULL THEN 'fixed_weekday' ELSE 'fixed_date' END
      ) AS scheduling_flexibility,
      COALESCE(
        j.allowed_weekdays,
        CASE WHEN rj.day_of_week IS NOT NULL THEN ARRAY[rj.day_of_week::int] ELSE NULL END
      ) AS allowed_weekdays,
      j.lat,
      j.lng,
      c.lat AS client_lat,
      c.lng AS client_lng,
      c.city,
      COALESCE(js.estimated_duration, 60) AS estimated_duration
    FROM jobs j
    LEFT JOIN clients c ON j.client_id = c.id
    LEFT JOIN recurring_jobs rj ON j.recurring_job_id = rj.id
    LEFT JOIN (
      SELECT job_id,
             SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes, 0)) AS estimated_duration
      FROM job_services js
      LEFT JOIN services s ON js.service_id = s.id
      GROUP BY job_id
    ) js ON j.id = js.job_id
    WHERE j.company_id = $1
      AND j.scheduled_date >= $2::date
      AND j.scheduled_date <= $3::date
      AND j.status NOT IN ('cancelled')
      ${userClause}
    ORDER BY j.scheduled_date, j.assigned_user_id, j.id
    `,
    params,
  );
  return r.rows;
}

async function loadActiveUsers(companyId, userIds = null) {
  if (Array.isArray(userIds) && userIds.length > 0) {
    return userIds.map(Number).filter(n => Number.isInteger(n));
  }
  const r = await pool.query(
    `SELECT DISTINCT u.id FROM users u
     JOIN user_companies uc ON uc.user_id = u.id
     WHERE uc.company_id = $1`,
    [companyId],
  );
  return r.rows.map(row => row.id);
}

/**
 * Greedy week assignment: move flexible jobs to reduce per-day stop counts imbalance
 * and cluster by city name heuristic. Returns proposals only — does not apply.
 */
async function optimizeWeek(opts) {
  const { companyId, startDate, endDate, userIds = null } = opts;
  await ensureSchedulingSchema();

  if (!startDate || !endDate) {
    return { ok: false, error: 'start_date and end_date are required' };
  }

  const dates = parseDateRange(startDate, endDate);
  const users = await loadActiveUsers(companyId, userIds);
  const jobs = await loadWeekJobs(companyId, startDate, endDate, users.length ? users : null);

  const proposals = [];
  const notes = [];

  const buckets = {};
  for (const date of dates) {
    for (const uid of users) {
      buckets[`${date}:${uid}`] = [];
    }
  }

  for (const job of jobs) {
    const dateStr = String(job.scheduled_date).substring(0, 10);
    const uid = Number(job.assigned_user_id);
    const key = `${dateStr}:${uid}`;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(job);
  }

  const flexibleJobs = jobs.filter(j => {
    const flex = String(j.scheduling_flexibility || 'fixed_date').toLowerCase();
    return flex === 'flexible' || flex === 'fixed_weekday';
  });

  for (const job of flexibleJobs) {
    const currentDate = String(job.scheduled_date).substring(0, 10);
    const currentUser = Number(job.assigned_user_id);
    const allowed = allowedWeekdaysForJob(job);
    if (!allowed) continue;

    let best = null;
    let bestScore = Infinity;

    for (const date of dates) {
      const dow = weekdayIndexFromDate(date);
      if (!allowed.includes(dow)) continue;

      for (const uid of users) {
        const key = `${date}:${uid}`;
        const bucket = buckets[key] || [];
        const score = bucket.length * 10 + (job.city && bucket.some(b => b.city === job.city) ? -5 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = { date, userId: uid };
        }
      }
    }

    if (!best) continue;
    if (best.date === currentDate && best.userId === currentUser) continue;

    proposals.push({
      jobId: job.id,
      from: { date: currentDate, userId: currentUser },
      to: { date: best.date, userId: best.userId },
      reason: 'Balance workload and group nearby stops',
    });

    // Update buckets for subsequent greedy picks
    const oldKey = `${currentDate}:${currentUser}`;
    const newKey = `${best.date}:${best.userId}`;
    buckets[oldKey] = (buckets[oldKey] || []).filter(j => j.id !== job.id);
    buckets[newKey] = [...(buckets[newKey] || []), { ...job, scheduled_date: best.date, assigned_user_id: best.userId }];
  }

  // Stage B preview: estimate drive per day after proposals applied (sample first user per day)
  const dayPreviews = [];
  for (const date of dates) {
    for (const uid of users) {
      const dayJobs = (buckets[`${date}:${uid}`] || []).filter(j => j.lat || j.client_lat);
      if (dayJobs.length < 2) continue;
      try {
        const preview = await optimizeDay({
          companyId,
          userId: uid,
          date,
          jobIds: dayJobs.map(j => j.id),
        });
        if (preview.ok) {
          dayPreviews.push({
            date,
            userId: uid,
            totalDriveMinutes: preview.totalDriveMinutes,
            jobCount: dayJobs.length,
          });
        }
      } catch {
        /* preview best-effort */
      }
    }
  }

  return {
    ok: true,
    startDate,
    endDate,
    proposals,
    dayPreviews,
    notes,
    summary: {
      proposalCount: proposals.length,
      flexibleJobCount: flexibleJobs.length,
      totalJobs: jobs.length,
    },
  };
}

module.exports = {
  optimizeWeek,
  parseDateRange,
  allowedWeekdaysForJob,
};
