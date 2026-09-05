const { pool } = require('./database');

/**
 * Pre-account + post-account funnel stages shown in superadmin.
 * `wizard_services` / `wizard_clients` are retired but kept so historical
 * signup_progress_drafts rows still validate.
 */
const SIGNUP_FUNNEL_STEPS = new Set([
  'name_entered',
  'email_entered',
  'details_ready',
  'code_sent',
  'email_verified',
  'account_created',
  'wizard_company',
  'wizard_goals',
  'wizard_services',
  'wizard_clients',
  'wizard_completed',
  'plan_solo',
  'plan_company',
]);

/**
 * Owner onboarding is two short questions — company details, then what they
 * want to use PathPilo for. Everything after that is optional and lives in the
 * dashboard getting-started checklist instead of a forced wizard.
 */
const ONBOARDING_WIZARD_STEPS = ['company', 'goals', 'done'];

/** Steps from the removed forced wizard, remapped on read/migration. */
const LEGACY_WIZARD_STEPS = ['services', 'clients', 'jobs', 'route', 'business', 'plan'];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function wizardStepIndex(step) {
  const i = ONBOARDING_WIZARD_STEPS.indexOf(step);
  return i < 0 ? 0 : i;
}

async function ensureSignupFunnelSchema() {
  await pool.query(`
    ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS onboarding_step VARCHAR(32) NOT NULL DEFAULT 'company'
  `);
  await pool.query(`
    ALTER TABLE signup_progress_drafts
      ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
  `);
  await pool.query(`
    ALTER TABLE signup_progress_drafts
      ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL
  `);
  await pool.query(`
    UPDATE companies SET onboarding_step = 'done'
    WHERE COALESCE(onboarding_completed, true) = true
      AND onboarding_step IS DISTINCT FROM 'done'
  `);
  // The forced wizard (services → clients → jobs → route → business → plan) is
  // gone. Anyone still mid-flight restarts at the company question; their
  // clients/jobs/routes are untouched and the rest is now optional.
  await pool.query(
    `UPDATE companies SET onboarding_step = 'company'
     WHERE COALESCE(onboarding_completed, false) = false
       AND (onboarding_step IS NULL OR onboarding_step = 'done' OR onboarding_step = ANY($1))`,
    [LEGACY_WIZARD_STEPS]
  );
}

/**
 * Anonymous / pre-account funnel row (superadmin "Started" list).
 */
async function upsertSignupDraft({
  sessionId,
  email,
  firstName,
  lastName,
  step,
  userId = null,
  companyId = null,
}) {
  const sid = String(sessionId || '').trim();
  if (!sid || sid.length > 128) return;
  const stepRaw = String(step || 'email_entered').trim();
  if (!SIGNUP_FUNNEL_STEPS.has(stepRaw)) return;

  const fn = firstName != null ? String(firstName).trim().slice(0, 255) : '';
  const ln = lastName != null ? String(lastName).trim().slice(0, 255) : '';
  let em = email != null ? normalizeEmail(email) : '';
  if (em && !em.includes('@')) return;
  if (!em) em = null;

  await pool.query(
    `INSERT INTO signup_progress_drafts (client_session_id, first_name, last_name, email, step, user_id, company_id, updated_at)
     VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), $4, $5, $6, $7, NOW())
     ON CONFLICT (client_session_id)
     DO UPDATE SET
       first_name = COALESCE(NULLIF(EXCLUDED.first_name, ''), signup_progress_drafts.first_name),
       last_name = COALESCE(NULLIF(EXCLUDED.last_name, ''), signup_progress_drafts.last_name),
       email = COALESCE(EXCLUDED.email, signup_progress_drafts.email),
       step = EXCLUDED.step,
       user_id = COALESCE(EXCLUDED.user_id, signup_progress_drafts.user_id),
       company_id = COALESCE(EXCLUDED.company_id, signup_progress_drafts.company_id),
       updated_at = NOW()`,
    [sid, fn, ln, em, stepRaw, userId, companyId]
  );
}

async function upsertSignupDraftByEmail({
  email,
  step,
  firstName,
  lastName,
  userId = null,
  companyId = null,
  sessionId = null,
}) {
  const em = normalizeEmail(email);
  if (!em || !SIGNUP_FUNNEL_STEPS.has(step)) return;

  const existing = await pool.query(
    `SELECT client_session_id FROM signup_progress_drafts
     WHERE LOWER(TRIM(email)) = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [em]
  );

  const sid =
    sessionId ||
    existing.rows[0]?.client_session_id ||
    `email-${em.slice(0, 48)}`;

  await upsertSignupDraft({
    sessionId: sid,
    email: em,
    firstName,
    lastName,
    step,
    userId,
    companyId,
  });
}

async function advanceCompanyOnboardingStep(companyId, targetStep) {
  if (!companyId || !ONBOARDING_WIZARD_STEPS.includes(targetStep)) return null;

  const cur = await pool.query(
    `SELECT onboarding_step, onboarding_completed, owner_id
     FROM companies WHERE id = $1`,
    [companyId]
  );
  if (!cur.rows.length) return null;
  if (cur.rows[0].onboarding_completed) return 'done';

  const current = cur.rows[0].onboarding_step || 'company';
  const next =
    wizardStepIndex(targetStep) > wizardStepIndex(current) ? targetStep : current;

  await pool.query(
    `UPDATE companies SET onboarding_step = $1, updated_at = NOW() WHERE id = $2`,
    [next, companyId]
  );

  return next;
}

function funnelStepForCompanyRow(row) {
  if (row.onboarding_completed) {
    return row.plan === 'pro' ? 'plan_company' : 'plan_solo';
  }
  return (row.onboarding_step || 'company') === 'goals' ? 'wizard_goals' : 'wizard_company';
}

/**
 * Maps a combined funnel entry to a numeric funnel step (1–5) for the admin
 * Lead Funnel page.
 *
 * Step definitions:
 *   1 – Enter Email       (email entered, no account yet)
 *   2 – Create Account    (code sent / pending verification)
 *   3 – Company Details   (companies.onboarding_step = 'company')
 *   4 – Usage Goals       (onboarding_step = 'goals')
 *   5 – Complete          (onboarding_completed = true)
 */
function leadFunnelStep(entry) {
  if (entry.onboarding_completed) return 5;
  if (entry.onboarding_step === 'goals') return 4;
  if (entry.onboarding_step === 'company') return 3;
  // Pre-account
  if (entry.draft_step === 'code_sent') return 2;
  if (entry.kind === 'verification') return 2;
  return 1;
}

module.exports = {
  SIGNUP_FUNNEL_STEPS,
  ONBOARDING_WIZARD_STEPS,
  LEGACY_WIZARD_STEPS,
  ensureSignupFunnelSchema,
  upsertSignupDraft,
  upsertSignupDraftByEmail,
  advanceCompanyOnboardingStep,
  funnelStepForCompanyRow,
  leadFunnelStep,
  wizardStepIndex,
};
