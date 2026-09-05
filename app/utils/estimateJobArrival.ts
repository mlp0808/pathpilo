/**
 * Estimate clock arrival for a job from day start + route order + drive legs
 * + prior job durations (same model the planner uses when saving daily_routes).
 */

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

export function weekdayIndexFromDateStr(dateStr: string): number {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`)
  const js = d.getDay() // 0=Sun … 6=Sat
  return js === 0 ? 6 : js - 1
}

export function workDayStartFromHours(
  workHours: Record<string, unknown> | null | undefined,
  dayIndex: number,
): string {
  const day = DAY_KEYS[dayIndex] || 'monday'
  const startKey = `${day}_start`
  const hoursKey = `${day}_hours`
  const start = workHours?.[startKey]
  if (start != null && String(start).trim()) return String(start).slice(0, 5)
  const hoursRaw = workHours?.[hoursKey]
  const hours = typeof hoursRaw === 'string' ? parseFloat(hoursRaw) : Number(hoursRaw)
  if (Number.isFinite(hours) && hours > 0) return '08:00'
  return '08:00'
}

export function parsePgNumberArray(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.map((n) => {
      const v = Number(n)
      return Number.isFinite(v) ? v : 0
    })
  }
  if (typeof raw === 'string') {
    const inner = raw.replace(/^{|}$/g, '').trim()
    if (!inner) return []
    return inner.split(',').map((s) => {
      const v = Number(s.trim())
      return Number.isFinite(v) ? v : 0
    })
  }
  return []
}

export function parsePgIdArray(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.map((n) => Number(n)).filter((n) => Number.isFinite(n))
  }
  if (typeof raw === 'string') {
    return raw
      .replace(/[{}]/g, '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
  }
  return []
}

function clockToMinutes(hhmm: string): number | null {
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

function minutesToClock(total: number): string {
  const wrapped = ((Math.round(total) % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(wrapped / 60)
  const min = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function jobDurationMinutes(job: any): number {
  const raw =
    job?.estimated_duration_minutes ??
    job?.estimated_duration ??
    job?.duration_minutes ??
    0
  const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function parseTimeSortKey(t?: string | null): number {
  if (!t) return Number.POSITIVE_INFINITY
  const parts = String(t).split(':')
  const h = parseInt(parts[0] || '', 10)
  const m = parseInt(parts[1] || '0', 10)
  if (Number.isNaN(h)) return Number.POSITIVE_INFINITY
  return h * 60 + (Number.isNaN(m) ? 0 : m)
}

/** Default day order when no planned package covers the job. */
export function sortJobsForRouteEstimate(jobs: any[]): any[] {
  return [...jobs].sort((a, b) => {
    if (a.route_order != null && b.route_order != null) return a.route_order - b.route_order
    if (a.route_order != null) return -1
    if (b.route_order != null) return 1
    const aMin = parseTimeSortKey(a.scheduled_time_from)
    const bMin = parseTimeSortKey(b.scheduled_time_from)
    if (aMin !== bMin) return aMin - bMin
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })
}

export function estimateJobArrivalClock(args: {
  jobId: number | string
  dayStart: string
  orderedJobIds: Array<number | string>
  legMinutes: number[]
  durationByJobId: Record<string, number>
}): string | null {
  const target = String(args.jobId)
  const idx = args.orderedJobIds.findIndex((id) => String(id) === target)
  if (idx < 0) return null
  let mins = clockToMinutes(args.dayStart)
  if (mins == null) return null
  for (let i = 0; i <= idx; i++) {
    const leg = args.legMinutes[i]
    mins += Number.isFinite(leg) ? Number(leg) : 0
    if (i < idx) {
      mins += args.durationByJobId[String(args.orderedJobIds[i])] ?? 0
    }
  }
  return minutesToClock(mins)
}

/**
 * Build arrival estimate for one job given the day's jobs + optional planned
 * daily_routes row (job_ids + leg_minutes) + employee day-start clock.
 */
export function estimateArrivalForJob(opts: {
  job: any
  dayJobs: any[]
  dayStart: string
  routeJobIds?: number[] | null
  routeLegMinutes?: number[] | null
}): string | null {
  const job = opts.job
  if (!job) return null
  const jobId = job.id
  if (jobId == null) return null

  const durationByJobId: Record<string, number> = {}
  for (const j of opts.dayJobs) {
    if (j?.id == null) continue
    durationByJobId[String(j.id)] = jobDurationMinutes(j)
  }
  durationByJobId[String(jobId)] = jobDurationMinutes(job)

  const routeIds = opts.routeJobIds?.length ? opts.routeJobIds : null
  const inPackage = routeIds != null && routeIds.some((id) => String(id) === String(jobId))

  let orderedJobIds: Array<number | string>
  let legMinutes: number[]

  if (inPackage && routeIds) {
    orderedJobIds = routeIds
    legMinutes = opts.routeLegMinutes?.length
      ? [...opts.routeLegMinutes]
      : routeIds.map(() => 0)
    // Pad / trim legs to match package length
    while (legMinutes.length < orderedJobIds.length) legMinutes.push(0)
    if (legMinutes.length > orderedJobIds.length) legMinutes = legMinutes.slice(0, orderedJobIds.length)
  } else {
    const sorted = sortJobsForRouteEstimate(
      opts.dayJobs.filter((j) => j && j.id != null && j.status !== 'cancelled' && j.status !== 'deleted'),
    )
    // Ensure the open job is present even if dayJobs fetch missed it
    if (!sorted.some((j) => String(j.id) === String(jobId))) {
      sorted.push(job)
    }
    orderedJobIds = sorted.map((j) => j.id)
    legMinutes = orderedJobIds.map(() => 0)
  }

  return estimateJobArrivalClock({
    jobId,
    dayStart: opts.dayStart,
    orderedJobIds,
    legMinutes,
    durationByJobId,
  })
}

/** Arrival clock for every middle stop in the live planner order. */
export function arrivalEstimatesForRouteJobs(
  middleJobs: Array<{
    id: number | string
    legMinutes?: number | null
    estimated_duration_minutes?: number | null
    estimated_duration?: number | null
  }>,
  dayStart: string,
): Record<string, string> {
  const orderedJobIds = middleJobs.map((j) => j.id)
  const legMinutes = middleJobs.map((j) => {
    const n = Number(j.legMinutes)
    return Number.isFinite(n) && n > 0 ? n : 0
  })
  const durationByJobId: Record<string, number> = {}
  for (const j of middleJobs) {
    durationByJobId[String(j.id)] = jobDurationMinutes(j)
  }
  const out: Record<string, string> = {}
  for (const id of orderedJobIds) {
    const clock = estimateJobArrivalClock({
      jobId: id,
      dayStart,
      orderedJobIds,
      legMinutes,
      durationByJobId,
    })
    if (clock) out[String(id)] = clock
  }
  return out
}
