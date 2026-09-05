/**
 * Round calendar — project cadence dates and inspect day placements
 * (clean vs mixed with other jobs).
 */

function formatYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function buildWeeklyDates(fromYmd, toYmd, dayOfWeek, intervalWeeks, startingDate) {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  const anchor = startingDate && /^\d{4}-\d{2}-\d{2}$/.test(startingDate)
    ? parseYmd(startingDate)
    : from;
  const interval = Math.max(1, Number(intervalWeeks) || 1);
  const targetDow = Number.isInteger(Number(dayOfWeek)) ? Number(dayOfWeek) : anchor.getDay();

  // First occurrence on/after anchor matching weekday.
  let cursor = new Date(anchor);
  const delta = (targetDow - cursor.getDay() + 7) % 7;
  cursor = addDays(cursor, delta);

  const out = [];
  // Walk forward from cursor; skip dates before range.
  let guard = 0;
  while (cursor < from && guard < 500) {
    cursor = addDays(cursor, 7 * interval);
    guard += 1;
  }
  while (cursor <= to && guard < 800) {
    out.push(formatYmd(cursor));
    cursor = addDays(cursor, 7 * interval);
    guard += 1;
  }
  return out;
}

function buildMonthlyDates(fromYmd, toYmd, dayOfMonth, intervalMonths, startingDate) {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  const anchor = startingDate && /^\d{4}-\d{2}-\d{2}$/.test(startingDate)
    ? parseYmd(startingDate)
    : from;
  const interval = Math.max(1, Number(intervalMonths) || 1);
  const dom = Math.min(31, Math.max(1, Number(dayOfMonth) || 1));

  let year = anchor.getFullYear();
  let month = anchor.getMonth();
  const out = [];
  let guard = 0;
  while (guard < 400) {
    const last = new Date(year, month + 1, 0).getDate();
    const day = Math.min(dom, last);
    const cur = new Date(year, month, day);
    if (cur >= from && cur <= to) out.push(formatYmd(cur));
    if (cur > to) break;
    month += interval;
    while (month > 11) {
      month -= 12;
      year += 1;
    }
    guard += 1;
  }
  return out;
}

function todayYmdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function expectedDatesForRound(round, fromYmd, toYmd) {
  if (round.schedule_kind !== 'recurring') return [];
  const today = todayYmdLocal();
  const start = round.starting_date && /^\d{4}-\d{2}-\d{2}$/.test(String(round.starting_date).slice(0, 10))
    ? String(round.starting_date).slice(0, 10)
    : today;
  // Cadence dots only from the first day onward — never in the past.
  const effectiveStart = start < today ? today : start;
  const rangeFrom = fromYmd > effectiveStart ? fromYmd : effectiveStart;
  if (rangeFrom > toYmd) return [];

  if (round.recurrence_type === 'monthly') {
    return buildMonthlyDates(
      rangeFrom,
      toYmd,
      round.day_of_month,
      round.interval_value || 1,
      effectiveStart,
    );
  }
  return buildWeeklyDates(
    rangeFrom,
    toYmd,
    round.day_of_week,
    round.interval_value || 1,
    effectiveStart,
  );
}

function asIntArray(v) {
  if (!Array.isArray(v)) return [];
  return v.map(Number).filter(n => Number.isInteger(n) && n > 0);
}

/**
 * Build calendar days for a month window.
 */
