const { pool } = require('./database');

/** Pre-account + post-account funnel stages shown in superadmin. */
const SIGNUP_FUNNEL_STEPS = new Set([
  'name_entered',
  'email_entered',
  'details_ready',
  'code_sent',
  'email_verified',
  'account_created',
  'wizard_company',
  'wizard_services',
  'wizard_clients',
  'wizard_completed',
  'plan_solo',
  'plan_company',
]);

const ONBOARDING_WIZARD_STEPS = ['company', 'services', 'clients', 'plan', 'done'];

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
  await pool.query(`
    UPDATE companies SET onboarding_step = 'company'
    WHERE COALESCE(onboarding_completed, false) = false
      AND (onboarding_step IS NULL OR onboarding_step = 'done')
  `);
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
  const step = row.onboarding_step || 'company';
  if (step === 'plan') return 'wizard_completed';
  if (step === 'services') return 'wizard_services';
  if (step === 'clients') return 'wizard_clients';
  return 'wizard_company';
}

module.exports = {
  SIGNUP_FUNNEL_STEPS,
  ONBOARDING_WIZARD_STEPS,
  ensureSignupFunnelSchema,
  upsertSignupDraft,
  upsertSignupDraftByEmail,
  advanceCompanyOnboardingStep,
  funnelStepForCompanyRow,
  wizardStepIndex,
};
