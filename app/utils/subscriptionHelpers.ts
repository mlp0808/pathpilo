// ─────────────────────────────────────────────────────────────
//  Shared subscription utilities used by CreateSubscription
//  and SubscriptionSlideout (and any future subscription views).
// ─────────────────────────────────────────────────────────────

import { formatMoney as formatMoneyFromCountry } from '../config/countryRules'

/** Local calendar date YYYY-MM-DD (avoids UTC shifting the day). */
export function todayYmdLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ymdFromLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** First visit on or after anchor, matching weekly/monthly rules (same idea as API first occurrence). */
export function firstOccurrenceOnOrAfterAnchor(
  anchorYmd: string,
  recurrenceType: 'weekly' | 'monthly',
  dayOfWeek: number,
  intervalWeeks: number,
  dayOfMonth: number,
  intervalMonths: number,
): string {
  if (!anchorYmd.trim()) return ''
  if (recurrenceType === 'weekly') {
    const ds = buildWeeklyForecast(anchorYmd, dayOfWeek, intervalWeeks, 1)
    return ds[0] ? ymdFromLocalDate(ds[0]) : ''
  }
  const ds = buildMonthlyForecast(anchorYmd, dayOfMonth, intervalMonths, 1)
  return ds[0] ? ymdFromLocalDate(ds[0]) : ''
}

export const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

// ── forecast date builders ────────────────────────────────────

/** Weekly: mirrors server-side calculateFirstOccurrence (first occurrence
 *  is on or after the starting date, when weekday matches). */
export function buildWeeklyForecast(
  startingDate: string,
  dayOfWeek: number,
  intervalWeeks: number,
  count = 16,
): Date[] {
  if (!startingDate) return []
  const [y, m, d] = startingDate.split('-').map(Number)
  if (!y || !m || !d) return []
  const start = new Date(y, m - 1, d)
  const daysToAdd = (dayOfWeek - start.getDay() + 7) % 7
  const base = new Date(start)
  base.setDate(start.getDate() + daysToAdd)
  const dates: Date[] = []
  const cur = new Date(base)
  for (let i = 0; i < count; i++) {
    dates.push(new Date(cur))
    cur.setDate(cur.getDate() + intervalWeeks * 7)
  }
  return dates
}

/** Monthly: mirrors server-side calculateFirstMonthlyOccurrence. */
export function buildMonthlyForecast(
  startingDate: string,
  dayOfMonth: number,
  intervalMonths: number,
  count = 16,
): Date[] {
  if (!startingDate || !dayOfMonth) return []
  const [y, m, d] = startingDate.split('-').map(Number)
  if (!y || !m || !d) return []
  let baseYear = y
  let baseMonth = m - 1
  if (dayOfMonth < d) {
    baseMonth += 1
    if (baseMonth > 11) { baseMonth = 0; baseYear++ }
  }
  const dates: Date[] = []
  for (let i = 0; i < count; i++) {
    const totalMonths = baseMonth + i * intervalMonths
    const yr = baseYear + Math.floor(totalMonths / 12)
    const mo = totalMonths % 12
    const lastDay = new Date(yr, mo + 1, 0).getDate()
    dates.push(new Date(yr, mo, Math.min(dayOfMonth, lastDay)))
  }
  return dates
}

// ── formatting helpers ────────────────────────────────────────

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

/** Formats amounts using the active company’s currency (via country code). */
export function fmtMoney(n: number, countryCode?: string | null): string {
  return formatMoneyFromCountry(n, countryCode)
}

// ── shared types ──────────────────────────────────────────────

export interface SelectedService {
  id: number
  title: string
  price: number
  duration_minutes: number
  customPrice: string
  customDuration: number
  isCustom?: boolean
  customTitle?: string
}

export interface ScheduleState {
  startingDate: string
  recurrenceType: 'weekly' | 'monthly'
  dayOfWeek: number
  intervalWeeks: number
  customInterval: string
  dayOfMonth: number
  intervalMonths: number
}
