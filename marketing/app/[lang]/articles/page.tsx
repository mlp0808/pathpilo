import type { Metadata } from 'next'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import Breadcrumbs from '../../components/Breadcrumbs'
import ArticleCard from '../../components/blog/ArticleCard'
import ArticleCarousel from '../../components/blog/ArticleCarousel'
import CategoryPills from '../../components/blog/CategoryPills'
import { getAllArticles, getFeaturedArticle } from '../../lib/blog/articles'
import { bilingualPageMetadata } from '../../lib/seo'
import { isMarketingLocale } from '../../lib/i18n'
import type { MarketingLocale } from '../../lib/i18n'

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'da' }]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  if (!isMarketingLocale(lang)) return {}
  const da = lang === 'da'

  return bilingualPageMetadata({
    lang,
    path: '/articles',
    title: da
      ? 'Artikler — guides til servicevirksomheder'
      : 'Articles — Guides for service businesses',
    description: da
      ? 'Praktiske guides om ruteplanlægning, planlægning, fakturering og vækst for mobile servicevirksomheder.'
      : 'Practical guides on route planning, scheduling, invoicing, and growing a mobile service business.',
  })
}

export default async function LocalizedArticlesPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isMarketingLocale(lang)) return null
  const locale = lang as MarketingLocale
  const da = locale === 'da'

  const all = getAllArticles(locale)
  const featured = all.find((a) => a.featured) || all[0] || null
  const rest = featured ? all.filter((a) => a.slug !== featured.slug) : all
  const latest = all.slice(0, 8)

  return (
    <>
      <Header />

      <section className="gradient-bg pt-16 pb-10 md:pt-24 md:pb-14">
        <div className="mx-auto max-w-7xl px-6">
          <Breadcrumbs
            className="mb-6"
            items={[
              { label: da ? 'Hjem' : 'Home', href: `/${locale}` },
              { label: da ? 'Artikler' : 'Articles' },
            ]}
          />
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-accent-600">
            {da ? 'PathPilo Artikler' : 'PathPilo Articles'}
          </p>
          <h1 className="max-w-3xl text-4xl font-bold text-primary-800 md:text-5xl">
            {da
              ? 'Guides til at drive og vækste din servicevirksomhed'
              : 'Guides to run and grow your service business'}
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-gray-600">
            {da
              ? 'Praktisk rådgivning om ruteplanlægning, planlægning, fakturering, leads og teamstyring — skrevet af dem, der bygger PathPilo.'
              : 'Field-tested advice on route planning, scheduling, invoicing, leads, and team management — written by the people building PathPilo.'}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 pb-20">
        <div className="mb-10">
          <CategoryPills active="all" locale={locale} />
        </div>

        {all.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
            {da ? 'Ingen artikler endnu. Tjek tilbage snart.' : 'No articles published yet. Check back soon.'}
          </p>
        ) : (
          <>
            {featured && (
              <div className="mb-12">
                <ArticleCard article={featured} size="feature" />
              </div>
            )}

            {latest.length > 1 && (
              <ArticleCarousel
                articles={latest}
                title={da ? 'Seneste artikler' : 'Latest articles'}
              />
            )}

            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((article) => (
                <ArticleCard key={article.slug} article={article} />
              ))}
            </div>
          </>
        )}
      </div>

      <Footer />
    </>
  )
}
