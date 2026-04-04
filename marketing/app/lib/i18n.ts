export const MARKETING_LOCALES = ['en', 'da'] as const
export type MarketingLocale = (typeof MARKETING_LOCALES)[number]

export function isMarketingLocale(value: string): value is MarketingLocale {
  return MARKETING_LOCALES.includes(value as MarketingLocale)
}

export function getLocaleFromPathname(pathname: string): MarketingLocale {
  const seg = pathname.split('/').filter(Boolean)[0]
  return seg && isMarketingLocale(seg) ? seg : 'en'
}

/** Prefer locale from URL prefix; otherwise `localeProp` if valid; else `en`. */
export function resolveMarketingLocale(
  pathname: string | null | undefined,
  localeProp?: string
): MarketingLocale {
  if (pathname) return getLocaleFromPathname(pathname)
  if (localeProp && isMarketingLocale(localeProp)) return localeProp
  return 'en'
}

export function stripLocalePrefix(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] && isMarketingLocale(parts[0])) {
    return '/' + parts.slice(1).join('/')
  }
  return pathname || '/'
}

export function withLocalePath(locale: MarketingLocale, href: string): string {
  if (!href.startsWith('/')) return href
  if (href === '/') return `/${locale}`
  const path = href.startsWith('/') ? href : `/${href}`
  return `/${locale}${path}`
}

export function withAppLanguageParam(locale: MarketingLocale, appHref: string): string {
  try {
    const url = new URL(appHref)
    url.searchParams.set('lang', locale)
    return url.toString()
  } catch {
    return appHref
  }
}
