import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import IndustryLanding from '../../components/industry/IndustryLanding'
import JsonLd from '../../components/JsonLd'
import { getLocalizedIndustry, getIndustrySlugs } from '../../lib/industries/data'
import { getMarketingSiteUrl } from '../../lib/siteUrl'
import {
  breadcrumbSchema,
  faqPageSchema,
  softwareApplicationSchema,
} from '../../lib/schema'

export function generateStaticParams() {
  return getIndustrySlugs().map((industry) => ({ industry }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ industry: string }>
}): Promise<Metadata> {
  const { industry } = await params
  const headersList = await headers()
  const locale = headersList.get('x-locale') || 'en'
  const data = getLocalizedIndustry(industry, locale)
  if (!data) return { title: 'Page not found' }

  const siteUrl = getMarketingSiteUrl()
  const localePrefix = locale === 'da' ? '/da' : '/en'
  const url = `${siteUrl}${localePrefix}/industries/${data.slug}`
  const enUrl = `${siteUrl}/en/industries/${data.slug}`
  const daUrl = `${siteUrl}/da/industries/${data.slug}`

  return {
    title: data.seoTitle,
    description: data.seoDescription,
    alternates: {
      canonical: `${localePrefix}/industries/${data.slug}`,
      languages: { en: enUrl, da: daUrl, 'x-default': enUrl },
    },
    openGraph: {
      title: data.seoTitle,
      description: data.seoDescription,
      url,
      type: 'website',
      images: data.hero.image ? [{ url: data.hero.image }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: data.seoTitle,
      description: data.seoDescription,
    },
  }
}

export default async function IndustryPage({ params }: { params: Promise<{ industry: string }> }) {
  const { industry: industryParam } = await params
  const headersList = await headers()
  const locale = headersList.get('x-locale') || 'en'

  const data = getLocalizedIndustry(industryParam, locale)
  if (!data) notFound()

  const siteUrl = getMarketingSiteUrl()
  const localePrefix = locale === 'da' ? '/da' : '/en'
  const pageUrl = `${siteUrl}${localePrefix}/industries/${data.slug}`
  const schemaLocale = locale === 'da' ? 'da' : 'en'

  return (
    <>
      <JsonLd
        data={[
          faqPageSchema(data.faq.items),
          softwareApplicationSchema({
            description: data.seoDescription,
            url: pageUrl,
            locale: schemaLocale,
          }),
          breadcrumbSchema([
            {
              name: schemaLocale === 'da' ? 'Brancher' : 'Industries',
              path: `${localePrefix}/industries`,
            },
            { name: data.menuLabel, path: `${localePrefix}/industries/${data.slug}` },
          ]),
        ]}
      />
      <IndustryLanding data={data} locale={locale} />
    </>
  )
}
