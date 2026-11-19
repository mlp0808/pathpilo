'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentType, KeyboardEvent, MouseEvent, ReactNode, SVGProps } from 'react'
import { ArrowDownRightIcon, ArrowUpRightIcon, ChevronRightIcon } from '@heroicons/react/20/solid'

export type Icon = ComponentType<SVGProps<SVGSVGElement>>

/** One colour per area of the product, so a section is recognisable at a glance. */
export const TONES = {
  green: { chip: 'bg-emerald-50 text-emerald-600', text: 'text-emerald-700', soft: 'bg-emerald-50' },
  indigo: { chip: 'bg-indigo-50 text-indigo-600', text: 'text-indigo-700', soft: 'bg-indigo-50' },
  teal: { chip: 'bg-teal-50 text-teal-600', text: 'text-teal-700', soft: 'bg-teal-50' },
  sky: { chip: 'bg-sky-50 text-sky-600', text: 'text-sky-700', soft: 'bg-sky-50' },
  violet: { chip: 'bg-violet-50 text-violet-600', text: 'text-violet-700', soft: 'bg-violet-50' },
  amber: { chip: 'bg-amber-50 text-amber-600', text: 'text-amber-700', soft: 'bg-amber-50' },
  rose: { chip: 'bg-rose-50 text-rose-600', text: 'text-rose-700', soft: 'bg-rose-50' },
  gray: { chip: 'bg-gray-100 text-gray-500', text: 'text-gray-700', soft: 'bg-gray-50' },
} as const

export type Tone = keyof typeof TONES

const CARD = 'rounded-2xl border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]'

/**
 * A card that opens a deeper page when clicked anywhere except its own links
 * and buttons. Charts inside keep their hover tooltips, which an overlay link
 * would swallow.
 */
export function Card({
  href,
  label,
  className = '',
  children,
}: {
  href?: string
  label?: string
  className?: string
  children: ReactNode
}) {
  const router = useRouter()

  if (!href) return <section className={`${CARD} ${className}`}>{children}</section>

  const open = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('a, button, input, select, textarea')) return
    if (e.metaKey || e.ctrlKey) {
      window.open(href, '_blank')
      return
    }
    router.push(href)
  }

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      router.push(href)
    }
  }

  return (
    <section
      role="link"
      tabIndex={0}
      aria-label={label}
      onClick={open}
      onKeyDown={onKey}
      onMouseEnter={() => router.prefetch(href)}
      className={`group cursor-pointer ${CARD} transition-[border-color,box-shadow] duration-200 hover:border-gray-300 hover:shadow-[0_4px_16px_-4px_rgba(16,24,40,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${className}`}
    >
      {children}
    </section>
  )
}

