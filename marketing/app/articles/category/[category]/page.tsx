import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Header from '../../../components/Header'
import Footer from '../../../components/Footer'
import ArticleCard from '../../../components/blog/ArticleCard'
import CategoryPills from '../../../components/blog/CategoryPills'
import { getArticlesByCategory } from '../../../lib/blog/articles'
import { BLOG_CATEGORIES, getCategory } from '../../../lib/blog/taxonomy'
import { getMarketingSiteUrl } from '../../../lib/siteUrl'

export function generateStaticParams() {
  return BLOG_CATEGORIES.map((c) => ({ category: c.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>
}): Promise<Metadata> {
  const { category } = await params
  const cat = getCategory(category)
  if (!cat) return { title: 'Category not found' }
  return {
    title: `${cat.label} — PathPilo Articles`,
    description: cat.description,
    alternates: { canonical: `/articles/category/${cat.slug}` },
    openGraph: {
      title: `${cat.label} — PathPilo Articles`,
      description: cat.description,
      url: `${getMarketingSiteUrl()}/articles/category/${cat.slug}`,
      type: 'website',
    },
  }
}

export default async function CategoryArchivePage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category } = await params
  const cat = getCategory(category)
  if (!cat) notFound()

  const articles = getArticlesByCategory(cat.slug)

  return (
    <>
      <Header />

      <section className="gradient-bg pt-16 pb-10 md:pt-24 md:pb-14">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest" style={{ color: cat.color }}>
            Category
          </p>
          <h1 className="text-4xl font-bold text-primary-800 md:text-5xl">{cat.label}</h1>
          <p className="mt-4 max-w-2xl text-xl text-gray-600">{cat.description}</p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 pb-20">
        <div className="mb-10">
          <CategoryPills active={cat.slug} />
        </div>

        {articles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
            No articles in this category yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <ArticleCard key={article.slug} article={article} />
            ))}
          </div>
        )}
      </div>

      <Footer />
    </>
  )
}
