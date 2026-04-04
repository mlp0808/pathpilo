/**
 * Canonical origin for sitemap, robots, and absolute links at build/runtime.
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://pathpilo.com).
 */
export function getMarketingSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  return 'https://pathpilo.com'
}
