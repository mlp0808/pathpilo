'use client'

/**
 * Playground round planner — same DayRoutePanel as the day route planner
 * (employee switcher, start/end homes in the list, draw/optimize, save).
 * Round-only chrome: title + go-to-rounds above, Schedule in the save bar.
 */

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DayRoutePanel from '@/app/components/DayRoutePanel'
import type { RoundRecurrenceType, RoundScheduleMode } from '@/app/components/planner/RoundPlacementBar'
import type { RouteJob, UserRoute } from '@/app/components/RouteMap'
import { colorForUserId } from '@/app/components/RouteMap'
import { optimizeMiddleJobsClient } from '@/app/utils/clientRouteOptimize'
import { apiUrl } from '@/app/utils/api'
import {
  buildMonthlyForecast,
  buildWeeklyForecast,
  todayYmdLocal,
  ymdFromLocalDate,
} from '@/app/utils/subscriptionHelpers'
import { applyDirections, enhanceRouteWithHome, invalidateWorkHoursCache } from './useMapData'
import { resolvePlannerBack, type MapMode } from './mapMode'

const SANDBOX_USER_ID = -9000

export type RoundStopPayload = {
  client_id?: number | null
  job_id?: number | null
  label?: string | null
  address?: string | null
  zip_code?: string | null
  city?: string | null
  lat?: number | null
  lng?: number | null
  estimated_duration_minutes?: number | null
  services?: Array<{
    service_id?: number
    custom_title?: string
    custom_price?: number
    custom_duration?: number
  }> | null
}

type ApiStop = {
  id: number
  position: number
  client_id: number | null
  label: string | null
  address: string | null
  zip_code: string | null
  city: string | null
  lat: number | null
  lng: number | null
  resolved_lat?: number | null
  resolved_lng?: number | null
  client_name?: string | null
  client_last_name?: string | null
  estimated_duration_minutes?: number | null
}

type ApiRound = {
  id: number
  name: string | null
  status: string
  assigned_user_id?: number | null
  scheduled_date?: string | null
  schedule_kind?: 'manual' | 'recurring' | null
  day_of_week?: number | null
  interval_value?: number | null
  recurrence_type?: 'weekly' | 'monthly' | null
  day_of_month?: number | null
  starting_date?: string | null
  in_library?: boolean
  source_round_id?: number | null
  stops: ApiStop[]
  placements?: Array<{ scheduled_date: string; assigned_user_id?: number | null }>
}

const PLACE_OCCURRENCE_COUNT = 16

function expandRecurringDates(opts: {
  recurrenceType: RoundRecurrenceType
  dayOfWeek: number
  intervalWeeks: number
  dayOfMonth: number
  intervalMonths: number
  startingDate?: string | null
}): string[] {
  const today = todayYmdLocal()
  let anchor = (opts.startingDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.startingDate))
    ? opts.startingDate
    : today
  // Never place occurrences in the past — first day is on/after today.
  if (anchor < today) anchor = today
  const dates = opts.recurrenceType === 'monthly'
    ? buildMonthlyForecast(anchor, opts.dayOfMonth, opts.intervalMonths, PLACE_OCCURRENCE_COUNT)
    : buildWeeklyForecast(anchor, opts.dayOfWeek, opts.intervalWeeks, PLACE_OCCURRENCE_COUNT)
  return dates
    .map(ymdFromLocalDate)
    .filter((d): d is string => !!d && d >= today)
}

type PlacementUserLite = { id: number; first_name: string; last_name: string }

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

function stopToJob(stop: ApiStop): RouteJob {
  const name = stop.client_name
    ? `${stop.client_name}${stop.client_last_name ? ` ${stop.client_last_name}` : ''}`.trim()
    : null
  const lat = stop.resolved_lat ?? stop.lat
  const lng = stop.resolved_lng ?? stop.lng
  return {
    id: `stop:${stop.id}`,
    lat: lat != null && Number.isFinite(Number(lat)) ? Number(lat) : null,
    lng: lng != null && Number.isFinite(Number(lng)) ? Number(lng) : null,
    label: name || stop.label || `Stop #${stop.id}`,
    address: [stop.address, stop.zip_code, stop.city].filter(Boolean).join(', '),
    estimated_duration_minutes: Number(stop.estimated_duration_minutes || 30) || 30,
    has_own_coords: lat != null && lng != null,
  }
}

function middleJobs(jobs: RouteJob[]): RouteJob[] {
  return jobs.filter(j => !j.is_home && !j.is_cancelled)
}

function middleIdsKey(jobs: RouteJob[]): string {
  return middleJobs(jobs).map(j => String(j.id)).join('|')
}

function userDisplayName(users: PlacementUserLite[], userId: number, fallback: string): string {
  const u = users.find(x => x.id === userId)
  if (!u) return fallback
  return `${u.first_name || ''} ${u.last_name || ''}`.trim() || fallback
}

/** Middle stops only — homes are injected via enhanceRouteWithHome like the day planner. */
function stopsRouteFromRound(round: ApiRound | null, userId: number, userName: string): UserRoute {
  return {
    userId,
    userName,
    color: colorForUserId(userId),
    jobs: (round?.stops || []).map(stopToJob),
  }
}

