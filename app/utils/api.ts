/**
 * API Configuration
 *
 * All API requests from the browser use relative paths (/api/...) so they hit the
 * current origin. Next.js rewrites /api/* to the backend (see next.config.js).
 * This way the API server receives every request and you'll see logs in its terminal.
 *
 * Set NEXT_PUBLIC_API_URL to match your API server (e.g. http://localhost:8000 or
 * http://localhost:3001). Default in next.config.js is http://localhost:8000.
 */

const getApiBaseUrl = (): string => {
  // In the browser: always use relative path so the request goes to the current
  // origin and Next.js can proxy it to the API server. This ensures the backend
  // receives the request and you see logs in the API terminal.
  if (typeof window !== 'undefined') {
    return ''
  }
  // Server-side (e.g. SSR): use env or default so server-side fetch has a full URL
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
}

export const API_BASE_URL = getApiBaseUrl()

/**
 * Build API URL. In the browser returns relative path (e.g. /api/companies/profile)
 * so the request goes through Next.js rewrite to the backend.
 */
export const apiUrl = (endpoint: string): string => {
  const cleanEndpoint = endpoint.startsWith('/api')
    ? endpoint
    : endpoint.startsWith('/')
      ? `/api${endpoint}`
      : `/api/${endpoint}`

  if (typeof window !== 'undefined') {
    const base = getApiBaseUrl()
    return base ? base.replace(/\/$/, '') + cleanEndpoint : cleanEndpoint
  }
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  return base.replace(/\/$/, '') + cleanEndpoint
}

