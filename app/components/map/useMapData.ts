'use client'

/**
 * Data hooks for the map multitool. Plain fetch + tiny module-level TTL caches
 * (no SWR/React Query — evaluated and skipped to keep the app's data layer
 * uniform; the caches below give us the dedupe/caching we need).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from '@/app/utils/api'
import type { UserRoute } from '@/app/components/RouteMap'
import { colorForUserId } from '@/app/components/RouteMap'
import {
  buildDayRoutesFromJobs,
  fetchRouteDirections,
  geocodeAddress,
  geocodeMissingRouteCoords,
  injectHomeWaypoints,
  type RouteUserLike,
} from '@/app/utils/dayRouteShared'

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return { Authorization: `Bearer ${token}` }
}

// ── Tiny TTL cache ──────────────────────────────────────────────────────────
const ttlCache = new Map<string, { expires: number; value: any }>()

function cacheGet<T>(key: string): T | null {
  const hit = ttlCache.get(key)
  if (!hit) return null
  if (Date.now() > hit.expires) { ttlCache.delete(key); return null }
  return hit.value as T
}
function cacheSet(key: string, value: any, ttlMs: number) {
  if (ttlCache.size > 100) {
    const first = ttlCache.keys().next().value
    if (first) ttlCache.delete(first)
  }
  ttlCache.set(key, { expires: Date.now() + ttlMs, value })
}

export async function cachedFetch<T>(key: string, url: string, ttlMs: number): Promise<T> {
  const hit = cacheGet<T>(key)
  if (hit) return hit
  const res = await fetch(apiUrl(url), { headers: authHeaders() })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  const data = (await res.json()) as T
  cacheSet(key, data, ttlMs)
  return data
}

/** Drop all map caches (call after anything that changes jobs/routes). */
export function invalidateMapCaches() {
  ttlCache.clear()
}

/** Bust per-employee start/end cache after an inline location edit. */
export function invalidateWorkHoursCache(userId: number) {
  ttlCache.delete(`wh:${userId}`)
}

// ── Home start/end (same source as jobs day planner) ────────────────────────
// Cached aggressively: company default + per-employee work-hours rarely change,
// and the same home address is geocoded at most once per session.

async function resolveHomeAddresses(userId: number): Promise<{ start: string; end: string }> {
  let defaultStart = ''
  let defaultEnd = ''
  try {
    const companyData = await cachedFetch<{ company?: { defaultStartAddress?: string; defaultEndAddress?: string } }>(
      'company:profile',
      '/companies/profile',
      5 * 60_000,
    )
    defaultStart = (companyData?.company?.defaultStartAddress || '').trim()
    defaultEnd = (companyData?.company?.defaultEndAddress || defaultStart).trim() || defaultStart
  } catch { /* ignore */ }

  try {
    const whData = await cachedFetch<{ workHours?: {
      use_company_default_location?: boolean
      start_address?: string | null
      end_address?: string | null
    } }>(`wh:${userId}`, `/work-hours/${userId}`, 5 * 60_000)
    const wh = whData?.workHours
    const useDefault = wh?.use_company_default_location !== false
    if (useDefault) return { start: defaultStart, end: defaultEnd || defaultStart }
    const start = (wh?.start_address || '').trim()
    const end = (wh?.end_address || wh?.start_address || '').trim() || start
    return { start, end }
  } catch {
    return { start: defaultStart, end: defaultEnd || defaultStart }
  }
}

export async function cachedGeocodeLookup(
  address: string,
  proximity: [number, number] | null,
): Promise<{ lat: number; lng: number } | null> {
  const key = `geo:${address.trim().toLowerCase()}`
  const hit = cacheGet<{ lat: number; lng: number }>(key)
  if (hit) return hit
  const result = await geocodeAddress(address, proximity)
  if (result) cacheSet(key, result, 60 * 60_000) // 1h — home addresses don't move
  return result
}

