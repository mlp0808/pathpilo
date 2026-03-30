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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

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

  const first = pathname.split('/').filter(Boolean)[0]
  if (first && isMarketingLocale(first)) {
    return NextResponse.next()
  }

  const locale = resolveLocaleFromRequest(request)
  const url = request.nextUrl.clone()
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
