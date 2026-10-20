/**
 * Superadmin analytics API, read-only, built on activity_events.
 *
 *   GET /api/admin/insights/overview?days=30
 *   GET /api/admin/insights/retention?weeks=10
 *   GET /api/admin/insights/heatmap?days=30&by=company|user&limit=40
 *   GET /api/admin/insights/people?search=&stage=
 *   GET /api/admin/insights/people/user/:userId
 *   GET /api/admin/insights/people/signup/:draftId
 *   GET /api/admin/insights/companies
 *   GET /api/admin/insights/companies/:companyId
 *   GET /api/admin/insights/events?companyId=&userId=&event=&before=&limit=&pageViews=1
 *   GET /api/admin/insights/event-names
 *
 * Responses are plain JSON with stable camelCase keys so they can also back
 * an MCP server / AI analyst later without changes.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../utils/database');
const { ensureActivityEventsSchema, trackingEnabled, flushEvents } = require('../utils/activityEvents');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const TZ = process.env.ADMIN_TIMEZONE || 'Europe/Copenhagen';

const NON_ACTION_EVENTS = ['page.viewed', 'session.started', 'auth.login'];
/** Counts as real usage of the product (not just looking around). */
const IS_ACTION = `(e.event <> ALL('{${NON_ACTION_EVENTS.join(',')}}'::text[]))`;
/** Excludes support impersonation and bookkeeping rows. */
const IS_REAL = `(e.source <> 'overwatch' AND e.event NOT LIKE 'system.%')`;

router.use((req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Access token required' });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    req.user = user;
    return next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
});

router.use(async (req, res, next) => {
  try {
    await ensureActivityEventsSchema();
    await flushEvents();
    next();
  } catch (err) {
    console.error('[admin-insights] schema not ready:', err.message);
    res.status(503).json({ error: 'Activity tracking schema is not ready yet' });
  }
});