/** Inject + geocode home start/end so Directions covers the full real road. */
export async function enhanceRouteWithHome(route: UserRoute): Promise<UserRoute> {
  const { start, end } = await resolveHomeAddresses(route.userId)
  const withHome = injectHomeWaypoints(route, start, end)
  return geocodeMissingRouteCoords(withHome, cachedGeocodeLookup)
}

export async function applyDirections(
  route: UserRoute,
  cacheKey: string,
): Promise<Partial<UserRoute> | null> {
  const located = route.jobs.filter(j => j.lat != null && j.lng != null && !j.is_cancelled)
  if (located.length < 2) return null
  // Include coords in the key so a moved/geocoded pin never reuses a stale drive time.
  const dirKey = `${cacheKey}:${located.map(j => `${j.id}:${Number(j.lat).toFixed(5)},${Number(j.lng).toFixed(5)}`).join('|')}`
  let patch = cacheGet<Partial<UserRoute>>(dirKey)
  if (patch) return patch

  patch = await fetchRouteDirections(route)
  // One quiet retry — Mapbox occasionally flakes; better than leaving a day without drive time.
  if (!patch || Object.keys(patch).length === 0 || patch.totalMinutes == null) {
    await new Promise(r => setTimeout(r, 350))
    patch = await fetchRouteDirections(route)
  }
  if (patch && patch.totalMinutes != null && patch.routeGeometry) {
    cacheSet(dirKey, patch, 5 * 60_000)
    return patch
  }
  return null
}

// ── Employees ───────────────────────────────────────────────────────────────
export interface MapUser {
  id: number
  first_name: string
  last_name: string
}

