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

export function hasPendingInvites(user: Record<string, unknown> | null): boolean {
  if (!user) return false
  const pending = user.pendingInvites
  return Array.isArray(pending) && pending.length > 0
}

/** Logged-in user has a company to work in and/or open invitations to respond to. */
export function hasAppWorkspace(user: Record<string, unknown> | null): boolean {
  return hasCompanyContext(user) || hasPendingInvites(user)
}

function activeCompanyRole(user: Record<string, unknown>): string | undefined {
  const ac = user.activeCompany as { role?: string } | undefined
  if (ac?.role) return String(ac.role)
  if (typeof user.role === 'string') return user.role
  return undefined
}

/**
 * Whether the active company has finished the setup wizard (server-tracked).
 * Reads activeCompany first, then falls back to the matching entry in companies[].
 * Defaults to `true` when unknown so we never trap existing users in the wizard.
 */
export function isActiveCompanyOnboarded(user: Record<string, unknown> | null): boolean {
  if (!user) return true
  const ac = user.activeCompany as { id?: number; onboardingCompleted?: boolean } | undefined
  if (ac && typeof ac.onboardingCompleted === 'boolean') return ac.onboardingCompleted

  const companyId = ac?.id ?? user.companyId
  const list = user.companies as Array<{ id?: number; onboardingCompleted?: boolean }> | undefined
  if (Array.isArray(list)) {
    const match = list.find((c) => c?.id === companyId) ?? list[0]
    if (match && typeof match.onboardingCompleted === 'boolean') return match.onboardingCompleted
  }
  return true
}

/** Flip the cached session's onboardingCompleted flag to true after the wizard
 *  finishes, so navigation gates update instantly without a profile refetch. */
export function markActiveCompanyOnboardedInSession(): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return
    const user = JSON.parse(raw) as Record<string, unknown>
    const ac = user.activeCompany as { id?: number; onboardingCompleted?: boolean } | null | undefined
    const companyId = ac?.id ?? user.companyId
    if (ac) ac.onboardingCompleted = true
    const list = user.companies as Array<{ id?: number; onboardingCompleted?: boolean }> | undefined
    if (Array.isArray(list)) {
      for (const c of list) {
        if (c && (c.id === companyId || ac == null)) c.onboardingCompleted = true
      }
    }
    localStorage.setItem('user', JSON.stringify(user))
  } catch { /* ignore */ }
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

/** Clear the wizard-complete flag — called after a fresh registration so the new
 *  account always starts at step 1 even if a previous session had completed it. */
export function resetSetupWizard(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(SETUP_WIZARD_COMPLETE_KEY)
  } catch { /* ignore */ }
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
  if (hasPendingInvites(user)) return true
  if (!hasCompanyContext(user)) return false
  // Non-owners (invited team members) never see the owner onboarding wizard.
  const r = activeCompanyRole(user)
  if (r && r !== 'owner') return true
  // Owners are kept in the wizard until their company is marked onboarded server-side.
  return isActiveCompanyOnboarded(user)
}

/**
 * If the user belongs to exactly one company, ensure activeCompany and top-level
 * company fields match it so routing and layouts never send them to the picker.
 */
export function applySingleCompanyAutoSelect<T extends Record<string, unknown>>(user: T): T {
  const pending = user.pendingInvites as unknown[] | undefined
  if (Array.isArray(pending) && pending.length > 0) return user

  const list = user.companies as Array<{
    id?: number
    name?: string
    slug?: string
    role?: string
    countryCode?: string
    isOwner?: boolean
    suspendedAt?: string | null
  }> | undefined
  if (!Array.isArray(list) || list.length !== 1) return user
  const only = list[0]
  if (!only?.slug) return user

  const role =
    typeof user.role === 'string' && user.role
      ? user.role
      : typeof only.role === 'string'
        ? only.role
        : 'employee'

  return {
    ...user,
    activeCompany: only,
    companyId: only.id ?? user.companyId,
    companyName: only.name ?? user.companyName,
    role,
  } as T
}

/** Primary dashboard URL for the stored session (company slug in path). */
export function getDashboardHref(user: Record<string, unknown>): string {
  const pending = user.pendingInvites as unknown[] | undefined
  if (Array.isArray(pending) && pending.length > 0) {
    return '/select-company'
  }

  const list = user.companies as Array<{ slug?: string }> | undefined
  if (Array.isArray(list) && list.length > 1) {
    return '/select-company'
  }
  // Single-company accounts: never send them to the picker if we have a slug.
  if (Array.isArray(list) && list.length === 1 && list[0]?.slug) {
    return `/${list[0].slug}/dashboard`
  }
  const active = user.activeCompany as { slug?: string } | undefined
  if (active?.slug) return `/${active.slug}/dashboard`
  if (Array.isArray(list)) {
    for (const c of list) {
      if (c?.slug) return `/${c.slug}/dashboard`
    }
  }
  return '/select-company'
}

/** Company slug derived the same way as dashboard routing (single-company aware). */
export function getActiveCompanySlugFromSession(user: Record<string, unknown>): string | null {
  const href = getDashboardHref(user)
  if (href === '/select-company') return null
  const parts = href.split('/').filter(Boolean)
  return parts[0] || null
}

export function getUserDisplayName(user: Record<string, unknown>): string {
  const first = typeof user.firstName === 'string' ? user.firstName : ''
  const last = typeof user.lastName === 'string' ? user.lastName : ''
  const full = `${first} ${last}`.trim()
  if (full) return full
  if (typeof user.email === 'string') return user.email
  return 'User'
}
