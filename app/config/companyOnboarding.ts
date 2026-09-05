/**
 * Options for the two company onboarding questions.
 *
 * The ids are the storage contract (companies.industry / companies.usage_goals)
 * and are mirrored in api-server/utils/companyOnboardingOptions.js — add an
 * option in both places or the API will reject it.
 */

export interface IndustryGroup {
  label: string
  options: Array<{ id: string; label: string }>
}

export const INDUSTRY_GROUPS: IndustryGroup[] = [
  {
    label: 'Cleaning',
    options: [
      { id: 'bin_cleaning', label: 'Bin Cleaning' },
      { id: 'carpet_cleaning', label: 'Carpet Cleaning' },
      { id: 'commercial_cleaning', label: 'Commercial Cleaning' },
      { id: 'pressure_washing', label: 'Pressure Washing Service' },
      { id: 'residential_cleaning', label: 'Residential Cleaning' },
      { id: 'window_washing', label: 'Window Washing' },
    ],
  },
  {
    label: 'Green Industry',
    options: [
      { id: 'tree_care', label: 'Arborist / Tree Care' },
      { id: 'landscaping', label: 'Landscaping Contractor' },
      { id: 'lawn_care', label: 'Lawn Care & Lawn Maintenance' },
    ],
  },
  {
    label: 'Hi Tech',
    options: [
      { id: 'computers_it', label: 'Computers & IT' },
      { id: 'home_theater', label: 'Home Theater' },
      { id: 'security_alarm', label: 'Security and Alarm' },
    ],
  },
  {
    label: 'Trade',
    options: [
      { id: 'construction', label: 'Construction & Contracting' },
      { id: 'electrical', label: 'Electrical Contractor' },
      { id: 'hvac', label: 'HVAC' },
      { id: 'locksmith', label: 'Locksmith' },
      { id: 'mechanical_service', label: 'Mechanical Service' },
      { id: 'plumbing', label: 'Plumbing' },
    ],
  },
  {
    label: 'Other',
    options: [
      { id: 'appliance_repair', label: 'Appliance Repair' },
      { id: 'flooring', label: 'Flooring Service' },
      { id: 'handyman', label: 'Handyman' },
      { id: 'junk_removal', label: 'Junk Removal' },
      { id: 'painting', label: 'Painting' },
      { id: 'pest_control', label: 'Pest Control' },
      { id: 'pool_spa', label: 'Pool and Spa Service' },
      { id: 'renovations', label: 'Renovations' },
      { id: 'roofing', label: 'Roofing Service' },
      { id: 'snow_removal', label: 'Snow Removal' },
      { id: 'other', label: 'Other' },
    ],
  },
]

const INDUSTRY_LABELS: Record<string, string> = {}
for (const group of INDUSTRY_GROUPS) {
  for (const option of group.options) INDUSTRY_LABELS[option.id] = option.label
}

/** Display label for a stored industry id; falls back to the raw id. */
export function industryLabel(id: string | null | undefined): string {
  if (!id) return ''
  return INDUSTRY_LABELS[id] || id
}

export const USAGE_GOALS: Array<{ id: string; label: string }> = [
  { id: 'quotes', label: 'Sending professional quotes' },
  { id: 'scheduling', label: 'Better scheduling of jobs' },
  { id: 'invoicing', label: 'Sending invoices' },
  { id: 'routes', label: 'Planning efficient routes' },
  { id: 'recurring', label: 'Managing recurring work' },
  { id: 'team', label: 'Managing my team in the field' },
  { id: 'payments', label: 'Getting paid faster' },
  { id: 'client_history', label: 'Keeping client history in one place' },
]

const GOAL_LABELS: Record<string, string> = {}
for (const goal of USAGE_GOALS) GOAL_LABELS[goal.id] = goal.label

/** Display label for a stored usage-goal id; falls back to the raw id. */
export function usageGoalLabel(id: string): string {
  return GOAL_LABELS[id] || id
}
