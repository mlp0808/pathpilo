'use client'

/**
 * Map multitool — /[company]/map
 *
 * One map surface for everything location-related. The URL is the state
 * (see app/components/map/mapMode.ts) and the left sidebar adapts to it:
 * day routes, one employee's route/range, a client's route memberships, or a
 * prospect location with nearest-routes placement suggestions and offers.
 *
 * Heavy day-route logic is shared with the jobs planner via
 * app/utils/dayRouteShared.ts — this page never re-implements it.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import AppLayout from '@/app/components/AppLayout'
import type { UserRoute, OverlayPin } from '@/app/components/RouteMap'
import { colorForUserId, initialsFromName } from '@/app/components/RouteMap'
import {
  parseMapMode,
  modeToQuery,
  todayStr,
  weekRangeContaining,
  MAP_SEARCH_PICK_EVENT,
  MAP_ADD_TO_ROUTE_EVENT,
  withReturnTo,
  resolvePlannerBack,
  type MapMode,
} from '@/app/components/map/mapMode'
import { readMapLayerPrefs, writeMapLayerPrefs } from '@/app/components/map/mapLayerPrefs'
import MapSidebar from '@/app/components/map/MapSidebar'
import MapPlannerPanel from '@/app/components/map/MapPlannerPanel'
import MapSearch from '@/app/components/map/MapSearch'
import MapProfileStack from '@/app/components/map/MapProfileStack'
import type { ClientExploreLayer } from '@/app/components/map/ClientExplorePanel'
import SandboxPlannerPanel, {
  addStopToRound,
  createPlaygroundRound,
  useSandboxRound,
} from '@/app/components/map/SandboxPlannerPanel'
import {
  HomeIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import JobViewSlideout from '@/app/components/JobViewSlideout'
import { visitSiblingsFor } from '@/app/utils/visitMerge'
import CreateJob from '@/app/components/CreateJob'
import { useRoutePlanner, type RoutePlannerSnapshot } from '@/app/components/planner/useRoutePlanner'
import type { ParkedRouteMeta } from '@/app/components/map/EmployeeExplorePanel'
import type { RouteDayKey } from '@/app/components/map/NearestRoutesList'
import {
  MAP_OPEN_OVERLAY_EVENT,
  clientOverlayKey,
  locationOverlayKey,
  overlayFromClientDetail,
  overlayFromEmployeeDetail,
  overlayFromLocationDetail,
  upsertOverlay,
  type MapOpenOverlayDetail,
  type MapOverlay,
  type MapOverlayLocation,
} from '@/app/components/map/mapOverlays'
import {
  cachedGeocodeLookup,
  fetchAllClients,
  fetchClient,
  fetchDayCapacityMinutes,
  findClientAtPlace,
  invalidateMapCaches,
  useCompanyUsers,
  useEmployeeHomes,
  usePreviewRoutes,
  type MapClient,
  type NearestClientRow,
  type PreviewRouteSelection,
} from '@/app/components/map/useMapData'

// mapbox-gl cannot be server-rendered
const RouteMap = dynamic(() => import('@/app/components/RouteMap'), { ssr: false })

const NEAR_CLIENT_COLOR = '#6366F1'
const ALL_CLIENTS_COLOR = '#9CA3AF'
/** Dark brand green — selected clients + searched location pins. */
const SELECTED_CLIENT_COLOR = '#193434'

/** Seed overlay/explore state from a deep-link URL so the first paint already
 *  has a focusPoint — avoids racing Mapbox init against a post-mount effect. */
function seedFromSearchParams(sp: URLSearchParams): {
  overlays: MapOverlay[]
  exploreLocation: MapOverlayLocation | null
  exploreClientId: number | null
} {
  const mode = parseMapMode(sp)
  if (mode.kind === 'location') {
    const loc = overlayFromLocationDetail({
      kind: 'location',
      lat: mode.lat,
      lng: mode.lng,
      label: mode.label,
      ...(mode.address ? { address: mode.address } : {}),
      ...(mode.zip_code ? { zip_code: mode.zip_code } : {}),
      ...(mode.city ? { city: mode.city } : {}),
    })
    return { overlays: [loc], exploreLocation: loc, exploreClientId: null }
  }
  if (mode.kind === 'client') {
    const overlays: MapOverlay[] =
      mode.lat != null && mode.lng != null
        ? [overlayFromClientDetail({
            kind: 'client',
            clientId: mode.clientId,
            lat: mode.lat,
            lng: mode.lng,
          })]
        : []
    return { overlays, exploreLocation: null, exploreClientId: mode.clientId }
  }
  return { overlays: [], exploreLocation: null, exploreClientId: null }
}

