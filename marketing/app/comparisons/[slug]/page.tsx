import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import { getComparison, getComparisonSlugs } from '../../lib/comparisons/data'
import ComparisonPageContent from '../../components/comparisons/ComparisonPageContent'

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
  return {
    title: data.seoTitle,
    description: data.seoDescription,
    alternates: { canonical: `https://pathpilo.com/comparisons/${slug}` },
    openGraph: {
      title: data.seoTitle,
      description: data.seoDescription,
      url: `https://pathpilo.com/comparisons/${slug}`,
    },
  }
}

export default async function ComparisonPage({ params }: Props) {
  const { slug } = await params
  const data = getComparison(slug)
  if (!data) notFound()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: data.headline,
    description: data.seoDescription,
    dateModified: data.lastUpdated,
    publisher: { '@type': 'Organization', name: 'PathPilo', url: 'https://pathpilo.com' },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://pathpilo.com' },
        { '@type': 'ListItem', position: 2, name: 'Comparisons', item: 'https://pathpilo.com/comparisons' },
        { '@type': 'ListItem', position: 3, name: data.headline, item: `https://pathpilo.com/comparisons/${slug}` },
      ],
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />
      <ComparisonPageContent data={data} />
      <Footer />
    </>
  )
}
