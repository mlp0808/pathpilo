/**
 * Dashboard and insights numbers.
 *
 * One set of definitions, used everywhere, so the dashboard and the detail
 * pages can never disagree:
 *
 *   Earned      value of completed work in the period (completed services on
 *               completed / sub_completed jobs, plus completed cancellation
 *               fees). Invoicing has nothing to do with it.
 *   Done        completed visits. Fee lines are money, not visits.
 *   Not marked done  visits dated before today that nobody closed.
 *   Not invoiced  completed work with no invoice attached yet.
 *   Overdue     unpaid balance on sent invoices past their due date.
 *   Each month from subscriptions  normalised monthly value of running
 *               subscriptions. A commitment, never added to Earned.
 *
 * Charts are bucketed per day, week or month depending on the length of the
 * period, and money is compared with the same period one year earlier.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const {
  projectSubscriptionOccurrences,
  buildProjectedJobs,
  monthlySubscriptionValue,
  loadSubscriptionLifetimes,
  subscriptionValueOn,
} = require('../services/subscriptionProjection');

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

router.use(authenticateToken);

function companyIdFor(req) {
  const id = req.user?.activeCompanyId ?? req.user?.companyId;
  return Number.isFinite(Number(id)) ? Number(id) : null;
}

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(num(v) * 100) / 100;
const fullName = (first, last) => [first, last].filter(Boolean).join(' ').trim();
const noRows = () => ({ rows: [] });

// ── Dates and buckets ───────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

function shiftYears(s, n) {
  const d = parseDate(s);
  d.setFullYear(d.getFullYear() + n);
  return fmtDate(d);
}

const todayString = () => fmtDate(new Date());
const daysBetween = (from, to) => Math.round((parseDate(to) - parseDate(from)) / 86400000) + 1;

/** A month reads best per day, a quarter per week, anything longer per month. */
function bucketUnit(from, to) {
  const days = daysBetween(from, to);
  if (days <= 35) return 'day';
  if (days <= 140) return 'week';
  return 'month';
}

function bucketStart(s, unit) {
  const d = parseDate(s);
  if (unit === 'month') return fmtDate(new Date(d.getFullYear(), d.getMonth(), 1));
  if (unit === 'week') {
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday, same as date_trunc('week')
    return fmtDate(d);
  }
  return s;
}

