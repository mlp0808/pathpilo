/**
 * Frontend-only hide list for cancelled/deleted jobs in the day planner.
 * Soft-deleted/cancelled rows stay in the DB; this only removes them from the
 * planner UI until we add an undo/archive browser later.
 */

const STORAGE_KEY = 'vevago:planner-archived-jobs'
export const PLANNER_ARCHIVED_JOBS_EVENT = 'vevago:planner-archived-jobs-changed'

function readIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.map((id) => String(id)).filter(Boolean))
  } catch {
    return new Set()
  }
}

function writeIds(ids: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
    window.dispatchEvent(new Event(PLANNER_ARCHIVED_JOBS_EVENT))
  } catch {
    /* quota / private mode */
  }
}

export function getArchivedPlannerJobIds(): Set<string> {
  return readIds()
}

export function isPlannerJobArchived(id: string | number | null | undefined): boolean {
  if (id == null) return false
  return readIds().has(String(id))
}

export function archivePlannerJobId(id: string | number): void {
  const next = readIds()
  next.add(String(id))
  writeIds(next)
}

export function unarchivePlannerJobId(id: string | number): void {
  const next = readIds()
  next.delete(String(id))
  writeIds(next)
}