export function useCompanyUsers() {
  const [users, setUsers] = useState<MapUser[]>([])
  useEffect(() => {
    let alive = true
    cachedFetch<{ users: MapUser[] }>('users', '/users', 5 * 60_000)
      .then(d => { if (alive) setUsers(d.users || []) })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  return users
}

export interface EmployeeHomePin {
  userId: number
  label: string
  address: string
  lat: number
  lng: number
}

/**
 * All employee route-start (home) locations for the map backdrop.
 * Reuses the same work-hours / company-default resolution + geocode cache as
 * route previews — so the first visit may geocode once per unique address,
 * then it's free for the rest of the session.
 */
export function useEmployeeHomes(users: MapUser[]) {
  const [homes, setHomes] = useState<EmployeeHomePin[]>([])
  const usersKey = users.map(u => u.id).sort((a, b) => a - b).join(',')

  useEffect(() => {
    if (users.length === 0) { setHomes([]); return }
    let alive = true

    ;(async () => {
      const results: EmployeeHomePin[] = []
      // Resolve sequentially so we don't burst Mapbox geocode for shared addresses —
      // the address cache makes repeats instant after the first unique hit.
      for (const u of users) {
        const { start } = await resolveHomeAddresses(u.id)
        if (!start) continue
        const coords = await cachedGeocodeLookup(start, null)
        if (!coords) continue
        results.push({
          userId: u.id,
          label: `${u.first_name || ''} ${u.last_name || ''}`.trim() || `User ${u.id}`,
          address: start,
          lat: coords.lat,
          lng: coords.lng,
        })
      }
      if (alive) setHomes(results)
    })()

    return () => { alive = false }
  }, [usersKey])

  return homes
}

// ── Day routes (jobs for one date → UserRoute[] with directions) ───────────
export function useDayRoutes(date: string | null, users: RouteUserLike[]) {
  const [routes, setRoutes] = useState<UserRoute[]>([])
  const [loading, setLoading] = useState(false)
  // Directions arrive progressively; bump so consumers re-render.
  const requestSeq = useRef(0)

  useEffect(() => {
    if (!date || users.length === 0) { setRoutes([]); return }
    const seq = ++requestSeq.current
    setLoading(true)

    ;(async () => {
      try {
        const data = await cachedFetch<{ jobs: any[] }>(
          `jobs:v2:${date}`,
          `/jobs?start_date=${date}&end_date=${date}`,
          30_000
        )
        if (requestSeq.current !== seq) return
        const built = buildDayRoutesFromJobs(data.jobs || [], users)
        // Show job pins immediately, then upgrade with home + full road geometry.
        setRoutes(built)
        setLoading(false)

        const withHome = await Promise.all(built.map(r => enhanceRouteWithHome(r)))
        if (requestSeq.current !== seq) return
        setRoutes(withHome)

        withHome.forEach(async route => {
          const patch = await applyDirections(route, `dir:${date}:${route.userId}`)
          if (requestSeq.current !== seq || !patch) return
          setRoutes(prev => prev.map(r => (r.userId === route.userId ? { ...r, ...patch } : r)))
        })
      } catch {
        if (requestSeq.current === seq) { setRoutes([]); setLoading(false) }
      }
    })()
  }, [date, users])

  return { routes, loading }
}

// ── Multi-select route preview (map multitool "click a route to show it") ──
// Deliberately lean: fetches jobs for only the specific dates asked for (shared
// cache with useDayRoutes/day view), builds a route for only the one employee
// requested per date (never every employee on that day), and only calls the
// paid Mapbox Directions API for the exact selections the user picked.
// Route color always follows the employee (stable by userId) — never a
// selection-order palette that made the first preview look purple.

/** Stable color for a preview selection key — employee color from the userId in the key. */
export function previewColorForKey(key: string, _previewKeys?: string[]): string {
  const userId = Number(String(key).split(':')[1])
  return colorForUserId(Number.isFinite(userId) ? userId : 0)
}

export interface PreviewRouteSelection {
  date: string
  userId: number
}

export function usePreviewRoutes(selections: PreviewRouteSelection[], users: RouteUserLike[]) {
  const [routesByKey, setRoutesByKey] = useState<Record<string, UserRoute>>({})
  const [reloadTick, setReloadTick] = useState(0)
  const requestSeq = useRef(0)
  // Normalize date up front so "2026-07-23T00:00:00.000Z" and "2026-07-23" share a cache key.
  const normalized = selections.map(s => ({
    date: String(s.date || '').slice(0, 10),
    userId: Number(s.userId),
  })).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date) && Number.isFinite(s.userId))
  const selectionKey = normalized.map(s => `${s.date}:${s.userId}`).sort().join('|')

  const reload = useCallback(() => setReloadTick(t => t + 1), [])

  useEffect(() => {
    if (normalized.length === 0) {
      // Invalidate in-flight fetches/directions so a late response can't repaint the route
      // after the user has moved on (idle, another client, cleared selection).
      requestSeq.current += 1
      setRoutesByKey({})
      return
    }
    const seq = ++requestSeq.current
    const selsSnapshot = normalized
    const sortedKeys = selsSnapshot.map(s => `${s.date}:${s.userId}`).sort()

    ;(async () => {
      const byDate = new Map<string, typeof selsSnapshot>()
      selsSnapshot.forEach(s => {
        if (!byDate.has(s.date)) byDate.set(s.date, [])
        byDate.get(s.date)!.push(s)
      })

      const nextByKey: Record<string, UserRoute> = {}
      for (const [date, sels] of Array.from(byDate.entries())) {
        let jobs: any[] = []
        try {
          const data = await cachedFetch<{ jobs: any[] }>(`jobs:v2:${date}`, `/jobs?start_date=${date}&end_date=${date}`, 30_000)
          jobs = data.jobs || []
        } catch { jobs = [] }
        if (requestSeq.current !== seq) return

        for (const sel of sels) {
          const key = `${sel.date}:${sel.userId}`
          const userJobs = jobs.filter(j => {
            if (Number(j.assigned_user_id) !== sel.userId) return false
            const status = String(j.status || '')
            return status !== 'cancelled' && status !== 'deleted'
          })
          const [built] = buildDayRoutesFromJobs(userJobs, users)
          const activeStops = (built?.jobs || []).filter(j => !j.is_cancelled && !j.is_home)
          if (!built || activeStops.length === 0) continue

          // Home must be resolved against the real employee id before we remap
          // to a synthetic preview userId (used so multiple dates can show at once).
          const withHome = await enhanceRouteWithHome(built)
          if (requestSeq.current !== seq) return

          const colorIdx = Math.max(0, sortedKeys.indexOf(key))
          nextByKey[key] = {
            ...withHome,
            // Synthetic id so multiple preview dates for different employees don't collide.
            userId: -(100 + colorIdx),
            // Keep the employee's own color (from buildDayRoutesFromJobs / colorForUserId).
            color: withHome.color || colorForUserId(sel.userId),
          }
        }
      }
      if (requestSeq.current !== seq) return

      // Await directions so road geometry is ready when possible; RouteMap still
      // draws a dashed pin connector if Directions is slow or unavailable.
      await Promise.all(
        Object.entries(nextByKey).map(async ([key, route]) => {
          const patch = await applyDirections(route, `dir:${key}`)
          if (!patch) return
          nextByKey[key] = { ...route, ...patch }
        }),
      )
      if (requestSeq.current !== seq) return
      setRoutesByKey({ ...nextByKey })
    })()
    // reloadTick forces a re-fetch after a job is scheduled onto the previewed route.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- normalized is derived from selectionKey
  }, [selectionKey, users, reloadTick])

  const routes = useMemo(() => Object.values(routesByKey), [routesByKey])
  const loadingDirections = routes.some(r => {
    const located = r.jobs.filter(j => j.lat != null && j.lng != null && !j.is_cancelled)
    return located.length >= 2 && !r.routeGeometry
  })
  return { routes, routesByKey, loadingDirections, reload }
}

