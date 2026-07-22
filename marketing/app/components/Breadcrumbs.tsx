import Link from 'next/link'
import { ChevronRightIcon, HomeIcon } from '@heroicons/react/24/outline'

export type BreadcrumbItem = {
  label: string
  /** Omit on the current (last) crumb. */
  href?: string
}

/**
 * Visible breadcrumb trail — place inside the page hero (not under the header).
 * Pass theme classes via `className`, e.g. dark hero:
 * `mb-8 text-white/50 [&_a]:hover:text-white [&_[aria-current]]:text-white/80`
 */
export default function Breadcrumbs({
  items,
  className = '',
}: {
  items: BreadcrumbItem[]
  className?: string
}) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className={`flex ${className}`}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          const isFirst = i === 0

          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && (
                <ChevronRightIcon className="h-3.5 w-3.5 flex-shrink-0 opacity-50" aria-hidden />
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-1 transition hover:opacity-100"
                >
                  {isFirst ? <HomeIcon className="h-3.5 w-3.5" aria-hidden /> : null}
                  <span>{item.label}</span>
                </Link>
              ) : (
                <span
                  className="inline-flex items-center gap-1 font-medium opacity-90"
                  aria-current={isLast ? 'page' : undefined}
                >
                  {isFirst && !item.href ? <HomeIcon className="h-3.5 w-3.5" aria-hidden /> : null}
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** Dark hero trail — white on dark backgrounds (industry / feature heroes). */
export const BREADCRUMB_ON_DARK =
  'mb-8 text-white/50 [&_a]:hover:text-white [&_[aria-current]]:text-white/85'

/** Light hero trail — muted on light/gradient heroes. */
export const BREADCRUMB_ON_LIGHT =
  'mb-6 text-gray-400 [&_a]:hover:text-primary-700 [&_[aria-current]]:text-gray-600'