async function buildSandboxRoute(
  round: ApiRound | null,
  placementUserId: number | null,
  users: PlacementUserLite[],
  preserve?: UserRoute | null,
): Promise<UserRoute> {
  const fallbackName = round?.name?.trim() || 'New round'
  const uid = placementUserId != null && placementUserId > 0 ? placementUserId : SANDBOX_USER_ID
  const base = stopsRouteFromRound(
    round,
    uid,
    uid === SANDBOX_USER_ID ? fallbackName : userDisplayName(users, uid, fallbackName),
  )
  const next = uid === SANDBOX_USER_ID ? base : await enhanceRouteWithHome(base)

  if (
    preserve
    && preserve.userId === next.userId
    && middleIdsKey(preserve.jobs) === middleIdsKey(next.jobs)
    && preserve.routeGeometry
  ) {
    const prevById = new Map(preserve.jobs.map(j => [String(j.id), j] as const))
    return {
      ...next,
      totalMinutes: preserve.totalMinutes,
      totalKm: preserve.totalKm,
      routeGeometry: preserve.routeGeometry,
      jobs: next.jobs.map(j => {
        const prev = prevById.get(String(j.id))
        if (!prev || j.is_home) return j
        return { ...j, legMinutes: prev.legMinutes, etaMinutes: prev.etaMinutes }
      }),
    }
  }
  return next
}

function stopIdsFromJobs(jobs: RouteJob[]): number[] {
  return jobs
    .map(j => {
      const m = String(j.id).match(/^stop:(\d+)$/)
      return m ? Number(m[1]) : null
    })
    .filter((n): n is number => n != null)
}

/** Same bookend rules as the day route planner. */
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