async function buildRoundCalendar(pool, { companyId, round, fromYmd, toYmd }) {
  await pool.query(`ALTER TABLE daily_routes ADD COLUMN IF NOT EXISTS round_job_ids INTEGER[]`).catch(() => {});

  const expected = new Set(expectedDatesForRound(round, fromYmd, toYmd));

  const placementsRes = await pool.query(
    `SELECT dr.id AS daily_route_id,
            LEFT(dr.scheduled_date::text, 10) AS scheduled_date,
            dr.user_id AS assigned_user_id,
            dr.name, dr.status,
            dr.job_ids, dr.round_job_ids,
            u.first_name AS assigned_first_name,
            u.last_name AS assigned_last_name
     FROM daily_routes dr
     LEFT JOIN users u ON u.id = dr.user_id
     WHERE dr.company_id = $1
       AND dr.round_id = $2
       AND dr.status = 'planned'
       AND LEFT(dr.scheduled_date::text, 10) >= $3
       AND LEFT(dr.scheduled_date::text, 10) <= $4
     ORDER BY dr.scheduled_date ASC`,
    [companyId, round.id, fromYmd, toYmd]
  );

  const byDate = new Map();
  for (const row of placementsRes.rows) {
    byDate.set(String(row.scheduled_date).slice(0, 10), row);
  }

  // Prefetch job titles for all placement job ids (for hover + safety dialogs).
  const allJobIds = new Set();
  for (const row of placementsRes.rows) {
    for (const id of asIntArray(row.job_ids)) allJobIds.add(id);
    for (const id of asIntArray(row.round_job_ids)) allJobIds.add(id);
  }

  let jobsById = new Map();
  if (allJobIds.size > 0) {
    const jobsRes = await pool.query(
      `SELECT j.id, j.title, j.status,
              LEFT(j.scheduled_date::text, 10) AS scheduled_date,
              j.client_id,
              COALESCE((
                SELECT SUM(COALESCE(js.custom_duration_minutes, s.duration_minutes, 0))
                FROM job_services js
                LEFT JOIN services s ON s.id = js.service_id
                WHERE js.job_id = j.id
              ), 0)::int AS estimated_duration,
              c.name AS client_name, c.last_name AS client_last_name,
              c.lat AS client_lat, c.lng AS client_lng,
              j.lat, j.lng
       FROM jobs j
       LEFT JOIN clients c ON c.id = j.client_id
       WHERE j.company_id = $1 AND j.id = ANY($2::int[])`,
      [companyId, [...allJobIds]]
    );
    jobsById = new Map(jobsRes.rows.map(r => [Number(r.id), r]));
  }

  const stopCount = Array.isArray(round.stops) ? round.stops.length : 0;
  // Only placed packages appear on the calendar — "expected but not placed"
  // is not a product state (schedule place materializes real days).
  const dates = new Set([...byDate.keys()]);

  const days = [];
  for (const date of [...dates].sort()) {
    const row = byDate.get(date);
    const isExpected = expected.has(date);
    if (!row) continue;


    const jobIds = asIntArray(row.job_ids);
    let roundJobIds = asIntArray(row.round_job_ids);
    // Backfill heuristic for older rows: treat current jobs as round jobs when count matches stops.
    if (roundJobIds.length === 0 && jobIds.length > 0) {
      roundJobIds = stopCount > 0 && jobIds.length <= stopCount + 1 ? jobIds : jobIds.slice(0, stopCount || jobIds.length);
    }
    const roundSet = new Set(roundJobIds);
    const extraIds = jobIds.filter(id => !roundSet.has(id));
    const presentRound = roundJobIds.filter(id => jobIds.includes(id));
    const missingRound = roundJobIds.filter(id => !jobIds.includes(id));
    const isModified = extraIds.length > 0 || missingRound.length > 0
      || (stopCount > 0 && presentRound.length !== stopCount && presentRound.length !== roundJobIds.length);

    const preview = jobIds.map((id, i) => {
      const j = jobsById.get(id);
      const title = j
        ? (j.title
          || [j.client_name, j.client_last_name].filter(Boolean).join(' ').trim()
          || `Job #${id}`)
        : `Job #${id}`;
      return {
        id,
        order: i + 1,
        title,
        duration_minutes: j?.estimated_duration != null ? Number(j.estimated_duration) : null,
        status: j?.status || null,
        kind: roundSet.has(id) ? 'round' : 'extra',
        lat: j?.lat ?? j?.client_lat ?? null,
        lng: j?.lng ?? j?.client_lng ?? null,
      };
    });

    days.push({
      date,
      state: isModified ? 'modified' : 'placed',
      is_expected: isExpected,
      is_placed: true,
      is_modified: isModified,
      daily_route_id: Number(row.daily_route_id),
      assigned_user_id: row.assigned_user_id != null ? Number(row.assigned_user_id) : null,
      assigned_first_name: row.assigned_first_name,
      assigned_last_name: row.assigned_last_name,
      name: row.name || round.name,
      job_ids: jobIds,
      round_job_ids: roundJobIds,
      round_job_count: presentRound.length,
      extra_job_count: extraIds.length,
      missing_round_count: missingRound.length,
      preview,
      extras: extraIds.map(id => {
        const j = jobsById.get(id);
        return {
          id,
          title: j
            ? (j.title || [j.client_name, j.client_last_name].filter(Boolean).join(' ').trim() || `Job #${id}`)
            : `Job #${id}`,
        };
      }),
      round_jobs: presentRound.map(id => {
        const j = jobsById.get(id);
        return {
          id,
          title: j
            ? (j.title || [j.client_name, j.client_last_name].filter(Boolean).join(' ').trim() || `Job #${id}`)
            : `Job #${id}`,
        };
      }),
    });
  }

  return {
    from: fromYmd,
    to: toYmd,
    expected_dates: [...expected].sort(),
    days,
  };
}

module.exports = {
  buildRoundCalendar,
  expectedDatesForRound,
  asIntArray,
};