// ── Map API wrappers ────────────────────────────────────────────────────────

export interface NearestRouteRow {
  date: string
  user_id: number
  user_name: string
  stop_count: number
  nearest_km: number
  current_drive_minutes: number
  current_job_minutes: number
  added_minutes: number | null
  has_saved_route: boolean
}

export function fetchNearestRoutes(params: {
  lat: number; lng: number; from: string; to: string
  radius?: number; sort?: 'closest' | 'soonest'
}): Promise<NearestRouteRow[]> {
  const radius = params.radius ?? 30
  const sort = params.sort ?? 'closest'
  const q =
    `/map/nearest-routes?lat=${params.lat}&lng=${params.lng}&from=${params.from}&to=${params.to}` +
    `&radius=${radius}&sort=${sort}`
  return cachedFetch<{ routes: NearestRouteRow[] }>(`nr:${q}`, q, 45_000).then(d => d.routes)
}

const WEEKDAY_HOUR_KEYS = [
  'sunday_hours',
  'monday_hours',
  'tuesday_hours',
  'wednesday_hours',
  'thursday_hours',
  'friday_hours',
  'saturday_hours',
] as const

/** When hours are 0 / missing the day is off — no fake 8h capacity. */
export const DEFAULT_DAY_CAPACITY_MINUTES = 0

/**
 * Daily capacity in minutes for an employee on a given date.
 * Uses work-hours (or company defaults via the API). Returns 0 when the day
 * is off (weekend / zero scheduled hours).
 */
export async function fetchDayCapacityMinutes(userId: number, date: string): Promise<number> {
  try {
    const data = await cachedFetch<{ workHours?: Record<string, unknown> }>(
      `wh:${userId}`,
      `/work-hours/${userId}`,
      5 * 60_000,
    )
    const wh = data?.workHours
    if (!wh) return DEFAULT_DAY_CAPACITY_MINUTES
    const [y, m, d] = date.split('-').map(Number)
    const dow = new Date(y, m - 1, d).getDay() // 0=Sun
    const key = WEEKDAY_HOUR_KEYS[dow]
    const hours = Number(wh[key])
    if (Number.isFinite(hours) && hours > 0) return Math.round(hours * 60)
    return 0
  } catch {
    return DEFAULT_DAY_CAPACITY_MINUTES
  }
}

export interface NearestClientRow {
  id: number
  name: string
  address: string
  lat: number
  lng: number
  distance_km: number
  client_type?: 'person' | 'company' | string | null
}