function MapMultitoolInner() {
  const params = useParams()
  const companySlug = String(params?.company || '')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Depend on the string value — the searchParams object identity can stay stable across replaces.
  const queryString = searchParams.toString()

  const mode: MapMode = useMemo(
    () => parseMapMode(new URLSearchParams(queryString)),
    [queryString]
  )

  const users = useCompanyUsers()
  const employeeHomes = useEmployeeHomes(users)

  // Preview: client/location modes can show any number of candidate route-days on the map at
  // once (multi-select). Deliberately separate from useDayRoutes below — it fetches only the
  // exact (date, employee) pairs the user picked, never every employee on that day, to keep
  // Mapbox Directions usage (paid API) and load time minimal.
  const [previewSelections, setPreviewSelections] = useState<Map<RouteDayKey, PreviewRouteSelection>>(new Map())
  const previewKeys = useMemo(() => Array.from(previewSelections.keys()), [previewSelections])
  const previewSelectionList = useMemo(() => Array.from(previewSelections.values()), [previewSelections])
  const { routes: previewRoutes, routesByKey: previewRoutesByKey, loadingDirections: previewLoading, reload: reloadPreviewRoutes } = usePreviewRoutes(previewSelectionList, users)

  // Reset preview when the mode *target* changes — not when only the client calendar
  // span (?spanFrom=&spanTo=) is refined, so the URL can drive the filter without a flash.
  const previewResetKey =
    mode.kind === 'client' ? `client:${mode.clientId}`
    : mode.kind === 'location' ? `location:${mode.lat.toFixed(4)},${mode.lng.toFixed(4)}`
    : mode.kind === 'employee' ? `employee:${mode.userId}:${mode.from}`
    : mode.kind === 'idle' ? 'idle'
    : modeToQuery(mode)
  useEffect(() => {
    setPreviewSelections(prev => (prev.size === 0 ? prev : new Map()))
  }, [previewResetKey])

  // Leaving contexts that own their own preview must drop leftovers.
  // idle (client explore) + employee keep preview until the user clears / leaves.
  useEffect(() => {
    if (
      mode.kind === 'client'
      || mode.kind === 'location'
      || mode.kind === 'employee'
      || mode.kind === 'idle'
    ) return
    setPreviewSelections(prev => (prev.size === 0 ? prev : new Map()))
  }, [mode.kind])

  // Client context (for the pin + "linked client" prospect flow)
  const [activeClient, setActiveClient] = useState<MapClient | null>(null)
  const onClientLoaded = useCallback((c: MapClient | null) => setActiveClient(c), [])

  // Nearest-client pins (Prospect Mode tab) — clients + the search radius used to find them
  const [nearClients, setNearClients] = useState<{ clients: NearestClientRow[]; radiusKm: number } | null>(null)
  const onNearestClientsLoaded = useCallback(
    (payload: { clients: NearestClientRow[]; radiusKm: number } | null) => setNearClients(payload),
    []
  )

  // All clients with saved coords, no geocoding cost (plain cached /clients list). Loaded once so
  // it's ready both for the idle default view and the "keep browsing" client backdrop below.
  const [allClients, setAllClients] = useState<MapClient[]>([])
  useEffect(() => {
    let alive = true
    fetchAllClients()
      .then(list => { if (alive) setAllClients(list) })
      .catch(() => { if (alive) setAllClients([]) })
    return () => { alive = false }
  }, [])

  // After scheduling/updating a job from the map UI, drop TTL caches and reload
  // the planner day so the new stop shows up without a full page refresh.
  // Save & apply only needs the cache/preview refresh — planner state is already correct.
  const plannerReloadRef = useRef<() => void>(() => {})
  const refreshMapAfterJobMutation = useCallback(() => {
    invalidateMapCaches()
    reloadPreviewRoutes()
    fetchAllClients()
      .then(setAllClients)
      .catch(() => {})
  }, [reloadPreviewRoutes])
  const onJobsChanged = useCallback(() => {
    refreshMapAfterJobMutation()
    plannerReloadRef.current()
  }, [refreshMapAfterJobMutation])

  // ── The planner ───────────────────────────────────────────────────────────
  // day/route modes *are* the route planner. The engine stays mounted after you
  // leave those modes (plannerDate is sticky), so stepping out to a client card
  // and back keeps unsaved edits and drawn orders intact — no reload, no reset.
  //
  // Round unit planner (by id). Separate from day/route useRoutePlanner.
  const isDayPlannerMode = mode.kind === 'day' || mode.kind === 'route'
  const isRoundMode = mode.kind === 'round'
  const isPlannerMode = isDayPlannerMode || isRoundMode
  const modePlannerDate = isDayPlannerMode ? mode.date : null
  const [plannerDate, setPlannerDate] = useState<string | null>(modePlannerDate)
  useEffect(() => {
    if (modePlannerDate && modePlannerDate !== plannerDate) setPlannerDate(modePlannerDate)
  }, [modePlannerDate, plannerDate])

  /** Employee-scoped parked day drafts (edit freely across routes, save later). */
  const [parkedDrafts, setParkedDrafts] = useState<Record<string, RoutePlannerSnapshot>>({})
  const parkedDraftsRef = useRef(parkedDrafts)
  parkedDraftsRef.current = parkedDrafts
  const [savingAllParked, setSavingAllParked] = useState(false)

  const planner = useRoutePlanner({
    date: plannerDate,
    users,
    companySlug,
    onSaved: (date) => {
      refreshMapAfterJobMutation()
      setParkedDrafts(prev => {
        const next = { ...prev }
        for (const key of Object.keys(next)) {
          if (key.startsWith(`${date}:`)) delete next[key]
        }
        return next
      })
    },
  })
  plannerReloadRef.current = planner.reload
  const plannerRemoveJobRef = useRef(planner.removeJob)
  plannerRemoveJobRef.current = planner.removeJob
  const hasUnsavedRef = useRef(planner.hasUnsavedChanges)
  hasUnsavedRef.current = planner.hasUnsavedChanges
  const plannerRef = useRef(planner)
  plannerRef.current = planner

  const parkedRouteMeta: ParkedRouteMeta[] = useMemo(() => {
    return Object.entries(parkedDrafts).map(([key, snap]) => {
      const userId = Number(key.split(':')[1])
      const route = snap.routes.find(r => r.userId === userId) ?? snap.routes[0]
      const jobs = (route?.jobs || []).filter(j => !j.is_home && !j.is_cancelled)
      const workMinutes = jobs.reduce((s, j) => s + (j.estimated_duration_minutes || 0), 0)
      const driveMinutes = Math.max(0, Math.round(Number(route?.totalMinutes) || 0))
      return {
        date: snap.date,
        userId,
        workMinutes,
        driveMinutes,
        stopCount: jobs.length,
      }
    })
  }, [parkedDrafts])

  const parkFocusedDraft = useCallback((opts?: { force?: boolean }) => {
    const p = plannerRef.current
    if (!p.date) return null
    if (!opts?.force && !p.hasUnsavedChanges) return null
    const snap = p.exportSnapshot()
    if (!snap) return null
    const uid =
      p.focusUserId
      ?? (mode.kind === 'route' ? mode.userId : null)
      ?? p.unsavedUserIds[0]
    if (uid == null) return null
    if (!opts?.force && !p.unsavedUserIds.includes(uid)) return null
    const key = `${snap.date}:${uid}`
    setParkedDrafts(prev => ({ ...prev, [key]: snap }))
    return key
  }, [mode])

  const isEmployeeScopedMode = useCallback((m: MapMode) => {
    if (m.kind === 'employee') return true
    if (m.kind === 'route' || m.kind === 'round') {
      const back = resolvePlannerBack(m)
      return back?.kind === 'mode' && back.mode.kind === 'employee'
    }
    return false
  }, [])

  const roundModeId = isRoundMode ? mode.roundId : null
  const sandbox = useSandboxRound(roundModeId)
  /** Live sandbox routes (with directions geometry) from the planner panel. */
  const [sandboxLiveRoutes, setSandboxLiveRoutes] = useState<UserRoute[]>([])

  useEffect(() => {
    if (!isRoundMode) setSandboxLiveRoutes([])
  }, [isRoundMode])

  const routes = isRoundMode
    ? (sandboxLiveRoutes.length > 0
      ? sandboxLiveRoutes
      : (sandbox.round
        ? [{
            userId: -9000,
            userName: sandbox.round.name?.trim() || 'New round',
            color: colorForUserId(-9000),
            jobs: (sandbox.round.stops || []).map((stop: any) => {
              const lat = stop.resolved_lat ?? stop.lat
              const lng = stop.resolved_lng ?? stop.lng
              const name = stop.client_name
                ? `${stop.client_name}${stop.client_last_name ? ` ${stop.client_last_name}` : ''}`.trim()
                : null
              return {
                id: `stop:${stop.id}`,
                lat: lat != null && Number.isFinite(Number(lat)) ? Number(lat) : null,
                lng: lng != null && Number.isFinite(Number(lng)) ? Number(lng) : null,
                label: name || stop.label || `Stop #${stop.id}`,
                address: [stop.address, stop.zip_code, stop.city].filter(Boolean).join(', '),
                estimated_duration_minutes: Number(stop.estimated_duration_minutes || 30) || 30,
                has_own_coords: lat != null && lng != null,
                client_id: stop.client_id != null && Number.isFinite(Number(stop.client_id))
                  ? Number(stop.client_id)
                  : null,
              }
            }),
          }]
        : []))
    : planner.routes

  const plannerFocusUserId = mode.kind === 'route' ? mode.userId : null
  const setPlannerFocus = planner.setFocusUserId
  useEffect(() => {
    if (!isDayPlannerMode) return
    setPlannerFocus(plannerFocusUserId)
  }, [isDayPlannerMode, plannerFocusUserId, setPlannerFocus])

  // Capacity per employee, for the planner's workload bars.
  const [capacityByUser, setCapacityByUser] = useState<Record<number, number>>({})
  const capacityUserKey = routes.map(r => r.userId).sort((a, b) => a - b).join(',')
  useEffect(() => {
    if (!plannerDate || capacityUserKey === '') return
    let alive = true
    ;(async () => {
      const ids = capacityUserKey.split(',').map(Number)
      const entries = await Promise.all(
        ids.map(async id => [id, await fetchDayCapacityMinutes(id, plannerDate)] as const),
      )
      if (alive) setCapacityByUser(Object.fromEntries(entries))
    })()
    return () => { alive = false }
  }, [plannerDate, capacityUserKey])

  // Job slideout + "add job", opened from inside the day/route/round planner.
  const [viewingJob, setViewingJob] = useState<any>(null)
  const onPlannerJobUpdated = useCallback((meta?: { jobId?: number | string; scheduledDate?: string | null }) => {
    const jobId = meta?.jobId
    const nextDate = meta?.scheduledDate != null ? String(meta.scheduledDate).slice(0, 10) : null
    // Moving a stop to another day: drop it from the open route list immediately.
    if (jobId != null && nextDate && plannerDate && nextDate !== plannerDate) {
      plannerRemoveJobRef.current(jobId)
      refreshMapAfterJobMutation()
      setViewingJob(null)
      return
    }
    onJobsChanged()
  }, [onJobsChanged, plannerDate, refreshMapAfterJobMutation])
  const [createJobOpen, setCreateJobOpen] = useState(false)
  const [createJobDate, setCreateJobDate] = useState<string | null>(null)
  const [createJobUserId, setCreateJobUserId] = useState<number | null>(null)
  const [createJobClientId, setCreateJobClientId] = useState<number | undefined>(undefined)
  const [createJobLockSchedule, setCreateJobLockSchedule] = useState(false)
  /** When set, CreateJob result is linked onto a round instead of only refreshing the day. */
  const [createJobRoundAction, setCreateJobRoundAction] = useState<null | 'plan-new' | 'add-round'>(null)
  const [createJobNewClient, setCreateJobNewClient] = useState<{
    name?: string
    address?: string
    zip_code?: string
    city?: string
    lat?: number | null
    lng?: number | null
  } | null>(null)
  /** Overlay key for a location that is being turned into a client via CreateJob. */
  const [createJobLocationKey, setCreateJobLocationKey] = useState<string | null>(null)

  const createJobRoundActionRef = useRef(createJobRoundAction)
  createJobRoundActionRef.current = createJobRoundAction

  const closeCreateJob = useCallback(() => {
    setCreateJobOpen(false)
    setCreateJobDate(null)
    setCreateJobUserId(null)
    setCreateJobClientId(undefined)
    setCreateJobNewClient(null)
    setCreateJobLocationKey(null)
    setCreateJobLockSchedule(false)
    setCreateJobRoundAction(null)
  }, [])

  const openCreateJobForRoute = useCallback((opts: {
    date?: string | null
    userId?: number | null
    clientId?: number
    lockSchedule?: boolean
    roundAction?: 'plan-new' | 'add-round' | null
    locationKey?: string | null
    newClient?: {
      name?: string
      address?: string
      zip_code?: string
      city?: string
      lat?: number | null
      lng?: number | null
    } | null
  }) => {
    setCreateJobDate(opts.date ?? null)
    setCreateJobUserId(opts.userId ?? null)
    setCreateJobClientId(opts.clientId)
    setCreateJobNewClient(opts.clientId ? null : (opts.newClient ?? null))
    setCreateJobLocationKey(
      opts.clientId
        ? null
        : (opts.locationKey
          ?? (opts.newClient?.lat != null && opts.newClient?.lng != null
            ? locationOverlayKey(opts.newClient.lat, opts.newClient.lng)
            : null)),
    )
    setCreateJobLockSchedule(!!opts.lockSchedule)
    setCreateJobRoundAction(opts.roundAction ?? null)
    setCreateJobOpen(true)
  }, [])

  const openPlannerJob = useCallback((jobId: number | string) => {
    if (planner.drawMode) return
    const job = planner.jobsForDay.find(j => String(j.id) === String(jobId))
    if (job) setViewingJob(job)
  }, [planner.drawMode, planner.jobsForDay])

  // Prefill date/user from the active day/route when opening "add job" from the panel.
  // Route (employee+day) locks schedule; day-only scheduling stays editable.
  const openAddJobFromPlanner = useCallback(() => {
    if (mode.kind !== 'day' && mode.kind !== 'route') return
    openCreateJobForRoute({
      date: mode.date,
      userId: mode.kind === 'route' ? mode.userId : null,
      lockSchedule: mode.kind === 'route',
    })
  }, [mode, openCreateJobForRoute])

  const openAddJobForRound = useCallback((opts?: {
    clientId?: number | null
    newClient?: {
      name?: string
      address?: string
      zip_code?: string
      city?: string
      lat?: number | null
      lng?: number | null
    } | null
    action?: 'plan-new' | 'add-round'
  }) => {
    const action = opts?.action ?? 'add-round'
    const placementDate = sandbox.round?.scheduled_date
      ? String(sandbox.round.scheduled_date).slice(0, 10)
      : null
    const placementUser =
      sandbox.round?.assigned_user_id != null && Number.isFinite(Number(sandbox.round.assigned_user_id))
        ? Number(sandbox.round.assigned_user_id)
        : null
    openCreateJobForRoute({
      date: action === 'plan-new' ? null : placementDate,
      userId: action === 'plan-new' ? null : placementUser,
      lockSchedule: true,
      roundAction: action,
      clientId: opts?.clientId ?? undefined,
      newClient: opts?.clientId ? null : (opts?.newClient ?? null),
    })
  }, [openCreateJobForRoute, sandbox.round])

  // Mobile header search can fire "Add to route" via a custom event (header is
  // the only search on phones; the floating map search is desktop-only).
  useEffect(() => {
    const onAdd = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        clientId?: number
        newClient?: {
          name?: string
          address?: string
          zip_code?: string
          city?: string
          lat?: number | null
          lng?: number | null
        }
        date?: string
        userId?: number | null
      } | undefined
      if (!detail) return
      if (mode.kind === 'round') {
        openAddJobForRound({
          action: 'add-round',
          clientId: detail.clientId,
          newClient: detail.newClient ?? null,
        })
        return
      }
      if (!detail.date) return
      openCreateJobForRoute({
        date: detail.date,
        userId: detail.userId ?? null,
        clientId: detail.clientId,
        newClient: detail.newClient ?? null,
        lockSchedule: mode.kind === 'route',
      })
    }
    window.addEventListener(MAP_ADD_TO_ROUTE_EVENT, onAdd as EventListener)
    return () => window.removeEventListener(MAP_ADD_TO_ROUTE_EVENT, onAdd as EventListener)
  }, [openCreateJobForRoute, openAddJobForRound, mode])

  // Keep activeClient in sync with the URL immediately from the cached list so the
  // sidebar / linked-client flow don't wait on fetchClient (map selection uses selectedJobId).
  const clientModeId = mode.kind === 'client' ? mode.clientId : null
  useEffect(() => {
    if (clientModeId == null) return
    setActiveClient(prev => {
      if (prev?.id === clientModeId) return prev
      return allClients.find(c => c.id === clientModeId) ?? null
    })
  }, [clientModeId, allClients])

  // True when the current client view was opened by clicking a pin on the all-clients backdrop
  // (idle default view or a previous "keep browsing" client view). In that case we keep every
  // other pin visible and don't zoom — it should feel like browsing pins on a static map, not
  // searching/zooming to a new place each time.
  const [browsingAllClients, setBrowsingAllClients] = useState(false)
  useEffect(() => {
    if (mode.kind !== 'client') setBrowsingAllClients(false)
  }, [mode.kind])

  const [leavePrompt, setLeavePrompt] = useState<{
    next: MapMode
    opts?: { replace?: boolean }
    scope?: 'day' | 'employee'
  } | null>(null)
  const [leaveSaving, setLeaveSaving] = useState(false)

  const navigateRaw = useCallback((next: MapMode, opts?: { replace?: boolean }) => {
    const url = `${pathname}${modeToQuery(next)}`
    if (opts?.replace) router.replace(url, { scroll: false })
    else router.push(url, { scroll: false })
  }, [router, pathname])

  const leavesDayPlanner = useCallback((next: MapMode) => {
    if (!isDayPlannerMode) return false
    if (next.kind !== 'day' && next.kind !== 'route') return true
    return next.date !== mode.date
  }, [isDayPlannerMode, mode])

  const navigate = useCallback((next: MapMode, opts?: { replace?: boolean }) => {
    const currentScoped = isEmployeeScopedMode(mode) || Object.keys(parkedDraftsRef.current).length > 0
    const nextScoped = isEmployeeScopedMode(next)

    // Opening a day that already has a parked draft — restore it after load.
    if (next.kind === 'route' && nextScoped) {
      const key = `${next.date}:${next.userId}`
      const draft = parkedDraftsRef.current[key]
      if (draft) {
        if (plannerRef.current.date === draft.date) {
          plannerRef.current.applySnapshotNow(draft)
        } else {
          plannerRef.current.queueHydrate(draft)
        }
      }
    }

    // Stay inside the employee edit scope: park unsaved day and move freely.
    if (currentScoped && nextScoped) {
      if (isDayPlannerMode && hasUnsavedRef.current) {
        parkFocusedDraft()
      }
      navigateRaw(next, opts)
      return
    }

    // Leaving the employee scope with parked or live unsaved work.
    if (currentScoped && !nextScoped) {
      if (isDayPlannerMode && hasUnsavedRef.current) parkFocusedDraft()
      const hasParked = Object.keys(parkedDraftsRef.current).length > 0
      if (hasParked || hasUnsavedRef.current) {
        setLeavePrompt({ next, opts, scope: 'employee' })
        return
      }
    }

    if (leavesDayPlanner(next) && hasUnsavedRef.current) {
      setLeavePrompt({ next, opts, scope: 'day' })
      return
    }
    navigateRaw(next, opts)
  }, [isEmployeeScopedMode, mode, isDayPlannerMode, leavesDayPlanner, navigateRaw, parkFocusedDraft])

  const confirmLeaveSave = useCallback(async () => {
    if (!leavePrompt) return
    setLeaveSaving(true)
    try {
      if (leavePrompt.scope === 'employee') {
        if (plannerRef.current.hasUnsavedChanges) parkFocusedDraft()
        const entries = Object.entries(parkedDraftsRef.current)
        for (const [key, snap] of entries) {
          const userId = Number(key.split(':')[1])
          if (plannerRef.current.date === snap.date) {
            plannerRef.current.applySnapshotNow(snap)
          } else {
            plannerRef.current.queueHydrate(snap)
            setPlannerDate(snap.date)
            await new Promise<void>((resolve) => {
              const start = Date.now()
              const tick = () => {
                const p = plannerRef.current
                if (p.date === snap.date && !p.loading) resolve()
                else if (Date.now() - start > 10000) resolve()
                else setTimeout(tick, 50)
              }
              setTimeout(tick, 50)
            })
          }
          await plannerRef.current.save(userId)
        }
        setParkedDrafts({})
      } else {
        await planner.save()
      }
      const pending = leavePrompt
      setLeavePrompt(null)
      navigateRaw(pending.next, pending.opts)
    } finally {
      setLeaveSaving(false)
    }
  }, [leavePrompt, planner, navigateRaw, parkFocusedDraft])

  const confirmLeaveDiscard = useCallback(() => {
    if (!leavePrompt) return
    planner.discardAll()
    setParkedDrafts({})
    const pending = leavePrompt
    setLeavePrompt(null)
    navigateRaw(pending.next, pending.opts)
  }, [leavePrompt, planner, navigateRaw])

  const saveAllParked = useCallback(async () => {
    setSavingAllParked(true)
    try {
      if (plannerRef.current.hasUnsavedChanges) parkFocusedDraft()
      const entries = Object.entries(parkedDraftsRef.current)
      for (const [key, snap] of entries) {
        const userId = Number(key.split(':')[1])
        if (plannerRef.current.date === snap.date) {
          plannerRef.current.applySnapshotNow(snap)
        } else {
          plannerRef.current.queueHydrate(snap)
          setPlannerDate(snap.date)
          await new Promise<void>((resolve) => {
            const start = Date.now()
            const tick = () => {
              const p = plannerRef.current
              if (p.date === snap.date && !p.loading) resolve()
              else if (Date.now() - start > 10000) resolve()
              else setTimeout(tick, 50)
            }
            setTimeout(tick, 50)
          })
        }
        await plannerRef.current.save(userId)
        setParkedDrafts(prev => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      }
      refreshMapAfterJobMutation()
    } finally {
      setSavingAllParked(false)
    }
  }, [parkFocusedDraft, refreshMapAfterJobMutation])

  // Empty create shell (?focus=round, no id) stays local until the first stop
  // is added — then handleJobCreatedForRound mints the playground round + URL id.
  // Do not create empty drafts just by opening the planner.

  type ProfileStop = {
    clientId?: number | null
    label: string
    address?: string
    zip_code?: string
    city?: string
    lat?: number | null
    lng?: number | null
    /** When adding from a searched-location card — used to convert the overlay. */
    locationKey?: string
  }

  /** Profile card → Create job (locked Any) then start a playground round. */
  const handlePlanNewRoute = useCallback((stop: ProfileStop) => {
    openAddJobForRound({
      action: 'plan-new',
      clientId: stop.clientId,
      newClient: stop.clientId
        ? null
        : {
            name: stop.label,
            address: stop.address,
            zip_code: stop.zip_code,
            city: stop.city,
            lat: stop.lat,
            lng: stop.lng,
          },
    })
  }, [openAddJobForRound])

  /** Profile card → Create job onto current round, or onto day/route. */
  const handleAddToRoute = useCallback((stop: ProfileStop) => {
    if (mode.kind === 'round') {
      openAddJobForRound({
        action: 'add-round',
        clientId: stop.clientId,
        newClient: stop.clientId
          ? null
          : {
              name: stop.label,
              address: stop.address,
              zip_code: stop.zip_code,
              city: stop.city,
              lat: stop.lat,
              lng: stop.lng,
            },
      })
      return
    }
    if (mode.kind === 'day' || mode.kind === 'route') {
      openCreateJobForRoute({
        date: mode.date,
        userId: mode.kind === 'route' ? mode.userId : null,
        lockSchedule: mode.kind === 'route',
        clientId: stop.clientId ?? undefined,
        locationKey: stop.locationKey ?? null,
        newClient: stop.clientId
          ? null
          : {
              name: stop.label,
              address: stop.address,
              zip_code: stop.zip_code,
              city: stop.city,
              lat: stop.lat,
              lng: stop.lng,
            },
      })
    }
  }, [mode, openAddJobForRound, openCreateJobForRoute])

  const handleJobCreatedForRound = useCallback(async (
    action: 'plan-new' | 'add-round',
    info?: { jobId?: number; clientId?: number | null },
  ) => {
    const jobId = info?.jobId
    if (jobId == null) {
      console.error('[map] job created without id — cannot link to round')
      alert('Job was created but could not be added to the round. Please try again.')
      return
    }
    try {
      if (action === 'plan-new') {
        const round = await createPlaygroundRound()
        await addStopToRound(round.id, {
          job_id: jobId,
          client_id: info.clientId ?? null,
        })
        navigate(withReturnTo({ kind: 'round', roundId: round.id }, mode))
        return
      }
      if (action === 'add-round') {
        let roundId = mode.kind === 'round' ? mode.roundId : null
        if (roundId == null) {
          const created = await createPlaygroundRound()
          roundId = created.id
          const round = await addStopToRound(roundId, {
            job_id: jobId,
            client_id: info.clientId ?? null,
          })
          sandbox.setRound(round)
          navigate(
            { kind: 'round', roundId, returnTo: mode.kind === 'round' ? mode.returnTo : undefined },
            { replace: true },
          )
          return
        }
        const round = await addStopToRound(roundId, {
          job_id: jobId,
          client_id: info.clientId ?? null,
        })
        sandbox.setRound(round)
      }
    } catch (err) {
      console.error('[map] link job to round failed', err)
      alert(err instanceof Error ? err.message : 'Could not add the job to this round.')
    }
  }, [mode, navigate, sandbox.setRound])

  // Floating profile cards (searched locations + clients). Independent of URL mode —
  // pins stay until each card is closed or the map page unmounts.
  // Seed from the URL on first paint when arriving via dashboard search deep-link.
  const [overlays, setOverlays] = useState<MapOverlay[]>(() => {
    if (typeof window === 'undefined') return []
    return seedFromSearchParams(new URLSearchParams(window.location.search)).overlays
  })
  const [hoveredOverlayKey, setHoveredOverlayKey] = useState<string | null>(null)
  /** Client dashboard stacked on the left sidebar (search at top-level, or Select). */
  const [exploreClientId, setExploreClientId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    return seedFromSearchParams(new URLSearchParams(window.location.search)).exploreClientId
  })
  const [exploreLayer, setExploreLayer] = useState<ClientExploreLayer>('dashboard')
  /** Searched / prospect location stacked on the left sidebar (like client explore). */
  const [exploreLocation, setExploreLocation] = useState<MapOverlayLocation | null>(() => {
    if (typeof window === 'undefined') return null
    return seedFromSearchParams(new URLSearchParams(window.location.search)).exploreLocation
  })
  /**
   * Auto-open the client/location sidebar only from the main map (idle) — never while
   * planning a route/day/round. Switching while already exploring is OK.
   * Select on the profile card always opens explicitly.
   */
  const canAutoExploreClientRef = useRef(false)
  canAutoExploreClientRef.current =
    !isPlannerMode && mode.kind === 'idle'
  const openClientExplore = useCallback((clientId: number) => {
    setExploreLocation(null)
    setExploreLayer('dashboard')
    setExploreClientId(clientId)
  }, [])
  const openClientExploreIfTopLevel = useCallback((clientId: number) => {
    if (!canAutoExploreClientRef.current) return
    openClientExplore(clientId)
  }, [openClientExplore])
  const openLocationExplore = useCallback((loc: MapOverlayLocation) => {
    setExploreClientId(null)
    setExploreLayer('dashboard')
    setExploreLocation(loc)
    // Clear any route preview so the map can tightly frame this pin.
    setPreviewSelections(prev => (prev.size === 0 ? prev : new Map()))
  }, [])
  const openLocationExploreIfTopLevel = useCallback((loc: MapOverlayLocation) => {
    if (!canAutoExploreClientRef.current) return
    openLocationExplore(loc)
  }, [openLocationExplore])

  const openEmployeeView = useCallback((userId: number) => {
    setExploreClientId(null)
    setExploreLocation(null)
    setExploreLayer('dashboard')
    const week = weekRangeContaining(todayStr())
    navigate({ kind: 'employee', userId, from: week.from, to: week.to })
  }, [navigate])
  /** Backdrop layer toggles — never hide focused routes / open profile-card pins.
   *  Remembered in localStorage so every map mode keeps the same preference. */
  const [showClientsBackdrop, setShowClientsBackdrop] = useState(() => readMapLayerPrefs().clients)
  const [showEmployeesBackdrop, setShowEmployeesBackdrop] = useState(() => readMapLayerPrefs().employees)

  useEffect(() => {
    writeMapLayerPrefs({
      clients: showClientsBackdrop,
      employees: showEmployeesBackdrop,
    })
  }, [showClientsBackdrop, showEmployeesBackdrop])

  const openOverlayDetail = useCallback((detail: MapOpenOverlayDetail) => {
    // Search / deep-link is an explicit "take me there" — release the browse lock
    // so RouteMap will zoom to the focused client pin.
    setBrowsingAllClients(false)

    if (detail.kind === 'employee') {
      setOverlays(prev => upsertOverlay(prev, overlayFromEmployeeDetail(detail)))
      return detail
    }

    // Address search that lands on an existing client → open the client, not a
    // duplicate "unknown location" card.
    let resolved: MapOpenOverlayDetail = detail
    if (detail.kind === 'location') {
      const hit = findClientAtPlace(allClients, detail)
      if (hit) {
        resolved = {
          kind: 'client',
          clientId: hit.id,
          name: hit.name,
          last_name: hit.last_name,
          address: hit.address ?? detail.address,
          zip_code: hit.zip_code ?? detail.zip_code,
          city: hit.city ?? detail.city,
          lat: hit.lat ?? detail.lat,
          lng: hit.lng ?? detail.lng,
          client_type: hit.client_type,
        }
      }
    }

    const fromList = resolved.kind === 'client'
      ? allClients.find(c => c.id === resolved.clientId)
      : null

    setOverlays(prev => {
      if (resolved.kind === 'location') return upsertOverlay(prev, overlayFromLocationDetail(resolved))
      return upsertOverlay(prev, overlayFromClientDetail({
        ...resolved,
        name: resolved.name || fromList?.name || `Client #${resolved.clientId}`,
        last_name: resolved.last_name ?? fromList?.last_name,
        address: resolved.address ?? fromList?.address,
        zip_code: resolved.zip_code ?? fromList?.zip_code,
        city: resolved.city ?? fromList?.city,
        lat: resolved.lat ?? fromList?.lat,
        lng: resolved.lng ?? fromList?.lng,
        client_type: resolved.client_type ?? fromList?.client_type,
      }))
    })

    if (resolved.kind !== 'client') return resolved

    const hasCoords = (lat: unknown, lng: unknown) =>
      lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))

    const seedLat = resolved.lat ?? fromList?.lat
    const seedLng = resolved.lng ?? fromList?.lng
    if (hasCoords(seedLat, seedLng)) return resolved

    // Coords weren't in the search payload / cached list yet — resolve then
    // update the card so focusPoint / pin can zoom in.
    const clientId = resolved.clientId
    void (async () => {
      let c = await fetchClient(clientId)
      let lat = c?.lat ?? null
      let lng = c?.lng ?? null
      if (!hasCoords(lat, lng) && c) {
        const addr = [c.address, c.zip_code, c.city].filter(Boolean).join(', ').trim()
        if (addr) {
          const geo = await cachedGeocodeLookup(addr, null)
          if (geo) {
            lat = geo.lat
            lng = geo.lng
          }
        }
      }
      if (!c && !hasCoords(lat, lng)) return
      setOverlays(prev => prev.map(o => {
        if (o.kind !== 'client' || o.clientId !== clientId) return o
        return overlayFromClientDetail({
          kind: 'client',
          clientId,
          name: c?.name || o.name,
          last_name: c?.last_name ?? o.last_name,
          address: c?.address ?? o.address,
          zip_code: c?.zip_code ?? o.zip_code,
          city: c?.city ?? o.city,
          lat: lat ?? o.lat,
          lng: lng ?? o.lng,
          client_type: c?.client_type ?? o.client_type,
        })
      }))
    })()
    return resolved
  }, [allClients])

  const closeOverlay = useCallback((key: string) => {
    setOverlays(prev => prev.filter(o => o.key !== key))
    setHoveredOverlayKey(prev => (prev === key ? null : prev))
    setExploreLocation(prev => (prev?.key === key ? null : prev))
  }, [])

  const replaceLocationWithClient = useCallback((
    locationKey: string,
    clientId: number,
    opts?: { openExplore?: boolean },
  ) => {
    let seedLat: number | null = null
    let seedLng: number | null = null
    setOverlays(prev => {
      const loc = prev.find(o => o.key === locationKey && o.kind === 'location')
      if (!loc || loc.kind !== 'location') return prev
      seedLat = loc.lat
      seedLng = loc.lng
      return prev.map(o =>
        o.key === locationKey
          ? overlayFromClientDetail({
              kind: 'client',
              clientId,
              lat: loc.lat,
              lng: loc.lng,
              name: loc.label || loc.address || `Client #${clientId}`,
              address: loc.address || loc.label,
              zip_code: loc.zip_code,
              city: loc.city,
            })
          : o,
      )
    })
    if (opts?.openExplore !== false) {
      openClientExplore(clientId)
    }
    void fetchClient(clientId).then(c => {
      if (!c) return
      setOverlays(prev => prev.map(o => {
        if (o.kind !== 'client' || o.clientId !== clientId) return o
        return overlayFromClientDetail({
          kind: 'client',
          clientId: c.id,
          name: c.name,
          last_name: c.last_name,
          address: c.address,
          zip_code: c.zip_code,
          city: c.city,
          lat: c.lat ?? seedLat,
          lng: c.lng ?? seedLng,
          client_type: c.client_type,
        })
      }))
    })
  }, [openClientExplore])

  // Deep links (?focus=location|client) become floating cards + left explore sidebar.
  const deepLinkKey =
    mode.kind === 'location'
      ? locationOverlayKey(mode.lat, mode.lng)
      : mode.kind === 'client'
        ? clientOverlayKey(mode.clientId)
        : ''
  useEffect(() => {
    if (mode.kind === 'location') {
      const locDetail = {
        kind: 'location' as const,
        lat: mode.lat,
        lng: mode.lng,
        label: mode.label,
        ...(mode.address ? { address: mode.address } : {}),
        ...(mode.zip_code ? { zip_code: mode.zip_code } : {}),
        ...(mode.city ? { city: mode.city } : {}),
      }
      const resolved = openOverlayDetail(locDetail)
      if (resolved?.kind === 'client') {
        openClientExplore(resolved.clientId)
      } else {
        openLocationExplore(overlayFromLocationDetail(locDetail))
      }
      navigate({ kind: 'idle' }, { replace: true })
      return
    }
    if (mode.kind === 'client') {
      openOverlayDetail({
        kind: 'client',
        clientId: mode.clientId,
        ...(mode.lat != null && mode.lng != null
          ? { lat: mode.lat, lng: mode.lng }
          : {}),
      })
      // Arriving via search / deep-link lands on the main map — open the client sidebar.
      setExploreLocation(null)
      setExploreLayer('dashboard')
      setExploreClientId(mode.clientId)
      navigate({ kind: 'idle' }, { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only when URL lands on location/client
  }, [deepLinkKey])

  // Header / other surfaces can open cards without changing map mode.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<MapOpenOverlayDetail>).detail
      if (!detail?.kind) return
      const resolved = openOverlayDetail(detail) ?? detail
      if (resolved.kind === 'client') openClientExploreIfTopLevel(resolved.clientId)
      if (resolved.kind === 'location') {
        openLocationExploreIfTopLevel(overlayFromLocationDetail(resolved))
      }
    }
    window.addEventListener(MAP_OPEN_OVERLAY_EVENT, onOpen as EventListener)
    return () => window.removeEventListener(MAP_OPEN_OVERLAY_EVENT, onOpen as EventListener)
  }, [openOverlayDetail, openClientExploreIfTopLevel, openLocationExploreIfTopLevel])

  // Clients often load a beat after an address search. Upgrade any open
  // "unknown location" cards that actually match an existing client.
  useEffect(() => {
    if (allClients.length === 0) return
    setOverlays(prev => {
      let changed = false
      const next = prev.map(o => {
        if (o.kind !== 'location') return o
        const hit = findClientAtPlace(allClients, o)
        if (!hit) return o
        changed = true
        return overlayFromClientDetail({
          kind: 'client',
          clientId: hit.id,
          name: hit.name,
          last_name: hit.last_name,
          address: hit.address ?? o.address,
          zip_code: hit.zip_code ?? o.zip_code,
          city: hit.city ?? o.city,
          lat: hit.lat ?? o.lat,
          lng: hit.lng ?? o.lng,
          client_type: hit.client_type,
        })
      })
      return changed ? next : prev
    })
  }, [allClients])

  useEffect(() => {
    if (!exploreLocation || allClients.length === 0) return
    const hit = findClientAtPlace(allClients, exploreLocation)
    if (!hit) return
    openClientExplore(hit.id)
  }, [allClients, exploreLocation, openClientExplore])

  useEffect(() => {
    const onSearchPick = () => setBrowsingAllClients(false)
    window.addEventListener(MAP_SEARCH_PICK_EVENT, onSearchPick)
    return () => window.removeEventListener(MAP_SEARCH_PICK_EVENT, onSearchPick)
  }, [])

  // Frame newest client or searched-location pin tightly.
  // While a route preview or the day planner is active, drop single-pin framing
  // so the map can fit the whole route.
  const focusPoint = useMemo(() => {
    if (browsingAllClients) return null
    if (isPlannerMode) return null
    if (previewRoutes.length > 0) return null
    const top = overlays[0]
    if (!top || (top.kind !== 'client' && top.kind !== 'location')) return null
    if (top.lat == null || top.lng == null) return null
    return { lat: Number(top.lat), lng: Number(top.lng) }
  }, [overlays, browsingAllClients, previewRoutes.length, isPlannerMode])

  const onPreviewRouteDay = useCallback((row: { date: string; user_id: number }) => {
    const date = String(row.date || '').slice(0, 10)
    const userId = Number(row.user_id)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(userId)) return
    const key: RouteDayKey = `${date}:${userId}`
    setPreviewSelections(prev => {
      const next = new Map(prev)
      if (next.has(key)) next.delete(key)
      else next.set(key, { date, userId })
      return next
    })
  }, [])

  const onSetPreviewRouteDays = useCallback((rows: { date: string; user_id: number }[]) => {
    const next = new Map<RouteDayKey, PreviewRouteSelection>()
    for (const row of rows) {
      const date = String(row.date || '').slice(0, 10)
      const userId = Number(row.user_id)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(userId)) continue
      next.set(`${date}:${userId}`, { date, userId })
    }
    setPreviewSelections(prev => {
      if (prev.size === next.size) {
        const same = Array.from(next.keys()).every(key => prev.has(key))
        if (same) return prev
      }
      return next
    })
    // Refit once preview selection changes so the route + client are both in view.
    if (next.size > 0) setCameraFitEpoch(n => n + 1)
  }, [])

  const [hoveredJobId, setHoveredJobId] = useState<number | string | null>(null)

  // Leaving day/route/round must drop sticky hover / selection / isolation so
  // the next visit (or idle backdrop) never inherits a half-previewed route.
  const wasPlannerModeRef = useRef(isPlannerMode)
  const resetPlannerUi = planner.resetEphemeralUi
  useEffect(() => {
    if (wasPlannerModeRef.current && !isPlannerMode) {
      resetPlannerUi()
      setHoveredJobId(null)
    }
    wasPlannerModeRef.current = isPlannerMode
  }, [isPlannerMode, resetPlannerUi])

  // Clear page-level pin hover whenever the URL mode changes.
  useEffect(() => {
    setHoveredJobId(null)
  }, [mode.kind])

  // Force the camera to reframe when returning to the explore/idle backdrop.
  const [cameraFitEpoch, setCameraFitEpoch] = useState(0)

  // Refit when the sandbox line/pins grow (new stops or fresh geometry).
  const sandboxFitKey = useMemo(() => {
    if (!isRoundMode || sandboxLiveRoutes.length === 0) return ''
    return sandboxLiveRoutes.map(r => {
      const jobs = r.jobs
        .filter(j => j.lat != null && j.lng != null && !j.is_cancelled)
        .map(j => `${j.id}:${Number(j.lat).toFixed(4)},${Number(j.lng).toFixed(4)}`)
        .join('|')
      const geomLen = r.routeGeometry?.coordinates?.length ?? 0
      return `${r.userId}:${jobs}:g${geomLen}`
    }).join('||')
  }, [isRoundMode, sandboxLiveRoutes])

  useEffect(() => {
    if (!sandboxFitKey) return
    setCameraFitEpoch(n => n + 1)
  }, [sandboxFitKey])

  // location mode launched from a client card keeps the client link (offers attach to it)
  const linkedClient = useMemo(() => {
    if (mode.kind !== 'location' || !activeClient) return null
    if (activeClient.lat == null || activeClient.lng == null) return null
    const close =
      Math.abs(Number(activeClient.lat) - mode.lat) < 1e-5 &&
      Math.abs(Number(activeClient.lng) - mode.lng) < 1e-5
    return close ? activeClient : null
  }, [mode, activeClient])

  // ── Compose what the map draws ────────────────────────────────────────────
  // Selection is painted via selectedJobId (setData). Idle + client share the same
  // "explore" pin backdrop so browsing clients does not tear Mapbox layers down.
  const modeKind = mode.kind
  const modeDate = mode.kind === 'day' || mode.kind === 'route' ? mode.date : null
  const modeLocKey = mode.kind === 'location'
    ? `${mode.lat.toFixed(5)},${mode.lng.toFixed(5)},${mode.label}`
    : null
  // Day and route draw the same layer set — focusing an employee is a highlight,
  // not a new phase — so switching focus never re-frames the camera.
  const mapPhase =
    modeKind === 'day' || modeKind === 'route' ? `day:${modeDate}`
    : modeKind === 'round' ? `round:${roundModeId ?? ''}`
    : modeKind === 'employee' ? 'employee'
    : modeKind === 'location' ? `location:${modeLocKey}`
    : 'explore' // idle + client

  const prevMapPhaseRef = useRef(mapPhase)
  useEffect(() => {
    const prev = prevMapPhaseRef.current
    prevMapPhaseRef.current = mapPhase
    if (prev === mapPhase) return
    if (mapPhase === 'explore' && prev !== 'explore') {
      // Deep-link search lands as focus=location then immediately coerces to idle.
      // That phase flip must NOT yank the camera to the all-clients backdrop — the
      // location pin is already being framed via focusPoint (same as client search).
      if (String(prev).startsWith('location:')) return
      setCameraFitEpoch(n => n + 1)
    }
    // Employee → day/route planner: reframe on the focused route.
    if (mapPhase.startsWith('day:') && !String(prev).startsWith('day:')) {
      setCameraFitEpoch(n => n + 1)
    }
  }, [mapPhase])

  const mapRoutes: UserRoute[] = useMemo(() => {
    const out: UserRoute[] = []
    const isExplore = mapPhase === 'explore'
    const isLocation = mapPhase.startsWith('location:')
    const isEmployee = mapPhase === 'employee'
    const isDayish = mapPhase.startsWith('day:')
    const isSandbox = mapPhase.startsWith('round:')

    // Client / nearby / real routes first so employee homes can paint above them.
    // When a focused route is shown, dim other clients/homes so the route reads clearly.
    const dimBackdrop =
      ((isExplore || isLocation || isEmployee) && previewRoutes.length > 0)
      || ((isDayish || isSandbox) && routes.length > 0)
    // Layer toggles apply on every map view (explore, day, round, location, …).
    const showHomesBackdrop = showEmployeesBackdrop

    // Sandbox playground route paints as the focused line.
    if (isSandbox && routes.length > 0) {
      out.push(...routes)
    }

    // All-clients backdrop — optional via toggle on every map phase.
    // Open profile-card clients still paint via overlayPins.
    if (showClientsBackdrop && allClients.length > 0) {
      const nearIds = new Set(
        isLocation && nearClients
          ? nearClients.clients.map(c => c.id)
          : []
      )
      const withCoords = allClients.filter(
        c => c.lat != null && c.lng != null && !nearIds.has(c.id)
      )
      if (withCoords.length > 0) {
        out.push({
          userId: -3,
          userName: 'All clients',
          color: ALL_CLIENTS_COLOR,
          noLine: true,
          plainPins: true,
          dimPins: dimBackdrop,
          jobs: withCoords.map(c => ({
            id: `ac-${c.id}`,
            lat: Number(c.lat),
            lng: Number(c.lng),
            label: `${c.name}${c.last_name ? ' ' + c.last_name : ''}`,
            address: [c.address, c.zip_code, c.city].filter(Boolean).join(', '),
            has_own_coords: true,
            client_type: c.client_type === 'company' ? 'company' : 'person',
          })),
        })
      }
    }

    // Nearby client pins (Prospect Mode "Nearby clients" tab) — pins only, never a route line
    if (showClientsBackdrop && isLocation && nearClients && nearClients.clients.length > 0) {
      out.push({
        userId: -2,
        userName: 'Nearby clients',
        color: NEAR_CLIENT_COLOR,
        noLine: true,
        plainPins: true,
        dimPins: dimBackdrop,
        jobs: nearClients.clients.map(c => ({
          id: `nc-${c.id}`,
          lat: c.lat,
          lng: c.lng,
          label: c.name || 'Client',
          address: c.address,
          has_own_coords: true,
          client_type: c.client_type === 'company' ? 'company' : 'person',
        })),
      })
    }

    // Real / preview routes (colored pins + line) above the grey client backdrop.
    // Client explore + employee week live outside day/route URL modes — still paint previews.
    if (modeKind === 'day' || modeKind === 'route') {
      // Every employee, even when one is focused: RouteMap dims the rest via
      // focusUserId, and dragging a stop onto another employee's route (the
      // cross-employee reassign) needs those routes to actually be on the map.
      out.push(...routes)
    } else if (previewRoutes.length > 0) {
      out.push(...previewRoutes)
    }

    // Open client/location cards are drawn as HTML overlay pins (always on top) —
    // see overlayPins passed to RouteMap. Do not also paint them as GeoJSON here.

    // Employee homes LAST so initials always sit above client dots / nearby pins.
    // (Route stop numbers from a selected preview still share the stack with homes —
    // homes are the stable company context the admin should always be able to spot.)
    if (showHomesBackdrop && employeeHomes.length > 0) {
      for (const h of employeeHomes) {
        out.push({
          userId: -4000 - Number(h.userId),
          userName: h.label,
          color: colorForUserId(h.userId),
          noLine: true,
          plainPins: true,
          emphasizePins: true,
          dimPins: dimBackdrop,
          jobs: [{
            id: `home-${h.userId}`,
            lat: h.lat,
            lng: h.lng,
            label: h.label,
            address: h.address,
            is_home: true,
            home_initials: initialsFromName(h.label),
            has_own_coords: true,
          }],
        })
      }
    }

    return out
  }, [mapPhase, modeKind, modeLocKey, routes, previewRoutes, nearClients, allClients, employeeHomes, showClientsBackdrop, showEmployeesBackdrop])

  const focusUserId = mode.kind === 'route' ? mode.userId : mode.kind === 'round' ? -9000 : null

  const overlayRouteMeta = useMemo(() => {
    // Planner day/route/round, OR a client/location route preview — so an open
    // client card picks up stop number + route color instead of staying brand-black.
    const sourceRoutes = isPlannerMode
      ? (focusUserId != null ? routes.filter(r => r.userId === focusUserId) : routes)
      : previewRoutes

    if (sourceRoutes.length === 0) {
      return {} as Record<string, { stopNumber: number; routeColor: string }>
    }

    const meta: Record<string, { stopNumber: number; routeColor: string }> = {}

    const near = (aLat: number, aLng: number, bLat: number, bLng: number) =>
      Math.abs(aLat - bLat) < 0.00025 && Math.abs(aLng - bLng) < 0.00025

    for (const route of sourceRoutes) {
      const stops = route.jobs.filter(j => !j.is_home && !j.is_cancelled && j.lat != null && j.lng != null)
      stops.forEach((job, idx) => {
        const stopNumber = idx + 1
        const routeColor = route.color
        for (const o of overlays) {
          if (meta[o.key]) continue
          if (o.kind === 'client') {
            if (job.client_id != null && Number(job.client_id) === Number(o.clientId)) {
              meta[o.key] = { stopNumber, routeColor }
            } else if (
              o.lat != null && o.lng != null
              && near(Number(o.lat), Number(o.lng), Number(job.lat), Number(job.lng))
            ) {
              meta[o.key] = { stopNumber, routeColor }
            }
          } else if (o.kind === 'location') {
            if (o.linkedClientId != null && job.client_id != null
              && Number(o.linkedClientId) === Number(job.client_id)) {
              meta[o.key] = { stopNumber, routeColor }
            } else if (near(o.lat, o.lng, Number(job.lat), Number(job.lng))) {
              meta[o.key] = { stopNumber, routeColor }
            }
          }
        }
      })
    }
    return meta
  }, [isPlannerMode, focusUserId, routes, previewRoutes, overlays])

  const overlayPins: OverlayPin[] = useMemo(() => {
    const pins: OverlayPin[] = []
    for (const o of overlays) {
      const routeMeta = overlayRouteMeta[o.key]
      if (o.kind === 'location') {
        const addressLine =
          [o.address, o.zip_code, o.city].filter(Boolean).join(', ') || o.label
        pins.push({
          id: o.key,
          lat: o.lat,
          lng: o.lng,
          kind: 'location',
          label: o.label,
          address: addressLine,
          stopNumber: routeMeta?.stopNumber ?? null,
          routeColor: routeMeta?.routeColor ?? null,
        })
      } else if (o.kind === 'employee') {
        if (o.lat != null && o.lng != null) {
          pins.push({
            id: o.key,
            lat: Number(o.lat),
            lng: Number(o.lng),
            kind: 'location',
            label: `${o.first_name}${o.last_name ? ` ${o.last_name}` : ''}`.trim(),
            address: o.address || undefined,
          })
        }
      } else if (o.lat != null && o.lng != null) {
        pins.push({
          id: o.key,
          lat: Number(o.lat),
          lng: Number(o.lng),
          kind: 'client',
          label: `${o.name}${o.last_name ? ` ${o.last_name}` : ''}`.trim(),
          address: [o.address, o.zip_code, o.city].filter(Boolean).join(', ') || undefined,
          stopNumber: routeMeta?.stopNumber ?? null,
          routeColor: routeMeta?.routeColor ?? null,
        })
      }
    }
    return pins
  }, [overlays, overlayRouteMeta])
  const selectedJobIds = useMemo(
    () => overlays.filter(o => o.kind === 'client').map(o => `ac-${o.clientId}`),
    [overlays],
  )
  const selectedJobId = selectedJobIds[0] ?? null

  const handleJobClick = useCallback((jobId: number | string) => {
    if (
      isPlannerMode
      && !String(jobId).startsWith('home-')
      && !String(jobId).startsWith('ac-')
      && !String(jobId).startsWith('loc:')
      && !String(jobId).startsWith('client:')
      && !String(jobId).startsWith('employee:')
      && !String(jobId).startsWith('nc-')
    ) {
      if (planner.drawMode) planner.assignDraw(jobId)
      else openPlannerJob(jobId)
      return
    }
    if (typeof jobId === 'string' && jobId.startsWith('loc:')) {
      const hit = overlays.find(o => o.key === jobId)
      if (!hit || hit.kind !== 'location') return
      setOverlays(prev => upsertOverlay(prev.filter(o => o.key !== jobId), hit))
      if (!isPlannerMode) openLocationExplore(hit)
      return
    }
    if (typeof jobId === 'string' && jobId.startsWith('client:')) {
      const clientId = parseInt(jobId.slice('client:'.length), 10)
      setOverlays(prev => {
        const hit = prev.find(o => o.key === jobId)
        if (!hit) return prev
        return upsertOverlay(prev.filter(o => o.key !== jobId), hit)
      })
      if (Number.isFinite(clientId)) {
        if (isDayPlannerMode) {
          openClientExplore(clientId)
          navigate({ kind: 'idle' })
        } else {
          openClientExplore(clientId)
        }
      }
      return
    }
    if (typeof jobId === 'string' && jobId.startsWith('employee:')) {
      const userId = parseInt(jobId.slice('employee:'.length), 10)
      if (Number.isFinite(userId)) openEmployeeView(userId)
      return
    }
    if (typeof jobId === 'string' && jobId.startsWith('home-')) {
      const userId = parseInt(jobId.slice(5), 10)
      if (Number.isFinite(userId)) openEmployeeView(userId)
      return
    }
    if (typeof jobId === 'string' && (jobId.startsWith('ac-') || jobId.startsWith('nc-'))) {
      const clientId = parseInt(jobId.slice(3), 10)
      if (Number.isFinite(clientId)) {
        setBrowsingAllClients(true)
        openOverlayDetail({ kind: 'client', clientId })
        if (isDayPlannerMode) {
          openClientExplore(clientId)
          navigate({ kind: 'idle' })
        } else if (!isPlannerMode) {
          openClientExplore(clientId)
          if (mode.kind === 'employee') navigate({ kind: 'idle' })
        }
      }
    }
  }, [
    navigate,
    mode.kind,
    isPlannerMode,
    isDayPlannerMode,
    planner.drawMode,
    planner.assignDraw,
    openPlannerJob,
    openOverlayDetail,
    openClientExplore,
    openLocationExplore,
    openEmployeeView,
    overlays,
  ])

  // Faint radius circle — unused while nearby-clients tab is off; keep null.
  const circleOverlay = useMemo(() => null as null, [])

  const scheduleDate =
    mode.kind === 'day' || mode.kind === 'route' ? mode.date : null
  const scheduleUserId = mode.kind === 'route' ? mode.userId : null

  const isDirectionsLoading =
    previewLoading || (isPlannerMode && planner.isDirectionsLoading)

  return (
    // Phones sit below the app header (their only route back to the menu);
    // from lg up the tool runs the full height beside the sidebar.
    <div className="fixed inset-0 z-[35] lg:z-10 flex flex-col lg:flex-row top-14 lg:top-0 left-0 lg:left-[200px] bg-gray-50">
      {/* Left column: context panel, or the planner when a day/route is focused */}
      <div className="w-full lg:w-[400px] flex-shrink-0 flex flex-col h-[52%] lg:h-full border-b lg:border-b-0 lg:border-r border-gray-200 bg-gray-50 order-2 lg:order-1">
        {isDayPlannerMode && (mode.kind === 'day' || mode.kind === 'route') ? (
          <MapPlannerPanel
            planner={planner}
            mode={mode}
            companySlug={companySlug}
            navigate={navigate}
            onOpenJob={openPlannerJob}
            onAddJob={openAddJobFromPlanner}
            availableMinutesByUser={capacityByUser}
          />
        ) : isRoundMode && mode.kind === 'round' ? (
          <SandboxPlannerPanel
            mode={mode}
            companySlug={companySlug}
            navigate={navigate}
            round={sandbox.round}
            loading={sandbox.loading}
            onReload={sandbox.reload}
            users={users}
            onReorder={sandbox.reorder}
            onAddStop={() => {
              openAddJobForRound({ action: 'add-round' })
            }}
            onSaved={(next) => {
              sandbox.setRound(next)
            }}
            onRoutesChange={setSandboxLiveRoutes}
          />
        ) : (
          <div className="flex-1 overflow-y-auto px-3 py-3 pb-4">
            <MapSidebar
              mode={mode.kind === 'client' || mode.kind === 'location' ? { kind: 'idle' } : mode}
              users={users}
              companySlug={companySlug}
              navigate={navigate}
              onHoverJob={setHoveredJobId}
              onPreviewRouteDay={onPreviewRouteDay}
              onSetPreviewRouteDays={onSetPreviewRouteDays}
              previewKeys={previewKeys}
              previewRoutesByKey={previewRoutesByKey}
              previewLoading={previewLoading}
              onClientLoaded={onClientLoaded}
              onNearestClientsLoaded={onNearestClientsLoaded}
              linkedClient={linkedClient}
              onNavigateToClient={() => setBrowsingAllClients(true)}
              onJobsChanged={onJobsChanged}
              exploreClientId={isPlannerMode ? null : exploreClientId}
              exploreLayer={exploreLayer}
              onExploreLayerChange={setExploreLayer}
              onCloseExploreClient={() => {
                setExploreClientId(null)
                setExploreLayer('dashboard')
              }}
              exploreLocation={isPlannerMode ? null : exploreLocation}
              onCloseExploreLocation={() => {
                setExploreLocation(null)
                onSetPreviewRouteDays([])
              }}
              onPlanNewRoundForClient={handlePlanNewRoute}
              scheduleDate={scheduleDate}
              scheduleUserId={scheduleUserId}
              parkedRoutes={parkedRouteMeta}
              onSaveAllParked={saveAllParked}
              savingAllParked={savingAllParked}
            />
          </div>
        )}
      </div>

      {/* Map + floating search. Phones use the app header's search instead. */}
      <div className="flex-1 relative overflow-hidden order-1 lg:order-2 min-h-[220px]">
        {/* Layer toggles — own glass chip, top-left */}
        <div className="pointer-events-none absolute left-3 top-3 z-20 sm:left-4 sm:top-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/70 bg-white/90 px-3.5 py-2.5 shadow-[0_8px_32px_rgba(15,23,42,0.12),0_1px_0_rgba(255,255,255,0.8)_inset] ring-1 ring-black/[0.04] backdrop-blur-xl sm:gap-4 sm:px-4">
            <button
              type="button"
              role="switch"
              aria-checked={showClientsBackdrop}
              title={showClientsBackdrop ? 'Hide other clients' : 'Show all clients'}
              onClick={() => setShowClientsBackdrop(v => !v)}
              className="inline-flex items-center gap-2 rounded-lg py-0.5 text-left transition-colors hover:bg-black/[0.03]"
            >
              <UserGroupIcon
                className={`h-4 w-4 flex-shrink-0 ${showClientsBackdrop ? 'text-[#193434]' : 'text-gray-400'}`}
              />
              <span className={`hidden text-[12px] font-semibold sm:inline ${showClientsBackdrop ? 'text-gray-800' : 'text-gray-400'}`}>
                Clients
              </span>
              <span
                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                  showClientsBackdrop ? 'bg-[#193434]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    showClientsBackdrop ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={showEmployeesBackdrop}
              title={showEmployeesBackdrop ? 'Hide employee homes' : 'Show employee homes'}
              onClick={() => setShowEmployeesBackdrop(v => !v)}
              className="inline-flex items-center gap-2 rounded-lg py-0.5 text-left transition-colors hover:bg-black/[0.03]"
            >
              <HomeIcon
                className={`h-4 w-4 flex-shrink-0 ${showEmployeesBackdrop ? 'text-[#193434]' : 'text-gray-400'}`}
              />
              <span className={`hidden text-[12px] font-semibold sm:inline ${showEmployeesBackdrop ? 'text-gray-800' : 'text-gray-400'}`}>
                Employees
              </span>
              <span
                className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                  showEmployeesBackdrop ? 'bg-[#193434]' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    showEmployeesBackdrop ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>
          </div>
        </div>

        {/* Search — centered, own bar so the results dropdown isn't clipped */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 hidden justify-center px-4 pt-3 sm:px-6 sm:pt-4 lg:flex">
          <div className="pointer-events-auto w-full max-w-2xl">
            <MapSearch
              users={users}
              onPickClient={client => {
                setBrowsingAllClients(false)
                openOverlayDetail({
                  kind: 'client',
                  clientId: client.id,
                  name: client.name,
                  last_name: client.last_name,
                  address: client.address,
                  zip_code: client.zip_code,
                  city: client.city,
                  lat: client.lat,
                  lng: client.lng,
                  client_type: client.client_type,
                })
                if (isDayPlannerMode) {
                  openClientExplore(client.id)
                  navigate({ kind: 'idle' })
                } else if (!isPlannerMode) {
                  openClientExplore(client.id)
                  if (mode.kind === 'employee') navigate({ kind: 'idle' })
                }
              }}
              onPickEmployee={user => {
                const home = employeeHomes.find(h => h.userId === user.id)
                openOverlayDetail({
                  kind: 'employee',
                  userId: user.id,
                  first_name: user.first_name,
                  last_name: user.last_name,
                  address: home?.address ?? null,
                  lat: home?.lat ?? null,
                  lng: home?.lng ?? null,
                })
              }}
              onPickLocation={loc => {
                setBrowsingAllClients(false)
                const detail = {
                  kind: 'location' as const,
                  lat: loc.lat,
                  lng: loc.lng,
                  label: loc.label,
                  address: loc.address,
                  zip_code: loc.zip_code,
                  city: loc.city,
                }
                const resolved = openOverlayDetail(detail) ?? detail
                if (resolved.kind === 'client') {
                  if (isDayPlannerMode) {
                    openClientExplore(resolved.clientId)
                    navigate({ kind: 'idle' })
                  } else if (!isPlannerMode) {
                    openClientExplore(resolved.clientId)
                    if (mode.kind === 'employee') navigate({ kind: 'idle' })
                  }
                } else if (isDayPlannerMode) {
                  openLocationExplore(overlayFromLocationDetail(resolved))
                  navigate({ kind: 'idle' })
                } else if (!isPlannerMode) {
                  openLocationExplore(overlayFromLocationDetail(resolved))
                  if (mode.kind === 'employee') navigate({ kind: 'idle' })
                }
              }}
              onAddToRouteClient={
                mode.kind === 'day' || mode.kind === 'route'
                  ? (client) => openCreateJobForRoute({
                      date: mode.date,
                      userId: mode.kind === 'route' ? mode.userId : null,
                      lockSchedule: mode.kind === 'route',
                      clientId: client.id,
                    })
                  : mode.kind === 'round'
                    ? (client) => openAddJobForRound({
                        action: 'add-round',
                        clientId: client.id,
                      })
                    : undefined
              }
              onAddToRouteLocation={
                mode.kind === 'day' || mode.kind === 'route'
                  ? (loc) => openCreateJobForRoute({
                      date: mode.date,
                      userId: mode.kind === 'route' ? mode.userId : null,
                      lockSchedule: mode.kind === 'route',
                      locationKey: loc.key,
                      newClient: {
                        address: loc.address || loc.label,
                        zip_code: loc.zip_code,
                        city: loc.city,
                        lat: loc.lat,
                        lng: loc.lng,
                      },
                    })
                  : mode.kind === 'round'
                    ? (loc) => openAddJobForRound({
                        action: 'add-round',
                        newClient: {
                          address: loc.address || loc.label,
                          zip_code: loc.zip_code,
                          city: loc.city,
                          lat: loc.lat,
                          lng: loc.lng,
                        },
                      })
                    : undefined
              }
              autoFocus={mode.kind === 'idle'}
              initialQuery={mode.kind === 'idle' ? searchParams.get('q') || '' : ''}
            />
          </div>
        </div>
        <MapProfileStack
          overlays={overlays}
          onClose={closeOverlay}
          onLocationBecameClient={replaceLocationWithClient}
          onHoverOverlay={setHoveredOverlayKey}
          hoveredKey={hoveredOverlayKey}
          scheduleDate={scheduleDate}
          scheduleUserId={scheduleUserId}
          onRoute={isPlannerMode}
          routeStopMeta={overlayRouteMeta}
          onAddToRoute={handleAddToRoute}
          onPlanNewRoute={handlePlanNewRoute}
          onJobsChanged={onJobsChanged}
          onSelectClient={(clientId) => {
            setBrowsingAllClients(false)
            openClientExplore(clientId)
            if (isDayPlannerMode) navigate({ kind: 'idle' })
          }}
          onSelectEmployee={openEmployeeView}
        />
        <RouteMap
          routes={mapRoutes}
          focusUserId={focusUserId}
          onJobClick={handleJobClick}
          className="w-full h-full"
          highlightedJobId={isPlannerMode ? planner.hoveredJobId : hoveredJobId}
          selectedJobId={selectedJobId}
          selectedJobIds={selectedJobIds}
          selectedPinColor={SELECTED_CLIENT_COLOR}
          lockCamera={browsingAllClients}
          focusPoint={focusPoint}
          overlayPins={overlayPins}
          highlightedOverlayId={
            hoveredOverlayKey
            ?? (overlays[0]?.kind === 'location' ? overlays[0].key : null)
          }
          onOverlayHover={setHoveredOverlayKey}
          cameraFitEpoch={cameraFitEpoch}
          onPinHover={isPlannerMode ? planner.hoverJob : setHoveredJobId}
          isDirectionsLoading={isDirectionsLoading}
          showZoomControl
          zoomControlPosition="bottom-left"
          circleOverlay={circleOverlay}
          fitInsets={{ top: 72, side: 80 }}
          isolatedLeg={isPlannerMode ? planner.isolatedLeg : null}
          drawMode={isPlannerMode && planner.drawMode}
          drawUserId={isPlannerMode ? planner.drawTargetUserId : null}
          drawOrder={isPlannerMode ? planner.drawOrder : undefined}
          onDrawAssign={isPlannerMode ? planner.assignDraw : undefined}
          onReassignJob={isPlannerMode ? planner.reassignJob : undefined}
          visibleUserIds={isPlannerMode ? planner.visibleUserIds : null}
        />
      </div>

      {/* Planner job slideout — assignee edits are deferred to Save & apply. */}
      <JobViewSlideout
        isOpen={viewingJob != null}
        onClose={() => setViewingJob(null)}
        job={viewingJob}
        onJobUpdated={onPlannerJobUpdated}
        deferAssigneeToParent
        onAssigneeChange={(jobId, newUserId) => {
          planner.setPendingAssignee(jobId, newUserId)
          setViewingJob((prev: any) => (prev?.id === jobId ? { ...prev, assigned_user_id: newUserId } : prev))
        }}
        visitSiblings={visitSiblingsFor(viewingJob, planner.jobsForDay as any)}
        onOpenSibling={(sib) => setViewingJob(sib)}
      />

      <CreateJob
        isOpen={createJobOpen}
        onClose={closeCreateJob}
        onJobCreated={async (info) => {
          const roundAction = createJobRoundActionRef.current
          const locationKey = createJobLocationKey
          const assignedUserId = createJobUserId
          if (roundAction) {
            await handleJobCreatedForRound(roundAction, info)
          } else {
            // Soft map refresh — avoid planner.reload() which rebuilds the whole
            // day (flicker / dashed birdseye). Ingest the new stop in place.
            refreshMapAfterJobMutation()
            if (info?.jobId && isDayPlannerMode) {
              await planner.ingestCreatedJob(info.jobId, { userId: assignedUserId })
              if (isEmployeeScopedMode(mode)) {
                parkFocusedDraft({ force: true })
              }
            } else {
              onJobsChanged()
            }
            if (info?.clientId && locationKey) {
              replaceLocationWithClient(locationKey, info.clientId, { openExplore: false })
            }
          }
          closeCreateJob()
        }}
        initialDate={createJobDate}
        initialAssignedUserId={createJobUserId}
        initialClientId={createJobClientId}
        lockClient={createJobClientId != null}
        lockSchedule={createJobLockSchedule}
        initialNewClient={createJobNewClient}
      />

      {leavePrompt && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-planner-title"
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
          >
            <h2 id="leave-planner-title" className="text-[16px] font-bold text-gray-900">
              {leavePrompt.scope === 'employee' ? 'Unsaved employee routes' : 'Unsaved route changes'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              {leavePrompt.scope === 'employee'
                ? 'You have parked edits across one or more routes for this employee. Save them before leaving, or discard all changes.'
                : 'You have unsaved edits on this route. Save them before leaving, or close without saving.'}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={leaveSaving}
                onClick={() => void confirmLeaveSave()}
                className="rounded-xl bg-[#3DD57A] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:brightness-95 disabled:opacity-60"
              >
                {leaveSaving ? 'Saving…' : 'Save & close'}
              </button>
              <button
                type="button"
                disabled={leaveSaving}
                onClick={confirmLeaveDiscard}
                className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-60"
              >
                Close without saving
              </button>
              <button
                type="button"
                disabled={leaveSaving}
                onClick={() => setLeavePrompt(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800 disabled:opacity-60"
              >
                Stay on route
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MapMultitoolPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading map…</div>}>
        <MapMultitoolInner />
      </Suspense>
    </AppLayout>
  )
}
