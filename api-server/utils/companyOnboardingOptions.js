/**
 * Canonical ids for the company onboarding questions (industry + usage goals).
 * Labels and grouping live in app/config/companyOnboarding.ts — the ids here are
 * the contract, so keep both files in sync when adding an option.
 */

const COMPANY_INDUSTRIES = [
  'cleaning',
  'construction',
  'electrical',
  'handyman',
  'hvac',
  'landscaping',
  'moving_delivery',
  'pest_control',
  'plumbing',
  'pressure_washing',
  'security_it',
  'window_cleaning',
  'field_service',
  'other',
];

const COMPANY_USAGE_GOALS = [
  'quotes',
  'scheduling',
  'invoicing',
  'routes',
  'recurring',
  'team',
  'payments',
  'client_history',
];

const INDUSTRY_SET = new Set(COMPANY_INDUSTRIES);
const GOAL_SET = new Set(COMPANY_USAGE_GOALS);

/** Returns the industry id, or null when missing/unrecognised. */
function normalizeIndustry(value) {
  if (value == null) return null;
  const id = String(value).trim().toLowerCase();
  return INDUSTRY_SET.has(id) ? id : null;
}

/** Returns a de-duplicated list of known goal ids, or null when not an array. */
function normalizeUsageGoals(value) {
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  for (const raw of value) {
    const id = String(raw ?? '').trim().toLowerCase();
    if (GOAL_SET.has(id)) seen.add(id);
  }
  return [...seen];
}

module.exports = {
  COMPANY_INDUSTRIES,
  COMPANY_USAGE_GOALS,
  normalizeIndustry,
  normalizeUsageGoals,
};
