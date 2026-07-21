import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Header from '../../../components/Header'
import Footer from '../../../components/Footer'
import JsonLd from '../../../components/JsonLd'
import { getLocalizedComparison, getComparisonSlugs } from '../../../lib/comparisons/data'
import ComparisonPageContent from '../../../components/comparisons/ComparisonPageContent'
import { isMarketingLocale } from '../../../lib/i18n'
import { getMarketingSiteUrl } from '../../../lib/siteUrl'
import { breadcrumbSchema, faqPageSchema } from '../../../lib/schema'

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
  const da = lang === 'da'

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: data.headline,
    description: data.seoDescription,
    dateModified: data.lastUpdated,
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
    publisher: { '@type': 'Organization', name: 'PathPilo', url: siteUrl },
  }

  const graphs: Record<string, unknown>[] = [
    articleLd,
    breadcrumbSchema([
      { name: da ? 'Hjem' : 'Home', path: `/${lang}` },
      { name: da ? 'Sammenligninger' : 'Comparisons', path: `/${lang}/comparisons` },
      { name: data.headline, path: `/${lang}/comparisons/${slug}` },
    ]),
  ]
  if (data.faq?.length) graphs.push(faqPageSchema(data.faq))

  return (
    <>
      <JsonLd data={graphs} />
      <Header />
      <ComparisonPageContent data={data} locale={lang} />
      <Footer />
    </>
  )
}
