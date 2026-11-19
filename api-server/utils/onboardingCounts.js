/**
 * Live "has the company done this yet" counters. Shared by the legacy
 * getting-started endpoints and the admin-managed guides, so a step auto-ticks
 * the same way in both.
 */

const ROADMAP_COUNT_QUERIES = {
  clients: `SELECT COUNT(*)::int AS n FROM clients WHERE company_id = $1`,
  // System rows (e.g. the hidden cancellation-fee item) are not real services.
  services: `SELECT COUNT(*)::int AS n FROM services
             WHERE company_id = $1 AND COALESCE(is_system, FALSE) = FALSE AND archived_at IS NULL`,
  jobs: `SELECT COUNT(*)::int AS n FROM jobs
         WHERE company_id = $1 AND COALESCE(status, '') <> 'cancelled'
           AND COALESCE(job_kind, 'standard') = 'standard'`,
  // Fullest single calendar day (non-cancelled standard jobs) — for "4 jobs on one day".
  jobs_same_day: `SELECT COALESCE(MAX(cnt), 0)::int AS n FROM (
                    SELECT COUNT(*)::int AS cnt
                    FROM jobs
                    WHERE company_id = $1
                      AND scheduled_date IS NOT NULL
                      AND COALESCE(status, '') <> 'cancelled'
                      AND COALESCE(job_kind, 'standard') = 'standard'
                    GROUP BY scheduled_date
                  ) t`,
  completed_jobs: `SELECT COUNT(*)::int AS n FROM jobs WHERE company_id = $1 AND status = 'completed'`,
  invoices: `SELECT COUNT(*)::int AS n FROM invoices WHERE company_id = $1`,
  subscriptions: `SELECT COUNT(*)::int AS n FROM recurring_jobs WHERE company_id = $1`,
  // Only count intentionally planned packages (not empty drafts).
  routes: `SELECT COUNT(*)::int AS n FROM daily_routes
           WHERE company_id = $1 AND status = 'planned'
             AND job_ids IS NOT NULL AND cardinality(job_ids) > 0`,
  rounds: `SELECT COUNT(*)::int AS n FROM rounds WHERE company_id = $1`,
  custom_groups: `SELECT COUNT(*)::int AS n FROM item_groups
                  WHERE company_id = $1 AND COALESCE(is_system, FALSE) = FALSE`,
  cancellation_fee: `SELECT COUNT(*)::int AS n FROM companies
                     WHERE id = $1 AND cancellation_fee_enabled = TRUE`,
  invoices_sent: `SELECT COUNT(*)::int AS n FROM invoices
                  WHERE company_id = $1
                    AND (sent_at IS NOT NULL OR status IN ('sent', 'paid', 'overdue'))`,
  // Sales pipeline: lead form → leads → offers → confirmed bookings.
  lead_form_enabled: `SELECT CASE WHEN COALESCE(leads_enabled, FALSE) THEN 1 ELSE 0 END::int AS n
                      FROM companies WHERE id = $1`,
  leads: `SELECT COUNT(*)::int AS n FROM leads WHERE company_id = $1`,
  leads_handled: `SELECT COUNT(*)::int AS n FROM leads
                  WHERE company_id = $1 AND COALESCE(status, 'new') <> 'new'`,
  offers_sent: `SELECT COUNT(*)::int AS n FROM offers
                WHERE company_id = $1
                  AND (sent_at IS NOT NULL OR status IN ('sent', 'accepted', 'declined'))`,
  offers_accepted: `SELECT COUNT(*)::int AS n FROM offers
                    WHERE company_id = $1 AND status = 'accepted'`,
  bookings_confirmed: `SELECT COUNT(*)::int AS n FROM offers
                       WHERE company_id = $1 AND status = 'accepted' AND confirmed_at IS NOT NULL`,
  // Team features: 1 when the company has Pro access (paid, trialing or comped).
  // Mirrors hasProPlanAccessFromCompany in utils/companyPlanAccess.js.
  pro_access: `SELECT CASE
                 WHEN plan = 'pro'
                  AND (stripe_subscription_id IS NOT NULL
                       OR expires_at IS NULL
                       OR expires_at > NOW())
                 THEN 1 ELSE 0 END::int AS n
               FROM companies WHERE id = $1`,
  // Employees who joined plus invitations still waiting to be accepted.
  team_members: `SELECT (
                   (SELECT COUNT(*) FROM user_companies WHERE company_id = $1 AND role <> 'owner')
                   + (SELECT COUNT(*) FROM company_invitations
                      WHERE company_id = $1 AND status = 'pending' AND expires_at > NOW())
                 )::int AS n`,
  // Jobs handed to someone other than the owner.
  team_assigned_jobs: `SELECT COUNT(*)::int AS n FROM jobs j
                       JOIN companies c ON c.id = j.company_id
                       WHERE j.company_id = $1
                         AND j.assigned_user_id IS NOT NULL
                         AND j.assigned_user_id <> c.owner_id
                         AND COALESCE(j.status, '') <> 'cancelled'
                         AND COALESCE(j.job_kind, 'standard') = 'standard'`,
};

/** Pages whose first visit can complete a step. */
const VISIT_KEYS = [
  'clients',
  'services',
  'jobs',
  'map',
  'invoices',
  'pipeline',
  'offers',
  'team',
  'invoice_settings',
  'notifications_settings',
];

/** Treats a missing table or column (fresh install) as zero rather than a 500. */
async function countOrZero(pool, sql, companyId) {
  try {
    const r = await pool.query(sql, [companyId]);
    return Number(r.rows[0]?.n) || 0;
  } catch (e) {
    if (e?.code !== '42P01' && e?.code !== '42703') {
      console.warn('[onboardingCounts] count failed:', e?.message || e);
    }
    return 0;
  }
}

/** Every counter for one company, as `{ clients: 3, jobs: 12, … }`. */
async function loadOnboardingCounts(pool, companyId) {
  const entries = await Promise.all(
    Object.entries(ROADMAP_COUNT_QUERIES).map(async ([key, sql]) => [
      key,
      await countOrZero(pool, sql, companyId),
    ])
  );
  return Object.fromEntries(entries);
}

function parseVisits(value) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {};
  for (const key of VISIT_KEYS) {
    if (src[key] === true) out[key] = true;
  }
  return out;
}

module.exports = {
  ROADMAP_COUNT_QUERIES,
  VISIT_KEYS,
  countOrZero,
  loadOnboardingCounts,
  parseVisits,
};