export default function SandboxPlannerPanel({
  mode,
  companySlug,
  navigate,
  round,
  loading,
  users = [],
  onReorder,
  onAddStop,
  onSaved,
  onRoutesChange,
}: {
  mode: Extract<MapMode, { kind: 'round' }>
  companySlug: string
  navigate: (mode: MapMode, opts?: { replace?: boolean }) => void
  round: ApiRound | null
  loading: boolean
  onReload: () => void
  users?: Array<{ id: number; first_name: string; last_name: string }>
  onReorder: (stopIds: number[]) => Promise<void>
  onAddStop?: () => void
  onSaved?: (round: ApiRound) => void
  /** Push live routes (incl. directions geometry) up to the map. */
  onRoutesChange?: (routes: UserRoute[]) => void
}) {
  const router = useRouter()
  const back = resolvePlannerBack(mode)
  const leave = () => {
    if (back?.kind === 'path') {
      const pathOnly = back.path.split('?')[0] || ''
      if (pathOnly === `/${companySlug}/map` || pathOnly.endsWith('/map')) {
        navigate({ kind: 'idle' })
        return
      }
      router.push(back.path)
      return
    }
    if (back?.kind === 'mode') {
      navigate(back.mode)
      return
    }
    navigate({ kind: 'idle' })
  }

  const [saving, setSaving] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [optimizeNotice, setOptimizeNotice] = useState<string | null>(null)
  const [routes, setRoutes] = useState<UserRoute[]>(() => [
    stopsRouteFromRound(round, SANDBOX_USER_ID, round?.name?.trim() || 'New round'),
  ])
  const [baselineDrive, setBaselineDrive] = useState<Record<number, number>>({})
  const [drawMode, setDrawMode] = useState(false)
  const [drawOrder, setDrawOrder] = useState<(number | string)[]>([])
  const [drawRouteComparison, setDrawRouteComparison] = useState<{ diffMinutes: number } | null>(null)
  const [placementUserId, setPlacementUserId] = useState<number | null>(null)
  const [placementDates, setPlacementDates] = useState<string[]>([])
  const [scheduleMode, setScheduleMode] = useState<RoundScheduleMode>(null)
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState(() => new Date().getDay())
  const [scheduleIntervalWeeks, setScheduleIntervalWeeks] = useState(1)
  const [recurrenceType, setRecurrenceType] = useState<RoundRecurrenceType>('weekly')
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState(() => new Date().getDate())
  const [scheduleIntervalMonths, setScheduleIntervalMonths] = useState(1)
  const [scheduleStartingDate, setScheduleStartingDate] = useState('')
  const drawBaselineRef = useRef<number | null>(null)
  const drawCompareTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const directionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const roundIdRef = useRef(round?.id)
  const routesRef = useRef(routes)
  routesRef.current = routes

  // Rebuild stop list when the server round changes (add stop / reload).
  // Important: do not wipe a locally confirmed schedule when the server round
  // still has schedule_kind=null (e.g. place failed or patch in flight).
  useEffect(() => {
    let cancelled = false
    const roundChanged = roundIdRef.current !== round?.id
    roundIdRef.current = round?.id

    const uid = round?.assigned_user_id != null && Number.isFinite(Number(round.assigned_user_id))
      ? Number(round.assigned_user_id)
      : null

    const kind = round?.schedule_kind === 'recurring' || round?.schedule_kind === 'manual'
      ? round.schedule_kind
      : null
    const fromPlacements = (round?.placements || [])
      .map(p => String(p.scheduled_date).slice(0, 10))
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    const legacyDate = round?.scheduled_date ? String(round.scheduled_date).slice(0, 10) : null
    const dates = fromPlacements.length > 0
      ? fromPlacements
      : (legacyDate && /^\d{4}-\d{2}-\d{2}$/.test(legacyDate) ? [legacyDate] : [])

    if (roundChanged) {
      setPlacementUserId(uid)
      if (kind === 'recurring' || (round?.day_of_week != null && dates.length === 0 && round?.schedule_kind !== 'manual')) {
        setScheduleMode('recurring')
        setPlacementDates([])
        if (round?.day_of_week != null) setScheduleDayOfWeek(Number(round.day_of_week))
        if (round?.interval_value != null) {
          const iv = Number(round.interval_value) || 1
          if (round?.recurrence_type === 'monthly') setScheduleIntervalMonths(iv)
          else setScheduleIntervalWeeks(iv)
        }
        if (round?.recurrence_type === 'monthly' || round?.recurrence_type === 'weekly') {
          setRecurrenceType(round.recurrence_type)
        }
        if (round?.day_of_month != null) setScheduleDayOfMonth(Number(round.day_of_month) || 1)
        if (round?.starting_date) setScheduleStartingDate(String(round.starting_date).slice(0, 10))
      } else if (kind === 'manual' || dates.length > 0) {
        setScheduleMode('manual')
        setPlacementDates(dates)
      } else {
        setScheduleMode(null)
        setPlacementDates([])
      }
    } else if (round) {
      // Same round updated — only adopt schedule when the server has one.
      if (uid != null) setPlacementUserId(uid)
      if (kind === 'recurring') {
        setScheduleMode('recurring')
        if (round.day_of_week != null) setScheduleDayOfWeek(Number(round.day_of_week))
        if (round.interval_value != null) {
          const iv = Number(round.interval_value) || 1
          if (round.recurrence_type === 'monthly') setScheduleIntervalMonths(iv)
          else setScheduleIntervalWeeks(iv)
        }
        if (round.recurrence_type === 'monthly' || round.recurrence_type === 'weekly') {
          setRecurrenceType(round.recurrence_type)
        }
        if (round.day_of_month != null) setScheduleDayOfMonth(Number(round.day_of_month) || 1)
        if (round.starting_date) setScheduleStartingDate(String(round.starting_date).slice(0, 10))
      } else if (kind === 'manual' || dates.length > 0) {
        setScheduleMode('manual')
        // Prefer real day placements. Don't shrink a richer local multi-date
        // list down to a single scheduled_date anchor from PATCH.
        if (fromPlacements.length > 0) {
          setPlacementDates(fromPlacements)
        } else if (dates.length > 0) {
          setPlacementDates(prev => (prev.length > 0 ? prev : dates))
        }
      }
      // If server kind is still null, keep local scheduleMode / placementDates.
    }

    void (async () => {
      const next = await buildSandboxRoute(round, uid, users, routesRef.current[0] ?? null)
      if (cancelled) return
      setRoutes([next])
      if (roundChanged) {
        setDrawMode(false)
        setDrawOrder([])
      }
    })()

    return () => { cancelled = true }
  }, [round, users])

  // Re-inject start/end homes when the placement employee changes.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next = await buildSandboxRoute(round, placementUserId, users, routesRef.current[0] ?? null)
      if (cancelled) return
      setRoutes([next])
    })()
    return () => { cancelled = true }
  }, [placementUserId]) // eslint-disable-line react-hooks/exhaustive-deps -- round/users handled above

  const patchPlacement = useCallback(async (next: {
    name?: string | null
    assigned_user_id?: number | null
    scheduled_date?: string | null
    schedule_kind?: 'manual' | 'recurring' | null
    day_of_week?: number | null
    interval_value?: number | null
    recurrence_type?: 'weekly' | 'monthly' | null
    day_of_month?: number | null
    starting_date?: string | null
  }) => {
    if (!round?.id) return
    try {
      const res = await fetch(apiUrl(`/rounds/${round.id}`), {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(next),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not update placement')
      if (data.round) onSaved?.(data.round as ApiRound)
    } catch (err) {
      console.error('[sandbox] placement patch failed', err)
    }
  }, [round?.id, onSaved])

  const handleRoundName = useCallback((name: string | null) => {
    void patchPlacement({ name })
  }, [patchPlacement])

  const handlePlacementUser = useCallback((userId: number | null) => {
    setPlacementUserId(userId)
    void patchPlacement({ assigned_user_id: userId })
  }, [patchPlacement])

  const notify = useCallback((msg: string) => {
    setOptimizeNotice(msg)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setOptimizeNotice(null), 4000)
  }, [])

  // Solo company: default to the only employee (same as day planner focus).
  useEffect(() => {
    if (placementUserId != null) return
    if (users.length !== 1) return
    const only = users[0]?.id
    if (only == null) return
    handlePlacementUser(only)
  }, [users, placementUserId, handlePlacementUser])

  const placeRecurringOccurrences = useCallback(async (
    roundId: number,
    userId: number,
    cadence: {
      recurrenceType: RoundRecurrenceType
      dayOfWeek: number
      intervalWeeks: number
      dayOfMonth: number
      intervalMonths: number
      startingDate: string | null
    },
  ) => {
    const intervalValue = cadence.recurrenceType === 'monthly'
      ? cadence.intervalMonths
      : cadence.intervalWeeks
    const dates = expandRecurringDates({
      recurrenceType: cadence.recurrenceType,
      dayOfWeek: cadence.dayOfWeek,
      intervalWeeks: cadence.intervalWeeks,
      dayOfMonth: cadence.dayOfMonth,
      intervalMonths: cadence.intervalMonths,
      startingDate: cadence.startingDate,
    })
    if (dates.length === 0) {
      throw new Error('Could not compute recurring dates — check the schedule.')
    }
    const result = await placeRound(roundId, {
      assigned_user_id: userId,
      dates,
      schedule_kind: 'recurring',
      day_of_week: cadence.dayOfWeek,
      interval_value: intervalValue,
      recurrence_type: cadence.recurrenceType,
      day_of_month: cadence.dayOfMonth,
      // Persist the first real occurrence (never a past start).
      starting_date: dates[0] || cadence.startingDate || null,
      // Drop future packages/jobs that are no longer on this cadence.
      replace_future: true,
    })
    const daysWithJobs = result.placed.filter(p => (p.job_ids?.length || 0) > 0).length
    if (daysWithJobs === 0) {
      throw new Error('Schedule saved but no jobs were created on those days.')
    }
    const packaged = result.placed.filter(p => p.status === 'planned' || p.daily_route_id != null).length
    if (packaged === 0) {
      throw new Error('Jobs were created but not combined into round packages. Try placing again.')
    }
    return { ...result, dates, daysWithJobs }
  }, [])

  const applyManualSchedule = useCallback((dates: string[]) => {
    const nextDates = [...dates].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
    setScheduleMode('manual')
    setPlacementDates(nextDates)
    void (async () => {
      if (!round?.id || nextDates.length === 0) {
        if (round?.id) {
          void patchPlacement({
            scheduled_date: nextDates[0] || null,
            schedule_kind: 'manual',
          })
        }
        return
      }
      // Always persist kind + anchor date so the button / list leave "Draft"
      // even when we can't place jobs yet (no employee / place error).
      const persistManualMeta = () => patchPlacement({
        scheduled_date: nextDates[0] || null,
        schedule_kind: 'manual',
      })

      if (placementUserId == null || placementUserId <= 0) {
        void persistManualMeta()
        notify('Schedule set — choose an employee, then Save to place jobs on the calendar.')
        return
      }
      try {
        await saveRound(round.id, {
          name: round.name?.trim() || null,
          in_library: true,
        })
        const result = await placeRound(round.id, {
          assigned_user_id: placementUserId,
          dates: nextDates,
        })
        onSaved?.(result.round)
        const days = result.placed.filter(p => (p.job_ids?.length || 0) > 0).length
        notify(`Placed on ${days} day${days === 1 ? '' : 's'}.`)
      } catch (err) {
        void persistManualMeta()
        notify(err instanceof Error ? err.message : 'Could not place round on those days')
      }
    })()
  }, [round, placementUserId, patchPlacement, onSaved, notify])

  const applyRecurringSchedule = useCallback((next: {
    recurrenceType: RoundRecurrenceType
    dayOfWeek: number
    intervalWeeks: number
    dayOfMonth: number
    intervalMonths: number
    startingDate: string
  }) => {
    setScheduleMode('recurring')
    setPlacementDates([])
    setRecurrenceType(next.recurrenceType)
    setScheduleDayOfWeek(next.dayOfWeek)
    setScheduleIntervalWeeks(next.intervalWeeks)
    setScheduleDayOfMonth(next.dayOfMonth)
    setScheduleIntervalMonths(next.intervalMonths)
    setScheduleStartingDate(next.startingDate)

    void (async () => {
      if (!round?.id) return
      if (placementUserId == null || placementUserId <= 0) {
        void patchPlacement({
          scheduled_date: null,
          schedule_kind: 'recurring',
          day_of_week: next.dayOfWeek,
          interval_value: next.recurrenceType === 'monthly' ? next.intervalMonths : next.intervalWeeks,
          recurrence_type: next.recurrenceType,
          day_of_month: next.dayOfMonth,
          starting_date: next.startingDate || null,
        })
        notify('Schedule set — choose an employee, then Save to place jobs on the calendar.')
        return
      }
      try {
        // Persist cadence + create real day jobs immediately (same as subscriptions appearing on Jobs).
        await saveRound(round.id, {
          name: round.name?.trim() || null,
          in_library: true,
        })
        const result = await placeRecurringOccurrences(round.id, placementUserId, {
          ...next,
          startingDate: next.startingDate || null,
        })
        onSaved?.(result.round)
        notify(`Placed on ${result.daysWithJobs} upcoming day${result.daysWithJobs === 1 ? '' : 's'} (round subscriptions created).`)
      } catch (err) {
        // Still keep metadata even if place fails.
        void patchPlacement({
          scheduled_date: null,
          schedule_kind: 'recurring',
          day_of_week: next.dayOfWeek,
          interval_value: next.recurrenceType === 'monthly' ? next.intervalMonths : next.intervalWeeks,
          recurrence_type: next.recurrenceType,
          day_of_month: next.dayOfMonth,
          starting_date: next.startingDate || null,
        })
        notify(err instanceof Error ? err.message : 'Could not place recurring jobs')
      }
    })()
  }, [round, placementUserId, patchPlacement, placeRecurringOccurrences, onSaved, notify])

  /** Clear schedule (or legacy fallbacks used by DayRoutePanel wiring). */
  const handlePlacementDates = useCallback((dates: string[]) => {
    setPlacementDates(dates)
    if (dates.length > 0) {
      setScheduleMode('manual')
      void patchPlacement({
        scheduled_date: dates[0] || null,
        schedule_kind: 'manual',
      })
    }
  }, [patchPlacement])

  const handleScheduleMode = useCallback((next: RoundScheduleMode) => {
    if (next === 'manual') {
      setScheduleMode('manual')
      void patchPlacement({
        scheduled_date: placementDates[0] || null,
        schedule_kind: 'manual',
      })
      return
    }
    if (next === 'recurring') {
      applyRecurringSchedule({
        recurrenceType,
        dayOfWeek: scheduleDayOfWeek,
        intervalWeeks: scheduleIntervalWeeks,
        dayOfMonth: scheduleDayOfMonth,
        intervalMonths: scheduleIntervalMonths,
        startingDate: scheduleStartingDate,
      })
      return
    }
    setScheduleMode(null)
    setPlacementDates([])
    void patchPlacement({
      scheduled_date: null,
      schedule_kind: null,
      day_of_week: null,
      interval_value: null,
      recurrence_type: null,
      day_of_month: null,
      starting_date: null,
    })
  }, [
    applyRecurringSchedule,
    patchPlacement,
    placementDates,
    recurrenceType,
    scheduleDayOfWeek,
    scheduleIntervalWeeks,
    scheduleDayOfMonth,
    scheduleIntervalMonths,
    scheduleStartingDate,
  ])

  const directionsGen = useRef(0)
  const coordsKey = useMemo(() => {
    const r = routes[0]
    if (!r) return ''
    // Include every stop id (even without coords) so adding a stop always
    // retriggers directions — otherwise geometry can be cleared and never redrawn.
    return r.jobs
      .filter(j => !j.is_cancelled)
      .map(j => {
        const lat = j.lat != null && Number.isFinite(Number(j.lat)) ? Number(j.lat).toFixed(5) : ''
        const lng = j.lng != null && Number.isFinite(Number(j.lng)) ? Number(j.lng).toFixed(5) : ''
        return `${j.id}:${lat},${lng}`
      })
      .join('|')
  }, [routes])

  // Drive times whenever stop order / coords settle.
  useEffect(() => {
    if (directionsTimer.current) clearTimeout(directionsTimer.current)
    const route = routes[0]
    if (!route) return
    const located = route.jobs.filter(j => j.lat != null && j.lng != null && !j.is_cancelled)
    if (located.length < 2) {
      // Drop a stale line when we no longer have enough waypoints.
      setRoutes(prev => prev.map(r => (
        r.routeGeometry
          ? { ...r, routeGeometry: undefined, totalMinutes: undefined, totalKm: undefined }
          : r
      )))
      return
    }

    const expectedIds = located.map(j => String(j.id)).join('|')
    const gen = ++directionsGen.current
    const routeUserId = route.userId

    directionsTimer.current = setTimeout(() => {
      void (async () => {
        const patch = await applyDirections(route, `dir:round:${round?.id ?? 'draft'}`)
        if (gen !== directionsGen.current) return
        if (!patch?.routeGeometry) return
        setRoutes(prev => prev.map(r => {
          if (r.userId !== routeUserId) return r
          const still = r.jobs
            .filter(j => j.lat != null && j.lng != null && !j.is_cancelled)
            .map(j => String(j.id))
            .join('|')
          // Ignore late responses from an older stop list.
          if (still !== expectedIds) return r
          return {
            ...r,
            totalMinutes: patch.totalMinutes ?? r.totalMinutes,
            totalKm: patch.totalKm ?? r.totalKm,
            routeGeometry: patch.routeGeometry ?? r.routeGeometry,
            jobs: r.jobs.map(prevJob => {
              const patched = (patch.jobs ?? []).find(j => String(j.id) === String(prevJob.id))
              return patched
                ? { ...prevJob, legMinutes: patched.legMinutes, etaMinutes: patched.etaMinutes }
                : prevJob
            }),
          }
        }))
        if (patch.totalMinutes != null && Number.isFinite(patch.totalMinutes)) {
          setBaselineDrive(prev => (
            prev[routeUserId] != null ? prev : { ...prev, [routeUserId]: patch.totalMinutes! }
          ))
        }
      })()
    }, 450)

    return () => {
      if (directionsTimer.current) clearTimeout(directionsTimer.current)
    }
  }, [coordsKey, round?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- route identity via coordsKey

  // Keep the map in sync with panel routes (pins + drawn line).
  useEffect(() => {
    onRoutesChange?.(routes)
  }, [routes, onRoutesChange])

  const persistOrder = useCallback(async (jobs: RouteJob[]) => {
    const ids = stopIdsFromJobs(jobs)
    if (ids.length === 0) return
    await onReorder(ids)
  }, [onReorder])

  const handleReorder = useCallback(async (_userId: number, newJobs: RouteJob[]) => {
    const current = routesRef.current[0]
    const uid = current?.userId ?? SANDBOX_USER_ID
    setRoutes([{
      userId: uid,
      userName: current?.userName || round?.name?.trim() || 'New round',
      color: colorForUserId(uid),
      jobs: newJobs,
      totalMinutes: undefined,
      totalKm: undefined,
      routeGeometry: undefined,
    }])
    await persistOrder(newJobs)
  }, [persistOrder, round?.name])

  const optimize = useCallback(async () => {
    const route = routes[0]
    if (!route) return
    const middle = route.jobs.filter(j => !j.is_cancelled && !j.is_home)
    const located = middle.filter(j => j.lat != null && j.lng != null)
    if (located.length < 2) {
      notify('Need at least 2 located stops to optimize.')
      return
    }
    setOptimizing(true)
    try {
      const start = route.jobs.find(j => j.is_home && String(j.id).startsWith('start-'))
      const end = route.jobs.find(j => j.is_home && String(j.id).startsWith('end-'))
      const result = await optimizeMiddleJobsClient(
        located.map(j => ({ id: j.id, lat: j.lat as number, lng: j.lng as number })),
        {
          start: start?.lat != null && start?.lng != null ? { lat: start.lat, lng: start.lng } : null,
          end: end?.lat != null && end?.lng != null ? { lat: end.lat, lng: end.lng } : null,
        },
      )
      const byId = new Map(middle.map(j => [String(j.id), j] as const))
      const sorted = result.orderedIds.map(id => byId.get(String(id))).filter((j): j is RouteJob => !!j)
      const placed = new Set(sorted.map(j => String(j.id)))
      for (const j of middle) if (!placed.has(String(j.id))) sorted.push(j)
      const same = sorted.every((j, i) => String(j.id) === String(middle[i]?.id))
      if (same) {
        notify('This is already the fastest order we found.')
        return
      }
      const full = withHomeAndCancelled(route, sorted)
      await handleReorder(route.userId, full)
    } catch {
      notify('Could not optimize this route. Try again in a moment.')
    } finally {
      setOptimizing(false)
    }
  }, [routes, handleReorder, notify])

  const startDraw = useCallback(() => {
    const route = routes[0]
    const tm = route?.totalMinutes
    drawBaselineRef.current = tm != null && Number.isFinite(tm) && tm > 0 ? tm : null
    if (drawCompareTimer.current) clearTimeout(drawCompareTimer.current)
    setDrawRouteComparison(null)
    setDrawMode(true)
    setDrawOrder([])
  }, [routes])

  const exitDraw = useCallback(() => {
    drawBaselineRef.current = null
    if (drawCompareTimer.current) clearTimeout(drawCompareTimer.current)
    setDrawRouteComparison(null)
    setDrawMode(false)
    setDrawOrder([])
  }, [])

  const resetDraw = useCallback(() => setDrawOrder([]), [])

  const assignDraw = useCallback((jobId: number | string) => {
    const route = routes[0]
    if (!route) return
    const middleJobs = route.jobs.filter(j => !j.is_cancelled && !j.is_home)
    if (!middleJobs.some(j => String(j.id) === String(jobId))) return

    setDrawOrder(prev => {
      const idx = prev.findIndex(id => String(id) === String(jobId))
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
            const patch = await applyDirections({ ...route, jobs: fullOrder }, `dir:round-draw:${round?.id}`)
            const newTotal = patch?.totalMinutes
            if (baseline != null && newTotal != null && Math.abs(baseline - newTotal) >= 0.5) {
              if (drawCompareTimer.current) clearTimeout(drawCompareTimer.current)
              setDrawRouteComparison({ diffMinutes: baseline - newTotal })
              drawCompareTimer.current = setTimeout(() => setDrawRouteComparison(null), 8000)
            }
          } catch { /* nicety */ }
        })()
      })

      setTimeout(() => {
        void handleReorder(route.userId, fullOrder)
        setDrawMode(false)
        setDrawOrder([])
      }, 280)
      return next
    })
  }, [routes, round?.id, handleReorder])

  const confirmSave = useCallback(async () => {
    const roundId = round?.id ?? (mode.roundId != null ? Number(mode.roundId) : null)
    if (roundId == null || !Number.isFinite(roundId)) {
      notify('Round is still being created — wait a moment and try again.')
      return
    }
    if ((round?.stops?.length || 0) < 1) {
      notify('Add at least one stop before saving.')
      return
    }

    const effectiveMode: RoundScheduleMode =
      scheduleMode
      ?? (round?.schedule_kind === 'recurring' || round?.schedule_kind === 'manual'
        ? round.schedule_kind
        : null)

    if (effectiveMode === 'manual' && (placementUserId == null || placementDates.length === 0)) {
      notify('Add schedule dates (or clear schedule) before saving.')
      return
    }
    if (effectiveMode === 'recurring' && placementUserId == null) {
      notify('Choose an employee before saving a repeating round.')
      return
    }

    setSaving(true)
    try {
      const drive = routes[0]?.totalMinutes
      const km = routes[0]?.totalKm
      let next = await saveRound(roundId, {
        name: round?.name?.trim() || null,
        total_minutes: drive != null && Number.isFinite(drive) ? drive : null,
        total_km: km != null && Number.isFinite(km) ? km : null,
        in_library: true,
      })

      if (effectiveMode === 'manual' && placementUserId != null && placementDates.length > 0) {
        const result = await placeRound(roundId, {
          assigned_user_id: placementUserId,
          dates: placementDates,
        })
        next = result.round
        const days = result.placed.filter(p => (p.job_ids?.length || 0) > 0).length
        notify(`Saved — placed on ${days} day${days === 1 ? '' : 's'}.`)
      } else if (effectiveMode === 'recurring' && placementUserId != null) {
        const result = await placeRecurringOccurrences(roundId, placementUserId, {
          recurrenceType: round?.recurrence_type === 'monthly' ? 'monthly' : recurrenceType,
          dayOfWeek: round?.day_of_week != null ? Number(round.day_of_week) : scheduleDayOfWeek,
          intervalWeeks: round?.recurrence_type !== 'monthly' && round?.interval_value != null
            ? Number(round.interval_value)
            : scheduleIntervalWeeks,
          dayOfMonth: round?.day_of_month != null ? Number(round.day_of_month) : scheduleDayOfMonth,
          intervalMonths: round?.recurrence_type === 'monthly' && round?.interval_value != null
            ? Number(round.interval_value)
            : scheduleIntervalMonths,
          startingDate: scheduleStartingDate || round?.starting_date || null,
        })
        next = result.round
        notify(`Saved — created jobs on ${result.daysWithJobs} upcoming days (round subscriptions).`)
      } else {
        notify(round?.status === 'saved' || round?.status === 'placed' ? 'Round updated.' : 'Round saved to library.')
      }

      onSaved?.(next)
      if (drive != null && routes[0]) setBaselineDrive({ [routes[0].userId]: drive })
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save round')
    } finally {
      setSaving(false)
    }
  }, [
    round,
    mode.roundId,
    scheduleMode,
    placementUserId,
    placementDates,
    routes,
    recurrenceType,
    scheduleDayOfWeek,
    scheduleIntervalWeeks,
    scheduleDayOfMonth,
    scheduleIntervalMonths,
    scheduleStartingDate,
    onSaved,
    notify,
    placeRecurringOccurrences,
  ])

  const alreadySaved = round?.status === 'saved' || round?.status === 'placed'
  const focused = routes[0]
  const focusUserId = focused?.userId ?? SANDBOX_USER_ID

  /** Employee switcher sees every teammate; only the focused one carries stops + homes. */
  const panelRoutes = useMemo((): UserRoute[] => {
    const working = routes[0]
    if (!working) return []
    if (placementUserId == null || placementUserId <= 0 || users.length === 0) {
      return [working]
    }
    return users.map(u => {
      if (working.userId === u.id) return working
      return {
        userId: u.id,
        userName: `${u.first_name || ''} ${u.last_name || ''}`.trim() || `User ${u.id}`,
        color: colorForUserId(u.id),
        jobs: [],
      }
    })
  }, [users, routes, placementUserId])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 min-h-0">
        {loading && mode.roundId != null && !round ? (
          <div className="p-4 text-sm text-gray-500">Loading round…</div>
        ) : (
          <DayRoutePanel
            companySlug={companySlug}
            routes={panelRoutes.length > 0 ? panelRoutes : routes}
            focusUserId={focusUserId}
            onSelectUser={(userId) => handlePlacementUser(userId)}
            onClearUser={leave}
            onReorder={handleReorder}
            onJobOpen={() => {}}
            onOptimize={() => void optimize()}
            optimizing={optimizing}
            optimizeNotice={optimizeNotice}
            geocodingCount={0}
            onSave={async () => { await confirmSave() }}
            onBackToWeek={leave}
            dateLabel={round?.name?.trim() || 'New round'}
            date={undefined}
            onAddJob={onAddStop}
            baselineMinutesByUser={baselineDrive}
            drawMode={drawMode}
            drawOrder={drawOrder}
            drawRouteComparison={drawRouteComparison}
            onDrawStart={startDraw}
            onDrawAssign={assignDraw}
            onDrawReset={resetDraw}
            onDrawExit={exitDraw}
            plannedMetaByUser={alreadySaved && focused ? { [focused.userId]: { status: 'planned' } } : undefined}
            unsavedUserIds={[]}
            hasUnsavedChanges={false}
            panelKind="round"
            placementUsers={users}
            placementUserId={placementUserId}
            placementDates={placementDates}
            placementScheduleMode={scheduleMode}
            placementDayOfWeek={scheduleDayOfWeek}
            placementIntervalWeeks={scheduleIntervalWeeks}
            onPlacementUserChange={handlePlacementUser}
            onPlacementDatesChange={handlePlacementDates}
            onPlacementScheduleModeChange={handleScheduleMode}
            onApplyManualSchedule={applyManualSchedule}
            onApplyRecurringSchedule={applyRecurringSchedule}
            onPlacementDayOfWeekChange={(day) => {
              applyRecurringSchedule({
                recurrenceType,
                dayOfWeek: day,
                intervalWeeks: scheduleIntervalWeeks,
                dayOfMonth: scheduleDayOfMonth,
                intervalMonths: scheduleIntervalMonths,
                startingDate: scheduleStartingDate,
              })
            }}
            onPlacementIntervalWeeksChange={(n) => {
              applyRecurringSchedule({
                recurrenceType: 'weekly',
                dayOfWeek: scheduleDayOfWeek,
                intervalWeeks: n,
                dayOfMonth: scheduleDayOfMonth,
                intervalMonths: scheduleIntervalMonths,
                startingDate: scheduleStartingDate,
              })
            }}
            placementRecurrenceType={recurrenceType}
            placementDayOfMonth={scheduleDayOfMonth}
            placementIntervalMonths={scheduleIntervalMonths}
            placementStartingDate={scheduleStartingDate}
            onPlacementRecurrenceTypeChange={(t) => {
              applyRecurringSchedule({
                recurrenceType: t,
                dayOfWeek: scheduleDayOfWeek,
                intervalWeeks: scheduleIntervalWeeks,
                dayOfMonth: scheduleDayOfMonth,
                intervalMonths: scheduleIntervalMonths,
                startingDate: scheduleStartingDate,
              })
            }}
            onPlacementDayOfMonthChange={(d) => {
              applyRecurringSchedule({
                recurrenceType: 'monthly',
                dayOfWeek: scheduleDayOfWeek,
                intervalWeeks: scheduleIntervalWeeks,
                dayOfMonth: d,
                intervalMonths: scheduleIntervalMonths,
                startingDate: scheduleStartingDate,
              })
            }}
            onPlacementIntervalMonthsChange={(n) => {
              applyRecurringSchedule({
                recurrenceType: 'monthly',
                dayOfWeek: scheduleDayOfWeek,
                intervalWeeks: scheduleIntervalWeeks,
                dayOfMonth: scheduleDayOfMonth,
                intervalMonths: n,
                startingDate: scheduleStartingDate,
              })
            }}
            onPlacementStartingDateChange={(d) => {
              applyRecurringSchedule({
                recurrenceType,
                dayOfWeek: scheduleDayOfWeek,
                intervalWeeks: scheduleIntervalWeeks,
                dayOfMonth: scheduleDayOfMonth,
                intervalMonths: scheduleIntervalMonths,
                startingDate: d || '',
              })
            }}
            onRoundNameChange={handleRoundName}
            onRouteLocationsChanged={() => {
              if (placementUserId != null) invalidateWorkHoursCache(placementUserId)
              void (async () => {
                const next = await buildSandboxRoute(round, placementUserId, users, null)
                setRoutes([next])
              })()
            }}
          />
        )}
      </div>
    </div>
  )
}

