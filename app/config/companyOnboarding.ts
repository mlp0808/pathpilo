/**
 * Options for the two company onboarding questions.
 *
 * The ids are the storage contract (companies.industry / companies.usage_goals)
 * and are mirrored in api-server/utils/companyOnboardingOptions.js — add an
 * option in both places or the API will reject it.
 */

/**
 * Deliberately broad: one pick should be obvious at a glance, so these are
 * whole trades rather than niches. "Field service" and "Other" close the list
 * as catch-alls for anything the specific entries miss.
 */
export const INDUSTRIES: Array<{ id: string; label: string }> = [
  { id: 'cleaning', label: 'Cleaning' },
  { id: 'construction', label: 'Construction & renovation' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'handyman', label: 'Handyman & repairs' },
  { id: 'hvac', label: 'HVAC' },
  { id: 'landscaping', label: 'Landscaping & lawn care' },
  { id: 'moving_delivery', label: 'Moving & delivery' },
  { id: 'pest_control', label: 'Pest control' },
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'pressure_washing', label: 'Pressure washing' },
  { id: 'security_it', label: 'Security & IT' },
  { id: 'window_cleaning', label: 'Window cleaning' },
  { id: 'field_service', label: 'Field service' },
  { id: 'other', label: 'Other' },
]

const INDUSTRY_LABELS: Record<string, string> = {}
for (const industry of INDUSTRIES) INDUSTRY_LABELS[industry.id] = industry.label

/** Display label for a stored industry id; falls back to the raw id. */
export function industryLabel(id: string | null | undefined): string {
  if (!id) return ''
  return INDUSTRY_LABELS[id] || id
}

/** Kept to one or two words so the picker reads as inline chips, not a list. */
export const USAGE_GOALS: Array<{ id: string; label: string }> = [
  { id: 'quotes', label: 'Quotes' },
  { id: 'scheduling', label: 'Scheduling' },
  { id: 'invoicing', label: 'Invoicing' },
  { id: 'routes', label: 'Route planning' },
  { id: 'recurring', label: 'Recurring work' },
  { id: 'team', label: 'Team management' },
  { id: 'payments', label: 'Faster payments' },
  { id: 'client_history', label: 'Client history' },
]

const GOAL_LABELS: Record<string, string> = {}
for (const goal of USAGE_GOALS) GOAL_LABELS[goal.id] = goal.label

/** Display label for a stored usage-goal id; falls back to the raw id. */
export function usageGoalLabel(id: string): string {
  return GOAL_LABELS[id] || id
}
