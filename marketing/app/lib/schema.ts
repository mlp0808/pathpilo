/**
 * Shared JSON-LD builders for the marketing site.
 * Keep these free of React — pages/layouts pass the result into <JsonLd />.
 */

import { getMarketingSiteUrl } from './siteUrl'
import { socialSameAs } from './social'

export type FaqItem = { q: string; a: string }

export type BreadcrumbItem = {
  name: string
  /** Absolute URL, or path starting with `/` (will be absolutised). */
  path: string
}

export type HowToStep = {
  name: string
  text: string
}

const SOFTWARE_DESC_EN =
  'Field service management software for mobile service businesses — route planning, scheduling, clients, recurring jobs, team coordination, and invoicing.'
const SOFTWARE_DESC_DA =
  'Serviceplatform til mobile servicevirksomheder — ruteplanlægning, planlægning, kunder, gentagne opgaver, teamkoordinering og fakturering.'

function abs(urlOrPath: string, siteUrl = getMarketingSiteUrl()): string {
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) return urlOrPath
  const path = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`
  return `${siteUrl}${path}`
}

/** Sitewide Organization — used from root layout. */
export function organizationSchema(locale: 'en' | 'da' = 'en') {
  const siteUrl = getMarketingSiteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteUrl}/#organization`,
    name: 'PathPilo',
    url: siteUrl,
    logo: {
      '@type': 'ImageObject',
      url: abs('/images/brand/logo-header.png', siteUrl),
    },
    description: locale === 'da' ? SOFTWARE_DESC_DA : SOFTWARE_DESC_EN,
    foundingDate: '2024',
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        url: abs(`/${locale}/contact`, siteUrl),
        availableLanguage: ['English', 'Danish'],
      },
    ],
    sameAs: socialSameAs,
  }
}

/** Sitewide WebSite — pairs with Organization via @id. */
export function webSiteSchema(locale: 'en' | 'da' = 'en') {
  const siteUrl = getMarketingSiteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    name: 'PathPilo',
    url: siteUrl,
    inLanguage: locale === 'da' ? 'da-DK' : 'en-GB',
    publisher: { '@id': `${siteUrl}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl}/articles?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

export function faqPageSchema(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  }
}

export function breadcrumbSchema(items: BreadcrumbItem[]) {
  const siteUrl = getMarketingSiteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: abs(item.path, siteUrl),
    })),
  }
}

export function softwareApplicationSchema(opts: {
  name?: string
  description: string
  url: string
  locale?: 'en' | 'da'
  /** Override offer; defaults to free plan. */
  offerDescription?: string
  applicationCategory?: string
}) {
  const locale = opts.locale ?? 'en'
  const siteUrl = getMarketingSiteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: opts.name ?? 'PathPilo',
    applicationCategory: opts.applicationCategory ?? 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
    description: opts.description,
    url: abs(opts.url, siteUrl),
    image: abs('/images/og/og-image.png', siteUrl),
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: locale === 'da' ? 'DKK' : 'GBP',
      description:
        opts.offerDescription ??
        (locale === 'da' ? 'Gratis plan tilgængelig — ingen kreditkort' : 'Free plan available — no credit card'),
    },
    publisher: { '@id': `${siteUrl}/#organization` },
  }
}

export function howToSchema(opts: {
  name: string
  description: string
  steps: HowToStep[]
  url?: string
}) {
  const siteUrl = getMarketingSiteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: opts.name,
    description: opts.description,
    ...(opts.url ? { url: abs(opts.url, siteUrl) } : {}),
    step: opts.steps.map((step, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: step.name,
      text: step.text,
    })),
  }
}

export function webApplicationSchema(opts: {
  name: string
  description: string
  url: string
  locale?: 'en' | 'da'
}) {
  const locale = opts.locale ?? 'en'
  const siteUrl = getMarketingSiteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: opts.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript. Requires HTML5.',
    description: opts.description,
    url: abs(opts.url, siteUrl),
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: locale === 'da' ? 'DKK' : 'GBP',
      description: locale === 'da' ? 'Gratis at bruge i browseren' : 'Free to use in the browser',
    },
    publisher: { '@id': `${siteUrl}/#organization` },
  }
}