export async function createPlaygroundRound(name?: string): Promise<ApiRound> {
  const res = await fetch(apiUrl('/rounds'), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name: name || null, status: 'playground', in_library: true }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Could not create round')
  return data.round as ApiRound
}

export async function fetchRound(roundId: number): Promise<ApiRound> {
  const res = await fetch(apiUrl(`/rounds/${roundId}`), { headers: authHeaders() })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Could not load round')
  return data.round as ApiRound
}

export async function saveRound(
  roundId: number,
  opts?: {
    name?: string | null
    total_minutes?: number | null
    total_km?: number | null
    in_library?: boolean
  },
): Promise<ApiRound> {
  const res = await fetch(apiUrl(`/rounds/${roundId}/save`), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(opts || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Could not save round')
  return data.round as ApiRound
}

export async function placeRound(
  roundId: number,
  opts: {
    assigned_user_id: number
    dates: string[]
    schedule_kind?: 'manual' | 'recurring'
    day_of_week?: number | null
    interval_value?: number | null
    recurrence_type?: 'weekly' | 'monthly' | null
    day_of_month?: number | null
    starting_date?: string | null
    replace_future?: boolean
  },
): Promise<{
  round: ApiRound
  placed: Array<{
    date: string
    job_ids?: number[]
    status?: string
    daily_route_id?: number
    name?: string
  }>
}> {
  const res = await fetch(apiUrl(`/rounds/${roundId}/place`), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(opts),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Could not place round')
  return {
    round: data.round as ApiRound,
    placed: Array.isArray(data.placed) ? data.placed : [],
  }
}

export async function addStopToRound(roundId: number, stop: RoundStopPayload): Promise<ApiRound> {
  const res = await fetch(apiUrl(`/rounds/${roundId}/stops`), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(stop),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Could not add stop')
  return data.round as ApiRound
}

export async function reorderRoundStops(roundId: number, stopIds: number[]): Promise<ApiRound> {
  const res = await fetch(apiUrl(`/rounds/${roundId}/stops/order`), {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ stop_ids: stopIds }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Could not reorder')
  return data.round as ApiRound
}

export function useSandboxRound(roundId: number | null) {
  const [round, setRound] = useState<ApiRound | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (roundId == null) {
      setRound(null)
      return
    }
    setLoading(true)
    try {
      const next = await fetchRound(roundId)
      setRound(next)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [roundId])

  useEffect(() => { reload() }, [reload])

  const reorder = useCallback(async (stopIds: number[]) => {
    if (roundId == null) return
    const next = await reorderRoundStops(roundId, stopIds)
    setRound(next)
  }, [roundId])

  return { round, loading, error, reload, setRound, reorder }
}