function clampInt(value, def, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function fullName(first, last) {
  return [first, last].filter(Boolean).join(' ').trim();
}

function isoDay(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Last `days` calendar days (admin timezone), oldest first, as YYYY-MM-DD. */
async function dayList(days) {
  const r = await pool.query(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day
       FROM generate_series((NOW() AT TIME ZONE $1)::date - ($2::int - 1), (NOW() AT TIME ZONE $1)::date, '1 day') d`,
    [TZ, days]
  );
  return r.rows.map((x) => x.day);
}

function companyHealth({ createdAt, onboardingCompleted, activeDays7, activeDays30, lastActiveAt }) {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86400000;
  if (!onboardingCompleted) return 'in_setup';
  if (ageDays < 7) return 'new';
  if (activeDays7 >= 2) return 'active';
  if (activeDays30 > 0 || (lastActiveAt && Date.now() - new Date(lastActiveAt).getTime() < 30 * 86400000)) return 'at_risk';
  return 'dormant';
}

function mapEventRow(r) {
  return {
    id: Number(r.id),
    at: r.occurred_at,
    event: r.event,
    label: r.label,
    props: r.props || null,
    source: r.source,
    entityType: r.entity_type,
    entityId: r.entity_id,
    anonymousId: r.anonymous_id,
    user: r.user_id ? { id: r.user_id, name: fullName(r.first_name, r.last_name) || r.email, email: r.email } : null,
    company: r.company_id ? { id: r.company_id, name: r.company_name, slug: r.company_slug } : null,
  };
}

async function fetchEvents({ conditions = [], params = [], limit = 200, before = null, includePageViews = false }) {
  // Overwatch rows stay visible in timelines (flagged by `source`) but never count as usage.
  const where = [`e.event NOT LIKE 'system.%'`, ...conditions];
  const p = [...params];
  if (!includePageViews) where.push(`e.event <> 'page.viewed'`);
  if (before) {
    p.push(before);
    where.push(`e.occurred_at < $${p.length}`);
  }
  p.push(limit + 1);
  const r = await pool.query(
    `SELECT e.id, e.occurred_at, e.event, e.user_id, e.company_id, e.entity_type, e.entity_id,
            e.label, e.props, e.source, e.anonymous_id,
            u.first_name, u.last_name, u.email, c.name AS company_name, c.slug AS company_slug
       FROM activity_events e
       LEFT JOIN users u ON u.id = e.user_id
       LEFT JOIN companies c ON c.id = e.company_id
      WHERE ${where.join(' AND ')}
      ORDER BY e.occurred_at DESC, e.id DESC
      LIMIT $${p.length}`,
    p
  );
  const rows = r.rows.slice(0, limit).map(mapEventRow);
  return {
    events: rows,
    nextBefore: r.rows.length > limit && rows.length ? rows[rows.length - 1].at : null,
  };
}

async function dailyActivity({ column, id, days }) {
  const list = await dayList(days);
  const r = await pool.query(
    `SELECT to_char((e.occurred_at AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS day,
            COUNT(*) FILTER (WHERE ${IS_ACTION})::int AS actions,
            COUNT(*) FILTER (WHERE e.event = 'session.started' OR e.event = 'auth.login')::int AS sessions,
            COUNT(*)::int AS events
       FROM activity_events e
      WHERE e.${column} = $2 AND ${IS_REAL}
        AND e.occurred_at >= NOW() - ($3::int || ' days')::interval
      GROUP BY 1`,
    [TZ, id, days]
  );
  const byDay = new Map(r.rows.map((x) => [x.day, x]));
  return list.map((day) => {
    const x = byDay.get(day);
    return { day, actions: x?.actions || 0, sessions: x?.sessions || 0, events: x?.events || 0 };
  });
}

// ── Overview ────────────────────────────────────────────────────────────────

router.get('/overview', async (req, res) => {
  try {
    const days = clampInt(req.query.days, 30, 7, 365);
    const interval = `${days} days`;

    const [kpiRes, seriesRes, featuresRes, funnelRes] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM users)::int AS accounts_total,
           (SELECT COUNT(*) FROM companies)::int AS companies_total,
           (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - $1::interval)::int AS accounts_new,
           (SELECT COUNT(DISTINCT LOWER(email)) FROM signup_progress_drafts
              WHERE email IS NOT NULL AND created_at >= NOW() - $1::interval)::int AS signups_started,
           (SELECT COUNT(DISTINCT e.user_id) FROM activity_events e
              WHERE ${IS_REAL} AND e.user_id IS NOT NULL AND e.occurred_at >= NOW() - INTERVAL '1 day')::int AS active_users_1d,
           (SELECT COUNT(DISTINCT e.user_id) FROM activity_events e
              WHERE ${IS_REAL} AND e.user_id IS NOT NULL AND e.occurred_at >= NOW() - INTERVAL '7 days')::int AS active_users_7d,
           (SELECT COUNT(DISTINCT e.user_id) FROM activity_events e
              WHERE ${IS_REAL} AND e.user_id IS NOT NULL AND e.occurred_at >= NOW() - INTERVAL '30 days')::int AS active_users_30d,
           (SELECT COUNT(DISTINCT e.company_id) FROM activity_events e
              WHERE ${IS_REAL} AND ${IS_ACTION} AND e.company_id IS NOT NULL AND e.occurred_at >= NOW() - INTERVAL '7 days')::int AS working_companies_7d,
           (SELECT COUNT(*) FROM activity_events e
              WHERE ${IS_REAL} AND e.event IN ('session.started') AND e.occurred_at >= NOW() - $1::interval)::int AS sessions,
           (SELECT COUNT(*) FROM activity_events e
              WHERE ${IS_REAL} AND ${IS_ACTION} AND e.source <> 'signup' AND e.occurred_at >= NOW() - $1::interval)::int AS actions,
           (SELECT COUNT(*) FROM users u
              WHERE u.created_at BETWEEN NOW() - INTERVAL '35 days' AND NOW() - INTERVAL '8 days')::int AS retention_cohort,
           (SELECT COUNT(*) FROM users u
              WHERE u.created_at BETWEEN NOW() - INTERVAL '35 days' AND NOW() - INTERVAL '8 days'
                AND EXISTS (SELECT 1 FROM activity_events e
                             WHERE e.user_id = u.id AND ${IS_REAL}
                               AND e.source <> 'signup'
                               AND e.occurred_at >= NOW() - INTERVAL '7 days'))::int AS retention_returned`,
        [interval]
      ),
      pool.query(
        `WITH d AS (
           SELECT generate_series((NOW() AT TIME ZONE $1)::date - ($2::int - 1), (NOW() AT TIME ZONE $1)::date, '1 day')::date AS day
         ),
         ev AS (
           SELECT (e.occurred_at AT TIME ZONE $1)::date AS day,
                  COUNT(DISTINCT e.user_id) FILTER (WHERE e.user_id IS NOT NULL) AS active_users,
                  COUNT(DISTINCT e.company_id) FILTER (WHERE ${IS_ACTION} AND e.company_id IS NOT NULL) AS working_companies,
                  COUNT(*) FILTER (WHERE e.event = 'session.started') AS sessions,
                  COUNT(*) FILTER (WHERE e.event = 'auth.login') AS logins,
                  COUNT(*) FILTER (WHERE ${IS_ACTION} AND e.source <> 'signup') AS actions
             FROM activity_events e
            WHERE ${IS_REAL} AND e.occurred_at >= NOW() - ($2::int || ' days')::interval - INTERVAL '1 day'
            GROUP BY 1
         ),
         su AS (
           SELECT (created_at::timestamptz AT TIME ZONE $1)::date AS day, COUNT(*) AS n
             FROM users WHERE created_at >= NOW() - ($2::int || ' days')::interval - INTERVAL '1 day'
            GROUP BY 1
         ),
         st AS (
           SELECT (created_at::timestamptz AT TIME ZONE $1)::date AS day, COUNT(DISTINCT LOWER(email)) AS n
             FROM signup_progress_drafts
            WHERE email IS NOT NULL AND created_at >= NOW() - ($2::int || ' days')::interval - INTERVAL '1 day'
            GROUP BY 1
         )
         SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                COALESCE(ev.active_users, 0)::int AS active_users,
                COALESCE(ev.working_companies, 0)::int AS working_companies,
                COALESCE(ev.sessions, 0)::int AS sessions,
                COALESCE(ev.logins, 0)::int AS logins,
                COALESCE(ev.actions, 0)::int AS actions,
                COALESCE(su.n, 0)::int AS accounts_created,
                COALESCE(st.n, 0)::int AS signups_started
           FROM d
           LEFT JOIN ev ON ev.day = d.day
           LEFT JOIN su ON su.day = d.day
           LEFT JOIN st ON st.day = d.day
          ORDER BY d.day`,
        [TZ, days]
      ),
      pool.query(
        `SELECT e.event, COUNT(*)::int AS count,
                COUNT(DISTINCT e.company_id)::int AS companies,
                COUNT(DISTINCT e.user_id)::int AS users
           FROM activity_events e
          WHERE ${IS_REAL} AND ${IS_ACTION} AND e.source NOT IN ('signup', 'backfill')
            AND e.occurred_at >= NOW() - $1::interval
          GROUP BY e.event
          ORDER BY companies DESC, count DESC
          LIMIT 25`,
        [interval]
      ),
      pool.query(
        `WITH people AS (
           SELECT LOWER(email) AS email FROM signup_progress_drafts
            WHERE email IS NOT NULL AND created_at >= NOW() - $1::interval
           UNION
           SELECT LOWER(email) FROM users WHERE created_at >= NOW() - $1::interval
         ),
         acc AS (
           SELECT u.id, u.created_at, c.id AS company_id, c.onboarding_completed
             FROM users u
             JOIN people p ON p.email = LOWER(u.email)
             LEFT JOIN companies c ON c.owner_id = u.id
         )
         SELECT
           (SELECT COUNT(*) FROM people)::int AS started,
           (SELECT COUNT(*) FROM people p WHERE EXISTS (
              SELECT 1 FROM signup_progress_drafts d WHERE LOWER(d.email) = p.email
                AND d.step IN ('code_sent','code_verified','email_verified','account_created','wizard_company','wizard_goals','wizard_completed','plan_solo','plan_company'))
              OR EXISTS (SELECT 1 FROM users u WHERE LOWER(u.email) = p.email))::int AS details_entered,
           (SELECT COUNT(*) FROM acc)::int AS account_created,
           (SELECT COUNT(*) FROM acc WHERE onboarding_completed IS TRUE)::int AS setup_completed,
           (SELECT COUNT(*) FROM acc WHERE EXISTS (SELECT 1 FROM clients cl WHERE cl.company_id = acc.company_id))::int AS first_client,
           (SELECT COUNT(*) FROM acc WHERE EXISTS (SELECT 1 FROM jobs j WHERE j.company_id = acc.company_id))::int AS first_job,
           (SELECT COUNT(*) FROM acc WHERE EXISTS (
              SELECT 1 FROM activity_events e
               WHERE e.user_id = acc.id AND ${IS_REAL} AND e.source <> 'signup'
                 AND e.occurred_at > acc.created_at + INTERVAL '1 day'))::int AS came_back`,
        [interval]
      ),
    ]);

    const k = kpiRes.rows[0];
    const f = funnelRes.rows[0];
    res.json({
      days,
      timezone: TZ,
      trackingEnabled: trackingEnabled(),
      kpis: {
        accountsTotal: k.accounts_total,
        companiesTotal: k.companies_total,
        accountsNew: k.accounts_new,
        signupsStarted: k.signups_started,
        activeUsers1d: k.active_users_1d,
        activeUsers7d: k.active_users_7d,
        activeUsers30d: k.active_users_30d,
        workingCompanies7d: k.working_companies_7d,
        sessions: k.sessions,
        actions: k.actions,
        retention: {
          cohort: k.retention_cohort,
          returned: k.retention_returned,
          rate: k.retention_cohort ? k.retention_returned / k.retention_cohort : null,
          definition: 'Accounts created 8–35 days ago that were active in the last 7 days',
        },
      },
      series: seriesRes.rows.map((r) => ({
        day: r.day,
        activeUsers: r.active_users,
        workingCompanies: r.working_companies,
        sessions: r.sessions,
        logins: r.logins,
        actions: r.actions,
        accountsCreated: r.accounts_created,
        signupsStarted: r.signups_started,
      })),
      funnel: [
        { key: 'started', label: 'Entered email', count: f.started },
        { key: 'details', label: 'Entered details', count: f.details_entered },
        { key: 'account', label: 'Created account', count: f.account_created },
        { key: 'setup', label: 'Finished setup', count: f.setup_completed },
        { key: 'client', label: 'Added a client', count: f.first_client },
        { key: 'job', label: 'Created a job', count: f.first_job },
        { key: 'returned', label: 'Came back another day', count: f.came_back },
      ],
      features: featuresRes.rows,
    });
  } catch (err) {
    console.error('[admin-insights] overview error:', err);
    res.status(500).json({ error: 'Failed to load overview' });
  }
});

