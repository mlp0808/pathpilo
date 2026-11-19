/**
 * Subscription projection.
 *
 * Subscriptions are not stored as rows for every future visit — only the ones
 * that have been materialized into `jobs` exist. Everything beyond that is
 * computed on the fly from the recurrence pattern, which is what both the
 * calendar and the "what's ahead" numbers read.
 *
 * An occurrence is identified by (subscription id, occurrence index), so a
 * visit that has been moved to another day is still recognised as the same
 * occurrence and never shows up twice.
 */

/** YYYY-MM-DD in local time — never via toISOString, which shifts the day. */
function formatDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Calendar-day difference (UTC midnight) so DST never breaks week indexing. */
function diffCalendarDays(a, b) {
  const aUtc = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((aUtc - bUtc) / (1000 * 60 * 60 * 24));
}

/** Accepts a Date, an ISO timestamp or a plain date string. */
function toDateString(value) {
  if (!value) return null;
  if (value instanceof Date) return formatDateString(value);
  const str = String(value);
  return str.includes('T') ? str.split('T')[0] : str;
}

function parseDateString(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(year, month - 1, day);
}

/** First date on or after `startingDate` that lands on `dayOfWeek`. */
function calculateFirstOccurrence(startingDateStr, dayOfWeek) {
  const startDate = parseDateString(toDateString(startingDateStr));
  if (!startDate) throw new Error(`Invalid starting date: ${startingDateStr}`);

  const daysUntilTargetDay = (dayOfWeek - startDate.getDay() + 7) % 7;
  if (daysUntilTargetDay === 0) return formatDateString(startDate);

  const firstOccurrence = new Date(startDate);
  firstOccurrence.setDate(startDate.getDate() + daysUntilTargetDay);
  return formatDateString(firstOccurrence);
}

/** First `dayOfMonth` strictly after `startingDate`, skipping short months. */
function calculateFirstMonthlyOccurrence(startingDateStr, dayOfMonth) {
  const startingDate = parseDateString(toDateString(startingDateStr));
  if (!startingDate) throw new Error(`Invalid starting date: ${startingDateStr}`);

  const targetDate = new Date(startingDate.getFullYear(), startingDate.getMonth(), dayOfMonth);
  if (targetDate <= startingDate) targetDate.setMonth(targetDate.getMonth() + 1);

  // e.g. "the 31st" in February rolls into March — move to the next month instead.
  if (targetDate.getDate() !== dayOfMonth) {
    targetDate.setDate(1);
    targetDate.setMonth(targetDate.getMonth() + 1);
  }

  return formatDateString(targetDate);
}

/** Steps a monthly pattern forward by `interval` months, clamped to real days. */
function addMonths(date, interval, dayOfMonth) {
  const targetMonth = date.getMonth() + interval;
  const targetYear = date.getFullYear() + Math.floor(targetMonth / 12);
  const finalMonth = ((targetMonth % 12) + 12) % 12;

  const candidate = new Date(targetYear, finalMonth, dayOfMonth);
  if (candidate.getMonth() !== finalMonth) {
    const lastDay = new Date(targetYear, finalMonth + 1, 0).getDate();
    return new Date(targetYear, finalMonth, Math.min(dayOfMonth, lastDay));
  }
  return candidate;
}

