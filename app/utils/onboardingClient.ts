import { apiUrl } from './api'

export const SETUP_STEP_ORDER = ['company', 'services', 'clients', 'plan'] as const
export type SetupWizardStep = (typeof SETUP_STEP_ORDER)[number]

const SETUP_PATHS: Record<SetupWizardStep, string> = {
  company: '/setup/company',
  services: '/setup/services',
  clients: '/setup/clients',
  plan: '/setup/plan',
}

export function setupPathForStep(step: string): string {
  if (step in SETUP_PATHS) return SETUP_PATHS[step as SetupWizardStep]
  return '/setup/company'
}

export function setupStepIndex(step: string): number {
  const i = SETUP_STEP_ORDER.indexOf(step as SetupWizardStep)
  return i < 0 ? 0 : i
}

export function isOwnerUser(user: Record<string, unknown> | null): boolean {
  if (!user) return false
  const ac = user.activeCompany as { role?: string; isOwner?: boolean } | undefined
  if (ac?.isOwner) return true
  const r = String(ac?.role || user.role || '').toLowerCase()
  return r === 'owner' || r === 'company-owner'
}

export function getOwnerOnboardingStep(user: Record<string, unknown> | null): SetupWizardStep | 'done' {
  if (!user || !isOwnerUser(user)) return 'done'
  const ac = user.activeCompany as { onboardingCompleted?: boolean; onboardingStep?: string } | undefined
  if (ac?.onboardingCompleted) return 'done'
  const step = ac?.onboardingStep || 'company'
  if (step === 'done') return 'done'
  return SETUP_STEP_ORDER.includes(step as SetupWizardStep) ? (step as SetupWizardStep) : 'company'
}

export function ownerMustCompleteSetup(user: Record<string, unknown> | null): boolean {
  return getOwnerOnboardingStep(user) !== 'done'
}

export function getOwnerSetupResumePath(user: Record<string, unknown> | null): string {
  const step = getOwnerOnboardingStep(user)
  if (step === 'done') return '/select-company'
  return setupPathForStep(step)
}

export function patchSessionOnboardingStep(step: SetupWizardStep | 'done', completed = false) {
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

export async function advanceOnboardingProgress(
  step: 'services' | 'clients' | 'plan' | 'wizard_completed',
  companyId?: number
) {
  const token = localStorage.getItem('token')
  if (!token) return null
  const res = await fetch(apiUrl('/companies/onboarding/progress'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ step, companyId }),
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok && data.onboardingStep) {
    const mapped = data.onboardingStep === 'done' ? 'done' : data.onboardingStep
    patchSessionOnboardingStep(mapped as SetupWizardStep | 'done', false)
  }
  return res.ok ? data : null
}
