import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import JsonLd from '../../components/JsonLd'
import { getComparison, getComparisonSlugs } from '../../lib/comparisons/data'
import ComparisonPageContent from '../../components/comparisons/ComparisonPageContent'
import { getMarketingSiteUrl } from '../../lib/siteUrl'
import { breadcrumbSchema, faqPageSchema } from '../../lib/schema'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return getComparisonSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = getComparison(slug)
  if (!data) return {}
  const siteUrl = getMarketingSiteUrl()
  return {
    title: data.seoTitle,
    description: data.seoDescription,
    alternates: {
      canonical: `${siteUrl}/en/comparisons/${slug}`,
      languages: {
        en: `${siteUrl}/en/comparisons/${slug}`,
        da: `${siteUrl}/da/comparisons/${slug}`,
        'x-default': `${siteUrl}/en/comparisons/${slug}`,
      },
    },
    openGraph: {
      title: data.seoTitle,
      description: data.seoDescription,
      url: `${siteUrl}/en/comparisons/${slug}`,
    },
  }
}

export default async function ComparisonPage({ params }: Props) {
  const { slug } = await params
  const data = getComparison(slug)
  if (!data) notFound()

  const siteUrl = getMarketingSiteUrl()
  const pageUrl = `${siteUrl}/en/comparisons/${slug}`

  const graphs: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: data.headline,
      description: data.seoDescription,
      dateModified: data.lastUpdated,
      mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
      publisher: { '@type': 'Organization', name: 'PathPilo', url: siteUrl },
    },
    breadcrumbSchema([
      { name: 'Home', path: '/en' },
      { name: 'Comparisons', path: '/en/comparisons' },
      { name: data.headline, path: `/en/comparisons/${slug}` },
    ]),
  ]
  if (data.faq?.length) graphs.push(faqPageSchema(data.faq))

  return (
    <>
      <JsonLd data={graphs} />
      <Header />
      <ComparisonPageContent data={data} />
      <Footer />
    </>
  )
}
