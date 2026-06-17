import Link from 'next/link'
import { ArrowRightIcon } from '@heroicons/react/24/outline'
import type { ArticleSummary } from '../../lib/blog/types'
import { resolveCategory } from '../../lib/blog/taxonomy'
import { readingTimeLabel } from '../../lib/blog/format'

/**
 * "Read next" — a compact bullet list of closely-related articles, shown at
 * the end of an article body.
 */
export default function RelatedList({
  articles,
  title = 'Read next',
}: {
  articles: ArticleSummary[]
  title?: string
}) {
  if (!articles || articles.length === 0) return null

  return (
    <aside className="my-10 rounded-2xl border border-gray-200 bg-gray-50/60 p-6">
      <h2 className="mb-4 text-lg font-bold text-primary-800">{title}</h2>
      <ul className="space-y-1">
        {articles.map((article) => {
          const category = resolveCategory(article.category)
          return (
            <li key={article.slug}>
              <Link
                href={`/articles/${article.slug}`}
                className="group flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white"
              >
                <span
                  className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ background: category.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-primary-800 transition-colors group-hover:text-accent-700">
                    {article.title}
                  </span>
                  <span className="ml-2 text-sm text-gray-400">· {readingTimeLabel(article.readingMinutes)}</span>
                </span>
                <ArrowRightIcon className="mt-1 h-4 w-4 flex-shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-accent-600" />
              </Link>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
