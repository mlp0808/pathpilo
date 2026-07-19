import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import IndustryLanding from '../../../components/industry/IndustryLanding'
import { getLocalizedIndustry, getIndustrySlugs } from '../../../lib/industries/data'
import { getMarketingSiteUrl } from '../../../lib/siteUrl'
import { isMarketingLocale } from '../../../lib/i18n'

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

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: data.faq.items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }

  const softwareLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'PathPilo',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
    description: data.seoDescription,
    url: pageUrl,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: lang === 'da' ? 'DKK' : 'GBP',
      description: lang === 'da' ? 'Gratis plan tilgængelig' : 'Free plan available',
    },
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: lang === 'da' ? 'Brancher' : 'Industries',
        item: `${siteUrl}/${lang}/industries`,
      },
      { '@type': 'ListItem', position: 2, name: data.menuLabel, item: pageUrl },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <IndustryLanding data={data} locale={lang} />
    </>
  )
}
