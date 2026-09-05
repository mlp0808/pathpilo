import { apiUrl } from './api'
import { markActiveCompanyOnboardedInSession } from './sessionClient'

/**
 * Owner onboarding is two questions: company details, then what they want to
 * use PathPilo for. Everything else is optional and lives in the dashboard
 * getting-started checklist, so nothing past 'goals' is ever enforced.
 */
export const SETUP_WIZARD_STEPS = ['company', 'goals'] as const
export type SetupWizardStep = (typeof SETUP_WIZARD_STEPS)[number]
export type OwnerOnboardingStep = SetupWizardStep | 'done'

const ONBOARDING_STEP_ORDER: OwnerOnboardingStep[] = ['company', 'goals', 'done']

/** Steps from the removed forced wizard — treated as "company" if we ever see one. */
const LEGACY_STEPS = new Set(['services', 'clients', 'jobs', 'route', 'business', 'plan'])

export function onboardingStepRank(step: string | undefined): number {
  if (!step) return 0
  if (step === 'done') return ONBOARDING_STEP_ORDER.length
  const i = ONBOARDING_STEP_ORDER.indexOf(normalizeOnboardingStep(step))
  return i < 0 ? 0 : i
}

/** Collapses any stored value (including retired wizard steps) onto the current model. */
export function normalizeOnboardingStep(step: string | undefined | null): OwnerOnboardingStep {
  if (!step) return 'company'
  if (step === 'done') return 'done'
  if (step === 'goals') return 'goals'
  if (LEGACY_STEPS.has(step)) return 'company'
  return 'company'
}

/** Keep the furthest onboarding progress when merging local session with server payload. */
export function mergeOnboardingStep(local?: string, server?: string): string {
  if (local === 'done' || server === 'done') return 'done'
  const l = local || 'company'
  const s = server || 'company'
  return onboardingStepRank(l) >= onboardingStepRank(s) ? l : s
}

export function mergeSessionUserPreservingOnboarding<T extends Record<string, unknown>>(
  local: T,
  incoming: Record<string, unknown>
): T {
  const localAc = local.activeCompany as Record<string, unknown> | undefined
  const incomingAc = incoming.activeCompany as Record<string, unknown> | undefined
  const activeId = (incomingAc?.id ?? localAc?.id ?? local.companyId) as number | undefined

  const localCompanies = local.companies as Array<Record<string, unknown>> | undefined
  const incomingCompanies = incoming.companies as Array<Record<string, unknown>> | undefined
  const baseCompanies = Array.isArray(incomingCompanies) ? incomingCompanies : localCompanies

  const mergedCompanies = Array.isArray(baseCompanies)
    ? baseCompanies.map((c) => {
        const localMatch = localCompanies?.find((x) => x.id === c.id)
        return {
          ...c,
          onboardingStep: mergeOnboardingStep(
            localMatch?.onboardingStep as string | undefined,
            c.onboardingStep as string | undefined
          ),
          onboardingCompleted:
            localMatch?.onboardingCompleted === true || c.onboardingCompleted === true,
        }
      })
    : baseCompanies

  const mergedActiveFromList =
    activeId != null && Array.isArray(mergedCompanies)
      ? mergedCompanies.find((c) => c.id === activeId)
      : undefined

  const mergedActive = mergedActiveFromList ?? {
    ...(localAc || {}),
    ...(incomingAc || {}),
    onboardingStep: mergeOnboardingStep(
      localAc?.onboardingStep as string | undefined,
      incomingAc?.onboardingStep as string | undefined
    ),
    onboardingCompleted:
      localAc?.onboardingCompleted === true || incomingAc?.onboardingCompleted === true,
  }

  return {
    ...local,
    ...incoming,
    activeCompany: mergedActive,
    ...(Array.isArray(mergedCompanies) ? { companies: mergedCompanies } : {}),
  } as T
}

export function getCompanySlug(user: Record<string, unknown> | null): string | null {
  if (!user) return null
  const ac = user.activeCompany as { slug?: string; id?: number } | undefined
  if (ac?.slug) return ac.slug
  const companyId = ac?.id ?? user.companyId
  const list = user.companies as Array<{ id?: number; slug?: string }> | undefined
  const match = list?.find((c) => c?.id === companyId)
  return match?.slug ?? null
}