/** Active subscriptions with their client, plus the services on each. */
async function loadActiveSubscriptions(pool, companyId) {
  let subscriptions = [];
  try {
    const result = await pool.query(
      `SELECT rj.*, c.name, c.last_name, c.address, c.zip_code, c.city,
              c.lat AS client_lat, c.lng AS client_lng
       FROM recurring_jobs rj
       LEFT JOIN clients c ON rj.client_id = c.id
       WHERE rj.company_id = $1 AND rj.is_active = true`,
      [companyId]
    );
    subscriptions = result.rows;
  } catch (err) {
    // Lightweight/demo databases may not have the recurring tables at all.
    if (err?.code === '42P01') return [];
    throw err;
  }

  if (subscriptions.length === 0) return [];

  const servicesResult = await pool.query(
    `SELECT rjs.*, s.title
     FROM recurring_job_services rjs
     LEFT JOIN services s ON rjs.service_id = s.id
     WHERE rjs.recurring_job_id = ANY($1::int[])`,
    [subscriptions.map((s) => s.id)]
  );

  const bySubscription = new Map();
  for (const row of servicesResult.rows) {
    const list = bySubscription.get(row.recurring_job_id) || [];
    list.push(row);
    bySubscription.set(row.recurring_job_id, list);
  }

  return subscriptions.map((subscription) => {
    const services = bySubscription.get(subscription.id) || [];
    return {
      subscription,
      services,
      totalPrice: services.reduce((sum, s) => sum + (parseFloat(s.custom_price) || 0), 0),
      totalDuration: services.reduce((sum, s) => sum + (parseInt(s.custom_duration_minutes, 10) || 0), 0),
    };
  });
}

/**
 * Every occurrence of every active subscription between two dates.
 * Returns `{ subId, occ, dateStr, subscription, subscriptionServices, totalPrice, totalDuration }`.
 */
async function projectSubscriptionOccurrences(pool, companyId, startDateStr, endDateStr) {
  const startDateObj = parseDateString(startDateStr);
  const endDateObj = parseDateString(endDateStr);
  if (!startDateObj || !endDateObj) return [];

  const loaded = await loadActiveSubscriptions(pool, companyId);
  const occurrences = [];

  for (const { subscription, services, totalPrice, totalDuration } of loaded) {
    try {
      const startingDate = toDateString(subscription.starting_date || subscription.next_occurrence_date);
      if (!startingDate) continue;

      const interval = Math.max(1, Number(subscription.interval_value) || 1);
      let firstOccurrenceDateStr;

      if (subscription.recurrence_type === 'weekly') {
        if (subscription.day_of_week == null) continue;
        firstOccurrenceDateStr = calculateFirstOccurrence(startingDate, subscription.day_of_week);
      } else if (subscription.recurrence_type === 'monthly') {
        if (subscription.day_of_month == null) continue;
        firstOccurrenceDateStr = calculateFirstMonthlyOccurrence(startingDate, subscription.day_of_month);
      } else {
        continue;
      }

      const firstOccurrenceDateObj = parseDateString(firstOccurrenceDateStr);
      let currentDate = new Date(firstOccurrenceDateObj);

      // Jump forward to the window instead of walking every occurrence since
      // the subscription started — ranges can be years from the first visit.
      if (startDateObj > firstOccurrenceDateObj) {
        if (subscription.recurrence_type === 'weekly') {
          currentDate = new Date(startDateObj);
          const daysUntilTargetDay = (subscription.day_of_week - currentDate.getDay() + 7) % 7;
          if (daysUntilTargetDay > 0) currentDate.setDate(currentDate.getDate() + daysUntilTargetDay);

          const daysSinceFirst = diffCalendarDays(currentDate, firstOccurrenceDateObj);
          const intervalsSinceFirst = Math.floor(daysSinceFirst / (7 * interval));
          const remainderDays = daysSinceFirst % (7 * interval);

          if (remainderDays !== 0 || currentDate < firstOccurrenceDateObj) {
            const next = new Date(firstOccurrenceDateObj);
            next.setDate(firstOccurrenceDateObj.getDate() + (intervalsSinceFirst + 1) * 7 * interval);
            currentDate = next;
          }
        } else {
          while (currentDate < startDateObj) {
            currentDate = addMonths(currentDate, interval, subscription.day_of_month);
          }
        }
      }

      const pausedAtStr = toDateString(subscription.paused_at);

      while (currentDate <= endDateObj) {
        if (currentDate >= firstOccurrenceDateObj && currentDate >= startDateObj) {
          const dateStr = formatDateString(currentDate);
          // A pause stops the pattern from that date on, not just one visit.
          if (pausedAtStr && dateStr >= pausedAtStr) break;

          let occ;
          if (subscription.recurrence_type === 'weekly') {
            const daysSinceFirst = diffCalendarDays(currentDate, firstOccurrenceDateObj);
            occ = Math.floor(daysSinceFirst / (7 * interval)) + 1;
          } else {
            const monthsSinceFirst =
              (currentDate.getFullYear() - firstOccurrenceDateObj.getFullYear()) * 12 +
              (currentDate.getMonth() - firstOccurrenceDateObj.getMonth());
            occ = Math.floor(monthsSinceFirst / interval) + 1;
          }

          occurrences.push({
            subId: subscription.id,
            occ,
            dateStr,
            subscription,
            subscriptionServices: services,
            totalPrice,
            totalDuration,
          });
        }

        if (subscription.recurrence_type === 'weekly') {
          const next = new Date(currentDate);
          next.setDate(next.getDate() + 7 * interval);
          currentDate = next;
        } else {
          currentDate = addMonths(currentDate, interval, subscription.day_of_month);
        }
      }
    } catch (error) {
      console.error(`[subscriptionProjection] subscription ${subscription.id}:`, error.message || error);
    }
  }

  return occurrences;
}

