/**
 * Materialize subscription "ghost" jobs into real job rows.
 *
 * Planning can include projected stops (`subscription-{id}-{occurrence}`).
 * Saving a route/round must turn those into real jobs first so they can join
 * `daily_routes.job_ids` and `round_stops`.
 */

import { apiUrl } from '@/app/utils/api'

export type ProjectedJobLike = {
  id: number | string
  is_projected?: boolean
  is_home?: boolean
  is_cancelled?: boolean
  scheduled_date?: string | null
  recurring_job_id?: number | null
  recurring_occurrence?: number | null
}

function parseNumericJobId(id: unknown): number | null {
  if (typeof id === 'number' && Number.isFinite(id)) return id
  if (typeof id === 'string' && /^\d+$/.test(id.trim())) return parseInt(id.trim(), 10)
  return null
}

export function isProjectedJobLike(job: ProjectedJobLike): boolean {
  if (job.is_home) return false
  return !!(job.is_projected || (typeof job.id === 'string' && String(job.id).startsWith('subscription-')))
}

export function getProjectedJobMeta(job: ProjectedJobLike): { subscriptionId: number; occurrence: number } | null {
  const subId = typeof job.recurring_job_id === 'number' ? job.recurring_job_id : null
  const occ = typeof job.recurring_occurrence === 'number' ? job.recurring_occurrence : null
  if (subId && occ) return { subscriptionId: subId, occurrence: occ }

  if (typeof job.id === 'string' && String(job.id).startsWith('subscription-')) {
    const parts = String(job.id).split('-')
    if (parts.length >= 3) {
      const ps = parseInt(parts[1], 10)
      const po = parseInt(parts[2], 10)
      if (Number.isFinite(ps) && Number.isFinite(po)) return { subscriptionId: ps, occurrence: po }
    }
  }
  return null
}

export async function materializeProjectedJob(
  job: ProjectedJobLike,
  opts: { token: string; scheduledDate?: string | null },
): Promise<number> {
  const parsed = parseNumericJobId(job.id)
  if (parsed != null) return parsed

  if (!isProjectedJobLike(job)) {
    throw new Error('Invalid job id')
  }

  const meta = getProjectedJobMeta(job)
  if (!meta) {
    throw new Error('Could not resolve subscription occurrence to materialize')
  }

  const res = await fetch(
    apiUrl(`/subscriptions/${meta.subscriptionId}/occurrences/${meta.occurrence}/materialize`),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.token}`,
      },
      body: JSON.stringify({
        scheduled_date: opts.scheduledDate || job.scheduled_date || undefined,
      }),
    },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data.details
      ? `${data.error || 'Failed to create real job from subscription'}: ${data.details}`
      : (data.error || 'Failed to create real job from subscription')
    throw new Error(msg)
  }
  const jobId = data.jobId
  if (typeof jobId !== 'number') {
    throw new Error('Invalid jobId returned from materialize endpoint')
  }
  return jobId
}

/**
 * Walk a route's jobs in order; materialize any ghosts and return a new array
 * with real integer ids (preserves order). `changed` is true when at least one
 * ghost was materialized.
 */
export async function materializeProjectedJobsInList<T extends ProjectedJobLike>(
  jobs: T[],
  opts: { token: string; scheduledDate?: string | null },
): Promise<{ jobs: T[]; changed: boolean; idMap: Map<string | number, number> }> {
  const idMap = new Map<string | number, number>()
  let changed = false
  const next: T[] = []

  for (const job of jobs) {
    if (!isProjectedJobLike(job) || job.is_cancelled) {
      next.push(job)
      continue
    }
    const realId = await materializeProjectedJob(job, opts)
    idMap.set(job.id, realId)
    if (String(job.id) !== String(realId) || job.is_projected) {
      changed = true
      next.push({
        ...job,
        id: realId,
        is_projected: false,
      })
    } else {
      next.push(job)
    }
  }

  return { jobs: next, changed, idMap }
}

/** Append " (modified)" once for day-specific overrides of a template round. */
export function modifiedRoundName(base: string | null | undefined): string | null {
  const raw = (base && String(base).trim()) || ''
  if (!raw) return 'Round (modified)'
  if (/\(modified\)\s*$/i.test(raw)) return raw
  return `${raw} (modified)`
}
