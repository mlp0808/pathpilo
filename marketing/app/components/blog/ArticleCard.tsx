import Link from 'next/link'
import { ClockIcon } from '@heroicons/react/24/outline'
import type { ArticleSummary } from '../../lib/blog/types'
import { resolveCategory } from '../../lib/blog/taxonomy'
import { formatArticleDate, readingTimeLabel } from '../../lib/blog/format'
import CoverImage from './CoverImage'

/**
 * Standard article card used in archives + the listing grid.
 * `size="feature"` renders a larger horizontal hero card.
 */
export default function ArticleCard({
  article,
  size = 'default',
}: {
  article: ArticleSummary
  size?: 'default' | 'feature'
}) {
  const category = resolveCategory(article.category)
  const href = `/articles/${article.slug}`

  if (size === 'feature') {
    return (
      <Link
        href={href}
        className="group grid grid-cols-1 overflow-hidden rounded-3xl border border-gray-200 bg-white transition hover:shadow-xl md:grid-cols-2"
      >
        <div className="relative aspect-[16/10] md:aspect-auto">
          <CoverImage
            src={article.image}
            alt={article.imageAlt || article.title}
            color={category.color}
            label={category.label}
            className="h-full w-full"
          />
        </div>
        <div className="flex flex-col justify-center p-8">
          <span
            className="mb-3 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide text-white"
            style={{ background: category.color }}
          >
            {category.label}
          </span>
          <h3 className="text-2xl font-bold leading-tight text-primary-800 transition-colors group-hover:text-accent-700">
            {article.title}
          </h3>
          <p className="mt-3 line-clamp-3 text-gray-600">{article.description}</p>
          <div className="mt-4 flex items-center gap-3 text-sm text-gray-400">
            <span>{formatArticleDate(article.date)}</span>
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="h-4 w-4" /> {readingTimeLabel(article.readingMinutes)}
            </span>
          </div>
        </div>
      </Link>
    )
  }

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition hover:shadow-lg"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <CoverImage
          src={article.image}
          alt={article.imageAlt || article.title}
          color={category.color}
          label={category.label}
          className="h-full w-full transition-transform duration-500 group-hover:scale-105"
        />
        <span
          className="absolute left-3 top-3 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
          style={{ background: category.color }}
        >
          {category.label}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold leading-snug text-primary-800 transition-colors group-hover:text-accent-700">
          {article.title}
        </h3>
        <p className="mt-2 line-clamp-2 flex-1 text-sm text-gray-600">{article.description}</p>
        <div className="mt-4 flex items-center gap-3 text-xs text-gray-400">
          <span>{formatArticleDate(article.date)}</span>
          <span className="inline-flex items-center gap-1">
            <ClockIcon className="h-3.5 w-3.5" /> {readingTimeLabel(article.readingMinutes)}
          </span>
        </div>
      </div>
    </Link>
  )
}