export function IconChip({ icon: IconCmp, tone, size = 'md' }: { icon: Icon; tone: Tone; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-9 w-9 rounded-xl'
  const glyph = size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'
  return (
    <span className={`flex shrink-0 items-center justify-center ${box} ${TONES[tone].chip}`}>
      <IconCmp className={glyph} />
    </span>
  )
}

export function CardHeader({
  icon,
  tone,
  title,
  subtitle,
  linked = false,
  right,
}: {
  icon: Icon
  tone: Tone
  title: string
  subtitle?: ReactNode
  linked?: boolean
  right?: ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <IconChip icon={icon} tone={tone} />
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-0.5 text-sm font-semibold text-gray-900">
          {title}
          {linked && (
            <ChevronRightIcon className="h-4 w-4 text-gray-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-gray-500" />
          )}
        </h2>
        {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

/** Links that read as text, not as buttons. */
export function TextAction({
  href,
  onClick,
  icon: IconCmp,
  primary = false,
  children,
}: {
  href?: string
  onClick?: () => void
  icon?: Icon
  primary?: boolean
  children: ReactNode
}) {
  const cls = `inline-flex items-center gap-1.5 rounded-md text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
    primary ? 'text-[#1f7a46] hover:text-[#145233]' : 'text-gray-500 hover:text-gray-900'
  }`
  const content = (
    <>
      {IconCmp && <IconCmp className="h-4 w-4" />}
      {children}
    </>
  )
  if (href) {
    return (
      <Link href={href} className={cls}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {content}
    </button>
  )
}

export function CardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-gray-100 px-5 py-3">
      {children}
    </div>
  )
}

export function BigNumber({ children, size = 'lg', muted = false }: { children: ReactNode; size?: 'lg' | 'md'; muted?: boolean }) {
  return (
    <p
      className={`font-bold leading-none tracking-tight tabular-nums ${muted ? 'text-gray-300' : 'text-gray-900'} ${
        size === 'lg' ? 'text-[30px] sm:text-[34px]' : 'text-[26px]'
      }`}
    >
      {children}
    </p>
  )
}

/** Change against the same period a year earlier. Hidden when there is nothing to compare with. */
export function Delta({ current, previous, suffix = 'vs last year' }: { current: number; previous: number; suffix?: string }) {
  if (!previous || previous <= 0) return null
  const ratio = current / previous
  const up = ratio >= 1
  const pct = ratio >= 10 ? `${Math.round(ratio)}×` : `${Math.round(Math.abs(ratio - 1) * 100)}%`
  return (
    <span
      className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
      }`}
    >
      {up ? <ArrowUpRightIcon className="h-3 w-3" /> : <ArrowDownRightIcon className="h-3 w-3" />}
      {pct} <span className="font-medium opacity-75">{suffix}</span>
    </span>
  )
}

export interface LegendItem {
  label: string
  color: string
  kind?: 'bar' | 'line' | 'dash'
}

export function ChartLegend({ items, className = '' }: { items: LegendItem[]; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-gray-500 ${className}`}>
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          {item.kind === 'line' || item.kind === 'dash' ? (
            <span
              className="inline-block h-0 w-3.5 border-t-2"
              style={{ borderColor: item.color, borderStyle: item.kind === 'dash' ? 'dashed' : 'solid' }}
            />
          ) : (
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: item.color }} />
          )}
          {item.label}
        </span>
      ))}
    </div>
  )
}

export interface TooltipRow {
  key: string
  label: string
  color: string
  format?: (n: number) => string
  hideZero?: boolean
}

/**
 * Tooltip body for every chart. Passed as an element so recharts injects
 * `active` and `payload`; the hovered data point carries every field.
 */
