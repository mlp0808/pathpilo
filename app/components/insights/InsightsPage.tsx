'use client'

import { useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeftIcon,
  ArrowPathRoundedSquareIcon,
  BanknotesIcon,
  ClipboardDocumentListIcon,
  MegaphoneIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import PeriodSelector from './PeriodSelector'
import { IconChip, Skeleton, type Icon, type Tone } from './ui'
import type { Period } from './period'

export type InsightsSection = 'earnings' | 'jobs' | 'clients' | 'subscriptions' | 'sales'

const SECTIONS: Array<{ key: InsightsSection; label: string; icon: Icon; tone: Tone }> = [
  { key: 'earnings', label: 'Earnings', icon: BanknotesIcon, tone: 'green' },
  { key: 'jobs', label: 'Jobs', icon: ClipboardDocumentListIcon, tone: 'indigo' },
  { key: 'clients', label: 'Clients', icon: UserGroupIcon, tone: 'teal' },
  { key: 'subscriptions', label: 'Subscriptions', icon: ArrowPathRoundedSquareIcon, tone: 'sky' },
  { key: 'sales', label: 'Sales', icon: MegaphoneIcon, tone: 'violet' },
]

export function useCompanyBase(): string {
  const params = useParams()
  return `/${(params?.company as string) || ''}`
}

/**
 * Dashboard rows link to a section of a stats page (#still-open, #unpaid…).
 * The section only exists once the numbers have loaded, so scroll then.
 */
export function useScrollToHash(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    const id = window.location.hash.slice(1)
    if (!id) return
    const timer = window.setTimeout(() => {
      const el = document.getElementById(id)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.classList.add('ring-2', 'ring-accent-400')
      window.setTimeout(() => el.classList.remove('ring-2', 'ring-accent-400'), 1800)
    }, 120)
    return () => window.clearTimeout(timer)
  }, [ready])
}

export function InsightsPage({
  section,
  title,
  subtitle,
  actions,
  period,
  onPeriod,
  children,
}: {
  section: InsightsSection
  title: string
  subtitle: string
  actions?: ReactNode
  period?: Period
  onPeriod?: (period: Period) => void
  children: ReactNode
}) {
  const base = useCompanyBase()
  const current = SECTIONS.find((s) => s.key === section) || SECTIONS[0]

  return (
    <div className="space-y-4 pb-8 sm:space-y-5">
      <nav
        aria-label="Stats"
        className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Link
          href={`${base}/dashboard`}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-900/[0.04] hover:text-gray-900"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Dashboard
        </Link>
        <span className="mx-1.5 h-4 w-px shrink-0 bg-gray-200" aria-hidden />
        {SECTIONS.map((s) => {
          const active = s.key === section
          return (
            <Link
              key={s.key}
              href={`${base}/insights/${s.key}`}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-900/5'
                  : 'text-gray-500 hover:bg-gray-900/[0.04] hover:text-gray-900'
              }`}
            >
              {s.label}
            </Link>
          )
        })}
      </nav>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <IconChip icon={current.icon} tone={current.tone} />
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">{title}</h1>
            <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
            {actions && <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">{actions}</div>}
          </div>
        </div>
        {period && onPeriod && <PeriodSelector period={period} onChange={onPeriod} />}
      </header>

      {children}
    </div>
  )
}

/** Same shape as every stats page: a wide chart beside a column of figures, then two lists. */
export function InsightsSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <Skeleton className="h-[400px] lg:col-span-2" />
        <Skeleton className="h-[400px]" />
      </div>
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <Skeleton className="h-[280px]" />
        <Skeleton className="h-[280px]" />
      </div>
    </div>
  )
}

/** The big chart panel that opens every stats page. */
export function HeroPanel({
  eyebrow,
  figure,
  sub,
  right,
  legend,
  children,
  className = '',
}: {
  eyebrow: ReactNode
  figure: ReactNode
  sub?: ReactNode
  right?: ReactNode
  legend?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`flex flex-col rounded-2xl border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}
    >
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{eyebrow}</div>
          {right}
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            {figure}
            {sub && <p className="mt-2 text-xs text-gray-500">{sub}</p>}
          </div>
          {legend}
        </div>
      </div>
      <div className="mt-4 h-64 px-2 pb-4 sm:h-72 sm:px-4">{children}</div>
    </section>
  )
}
