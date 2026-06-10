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

/**
 * Resolve a server-side asset URL (e.g. a company logo stored as
 * `/uploads/company-logos/abc.jpg`) to an absolute URL.
 *
 * Logos are served by the Express API server. In most browsers the Next.js
 * `/uploads` rewrite proxies these requests correctly, but the rewrite
 * destination is baked in at build time and may not match every deployment.
 * Resolving to an absolute URL using `NEXT_PUBLIC_API_URL` makes logos work
 * reliably in all environments (dev, staging, production, mobile devices, etc.)
 */
export const resolveAssetUrl = (url: string | null | undefined): string | null => {
  if (!url) return null
  // Already absolute — use as-is
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  // New format: /api/companies/logo/<filename>
  // These go through the standard Next.js /api/* rewrite — no transformation needed.
  if (url.startsWith('/api/')) return url
  // Legacy /uploads/ path — prefix with the API server base URL so the browser
  // can reach it directly without relying on a potentially-missing /uploads rewrite.
  if (url.startsWith('/uploads/')) {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || ''
    return apiBase ? `${apiBase.replace(/\/$/, '')}${url}` : url
  }
  return url
}

