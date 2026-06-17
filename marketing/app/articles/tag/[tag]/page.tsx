import type { Metadata } from 'next'
import Header from '../../../components/Header'
import Footer from '../../../components/Footer'
import ArticleCard from '../../../components/blog/ArticleCard'
import { getAllUsedTags, getArticlesByTag } from '../../../lib/blog/articles'
import { tagLabel } from '../../../lib/blog/taxonomy'
import { getMarketingSiteUrl } from '../../../lib/siteUrl'

export function generateStaticParams() {
  return getAllUsedTags().map((tag) => ({ tag }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>
}): Promise<Metadata> {
  const { tag } = await params
  const label = tagLabel(tag)
  const description = `Articles about ${label} for service businesses — guides and tips from PathPilo.`
  return {
    title: `${label} articles — PathPilo`,
    description,
    alternates: { canonical: `/articles/tag/${tag}` },
    openGraph: {
      title: `${label} articles — PathPilo`,
      description,
      url: `${getMarketingSiteUrl()}/articles/tag/${tag}`,
      type: 'website',
    },
  }
}

export default async function TagArchivePage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params
  const label = tagLabel(tag)
  const articles = getArticlesByTag(tag)

  return (
    <>
      <Header />

      <section className="gradient-bg pt-16 pb-10 md:pt-24 md:pb-14">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-accent-600">Tag</p>
          <h1 className="text-4xl font-bold text-primary-800 md:text-5xl">#{label}</h1>
          <p className="mt-4 max-w-2xl text-xl text-gray-600">
            Every article tagged <span className="font-semibold text-primary-800">{label}</span>.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 pb-20">
        {articles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
            No articles with this tag yet.
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