export function setupPathForStep(step: string): string {
  return normalizeOnboardingStep(step) === 'goals' ? '/setup/goals' : '/setup/company'
}

export function setupStepIndex(step: string): number {
  return onboardingStepRank(step)
}

export function isOwnerUser(user: Record<string, unknown> | null): boolean {
  if (!user) return false
  const ac = user.activeCompany as { role?: string; isOwner?: boolean } | undefined
  if (ac?.isOwner) return true
  const r = String(ac?.role || user.role || '').toLowerCase()
  return r === 'owner' || r === 'company-owner'
}

export function getOwnerOnboardingStep(user: Record<string, unknown> | null): OwnerOnboardingStep {
  if (!user || !isOwnerUser(user)) return 'done'
  const ac = user.activeCompany as { onboardingCompleted?: boolean; onboardingStep?: string } | undefined
  if (ac?.onboardingCompleted) return 'done'
  return normalizeOnboardingStep(ac?.onboardingStep)
}

export function ownerMustCompleteSetup(user: Record<string, unknown> | null): boolean {
  return getOwnerOnboardingStep(user) !== 'done'
}

export function getOwnerSetupResumePath(user: Record<string, unknown> | null): string {
  const step = getOwnerOnboardingStep(user)
  if (step === 'done') return '/select-company'
  return setupPathForStep(step)
}

export function patchSessionOnboardingStep(step: OwnerOnboardingStep, completed = false) {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return
    const user = JSON.parse(raw) as Record<string, unknown>
    const ac = user.activeCompany as Record<string, unknown> | null | undefined
    const companyId = ac?.id ?? user.companyId
    if (ac) {
      ac.onboardingStep = step
      if (completed) ac.onboardingCompleted = true
    }
    const list = user.companies as Array<Record<string, unknown>> | undefined
    if (Array.isArray(list)) {
      for (const c of list) {
        if (c && (c.id === companyId || ac == null)) {
          c.onboardingStep = step
          if (completed) c.onboardingCompleted = true
        }
      }
    }
    localStorage.setItem('user', JSON.stringify(user))
    window.dispatchEvent(new Event('vevago:session-updated'))
  } catch {
    // ignore
  }
}

export function getActiveCompanyId(user: Record<string, unknown> | null): number | undefined {
  if (!user) return undefined
  const ac = user.activeCompany as { id?: number } | undefined
  const id = ac?.id ?? user.companyId
  if (id == null || id === '') return undefined
  const n = Number(id)
  return Number.isFinite(n) ? n : undefined
}

export async function advanceOnboardingProgress(
  step: SetupWizardStep,
  companyId?: number
): Promise<{ onboardingStep?: string; error?: string } | null> {
  const token = localStorage.getItem('token')
  if (!token) return { error: 'Not signed in' }
  let resolvedCompanyId = companyId
  if (resolvedCompanyId == null) {
    try {
      const raw = localStorage.getItem('user')
      if (raw) resolvedCompanyId = getActiveCompanyId(JSON.parse(raw) as Record<string, unknown>)
    } catch {
      /* ignore */
    }
  }
  const res = await fetch(apiUrl('/companies/onboarding/progress'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ step, companyId: resolvedCompanyId }),
  })
  const data = await res.json().catch(() => ({} as { onboardingStep?: string; error?: string }))
  if (res.ok && data.onboardingStep) {
    patchSessionOnboardingStep(normalizeOnboardingStep(data.onboardingStep), false)
    return data
  }
  return { error: data.error || `Request failed (${res.status})` }
}

/** Final onboarding call: stores the usage goals and unlocks the whole app. */
export async function completeOnboardingWizard(opts?: {
  companyId?: number
  usageGoals?: string[]
}) {
  const token = localStorage.getItem('token')
  if (!token) return null
  const res = await fetch(apiUrl('/companies/onboarding/complete'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      companyId: opts?.companyId,
      ...(opts?.usageGoals ? { usageGoals: opts.usageGoals } : {}),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok) {
    patchSessionOnboardingStep('done', true)
    markActiveCompanyOnboardedInSession()
  }
  return res.ok ? data : null
}
