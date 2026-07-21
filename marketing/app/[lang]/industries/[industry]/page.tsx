import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import IndustryLanding from '../../../components/industry/IndustryLanding'
import JsonLd from '../../../components/JsonLd'
import { getLocalizedIndustry, getIndustrySlugs } from '../../../lib/industries/data'
import { getMarketingSiteUrl } from '../../../lib/siteUrl'
import { isMarketingLocale } from '../../../lib/i18n'
import {
  breadcrumbSchema,
  faqPageSchema,
  softwareApplicationSchema,
} from '../../../lib/schema'

export function generateStaticParams() {
  const locales = ['en', 'da']
  const slugs = getIndustrySlugs()
  return locales.flatMap((lang) => slugs.map((industry) => ({ lang, industry })))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; industry: string }>
}): Promise<Metadata> {
  const { lang, industry } = await params
  if (!isMarketingLocale(lang)) return {}

  const data = getLocalizedIndustry(industry, lang)
  if (!data) return { title: 'Page not found' }

  const siteUrl = getMarketingSiteUrl()
  const url = `${siteUrl}/${lang}/industries/${data.slug}`
  const enUrl = `${siteUrl}/en/industries/${data.slug}`
  const daUrl = `${siteUrl}/da/industries/${data.slug}`

  return {
    title: data.seoTitle,
    description: data.seoDescription,
    alternates: {
      canonical: `/${lang}/industries/${data.slug}`,
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

export default async function LocalizedIndustryPage({
  params,
}: {
  params: Promise<{ lang: string; industry: string }>
}) {
  const { lang, industry } = await params
  if (!isMarketingLocale(lang)) notFound()

  const data = getLocalizedIndustry(industry, lang)
  if (!data) notFound()

  const siteUrl = getMarketingSiteUrl()
  const pageUrl = `${siteUrl}/${lang}/industries/${data.slug}`

  return (
    <>
      <JsonLd
        data={[
          faqPageSchema(data.faq.items),
          softwareApplicationSchema({
            description: data.seoDescription,
            url: pageUrl,
            locale: lang,
          }),
          breadcrumbSchema([
            {
              name: lang === 'da' ? 'Brancher' : 'Industries',
              path: `/${lang}/industries`,
            },
            { name: data.menuLabel, path: `/${lang}/industries/${data.slug}` },
          ]),
        ]}
      />
      <IndustryLanding data={data} locale={lang} />
    </>
  )
}
