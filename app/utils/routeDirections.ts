/** HH:MM for route cards (strips seconds from DB time values). */
export function formatRouteTime(t?: string | null): string {
  if (!t) return ''
  const s = String(t).trim()
  if (!s) return ''
  if (s.includes('T')) {
    const part = s.split('T')[1] || ''
    return part.substring(0, 5)
  }
  return s.length >= 5 ? s.substring(0, 5) : s
}

export function buildDayJobsFingerprint(jobs: Array<{
  id: unknown
  assigned_user_id?: unknown
  route_order?: unknown
  lat?: unknown
  lng?: unknown
  status?: unknown
}>): string {
  return jobs
    .map(j =>
      [
        j.id,
        j.assigned_user_id,
        j.route_order ?? '',
        j.lat ?? '',
        j.lng ?? '',
        j.status ?? '',
      ].join(':'),
    )
    .sort()
    .join('|')
}

export function routesHaveDirections(routes: Array<{
  jobs: Array<{ lat?: number | null; lng?: number | null; is_cancelled?: boolean }>
  routeGeometry?: { coordinates?: unknown[] }
}>): boolean {
  return routes.every(r => {
    const stops = r.jobs.filter(j => j.lat != null && j.lng != null && !j.is_cancelled)
    if (stops.length < 2) return true
    return (r.routeGeometry?.coordinates?.length ?? 0) >= 2
  })
}
