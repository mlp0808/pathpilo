import Link from 'next/link'
import { ChevronRightIcon, HomeIcon } from '@heroicons/react/24/outline'

export type BreadcrumbItem = {
  label: string
  /** Omit on the current (last) crumb. */
  href?: string
}

/**
 * Visible breadcrumb trail — mirrors JSON-LD BreadcrumbList on the same page.
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
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-gray-400">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          const isFirst = i === 0

          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRightIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" aria-hidden />}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-1 transition hover:text-primary-700"
                >
                  {isFirst ? <HomeIcon className="h-3.5 w-3.5" aria-hidden /> : null}
                  <span>{item.label}</span>
                </Link>
              ) : (
                <span
                  className={`inline-flex items-center gap-1 ${isLast ? 'font-medium text-gray-600' : ''}`}
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
