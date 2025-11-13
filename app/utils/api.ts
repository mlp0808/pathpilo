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
  
  // Production: use relative path (works with reverse proxy)
  // This will use /api which goes through nginx to the backend
  return ''
}

export const API_BASE_URL = getApiBaseUrl()

/**
 * Helper function to build API URLs
 * @param endpoint - API endpoint (e.g., '/api/clients' or 'clients')
 * @returns Full API URL
 */
export const apiUrl = (endpoint: string): string => {
  // Ensure endpoint starts with /api
  const cleanEndpoint = endpoint.startsWith('/api') 
    ? endpoint 
    : endpoint.startsWith('/') 
      ? `/api${endpoint}` 
      : `/api/${endpoint}`
  
  // If API_BASE_URL is empty, return relative path
  if (!API_BASE_URL) {
    return cleanEndpoint
  }
  
  // Otherwise, prepend the base URL
  return `${API_BASE_URL}${cleanEndpoint}`
}

