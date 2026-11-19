'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * The period every insights screen shares. "Year to date" is the default
 * because it is the number owners quote when someone asks how the year is
 * going, and it stays meaningful on 2 January.
 */

export type PeriodId = 'month' | 'ytd' | 'year12' | 'custom'
export type BucketUnit = 'day' | 'week' | 'month'

export interface Period {
  id: PeriodId
  from: string
  to: string
  /** Reads inside a sentence: "No visits in the last 12 months". */
  label: string
  /** Stands on its own: "Last 12 months". */
  short: string
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayISO(): string {
  return iso(new Date())
}

export function buildPeriod(id: Exclude<PeriodId, 'custom'>): Period {
  const now = new Date()
  const today = iso(now)

  if (id === 'month') {
    const month = now.toLocaleDateString('en-GB', { month: 'long' })
    return { id, from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today, label: month, short: month }
  }

  if (id === 'year12') {
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    return { id, from: iso(start), to: today, label: 'the last 12 months', short: 'Last 12 months' }
  }

  const ytd = `${now.getFullYear()} so far`
  return { id: 'ytd', from: `${now.getFullYear()}-01-01`, to: today, label: ytd, short: ytd }
}

export function customPeriod(from: string, to: string): Period {
  const label = `${formatShort(from)} – ${formatShort(to)}`
  return { id: 'custom', from, to, label, short: label }
}

function toDate(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T12:00:00`)
}

export function formatShort(isoDate: string): string {
  const d = toDate(isoDate)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** "Thu 19 Nov" — for a single day people will act on. */
export function formatDay(isoDate: string): string {
  const d = toDate(isoDate)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "2026-03" → "Mar" (or "Mar 25" once a chart spans more than one year). */
export function monthLabel(month: string, withYear = false): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, (m || 1) - 1, 1)
  return d.toLocaleDateString('en-GB', withYear ? { month: 'short', year: '2-digit' } : { month: 'short' })
}

/** Axis label for a bucket that starts on `bucket`. */
export function bucketLabel(bucket: string, unit: BucketUnit, spansYears = false): string {
  if (unit === 'month') return monthLabel(bucket.slice(0, 7), spansYears)
  return formatShort(bucket)
}

/** Tooltip heading for a bucket: the full day, the week, or the month. */
export function bucketTitle(bucket: string, unit: BucketUnit): string {
  const d = toDate(bucket)
  if (unit === 'month') return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  if (unit === 'week') return `Week of ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function spansYears(points: Array<{ bucket: string }>): boolean {
  return new Set(points.map((p) => p.bucket.slice(0, 4))).size > 1
}

const STORAGE_KEY = 'pathpilo:insights-period'

function restore(): Period | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Partial<Period>
    if (saved.id === 'month' || saved.id === 'ytd' || saved.id === 'year12') return buildPeriod(saved.id)
    if (saved.id === 'custom' && saved.from && saved.to) return customPeriod(saved.from, saved.to)
  } catch {
    /* fall back to the default */
  }
  return null
}

/**
 * The chosen period follows you from the dashboard into every stats page and
 * back, for as long as the tab is open. `ready` turns true once the saved
 * period is restored, so nothing loads the default first.
 */
export function usePeriod(): [Period, (period: Period) => void, boolean] {
  const [period, setPeriodState] = useState<Period>(() => buildPeriod('ytd'))
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const saved = restore()
    if (saved) setPeriodState(saved)
    setReady(true)
  }, [])

  const setPeriod = useCallback((next: Period) => {
    setPeriodState(next)
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* private mode — the period just won't stick */
    }
  }, [])

  return [period, setPeriod, ready]
}
