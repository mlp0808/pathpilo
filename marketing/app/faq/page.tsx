import type { Metadata } from 'next'
import { headers } from 'next/headers'
import FAQContent from './FAQContent'
import JsonLd from '../components/JsonLd'
import { getLocaleFromPathname, isMarketingLocale } from '../lib/i18n'
import type { MarketingLocale } from '../lib/i18n'
import { getSiteFaqs } from '../lib/faqData'
import { breadcrumbSchema, faqPageSchema } from '../lib/schema'

export const metadata: Metadata = {
  title: 'PathPilo FAQ',
  description:
    'Find answers about PathPilo features, setup, scheduling, invoicing, team management, and support for service businesses.',
}

/** Unprefixed `/faq` — locale from middleware `x-locale` when available. */
export default async function Page() {
  const headersList = await headers()
  const fromHeader = headersList.get('x-locale') || ''
  const locale: MarketingLocale = isMarketingLocale(fromHeader)
    ? fromHeader
    : getLocaleFromPathname('/')

  return (
    <>
      <JsonLd
        data={[
          faqPageSchema(getSiteFaqs(locale)),
          breadcrumbSchema([
            { name: locale === 'da' ? 'Hjem' : 'Home', path: `/${locale}` },
            { name: 'FAQ', path: `/${locale}/faq` },
          ]),
        ]}
      />
      <FAQContent locale={locale} />
    </>
  )
}