/** Occurrences that already exist as rows in `jobs`, as "subId:occ" keys. */
async function loadMaterializedOccurrences(pool, companyId, occurrences) {
  if (occurrences.length === 0) return new Set();

  const valuesSql = occurrences.map((_, i) => `($${i * 2 + 1}::int, $${i * 2 + 2}::int)`).join(', ');
  const params = occurrences.flatMap((p) => [p.subId, p.occ]);

  const result = await pool.query(
    `WITH occ(recurring_job_id, recurring_occurrence) AS (VALUES ${valuesSql})
     SELECT j.recurring_job_id, j.recurring_occurrence
     FROM jobs j
     JOIN occ ON j.recurring_job_id = occ.recurring_job_id
             AND j.recurring_occurrence = occ.recurring_occurrence
     WHERE j.company_id = $${params.length + 1}`,
    [...params, companyId]
  );

  return new Set(result.rows.map((r) => `${r.recurring_job_id}:${r.recurring_occurrence}`));
}

/**
 * Projected jobs for the calendar: every occurrence in the window that has not
 * been turned into a real job yet, shaped like a job row.
 *
 * `realJobs` is used as a legacy safety net — jobs generated before occurrence
 * indexes existed have a NULL `recurring_occurrence`, so they are matched on
 * (subscription, date) instead.
 */
async function buildProjectedJobs(pool, companyId, startDateStr, endDateStr, realJobs = []) {
  const occurrences = await projectSubscriptionOccurrences(pool, companyId, startDateStr, endDateStr);
  if (occurrences.length === 0) return [];

  const materialized = await loadMaterializedOccurrences(pool, companyId, occurrences);
  const byDate = new Set(
    realJobs
      .filter((j) => j.recurring_job_id != null && !!j.scheduled_date)
      .map((j) => `${j.recurring_job_id}:${toDateString(j.scheduled_date)}`)
  );

  const projected = [];
  for (const p of occurrences) {
    if (materialized.has(`${p.subId}:${p.occ}`)) continue;
    if (byDate.has(`${p.subId}:${p.dateStr}`)) continue;

    projected.push({
      id: `subscription-${p.subId}-${p.occ}`, // Virtual id — stable even if moved
      company_id: companyId,
      client_id: p.subscription.client_id,
      assigned_user_id: p.subscription.assigned_user_id,
      title: p.subscription.title,
      note: p.subscription.note,
      scheduled_date: p.dateStr,
      scheduled_time_from: p.subscription.scheduled_time_from,
      scheduled_time_to: p.subscription.scheduled_time_to,
      status: 'scheduled',
      recurring_job_id: p.subId,
      recurring_occurrence: p.occ,
      is_generated: true,
      name: p.subscription.name,
      last_name: p.subscription.last_name,
      address: p.subscription.address,
      zip_code: p.subscription.zip_code,
      city: p.subscription.city,
      // Same field names as real jobs — the planner and map read these for pins.
      client_lat: p.subscription.client_lat,
      client_lng: p.subscription.client_lng,
      service_count: p.subscriptionServices.length,
      all_service_count: p.subscriptionServices.length,
      total_price: p.totalPrice,
      estimated_price: p.totalPrice,
      total_duration: p.totalDuration,
      estimated_duration: p.totalDuration,
      is_projected: true,
    });
  }

  return projected;
}