function nextBucket(s, unit) {
  const d = parseDate(s);
  if (unit === 'month') return fmtDate(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  d.setDate(d.getDate() + (unit === 'week' ? 7 : 1));
  return fmtDate(d);
}

function bucketKeys(from, to, unit) {
  const keys = [];
  for (let k = bucketStart(from, unit); k <= to && keys.length < 400; k = nextBucket(k, unit)) keys.push(k);
  return keys;
}

/** Last day a bucket covers, never past the end of the period. */
function bucketEnd(key, unit, to) {
  const end = addDays(nextBucket(key, unit), -1);
  return end < to ? end : to;
}

/** SQL for the bucket a date falls in. `unit` only ever comes from bucketUnit. */
const bucketOf = (unit, expr) => `to_char(date_trunc('${unit}', (${expr})::timestamp), 'YYYY-MM-DD')`;

/** One point per bucket with every field present; each source fills its own fields. */
function toSeries(keys, fields, ...sources) {
  const points = keys.map((bucket) => {
    const point = { bucket };
    for (const f of fields) point[f] = 0;
    return point;
  });
  const index = new Map(points.map((p) => [p.bucket, p]));
  for (const rows of sources) {
    for (const row of rows) {
      const point = index.get(row.bucket);
      if (!point) continue;
      for (const f of fields) if (row[f] != null) point[f] = num(row[f]);
    }
  }
  return points;
}

const sumOf = (rows, field) => rows.reduce((s, r) => s + num(r[field]), 0);

/** Defaults to the year so far — what most people want to see on open. */
function readRange(req) {
  const today = todayString();
  let from = ISO_DATE.test(String(req.query.from || '')) ? String(req.query.from) : `${today.slice(0, 4)}-01-01`;
  let to = ISO_DATE.test(String(req.query.to || '')) ? String(req.query.to) : today;
  if (from > to) [from, to] = [to, from];
  if (daysBetween(from, to) > 366 * 5) from = shiftYears(to, -5);
  const unit = bucketUnit(from, to);
  return { from, to, today, unit, keys: bucketKeys(from, to, unit) };
}

const rangeOut = ({ from, to, today, unit }) => ({ from, to, today, unit });

// ── Shared SQL ──────────────────────────────────────────────────────────────

/** `jobs.scheduled_date` is text; anything that is not a date is ignored. */
const JOB_DATE = `(CASE WHEN j.scheduled_date ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT(j.scheduled_date, 10)::date END)`;
const EARNED = `j.status IN ('completed', 'sub_completed')`;
const OPEN = `j.status IN ('scheduled', 'in-progress')`;
const STANDARD = `COALESCE(j.job_kind, 'standard') = 'standard'`;

/** `jobs` stores no price; the money is always the sum of its line items. */
const COMPLETED_VALUE = `
  LEFT JOIN LATERAL (
    SELECT SUM(COALESCE(js.custom_price, s.price, 0) * COALESCE(js.quantity, 1)) AS value
    FROM job_services js
    LEFT JOIN services s ON s.id = js.service_id
    WHERE js.job_id = j.id AND js.status = 'completed'
  ) v ON true`;

const PLANNED_VALUE = `
  LEFT JOIN LATERAL (
    SELECT SUM(COALESCE(js.custom_price, s.price, 0) * COALESCE(js.quantity, 1)) AS value
    FROM job_services js
    LEFT JOIN services s ON s.id = js.service_id
    WHERE js.job_id = j.id AND COALESCE(js.status, '') <> 'cancelled'
  ) v ON true`;

const CLIENT_NAME = `NULLIF(TRIM(CONCAT(c.name, ' ', c.last_name)), '')`;

/** Leads that are still waiting for a first reply and are not behind an offer. */
const NEW_LEADS_WHERE = `
  l.company_id = $1 AND l.status = 'new'
  AND NOT EXISTS (
    SELECT 1 FROM offers o
    WHERE o.lead_id = l.id AND o.company_id = l.company_id AND o.status <> 'revoked'
  )`;

/** Same maths as offers.js computeTotals, before tax — comparable with job value. */
function offerValue(items) {
  let list = items;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return 0;
  return list.reduce((sum, it) => {
    const qty = Number(it?.quantity) > 0 ? Number(it.quantity) : 1;
    return sum + (Number(it?.unit_price ?? it?.price) || 0) * qty;
  }, 0);
}

// ── Building blocks ─────────────────────────────────────────────────────────

/** Earned per bucket, with the same buckets one year earlier laid on top. */
async function loadEarned(companyId, { from, to, unit, keys }) {
  const [current, lastYear] = await Promise.all([
    pool.query(
      `SELECT ${bucketOf(unit, JOB_DATE)} AS bucket,
              COALESCE(SUM(v.value), 0)::float AS earned,
              COUNT(*) FILTER (WHERE ${STANDARD})::int AS jobs
       FROM jobs j ${COMPLETED_VALUE}
       WHERE j.company_id = $1 AND ${EARNED} AND ${JOB_DATE} BETWEEN $2::date AND $3::date
       GROUP BY 1`,
      [companyId, from, to]
    ),
    pool.query(
      `SELECT ${bucketOf(unit, `${JOB_DATE} + INTERVAL '1 year'`)} AS bucket,
              COALESCE(SUM(v.value), 0)::float AS "lastYear"
       FROM jobs j ${COMPLETED_VALUE}
       WHERE j.company_id = $1 AND ${EARNED} AND ${JOB_DATE} BETWEEN $2::date AND $3::date
       GROUP BY 1`,
      [companyId, shiftYears(from, -1), shiftYears(to, -1)]
    ),
  ]);

  const total = round2(sumOf(current.rows, 'earned'));
  const jobs = sumOf(current.rows, 'jobs');
  return {
    total,
    jobs,
    lastYearTotal: round2(sumOf(lastYear.rows, 'lastYear')),
    averageJob: jobs > 0 ? round2(total / jobs) : 0,
    series: toSeries(keys, ['earned', 'jobs', 'lastYear'], current.rows, lastYear.rows),
  };
}

/** Visits per bucket: done, left open, cancelled — plus how much new work got booked. */
async function loadJobs(companyId, { from, to, today, unit, keys }) {
  const [visits, booked] = await Promise.all([
    pool.query(
      `SELECT ${bucketOf(unit, JOB_DATE)} AS bucket,
              COUNT(*) FILTER (WHERE ${EARNED})::int AS done,
              COUNT(*) FILTER (WHERE ${OPEN} AND ${JOB_DATE} < $4::date)::int AS open,
              COUNT(*) FILTER (WHERE ${OPEN} AND ${JOB_DATE} >= $4::date)::int AS planned,
              COUNT(*) FILTER (WHERE j.status = 'cancelled')::int AS cancelled
       FROM jobs j
       WHERE j.company_id = $1 AND ${STANDARD} AND ${JOB_DATE} BETWEEN $2::date AND $3::date
       GROUP BY 1`,
      [companyId, from, to, today]
    ),
    pool.query(
      `SELECT ${bucketOf(unit, 'j.created_at')} AS bucket, COUNT(*)::int AS booked
       FROM jobs j
       WHERE j.company_id = $1 AND ${STANDARD}
         AND NOT COALESCE(j.is_generated, false)
         AND COALESCE(j.status, '') <> 'deleted'
         AND j.created_at::date BETWEEN $2::date AND $3::date
       GROUP BY 1`,
      [companyId, from, to]
    ),
  ]);

  return {
    done: sumOf(visits.rows, 'done'),
    open: sumOf(visits.rows, 'open'),
    planned: sumOf(visits.rows, 'planned'),
    cancelled: sumOf(visits.rows, 'cancelled'),
    booked: sumOf(booked.rows, 'booked'),
    series: toSeries(keys, ['done', 'open', 'planned', 'cancelled', 'booked'], visits.rows, booked.rows),
  };
}

/** The client book as it grew: current clients by the day they were added. */
async function loadClients(companyId, { from, to, unit, keys }) {
  const [before, added, totals] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS n FROM clients
       WHERE company_id = $1 AND deleted_at IS NULL AND created_at::date < $2::date`,
      [companyId, from]
    ),
    pool.query(
      `SELECT ${bucketOf(unit, 'created_at')} AS bucket, COUNT(*)::int AS added
       FROM clients
       WHERE company_id = $1 AND deleted_at IS NULL AND created_at::date BETWEEN $2::date AND $3::date
       GROUP BY 1`,
      [companyId, from, to]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE client_type = 'company')::int AS companies
       FROM clients WHERE company_id = $1 AND deleted_at IS NULL`,
      [companyId]
    ),
  ]);

  const series = toSeries(keys, ['added', 'total'], added.rows);
  let running = num(before.rows[0]?.n);
  for (const point of series) {
    running += point.added;
    point.total = running;
  }

  return {
    total: num(totals.rows[0]?.total),
    companies: num(totals.rows[0]?.companies),
    added: sumOf(added.rows, 'added'),
    series,
  };
}

/** Monthly subscription value at the end of every bucket. */
async function loadSubscriptions(companyId, { to, today, unit, keys }) {
  const lifetimes = await loadSubscriptionLifetimes(pool, companyId);
  const now = subscriptionValueOn(lifetimes, today);
  return {
    lifetimes,
    monthlyValue: now.value,
    active: now.active,
    paused: lifetimes.filter((s) => s.row.is_active && s.stoppedAt && s.stoppedAt <= today).length,
    series: keys.map((bucket) => ({ bucket, ...subscriptionValueOn(lifetimes, bucketEnd(bucket, unit, to)) })),
  };
}

