'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { ActivityEvent, DayCell } from '../_lib/types'
import { eventCategory, eventDetail, eventLabel } from '../_lib/events'

// ── Formatting ──────────────────────────────────────────────────────────────

export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return 'never'
  const ms = Date.now() - new Date(value).getTime()
  if (ms < 0) return 'just now'
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo} mo ago`
  return `${Math.floor(mo / 12)} y ago`
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function pct(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return '—'
  return `${Math.round(rate * 100)}%`
}

// ── Building blocks ─────────────────────────────────────────────────────────

export function Card({
  title, subtitle, actions, children, className = '', bodyClassName = '',
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-gray-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName || 'p-5'}>{children}</div>
    </section>
  )
}

export function Kpi({ label, value, hint, accent = 'text-gray-900' }: {
  label: string
  value: ReactNode
  hint?: ReactNode
  accent?: string
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

export function Chip({ className, children, title }: { className: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${className}`}>
      {children}
    </span>
  )
}

export function Spinner({ className = 'py-16' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
    </div>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-gray-400">{children}</div>
}

export function Segmented<T extends string | number>({ value, options, onChange }: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            o.value === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// ── Heat colours ────────────────────────────────────────────────────────────

/**
 * Green intensity scales with the number of real actions that day.
 * A day with only logins / page views gets the faintest tint, so "looked
 * around" and "did work" are visibly different.
 */
export function heatClass(actions: number, events: number, max: number): string {
  if (actions <= 0) return events > 0 ? 'bg-emerald-100' : 'bg-gray-100'
  const ref = Math.max(4, max)
  const r = Math.log(actions + 1) / Math.log(ref + 1)
  if (r < 0.25) return 'bg-emerald-200'
  if (r < 0.5) return 'bg-emerald-300'
  if (r < 0.75) return 'bg-emerald-500'
  return 'bg-emerald-700'
}

export function HeatLegend() {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
      <span>None</span>
      <span className="h-3 w-3 rounded-[3px] bg-gray-100" />
      <span className="h-3 w-3 rounded-[3px] bg-emerald-100" title="Only logged in / looked around" />
      <span className="h-3 w-3 rounded-[3px] bg-emerald-200" />
      <span className="h-3 w-3 rounded-[3px] bg-emerald-300" />
      <span className="h-3 w-3 rounded-[3px] bg-emerald-500" />
      <span className="h-3 w-3 rounded-[3px] bg-emerald-700" />
      <span>Many actions</span>
    </div>
  )
}

export function HeatStrip({ cells, max, size = 'h-3 w-3' }: {
  cells: Array<{ a: number; e: number }>
  max?: number
  size?: string
}) {
  const m = max ?? Math.max(0, ...cells.map((c) => c.a))
  return (
    <div className="flex gap-[2px]">
      {cells.map((c, i) => (
        <span key={i} className={`${size} rounded-[3px] ${heatClass(c.a, c.e, m)}`} />
      ))}
    </div>
  )
}

/** GitHub-style calendar: one column per week, Monday on top. */
export function DayCalendar({ daily }: { daily: DayCell[] }) {
  if (!daily.length) return null
  const max = Math.max(0, ...daily.map((d) => d.actions))
  const first = new Date(`${daily[0].day}T12:00:00`)
  const offset = (first.getDay() + 6) % 7
  const padded: Array<DayCell | null> = [...Array(offset).fill(null), ...daily]
  const weeks: Array<Array<DayCell | null>> = []
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7))

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px]">
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }).map((_, di) => {
              const d = w[di]
              if (!d) return <span key={di} className="h-3.5 w-3.5" />
              return (
                <span
                  key={di}
                  title={`${formatDate(d.day)} · ${d.actions} actions · ${d.sessions} sessions`}
                  className={`h-3.5 w-3.5 rounded-[3px] ${heatClass(d.actions, d.events, max)}`}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Timeline ────────────────────────────────────────────────────────────────

function dayHeading(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86400000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function Timeline({
  events, showUser = true, showCompany = true, nextBefore, onLoadMore, loadingMore,
}: {
  events: ActivityEvent[]
  showUser?: boolean
  showCompany?: boolean
  nextBefore?: string | null
  onLoadMore?: () => void
  loadingMore?: boolean
}) {
  if (!events.length) return <Empty>No activity recorded yet.</Empty>

  const groups: Array<{ day: string; items: ActivityEvent[] }> = []
  for (const e of events) {
    const key = new Date(e.at).toDateString()
    const last = groups[groups.length - 1]
    if (last && last.day === key) last.items.push(e)
    else groups.push({ day: key, items: [e] })
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.day}>
          <p className="sticky top-0 z-[1] mb-2 bg-white/95 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 backdrop-blur">
            {dayHeading(g.items[0].at)}
          </p>
          <ol className="relative ml-1.5 border-l border-gray-100">
            {g.items.map((e) => {
              const cat = eventCategory(e.event)
              const detail = eventDetail(e)
              const isSession = e.event === 'session.started' || e.event === 'auth.login'
              return (
                <li key={e.id} className={`relative pl-5 ${isSession ? 'py-2' : 'py-1.5'}`}>
                  <span className={`absolute -left-[5px] top-[11px] h-2.5 w-2.5 rounded-full ring-2 ring-white ${cat.dot}`} />
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="w-11 shrink-0 text-xs tabular-nums text-gray-400">{formatTime(e.at)}</span>
                    <span className={`text-sm ${isSession ? 'font-semibold text-sky-700' : 'font-medium text-gray-900'}`}>
                      {eventLabel(e.event)}
                    </span>
                    {detail && <span className="min-w-0 truncate text-sm text-gray-500">{detail}</span>}
                    {e.source === 'overwatch' && <Chip className="bg-amber-50 text-amber-700 ring-amber-200">Overwatch</Chip>}
                    {e.source === 'backfill' && <Chip className="bg-gray-50 text-gray-400 ring-gray-200" title="Imported from existing data">history</Chip>}
                  </div>
                  {(showUser && e.user) || (showCompany && e.company) ? (
                    <div className="ml-[52px] mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-400">
                      {showUser && e.user && (
                        <Link href={`/admin/people/u-${e.user.id}`} className="hover:text-gray-700 hover:underline">{e.user.name}</Link>
                      )}
                      {showCompany && e.company && (
                        <Link href={`/admin/companies/${e.company.id}`} className="hover:text-gray-700 hover:underline">{e.company.name}</Link>
                      )}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </div>
      ))}
      {nextBefore && onLoadMore && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load older activity'}
          </button>
        </div>
      )}
    </div>
  )
}
