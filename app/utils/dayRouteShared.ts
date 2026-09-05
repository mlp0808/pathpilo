/**
 * Shared day-route builders used by BOTH the jobs day-view planner
 * (app/[company]/jobs) and the map multitool (app/[company]/map).
 *
 * Pure / token-aware helpers only — no React state. Auth-bearing fetches for
 * company/work-hours live in the map hooks (they need the TTL cache).
 */

import type { RouteJob, UserRoute } from '@/app/components/RouteMap'
import { colorForUserId, initialsFromName } from '@/app/components/RouteMap'
import { formatRouteTime } from '@/app/utils/routeDirections'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

export function coordOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** "HH:MM" (or "HH:MM:SS") → minutes since midnight. Missing/invalid → Infinity. */
export function parseTimeToMinutes(t?: string | null): number {
  if (!t) return Infinity
  const s = String(t).trim()
  if (!s) return Infinity
  const parts = s.split(':')
  const h = parseInt(parts[0] || '', 10)
  const m = parseInt(parts[1] || '0', 10)
  if (Number.isNaN(h)) return Infinity
  return h * 60 + (Number.isNaN(m) ? 0 : m)
}

export interface RouteUserLike {
  id: number
  first_name?: string | null
  last_name?: string | null
}

/**
 * Group a day's jobs by assignee and produce map-ready UserRoute[].
 * Sort priority: explicit route_order → scheduled time → sort_order.
 * (Extracted verbatim from the jobs page day-view builder.)
 */
export function buildDayRoutesFromJobs(dayJobs: any[], users: RouteUserLike[]): UserRoute[] {
  const byUser: Record<number, any[]> = {}
  dayJobs.forEach(job => {
    const uid = Number(job.assigned_user_id)
    if (!byUser[uid]) byUser[uid] = []
    byUser[uid].push(job)
  })
  return Object.entries(byUser).map(([uid, userJobs]) => {
    const user = users.find(u => u.id === Number(uid))
    const sorted = [...userJobs].sort((a, b) => {
      // Explicit route_order (admin arranged) always wins.
      if (a.route_order != null && b.route_order != null) return a.route_order - b.route_order
      if (a.route_order != null) return -1
      if (b.route_order != null) return 1
      // Default: earliest scheduled time first, time-less jobs at the bottom.
      const aMin = parseTimeToMinutes(a.scheduled_time_from)
      const bMin = parseTimeToMinutes(b.scheduled_time_from)
      if (aMin !== bMin) return aMin - bMin
      return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    })
    return {
      userId: Number(uid),
      userName: user ? `${user.first_name} ${user.last_name}` : `User ${uid}`,
      color: colorForUserId(Number(uid)),
      jobs: sorted.map(job => ({
        id: job.id,
        lat: coordOrNull(job.lat ?? job.client_lat),
        lng: coordOrNull(job.lng ?? job.client_lng),
        label: job.name
          ? (job.last_name ? `${job.name} ${job.last_name}` : job.name)
          : (job.title || 'Untitled'),
        address: [job.address, job.zip_code, job.city].filter(Boolean).join(', '),
        time: job.scheduled_time_from
          ? job.scheduled_time_to
            ? `${formatRouteTime(job.scheduled_time_from)} – ${formatRouteTime(job.scheduled_time_to)}`
            : formatRouteTime(job.scheduled_time_from)
          : undefined,
        is_projected: !!(job.is_projected || (typeof job.id === 'string' && job.id.startsWith('subscription-'))),
        is_cancelled: job.status === 'cancelled' || job.status === 'deleted',
        is_deleted: job.status === 'deleted',
        // True only when the job row itself has coords — NOT the client fallback.
        // Used to decide whether geocoding should run to get a more accurate pin position.
        has_own_coords: coordOrNull(job.lat) != null && coordOrNull(job.lng) != null,
        estimated_duration_minutes: typeof job.estimated_duration === 'number'
          ? job.estimated_duration
          : parseFloat(String(job.estimated_duration)) || 0,
        estimated_price: (() => {
          const estimated = parseFloat(String(job.estimated_price ?? ''))
          if (String(job.status || '') === 'cancelled') {
            const fee = parseFloat(String(job.cancellation_fee_amount ?? job.estimated_price ?? job.total_price ?? 0))
            return Number.isFinite(fee) ? Math.max(0, fee) : 0
          }
          if (Number.isFinite(estimated) && estimated > 0) return estimated
          const total = parseFloat(String(job.total_price ?? ''))
          if (Number.isFinite(total) && total > 0) return total
          return 0
        })(),
        visit_size: typeof job.visit_size === 'number' ? job.visit_size : undefined,
        client_id: job.client_id != null && Number.isFinite(Number(job.client_id))
          ? Number(job.client_id)
          : null,
      } as RouteJob)),
    }
  })
}

/**
 * Prepend/append home start & end waypoints (same shape as the jobs day planner).
 * Addresses only — coords are filled later by geocodeMissingRouteCoords.
 * No-op when startAddr is empty or home pins are already present.
 */