// ── Retention by signup week ────────────────────────────────────────────────

router.get('/retention', async (req, res) => {
  try {
    const weeks = clampInt(req.query.weeks, 10, 4, 26);
    const cohortStart = `date_trunc('week', LOCALTIMESTAMP) - ($1::int - 1) * INTERVAL '1 week'`;
    const [sizes, activity] = await Promise.all([
      pool.query(
        `SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS cohort, COUNT(*)::int AS size
           FROM companies WHERE created_at >= ${cohortStart}
          GROUP BY 1 ORDER BY 1`,
        [weeks]
      ),
      pool.query(
        `WITH co AS (
           SELECT id, created_at, date_trunc('week', created_at) AS cohort
             FROM companies WHERE created_at >= ${cohortStart}
         ),
         act AS (
           SELECT DISTINCT co.id, co.cohort,
                  FLOOR(EXTRACT(EPOCH FROM (e.occurred_at::timestamp - co.created_at)) / 604800)::int AS wk
             FROM co
             JOIN activity_events e ON e.company_id = co.id
            WHERE ${IS_REAL} AND e.user_id IS NOT NULL AND e.occurred_at::timestamp >= co.created_at
         )
         SELECT to_char(cohort, 'YYYY-MM-DD') AS cohort, wk, COUNT(*)::int AS n
           FROM act GROUP BY cohort, wk`,
        [weeks]
      ),
    ]);

    const activeBy = new Map(activity.rows.map((a) => [`${a.cohort}|${a.wk}`, a.n]));
    const now = Date.now();
    const cohorts = sizes.rows.map(({ cohort, size }) => {
      const maxWeek = Math.floor((now - new Date(cohort).getTime()) / (7 * 86400000));
      const cells = [];
      for (let i = 0; i <= Math.min(maxWeek, weeks - 1); i += 1) {
        const n = activeBy.get(`${cohort}|${i}`) || 0;
        cells.push({ week: i, active: n, rate: size ? n / size : 0 });
      }
      return { cohort, size, weeks: cells };
    });
    res.json({
      weeks,
      definition: 'Share of companies (grouped by signup week) with any user activity in each week after signup',
      cohorts,
    });
  } catch (err) {
    console.error('[admin-insights] retention error:', err);
    res.status(500).json({ error: 'Failed to load retention' });
  }
});

// ── Heatmap (company × day or user × day) ───────────────────────────────────

