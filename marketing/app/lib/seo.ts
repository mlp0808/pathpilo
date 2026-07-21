import type { Metadata } from 'next'
import { getMarketingSiteUrl } from './siteUrl'
import type { MarketingLocale } from './i18n'

/**
 * Build canonical + hreflang alternates for a locale-prefixed marketing path.
 * `path` is the route WITHOUT locale, e.g. `/pricing` or `/tools/route-planner` or `` for home.
 */
export function localeAlternates(path: string, lang: MarketingLocale) {
  const siteUrl = getMarketingSiteUrl()
  const normalised = path === '/' ? '' : path.replace(/\/$/, '')
  const withLocale = (l: MarketingLocale) => `${siteUrl}/${l}${normalised}`
  return {
    canonical: `/${lang}${normalised}`,
    languages: {
      en: withLocale('en'),
      da: withLocale('da'),
      'x-default': withLocale('en'),
    } as Record<string, string>,
  }
}

/** Convenience wrapper for page generateMetadata on bilingual marketing routes. */
export function bilingualPageMetadata(opts: {
  lang: MarketingLocale
  path: string
  title: string
  description: string
  ogType?: 'website' | 'article'
  image?: string
}): Metadata {
  const siteUrl = getMarketingSiteUrl()
  const alternates = localeAlternates(opts.path, opts.lang)
  const url = `${siteUrl}${alternates.canonical}`
  return {
    title: opts.title,
    description: opts.description,
    alternates,
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      type: opts.ogType ?? 'website',
      locale: opts.lang === 'da' ? 'da_DK' : 'en_GB',
      ...(opts.image ? { images: [{ url: opts.image }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: opts.title,
      description: opts.description,
      ...(opts.image ? { images: [opts.image] } : {}),
    },
  }
}