/** Requests in, offers out, offers won — per bucket. */
async function loadSales(companyId, { from, to, unit, keys }) {
  const [leads, sent, accepted, company] = await Promise.all([
    pool.query(
      `SELECT ${bucketOf(unit, 'created_at')} AS bucket, COUNT(*)::int AS leads
       FROM leads WHERE company_id = $1 AND created_at::date BETWEEN $2::date AND $3::date
       GROUP BY 1`,
      [companyId, from, to]
    ).catch(noRows),
    pool.query(
      `SELECT ${bucketOf(unit, 'sent_at')} AS bucket, COUNT(*)::int AS sent
       FROM offers WHERE company_id = $1 AND sent_at IS NOT NULL AND sent_at::date BETWEEN $2::date AND $3::date
       GROUP BY 1`,
      [companyId, from, to]
    ).catch(noRows),
    pool.query(
      `SELECT ${bucketOf(unit, 'accepted_at')} AS bucket, id, items
       FROM offers
       WHERE company_id = $1 AND status = 'accepted' AND accepted_at::date BETWEEN $2::date AND $3::date`,
      [companyId, from, to]
    ).catch(noRows),
    pool.query(
      `SELECT COALESCE(c.leads_enabled, false) AS leads_enabled,
              (SELECT COUNT(*) FROM offers WHERE company_id = $1)::int AS offers_ever,
              (SELECT COUNT(*) FROM leads WHERE company_id = $1)::int AS leads_ever
       FROM companies c WHERE c.id = $1`,
      [companyId]
    ).catch(noRows),
  ]);

  const acceptedByBucket = new Map();
  let acceptedValue = 0;
  for (const row of accepted.rows) {
    const value = offerValue(row.items);
    acceptedValue += value;
    const entry = acceptedByBucket.get(row.bucket) || { bucket: row.bucket, accepted: 0, acceptedValue: 0 };
    entry.accepted += 1;
    entry.acceptedValue += value;
    acceptedByBucket.set(row.bucket, entry);
  }

  const c = company.rows[0] || {};
  return {
    leadsEnabled: Boolean(c.leads_enabled),
    everUsed: num(c.offers_ever) + num(c.leads_ever) > 0,
    leads: sumOf(leads.rows, 'leads'),
    sent: sumOf(sent.rows, 'sent'),
    accepted: accepted.rows.length,
    acceptedValue: round2(acceptedValue),
    series: toSeries(
      keys,
      ['leads', 'sent', 'accepted', 'acceptedValue'],
      leads.rows,
      sent.rows,
      [...acceptedByBucket.values()]
    ),
  };
}

