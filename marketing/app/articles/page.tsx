import type { Metadata } from 'next'
import Header from '../components/Header'
import Footer from '../components/Footer'
import ArticleCard from '../components/blog/ArticleCard'
import ArticleCarousel from '../components/blog/ArticleCarousel'
import CategoryPills from '../components/blog/CategoryPills'
import { getAllArticles, getFeaturedArticle } from '../lib/blog/articles'
import { getMarketingSiteUrl } from '../lib/siteUrl'

export const metadata: Metadata = {
  title: 'Articles — Guides for service businesses',
  description:
    'Practical guides on route planning, scheduling, invoicing, and growing a mobile service business. Free advice from the PathPilo team.',
  alternates: { canonical: '/articles' },
  openGraph: {
    title: 'Guides for service businesses — PathPilo',
    description:
      'Practical guides on route planning, scheduling, invoicing, and growing a mobile service business.',
    url: `${getMarketingSiteUrl()}/articles`,
    type: 'website',
  },
}

export default function ArticlesIndexPage() {
  const all = getAllArticles()
  const featured = getFeaturedArticle()
  const rest = featured ? all.filter((a) => a.slug !== featured.slug) : all
  const latest = all.slice(0, 8)

  return (
    <>
      <Header />

      <section className="gradient-bg pt-16 pb-10 md:pt-24 md:pb-14">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-accent-600">PathPilo Articles</p>
          <h1 className="max-w-3xl text-4xl font-bold text-primary-800 md:text-5xl">
            Guides to run and grow your service business
          </h1>
          <p className="mt-4 max-w-2xl text-xl text-gray-600">
            Field-tested advice on route planning, scheduling, invoicing, leads, and team management — written by the
            people building PathPilo.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 pb-20">
        <div className="mb-10">
          <CategoryPills active="all" />
        </div>

        {all.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
            No articles published yet. Check back soon.
          </p>
        ) : (
          <>
            {featured && (
              <div className="mb-12">
                <ArticleCard article={featured} size="feature" />
              </div>
            )}

            {latest.length > 1 && <ArticleCarousel articles={latest} title="Latest articles" />}

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
