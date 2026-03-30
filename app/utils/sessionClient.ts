/**
 * Client-only session helpers (localStorage). Used for auth redirects and setup wizard gating.
 */

const SETUP_WIZARD_COMPLETE_KEY = 'vevago_setup_wizard_complete'

export function getStoredUser(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function isClientLoggedIn(): boolean {
  if (typeof window === 'undefined') return false
  return !!(localStorage.getItem('token') && localStorage.getItem('user'))
}

/** Same idea as useUser: user is associated with at least one company. */
export function hasCompanyContext(user: Record<string, unknown> | null): boolean {
  if (!user) return false
  const companies = user.companies
  const hasCompanies = Array.isArray(companies) && companies.length > 0
  const hasActiveCompany = user.activeCompany != null && user.activeCompany !== undefined
  const hasCompanyId = user.companyId != null && user.companyId !== undefined
  return hasCompanies || hasActiveCompany || hasCompanyId
}

function activeCompanyRole(user: Record<string, unknown>): string | undefined {
  const ac = user.activeCompany as { role?: string } | undefined
  if (ac?.role) return String(ac.role)
  if (typeof user.role === 'string') return user.role
  return undefined
}

/** Persisted when the user finishes the wizard or reaches the company dashboard. */
export function markSetupWizardComplete(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SETUP_WIZARD_COMPLETE_KEY, 'true')
  } catch {
    /* ignore quota / private mode */
  }
}

export function isSetupWizardMarkedComplete(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(SETUP_WIZARD_COMPLETE_KEY) === 'true'
}

/**
 * If true, visiting /setup/* should send the user to the app dashboard instead.
 * - Owners doing the first-time wizard (step 1–3) are NOT redirected until the flag is set or they're non-owner.
 * - Non-owners (invited team) skip the owner onboarding wizard.
 */
export function shouldRedirectAwayFromSetupWizard(user: Record<string, unknown> | null): boolean {
  if (!user) return false
  if (isSetupWizardMarkedComplete()) return true
  if (!hasCompanyContext(user)) return false
  const r = activeCompanyRole(user)
  if (r && r !== 'owner') return true
  return false
}

/** Primary dashboard URL for the stored session (company slug in path). */
export function getDashboardHref(user: Record<string, unknown>): string {
  const active = user.activeCompany as { slug?: string } | undefined
  if (active?.slug) return `/${active.slug}/dashboard`
  const list = user.companies as Array<{ slug?: string }> | undefined
  if (Array.isArray(list)) {
    for (const c of list) {
      if (c?.slug) return `/${c.slug}/dashboard`
    }
  }
  return '/select-company'
}

export function getUserDisplayName(user: Record<string, unknown>): string {
  const first = typeof user.firstName === 'string' ? user.firstName : ''
  const last = typeof user.lastName === 'string' ? user.lastName : ''
  const full = `${first} ${last}`.trim()
  if (full) return full
  if (typeof user.email === 'string') return user.email
  return 'User'
}