/** Everything that is waiting on the owner right now, most urgent first. */
async function loadAttention(companyId, today) {
  const [verify, leads, quietOffers, overdue, notDone, notInvoiced, invoicing, timeOff] = await Promise.all([
    pool.query(
      `SELECT id FROM offers
       WHERE company_id = $1 AND status = 'accepted' AND confirmed_at IS NULL AND archived_at IS NULL
       ORDER BY accepted_at NULLS LAST, id`,
      [companyId]
    ).catch(noRows),
    pool.query(`SELECT l.id FROM leads l WHERE ${NEW_LEADS_WHERE} ORDER BY l.created_at DESC`, [companyId]).catch(noRows),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM offers
       WHERE company_id = $1 AND status = 'sent' AND archived_at IS NULL
         AND (COALESCE(sent_at, created_at) < NOW() - INTERVAL '7 days' OR valid_until < $2::date)`,
      [companyId, today]
    ).catch(noRows),
    pool.query(
      `SELECT id, GREATEST(total - COALESCE(paid_amount, 0), 0)::float AS remaining
       FROM invoices
       WHERE company_id = $1 AND status IN ('sent', 'overdue')
         AND (due_date < $2::date OR status = 'overdue')
       ORDER BY due_date NULLS LAST, id`,
      [companyId, today]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS jobs, COALESCE(SUM(v.value), 0)::float AS total
       FROM jobs j ${PLANNED_VALUE}
       WHERE j.company_id = $1 AND ${OPEN} AND ${STANDARD} AND ${JOB_DATE} < $2::date`,
      [companyId, today]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS jobs, COALESCE(SUM(v.value), 0)::float AS total
       FROM jobs j ${COMPLETED_VALUE}
       WHERE j.company_id = $1 AND ${EARNED} AND j.invoice_id IS NULL AND ${JOB_DATE} <= $2::date`,
      [companyId, today]
    ),
    // Companies that bill outside PathPilo should not be nagged about invoicing.
    pool.query(
      `SELECT (EXISTS (SELECT 1 FROM invoices WHERE company_id = $1 AND status <> 'draft')
               OR COALESCE((SELECT invoice_numbering_configured FROM companies WHERE id = $1), false)) AS used`,
      [companyId]
    ).catch(noRows),
    pool.query(
      `SELECT id, appointment_date::text AS date FROM employee_appointments
       WHERE company_id = $1 AND status = 'requested' AND COALESCE(end_date, appointment_date) >= $2::date
       ORDER BY appointment_date`,
      [companyId, today]
    ).catch(noRows),
  ]);

  const usesInvoicing = Boolean(invoicing.rows[0]?.used);
  return {
    offersToVerify: { count: verify.rows.length, firstId: verify.rows[0]?.id ?? null },
    newLeads: { count: leads.rows.length, firstId: leads.rows[0]?.id ?? null },
    quietOffers: { count: num(quietOffers.rows[0]?.n) },
    overdueInvoices: {
      count: overdue.rows.length,
      total: round2(sumOf(overdue.rows, 'remaining')),
      firstId: overdue.rows[0]?.id ?? null,
    },
    notMarkedDone: { jobs: num(notDone.rows[0]?.jobs), total: round2(notDone.rows[0]?.total) },
    notInvoiced: usesInvoicing
      ? { jobs: num(notInvoiced.rows[0]?.jobs), total: round2(notInvoiced.rows[0]?.total) }
      : { jobs: 0, total: 0 },
    timeOffRequests: { count: timeOff.rows.length, firstDate: timeOff.rows[0]?.date ?? null },
  };
}

/** Today's visits (subscription visits included) and the next day with work. */
async function loadToday(companyId, today) {
  const horizon = addDays(today, 30);
  const [todayRows, upcomingRows] = await Promise.all([
    pool.query(
      `SELECT j.status, j.assigned_user_id, j.recurring_job_id, j.scheduled_date
       FROM jobs j
       WHERE j.company_id = $1 AND ${STANDARD} AND ${JOB_DATE} = $2::date
         AND COALESCE(j.status, '') NOT IN ('cancelled', 'deleted')`,
      [companyId, today]
    ),
    pool.query(
      `SELECT ${JOB_DATE}::text AS day, j.recurring_job_id, j.scheduled_date
       FROM jobs j
       WHERE j.company_id = $1 AND ${STANDARD} AND ${OPEN}
         AND ${JOB_DATE} > $2::date AND ${JOB_DATE} <= $3::date`,
      [companyId, today, horizon]
    ),
  ]);

  const projected = await buildProjectedJobs(pool, companyId, today, horizon, [
    ...todayRows.rows,
    ...upcomingRows.rows,
  ]).catch(() => []);

  const projectedToday = projected.filter((p) => p.scheduled_date === today);
  const byDay = new Map();
  const bump = (day) => byDay.set(day, (byDay.get(day) || 0) + 1);
  for (const row of upcomingRows.rows) bump(row.day);
  for (const p of projected) if (p.scheduled_date > today) bump(p.scheduled_date);

  const days = [...byDay.keys()].sort();
  const weekEnd = addDays(today, 7);
  const people = new Set(
    [...todayRows.rows, ...projectedToday].map((r) => r.assigned_user_id).filter((id) => id != null)
  );

  return {
    date: today,
    jobs: todayRows.rows.length + projectedToday.length,
    done: todayRows.rows.filter((r) => r.status === 'completed' || r.status === 'sub_completed').length,
    people: people.size,
    next: days[0] ? { date: days[0], jobs: byDay.get(days[0]) } : null,
    nextWeek: days.filter((d) => d <= weekEnd).reduce((s, d) => s + byDay.get(d), 0),
  };
}

/** Who did the work in the period. */
async function loadTeam(companyId, { from, to, today }) {
  const result = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email,
            COUNT(j.id) FILTER (WHERE ${EARNED} AND ${STANDARD})::int AS done,
            COUNT(j.id) FILTER (WHERE ${OPEN} AND ${STANDARD} AND ${JOB_DATE} < $4::date)::int AS open,
            COALESCE(SUM(v.value) FILTER (WHERE ${EARNED}), 0)::float AS earned
     FROM user_companies uc
     JOIN users u ON u.id = uc.user_id
     LEFT JOIN jobs j ON j.assigned_user_id = u.id AND j.company_id = uc.company_id
                     AND ${JOB_DATE} BETWEEN $2::date AND $3::date
     ${COMPLETED_VALUE}
     WHERE uc.company_id = $1
     GROUP BY u.id, u.first_name, u.last_name, u.email
     ORDER BY earned DESC, done DESC`,
    [companyId, from, to, today]
  );
  return {
    size: result.rows.length,
    members: result.rows.map((r) => ({
      userId: r.id,
      name: fullName(r.first_name, r.last_name) || r.email || 'Team member',
      done: num(r.done),
      open: num(r.open),
      earned: round2(r.earned),
    })),
  };
}

// ── Endpoints ───────────────────────────────────────────────────────────────

function handler(label, fn) {
  return async (req, res) => {
    try {
      const companyId = companyIdFor(req);
      if (!companyId) return res.status(404).json({ error: 'Company not found' });
      res.json(await fn(companyId, req));
    } catch (error) {
      console.error(`GET /insights/${label}`, error);
      res.status(500).json({ error: 'Could not load these numbers' });
    }
  };
}

// GET /api/insights/dashboard — the state of the company in one request.
router.get(
  '/dashboard',
  handler('dashboard', async (companyId, req) => {
    const range = readRange(req);
    const [earned, jobs, clients, subscriptions, sales, attention, today, team, setup] = await Promise.all([
      loadEarned(companyId, range),
      loadJobs(companyId, range),
      loadClients(companyId, range),
      loadSubscriptions(companyId, range),
      loadSales(companyId, range),
      loadAttention(companyId, range.today),
      loadToday(companyId, range.today),
      loadTeam(companyId, range),
      pool.query(
        `SELECT (SELECT COUNT(*) FROM services WHERE company_id = $1)::int AS services,
                (SELECT COUNT(*) FROM jobs WHERE company_id = $1 AND COALESCE(status, '') <> 'deleted')::int AS jobs`,
        [companyId]
      ),
    ]);

    const { lifetimes, ...subscriptionSummary } = subscriptions;
    return {
      range: rangeOut(range),
      earned,
      jobs,
      clients,
      subscriptions: subscriptionSummary,
      sales,
      attention,
      today,
      team,
      setup: {
        services: num(setup.rows[0]?.services),
        jobs: num(setup.rows[0]?.jobs),
      },
    };
  })
);

// GET /api/insights/earnings — what the work was worth and where that money is now.
router.get(
  '/earnings',
  handler('earnings', async (companyId, req) => {
    const range = readRange(req);
    const { from, to, today } = range;

    const [earned, funnel, origin, services, notInvoiced, notInvoicedTotal, unpaid, unpaidTotal, fees] =
      await Promise.all([
        loadEarned(companyId, range),

        // Earned → invoiced → paid: three readings of the same work, so one funnel.
        pool.query(
          `SELECT COALESCE(SUM(v.value), 0)::float AS earned,
                  COALESCE(SUM(v.value) FILTER (WHERE j.invoice_id IS NOT NULL), 0)::float AS invoiced,
                  COALESCE(SUM(v.value) FILTER (WHERE i.status IN ('paid', 'overpaid')), 0)::float AS paid
           FROM jobs j ${COMPLETED_VALUE}
           LEFT JOIN invoices i ON i.id = j.invoice_id
           WHERE j.company_id = $1 AND ${EARNED} AND ${JOB_DATE} BETWEEN $2::date AND $3::date`,
          [companyId, from, to]
        ),

        pool.query(
          `SELECT COUNT(*) FILTER (WHERE j.recurring_job_id IS NULL AND ${STANDARD})::int AS oneoff_jobs,
                  COUNT(*) FILTER (WHERE j.recurring_job_id IS NOT NULL)::int AS subscription_jobs,
                  COALESCE(SUM(v.value) FILTER (WHERE j.recurring_job_id IS NULL AND ${STANDARD}), 0)::float AS oneoff_value,
                  COALESCE(SUM(v.value) FILTER (WHERE j.recurring_job_id IS NOT NULL), 0)::float AS subscription_value,
                  COALESCE(SUM(v.value) FILTER (WHERE j.job_kind = 'cancellation_fee'), 0)::float AS fee_value
           FROM jobs j ${COMPLETED_VALUE}
           WHERE j.company_id = $1 AND ${EARNED} AND ${JOB_DATE} BETWEEN $2::date AND $3::date`,
          [companyId, from, to]
        ),

        pool.query(
          `SELECT COALESCE(s.title, js.custom_title, 'Other') AS title,
                  COUNT(*)::int AS times,
                  COALESCE(SUM(COALESCE(js.custom_price, s.price, 0) * COALESCE(js.quantity, 1)), 0)::float AS total
           FROM job_services js
           JOIN jobs j ON j.id = js.job_id
           LEFT JOIN services s ON s.id = js.service_id
           WHERE j.company_id = $1 AND js.status = 'completed' AND ${EARNED}
             AND ${JOB_DATE} BETWEEN $2::date AND $3::date
           GROUP BY 1
           ORDER BY total DESC
           LIMIT 10`,
          [companyId, from, to]
        ),

        pool.query(
          `SELECT c.id, ${CLIENT_NAME} AS name, COUNT(*)::int AS jobs,
                  COALESCE(SUM(v.value), 0)::float AS total, MIN(${JOB_DATE})::text AS oldest
           FROM jobs j ${COMPLETED_VALUE}
           JOIN clients c ON c.id = j.client_id
           WHERE j.company_id = $1 AND ${EARNED} AND j.invoice_id IS NULL AND ${JOB_DATE} <= $2::date
           GROUP BY c.id, c.name, c.last_name
           HAVING COALESCE(SUM(v.value), 0) > 0
           ORDER BY total DESC
           LIMIT 8`,
          [companyId, today]
        ),

        pool.query(
          `SELECT COUNT(*)::int AS jobs, COUNT(DISTINCT j.client_id)::int AS clients,
                  COALESCE(SUM(v.value), 0)::float AS total
           FROM jobs j ${COMPLETED_VALUE}
           WHERE j.company_id = $1 AND ${EARNED} AND j.invoice_id IS NULL AND ${JOB_DATE} <= $2::date`,
          [companyId, today]
        ),

        pool.query(
          `SELECT i.id, i.invoice_number, i.due_date::text AS due_date, i.status,
                  GREATEST(i.total - COALESCE(i.paid_amount, 0), 0)::float AS remaining,
                  COALESCE(${CLIENT_NAME}, i.bill_to_name, '') AS client
           FROM invoices i
           LEFT JOIN clients c ON c.id = i.client_id
           WHERE i.company_id = $1 AND i.status IN ('sent', 'overdue')
           ORDER BY i.due_date NULLS LAST, i.id
           LIMIT 10`,
          [companyId]
        ),

        pool.query(
          `SELECT COUNT(*)::int AS invoices,
                  COALESCE(SUM(GREATEST(total - COALESCE(paid_amount, 0), 0)), 0)::float AS total,
                  COUNT(*) FILTER (WHERE due_date < $2::date OR status = 'overdue')::int AS overdue,
                  COALESCE(SUM(GREATEST(total - COALESCE(paid_amount, 0), 0))
                    FILTER (WHERE due_date < $2::date OR status = 'overdue'), 0)::float AS overdue_total
           FROM invoices WHERE company_id = $1 AND status IN ('sent', 'overdue')`,
          [companyId, today]
        ),

        pool.query(
          `SELECT COUNT(*)::int AS cancelled FROM jobs j
           WHERE j.company_id = $1 AND j.status = 'cancelled' AND ${STANDARD}
             AND ${JOB_DATE} BETWEEN $2::date AND $3::date`,
          [companyId, from, to]
        ),
      ]);

    const f = funnel.rows[0] || {};
    const o = origin.rows[0] || {};
    const ni = notInvoicedTotal.rows[0] || {};
    const up = unpaidTotal.rows[0] || {};

    return {
      range: rangeOut(range),
      earned,
      funnel: { earned: round2(f.earned), invoiced: round2(f.invoiced), paid: round2(f.paid) },
      origin: {
        oneOffJobs: num(o.oneoff_jobs),
        subscriptionJobs: num(o.subscription_jobs),
        oneOffValue: round2(o.oneoff_value),
        subscriptionValue: round2(o.subscription_value),
        feeValue: round2(o.fee_value),
        cancelledJobs: num(fees.rows[0]?.cancelled),
      },
      services: services.rows.map((r) => ({
        title: r.title,
        times: num(r.times),
        total: round2(r.total),
        average: num(r.times) > 0 ? round2(num(r.total) / num(r.times)) : 0,
      })),
      notInvoiced: {
        total: round2(ni.total),
        jobs: num(ni.jobs),
        clients: num(ni.clients),
        byClient: notInvoiced.rows.map((r) => ({
          clientId: r.id,
          name: r.name || 'Client',
          jobs: num(r.jobs),
          total: round2(r.total),
          oldest: r.oldest,
        })),
      },
      unpaid: {
        total: round2(up.total),
        invoices: num(up.invoices),
        overdue: num(up.overdue),
        overdueTotal: round2(up.overdue_total),
        list: unpaid.rows.map((r) => ({
          id: r.id,
          number: r.invoice_number,
          client: r.client || 'Client',
          dueDate: r.due_date,
          remaining: round2(r.remaining),
          overdue: r.status === 'overdue' || (r.due_date != null && r.due_date < today),
        })),
      },
    };
  })
);

// GET /api/insights/jobs — the work itself: what got done, what was left open.
router.get(
  '/jobs',
  handler('jobs', async (companyId, req) => {
    const range = readRange(req);
    const { from, to, today } = range;

    const [jobs, stillOpen, stillOpenTotal, weekdays, team, fees] = await Promise.all([
      loadJobs(companyId, range),
      pool.query(
        `SELECT j.id, ${JOB_DATE}::text AS date, j.title, ${CLIENT_NAME} AS client,
                COALESCE(v.value, 0)::float AS value, j.assigned_user_id,
                NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS employee
         FROM jobs j ${PLANNED_VALUE}
         LEFT JOIN clients c ON c.id = j.client_id
         LEFT JOIN users u ON u.id = j.assigned_user_id
         WHERE j.company_id = $1 AND ${OPEN} AND ${STANDARD} AND ${JOB_DATE} < $2::date
         ORDER BY ${JOB_DATE} DESC, j.id DESC
         LIMIT 12`,
        [companyId, today]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS jobs, COALESCE(SUM(v.value), 0)::float AS total
         FROM jobs j ${PLANNED_VALUE}
         WHERE j.company_id = $1 AND ${OPEN} AND ${STANDARD} AND ${JOB_DATE} < $2::date`,
        [companyId, today]
      ),
      pool.query(
        `SELECT EXTRACT(ISODOW FROM ${JOB_DATE})::int AS dow, COUNT(*)::int AS jobs
         FROM jobs j
         WHERE j.company_id = $1 AND ${EARNED} AND ${STANDARD} AND ${JOB_DATE} BETWEEN $2::date AND $3::date
         GROUP BY 1`,
        [companyId, from, to]
      ),
      loadTeam(companyId, range),
      pool.query(
        `SELECT COUNT(*)::int AS fee_jobs, COALESCE(SUM(v.value), 0)::float AS fee_value
         FROM jobs j ${COMPLETED_VALUE}
         WHERE j.company_id = $1 AND j.job_kind = 'cancellation_fee' AND ${EARNED}
           AND ${JOB_DATE} BETWEEN $2::date AND $3::date`,
        [companyId, from, to]
      ),
    ]);

    const byDow = new Map(weekdays.rows.map((r) => [num(r.dow), num(r.jobs)]));
    return {
      range: rangeOut(range),
      ...jobs,
      stillOpen: {
        jobs: num(stillOpenTotal.rows[0]?.jobs),
        total: round2(stillOpenTotal.rows[0]?.total),
        list: stillOpen.rows.map((r) => ({
          id: r.id,
          date: r.date,
          title: r.title || '',
          client: r.client || '',
          employee: r.employee || '',
          value: round2(r.value),
        })),
      },
      weekdays: [1, 2, 3, 4, 5, 6, 7].map((dow) => ({ dow, jobs: byDow.get(dow) || 0 })),
      fees: { jobs: num(fees.rows[0]?.fee_jobs), value: round2(fees.rows[0]?.fee_value) },
      team: team.members,
    };
  })
);

// GET /api/insights/ahead — booked work for the coming months, plus the
// standing subscription commitment. Kept apart from Earned on purpose.
router.get(
  '/ahead',
  handler('ahead', async (companyId, req) => {
    const months = Math.min(12, Math.max(1, Number(req.query.months) || 6));
    const today = todayString();
    const end = new Date(`${today}T00:00:00`);
    end.setMonth(end.getMonth() + months);
    end.setDate(0); // last day of the final month
    const endStr = fmtDate(end);

    const [booked, perMonth, subscriptionsMonthly] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS jobs, COALESCE(SUM(v.value), 0)::float AS total
         FROM jobs j ${PLANNED_VALUE}
         WHERE j.company_id = $1 AND ${OPEN} AND ${STANDARD}
           AND ${JOB_DATE} BETWEEN $2::date AND $3::date`,
        [companyId, today, endStr]
      ),
      pool.query(
        `SELECT to_char(date_trunc('month', ${JOB_DATE}), 'YYYY-MM') AS month,
                COUNT(*)::int AS jobs,
                COALESCE(SUM(v.value), 0)::float AS total
         FROM jobs j ${PLANNED_VALUE}
         WHERE j.company_id = $1 AND ${OPEN} AND ${STANDARD}
           AND ${JOB_DATE} BETWEEN $2::date AND $3::date
         GROUP BY 1 ORDER BY 1`,
        [companyId, today, endStr]
      ),
      monthlySubscriptionValue(pool, companyId),
    ]);

    // Subscription visits that have not been materialized yet are real planned
    // work too — without them the coming months look emptier than they are.
    const occurrences = await projectSubscriptionOccurrences(pool, companyId, today, endStr);
    const materialized = new Set();
    if (occurrences.length > 0) {
      const existing = await pool.query(
        `SELECT recurring_job_id, recurring_occurrence FROM jobs
         WHERE company_id = $1 AND recurring_job_id = ANY($2::int[])`,
        [companyId, [...new Set(occurrences.map((o) => o.subId))]]
      );
      for (const row of existing.rows) materialized.add(`${row.recurring_job_id}:${row.recurring_occurrence}`);
    }

    const byMonth = new Map();
    const monthEntry = (month) =>
      byMonth.get(month) || { month, bookedJobs: 0, bookedValue: 0, projectedJobs: 0, projectedValue: 0 };

    for (const row of perMonth.rows) {
      const entry = monthEntry(row.month);
      entry.bookedJobs = num(row.jobs);
      entry.bookedValue = round2(row.total);
      byMonth.set(row.month, entry);
    }
    for (const occ of occurrences) {
      if (materialized.has(`${occ.subId}:${occ.occ}`)) continue;
      const entry = monthEntry(occ.dateStr.slice(0, 7));
      entry.projectedJobs += 1;
      entry.projectedValue = round2(entry.projectedValue + occ.totalPrice);
      byMonth.set(entry.month, entry);
    }

    // Every month in the window, even empty ones, so the chart has no gaps.
    const cursor = new Date(`${today.slice(0, 7)}-01T00:00:00`);
    for (let i = 0; i < months; i++) {
      const month = fmtDate(cursor).slice(0, 7);
      if (!byMonth.has(month)) byMonth.set(month, monthEntry(month));
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const list = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
    return {
      range: { from: today, to: endStr, months },
      booked: { jobs: num(booked.rows[0]?.jobs), total: round2(booked.rows[0]?.total) },
      projected: {
        jobs: list.reduce((s, m) => s + m.projectedJobs, 0),
        total: round2(list.reduce((s, m) => s + m.projectedValue, 0)),
      },
      subscriptionsPerMonth: subscriptionsMonthly,
      byMonth: list,
    };
  })
);

// GET /api/insights/clients — the client book: how it grew, who matters, who went quiet.
router.get(
  '/clients',
  handler('clients', async (companyId, req) => {
    const range = readRange(req);
    const { from, to, today } = range;

    const [clients, withSubscription, active, topClients, quiet, newest, places] = await Promise.all([
      loadClients(companyId, range),
      pool.query(
        `SELECT COUNT(DISTINCT rj.client_id)::int AS n
         FROM recurring_jobs rj
         JOIN clients c ON c.id = rj.client_id AND c.deleted_at IS NULL
         WHERE rj.company_id = $1 AND rj.is_active = true
           AND (rj.paused_at IS NULL OR rj.paused_at > $2::date)`,
        [companyId, today]
      ).catch(noRows),

      // "Active" = work done for them, or booked, within the last year.
      pool.query(
        `SELECT COUNT(DISTINCT j.client_id)::int AS n
         FROM jobs j
         JOIN clients c ON c.id = j.client_id AND c.deleted_at IS NULL
         WHERE j.company_id = $1
           AND ${JOB_DATE} >= ($2::date - INTERVAL '365 days')
           AND COALESCE(j.status, '') NOT IN ('cancelled', 'deleted')`,
        [companyId, today]
      ),

      pool.query(
        `SELECT c.id, ${CLIENT_NAME} AS name, c.client_type,
                COALESCE(SUM(v.value), 0)::float AS earned,
                COUNT(j.id)::int AS jobs
         FROM jobs j ${COMPLETED_VALUE}
         JOIN clients c ON c.id = j.client_id AND c.deleted_at IS NULL
         WHERE j.company_id = $1 AND ${EARNED} AND ${JOB_DATE} BETWEEN $2::date AND $3::date
         GROUP BY c.id, c.name, c.last_name, c.client_type
         ORDER BY earned DESC
         LIMIT 8`,
        [companyId, from, to]
      ),

      // Gone quiet: paid work before, nothing in six months, nothing booked,
      // no running subscription. The people worth a phone call.
      pool.query(
        `SELECT c.id, ${CLIENT_NAME} AS name,
                MAX(${JOB_DATE})::text AS last_job,
                COUNT(*) FILTER (WHERE ${EARNED})::int AS jobs,
                COALESCE(SUM(v.value), 0)::float AS lifetime,
                COUNT(*) OVER ()::int AS total_count
         FROM clients c
         JOIN jobs j ON j.client_id = c.id AND j.company_id = c.company_id
                    AND COALESCE(j.status, '') NOT IN ('cancelled', 'deleted')
         ${COMPLETED_VALUE}
         WHERE c.company_id = $1 AND c.deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM recurring_jobs rj
             WHERE rj.client_id = c.id AND rj.is_active = true
               AND (rj.paused_at IS NULL OR rj.paused_at > $2::date)
           )
         GROUP BY c.id, c.name, c.last_name
         HAVING MAX(${JOB_DATE}) < ($2::date - INTERVAL '180 days')
            AND COUNT(*) FILTER (WHERE ${EARNED}) > 0
         ORDER BY lifetime DESC
         LIMIT 8`,
        [companyId, today]
      ),

      pool.query(
        `SELECT c.id, ${CLIENT_NAME} AS name, c.client_type, c.created_at::date::text AS added
         FROM clients c
         WHERE c.company_id = $1 AND c.deleted_at IS NULL
         ORDER BY c.created_at DESC, c.id DESC
         LIMIT 6`,
        [companyId]
      ),

      pool.query(
        `SELECT COALESCE(NULLIF(TRIM(city), ''), 'No city') AS city, COUNT(*)::int AS n
         FROM clients
         WHERE company_id = $1 AND deleted_at IS NULL
         GROUP BY 1
         ORDER BY n DESC, city
         LIMIT 6`,
        [companyId]
      ),
    ]);

    return {
      range: rangeOut(range),
      ...clients,
      withSubscription: num(withSubscription.rows[0]?.n),
      activeLastYear: num(active.rows[0]?.n),
      topClients: topClients.rows.map((r) => ({
        id: r.id,
        name: r.name || 'Client',
        clientType: r.client_type,
        earned: round2(r.earned),
        jobs: num(r.jobs),
      })),
      goneQuiet: {
        count: num(quiet.rows[0]?.total_count),
        list: quiet.rows.map((r) => ({
          id: r.id,
          name: r.name || 'Client',
          lastJob: r.last_job,
          jobs: num(r.jobs),
          lifetime: round2(r.lifetime),
        })),
      },
      newest: newest.rows.map((r) => ({
        id: r.id,
        name: r.name || 'Client',
        clientType: r.client_type,
        added: r.added,
      })),
      places: places.rows.map((r) => ({ city: r.city, clients: num(r.n) })),
    };
  })
);

function frequencyLabel(row) {
  const interval = Math.max(1, Number(row.interval_value) || 1);
  if (row.recurrence_type === 'weekly') return interval === 1 ? 'Every week' : `Every ${interval} weeks`;
  if (row.recurrence_type === 'monthly') return interval === 1 ? 'Every month' : `Every ${interval} months`;
  return 'Custom';
}

function visitsPerMonth(row) {
  const interval = Math.max(1, Number(row.interval_value) || 1);
  if (row.recurrence_type === 'weekly') return 52 / interval / 12;
  if (row.recurrence_type === 'monthly') return 1 / interval;
  return 0;
}

// GET /api/insights/subscriptions — recurring income and what it is made of.
router.get(
  '/subscriptions',
  handler('subscriptions', async (companyId, req) => {
    const range = readRange(req);
    const { from, to, today } = range;
    const subs = await loadSubscriptions(companyId, range);

    const running = subs.lifetimes.filter(
      (s) => s.row.is_active && !(s.stoppedAt && s.stoppedAt <= today)
    );
    const paused = subs.lifetimes.filter((s) => s.row.is_active && s.stoppedAt && s.stoppedAt <= today);
    const started = subs.lifetimes.filter((s) => s.start && s.start >= from && s.start <= to).length;
    const ended = subs.lifetimes.filter(
      (s) => !s.row.is_active && s.stoppedAt && s.stoppedAt >= from && s.stoppedAt <= to
    ).length;

    const mix = new Map();
    for (const s of running) {
      const label = frequencyLabel(s.row);
      const entry = mix.get(label) || { label, count: 0, perMonth: 0 };
      entry.count += 1;
      entry.perMonth += s.perMonth;
      mix.set(label, entry);
    }

    const shape = (s) => ({
      id: s.row.id,
      clientId: s.row.client_id,
      name: fullName(s.row.name, s.row.last_name) || 'Client',
      title: s.row.title || '',
      frequency: frequencyLabel(s.row),
      perVisit: round2(s.perVisit),
      perMonth: round2(s.perMonth),
      since: s.start,
      pausedAt: s.stoppedAt,
    });

    return {
      range: rangeOut(range),
      monthlyValue: subs.monthlyValue,
      active: subs.active,
      paused: subs.paused,
      started,
      ended,
      visitsPerMonth: Math.round(running.reduce((sum, s) => sum + visitsPerMonth(s.row), 0) * 10) / 10,
      averagePerMonth: subs.active > 0 ? round2(subs.monthlyValue / subs.active) : 0,
      series: subs.series,
      mix: [...mix.values()]
        .map((m) => ({ ...m, perMonth: round2(m.perMonth) }))
        .sort((a, b) => b.perMonth - a.perMonth),
      list: running.sort((a, b) => b.perMonth - a.perMonth).slice(0, 25).map(shape),
      pausedList: paused.map(shape),
    };
  })
);

// GET /api/insights/sales — requests coming in, offers going out, work being won.
router.get(
  '/sales',
  handler('sales', async (companyId, req) => {
    const range = readRange(req);
    const { from, to, today } = range;

    const [sales, sources, cohort, answerTime, toVerify, newLeads, waiting, lost] = await Promise.all([
      loadSales(companyId, range),
      pool.query(
        `SELECT COALESCE(source, 'manual') AS source, COUNT(*)::int AS n
         FROM leads WHERE company_id = $1 AND created_at::date BETWEEN $2::date AND $3::date
         GROUP BY 1`,
        [companyId, from, to]
      ).catch(noRows),

      // Offers sent in the period, and what became of them.
      pool.query(
        `SELECT status, valid_until::text AS valid_until, items
         FROM offers
         WHERE company_id = $1 AND sent_at IS NOT NULL AND sent_at::date BETWEEN $2::date AND $3::date
           AND status <> 'revoked'`,
        [companyId, from, to]
      ).catch(noRows),

      pool.query(
        `SELECT percentile_cont(0.5) WITHIN GROUP (
                  ORDER BY EXTRACT(EPOCH FROM (accepted_at - sent_at)) / 3600
                )::float AS hours
         FROM offers
         WHERE company_id = $1 AND status = 'accepted' AND sent_at IS NOT NULL
           AND accepted_at >= sent_at AND accepted_at::date BETWEEN $2::date AND $3::date`,
        [companyId, from, to]
      ).catch(noRows),

      pool.query(
        `SELECT o.id, o.accepted_date::text AS accepted_date, o.accepted_at, o.items,
                COALESCE(${CLIENT_NAME}, NULLIF(TRIM(o.contact_name), ''), 'Client') AS name
         FROM offers o LEFT JOIN clients c ON c.id = o.client_id
         WHERE o.company_id = $1 AND o.status = 'accepted' AND o.confirmed_at IS NULL AND o.archived_at IS NULL
         ORDER BY o.accepted_at NULLS LAST, o.id
         LIMIT 10`,
        [companyId]
      ).catch(noRows),

      pool.query(
        `SELECT l.id, l.first_name, l.last_name, l.email, l.phone, l.source, l.created_at
         FROM leads l WHERE ${NEW_LEADS_WHERE}
         ORDER BY l.created_at DESC
         LIMIT 10`,
        [companyId]
      ).catch(noRows),

      pool.query(
        `SELECT o.id, o.sent_at, o.viewed_at, o.valid_until::text AS valid_until, o.items,
                COALESCE(${CLIENT_NAME}, NULLIF(TRIM(o.contact_name), ''), 'Client') AS name
         FROM offers o LEFT JOIN clients c ON c.id = o.client_id
         WHERE o.company_id = $1 AND o.status = 'sent' AND o.archived_at IS NULL
         ORDER BY o.sent_at NULLS LAST, o.id
         LIMIT 10`,
        [companyId]
      ).catch(noRows),

      pool.query(
        `SELECT o.id, o.declined_at, o.decline_reason, o.items,
                COALESCE(${CLIENT_NAME}, NULLIF(TRIM(o.contact_name), ''), 'Client') AS name
         FROM offers o LEFT JOIN clients c ON c.id = o.client_id
         WHERE o.company_id = $1 AND o.status = 'declined' AND o.declined_at::date BETWEEN $2::date AND $3::date
         ORDER BY o.declined_at DESC
         LIMIT 8`,
        [companyId, from, to]
      ).catch(noRows),
    ]);

    let accepted = 0;
    let declined = 0;
    let expired = 0;
    let open = 0;
    let sentValue = 0;
    for (const row of cohort.rows) {
      sentValue += offerValue(row.items);
      if (row.status === 'accepted') accepted += 1;
      else if (row.status === 'declined') declined += 1;
      else if (row.valid_until && row.valid_until < today) expired += 1;
      else open += 1;
    }
    const answered = accepted + declined + expired;
    const hours = answerTime.rows[0]?.hours;

    return {
      range: rangeOut(range),
      ...sales,
      cohort: {
        sent: cohort.rows.length,
        accepted,
        declined,
        expired,
        open,
        winRate: answered > 0 ? Math.round((accepted / answered) * 1000) / 1000 : null,
        averageOffer: cohort.rows.length > 0 ? round2(sentValue / cohort.rows.length) : 0,
      },
      medianAnswerHours: hours != null ? Math.round(num(hours) * 10) / 10 : null,
      sources: sources.rows.map((r) => ({ source: r.source, leads: num(r.n) })),
      toVerify: toVerify.rows.map((r) => ({
        id: r.id,
        name: r.name,
        date: r.accepted_date,
        at: r.accepted_at,
        value: round2(offerValue(r.items)),
      })),
      newLeads: newLeads.rows.map((r) => ({
        id: r.id,
        name: fullName(r.first_name, r.last_name) || r.email || r.phone || 'New request',
        source: r.source,
        at: r.created_at,
      })),
      waiting: waiting.rows.map((r) => ({
        id: r.id,
        name: r.name,
        sentAt: r.sent_at,
        viewed: Boolean(r.viewed_at),
        expired: Boolean(r.valid_until && r.valid_until < today),
        value: round2(offerValue(r.items)),
      })),
      lost: lost.rows.map((r) => ({
        id: r.id,
        name: r.name,
        at: r.declined_at,
        reason: r.decline_reason || '',
        value: round2(offerValue(r.items)),
      })),
    };
  })
);

module.exports = router;