/**
 * One subscription's value per calendar month, normalised: a visit every
 * other week counts 26 times a year, not twice a month.
 */
function monthlyValueOf(subscription, totalPrice) {
  const interval = Math.max(1, Number(subscription.interval_value) || 1);
  if (subscription.recurrence_type === 'weekly') return (totalPrice * (52 / interval)) / 12;
  if (subscription.recurrence_type === 'monthly') return totalPrice / interval;
  return 0;
}

/** A pause only stops the income from the day it starts. */
function isPausedOn(subscription, dateStr) {
  const pausedAt = toDateString(subscription.paused_at);
  return Boolean(pausedAt && pausedAt <= dateStr);
}

/**
 * What the active subscriptions are worth per calendar month.
 * This is the "signed up for" number, not forecast revenue.
 */
async function monthlySubscriptionValue(pool, companyId) {
  const loaded = await loadActiveSubscriptions(pool, companyId);
  const today = formatDateString(new Date());
  let total = 0;

  for (const { subscription, totalPrice } of loaded) {
    if (isPausedOn(subscription, today)) continue;
    total += monthlyValueOf(subscription, totalPrice);
  }

  return Math.round(total * 100) / 100;
}

/**
 * Every subscription the company has had, active or not, with its monthly
 * value and the window it was bringing money in. Ended subscriptions have no
 * end date of their own, so the last update stands in for it.
 */
async function loadSubscriptionLifetimes(pool, companyId) {
  let rows = [];
  try {
    const result = await pool.query(
      `SELECT rj.id, rj.client_id, rj.title, rj.is_active, rj.paused_at, rj.starting_date,
              rj.created_at, rj.updated_at, rj.recurrence_type, rj.interval_value,
              rj.day_of_week, rj.day_of_month,
              c.name, c.last_name,
              COALESCE((SELECT SUM(COALESCE(rjs.custom_price, 0))
                        FROM recurring_job_services rjs
                        WHERE rjs.recurring_job_id = rj.id), 0)::float AS per_visit
       FROM recurring_jobs rj
       LEFT JOIN clients c ON c.id = rj.client_id
       WHERE rj.company_id = $1`,
      [companyId]
    );
    rows = result.rows;
  } catch (err) {
    if (err?.code === '42P01') return [];
    throw err;
  }

  return rows.map((row) => {
    const created = toDateString(row.created_at);
    const starting = toDateString(row.starting_date);
    const start = starting && created ? (starting < created ? starting : created) : created || starting;
    const pausedAt = toDateString(row.paused_at);
    const endedAt = row.is_active ? null : toDateString(row.updated_at) || created;
    const stoppedAt = [pausedAt, endedAt].filter(Boolean).sort()[0] || null;
    return {
      row,
      perVisit: Number(row.per_visit) || 0,
      perMonth: monthlyValueOf(row, Number(row.per_visit) || 0),
      start,
      stoppedAt,
    };
  });
}

/** Monthly value and count of running subscriptions on each given day. */
function subscriptionValueOn(lifetimes, dateStr) {
  let value = 0;
  let active = 0;
  for (const s of lifetimes) {
    if (!s.start || s.start > dateStr) continue;
    if (s.stoppedAt && s.stoppedAt <= dateStr) continue;
    value += s.perMonth;
    active += 1;
  }
  return { value: Math.round(value * 100) / 100, active };
}

module.exports = {
  projectSubscriptionOccurrences,
  buildProjectedJobs,
  monthlySubscriptionValue,
  monthlyValueOf,
  loadActiveSubscriptions,
  loadSubscriptionLifetimes,
  subscriptionValueOn,
  formatDateString,
};
