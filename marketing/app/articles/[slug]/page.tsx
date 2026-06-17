import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import { ClockIcon, CalendarIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import CoverImage from '../../components/blog/CoverImage'
import TableOfContents from '../../components/blog/TableOfContents'
import RelatedList from '../../components/blog/RelatedList'
import ArticleCarousel from '../../components/blog/ArticleCarousel'
import { CTABox } from '../../components/blog/content'
import { mdxComponents } from '../../components/blog/mdx-components'
import {
  getArticleBySlug,
  getArticleSlugs,
  getRelatedArticles,
  getMoreArticles,
} from '../../lib/blog/articles'
import { resolveCategory, tagLabel } from '../../lib/blog/taxonomy'
import { formatArticleDate, readingTimeLabel } from '../../lib/blog/format'
import { getMarketingSiteUrl } from '../../lib/siteUrl'

export function generateStaticParams() {
  return getArticleSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const article = getArticleBySlug(slug)
  if (!article) return { title: 'Article not found' }

  const fm = article.frontmatter
  const url = `${getMarketingSiteUrl()}/articles/${slug}`
  const title = fm.seoTitle || fm.title
  const description = fm.seoDescription || fm.description

  return {
    title,
    description,
    alternates: { canonical: `/articles/${slug}` },
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      publishedTime: fm.date,
      modifiedTime: fm.updated || fm.date,
      authors: fm.author ? [fm.author] : undefined,
      images: fm.image ? [{ url: fm.image }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: fm.image ? [fm.image] : undefined,
    },
  }
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = getArticleBySlug(slug)
  if (!article) notFound()

  const fm = article.frontmatter
  const category = resolveCategory(fm.category)
  const related = getRelatedArticles(slug, 4)
  const more = getMoreArticles(slug, 8)
  const siteUrl = getMarketingSiteUrl()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: fm.title,
    description: fm.description,
    datePublished: fm.date,
    dateModified: fm.updated || fm.date,
    author: { '@type': fm.author ? 'Person' : 'Organization', name: fm.author || 'PathPilo' },
    publisher: {
      '@type': 'Organization',
      name: 'PathPilo',
      logo: { '@type': 'ImageObject', url: `${siteUrl}/images/og/og-image.png` },
    },
    image: fm.image ? `${siteUrl}${fm.image}` : `${siteUrl}/images/og/og-image.png`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${siteUrl}/articles/${slug}` },
    articleSection: category.label,
    keywords: (fm.tags || []).map(tagLabel).join(', '),
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Articles', item: `${siteUrl}/articles` },
      {
        '@type': 'ListItem',
        position: 2,
        name: category.label,
        item: `${siteUrl}/articles/category/${category.slug}`,
      },
      { '@type': 'ListItem', position: 3, name: fm.title, item: `${siteUrl}/articles/${slug}` },
    ],
  }

  return (
    <>
      <Header />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <article>
        {/*
          Header gradient. Uses the same grid as the body so the text column
          aligns exactly with the article body on large screens.
        */}
        <header className="gradient-bg">
          <div className="mx-auto max-w-6xl px-6 pt-16 pb-14 md:pt-20 md:pb-16">
            <div className="lg:grid lg:grid-cols-[1fr_260px] lg:gap-12">
              <div>
                <nav className="mb-7 flex items-center gap-1.5 text-sm text-gray-400" aria-label="Breadcrumb">
                  <Link href="/articles" className="transition hover:text-primary-700">
                    Articles
                  </Link>
                  <ChevronRightIcon className="h-3.5 w-3.5 flex-shrink-0" />
                  <Link href={`/articles/category/${category.slug}`} className="transition hover:text-primary-700">
                    {category.label}
                  </Link>
                </nav>

                <Link
                  href={`/articles/category/${category.slug}`}
                  className="inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest text-white"
                  style={{ background: category.color }}
                >
                  {category.label}
                </Link>

                <h1 className="mt-4 text-3xl font-extrabold leading-[1.1] tracking-tight text-primary-800 md:text-[42px]">
                  {fm.title}
                </h1>
                <p className="mt-5 text-lg leading-relaxed text-gray-600 md:text-xl">{fm.description}</p>

                <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-400">
                  {fm.author && (
                    <span className="font-semibold text-gray-600">
                      {fm.author}
                      {fm.authorRole && (
                        <span className="ml-1.5 font-normal text-gray-400">{fm.authorRole}</span>
                      )}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarIcon className="h-4 w-4" />
                    {formatArticleDate(fm.date)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <ClockIcon className="h-4 w-4" />
                    {readingTimeLabel(article.readingMinutes)}
                  </span>
                </div>
              </div>
              {/* Right column intentionally empty — keeps text aligned with body */}
            </div>
          </div>
        </header>

        {/*
          Body grid. Cover image sits as the very first element inside the article
          column, so it's naturally the same width as the prose and aligns with the
          header text above.
        */}
        <div className="mx-auto max-w-6xl px-6 pt-10 pb-20">
          <div className="lg:grid lg:grid-cols-[1fr_260px] lg:gap-12">

            {/* Article column */}
            <div id="article-body" className="min-w-0">

              {fm.image && (
                <CoverImage
                  src={fm.image}
                  alt={fm.imageAlt || fm.title}
                  color={category.color}
                  label={category.label}
                  className="mb-12 aspect-[16/9] w-full rounded-3xl border border-gray-100 shadow-sm"
                />
              )}

              <MDXRemote
                source={article.content}
                components={mdxComponents}
                options={{
                  parseFrontmatter: false,
                  blockJS: false,
                  mdxOptions: {
                    remarkPlugins: [remarkGfm],
                    rehypePlugins: [rehypeSlug],
                  },
                }}
              />

              {fm.tags && fm.tags.length > 0 && (
                <div className="mt-12 flex flex-wrap gap-2 border-t border-gray-100 pt-8">
                  {fm.tags.map((t) => (
                    <Link
                      key={t}
                      href={`/articles/tag/${t}`}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-500 transition hover:border-accent-400 hover:text-accent-700"
                    >
                      #{tagLabel(t)}
                    </Link>
                  ))}
                </div>
              )}

              <CTABox />
              <RelatedList articles={related} />
            </div>

            {/* TOC sidebar */}
            <aside className="hidden lg:block">
              <div className="sticky top-28">
                <TableOfContents />
              </div>
            </aside>

          </div>
        </div>
      </article>

      <div className="border-t border-gray-100 bg-gray-50/50">
        <div className="mx-auto max-w-6xl px-6">
          <ArticleCarousel articles={more} title="More articles" />
        </div>
      </div>

      <Footer />
    </>
  )
}
