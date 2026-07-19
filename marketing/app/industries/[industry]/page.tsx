import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import IndustryLanding from '../../components/industry/IndustryLanding'
import { getIndustry, getLocalizedIndustry, getIndustrySlugs } from '../../lib/industries/data'
import { getMarketingSiteUrl } from '../../lib/siteUrl'

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
      priceCurrency: 'GBP',
      description: 'Free plan available',
    },
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Industries', item: `${siteUrl}/industries` },
      { '@type': 'ListItem', position: 2, name: data.menuLabel, item: pageUrl },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <IndustryLanding data={data} locale={locale} />
    </>
  )
}