router.get('/heatmap', async (req, res) => {
  try {
    const days = clampInt(req.query.days, 30, 7, 120);
    const limit = clampInt(req.query.limit, 40, 5, 200);
    const by = req.query.by === 'user' ? 'user' : 'company';
    const col = by === 'user' ? 'user_id' : 'company_id';
    const list = await dayList(days);

    const r = await pool.query(
      `SELECT e.${col} AS key,
              to_char((e.occurred_at AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS day,
              COUNT(*) FILTER (WHERE ${IS_ACTION})::int AS actions,
              COUNT(*)::int AS events
         FROM activity_events e
        WHERE ${IS_REAL} AND e.${col} IS NOT NULL
          AND e.occurred_at >= NOW() - ($2::int || ' days')::interval
        GROUP BY 1, 2`,
      [TZ, days]
    );

    const byKey = new Map();
    for (const row of r.rows) {
      if (!byKey.has(row.key)) byKey.set(row.key, { actions: 0, events: 0, days: new Map() });
      const agg = byKey.get(row.key);
      agg.actions += row.actions;
      agg.events += row.events;
      agg.days.set(row.day, row);
    }
    const ranked = [...byKey.entries()]
      .sort((a, b) => b[1].actions - a[1].actions || b[1].events - a[1].events)
      .slice(0, limit);
    const ids = ranked.map(([id]) => id);

    let names = new Map();
    if (ids.length) {
      const q = by === 'user'
        ? `SELECT u.id, NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS name, u.email AS sub,
                  (SELECT c.name FROM user_companies uc JOIN companies c ON c.id = uc.company_id
                    WHERE uc.user_id = u.id ORDER BY (uc.role = 'owner') DESC LIMIT 1) AS extra
             FROM users u WHERE u.id = ANY($1)`
        : `SELECT c.id, c.name, c.slug AS sub, COALESCE(c.plan, 'standard') AS extra
             FROM companies c WHERE c.id = ANY($1)`;
      const nr = await pool.query(q, [ids]);
      names = new Map(nr.rows.map((x) => [x.id, x]));
    }

    let maxActions = 0;
    const rows = ranked.map(([id, agg]) => {
      const n = names.get(id) || {};
      const cells = list.map((day) => {
        const x = agg.days.get(day);
        const a = x?.actions || 0;
        if (a > maxActions) maxActions = a;
        return { a, e: x?.events || 0 };
      });
      return {
        id,
        name: n.name || n.sub || `#${id}`,
        sub: by === 'user' ? (n.extra || n.sub || null) : (n.extra || null),
        totalActions: agg.actions,
        totalEvents: agg.events,
        activeDays: agg.days.size,
        cells,
      };
    });

    res.json({ by, days: list, maxActions, rows });
  } catch (err) {
    console.error('[admin-insights] heatmap error:', err);
    res.status(500).json({ error: 'Failed to load heatmap' });
  }
});

// ── People (accounts + unfinished signups in one list) ─────────────────────

const STAGE_FROM_DRAFT = {
  name_entered: 'email',
  email_entered: 'email',
  details_ready: 'details',
  code_sent: 'verify',
  code_verified: 'verify',
  email_verified: 'verify',
};

router.get('/people', async (req, res) => {
  try {
    const [usersRes, signupsRes] = await Promise.all([
      pool.query(
        `WITH ev AS (
           SELECT e.user_id,
                  COUNT(*) FILTER (WHERE ${IS_ACTION} AND e.occurred_at >= NOW() - INTERVAL '7 days')::int AS a7,
                  COUNT(*) FILTER (WHERE ${IS_ACTION} AND e.occurred_at >= NOW() - INTERVAL '30 days')::int AS a30,
                  COUNT(*) FILTER (WHERE e.event = 'session.started' AND e.occurred_at >= NOW() - INTERVAL '30 days')::int AS s30,
                  COUNT(DISTINCT (e.occurred_at AT TIME ZONE $1)::date) FILTER (WHERE e.occurred_at >= NOW() - INTERVAL '30 days')::int AS d30,
                  MAX(e.occurred_at) AS last_event
             FROM activity_events e
            WHERE e.user_id IS NOT NULL AND ${IS_REAL}
            GROUP BY e.user_id
         ),
         pc AS (
           SELECT DISTINCT ON (uc.user_id)
                  uc.user_id, uc.role, c.id AS company_id, c.name AS company_name, c.slug AS company_slug,
                  COALESCE(c.plan, 'standard') AS plan, c.onboarding_completed, c.onboarding_step,
                  EXISTS (SELECT 1 FROM jobs j WHERE j.company_id = c.id) AS has_job,
                  EXISTS (SELECT 1 FROM clients cl WHERE cl.company_id = c.id) AS has_client
             FROM user_companies uc
             JOIN companies c ON c.id = uc.company_id
            ORDER BY uc.user_id, (uc.role = 'owner') DESC, c.created_at
         )
         SELECT u.id, u.first_name, u.last_name, u.email, u.created_at, u.last_login_at, u.last_active_at,
                ev.a7, ev.a30, ev.s30, ev.d30, ev.last_event,
                pc.role, pc.company_id, pc.company_name, pc.company_slug, pc.plan,
                pc.onboarding_completed, pc.onboarding_step, pc.has_job, pc.has_client
           FROM users u
           LEFT JOIN ev ON ev.user_id = u.id
           LEFT JOIN pc ON pc.user_id = u.id`,
        [TZ]
      ),
      pool.query(
        `SELECT DISTINCT ON (LOWER(d.email))
                d.id, d.client_session_id, d.email, d.first_name, d.last_name, d.step, d.created_at, d.updated_at,
                (SELECT MAX(e.occurred_at) FROM activity_events e WHERE e.anonymous_id = d.client_session_id) AS last_event,
                (SELECT COUNT(*) FROM activity_events e WHERE e.anonymous_id = d.client_session_id)::int AS events
           FROM signup_progress_drafts d
          WHERE d.email IS NOT NULL
            AND d.user_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(d.email))
          ORDER BY LOWER(d.email), d.updated_at DESC`
      ),
    ]);

    const latest = (...dates) =>
      dates.filter(Boolean).map((d) => new Date(d)).sort((a, b) => b - a)[0] || null;

    const people = [
      ...usersRes.rows.map((u) => {
        let stage = 'no_company';
        if (u.company_id) {
          if (u.role && u.role !== 'owner') stage = 'team';
          else if (!u.onboarding_completed) stage = u.onboarding_step === 'goals' ? 'goals' : 'company';
          else if (u.has_job) stage = 'activated';
          else stage = 'onboarded';
        }
        return {
          key: `u-${u.id}`,
          kind: 'user',
          id: u.id,
          name: fullName(u.first_name, u.last_name) || u.email,
          email: u.email,
          company: u.company_id ? { id: u.company_id, name: u.company_name, slug: u.company_slug, plan: u.plan } : null,
          role: u.role || null,
          stage,
          hasClient: !!u.has_client,
          hasJob: !!u.has_job,
          signedUpAt: u.created_at,
          lastActiveAt: latest(u.last_event, u.last_active_at, u.last_login_at),
          actions7d: u.a7 || 0,
          actions30d: u.a30 || 0,
          sessions30d: u.s30 || 0,
          activeDays30d: u.d30 || 0,
        };
      }),
      ...signupsRes.rows.map((d) => ({
        key: `s-${d.id}`,
        kind: 'signup',
        id: d.id,
        name: fullName(d.first_name, d.last_name) || d.email,
        email: d.email,
        company: null,
        role: null,
        stage: STAGE_FROM_DRAFT[d.step] || 'email',
        hasClient: false,
        hasJob: false,
        signedUpAt: d.created_at,
        lastActiveAt: latest(d.last_event, d.updated_at),
        actions7d: 0,
        actions30d: d.events || 0,
        sessions30d: 0,
        activeDays30d: 0,
      })),
    ];

    const search = String(req.query.search || '').trim().toLowerCase();
    const stage = String(req.query.stage || '').trim();
    const filtered = people.filter((p) => {
      if (stage && p.stage !== stage) return false;
      if (!search) return true;
      return [p.name, p.email, p.company?.name].filter(Boolean).some((s) => s.toLowerCase().includes(search));
    });
    filtered.sort((a, b) => new Date(b.lastActiveAt || b.signedUpAt) - new Date(a.lastActiveAt || a.signedUpAt));

    const stageCounts = {};
    for (const p of people) stageCounts[p.stage] = (stageCounts[p.stage] || 0) + 1;

    res.json({ total: people.length, stageCounts, people: filtered });
  } catch (err) {
    console.error('[admin-insights] people error:', err);
    res.status(500).json({ error: 'Failed to load people' });
  }
});

