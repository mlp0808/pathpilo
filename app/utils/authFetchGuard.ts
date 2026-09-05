'use client'

/**
 * Catches a stale-token 401/403 on ANY of the app's own API calls, refreshes
 * the session once, and retries — before the caller ever sees the failure.
 *
 * Every page does its own ad-hoc `fetch(apiUrl(...), { headers: { Authorization }})`
 * calls, so rather than teach each one to retry, this patches `window.fetch`
 * a single time. Only requests to our own `/api/*` are touched (Mapbox,
 * Stripe, etc. keep their own auth untouched); `/api/auth/*` itself is never
 * intercepted, so a refresh can't recursively trigger another refresh. A
 * genuinely dead session (past the server's grace window) still surfaces as
 * a 401/403 to the caller, same as before — it just also triggers a clean
 * redirect to /login instead of leaving the page stuck.
 */

import { forceReLogin, refreshSession } from './sessionRefresh'

const PATCHED_FLAG = '__vevagoAuthFetchPatched'

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return (input as Request).url
}

function isOwnApiCall(input: RequestInfo | URL): boolean {
  try {
    const parsed = new URL(requestUrl(input), window.location.origin)
    return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

function isAuthEndpoint(input: RequestInfo | URL): boolean {
  return requestUrl(input).includes('/api/auth/')
}

export function installAuthFetchRecovery(): void {
  if (typeof window === 'undefined') return
  const win = window as unknown as Record<string, boolean>
  if (win[PATCHED_FLAG]) return
  win[PATCHED_FLAG] = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await originalFetch(input, init)

    if (
      (response.status === 401 || response.status === 403) &&
      isOwnApiCall(input) &&
      !isAuthEndpoint(input)
    ) {
      const result = await refreshSession()

      if (result === 'ok') {
        const token = localStorage.getItem('token')
        const headers = new Headers(init?.headers)
        headers.set('Authorization', `Bearer ${token}`)
        return originalFetch(input, { ...init, headers })
      }

      if (result === 'expired') {
        forceReLogin()
      }
    }

    return response
  }
}
