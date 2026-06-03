// SMS add-on billing: schema, usage metering, and per-company snapshots.
//
// Sending SMS is not wired up yet (no Twilio). This module provides the data
// model and helpers so that:
//   - admins can assign / change / cancel a company's SMS plan,
//   - usage is metered against the plan's monthly allowance,
//   - the future send path can call recordSmsUsage() to meter real traffic,
//   - admins can manually adjust usage for support / corrections.

const { getSmsTier, SMS_CURRENCY } = require('../config/smsPlans');

let schemaReady = null;

async function initSmsSchema(pool) {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_sms_plans (
        company_id           INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        tier_key             VARCHAR(30) NOT NULL,
        included_per_month   INTEGER NOT NULL,
        price_per_month      NUMERIC(10,2) NOT NULL,
        overage_rate         NUMERIC(10,4) NOT NULL DEFAULT 0,
        currency             VARCHAR(3) NOT NULL DEFAULT 'GBP',
        status               VARCHAR(20) NOT NULL DEFAULT 'active',
        started_at           TIMESTAMP DEFAULT NOW(),
        current_period_start TIMESTAMP DEFAULT NOW(),
        current_period_end   TIMESTAMP,
        updated_at           TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sms_usage_events (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        segments    INTEGER NOT NULL DEFAULT 1,
        cost        NUMERIC(10,4) NOT NULL DEFAULT 0,
        source      VARCHAR(30) NOT NULL DEFAULT 'system',
        note        TEXT,
        created_at  TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_usage_company_created
        ON sms_usage_events (company_id, created_at)
    `);
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

/** Add one calendar month to a date (clamping day-of-month). */
function addMonth(date) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + 1);
  if (d.getDate() < day) d.setDate(0); // clamp e.g. Jan 31 -> Feb 28/29
  return d;
}

/**
 * Roll the billing period forward if it has elapsed so "used this period" always
 * reflects the current month. Returns the (possibly updated) plan row.
 */
async function ensureCurrentPeriod(pool, plan) {
  if (!plan || plan.status !== 'active') return plan;
  let periodStart = plan.current_period_start ? new Date(plan.current_period_start) : new Date();
  let periodEnd = plan.current_period_end ? new Date(plan.current_period_end) : addMonth(periodStart);
  let changed = false;
  const now = Date.now();
  let guard = 0;
  while (periodEnd.getTime() <= now && guard < 120) {
    periodStart = periodEnd;
    periodEnd = addMonth(periodStart);
    changed = true;
    guard += 1;
  }
  if (changed) {
    await pool.query(
      `UPDATE company_sms_plans
       SET current_period_start = $2, current_period_end = $3, updated_at = NOW()
       WHERE company_id = $1`,
      [plan.company_id, periodStart.toISOString(), periodEnd.toISOString()]
    );
    plan.current_period_start = periodStart.toISOString();
    plan.current_period_end = periodEnd.toISOString();
  }
  return plan;
}

async function getSmsPlanRow(pool, companyId) {
  const res = await pool.query(
    `SELECT * FROM company_sms_plans WHERE company_id = $1`,
    [companyId]
  );
  return res.rows[0] || null;
}

/**
 * Assign or change a company's SMS plan tier. Passing tierKey = null cancels it.
 * `resetPeriod` restarts the monthly billing window from now.
 */
async function setSmsPlan(pool, companyId, tierKey, { resetPeriod = false } = {}) {
  await initSmsSchema(pool);

  if (!tierKey) {
    await pool.query(
      `UPDATE company_sms_plans SET status = 'cancelled', updated_at = NOW() WHERE company_id = $1`,
      [companyId]
    );
    return getSmsPlanRow(pool, companyId);
  }

  const tier = getSmsTier(tierKey);
  if (!tier) {
    const err = new Error(`Unknown SMS tier: ${tierKey}`);
    err.statusCode = 400;
    throw err;
  }

  const existing = await getSmsPlanRow(pool, companyId);
  const now = new Date();
  const periodStart = !existing || resetPeriod || existing.status !== 'active'
    ? now
    : new Date(existing.current_period_start || now);
  const periodEnd = addMonth(periodStart);

  await pool.query(
    `INSERT INTO company_sms_plans
       (company_id, tier_key, included_per_month, price_per_month, overage_rate, currency,
        status, started_at, current_period_start, current_period_end, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), $7, $8, NOW())
     ON CONFLICT (company_id) DO UPDATE SET
       tier_key = EXCLUDED.tier_key,
       included_per_month = EXCLUDED.included_per_month,
       price_per_month = EXCLUDED.price_per_month,
       overage_rate = EXCLUDED.overage_rate,
       currency = EXCLUDED.currency,
       status = 'active',
       current_period_start = $7,
       current_period_end = $8,
       updated_at = NOW()`,
    [
      companyId,
      tier.key,
      tier.included,
      tier.price,
      tier.overageRate,
      tier.currency || SMS_CURRENCY,
      periodStart.toISOString(),
      periodEnd.toISOString(),
    ]
  );
  return getSmsPlanRow(pool, companyId);
}

/**
 * Record SMS usage. The future Twilio send path should call this with the
 * number of segments actually sent. Admins use it (via the route) with
 * source = 'manual-adjust' to correct counts (segments can be negative).
 */
async function recordSmsUsage(pool, companyId, segments, { source = 'system', note = null } = {}) {
  await initSmsSchema(pool);
  const seg = Math.trunc(Number(segments) || 0);
  if (seg === 0) return;
  const plan = await getSmsPlanRow(pool, companyId);
  const rate = plan ? Number(plan.overage_rate) || 0 : 0;
  const cost = Math.round(seg * rate * 10000) / 10000;
  await pool.query(
    `INSERT INTO sms_usage_events (company_id, segments, cost, source, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [companyId, seg, cost, source, note]
  );
}

/** Full SMS billing snapshot for the admin panel. */
async function getSmsBillingSnapshot(pool, companyId) {
  await initSmsSchema(pool);
  let plan = await getSmsPlanRow(pool, companyId);
  if (plan) plan = await ensureCurrentPeriod(pool, plan);

  const isActive = !!plan && plan.status === 'active';
  const periodStart = plan?.current_period_start || null;

  // Usage in the current billing period (active plans), and all-time totals.
  let usedThisPeriod = 0;
  if (isActive && periodStart) {
    const usageRes = await pool.query(
      `SELECT COALESCE(SUM(segments), 0)::int AS used
       FROM sms_usage_events
       WHERE company_id = $1 AND created_at >= $2`,
      [companyId, periodStart]
    );
    usedThisPeriod = usageRes.rows[0]?.used || 0;
  }

  const totalsRes = await pool.query(
    `SELECT COALESCE(SUM(segments), 0)::int AS total_segments,
            COALESCE(SUM(cost), 0)::numeric AS total_cost
     FROM sms_usage_events WHERE company_id = $1`,
    [companyId]
  );

  const recentRes = await pool.query(
    `SELECT id, segments, cost, source, note, created_at
     FROM sms_usage_events WHERE company_id = $1
     ORDER BY created_at DESC LIMIT 20`,
    [companyId]
  );

  const included = plan ? Number(plan.included_per_month) : 0;
  const remaining = isActive ? Math.max(0, included - usedThisPeriod) : 0;
  const overage = isActive ? Math.max(0, usedThisPeriod - included) : 0;

  return {
    plan: plan
      ? {
          tierKey: plan.tier_key,
          status: plan.status,
          includedPerMonth: included,
          pricePerMonth: Number(plan.price_per_month),
          overageRate: Number(plan.overage_rate),
          currency: plan.currency,
          startedAt: plan.started_at,
          currentPeriodStart: plan.current_period_start,
          currentPeriodEnd: plan.current_period_end,
        }
      : null,
    usage: {
      usedThisPeriod,
      includedPerMonth: included,
      remaining,
      overage,
      overageCost: Math.round(overage * (plan ? Number(plan.overage_rate) : 0) * 100) / 100,
      currency: plan?.currency || SMS_CURRENCY,
      allTimeSegments: totalsRes.rows[0]?.total_segments || 0,
      allTimeCost: Number(totalsRes.rows[0]?.total_cost || 0),
    },
    recentEvents: recentRes.rows.map((e) => ({
      id: e.id,
      segments: e.segments,
      cost: Number(e.cost),
      source: e.source,
      note: e.note,
      createdAt: e.created_at,
    })),
  };
}

module.exports = {
  initSmsSchema,
  setSmsPlan,
  recordSmsUsage,
  getSmsBillingSnapshot,
  getSmsPlanRow,
};
