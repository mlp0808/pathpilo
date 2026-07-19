import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Header from '../../../components/Header'
import Footer from '../../../components/Footer'
import { getLocalizedComparison, getComparisonSlugs } from '../../../lib/comparisons/data'
import ComparisonPageContent from '../../../components/comparisons/ComparisonPageContent'
import { isMarketingLocale } from '../../../lib/i18n'
import { getMarketingSiteUrl } from '../../../lib/siteUrl'

export function generateStaticParams() {
  const locales = ['en', 'da']
  const slugs = getComparisonSlugs()
  return locales.flatMap((lang) => slugs.map((slug) => ({ lang, slug })))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}): Promise<Metadata> {
  const { lang, slug } = await params
  if (!isMarketingLocale(lang)) return {}

  const data = getLocalizedComparison(slug, lang)
  if (!data) return {}

  const siteUrl = getMarketingSiteUrl()
  const enUrl = `${siteUrl}/en/comparisons/${slug}`
  const daUrl = `${siteUrl}/da/comparisons/${slug}`

  return {
    title: data.seoTitle,
    description: data.seoDescription,
    alternates: {
      canonical: `/${lang}/comparisons/${slug}`,
      languages: { en: enUrl, da: daUrl, 'x-default': enUrl },
    },
    openGraph: {
      title: data.seoTitle,
      description: data.seoDescription,
      url: `${siteUrl}/${lang}/comparisons/${slug}`,
    },
  }
}

export default async function LocalizedComparisonPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { lang, slug } = await params
  if (!isMarketingLocale(lang)) notFound()

  const data = getLocalizedComparison(slug, lang)
  if (!data) notFound()

  const siteUrl = getMarketingSiteUrl()
  const pageUrl = `${siteUrl}/${lang}/comparisons/${slug}`

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
        { '@type': 'ListItem', position: 1, name: lang === 'da' ? 'Hjem' : 'Home', item: siteUrl },
        {
          '@type': 'ListItem',
          position: 2,
          name: lang === 'da' ? 'Sammenligninger' : 'Comparisons',
          item: `${siteUrl}/${lang}/comparisons`,
        },
        { '@type': 'ListItem', position: 3, name: data.headline, item: pageUrl },
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
      <ComparisonPageContent data={data} locale={lang} />
      <Footer />
    </>
  )
}
