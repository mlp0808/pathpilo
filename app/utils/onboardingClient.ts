import { apiUrl } from './api'
import { markActiveCompanyOnboardedInSession } from './sessionClient'

export const SETUP_WIZARD_STEPS = ['clients'] as const
export type SetupWizardStep = (typeof SETUP_WIZARD_STEPS)[number]
export type OwnerOnboardingStep =
  | SetupWizardStep
  | 'jobs'
  | 'route'
  | 'done'
  | 'company'
  | 'services'
  | 'plan'

const ONBOARDING_STEP_ORDER: OwnerOnboardingStep[] = [
  'company',
  'services',
  'clients',
  'jobs',
  'route',
  'plan',
  'done',
]

export function onboardingStepRank(step: string | undefined): number {
  if (!step) return 0
  if (step === 'done') return ONBOARDING_STEP_ORDER.length
  const normalized = step === 'wizard_completed' ? 'plan' : step
  const i = ONBOARDING_STEP_ORDER.indexOf(normalized as OwnerOnboardingStep)
  return i < 0 ? 0 : i
}

/** Keep the furthest wizard progress when merging local session with server payload. */
export function mergeOnboardingStep(local?: string, server?: string): string {
  if (local === 'done' || server === 'done') return 'done'
  const l = local || 'clients'
  const s = server || 'clients'
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

export function setupPathForStep(step: string, user?: Record<string, unknown> | null): string {
  const slug = user ? getCompanySlug(user) : null
  if (step === 'clients') return '/setup/clients'
  if (step === 'jobs' && slug) return `/${slug}/jobs`
  if (step === 'route' && slug) return `/${slug}/jobs?view=day`
  if (['company', 'services', 'plan'].includes(step)) return '/setup/clients'
  if (slug) return `/${slug}/jobs`
  return '/setup/clients'
}

export function setupStepIndex(step: string): number {
  if (step === 'clients') return 0
  if (step === 'jobs' || step === 'route') return 1
  if (step === 'done') return 2
  if (step === 'company' || step === 'services') return 0
  return 0
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
  const step = ac?.onboardingStep || 'clients'
  if (step === 'done') return 'done'
  if (step === 'clients' || step === 'jobs' || step === 'route') return step
  if (step === 'company' || step === 'services' || step === 'plan') return 'clients'
  return 'clients'
}

export function isAppWizardStep(step: string): step is 'jobs' | 'route' {
  return step === 'jobs' || step === 'route'
}

export function ownerMustCompleteSetup(user: Record<string, unknown> | null): boolean {
  return getOwnerOnboardingStep(user) !== 'done'
}

export function getOwnerSetupResumePath(user: Record<string, unknown> | null): string {
  const step = getOwnerOnboardingStep(user)
  if (step === 'done') return '/select-company'
  return setupPathForStep(step, user)
}

export function patchSessionOnboardingStep(step: OwnerOnboardingStep | 'done', completed = false) {
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
  step: 'services' | 'clients' | 'jobs' | 'route' | 'plan' | 'wizard_completed',
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
    const mapped = data.onboardingStep === 'done' ? 'done' : data.onboardingStep
    patchSessionOnboardingStep(mapped as OwnerOnboardingStep | 'done', false)
    return data
  }
  return { error: data.error || `Request failed (${res.status})` }
}

export async function completeOnboardingWizard(companyId?: number) {
  const token = localStorage.getItem('token')
  if (!token) return null
  const res = await fetch(apiUrl('/companies/onboarding/complete'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ companyId }),
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok) {
    patchSessionOnboardingStep('done', true)
    markActiveCompanyOnboardedInSession()
  }
  return res.ok ? data : null
}