export function injectHomeWaypoints(route: UserRoute, startAddr: string, endAddr?: string): UserRoute {
  const start = (startAddr || '').trim()
  if (!start) return route
  if (route.jobs.some(j => j.is_home)) return route
  const end = ((endAddr || startAddr) || '').trim() || start
  const homeInitials = initialsFromName(route.userName)
  const jobs: RouteJob[] = [
    {
      id: `start-${route.userId}`,
      lat: null,
      lng: null,
      label: 'Start',
      address: start,
      is_home: true,
      home_initials: homeInitials,
      has_own_coords: true,
    },
    ...route.jobs,
    {
      id: `end-${route.userId}`,
      lat: null,
      lng: null,
      label: 'End',
      address: end,
      is_home: true,
      home_initials: homeInitials,
      has_own_coords: true,
    },
  ]
  // Clear any stale road geometry — waypoints changed.
  return { ...route, jobs, routeGeometry: undefined, totalMinutes: undefined, totalKm: undefined }
}

/** Geocode one address via Mapbox. Optional proximity [lng, lat] biases the result. */
export async function geocodeAddress(
  address: string,
  proximity?: [number, number] | null,
): Promise<{ lat: number; lng: number } | null> {
  if (!MAPBOX_TOKEN || !address.trim()) return null
  const proximityParam = proximity
    ? `&proximity=${proximity[0].toFixed(4)},${proximity[1].toFixed(4)}`
    : ''
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address.trim())}.json` +
      `?access_token=${MAPBOX_TOKEN}&types=address,place&limit=1${proximityParam}`
    )
    const data = await res.json()
    const center = data.features?.[0]?.center
    if (!Array.isArray(center) || center.length < 2) return null
    const lng = Number(center[0])
    const lat = Number(center[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  } catch {
    return null
  }
}

/**
 * Fill missing lat/lng on a route (typically home start/end) using geocodeAddress.
 * `lookup` should cache by address so the same home is never geocoded twice.
 */
export async function geocodeMissingRouteCoords(
  route: UserRoute,
  lookup: (address: string, proximity: [number, number] | null) => Promise<{ lat: number; lng: number } | null>,
): Promise<UserRoute> {
  const known = route.jobs.filter(j => j.lat != null && j.lng != null && Number.isFinite(j.lat) && Number.isFinite(j.lng))
  const proximity: [number, number] | null = known.length > 0
    ? [
        known.reduce((s, j) => s + (j.lng as number), 0) / known.length,
        known.reduce((s, j) => s + (j.lat as number), 0) / known.length,
      ]
    : null

  let changed = false
  const jobs: RouteJob[] = []
  for (const job of route.jobs) {
    if (job.is_cancelled || !job.address || (job.lat != null && job.lng != null)) {
      jobs.push(job)
      continue
    }
    // Home pins always need geocoding; job pins only when they have no coords yet.
    if (!job.is_home && job.has_own_coords) {
      jobs.push(job)
      continue
    }
    const hit = await lookup(job.address, proximity)
    if (hit) {
      changed = true
      jobs.push({ ...job, lat: hit.lat, lng: hit.lng })
    } else {
      jobs.push(job)
    }
  }
  if (!changed) return route
  return { ...route, jobs, routeGeometry: undefined, totalMinutes: undefined, totalKm: undefined }
}

/**
 * Fetch driving times + road geometry from the Mapbox Directions API for one route.
 * Cancelled jobs are excluded from waypoints. Returns a patch to merge onto the route.
 * (Extracted verbatim from the jobs page day-view.)
 */
export async function fetchRouteDirections(route: UserRoute): Promise<Partial<UserRoute>> {
  if (!MAPBOX_TOKEN) return {}
  const pts = route.jobs.filter(j => j.lat != null && j.lng != null && !j.is_cancelled)
  if (pts.length < 2) return {}
  // Mapbox Directions supports up to 25 waypoints and rejects near-duplicate
  // consecutive coordinates (common when home ≈ first/last stop).
  const waypointPts: typeof pts = []
  for (const j of pts.slice(0, 25)) {
    const prev = waypointPts[waypointPts.length - 1]
    if (
      prev
      && Math.abs(Number(prev.lat) - Number(j.lat)) < 1e-5
      && Math.abs(Number(prev.lng) - Number(j.lng)) < 1e-5
    ) {
      continue
    }
    waypointPts.push(j)
  }
  if (waypointPts.length < 2) return {}
  const coords = waypointPts.map(j => `${j.lng},${j.lat}`).join(';')
  try {
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full`
    )
    const data = await res.json()
    if (!data.routes?.[0]) return {}
    const r = data.routes[0]
    const totalMinutes = r.duration / 60
    const totalKm = r.distance / 1000
    const routeGeometry = r.geometry as { type: string; coordinates: [number, number][] }
    let cumulative = 0
    const updatedJobs = route.jobs.map((job) => {
      if (job.lat == null || job.lng == null || job.is_cancelled) return job
      const ptIdx = waypointPts.findIndex(p => p.id === job.id)
      if (ptIdx <= 0) return { ...job, legMinutes: 0, etaMinutes: 0 }
      const legSec = r.legs[ptIdx - 1]?.duration ?? 0
      const legMin = legSec / 60
      cumulative += legMin
      return { ...job, legMinutes: legMin, etaMinutes: cumulative }
    })
    return { totalMinutes, totalKm, jobs: updatedJobs, routeGeometry }
  } catch { return {} }
}