export function ChartTooltip({
  active,
  payload,
  title,
  rows,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: Record<string, unknown> }>
  title: (point: Record<string, unknown>) => string
  rows: TooltipRow[]
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  const visible = rows.filter((r) => !(r.hideZero && !Number(point[r.key])))
  return (
    <div className="min-w-[160px] rounded-xl border border-gray-200 bg-white/95 px-3 py-2.5 text-xs shadow-lg backdrop-blur">
      <p className="mb-1.5 font-semibold text-gray-900">{title(point)}</p>
      <div className="space-y-1">
        {visible.map((row) => {
          const value = Number(point[row.key]) || 0
          return (
            <div key={row.key} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-gray-500">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: row.color }} />
                {row.label}
              </span>
              <span className="font-semibold tabular-nums text-gray-900">
                {row.format ? row.format(value) : value.toLocaleString('en-GB')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const GHOST_BARS = [28, 42, 36, 54, 47, 63, 58, 72, 66, 80, 74, 88]

/**
 * What a chart will look like once there is data, with one sentence on what
 * fills it. Empty accounts see the shape of the product instead of zeros.
 */
export function GhostChart({
  variant = 'bars',
  message,
  action,
  className = 'h-full',
}: {
  variant?: 'bars' | 'area'
  message: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-0 overflow-hidden px-1" aria-hidden>
        {variant === 'bars' ? (
          <div className="flex h-full items-end gap-1.5 sm:gap-2">
            {GHOST_BARS.map((h, i) => (
              <div key={i} className="flex-1 rounded-t-md bg-gray-100" style={{ height: `${h}%` }} />
            ))}
          </div>
        ) : (
          <svg viewBox="0 0 120 40" preserveAspectRatio="none" className="h-full w-full">
            <path d="M0 36 C 15 34, 25 30, 40 27 S 65 20, 80 15 S 105 7, 120 4 L 120 40 L 0 40 Z" fill="#f3f4f6" />
            <path d="M0 36 C 15 34, 25 30, 40 27 S 65 20, 80 15 S 105 7, 120 4" fill="none" stroke="#e5e7eb" strokeWidth="1" />
          </svg>
        )}
      </div>
      <div className="relative flex h-full flex-col items-center justify-center bg-gradient-to-t from-white/80 via-white/70 to-white/30 px-6 text-center">
        <p className="max-w-[300px] text-[13px] leading-snug text-gray-600">{message}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  )
}

export function AttentionRow({
  href,
  icon,
  tone,
  title,
  detail,
  value,
}: {
  href: string
  icon: Icon
  tone: Tone
  title: string
  detail: string
  value?: string
}) {
  return (
    <Link
      href={href}
      className="group/row flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
    >
      <IconChip icon={icon} tone={tone} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-gray-900">{title}</span>
        <span className="block truncate text-xs text-gray-500">{detail}</span>
      </span>
      {value && <span className="shrink-0 text-[13px] font-semibold tabular-nums text-gray-700">{value}</span>}
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover/row:translate-x-0.5 group-hover/row:text-gray-500" />
    </Link>
  )
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11px] font-semibold uppercase tracking-wider text-gray-400 ${className}`}>{children}</p>
}

/** Section card for the stats pages. */
export function Panel({
  id,
  title,
  hint,
  right,
  className = '',
  bodyClassName = 'p-5',
  children,
}: {
  id?: string
  title?: string
  hint?: ReactNode
  right?: ReactNode
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <section id={id} className={`flex scroll-mt-24 flex-col ${CARD} ${className}`}>
      {title && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
            {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className={`flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  )
}

/** A labelled number inside a panel — never a free-floating box of its own. */
export function Figure({
  label,
  value,
  hint,
  href,
  accent,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  href?: string
  accent?: string
}) {
  const body = (
    <>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-bold tracking-tight tabular-nums ${accent || 'text-gray-900'}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-gray-400">{hint}</p>}
    </>
  )
  if (href) {
    return (
      <Link href={href} className="-m-2 block min-w-0 rounded-xl p-2 transition-colors hover:bg-gray-50">
        {body}
      </Link>
    )
  }
  return <div className="min-w-0">{body}</div>
}

/** One line in a list on a stats page: who/what, a detail, a value, and where it leads. */
export function ListRow({
  href,
  title,
  detail,
  value,
  valueHint,
  badge,
}: {
  href?: string
  title: ReactNode
  detail?: ReactNode
  value?: ReactNode
  valueHint?: ReactNode
  badge?: ReactNode
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-gray-900">{title}</span>
          {badge}
        </span>
        {detail && <span className="block truncate text-xs text-gray-500">{detail}</span>}
      </span>
      {(value != null || valueHint) && (
        <span className="shrink-0 text-right">
          {value != null && <span className="block text-[13px] font-semibold tabular-nums text-gray-900">{value}</span>}
          {valueHint && <span className="block text-[11px] text-gray-400">{valueHint}</span>}
        </span>
      )}
      {href && <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover/row:translate-x-0.5" />}
    </>
  )
  const cls = 'group/row flex items-center gap-3 px-5 py-2.5'
  return href ? (
    <li>
      <Link href={href} className={`${cls} transition-colors hover:bg-gray-50`}>
        {body}
      </Link>
    </li>
  ) : (
    <li className={cls}>{body}</li>
  )
}

export function EmptyNote({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-8 text-center">
      <p className="max-w-[280px] text-[13px] text-gray-500">{children}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-gray-100 ${className}`} />
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline-offset-2 hover:underline">
          Try again
        </button>
      )}
    </div>
  )
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
