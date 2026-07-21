import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isMarketingLocale } from './app/lib/i18n'

function resolveLocaleFromRequest(request: NextRequest): 'en' | 'da' {
  // Common edge headers for country code across providers.
  const headerCountry =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    request.headers.get('x-country-code')

  const country = (headerCountry || '').toUpperCase()
  if (country === 'DK') return 'da'

  // Future-ready fallback: infer from Accept-Language when geo is unavailable.
  const acceptLanguage = (request.headers.get('accept-language') || '').toLowerCase()
  if (acceptLanguage.includes('da')) return 'da'

  return 'en'
}

function nextWithLocale(locale: string) {
  const res = NextResponse.next()
  res.headers.set('x-locale', locale)
  return res
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Never locale-redirect metadata routes (would turn /sitemap.xml into /en/sitemap.xml → 404)
  if (
    pathname === '/sitemap.xml' ||
    pathname === '/robots.txt' ||
    pathname === '/llms.txt' ||
    pathname === '/articles/rss.xml'
  ) {
    return NextResponse.next()
  }

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/hero') ||
    pathname === '/favicon.ico' ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const segments = pathname.split('/').filter(Boolean)
  const first = segments[0]

  // Articles are English-first (no locale prefix); industry and comparison
  // pages are now fully localised under /da/industries/ and /da/comparisons/.
  const ENGLISH_FIRST = new Set(['articles'])
  if (first && ENGLISH_FIRST.has(first)) {
    return nextWithLocale('en')
  }
  // Fold locale-prefixed article paths back (language toggle compatibility).
  if ((first === 'en' || first === 'da') && segments[1] && ENGLISH_FIRST.has(segments[1])) {
    const url = request.nextUrl.clone()
    url.pathname = '/' + segments.slice(1).join('/')
    return NextResponse.redirect(url)
  }

  if (first && isMarketingLocale(first)) {
    return nextWithLocale(first)
  }

  const locale = resolveLocaleFromRequest(request)
  const url = request.nextUrl.clone()
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap\\.xml|robots\\.txt).*)',
  ],
}
