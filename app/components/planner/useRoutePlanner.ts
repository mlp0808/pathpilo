'use client'

/**
 * Headless route-planner engine.
 *
 * Everything the day planner *does* — building a day's routes, geocoding,
 * directions, reordering, cross-employee moves, draw mode, optimisation and
 * Save & apply — lives here, with no UI attached. `DayRoutePanel` and
 * `RouteMap` are both pure props-driven views, so any surface that wants a
 * planner just mounts this hook and hands the result to them.
 *
 * The map multitool drives it from the URL (`?focus=day|route`), which is what
 * lets you walk client → route → planner → back without a reload: the engine
 * stays mounted for as long as the date is unchanged, so unsaved edits survive
 * the round trip.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from '@/app/utils/api'
import { useAppI18n } from '@/app/components/I18nProvider'
import type { IsolatedRouteSeg, RouteJob, UserRoute } from '@/app/components/RouteMap'
import { colorForUserId } from '@/app/components/RouteMap'
import { buildDayRoutesFromJobs, type RouteUserLike } from '@/app/utils/dayRouteShared'
import { optimizeMiddleJobsClient } from '@/app/utils/clientRouteOptimize'
import { routesHaveDirections } from '@/app/utils/routeDirections'
import {
  applyDirections,
  cachedFetch,
  enhanceRouteWithHome,
  invalidateMapCaches,
} from '@/app/components/map/useMapData'
import {
  materializeProjectedJobsInList,
  modifiedRoundName,
} from '@/app/utils/materializeRouteJobs'

/** Local-day string, matching the rest of the app. */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toDateOnly(v: unknown): string {
  const s = String(v ?? '')
  return s.length >= 10 ? s.slice(0, 10) : s
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

/** Empty day shell so focusing an employee with no jobs still opens their planner. */
function emptyRouteForUser(userId: number, users: RouteUserLike[]): UserRoute {
  const user = users.find(u => u.id === userId)
  return {
    userId,
    userName: user ? `${user.first_name} ${user.last_name}` : `User ${userId}`,
    color: colorForUserId(userId),
    jobs: [],
  }
}

function ensureFocusRoute(
  routes: UserRoute[],
  focusUserId: number | null,
  users: RouteUserLike[],
): UserRoute[] {
  if (focusUserId == null) return routes
  if (routes.some(r => r.userId === focusUserId)) return routes
  return [...routes, emptyRouteForUser(focusUserId, users)]
}

/** Middle-stop order, used to tell a dirty route from a saved one. */
function fingerprintOf(route: UserRoute): string {
  // Normalize ids to strings — server/local mixes of number|string must not look dirty.
  return JSON.stringify(route.jobs.filter(j => !j.is_home).map(j => String(j.id)))
}

function routeOrderKey(companySlug: string, date: string) {
  return `route-order-${companySlug}-${date}`
}

export interface RoutePlannerOptions {
  /** Day being planned (YYYY-MM-DD). `null` parks the engine and clears it. */
  date: string | null
  users: RouteUserLike[]
  companySlug: string
  /** Fires after a successful Save & apply so the host can refresh its own views. */
  onSaved?: (date: string) => void
}

export interface RoutePlanner {
  date: string | null
  routes: UserRoute[]
  loading: boolean
  geocodingCount: number
  isDirectionsLoading: boolean

  /** Employee whose route is being edited; `null` = all-employees overview. */
  focusUserId: number | null
  setFocusUserId: (userId: number | null) => void
  /** Route that accepts draw picks — focus, or the only route for solo companies. */
  drawTargetUserId: number | null

  reorder: (userId: number, newJobs: RouteJob[]) => void
  reassignJob: (jobId: number | string, fromUserId: number, toUserId: number) => void
  setPendingAssignee: (jobId: number, userId: number) => void

  drawMode: boolean
  drawOrder: (number | string)[]
  drawRouteComparison: { diffMinutes: number } | null
  startDraw: () => void
  exitDraw: () => void
  resetDraw: () => void
  assignDraw: (jobId: number | string) => void

  optimizing: boolean
  optimizeNotice: string | null
  optimize: (userId: number) => Promise<void>
  bulkOptimize: (
    userIds: number[],
    allowReassign: boolean,
    onProgress: (p: { step: number; total: number; message: string }) => void,
  ) => Promise<void>

  baselineMinutesByUser: Record<number, number>
  unsavedUserIds: number[]
  hasUnsavedChanges: boolean
  save: (userId?: number) => Promise<void>
  discardUser: (userId: number) => void
  discardAll: () => void
  /** Instantly drop a job from the loaded day (after move-to-another-date, etc.). */
  removeJob: (jobId: number | string) => void

  hoveredJobId: number | string | null
  hoverJob: (jobId: number | string | null) => void
  clearHover: () => void
  /** Clear hover / selection / isolation — call when leaving the planner surface. */
  resetEphemeralUi: () => void
  isolatedLeg: IsolatedRouteSeg | null
  isolateLeg: (seg: IsolatedRouteSeg | null) => void

  /** All-employees panel hover/selection → which routes the map draws. */
  hoveredUserId: number | null
  setHoveredUserId: (userId: number | null) => void
  selectedUserIds: number[]
  setSelectedUserIds: (ids: number[]) => void
  visibleUserIds: number[] | null

  /** Raw job rows for the day, so hosts can open a job slideout. */
  jobsForDay: any[]
  /**
   * Re-fetch the day from the server (e.g. after CreateJob). Invalidates the
   * jobs cache first so the new stop shows up without a full page reload.
   */
  reload: () => void
  /**
   * Soft-merge a newly created job into the live day without a full rebuild.
   * Keeps the prior fingerprint so the day stays "unsaved" (park/list badges).
   * Slots the stop by cheapest detour and refreshes road geometry in place.
   */
  ingestCreatedJob: (jobId: number, opts?: { userId?: number | null }) => Promise<void>
  /** Planned-package metadata per user for this day (from daily_routes). */
  plannedMetaByUser: Record<number, PlannedRouteMeta>
  /**
   * Capture the in-memory day so a host can park unsaved edits (e.g. employee
   * multi-route scope) and restore them later without hitting Save.
   */
  exportSnapshot: () => RoutePlannerSnapshot | null
  /** Queue a snapshot to apply once the matching date finishes loading. */
  queueHydrate: (snap: RoutePlannerSnapshot) => void
  /** Apply a snapshot immediately when the engine is already on that date. */
  applySnapshotNow: (snap: RoutePlannerSnapshot) => void
}

/** Parked planner day — enough to restore unsaved order + assignee edits. */
export type RoutePlannerSnapshot = {
  date: string
  routes: UserRoute[]
  savedFingerprints: Record<number, string>
  pendingAssigneeChanges: Record<number, number>
  baselineMinutesByUser: Record<number, number>
  focusUserId: number | null
}

/** Planned-package (round) metadata for one user's saved day route. */
export interface PlannedRouteMeta {
  status?: string | null
  name?: string | null
  round_template_id?: number | null
  is_occurrence_override?: boolean | null
  /** Library / day round id when this day is a placed package. */
  round_id?: number | null
  /** Jobs in the saved planned package (fillers are any day jobs not listed). */
  job_ids?: number[]
}

export function useRoutePlanner({
  date,
  users,
  companySlug,
  onSaved,
}: RoutePlannerOptions): RoutePlanner {
  // Loosened: the generated MessageKey union doesn't cover the routePlanner keys.
  const { t } = useAppI18n() as unknown as { t: (key: string, fallback: string) => string }

  const [routes, setRoutes] = useState<UserRoute[]>([])
  const [jobsForDay, setJobsForDay] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [geocodingCount, setGeocodingCount] = useState(0)
  const [focusUserId, setFocusUserIdState] = useState<number | null>(null)

  const [drawMode, setDrawMode] = useState(false)
  const [drawOrder, setDrawOrder] = useState<(number | string)[]>([])
  const [drawRouteComparison, setDrawRouteComparison] = useState<{ diffMinutes: number } | null>(null)

  const [optimizing, setOptimizing] = useState(false)
  const [optimizeNotice, setOptimizeNotice] = useState<string | null>(null)

  const [baselineMinutesByUser, setBaselineMinutesByUser] = useState<Record<number, number>>({})
  const [savedFingerprints, setSavedFingerprints] = useState<Record<number, string>>({})
  const [pendingAssigneeChanges, setPendingAssigneeChanges] = useState<Record<number, number>>({})

  const [hoveredJobId, setHoveredJobId] = useState<number | string | null>(null)
  const [isolatedLeg, setIsolatedLeg] = useState<IsolatedRouteSeg | null>(null)
  const [hoveredUserId, setHoveredUserId] = useState<number | null>(null)
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  /** Bumped to force a fresh day load without changing the date. */
  const [reloadTick, setReloadTick] = useState(0)
  /** daily_routes planned-package metadata per user for the current day. */
  const [plannedMetaByUser, setPlannedMetaByUser] = useState<Record<number, PlannedRouteMeta>>({})
  const plannedMetaRef = useRef(plannedMetaByUser)
  plannedMetaRef.current = plannedMetaByUser

  // Latest routes for async work that must not close over a stale render.
  const routesRef = useRef<UserRoute[]>([])
  routesRef.current = routes
  // Read inside the loader without making it a dependency — a drag-reassign
  // must not rebuild the whole day from scratch.
  const pendingRef = useRef<Record<number, number>>({})
  pendingRef.current = pendingAssigneeChanges
  const focusUserIdRef = useRef<number | null>(focusUserId)
  focusUserIdRef.current = focusUserId

  const discardSnapshots = useRef<Record<number, UserRoute>>({})
  const loadSeq = useRef(0)
  /** Parked unsaved day waiting to replace the next successful load for that date. */
  const hydrateRef = useRef<RoutePlannerSnapshot | null>(null)
  const drawBaselineRef = useRef<number | null>(null)
  const drawCompareTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const optimizeNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isolateClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const directionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    for (const timer of [
      drawCompareTimer, optimizeNoticeTimer, hoverClearTimer, isolateClearTimer, directionsTimer,
    ]) {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const usersKey = useMemo(
    () => users.map(u => u.id).sort((a, b) => a - b).join(','),
    [users],
  )

  // ── Load the day ──────────────────────────────────────────────────────────
  // Pins appear as soon as the jobs land, then the route upgrades in place with
  // home waypoints, geocoded stops and real road geometry.
  useEffect(() => {
    if (!date || users.length === 0) {
      setRoutes([])
      setJobsForDay([])
      return
    }
    const seq = ++loadSeq.current
    const alive = () => loadSeq.current === seq
    setLoading(true)
    // Fingerprints are re-established when this load finishes so home inject /
    // order apply never looks like an unsaved edit.
    setSavedFingerprints({})

    ;(async () => {
      let dayJobs: any[] = []
      try {
        const data = await cachedFetch<{ jobs: any[] }>(
          `jobs:v2:${date}`,
          `/jobs?start_date=${date}&end_date=${date}`,
          30_000,
        )
        dayJobs = (data.jobs || []).filter(j => toDateOnly(j.scheduled_date) === date)
      } catch {
        if (alive()) { setRoutes([]); setJobsForDay([]); setLoading(false) }
        return
      }
      if (!alive()) return
      setJobsForDay(dayJobs)

      // Unsaved cross-employee moves win over the server's assignment.
      const withPending = dayJobs.map(j => ({
        ...j,
        assigned_user_id: pendingRef.current[j.id] ?? j.assigned_user_id,
      }))
      const built = ensureFocusRoute(
        applySavedOrder(buildDayRoutesFromJobs(withPending, users), companySlug, date),
        focusUserIdRef.current,
        users,
      )
      // Keep loading=true until home + planned order land, so fingerprints never
      // lock onto a pre-home / pre-package intermediate order.
      setRoutes(built)

      const needsGeocode = built.reduce(
        (n, r) => n + r.jobs.filter(j => !j.is_cancelled && j.address && (j.lat == null || j.lng == null)).length,
        0,
      )
      if (needsGeocode > 0) setGeocodingCount(needsGeocode)

      const withHome = ensureFocusRoute(
        await Promise.all(built.map(r => enhanceRouteWithHome(r))),
        focusUserIdRef.current,
        users,
      )
      if (!alive()) return
      const ordered = applyPlannedPackageOrder(withHome, plannedMetaRef.current)

      const hydrate = hydrateRef.current
      if (hydrate && hydrate.date === date) {
        hydrateRef.current = null
        setRoutes(hydrate.routes)
        setSavedFingerprints(hydrate.savedFingerprints)
        setPendingAssigneeChanges(hydrate.pendingAssigneeChanges)
        setBaselineMinutesByUser(hydrate.baselineMinutesByUser)
        if (hydrate.focusUserId != null) setFocusUserIdState(hydrate.focusUserId)
        setLoading(false)
        setGeocodingCount(0)
        hydrate.routes.forEach(async route => {
          const patch = await applyDirections(route, `dir:hydrate:${date}:${route.userId}`)
          if (!alive() || !patch) return
          setRoutes(prev => prev.map(r => (r.userId === route.userId ? { ...r, ...patch } : r)))
        })
        return
      }

      setRoutes(ordered)
      setSavedFingerprints(
        Object.fromEntries(ordered.map(r => [r.userId, fingerprintOf(r)])),
      )
      setLoading(false)
      setGeocodingCount(0)
      persistGeocodedCoords(built, withHome)

      withHome.forEach(async route => {
        const patch = await applyDirections(route, `dir:${date}:${route.userId}`)
        if (!alive() || !patch) return
        setRoutes(prev => prev.map(r => (r.userId === route.userId ? { ...r, ...patch } : r)))
      })
    })()
  }, [date, usersKey, companySlug, reloadTick]) // eslint-disable-line react-hooks/exhaustive-deps -- users tracked via usersKey

  // Focused employee with no jobs that day still needs a planner shell.
  useEffect(() => {
    if (focusUserId == null || users.length === 0) return
    setRoutes(prev => ensureFocusRoute(prev, focusUserId, users))
  }, [focusUserId, usersKey, date, reloadTick]) // eslint-disable-line react-hooks/exhaustive-deps -- users via usersKey

  // ── Planned-package metadata ───────────────────────────────────────────────
  // Which users already have this day saved as a planned package / round.
  useEffect(() => {
    if (!date) { setPlannedMetaByUser({}); return }
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(apiUrl(`/daily-routes?start_date=${date}&end_date=${date}`), {
          headers: authHeaders(),
        })
        if (!res.ok || !alive) return
        const data = await res.json()
        if (!alive) return
        const next: Record<number, PlannedRouteMeta> = {}
        for (const row of data?.routes ?? []) {
          const jobIds = Array.isArray(row.job_ids)
            ? row.job_ids.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0)
            : typeof row.job_ids === 'string'
              ? String(row.job_ids).replace(/[{}]/g, '').split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0)
              : []
          next[Number(row.user_id)] = {
            status: (row.status === 'planned' || row.round_id != null) ? 'planned' : (row.status ?? null),
            name: row.name ?? null,
            round_template_id: row.round_template_id != null ? Number(row.round_template_id) : null,
            is_occurrence_override: row.is_occurrence_override ?? null,
            round_id: row.round_id != null ? Number(row.round_id) : null,
            job_ids: jobIds,
          }
        }
        setPlannedMetaByUser(next)
        // Keep planned package order first; same-day fillers sit after until planned in.
        // Re-baseline fingerprints for routes that were still clean — otherwise the
        // async package order looks like an unsaved edit every time the planner opens.
        setRoutes(prev => {
          const ordered = applyPlannedPackageOrder(prev, next)
          setSavedFingerprints(fpPrev => {
            const fpNext = { ...fpPrev }
            for (const r of ordered) {
              const before = prev.find(x => x.userId === r.userId)
              const saved = fpPrev[r.userId]
              const wasClean = saved == null || (before != null && fingerprintOf(before) === saved)
              if (wasClean) fpNext[r.userId] = fingerprintOf(r)
            }
            return fpNext
          })
          return ordered
        })
      } catch { /* badge is a nicety, never block the planner */ }
    })()
    return () => { alive = false }
  }, [date, reloadTick])

  const reload = useCallback(() => {
    // Drop cached jobs/directions so the next fetch sees the brand-new job,
    // and treat the reloaded day as a clean saved baseline (no false "unsaved").
    invalidateMapCaches()
    setSavedFingerprints({})
    setBaselineMinutesByUser({})
    discardSnapshots.current = {}
    setReloadTick(t => t + 1)
  }, [])

  const mergeDirectionsPatch = useCallback((userId: number, patch: Partial<UserRoute>) => {
    setRoutes(prev => {
      const next = prev.map(prevRoute => {
        if (prevRoute.userId !== userId) return prevRoute
        return {
          ...prevRoute,
          totalMinutes: patch.totalMinutes ?? prevRoute.totalMinutes,
          totalKm: patch.totalKm ?? prevRoute.totalKm,
          routeGeometry: patch.routeGeometry ?? prevRoute.routeGeometry,
          jobs: prevRoute.jobs.map(prevJob => {
            const patched = (patch.jobs ?? []).find(j => String(j.id) === String(prevJob.id))
            return patched
              ? { ...prevJob, legMinutes: patched.legMinutes, etaMinutes: patched.etaMinutes }
              : prevJob
          }),
        }
      })
      routesRef.current = next
      return next
    })
  }, [])

  /**
   * Add a just-created job into the live route without rebuilding the whole day.
   * Preserves the previous fingerprint → stays unsaved for park / Save & apply.
   */
  const ingestCreatedJob = useCallback(async (jobId: number, opts?: { userId?: number | null }) => {
    if (!date) {
      reload()
      return
    }
    try {
      const res = await fetch(apiUrl(`/jobs/${jobId}`), { headers: authHeaders() })
      const data = await res.json().catch(() => ({}))
      const raw = data.job || data
      if (!res.ok || raw?.id == null) {
        reload()
        return
      }

      invalidateMapCaches()

      const built = buildDayRoutesFromJobs([raw], users)
      const routeJob = built[0]?.jobs?.[0]
      if (!routeJob) {
        reload()
        return
      }

      const uid = Number(
        opts?.userId
        ?? raw.assigned_user_id
        ?? focusUserIdRef.current,
      )
      if (!Number.isFinite(uid)) {
        reload()
        return
      }

      setJobsForDay(prev => {
        if (prev.some(j => String(j.id) === String(raw.id))) return prev
        return [...prev, {
          ...raw,
          assigned_user_id: uid,
        }]
      })

      let forDirections: UserRoute | null = null
      setRoutes(prev => {
        const base = ensureFocusRoute(prev, uid, users)
        const next = base.map(r => {
          if (r.userId !== uid) return r
          if (r.jobs.some(j => String(j.id) === String(routeJob.id))) return r
          return {
            ...r,
            jobs: insertAtCheapestSlot(r.jobs, routeJob, uid),
            // Keep prior road geometry until the new Directions patch arrives
            // so the line doesn't blank out into dashed birdseye stubs.
            totalMinutes: undefined,
            totalKm: undefined,
          }
        })
        const target = next.find(r => r.userId === uid) || null
        forDirections = target ? { ...target, routeGeometry: undefined } : null
        routesRef.current = next
        return next
      })

      // Intentionally leave savedFingerprints alone so this day is dirty.

      if (forDirections && date) {
        const patch = await applyDirections(forDirections, `dir:ingest:${date}:${uid}`)
        if (patch) mergeDirectionsPatch(uid, patch)
      }
    } catch {
      reload()
    }
  }, [date, users, reload, mergeDirectionsPatch])

  // A new day is a clean slate: nothing is unsaved, nothing is being drawn.
  useEffect(() => {
    setSavedFingerprints({})
    setPendingAssigneeChanges({})
    setBaselineMinutesByUser({})
    discardSnapshots.current = {}
    setDrawMode(false)
    setDrawOrder([])
    setDrawRouteComparison(null)
    drawBaselineRef.current = null
  }, [date])

  // ── Directions refresh after an edit ──────────────────────────────────────
  // Reorder/reassign clears geometry on the routes it touched; only those refetch.
  const coordsKey = routes
    .map(r => `${r.userId}#${r.jobs.map(j => `${j.id}:${j.lat?.toFixed(5)}:${j.lng?.toFixed(5)}`).join(',')}`)
    .join('|')

  useEffect(() => {
    if (!date) return
    if (directionsTimer.current) clearTimeout(directionsTimer.current)
    directionsTimer.current = setTimeout(async () => {
      const snapshot = routesRef.current
      if (routesHaveDirections(snapshot)) return
      const stale = snapshot.filter(r => r.routeGeometry == null)
      if (stale.length === 0) return

      const patches = new Map<number, Partial<UserRoute>>()
      await Promise.all(stale.map(async route => {
        const patch = await applyDirections(route, `dir:${date}:${route.userId}`)
        if (patch) patches.set(route.userId, patch)
      }))
      if (patches.size === 0) return

      // Merge onto current state, not the snapshot, so coordinates written by
      // geocoding while this was in flight survive.
      for (const [userId, patch] of patches) {
        mergeDirectionsPatch(userId, patch)
      }

      // First directions for the day become the "before you touched it" baseline.
      setBaselineMinutesByUser(prev => {
        const next = { ...prev }
        let changed = false
        for (const route of snapshot) {
          if (next[route.userId] != null) continue
          const total = patches.get(route.userId)?.totalMinutes ?? route.totalMinutes
          if (total != null) { next[route.userId] = total; changed = true }
        }
        return changed ? next : prev
      })
    }, 220)
    return () => { if (directionsTimer.current) clearTimeout(directionsTimer.current) }
  }, [coordsKey, date, mergeDirectionsPatch])

  // Each route is "saved" the first time we see it after a load finishes.
  // Skip while loading so an empty focus shell never locks a false dirty state.
  useEffect(() => {
    if (loading || routes.length === 0) return
    setSavedFingerprints(prev => {
      let changed = false
      const next = { ...prev }
      for (const r of routes) {
        if (next[r.userId] == null) { next[r.userId] = fingerprintOf(r); changed = true }
      }
      return changed ? next : prev
    })
  }, [routes, loading])

  const unsavedUserIds = useMemo(
    () => routes
      .filter(r => {
        const saved = savedFingerprints[r.userId]
        return saved != null && fingerprintOf(r) !== saved
      })
      .map(r => r.userId),
    [routes, savedFingerprints],
  )
  const hasUnsavedChanges = unsavedUserIds.length > 0

  useEffect(() => {
    for (const r of routes) {
      if (!unsavedUserIds.includes(r.userId)) discardSnapshots.current[r.userId] = r
    }
  }, [routes, unsavedUserIds])

  // ── Editing ───────────────────────────────────────────────────────────────

  const reorder = useCallback((userId: number, newJobs: RouteJob[]) => {
    setRoutes(prev => prev.map(r => (
      r.userId === userId
        ? { ...r, jobs: newJobs, routeGeometry: undefined, totalMinutes: undefined, totalKm: undefined }
        : r
    )))
  }, [])

  const reassignJob = useCallback((
    jobId: number | string,
    fromUserId: number,
    toUserId: number,
  ) => {
    if (fromUserId === toUserId) return
    setRoutes(prev => {
      const fromRoute = prev.find(r => r.userId === fromUserId)
      const toRoute = prev.find(r => r.userId === toUserId)
      if (!fromRoute || !toRoute) return prev
      const moving = fromRoute.jobs.find(j => String(j.id) === String(jobId))
      if (!moving || moving.is_home) return prev

      const nextFromJobs = fromRoute.jobs.filter(j => String(j.id) !== String(jobId))
      const nextToJobs = insertAtCheapestSlot(toRoute.jobs, moving, toUserId)

      return prev.map(r => {
        if (r.userId === fromUserId) {
          return { ...r, jobs: nextFromJobs, routeGeometry: undefined, totalMinutes: undefined, totalKm: undefined }
        }
        if (r.userId === toUserId) {
          return { ...r, jobs: nextToJobs, routeGeometry: undefined, totalMinutes: undefined, totalKm: undefined }
        }
        return r
      })
    })
    if (Number.isInteger(Number(jobId))) {
      setPendingAssigneeChanges(prev => ({ ...prev, [Number(jobId)]: toUserId }))
    }
  }, [])

  const setPendingAssignee = useCallback((jobId: number, userId: number) => {
    setPendingAssigneeChanges(prev => ({ ...prev, [jobId]: userId }))
  }, [])

  // ── Hover / isolation ─────────────────────────────────────────────────────

  const hoverJob = useCallback((jobId: number | string | null) => {
    if (hoverClearTimer.current) { clearTimeout(hoverClearTimer.current); hoverClearTimer.current = null }
    if (jobId === null) {
      // Clear immediately — deferred clears were racing Mapbox redraws and leaving
      // sticky highlights after the pointer already left.
      setHoveredJobId(null)
    } else {
      setHoveredJobId(jobId)
    }
  }, [])

  const clearHover = useCallback(() => {
    if (hoverClearTimer.current) { clearTimeout(hoverClearTimer.current); hoverClearTimer.current = null }
    setHoveredJobId(null)
  }, [])

  const resetEphemeralUi = useCallback(() => {
    clearHover()
    setHoveredUserId(null)
    setSelectedUserIds([])
    if (isolateClearTimer.current) { clearTimeout(isolateClearTimer.current); isolateClearTimer.current = null }
    setIsolatedLeg(null)
    setDrawMode(false)
    setDrawOrder([])
  }, [clearHover])

  const isolateLeg = useCallback((seg: IsolatedRouteSeg | null) => {
    if (isolateClearTimer.current) { clearTimeout(isolateClearTimer.current); isolateClearTimer.current = null }
    // Clear immediately — deferred nulls were leaving a sliced route visible after leave.
    setIsolatedLeg(seg)
  }, [])

  const setFocusUserId = useCallback((userId: number | null) => {
    setFocusUserIdState(userId)
    if (userId != null) {
      setHoveredUserId(null)
      setSelectedUserIds([])
    }
    setDrawMode(false)
    setDrawOrder([])
    clearHover()
    if (isolateClearTimer.current) { clearTimeout(isolateClearTimer.current); isolateClearTimer.current = null }
    setIsolatedLeg(null)
  }, [clearHover])

  // Solo companies never focus an employee, so fall back to the only route.
  const drawTargetUserId = focusUserId ?? (routes.length === 1 ? routes[0]?.userId ?? null : null)

  const visibleUserIds = useMemo((): number[] | null => {
    if (focusUserId != null) return null
    if (hoveredUserId != null) return [hoveredUserId]
    if (selectedUserIds.length > 0) return selectedUserIds
    return null
  }, [focusUserId, hoveredUserId, selectedUserIds])

  // ── Draw mode ─────────────────────────────────────────────────────────────

  const showComparison = useCallback((diffMinutes: number) => {
    if (drawCompareTimer.current) clearTimeout(drawCompareTimer.current)
    setDrawRouteComparison({ diffMinutes })
    drawCompareTimer.current = setTimeout(() => {
      setDrawRouteComparison(null)
      drawCompareTimer.current = null
    }, 8000)
  }, [])

  const clearComparison = useCallback(() => {
    drawBaselineRef.current = null
    if (drawCompareTimer.current) { clearTimeout(drawCompareTimer.current); drawCompareTimer.current = null }
    setDrawRouteComparison(null)
  }, [])

  const startDraw = useCallback(() => {
    const uid = focusUserId ?? (routes.length === 1 ? routes[0]?.userId ?? null : null)
    const route = uid != null ? routes.find(r => r.userId === uid) : null
    const tm = route?.totalMinutes
    drawBaselineRef.current = tm != null && Number.isFinite(tm) && tm > 0 ? tm : null
    if (drawCompareTimer.current) { clearTimeout(drawCompareTimer.current); drawCompareTimer.current = null }
    // RouteMap needs a focused user to know which route accepts picks.
    if (uid != null && focusUserId == null) setFocusUserIdState(uid)
    setDrawRouteComparison(null)
    setDrawMode(true)
    setDrawOrder([])
    clearHover()
  }, [focusUserId, routes, clearHover])

  const exitDraw = useCallback(() => {
    clearComparison()
    setDrawMode(false)
    setDrawOrder([])
    clearHover()
  }, [clearComparison, clearHover])

  const resetDraw = useCallback(() => setDrawOrder([]), [])

  const assignDraw = useCallback((jobId: number | string) => {
    const userId = drawTargetUserId
    if (userId == null) return
    const route = routes.find(r => r.userId === userId)
    if (!route) return
    const middleJobs = route.jobs.filter(j => !j.is_cancelled && !j.is_home)
    if (!middleJobs.some(j => String(j.id) === String(jobId))) return

    setDrawOrder(prev => {
      const idx = prev.findIndex(id => String(id) === String(jobId))
      // Clicking a numbered stop takes it back out and renumbers the rest.
      if (idx !== -1) return prev.filter(id => String(id) !== String(jobId))
      const next = [...prev, jobId]
      if (next.length < middleJobs.length) return next

      const orderedMiddle = next
        .map(id => middleJobs.find(j => String(j.id) === String(id)))
        .filter((j): j is RouteJob => !!j)
      const fullOrder = withHomeAndCancelled(route, orderedMiddle)

      const baseline = drawBaselineRef.current
      queueMicrotask(() => {
        void (async () => {
          try {
            const patch = await applyDirections({ ...route, jobs: fullOrder }, `dir:draw:${route.userId}`)
            const newTotal = patch?.totalMinutes
            if (baseline != null && newTotal != null && Math.abs(baseline - newTotal) >= 0.5) {
              showComparison(baseline - newTotal)
            }
          } catch { /* comparison is a nicety, never block the reorder */ }
        })()
      })
      // Small beat so the last number is visible before the list resettles.
      setTimeout(() => {
        reorder(userId, fullOrder)
        setDrawMode(false)
        setDrawOrder([])
        clearHover()
      }, 280)
      return next
    })
  }, [drawTargetUserId, routes, reorder, clearHover, showComparison])

  // Losing the draw target (focus cleared, route gone) must not strand the mode.
  useEffect(() => {
    if (drawMode && drawTargetUserId == null) {
      clearComparison()
      setDrawMode(false)
      setDrawOrder([])
    }
  }, [drawMode, drawTargetUserId, clearComparison])

  // ── Optimisation ──────────────────────────────────────────────────────────

  const notify = useCallback((msg: string, ms = 6000) => {
    setOptimizeNotice(msg)
    if (optimizeNoticeTimer.current) clearTimeout(optimizeNoticeTimer.current)
    optimizeNoticeTimer.current = setTimeout(() => setOptimizeNotice(null), ms)
  }, [])

  const optimize = useCallback(async (userId: number) => {
    const route = routesRef.current.find(r => r.userId === userId)
    if (!route) return

    const middleJobs = route.jobs.filter(j => !j.is_cancelled && !j.is_home && j.lat != null && j.lng != null)
    if (middleJobs.length < 2) {
      notify(t('app.routePlanner.optimizeNeedTwoStops', 'Need at least 2 located stops to optimize.'))
      return
    }

    setOptimizing(true)
    setOptimizeNotice(null)
    try {
      const ordered = await optimizedMiddleOrder(route, middleJobs)
      reorder(userId, withHomeAndCancelled(route, ordered.jobs))
      if (ordered.savedMinutes != null && ordered.savedMinutes >= 0.5) {
        showComparison(ordered.savedMinutes)
      } else {
        notify(t('app.routePlanner.optimizeAlreadyFast', 'This is already the fastest order we found.'))
      }
    } catch (err) {
      console.warn('[planner] optimize failed', err)
      notify(t('app.routePlanner.optimizeFailed', 'Could not optimize this route. Try again in a moment.'))
    }
    setOptimizing(false)
  }, [notify, reorder, showComparison, t])

  const bulkOptimize = useCallback(async (
    userIds: number[],
    allowReassign: boolean,
    onProgress: (p: { step: number; total: number; message: string }) => void,
  ) => {
    if (userIds.length === 0) return

    if (!allowReassign) {
      const total = userIds.length
      for (let i = 0; i < userIds.length; i++) {
        const route = routesRef.current.find(r => r.userId === userIds[i])
        onProgress({ step: i, total, message: `Optimising route for ${route?.userName ?? `Employee ${i + 1}`}…` })
        await optimize(userIds[i])
        await new Promise(r => setTimeout(r, 80))
      }
      onProgress({ step: total, total, message: 'Done!' })
      return
    }

    // Geo-first territories: anchor everyone at their home, hand each job to the
    // nearest anchor, then solve each employee's own patch. Geography decides —
    // workload is deliberately not balanced, because that's what produces tight,
    // local routes instead of criss-crossing ones.
    const routeSet = routesRef.current.filter(r => userIds.includes(r.userId))
    const k = routeSet.length
    const totalSteps = k + 2
    let step = 0

    onProgress({ step: step++, total: totalSteps, message: 'Pooling jobs…' })
    await new Promise(r => setTimeout(r, 30))

    type PooledJob = RouteJob & { _origUserId: number }
    const pooled: PooledJob[] = routeSet.flatMap(route =>
      route.jobs
        .filter(j => !j.is_cancelled && !j.is_home && j.lat != null && j.lng != null)
        .map(j => ({ ...j, _origUserId: route.userId })),
    )
    if (pooled.length === 0) {
      onProgress({ step: totalSteps, total: totalSteps, message: 'No jobs to reassign.' })
      return
    }

    onProgress({ step: step++, total: totalSteps, message: 'Mapping territories…' })
    await new Promise(r => setTimeout(r, 30))

    const territories = assignTerritories(routeSet, pooled)

    const moves: Record<number, number> = {}
    for (let ei = 0; ei < k; ei++) {
      const route = routeSet[ei]
      const middleJobs = territories[ei]
      onProgress({
        step: step++,
        total: totalSteps,
        message: `Optimising ${route.userName} (${middleJobs.length} stop${middleJobs.length !== 1 ? 's' : ''})…`,
      })

      let orderedMiddle: RouteJob[] = middleJobs
      if (middleJobs.length >= 2) {
        try {
          orderedMiddle = (await optimizedMiddleOrder(route, middleJobs)).jobs
        } catch { /* keep the territory order */ }
      }
      reorder(route.userId, withHomeAndCancelled(route, orderedMiddle))

      for (const job of middleJobs) {
        if (job._origUserId !== route.userId && Number.isInteger(Number(job.id))) {
          moves[Number(job.id)] = route.userId
        }
      }
      await new Promise(r => setTimeout(r, 80))
    }

    // Territory moves are assignee changes — Save & apply has to persist them.
    if (Object.keys(moves).length > 0) {
      setPendingAssigneeChanges(prev => ({ ...prev, ...moves }))
    }
    onProgress({ step: totalSteps, total: totalSteps, message: 'All routes updated!' })
  }, [optimize, reorder])

  // ── Save & apply ──────────────────────────────────────────────────────────

  const save = useCallback(async (userId?: number) => {
    if (!date) return
    const current = routesRef.current
    const routesToSave = userId != null
      ? current.filter(r => r.userId === userId)
      : current.filter(r => unsavedUserIds.includes(r.userId))
    if (routesToSave.length === 0) return

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (!token) return

    // Ghost/subscription stops must become real jobs before they can join a
    // planned round. Materialize in order, then persist the full package.
    let materializedRoutes: UserRoute[] = routesToSave
    try {
      const results = await Promise.all(routesToSave.map(async (route) => {
        const { jobs, changed } = await materializeProjectedJobsInList(route.jobs, {
          token,
          scheduledDate: date,
        })
        return { route: { ...route, jobs }, changed }
      }))
      if (results.some(r => r.changed)) {
        materializedRoutes = results.map(r => r.route)
        setRoutes(prev => prev.map(r => {
          const next = materializedRoutes.find(m => m.userId === r.userId)
          return next ?? r
        }))
        routesRef.current = routesRef.current.map(r => {
          const next = materializedRoutes.find(m => m.userId === r.userId)
          return next ?? r
        })
      } else {
        materializedRoutes = results.map(r => r.route)
      }
    } catch (err) {
      console.error('[planner] materialize-before-save failed', err)
      return
    }

    const orderedIds = materializedRoutes.flatMap(r =>
      r.jobs.filter(j => !j.is_projected && Number.isInteger(Number(j.id))).map(j => Number(j.id)),
    )
    if (orderedIds.length === 0) return

    try {
      const res = await fetch(apiUrl('/jobs/route-order'), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ orderedIds }),
      })
      if (!res.ok) {
        console.error('[planner] route-order save failed:', res.status, await res.text())
        return
      }
    } catch (err) {
      console.error('[planner] route-order network error', err)
      return
    }

    clearComparison()

    // Saved order is the new baseline — deltas count from the next edit on.
    setBaselineMinutesByUser(prev => {
      const next = { ...prev }
      for (const route of materializedRoutes) {
        if (route.totalMinutes != null && Number.isFinite(route.totalMinutes)) {
          next[route.userId] = route.totalMinutes
        }
      }
      return next
    })

    markDayPlanned(companySlug, date)
    persistRouteOrder(companySlug, date, materializedRoutes)

    const pending = { ...pendingAssigneeChanges }
    if (Object.keys(pending).length > 0) {
      setPendingAssigneeChanges({})
      await Promise.all(Object.entries(pending).map(([jobId, newUserId]) =>
        fetch(apiUrl(`/jobs/${jobId}/assignee`), {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ assigned_user_id: newUserId, notifyCustomer: false }),
        }).catch(() => {}),
      ))
    }

    const metaByUser = plannedMetaByUser
    await Promise.all(materializedRoutes.map(route => {
      const prior = metaByUser[route.userId]
      const priorName = prior?.name || null
      // Template-linked days get an explicit "{name} (modified)" day unit.
      // Library round placements let the API rename only when fillers join.
      const name = prior?.round_template_id
        ? modifiedRoundName(priorName || route.userName || 'Round')
        : undefined
      return saveDailyRoute(route, date, name)
    }))

    // Reflect the server-side planned flag immediately.
    setPlannedMetaByUser(prev => {
      const next = { ...prev }
      for (const r of materializedRoutes) {
        const prior = prev[r.userId]
        next[r.userId] = {
          ...(prior ?? {}),
          status: 'planned',
          name: prior?.round_template_id
            ? (modifiedRoundName(prior.name || r.userName || 'Round') ?? prior?.name)
            : prior?.name,
          // Keep package link so the day stays a unit after save.
          round_id: prior?.round_id ?? null,
          job_ids: r.jobs
            .filter(j => !j.is_projected && !j.is_cancelled && !j.is_home && Number.isInteger(Number(j.id)))
            .map(j => Number(j.id)),
        }
      }
      return next
    })

    setSavedFingerprints(prev => {
      const next = { ...prev }
      for (const r of materializedRoutes) next[r.userId] = fingerprintOf(r)
      return next
    })

    // Anything reading jobs/routes elsewhere on the map is now stale.
    invalidateMapCaches()
    onSaved?.(date)
  }, [date, companySlug, unsavedUserIds, pendingAssigneeChanges, plannedMetaByUser, clearComparison, onSaved])

  const discardUser = useCallback((userId: number) => {
    const snap = discardSnapshots.current[userId]
    if (!snap) return
    setRoutes(prev => prev.map(r => (r.userId === userId ? snap : r)))
    setSavedFingerprints(prev => ({ ...prev, [userId]: fingerprintOf(snap) }))
  }, [])

  const discardAll = useCallback(() => {
    const snaps = discardSnapshots.current
    setRoutes(prev => prev.map(r => snaps[r.userId] ?? r))
    setSavedFingerprints(prev => {
      const next = { ...prev }
      for (const [uid, snap] of Object.entries(snaps)) next[Number(uid)] = fingerprintOf(snap)
      return next
    })
  }, [])

  const removeJob = useCallback((jobId: number | string) => {
    const id = String(jobId)
    setJobsForDay(prev => prev.filter(j => String(j.id) !== id))
    setRoutes(prev => {
      const next = prev.map(r => {
        if (!r.jobs.some(j => String(j.id) === id)) return r
        return {
          ...r,
          jobs: r.jobs.filter(j => String(j.id) !== id),
          routeGeometry: undefined,
          totalMinutes: undefined,
          totalKm: undefined,
        }
      })
      // Date move already persisted — keep the day looking saved.
      setSavedFingerprints(fpPrev => {
        const fpNext = { ...fpPrev }
        for (const r of next) {
          if (prev.some(p => p.userId === r.userId && p.jobs.some(j => String(j.id) === id))) {
            fpNext[r.userId] = fingerprintOf(r)
          }
        }
        return fpNext
      })
      setBaselineMinutesByUser(bPrev => {
        const bNext = { ...bPrev }
        for (const r of next) {
          if (prev.some(p => p.userId === r.userId && p.jobs.some(j => String(j.id) === id))) {
            delete bNext[r.userId]
          }
        }
        return bNext
      })
      return next
    })
  }, [])

  const exportSnapshot = useCallback((): RoutePlannerSnapshot | null => {
    if (!date || routes.length === 0) return null
    return {
      date,
      routes: routesRef.current.map(r => ({ ...r, jobs: [...r.jobs] })),
      savedFingerprints: { ...savedFingerprints },
      pendingAssigneeChanges: { ...pendingAssigneeChanges },
      baselineMinutesByUser: { ...baselineMinutesByUser },
      focusUserId,
    }
  }, [date, routes.length, savedFingerprints, pendingAssigneeChanges, baselineMinutesByUser, focusUserId])

  const queueHydrate = useCallback((snap: RoutePlannerSnapshot) => {
    hydrateRef.current = snap
  }, [])

  const applySnapshotNow = useCallback((snap: RoutePlannerSnapshot) => {
    if (date !== snap.date) {
      hydrateRef.current = snap
      return
    }
    hydrateRef.current = null
    setRoutes(snap.routes)
    setSavedFingerprints(snap.savedFingerprints)
    setPendingAssigneeChanges(snap.pendingAssigneeChanges)
    setBaselineMinutesByUser(snap.baselineMinutesByUser)
    if (snap.focusUserId != null) setFocusUserIdState(snap.focusUserId)
  }, [date])

  const isDirectionsLoading = routes.some(
    r => !r.routeGeometry && r.jobs.filter(j => j.lat != null && j.lng != null && !j.is_cancelled).length >= 2,
  )

  return {
    date,
    routes,
    loading,
    geocodingCount,
    isDirectionsLoading,
    focusUserId,
    setFocusUserId,
    drawTargetUserId,
    reorder,
    reassignJob,
    setPendingAssignee,
    drawMode,
    drawOrder,
    drawRouteComparison,
    startDraw,
    exitDraw,
    resetDraw,
    assignDraw,
    optimizing,
    optimizeNotice,
    optimize,
    bulkOptimize,
    baselineMinutesByUser,
    unsavedUserIds,
    hasUnsavedChanges,
    save,
    discardUser,
    discardAll,
    removeJob,
    hoveredJobId,
    hoverJob,
    clearHover,
    resetEphemeralUi,
    isolatedLeg,
    isolateLeg,
    hoveredUserId,
    setHoveredUserId,
    selectedUserIds,
    setSelectedUserIds,
    visibleUserIds,
    jobsForDay,
    reload,
    ingestCreatedJob,
    plannedMetaByUser,
    exportSnapshot,
    queueHydrate,
    applySnapshotNow,
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Rebuild a route's job list around a new middle order, keeping home + cancelled in place. */
function withHomeAndCancelled(route: UserRoute, middle: RouteJob[]): RouteJob[] {
  const start = route.jobs.find(j => j.is_home && String(j.id).startsWith('start-'))
  const end = route.jobs.find(j => j.is_home && String(j.id).startsWith('end-'))
  const placed = new Set(middle.map(j => String(j.id)))
  const leftovers = route.jobs.filter(
    j => !j.is_home && !j.is_cancelled && !placed.has(String(j.id)),
  )
  const cancelled = route.jobs.filter(j => j.is_cancelled)
  return [
    ...(start ? [start] : []),
    ...middle,
    ...leftovers,
    ...(end ? [end] : []),
    ...cancelled,
  ]
}

/** Fastest visiting order for a set of middle stops, anchored at home start/end. */
async function optimizedMiddleOrder(
  route: UserRoute,
  middleJobs: RouteJob[],
): Promise<{ jobs: RouteJob[]; savedMinutes: number | null }> {
  const start = route.jobs.find(j => j.is_home && String(j.id).startsWith('start-'))
  const end = route.jobs.find(j => j.is_home && String(j.id).startsWith('end-'))
  const result = await optimizeMiddleJobsClient(
    middleJobs.map(j => ({ id: j.id, lat: j.lat as number, lng: j.lng as number })),
    {
      start: start?.lat != null && start?.lng != null ? { lat: start.lat, lng: start.lng } : null,
      end: end?.lat != null && end?.lng != null ? { lat: end.lat, lng: end.lng } : null,
    },
  )
  const byId = new Map(middleJobs.map(j => [String(j.id), j] as const))
  const sorted = result.orderedIds.map(id => byId.get(String(id))).filter((j): j is RouteJob => !!j)
  const placed = new Set(sorted.map(j => String(j.id)))
  for (const j of middleJobs) if (!placed.has(String(j.id))) sorted.push(j)

  const savedMinutes = (result.beforeSeconds - result.afterSeconds) / 60
  return { jobs: sorted, savedMinutes: Number.isFinite(savedMinutes) ? savedMinutes : null }
}

/**
 * Slot a moved stop into the target route where it adds the least detour.
 * Straight-line proxy only — Mapbox draws the real road right after.
 * Home start/end stay pinned at the ends of the list (never become middle stops).
 */
function insertAtCheapestSlot(targetJobs: RouteJob[], moving: RouteJob, toUserId: number): RouteJob[] {
  const start = targetJobs.find(j => j.is_home && String(j.id).startsWith('start-'))
  const end = targetJobs.find(j => j.is_home && String(j.id).startsWith('end-'))
  const middle = targetJobs.filter(j => !j.is_home)
  const nextJob = { ...moving, assigned_user_id: toUserId } as RouteJob

  let insertAt = middle.length // default: just before End

  if (moving.lat != null && moving.lng != null) {
    const d = (aLat: number, aLng: number, bLat: number, bLng: number) => {
      const dLat = aLat - bLat
      const dLng = (aLng - bLng) * Math.cos((aLat * Math.PI) / 180)
      return Math.sqrt(dLat * dLat + dLng * dLng)
    }
    const locatedMiddle = middle.filter(j => j.lat != null && j.lng != null)
    const chain: RouteJob[] = [
      ...(start != null && start.lat != null && start.lng != null ? [start] : []),
      ...locatedMiddle,
      ...(end != null && end.lat != null && end.lng != null ? [end] : []),
    ]

    if (chain.length >= 2) {
      let bestCost = Infinity
      for (let i = 0; i < chain.length - 1; i++) {
        const a = chain[i]
        const b = chain[i + 1]
        const cost =
          d(a.lat as number, a.lng as number, moving.lat, moving.lng)
          + d(moving.lat, moving.lng, b.lat as number, b.lng as number)
          - d(a.lat as number, a.lng as number, b.lat as number, b.lng as number)

        let midIdx: number
        if (end && String(b.id) === String(end.id)) {
          midIdx = middle.length
        } else {
          const found = middle.findIndex(j => String(j.id) === String(b.id))
          midIdx = found >= 0 ? found : middle.length
        }

        if (cost < bestCost) {
          bestCost = cost
          insertAt = midIdx
        }
      }
    }
  }

  const nextMiddle = [...middle]
  nextMiddle.splice(Math.max(0, Math.min(insertAt, nextMiddle.length)), 0, nextJob)
  return [
    ...(start ? [start] : []),
    ...nextMiddle,
    ...(end ? [end] : []),
  ]
}

/**
 * Split a job pool across employees by geography. Everyone is anchored at their
 * home; employees sharing one depot are pulled apart with compact k-means so
 * nobody ends up owning two disjoint blobs.
 */
function assignTerritories<T extends RouteJob & { _origUserId: number }>(
  routes: UserRoute[],
  pooled: T[],
): T[][] {
  // Longitude shrinks toward the poles — scale it so squared distances reflect
  // real ground distance (it matters this far north).
  const refLat = pooled.reduce((s, j) => s + (j.lat as number), 0) / pooled.length
  const LNG_SCALE = Math.cos((refLat * Math.PI) / 180)
  const dist2 = (a: [number, number], b: [number, number]) => {
    const dLat = a[0] - b[0]
    const dLng = (a[1] - b[1]) * LNG_SCALE
    return dLat * dLat + dLng * dLng
  }

  const kMeans = (points: [number, number][], numK: number, maxIter = 60): number[] => {
    if (numK <= 1 || points.length === 0) return points.map(() => 0)
    if (numK >= points.length) return points.map((_, i) => i % numK)
    const centroids: [number, number][] = [points[Math.floor(Math.random() * points.length)]]
    while (centroids.length < numK) {
      const dists = points.map(p => Math.min(...centroids.map(c => dist2(p, c))))
      const total = dists.reduce((s, d) => s + d, 0)
      let rand = Math.random() * total
      let chosen = points[points.length - 1]
      for (let i = 0; i < points.length; i++) {
        rand -= dists[i]
        if (rand <= 0) { chosen = points[i]; break }
      }
      centroids.push([...chosen] as [number, number])
    }
    let assignments = new Array(points.length).fill(0)
    for (let iter = 0; iter < maxIter; iter++) {
      const next = points.map(p => {
        let best = 0, bestD = Infinity
        centroids.forEach((c, ci) => { const d = dist2(p, c); if (d < bestD) { bestD = d; best = ci } })
        return best
      })
      if (next.every((a, i) => a === assignments[i])) break
      assignments = next
      for (let ci = 0; ci < numK; ci++) {
        const clPts = points.filter((_, i) => assignments[i] === ci)
        if (clPts.length === 0) {
          centroids[ci] = points[Math.floor(Math.random() * points.length)]
        } else {
          centroids[ci] = [
            clPts.reduce((s, p) => s + p[0], 0) / clPts.length,
            clPts.reduce((s, p) => s + p[1], 0) / clPts.length,
          ]
        }
      }
    }
    return assignments
  }

  const globalCentroid: [number, number] = [
    refLat,
    pooled.reduce((s, j) => s + (j.lng as number), 0) / pooled.length,
  ]
  const anchorOf = (route: UserRoute): [number, number] => {
    const home = route.jobs.find(
      j => j.is_home && String(j.id).startsWith('start-') && j.lat != null && j.lng != null,
    )
    if (home) return [home.lat as number, home.lng as number]
    const own = route.jobs.filter(j => !j.is_cancelled && !j.is_home && j.lat != null && j.lng != null)
    if (own.length > 0) {
      return [
        own.reduce((s, j) => s + (j.lat as number), 0) / own.length,
        own.reduce((s, j) => s + (j.lng as number), 0) / own.length,
      ]
    }
    return globalCentroid
  }
  const anchors = routes.map(anchorOf)

  // 3 decimals ≈ 100 m, so everyone on one shared depot lands in a single group.
  const groupByKey = new Map<string, number[]>()
  anchors.forEach((a, ei) => {
    const key = `${a[0].toFixed(3)},${a[1].toFixed(3)}`
    const existing = groupByKey.get(key)
    if (existing) existing.push(ei)
    else groupByKey.set(key, [ei])
  })
  const groups = Array.from(groupByKey.values()).map(members => ({
    members,
    anchor: [
      members.reduce((s, ei) => s + anchors[ei][0], 0) / members.length,
      members.reduce((s, ei) => s + anchors[ei][1], 0) / members.length,
    ] as [number, number],
  }))

  const groupJobs: T[][] = groups.map(() => [])
  for (const job of pooled) {
    let best = 0, bestD = Infinity
    groups.forEach((g, gi) => {
      const d = dist2([job.lat as number, job.lng as number], g.anchor)
      if (d < bestD) { bestD = d; best = gi }
    })
    groupJobs[best].push(job)
  }

  const employeeJobs: T[][] = Array.from({ length: routes.length }, () => [])
  groups.forEach((g, gi) => {
    const jobs = groupJobs[gi]
    if (g.members.length === 1) {
      employeeJobs[g.members[0]] = jobs
      return
    }
    const sub = kMeans(jobs.map(j => [j.lat as number, j.lng as number]), g.members.length)
    g.members.forEach((ei, ci) => {
      employeeJobs[ei] = jobs.filter((_, ji) => sub[ji] === ci)
    })
  })
  return employeeJobs
}

/** Re-apply the stop order the user last saved for this day. */
function applySavedOrder(routes: UserRoute[], companySlug: string, date: string): UserRoute[] {
  if (typeof window === 'undefined') return routes
  try {
    const raw = localStorage.getItem(routeOrderKey(companySlug, date))
    if (!raw) return routes
    const orderMap: Record<number, (number | string)[]> = JSON.parse(raw)
    return routes.map(route => {
      const savedIds = orderMap[route.userId]
      if (!savedIds) return route
      return {
        ...route,
        jobs: [...route.jobs].sort((a, b) => {
          const ia = savedIds.indexOf(a.id as never)
          const ib = savedIds.indexOf(b.id as never)
          if (ia === -1 && ib === -1) return 0
          if (ia === -1) return 1
          if (ib === -1) return -1
          return ia - ib
        }),
      }
    })
  } catch {
    return routes
  }
}

/** Planned package jobs first (server order); fillers / other day jobs after. */
function applyPlannedPackageOrder(
  routes: UserRoute[],
  metaByUser: Record<number, PlannedRouteMeta>,
): UserRoute[] {
  return routes.map(route => {
    const packageIds = metaByUser[route.userId]?.job_ids
    if (!packageIds?.length || route.jobs.length === 0) return route
    const rank = new Map(packageIds.map((id, i) => [id, i]))
    return {
      ...route,
      jobs: [...route.jobs].sort((a, b) => {
        if (a.is_home && !b.is_home) return -1
        if (!a.is_home && b.is_home) return 1
        const ia = rank.has(Number(a.id)) ? rank.get(Number(a.id))! : Number.POSITIVE_INFINITY
        const ib = rank.has(Number(b.id)) ? rank.get(Number(b.id))! : Number.POSITIVE_INFINITY
        if (ia !== ib) return ia - ib
        return 0
      }),
    }
  })
}

function persistRouteOrder(companySlug: string, date: string, routes: UserRoute[]) {
  try {
    const key = routeOrderKey(companySlug, date)
    let orderMap: Record<number, (number | string)[]> = {}
    try { orderMap = JSON.parse(localStorage.getItem(key) ?? '{}') } catch { /* ignore */ }
    for (const route of routes) {
      orderMap[route.userId] = route.jobs.filter(j => !j.is_home).map(j => j.id)
    }
    localStorage.setItem(key, JSON.stringify(orderMap))
  } catch { /* ignore */ }
}

function markDayPlanned(companySlug: string, date: string) {
  try {
    const key = `planned-days-${companySlug}`
    const existing: string[] = JSON.parse(localStorage.getItem(key) ?? '[]')
    if (!existing.includes(date)) {
      localStorage.setItem(key, JSON.stringify([...existing, date]))
    }
  } catch { /* ignore */ }
}

/** Persist the day's planned package + totals. Always writes status=planned so a
 *  Round unit is created even when directions can't be computed yet. */
async function saveDailyRoute(route: UserRoute, date: string, name?: string | null) {
  const realJobs = route.jobs.filter(
    j => !j.is_projected && !j.is_cancelled && !j.is_home && Number.isInteger(Number(j.id)),
  )
  if (realJobs.length === 0) return

  const waypointJobs = route.jobs.filter(j => j.lat != null && j.lng != null && !j.is_cancelled)
  const totalJobMins = realJobs.reduce((sum, j) => sum + (j.estimated_duration_minutes ?? 0), 0)

  let totalDriveMins: number | null = route.totalMinutes != null ? Math.round(route.totalMinutes) : null
  let totalKm: number | null = route.totalKm != null ? Math.round(route.totalKm * 10) / 10 : null
  // Seed from in-memory legs first so a directions failure never sends null.
  let legMins: number[] = realJobs.map((real) => {
    const onRoute = route.jobs.find((j) => Number(j.id) === Number(real.id))
    return onRoute?.legMinutes != null && Number.isFinite(onRoute.legMinutes)
      ? Math.round(onRoute.legMinutes * 10) / 10
      : 0
  })
  let routeGeometry: string | null = route.routeGeometry?.coordinates
    ? JSON.stringify(route.routeGeometry.coordinates)
    : null

  try {
    if (waypointJobs.length >= 2) {
      const directions = await applyDirections({ ...route, jobs: waypointJobs }, `dir:save:${date}:${route.userId}`)
      if (totalDriveMins == null && directions?.totalMinutes != null) {
        totalDriveMins = Math.round(directions.totalMinutes)
      }
      if (totalKm == null && directions?.totalKm != null) {
        totalKm = Math.round(directions.totalKm * 10) / 10
      }
      if (directions?.jobs?.length) {
        legMins = realJobs.map((real, i) => {
          const j = directions.jobs!.find((d) => Number(d.id) === Number(real.id))
          if (j?.legMinutes != null && Number.isFinite(j.legMinutes)) {
            return Math.round(j.legMinutes * 10) / 10
          }
          return legMins[i] ?? 0
        })
      }
      if (!routeGeometry && directions?.routeGeometry?.coordinates) {
        routeGeometry = JSON.stringify(directions.routeGeometry.coordinates)
      }
    }
  } catch {
    /* directions are best-effort — still save the planned package */
  }

  try {
    const res = await fetch(apiUrl('/daily-routes'), {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        user_id: route.userId,
        scheduled_date: date,
        job_ids: realJobs.map(j => Number(j.id)),
        leg_minutes: legMins,
        total_minutes: totalDriveMins,
        total_job_minutes: Math.round(totalJobMins),
        total_km: totalKm,
        route_geometry: routeGeometry,
        status: 'planned',
        ...(name ? { name } : {}),
      }),
    })
    if (!res.ok) {
      console.error('[planner] daily-routes save failed:', res.status, await res.text())
    } else {
      try {
        const { requestMissionsRefresh } = await import('@/app/config/missions')
        requestMissionsRefresh()
      } catch { /* ignore */ }
    }
  } catch (err) {
    console.error('[planner] daily-routes network error', err)
  }
}

/**
 * Write back coordinates we geocoded for real job rows, so the next visit (and
 * the mobile app) gets them for free. Projected stops have no row to write to.
 */
function persistGeocodedCoords(before: UserRoute[], after: UserRoute[]) {
  const known = new Map<string, RouteJob>()
  for (const r of before) for (const j of r.jobs) known.set(String(j.id), j)

  for (const route of after) {
    for (const job of route.jobs) {
      if (job.is_home || job.is_projected) continue
      if (job.lat == null || job.lng == null) continue
      if (!Number.isInteger(Number(job.id))) continue
      const prev = known.get(String(job.id))
      if (!prev || (prev.lat != null && prev.lng != null)) continue
      fetch(apiUrl(`/jobs/${job.id}/coordinates`), {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ lat: job.lat, lng: job.lng }),
      }).catch(() => {})
    }
  }
}

export { toLocalDateString }
