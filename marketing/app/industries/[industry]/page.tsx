import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import IndustryLanding from '../../components/industry/IndustryLanding'
import { getIndustry, getIndustrySlugs } from '../../lib/industries/data'
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
  const data = getIndustry(industry)
  if (!data) return { title: 'Page not found' }

  const url = `${getMarketingSiteUrl()}/industries/${data.slug}`
  return {
    title: data.seoTitle,
    description: data.seoDescription,
    alternates: { canonical: `/industries/${data.slug}` },
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
  const { industry } = await params
  const data = getIndustry(industry)
  if (!data) notFound()

  const siteUrl = getMarketingSiteUrl()
  const pageUrl = `${siteUrl}/industries/${data.slug}`

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
      <IndustryLanding data={data} />
    </>
  )
}