export function fetchNearestClients(params: { lat: number; lng: number; radius: number }): Promise<NearestClientRow[]> {
  const q = `/map/nearest-clients?lat=${params.lat}&lng=${params.lng}&radius=${params.radius}`
  return cachedFetch<{ clients: NearestClientRow[] }>(`ncl:${q}`, q, 45_000).then(d => d.clients)
}

export interface ClientRouteRow {
  job_id: number | string
  date: string
  user_id: number | null
  user_name: string | null
  time_from: string | null
  time_to: string | null
  is_projected: boolean
  duration_minutes: number
  /** scheduled | completed | cancelled (projected → scheduled). */
  status?: string
}

export function fetchClientRoutes(clientId: number, from: string, to: string): Promise<ClientRouteRow[]> {
  const q = `/map/client/${clientId}/routes?from=${from}&to=${to}`
  return cachedFetch<{ routes: ClientRouteRow[] }>(`cr:v2:${q}`, q, 45_000).then(d => d.routes)
}

export interface EmployeeDayRow {
  date: string
  stop_count: number
  projected_count: number
  job_minutes: number
  drive_minutes: number
  has_saved_route: boolean
}

export function fetchEmployeeDays(userId: number, from: string, to: string): Promise<EmployeeDayRow[]> {
  const q = `/map/employee/${userId}/days?from=${from}&to=${to}`
  return cachedFetch<{ days: EmployeeDayRow[] }>(`ed:${q}`, q, 45_000).then(d => d.days)
}

export interface MapClient {
  id: number
  name: string
  last_name?: string | null
  address?: string | null
  zip_code?: string | null
  city?: string | null
  email?: string | null
  phone?: string | null
  lat?: number | null
  lng?: number | null
  client_type?: 'person' | 'company' | string | null
  job_count?: number
  last_job_date?: string | null
}

export function fetchClient(clientId: number): Promise<MapClient | null> {
  return cachedFetch<{ client: MapClient }>(`client:${clientId}`, `/clients/${clientId}`, 60_000)
    .then(d => d.client || null)
    .catch(() => null)
}

/** Full client list for the unified search (cached 2 min). */
export function fetchAllClients(): Promise<MapClient[]> {
  return cachedFetch<{ clients: MapClient[] }>('clients:all', '/clients', 2 * 60_000).then(d => d.clients || [])
}

/** Normalize street/city/zip for fuzzy matching searched places to clients. */
export function normalizePlaceText(s: string | null | undefined): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * When an address search lands on a place that already has a client, return that
 * client instead of treating it as a new unknown location.
 *
 * Match order: tight lat/lng proximity, then street+zip, then street+city.
 */
export function findClientAtPlace(
  clients: MapClient[],
  place: {
    lat: number
    lng: number
    address?: string | null
    zip_code?: string | null
    city?: string | null
  },
): MapClient | null {
  if (!Array.isArray(clients) || clients.length === 0) return null

  const near = (aLat: number, aLng: number, bLat: number, bLng: number) =>
    Math.abs(aLat - bLat) < 0.0003 && Math.abs(aLng - bLng) < 0.0003

  for (const c of clients) {
    if (
      c.lat != null && c.lng != null
      && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng))
      && near(place.lat, place.lng, Number(c.lat), Number(c.lng))
    ) {
      return c
    }
  }

  const addr = normalizePlaceText(place.address)
  if (!addr || addr.length < 3) return null
  const zip = normalizePlaceText(place.zip_code)
  const city = normalizePlaceText(place.city)

  let cityOnlyHit: MapClient | null = null
  for (const c of clients) {
    const cAddr = normalizePlaceText(c.address)
    if (!cAddr) continue
    const addrHit = cAddr === addr || cAddr.includes(addr) || addr.includes(cAddr)
    if (!addrHit) continue
    const cZip = normalizePlaceText(c.zip_code)
    const cCity = normalizePlaceText(c.city)
    if (zip && cZip && zip === cZip) return c
    if (city && cCity && city === cCity && !cityOnlyHit) cityOnlyHit = c
  }
  return cityOnlyHit
}

