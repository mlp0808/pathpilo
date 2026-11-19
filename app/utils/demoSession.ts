/** Public demo workspaces: remembered so /demo can offer "continue" until they expire. */

export const DEMO_SESSION_KEY = 'demoSession'
export const DEMO_EMAIL_DOMAIN = 'demo.pathpilo.com'

export interface DemoSession {
  token: string
  user: Record<string, unknown>
  expiresAt: string
  slug: string
}

export function readDemoSession(): DemoSession | null {
  try {
    const raw = localStorage.getItem(DEMO_SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as DemoSession
    const expires = Date.parse(s?.expiresAt || '')
    if (!s?.token || !s.user || !Number.isFinite(expires) || expires - Date.now() < 10 * 60 * 1000) {
      localStorage.removeItem(DEMO_SESSION_KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

export function isDemoEmail(email: unknown): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`)
}

/** True when the active company in the stored session is a public demo. */
export function isDemoWorkspace(user?: Record<string, unknown> | null): boolean {
  const u = user || (() => {
    try {
      const raw = localStorage.getItem('user')
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
    } catch {
      return null
    }
  })()
  if (!u) return false
  const active = u.activeCompany as { isDemo?: boolean } | null | undefined
  if (active?.isDemo) return true
  const list = u.companies as Array<{ id?: number; isDemo?: boolean }> | undefined
  const id = active && 'id' in (active as object) ? (active as { id?: number }).id : u.companyId
  return Boolean(Array.isArray(list) && list.some((c) => c?.id === id && c.isDemo))
}

/** Signs out of the demo (it stays resumable from /demo) and opens sign-up. */
export function leaveDemoForSignup() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  window.location.href = '/register'
}
