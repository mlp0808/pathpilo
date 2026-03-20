// ─────────────────────────────────────────────────────────────
//  Shared subscription utilities used by CreateSubscription
//  and SubscriptionSlideout (and any future subscription views).
// ─────────────────────────────────────────────────────────────

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

export function fmtMoney(n: number): string {
  return new Intl.NumberFormat('da-DK', {
    style: 'currency', currency: 'DKK', maximumFractionDigits: 0,
  }).format(n)
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
