'use client'

/**
 * Silent session renewal.
 *
 * There's a single long-lived access token (7 days) and no separate refresh
 * token. Left alone, a tab that's been open — or just idle for a while — past
 * that window hits a hard "Invalid or expired token" wall on its very next
 * request. This renews the token in the background (on load, whenever the
 * tab regains focus, and as a one-shot recovery right after any 401/403) so
 * an account that's used at least occasionally effectively never expires,
 * while a genuinely dead session (well past the server's grace window,
 * revoked account, etc.) still cleanly signs the user out.
 */

import { apiUrl } from './api'
import { SESSION_UPDATED_EVENT } from './sessionEvents'
import { isOverwatchActive } from './overwatch'

const THROTTLE_KEY = 'vevago_last_refresh_at'
const THROTTLE_MS = 10 * 60 * 1000 // never hit the server more than once per 10 min
const RENEW_WITHIN_MS = 2 * 24 * 60 * 60 * 1000 // proactively renew once <2 days of validity remain

type RefreshResult = 'ok' | 'expired' | 'error'

function decodeJwt(token: string): { exp?: number; overwatch?: boolean } | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as { exp?: number; overwatch?: boolean }
  } catch {
    return null
  }
}

function markThrottle() {
  try {
    sessionStorage.setItem(THROTTLE_KEY, String(Date.now()))
  } catch {
    /* ignore quota / private mode */
  }
}

let inFlight: Promise<RefreshResult> | null = null

/**
 * Calls POST /auth/refresh with the current token. Applies the fresh
 * token/user on success. Concurrent callers share a single in-flight request.
 */
export function refreshSession(): Promise<RefreshResult> {
  if (inFlight) return inFlight

  inFlight = (async (): Promise<RefreshResult> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (!token) return 'error'

    try {
      const res = await fetch(apiUrl('/auth/refresh'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.status === 401 || res.status === 403) return 'expired'
      if (!res.ok) return 'error'

      const data = await res.json()
      if (!data?.token || !data?.user) return 'error'

      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      window.dispatchEvent(new Event(SESSION_UPDATED_EVENT))
      markThrottle()
      return 'ok'
    } catch {
      // Network hiccup — don't punish the user for a bad connection.
      return 'error'
    }
  })()

  inFlight.finally(() => {
    inFlight = null
  })

  return inFlight
}

/** Renew the token in the background if it's getting old. Cheap to call often. */
export function maybeRefreshSession(): void {
  if (typeof window === 'undefined') return
  if (isOverwatchActive()) return // impersonation sessions are meant to expire on schedule

  const token = localStorage.getItem('token')
  if (!token) return
  const payload = decodeJwt(token)
  if (!payload?.exp || payload.overwatch) return

  const msRemaining = payload.exp * 1000 - Date.now()
  if (msRemaining > RENEW_WITHIN_MS) return

  let lastRefresh = 0
  try {
    lastRefresh = Number(sessionStorage.getItem(THROTTLE_KEY) || 0)
  } catch {
    /* ignore */
  }
  if (Date.now() - lastRefresh < THROTTLE_MS) return

  markThrottle()
  void refreshSession()
}

let loggingOut = false

/** Genuinely dead session — clear it and send the user to a clean re-login. */
export function forceReLogin(): void {
  if (typeof window === 'undefined' || loggingOut) return
  loggingOut = true
  try {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  } catch {
    /* ignore */
  }
  window.location.href = '/login?sessionExpired=1'
}
