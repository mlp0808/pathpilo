/**
 * API Configuration
 * 
 * In production, this will use relative paths (/api) which works with the reverse proxy.
 * In development, it uses localhost:3002 for the backend.
 */

// Get API base URL from environment variable or use default
// For production: Set NEXT_PUBLIC_API_URL="" (empty) to use relative paths
// For development: Set NEXT_PUBLIC_API_URL="http://localhost:3003" or leave undefined
const getApiBaseUrl = (): string => {
  // If explicitly set in environment, use it
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  
  // If accessing via IP address (direct port access), use full URL with port 3003
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    const port = window.location.port
    
    // If accessing via IP or with explicit port, use full backend URL (api-server on port 8000)
    if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/) || port === '3002') {
      return `http://${hostname}:8000`
    }
    
    // If localhost with port, use localhost api-server
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000'
    }
  }
  
  // Production domain: use relative path (works with reverse proxy)
  // This will use /api which goes through nginx to the backend
  return ''
}

export const API_BASE_URL = getApiBaseUrl()

/**
 * Helper function to build API URLs
 * In development (localhost / 127.0.0.1 / IP), uses full URL to api-server (port 8000) so requests go directly to the backend.
 * Otherwise uses relative /api paths (e.g. for production behind a reverse proxy).
 * @param endpoint - API endpoint (e.g., '/api/clients' or 'clients')
 * @returns Full or relative API URL
 */
export const apiUrl = (endpoint: string): string => {
  const cleanEndpoint = endpoint.startsWith('/api')
    ? endpoint
    : endpoint.startsWith('/')
      ? `/api${endpoint}`
      : `/api/${endpoint}`

  // In the browser: use full URL to api-server in dev so we don't rely on Next.js rewrite
  if (typeof window !== 'undefined') {
    const base = getApiBaseUrl()
    if (base) return base.replace(/\/$/, '') + cleanEndpoint
    return cleanEndpoint
  }

  // Server-side: use full URL for fetch
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  return base.replace(/\/$/, '') + cleanEndpoint
}

