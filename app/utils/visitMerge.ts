/**
 * Visit merge — several jobs for the same client on the same day for the same
 * employee are one *visit* on the board. No persisted Visit entity; this is
 * compose-time grouping for cards + JobViewSlideout sources.
 */

export type VisitJob = {
  id: number | string
  client_id?: number | null
  scheduled_date?: string | Date | null
  assigned_user_id?: number | null
  status?: string | null
  estimated_duration?: number | string | null
  total_duration?: number | string | null
  all_service_count?: number | null
  service_count?: number | null
  visit_key?: string | null
  visit_size?: number | null
  recurring_job_id?: number | null
  round_template_id?: number | null
  round_template_name?: string | null
  [key: string]: unknown
}

export type VisitGroup = {
  key: string
  primary: VisitJob
  /** Other jobs in the visit (excludes primary). */
  siblings: VisitJob[]
  /** All jobs including primary, stable order. */
  jobs: VisitJob[]
  visitSize: number
  totalDurationMinutes: number
  totalTaskCount: number
}

function dateOnly(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}

export function buildVisitKey(job: VisitJob): string | null {
  if (job.client_id == null || job.status === 'cancelled') return null
  if (job.visit_key) return String(job.visit_key)
  return `${job.client_id}:${dateOnly(job.scheduled_date)}:${job.assigned_user_id ?? 'none'}`
}

function durationMinutes(job: VisitJob): number {
  const n = parseFloat(String(job.estimated_duration ?? job.total_duration ?? 0))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function taskCount(job: VisitJob): number {
  const n = Number(job.all_service_count ?? job.service_count ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Collapse a flat job list into visit groups. Cancelled jobs stay as solo
 * cards. Order follows first appearance of each visit key in `jobs`.
 */
export function groupJobsIntoVisits(jobs: VisitJob[]): VisitGroup[] {
  const groups = new Map<string, VisitJob[]>()
  const order: string[] = []
  const solos: VisitJob[] = []

  for (const job of jobs) {
    const key = buildVisitKey(job)
    if (!key) {
      solos.push(job)
      continue
    }
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(job)
  }

  const out: VisitGroup[] = order.map((key) => {
    const list = groups.get(key) || []
    const primary = list[0]
    const siblings = list.slice(1)
    return {
      key,
      primary,
      siblings,
      jobs: list,
      visitSize: list.length,
      totalDurationMinutes: list.reduce((sum, j) => sum + durationMinutes(j), 0),
      totalTaskCount: list.reduce((sum, j) => sum + taskCount(j), 0),
    }
  })

  for (const job of solos) {
    out.push({
      key: `solo:${job.id}`,
      primary: job,
      siblings: [],
      jobs: [job],
      visitSize: 1,
      totalDurationMinutes: durationMinutes(job),
      totalTaskCount: taskCount(job),
    })
  }

  return out
}

/** Siblings of `job` within `allJobs` (excludes `job` itself). */
export function visitSiblingsFor(job: VisitJob | null | undefined, allJobs: VisitJob[]): VisitJob[] {
  if (!job) return []
  const key = buildVisitKey(job)
  if (!key) return []
  return allJobs.filter((j) => j.id !== job.id && buildVisitKey(j) === key)
}