export interface GeocodeFeature {
  place_name: string
  center: [number, number] // lng, lat
  text?: string
  /** House number when Mapbox returns a precise address feature. */
  address?: string
  context?: Array<{ id?: string; text?: string }>
}

/** Split a Mapbox feature into street / zip / city for client forms. */
export function parseMapboxFeature(f: GeocodeFeature): {
  address: string
  zip_code: string
  city: string
  lat: number
  lng: number
  label: string
} {
  const num = f.address != null ? String(f.address).trim() : ''
  const streetName = String(f.text || '').trim()
  const line1 = [num, streetName].filter(Boolean).join(' ').trim()
  let zip_code = ''
  let city = ''
  const ctx = Array.isArray(f.context) ? f.context : []
  for (const c of ctx) {
    const id = String(c?.id || '')
    if (id.startsWith('postcode.')) {
      zip_code = String(c.text || '').trim()
    }
    if (
      id.startsWith('place.') ||
      id.startsWith('locality.') ||
      id.startsWith('district.')
    ) {
      if (!city) city = String(c.text || '').trim()
    }
  }
  const label = String(f.place_name || '').trim()
  const fallbackLine = label.split(',')[0]?.trim() || ''
  const address = line1 || fallbackLine
  // If Mapbox context was empty (older bookmarks / coarse places), peel apart the label.
  if ((!zip_code || !city) && label) {
    const guessed = parsePlaceLabel(label)
    if (!zip_code && guessed.zip_code) zip_code = guessed.zip_code
    if (!city && guessed.city) city = guessed.city
    // Prefer a shorter street line when the whole place_name was stuffed into address.
    if (!line1 && guessed.address) {
      return {
        address: guessed.address,
        zip_code,
        city,
        lat: f.center[1],
        lng: f.center[0],
        label: label || guessed.address,
      }
    }
  }
  return {
    address,
    zip_code,
    city,
    lat: f.center[1],
    lng: f.center[0],
    label: label || address,
  }
}

/**
 * Best-effort split of a place_name like
 * "10 Downing St, London, SW1A 2AA, United Kingdom" or "Nørrebrogade 1, 2200 København N, Denmark".
 */
export function parsePlaceLabel(placeName: string): {
  address: string
  zip_code: string
  city: string
} {
  const parts = String(placeName || '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return { address: '', zip_code: '', city: '' }
  const address = parts[0]
  // Drop trailing country when present.
  let rest = parts.slice(1)
  if (rest.length >= 2) rest = rest.slice(0, -1)

  let zip_code = ''
  let city = ''
  for (const p of rest) {
    // "2200 København" / "2100 København Ø"
    const nordic = p.match(/^(\d{3,5})\s+(.+)$/)
    if (nordic) {
      zip_code = nordic[1]
      if (!city) city = nordic[2]
      continue
    }
    // Bare Nordic/US zip
    if (/^\d{3,5}$/.test(p)) {
      zip_code = p
      continue
    }
    // UK postcode (with or without space)
    if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(p)) {
      zip_code = p.toUpperCase()
      continue
    }
    if (!city) city = p
  }
  return { address, zip_code, city }
}

export async function fetchGeocodeSuggestions(q: string): Promise<GeocodeFeature[]> {
  if (q.trim().length < 2) return []
  try {
    const res = await fetch(apiUrl(`/clients/geocode/suggest?q=${encodeURIComponent(q)}`), { headers: authHeaders() })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data.features) ? data.features : []
  } catch {
    return []
  }
}

/** Create an offer with proposed dates (Phase 2). */
export async function createOffer(body: any): Promise<{ offer: any }> {
  const res = await fetch(apiUrl('/offers'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create offer')
  }
  return res.json()
}

export const useStableCallback = <T extends (...args: any[]) => any>(fn: T): T => {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback(((...args: any[]) => ref.current(...args)) as T, [])
}