router.get('/people/user/:userId', async (req, res) => {
  try {
    const userId = clampInt(req.params.userId, 0, 0, 2147483647);
    const u = await pool.query(
      `SELECT id, first_name, last_name, email, role, language_code, created_at, last_login_at, last_active_at
         FROM users WHERE id = $1`,
      [userId]
    );
    if (!u.rows.length) return res.status(404).json({ error: 'User not found' });
    const user = u.rows[0];

    const [companies, stats, daily, drafts] = await Promise.all([
      pool.query(
        `SELECT c.id, c.name, c.slug, COALESCE(c.plan, 'standard') AS plan, uc.role,
                c.onboarding_completed, c.onboarding_step, c.created_at,
                EXISTS (SELECT 1 FROM jobs j WHERE j.company_id = c.id) AS has_job
           FROM user_companies uc JOIN companies c ON c.id = uc.company_id
          WHERE uc.user_id = $1 ORDER BY (uc.role = 'owner') DESC, c.created_at`,
        [userId]
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE e.event = 'session.started')::int AS sessions,
                COUNT(*) FILTER (WHERE e.event = 'auth.login')::int AS logins,
                COUNT(*) FILTER (WHERE ${IS_ACTION})::int AS actions,
                COUNT(*) FILTER (WHERE e.event = 'page.viewed')::int AS page_views,
                COUNT(DISTINCT (e.occurred_at AT TIME ZONE $2)::date)::int AS active_days,
                MIN(e.occurred_at) AS first_seen, MAX(e.occurred_at) AS last_seen
           FROM activity_events e
          WHERE ${IS_REAL}
            AND (e.user_id = $1 OR e.anonymous_id IN (
                  SELECT client_session_id FROM signup_progress_drafts WHERE user_id = $1 OR LOWER(email) = LOWER($3)))`,
        [userId, TZ, user.email]
      ),
      dailyActivity({ column: 'user_id', id: userId, days: 90 }),
      pool.query(
        `SELECT client_session_id FROM signup_progress_drafts WHERE user_id = $1 OR LOWER(email) = LOWER($2)`,
        [userId, user.email]
      ),
    ]);

    const anonIds = drafts.rows.map((d) => d.client_session_id);
    const timeline = await fetchEvents({
      conditions: [`(e.user_id = $1 OR e.anonymous_id = ANY($2::text[]))`],
      params: [userId, anonIds],
      limit: clampInt(req.query.limit, 300, 20, 1000),
      before: req.query.before || null,
      includePageViews: req.query.pageViews === '1',
    });

    const s = stats.rows[0];
    res.json({
      user: {
        id: user.id,
        name: fullName(user.first_name, user.last_name) || user.email,
        email: user.email,
        languageCode: user.language_code,
        signedUpAt: user.created_at,
        lastLoginAt: user.last_login_at,
        lastActiveAt: s.last_seen || user.last_active_at || user.last_login_at,
      },
      companies: companies.rows.map((c) => ({
        id: c.id, name: c.name, slug: c.slug, plan: c.plan, role: c.role,
        onboardingCompleted: !!c.onboarding_completed, onboardingStep: c.onboarding_step, createdAt: c.created_at,
        hasJob: !!c.has_job,
      })),
      stats: {
        sessions: s.sessions, logins: s.logins, actions: s.actions, pageViews: s.page_views,
        activeDays: s.active_days, firstSeen: s.first_seen, lastSeen: s.last_seen,
      },
      daily,
      ...timeline,
    });
  } catch (err) {
    console.error('[admin-insights] user detail error:', err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

router.get('/people/signup/:draftId', async (req, res) => {
  try {
    const draftId = clampInt(req.params.draftId, 0, 0, 2147483647);
    const d = await pool.query(`SELECT * FROM signup_progress_drafts WHERE id = $1`, [draftId]);
    if (!d.rows.length) return res.status(404).json({ error: 'Signup not found' });
    const draft = d.rows[0];
    const sessions = await pool.query(
      `SELECT client_session_id FROM signup_progress_drafts WHERE LOWER(email) = LOWER($1) OR id = $2`,
      [draft.email || '', draftId]
    );
    const timeline = await fetchEvents({
      conditions: [`e.anonymous_id = ANY($1::text[])`],
      params: [sessions.rows.map((s) => s.client_session_id)],
      limit: 300,
      includePageViews: true,
    });
    res.json({
      signup: {
        id: draft.id,
        name: fullName(draft.first_name, draft.last_name) || draft.email,
        email: draft.email,
        step: draft.step,
        stage: STAGE_FROM_DRAFT[draft.step] || 'email',
        startedAt: draft.created_at,
        lastActiveAt: draft.updated_at,
        userId: draft.user_id,
      },
      ...timeline,
    });
  } catch (err) {
    console.error('[admin-insights] signup detail error:', err);
    res.status(500).json({ error: 'Failed to load signup' });
  }
});

// ── Companies ───────────────────────────────────────────────────────────────

router.get('/companies', async (req, res) => {
  try {
    const days = 30;
    const list = await dayList(days);
    const [companiesRes, dailyRes] = await Promise.all([
      pool.query(
        `WITH ev AS (
           SELECT e.company_id,
                  COUNT(*) FILTER (WHERE ${IS_ACTION} AND e.occurred_at >= NOW() - INTERVAL '30 days')::int AS a30,
                  COUNT(*) FILTER (WHERE ${IS_ACTION} AND e.occurred_at >= NOW() - INTERVAL '7 days')::int AS a7,
                  COUNT(DISTINCT (e.occurred_at AT TIME ZONE $1)::date) FILTER (WHERE e.occurred_at >= NOW() - INTERVAL '30 days')::int AS d30,
                  COUNT(DISTINCT (e.occurred_at AT TIME ZONE $1)::date) FILTER (WHERE e.occurred_at >= NOW() - INTERVAL '7 days')::int AS d7,
                  COUNT(DISTINCT e.user_id) FILTER (WHERE e.occurred_at >= NOW() - INTERVAL '30 days')::int AS u30,
                  MAX(e.occurred_at) FILTER (WHERE e.user_id IS NOT NULL) AS last_active
             FROM activity_events e
            WHERE e.company_id IS NOT NULL AND ${IS_REAL}
            GROUP BY e.company_id
         ),
         j AS (
           SELECT company_id,
                  COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE NOT COALESCE(is_generated, false))::int AS manual,
                  COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
                  COUNT(*) FILTER (WHERE created_at >= LOCALTIMESTAMP - INTERVAL '30 days')::int AS recent
             FROM jobs GROUP BY company_id
         ),
         cl AS (
           SELECT company_id, COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE created_at >= LOCALTIMESTAMP - INTERVAL '30 days')::int AS recent
             FROM clients WHERE deleted_at IS NULL GROUP BY company_id
         ),
         inv AS (SELECT company_id, COUNT(*)::int AS total FROM invoices GROUP BY company_id),
         off AS (SELECT company_id, COUNT(*)::int AS total FROM offers GROUP BY company_id),
         sub AS (SELECT company_id, COUNT(*) FILTER (WHERE is_active)::int AS active FROM recurring_jobs GROUP BY company_id),
         mem AS (SELECT company_id, COUNT(*)::int AS total FROM user_companies GROUP BY company_id)
         SELECT c.id, c.name, c.slug, c.created_at, c.suspended_at, c.expires_at,
                COALESCE(c.plan, 'standard') AS plan, c.stripe_subscription_id,
                c.onboarding_completed, c.onboarding_step, c.industry,
                u.id AS owner_id, u.first_name AS owner_first, u.last_name AS owner_last, u.email AS owner_email,
                COALESCE(mem.total, 0) AS members,
                COALESCE(cl.total, 0) AS clients, COALESCE(cl.recent, 0) AS clients_30d,
                COALESCE(j.total, 0) AS jobs_total, COALESCE(j.manual, 0) AS jobs_manual,
                COALESCE(j.completed, 0) AS jobs_completed, COALESCE(j.recent, 0) AS jobs_30d,
                COALESCE(inv.total, 0) AS invoices, COALESCE(off.total, 0) AS offers,
                COALESCE(sub.active, 0) AS subscriptions,
                COALESCE(ev.a30, 0) AS a30, COALESCE(ev.a7, 0) AS a7,
                COALESCE(ev.d30, 0) AS d30, COALESCE(ev.d7, 0) AS d7, COALESCE(ev.u30, 0) AS u30,
                ev.last_active
           FROM companies c
           LEFT JOIN users u ON u.id = c.owner_id
           LEFT JOIN ev ON ev.company_id = c.id
           LEFT JOIN j ON j.company_id = c.id
           LEFT JOIN cl ON cl.company_id = c.id
           LEFT JOIN inv ON inv.company_id = c.id
           LEFT JOIN off ON off.company_id = c.id
           LEFT JOIN sub ON sub.company_id = c.id
           LEFT JOIN mem ON mem.company_id = c.id
          ORDER BY ev.last_active DESC NULLS LAST, c.created_at DESC`,
        [TZ]
      ),
      pool.query(
        `SELECT e.company_id, to_char((e.occurred_at AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS day,
                COUNT(*) FILTER (WHERE ${IS_ACTION})::int AS a, COUNT(*)::int AS n
           FROM activity_events e
          WHERE e.company_id IS NOT NULL AND ${IS_REAL}
            AND e.occurred_at >= NOW() - ($2::int || ' days')::interval
          GROUP BY 1, 2`,
        [TZ, days]
      ),
    ]);

    const daily = new Map();
    for (const r of dailyRes.rows) {
      if (!daily.has(r.company_id)) daily.set(r.company_id, new Map());
      daily.get(r.company_id).set(r.day, r);
    }

    const companies = companiesRes.rows.map((c) => {
      const d = daily.get(c.id) || new Map();
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        industry: c.industry || null,
        createdAt: c.created_at,
        plan: c.plan,
        hasStripeSubscription: !!c.stripe_subscription_id,
        expiresAt: c.expires_at,
        suspendedAt: c.suspended_at,
        onboardingCompleted: !!c.onboarding_completed,
        onboardingStep: c.onboarding_step,
        owner: c.owner_id ? { id: c.owner_id, name: fullName(c.owner_first, c.owner_last) || c.owner_email, email: c.owner_email } : null,
        counts: {
          members: c.members, clients: c.clients, clients30d: c.clients_30d,
          jobs: c.jobs_total, jobsManual: c.jobs_manual, jobsCompleted: c.jobs_completed, jobs30d: c.jobs_30d,
          invoices: c.invoices, offers: c.offers, subscriptions: c.subscriptions,
        },
        activity: {
          actions7d: c.a7, actions30d: c.a30, activeDays7d: c.d7, activeDays30d: c.d30,
          activeUsers30d: c.u30, lastActiveAt: c.last_active,
          cells: list.map((day) => {
            const x = d.get(day);
            return { a: x?.a || 0, e: x?.n || 0 };
          }),
        },
        health: companyHealth({
          createdAt: c.created_at,
          onboardingCompleted: c.onboarding_completed,
          activeDays7: c.d7,
          activeDays30: c.d30,
          lastActiveAt: c.last_active,
        }),
      };
    });

    const healthCounts = {};
    for (const c of companies) healthCounts[c.health] = (healthCounts[c.health] || 0) + 1;
    res.json({ days: list, healthCounts, companies });
  } catch (err) {
    console.error('[admin-insights] companies error:', err);
    res.status(500).json({ error: 'Failed to load companies' });
  }
});

router.get('/companies/:companyId', async (req, res) => {
  try {
    const companyId = clampInt(req.params.companyId, 0, 0, 2147483647);
    const cRes = await pool.query(
      `SELECT c.*, COALESCE(c.plan, 'standard') AS plan_name,
              u.first_name AS owner_first, u.last_name AS owner_last, u.email AS owner_email
         FROM companies c LEFT JOIN users u ON u.id = c.owner_id
        WHERE c.id = $1`,
      [companyId]
    );
    if (!cRes.rows.length) return res.status(404).json({ error: 'Company not found' });
    const c = cRes.rows[0];

    const ageDays = (Date.now() - new Date(c.created_at).getTime()) / 86400000;
    const bucket = ageDays <= 120 ? 'week' : 'month';
    const range = req.query.range === 'all' ? null : clampInt(req.query.months, 12, 1, 36);

    const [growthRes, totalsRes, membersRes, featuresRes, daily, pendingInvites] = await Promise.all([
      pool.query(
        `WITH b AS (
           SELECT generate_series(
                    date_trunc($2, GREATEST($3::timestamp, ${range ? `LOCALTIMESTAMP - ($4::int || ' months')::interval` : '$3::timestamp'})),
                    date_trunc($2, LOCALTIMESTAMP),
                    ('1 ' || $2)::interval) AS start
         )
         SELECT to_char(b.start, 'YYYY-MM-DD') AS bucket,
                (SELECT COUNT(*) FROM clients x WHERE x.company_id = $1 AND x.created_at >= b.start AND x.created_at < b.start + ('1 ' || $2)::interval)::int AS clients_new,
                (SELECT COUNT(*) FROM clients x WHERE x.company_id = $1 AND x.created_at < b.start + ('1 ' || $2)::interval
                    AND (x.deleted_at IS NULL OR x.deleted_at >= b.start + ('1 ' || $2)::interval))::int AS clients_total,
                (SELECT COUNT(*) FROM jobs x WHERE x.company_id = $1 AND NOT COALESCE(x.is_generated, false)
                    AND x.created_at >= b.start AND x.created_at < b.start + ('1 ' || $2)::interval)::int AS jobs_created,
                (SELECT COUNT(*) FROM jobs x WHERE x.company_id = $1 AND x.scheduled_date ~ '^\\d{4}-\\d{2}-\\d{2}$'
                    AND x.scheduled_date::date >= b.start AND x.scheduled_date::date < b.start + ('1 ' || $2)::interval)::int AS jobs_scheduled,
                (SELECT COUNT(*) FROM jobs x WHERE x.company_id = $1 AND x.status = 'completed' AND x.scheduled_date ~ '^\\d{4}-\\d{2}-\\d{2}$'
                    AND x.scheduled_date::date >= b.start AND x.scheduled_date::date < b.start + ('1 ' || $2)::interval)::int AS jobs_completed,
                (SELECT COUNT(*) FROM invoices x WHERE x.company_id = $1
                    AND x.created_at >= b.start AND x.created_at < b.start + ('1 ' || $2)::interval)::int AS invoices,
                (SELECT COUNT(*) FROM offers x WHERE x.company_id = $1
                    AND x.created_at >= b.start AND x.created_at < b.start + ('1 ' || $2)::interval)::int AS offers
           FROM b ORDER BY b.start`,
        range ? [companyId, bucket, c.created_at, range] : [companyId, bucket, c.created_at]
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM clients WHERE company_id = $1 AND deleted_at IS NULL)::int AS clients,
           (SELECT COUNT(*) FROM jobs WHERE company_id = $1)::int AS jobs,
           (SELECT COUNT(*) FROM jobs WHERE company_id = $1 AND NOT COALESCE(is_generated, false))::int AS jobs_manual,
           (SELECT COUNT(*) FROM jobs WHERE company_id = $1 AND status = 'completed')::int AS jobs_completed,
           (SELECT COUNT(*) FROM invoices WHERE company_id = $1)::int AS invoices,
           (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE company_id = $1 AND status = 'paid')::float AS invoiced_paid,
           (SELECT COUNT(*) FROM offers WHERE company_id = $1)::int AS offers,
           (SELECT COUNT(*) FROM recurring_jobs WHERE company_id = $1 AND is_active)::int AS subscriptions,
           (SELECT COUNT(*) FROM services WHERE company_id = $1)::int AS services`,
        [companyId]
      ).catch(async () => pool.query(
        `SELECT
           (SELECT COUNT(*) FROM clients WHERE company_id = $1 AND deleted_at IS NULL)::int AS clients,
           (SELECT COUNT(*) FROM jobs WHERE company_id = $1)::int AS jobs,
           (SELECT COUNT(*) FROM jobs WHERE company_id = $1 AND NOT COALESCE(is_generated, false))::int AS jobs_manual,
           (SELECT COUNT(*) FROM jobs WHERE company_id = $1 AND status = 'completed')::int AS jobs_completed,
           (SELECT COUNT(*) FROM invoices WHERE company_id = $1)::int AS invoices,
           0::float AS invoiced_paid,
           (SELECT COUNT(*) FROM offers WHERE company_id = $1)::int AS offers,
           (SELECT COUNT(*) FROM recurring_jobs WHERE company_id = $1 AND is_active)::int AS subscriptions,
           0::int AS services`,
        [companyId]
      )),
      pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.email, uc.role, u.created_at, u.last_login_at, u.last_active_at,
                COUNT(e.id) FILTER (WHERE ${IS_ACTION} AND e.occurred_at >= NOW() - INTERVAL '30 days')::int AS a30,
                COUNT(e.id) FILTER (WHERE e.event = 'session.started' AND e.occurred_at >= NOW() - INTERVAL '30 days')::int AS s30,
                COUNT(e.id) FILTER (WHERE ${IS_ACTION})::int AS a_all,
                MAX(e.occurred_at) AS last_event
           FROM user_companies uc
           JOIN users u ON u.id = uc.user_id
           LEFT JOIN activity_events e ON e.user_id = u.id AND e.company_id = uc.company_id AND ${IS_REAL}
          WHERE uc.company_id = $1
          GROUP BY u.id, uc.role
          ORDER BY (uc.role = 'owner') DESC, MAX(e.occurred_at) DESC NULLS LAST`,
        [companyId]
      ),
      pool.query(
        `SELECT e.event,
                COUNT(*) FILTER (WHERE e.occurred_at >= NOW() - INTERVAL '30 days')::int AS last30,
                COUNT(*)::int AS total,
                MAX(e.occurred_at) AS last_at
           FROM activity_events e
          WHERE e.company_id = $1 AND ${IS_REAL} AND ${IS_ACTION}
          GROUP BY e.event
          ORDER BY total DESC
          LIMIT 40`,
        [companyId]
      ),
      dailyActivity({ column: 'company_id', id: companyId, days: 90 }),
      pool.query(
        `SELECT email, role, status, created_at, expires_at
           FROM company_invitations WHERE company_id = $1 AND status = 'pending'
          ORDER BY created_at DESC`,
        [companyId]
      ).catch(() => ({ rows: [] })),
    ]);

    const timeline = await fetchEvents({
      conditions: [
        `e.company_id = $1`,
        ...(req.query.userId ? [`e.user_id = $2`] : []),
      ],
      params: req.query.userId ? [companyId, clampInt(req.query.userId, 0, 0, 2147483647)] : [companyId],
      limit: clampInt(req.query.limit, 200, 20, 1000),
      before: req.query.before || null,
      includePageViews: req.query.pageViews === '1',
    });

    const t = totalsRes.rows[0];
    res.json({
      company: {
        id: c.id,
        name: c.name,
        slug: c.slug,
        industry: c.industry || null,
        country: c.country || c.country_code || null,
        city: c.city || null,
        website: c.website || null,
        createdAt: c.created_at,
        plan: c.plan_name,
        billingInterval: c.billing_interval || null,
        hasStripeSubscription: !!c.stripe_subscription_id,
        expiresAt: c.expires_at,
        suspendedAt: c.suspended_at,
        onboardingCompleted: !!c.onboarding_completed,
        onboardingStep: c.onboarding_step,
        usageGoals: Array.isArray(c.usage_goals) ? c.usage_goals : [],
        owner: c.owner_id ? { id: c.owner_id, name: fullName(c.owner_first, c.owner_last) || c.owner_email, email: c.owner_email } : null,
      },
      totals: {
        clients: t.clients, jobs: t.jobs, jobsManual: t.jobs_manual, jobsCompleted: t.jobs_completed,
        invoices: t.invoices, invoicedPaid: t.invoiced_paid, offers: t.offers,
        subscriptions: t.subscriptions, services: t.services,
      },
      growth: { bucket, points: growthRes.rows.map((g) => ({
        bucket: g.bucket,
        clientsNew: g.clients_new,
        clientsTotal: g.clients_total,
        jobsCreated: g.jobs_created,
        jobsScheduled: g.jobs_scheduled,
        jobsCompleted: g.jobs_completed,
        invoices: g.invoices,
        offers: g.offers,
      })) },
      members: membersRes.rows.map((m) => ({
        id: m.id,
        name: fullName(m.first_name, m.last_name) || m.email,
        email: m.email,
        role: m.role,
        joinedAt: m.created_at,
        lastActiveAt: m.last_event || m.last_active_at || m.last_login_at,
        actions30d: m.a30,
        sessions30d: m.s30,
        actionsTotal: m.a_all,
      })),
      pendingInvites: pendingInvites.rows,
      features: featuresRes.rows.map((f) => ({ event: f.event, last30: f.last30, total: f.total, lastAt: f.last_at })),
      daily,
      ...timeline,
    });
  } catch (err) {
    console.error('[admin-insights] company detail error:', err);
    res.status(500).json({ error: 'Failed to load company' });
  }
});

// ── Raw event stream ────────────────────────────────────────────────────────

router.get('/events', async (req, res) => {
  try {
    const conditions = [];
    const params = [];
    if (req.query.companyId) {
      params.push(clampInt(req.query.companyId, 0, 0, 2147483647));
      conditions.push(`e.company_id = $${params.length}`);
    }
    if (req.query.userId) {
      params.push(clampInt(req.query.userId, 0, 0, 2147483647));
      conditions.push(`e.user_id = $${params.length}`);
    }
    if (req.query.event) {
      const ev = String(req.query.event);
      if (ev.endsWith('.*')) {
        params.push(`${ev.slice(0, -2)}.%`);
        conditions.push(`e.event LIKE $${params.length}`);
      } else {
        params.push(ev);
        conditions.push(`e.event = $${params.length}`);
      }
    }
    if (req.query.source) {
      params.push(String(req.query.source));
      conditions.push(`e.source = $${params.length}`);
    } else {
      conditions.push(`e.source <> 'backfill'`);
    }
    if (req.query.actionsOnly === '1') conditions.push(IS_ACTION);
    const result = await fetchEvents({
      conditions,
      params,
      limit: clampInt(req.query.limit, 100, 10, 500),
      before: req.query.before || null,
      includePageViews: req.query.pageViews === '1',
    });
    res.json(result);
  } catch (err) {
    console.error('[admin-insights] events error:', err);
    res.status(500).json({ error: 'Failed to load events' });
  }
});

router.get('/event-names', async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT event, COUNT(*)::int AS count, MAX(occurred_at) AS last_at
         FROM activity_events e
        WHERE e.event NOT LIKE 'system.%'
        GROUP BY event ORDER BY count DESC`
    );
    res.json({ events: r.rows.map((x) => ({ event: x.event, count: x.count, lastAt: x.last_at })) });
  } catch (err) {
    console.error('[admin-insights] event names error:', err);
    res.status(500).json({ error: 'Failed to load event names' });
  }
});

module.exports = router;
