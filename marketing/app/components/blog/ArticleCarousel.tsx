'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon } from '@heroicons/react/24/outline'
import type { ArticleSummary } from '../../lib/blog/types'
import { resolveCategory } from '../../lib/blog/taxonomy'
import { readingTimeLabel } from '../../lib/blog/format'
import CoverImage from './CoverImage'

/**
 * Horizontal, image-rich carousel ("More articles"). Uses native scroll-snap
 * plus arrow buttons — no external slider dependency.
 */
export default function ArticleCarousel({
  articles,
  title = 'More articles',
  subtitle,
}: {
  articles: ArticleSummary[]
  title?: string
  subtitle?: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)

  if (!articles || articles.length === 0) return null

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current
    if (!el) return
    const amount = Math.min(el.clientWidth * 0.9, 540)
    el.scrollBy({ left: dir * amount, behavior: 'smooth' })
  }

  return (
    <section className="my-12">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-primary-800">{title}</h2>
          {subtitle && <p className="mt-1 text-gray-500">{subtitle}</p>}
        </div>
        <div className="hidden gap-2 sm:flex">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Previous"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:border-accent-400 hover:text-accent-700"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Next"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:border-accent-400 hover:text-accent-700"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {articles.map((article) => {
          const category = resolveCategory(article.category)
          return (
            <Link
              key={article.slug}
              href={`/articles/${article.slug}`}
              className="group w-[280px] flex-shrink-0 snap-start overflow-hidden rounded-2xl border border-gray-200 bg-white transition hover:shadow-lg sm:w-[320px]"
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
              <div className="p-5">
                <h3 className="line-clamp-2 text-base font-bold leading-snug text-primary-800 transition-colors group-hover:text-accent-700">
                  {article.title}
                </h3>
                <div className="mt-3 flex items-center gap-1 text-xs text-gray-400">
                  <ClockIcon className="h-3.5 w-3.5" /> {readingTimeLabel(article.readingMinutes)}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
