'use client'

/**
 * Context-aware left sidebar for the map multitool. The map stays put;
 * this panel changes with the URL mode:
 *   idle      → search prompt
 *   day       → all employees for a date (click one to focus their route)
 *   route     → one employee's ordered stop list (edit deep-links to planner)
 *   employee  → date-range day summaries for one employee
 *   client    → client card + all route-days their location is on
 *   location  → ProspectPanel (nearest routes/clients, offer composer)
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PencilSquareIcon,
  PlusCircleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import type { UserRoute } from '@/app/components/RouteMap'
import { colorForUserId, initialsFromName } from '@/app/components/RouteMap'
import CreateJobSlideout from '@/app/components/CreateJobSlideout'
import { addDaysStr, clientDateRange, locationBase, mondayOfWeek, todayStr, weekRangeContaining, withReturnTo, type MapMode } from './mapMode'
import { BusyBar, fmtDate, fmtMinutes, type RouteDayKey } from './NearestRoutesList'
import MapMonthCalendar, {
  type CalendarDayMark,
  type CalendarDayStatus,
  type CalendarRange,
} from './MapMonthCalendar'
import ProspectPanel from './ProspectPanel'
import ClientExplorePanel, { type ClientExploreLayer } from './ClientExplorePanel'
import EmployeeExplorePanel, { type ParkedRouteMeta } from './EmployeeExplorePanel'
import type { MapOverlayLocation } from './mapOverlays'
import {
  fetchClient,
  fetchClientRoutes,
  fetchDayCapacityMinutes,
  fetchEmployeeDays,
  type ClientRouteRow,
  type EmployeeDayRow,
  type MapClient,
  type MapUser,
  type NearestClientRow,
} from './useMapData'

// ── Shared bits ─────────────────────────────────────────────────────────────

function PanelShell({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>
}

function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
    >
      <ArrowLeftIcon className="w-3.5 h-3.5" /> {label}
    </button>
  )
}

function DateStepper({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(addDaysStr(date, -1))}
        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
        aria-label="Previous day"
      >
        <ChevronLeftIcon className="w-4 h-4" />
      </button>
      <input
        type="date"
        value={date}
        onChange={e => { if (e.target.value) onChange(e.target.value) }}
        className="flex-1 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 outline-none text-center"
      />
      <button
        type="button"
        onClick={() => onChange(addDaysStr(date, 1))}
        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
        aria-label="Next day"
      >
        <ChevronRightIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

// ── Employee range panel ────────────────────────────────────────────────────

function weekDates(weekFrom: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysStr(weekFrom, i))
}

function fmtWeekHeading(weekFrom: string, weekTo: string): string {
  const [y1, m1, d1] = weekFrom.split('-').map(Number)
  const [y2, m2, d2] = weekTo.split('-').map(Number)
  const a = new Date(y1, m1 - 1, d1)
  const b = new Date(y2, m2 - 1, d2)
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  if (sameMonth) {
    return `${a.toLocaleDateString(undefined, { day: 'numeric' })}–${b.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
  }
  return `${a.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function fmtWeekdayShort(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' })
}

function fmtDayNum(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function busyTone(ratio: number): { bar: string; label: string; chip: string } {
  if (ratio >= 1) {
    return {
      bar: 'bg-red-500',
      label: 'Full',
      chip: 'bg-red-50 text-red-700 border-red-100',
    }
  }
  if (ratio >= 0.85) {
    return {
      bar: 'bg-amber-500',
      label: 'Busy',
      chip: 'bg-amber-50 text-amber-800 border-amber-100',
    }
  }
  if (ratio >= 0.45) {
    return {
      bar: 'bg-accent-500',
      label: 'Steady',
      chip: 'bg-accent-50 text-accent-800 border-accent-100',
    }
  }
  if (ratio > 0) {
    return {
      bar: 'bg-emerald-400',
      label: 'Light',
      chip: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    }
  }
  return {
    bar: 'bg-gray-200',
    label: 'Free',
    chip: 'bg-gray-50 text-gray-500 border-gray-100',
  }
}

function EmployeeRangePanel({
  userId,
  from,
  to,
  users,
  navigate,
  previewKeys = [],
  onSetPreviewRouteDays,
}: {
  userId: number
  from: string
  to: string
  users: MapUser[]
  navigate: (mode: MapMode, opts?: { replace?: boolean }) => void
  previewKeys?: RouteDayKey[]
  onSetPreviewRouteDays?: (rows: { date: string; user_id: number }[]) => void
}) {
  const user = users.find(u => u.id === userId)
  const weekFrom = mondayOfWeek(from)
  const weekTo = addDaysStr(weekFrom, 6)
  const dates = useMemo(() => weekDates(weekFrom), [weekFrom])
  const today = todayStr()
  const color = colorForUserId(userId)
  const initials = initialsFromName(
    user ? `${user.first_name} ${user.last_name}` : `U${userId}`,
  )

  const [daysByDate, setDaysByDate] = useState<Record<string, EmployeeDayRow>>({})
  const [capacityByDate, setCapacityByDate] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  // Keep URL on a clean Mon–Sun week so calendar highlight + list stay in sync.
  useEffect(() => {
    if (from !== weekFrom || to !== weekTo) {
      navigate({ kind: 'employee', userId, from: weekFrom, to: weekTo }, { replace: true })
    }
  }, [from, to, weekFrom, weekTo, userId, navigate])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const fetchFrom = addDaysStr(weekFrom, -42)
    const fetchTo = addDaysStr(weekTo, 42)
    ;(async () => {
      try {
        const [rows, caps] = await Promise.all([
          fetchEmployeeDays(userId, fetchFrom, fetchTo),
          Promise.all(dates.map(async date => [date, await fetchDayCapacityMinutes(userId, date)] as const)),
        ])
        if (!alive) return
        const byDate: Record<string, EmployeeDayRow> = {}
        for (const row of rows) byDate[String(row.date).slice(0, 10)] = row
        setDaysByDate(byDate)
        setCapacityByDate(Object.fromEntries(caps))
      } catch {
        if (!alive) return
        setDaysByDate({})
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [userId, weekFrom, weekTo, dates])

  const openDay = (date: string) => {
    navigate(withReturnTo(
      { kind: 'route', date, userId },
      { kind: 'employee', userId, from: weekFrom, to: weekTo },
    ))
  }

  const previewOrOpenDay = (date: string, hasWork: boolean) => {
    if (hasWork && onSetPreviewRouteDays) {
      const key = `${date}:${userId}`
      if (previewKeys.includes(key)) {
        onSetPreviewRouteDays([])
        return
      }
      onSetPreviewRouteDays([{ date, user_id: userId }])
      return
    }
    openDay(date)
  }

  const shiftWeek = (delta: number) => {
    const nextFrom = addDaysStr(weekFrom, delta * 7)
    navigate({
      kind: 'employee',
      userId,
      from: nextFrom,
      to: addDaysStr(nextFrom, 6),
    })
  }

  const weekRows = dates.map(date => {
    const row = daysByDate[date]
    const used = row ? Number(row.job_minutes || 0) + Number(row.drive_minutes || 0) : 0
    const capacity = capacityByDate[date] || 480
    const ratio = used / Math.max(1, capacity)
    return { date, row, used, capacity, ratio, tone: busyTone(ratio) }
  })

  const weekUsed = weekRows.reduce((s, r) => s + r.used, 0)
  const weekCap = weekRows.reduce((s, r) => s + r.capacity, 0)
  const weekRatio = weekUsed / Math.max(1, weekCap)
  const weekTone = busyTone(weekRatio)
  const weekJobs = weekRows.reduce((s, r) => s + (r.row?.stop_count || 0), 0)

  return (
    <PanelShell>
      <BackButton onClick={() => navigate({ kind: 'idle' })} label="Map" />

      {/* Employee header */}
      <div className="rounded-2xl bg-white border border-gray-200/80 p-3.5 shadow-sm shadow-black/[0.02]">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-sm font-bold shadow-sm ring-2 ring-white"
            style={{ background: color }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-gray-900 truncate leading-tight">
              {user ? `${user.first_name} ${user.last_name}` : `User ${userId}`}
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {weekJobs > 0
                ? `${weekJobs} stop${weekJobs === 1 ? '' : 's'} this week`
                : 'No stops this week'}
            </p>
          </div>
          <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${weekTone.chip}`}>
            {weekTone.label}
          </span>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Week load</span>
            <span className="text-[10px] font-semibold text-gray-500 tabular-nums">
              {fmtMinutes(weekUsed)}
              <span className="font-normal text-gray-400"> / {fmtMinutes(weekCap)}</span>
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ease-out ${weekTone.bar}`}
              style={{ width: `${Math.min(100, weekRatio * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Week navigator + day cards */}
      <div className="rounded-2xl bg-white border border-gray-200/80 overflow-hidden shadow-sm shadow-black/[0.02]">
        <div className="flex items-center gap-1 px-2.5 py-2 border-b border-gray-100 bg-gray-50/60">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-white hover:text-gray-800 hover:shadow-sm transition-all"
            aria-label="Previous week"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0 text-center">
            <div className="text-[12px] font-bold text-gray-800 tracking-tight">
              {fmtWeekHeading(weekFrom, weekTo)}
            </div>
            <button
              type="button"
              onClick={() => {
                const { from: mon, to: sun } = weekRangeContaining(today)
                navigate({ kind: 'employee', userId, from: mon, to: sun })
              }}
              className="text-[10px] font-semibold text-accent-600 hover:text-accent-700 transition-colors"
            >
              This week
            </button>
          </div>
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-white hover:text-gray-800 hover:shadow-sm transition-all"
            aria-label="Next week"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="p-2 space-y-1">
          {loading && (
            <div className="space-y-1.5 p-1">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className="h-[58px] rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          )}
          {!loading && weekRows.map(({ date, row, used, capacity, ratio, tone }) => {
            const isToday = date === today
            const isPast = date < today
            const hasWork = !!row && row.stop_count > 0
            const previewKey = `${date}:${userId}`
            const isPreview = previewKeys.includes(previewKey)
            return (
              <div
                key={date}
                className={[
                  'w-full rounded-xl border px-3 py-2.5 text-left transition-all',
                  isPreview
                    ? 'border-accent-500 bg-accent-500/[0.08] shadow-[0_0_0_1px_rgba(61,213,122,0.25)]'
                    : isToday
                      ? 'border-primary-500/25 bg-primary-500/[0.04] shadow-sm'
                      : hasWork
                        ? 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                        : 'border-transparent bg-transparent hover:bg-gray-50',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => previewOrOpenDay(date, hasWork)}
                  className="w-full text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 flex-shrink-0 pt-0.5">
                      <div className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? 'text-primary-600' : 'text-gray-400'}`}>
                        {fmtWeekdayShort(date)}
                      </div>
                      <div className={`text-[13px] font-bold tabular-nums leading-tight ${isPast && !hasWork ? 'text-gray-400' : 'text-gray-900'}`}>
                        {fmtDayNum(date)}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      {hasWork ? (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex items-center gap-1.5">
                              <span className="text-[12px] font-semibold text-gray-800 truncate">
                                {row!.stop_count} stop{row!.stop_count === 1 ? '' : 's'}
                              </span>
                              {row!.has_saved_route && (
                                <span className="text-[9px] font-bold text-accent-700 bg-accent-500/10 rounded-full px-1.5 py-0.5">
                                  Planned
                                </span>
                              )}
                              {row!.projected_count > 0 && (
                                <span className="text-[9px] font-semibold text-gray-400">
                                  +{row!.projected_count} ghost
                                </span>
                              )}
                            </div>
                            <span className={`flex-shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${tone.chip}`}>
                              {Math.round(ratio * 100)}%
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${tone.bar}`}
                                style={{ width: `${Math.min(100, ratio * 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-medium text-gray-400 tabular-nums flex-shrink-0">
                              {fmtMinutes(used)}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-2.5 text-[10px] text-gray-400">
                            <span>{fmtMinutes(row!.job_minutes)} work</span>
                            <span>{fmtMinutes(row!.drive_minutes)} drive</span>
                            <span className="text-gray-300">/ {fmtMinutes(capacity)} day</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between gap-2 py-1">
                          <span className={`text-[12px] font-medium ${isPast ? 'text-gray-400' : 'text-gray-500'}`}>
                            {isPast ? 'No route' : 'Open day — add jobs'}
                          </span>
                          <span className="text-[10px] font-semibold text-gray-300 tabular-nums">
                            {fmtMinutes(capacity)} free
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
                {hasWork && (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => openDay(date)}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold transition-colors ${
                        isPreview
                          ? 'bg-accent-500 text-white hover:bg-accent-600'
                          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                      }`}
                    >
                      <PencilSquareIcon className="w-3.5 h-3.5" />
                      Plan
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </PanelShell>
  )
}

// ── Client context panel ────────────────────────────────────────────────────

function ClientContextPanel({
  clientId,
  companySlug,
  navigate,
  previewKeys,
  previewRoutesByKey = {},
  previewLoading = false,
  onClientLoaded,
  onMarkedDays,
  dateRange,
  onSetPreviewRouteDays,
  onHoverJob,
  onJobsChanged,
}: {
  clientId: number
  companySlug: string
  navigate: (mode: MapMode) => void
  previewKeys: RouteDayKey[]
  previewRoutesByKey?: Record<string, UserRoute>
  previewLoading?: boolean
  onClientLoaded: (client: MapClient | null) => void
  /** Calendar status dots for this client's jobs. */
  onMarkedDays?: (marks: CalendarDayMark[]) => void
  /** Calendar span — filters the list + drives map preview. */
  dateRange?: CalendarRange | null
  /** Replace map preview (single route-day at a time). */
  onSetPreviewRouteDays?: (rows: { date: string; user_id: number }[]) => void
  onHoverJob?: (id: number | string | null) => void
  /** Bust caches + rebuild the map preview after scheduling a job. */
  onJobsChanged?: () => void
}) {
  const [client, setClient] = useState<MapClient | null>(null)
  const [rows, setRows] = useState<ClientRouteRow[] | null>(null)
  const [createJobOpen, setCreateJobOpen] = useState(false)
  const [expandedKey, setExpandedKey] = useState<RouteDayKey | null>(null)
  /** `${date}:${userId}` → day load for busy bar */
  const [loadByKey, setLoadByKey] = useState<Record<string, { used: number; capacity: number }>>({})
  // Wide window so the calendar can show past completed/cancelled + upcoming.
  const from = useMemo(() => addDaysStr(todayStr(), -90), [])
  const to = useMemo(() => addDaysStr(todayStr(), 90), [])
  const today = useMemo(() => todayStr(), [])

  const publishMarks = useCallback((list: ClientRouteRow[]) => {
    const byDate = new Map<string, CalendarDayStatus>()
    const rank: Record<CalendarDayStatus, number> = { cancelled: 3, completed: 2, scheduled: 1 }
    for (const row of list) {
      const d = String(row.date || '').slice(0, 10)
      if (!d) continue
      const raw = String(row.status || 'scheduled').toLowerCase()
      const status: CalendarDayStatus =
        raw === 'completed' ? 'completed' : raw === 'cancelled' ? 'cancelled' : 'scheduled'
      const prev = byDate.get(d)
      if (!prev || rank[status] > rank[prev]) byDate.set(d, status)
    }
    onMarkedDays?.(Array.from(byDate.entries()).map(([date, status]) => ({ date, status })))
  }, [onMarkedDays])

  useEffect(() => {
    let alive = true
    setClient(null)
    setRows(null)
    setExpandedKey(null)
    onMarkedDays?.([])
    fetchClient(clientId).then(c => {
      if (!alive) return
      setClient(c)
      onClientLoaded(c)
    })
    fetchClientRoutes(clientId, from, to)
      .then(r => {
        if (!alive) return
        setRows(r)
        publishMarks(r)
      })
      .catch(() => {
        if (!alive) return
        setRows([])
        onMarkedDays?.([])
      })
    return () => { alive = false }
  }, [clientId, from, to, onClientLoaded, onMarkedDays, publishMarks])

  const visibleRows = useMemo(() => {
    if (!rows) return null
    // List is upcoming only — past stays on the calendar as status dots.
    const upcoming = rows.filter(r => String(r.date || '').slice(0, 10) >= today)
    if (!dateRange) return upcoming
    return upcoming.filter(r => {
      const d = String(r.date || '').slice(0, 10)
      return d >= dateRange.from && d <= dateRange.to
    })
  }, [rows, dateRange, today])

  // One card per employee-day (client may have multiple jobs the same day).
  const routeDayRows = useMemo(() => {
    if (!visibleRows) return null
    const map = new Map<string, ClientRouteRow>()
    for (const r of visibleRows) {
      if (r.user_id == null) continue
      const date = String(r.date || '').slice(0, 10)
      const key = `${date}:${r.user_id}`
      const prev = map.get(key)
      if (!prev) {
        map.set(key, r)
        continue
      }
      // Prefer a non-cancelled row when collapsing duplicates.
      const prevStatus = String(prev.status || '').toLowerCase()
      const nextStatus = String(r.status || '').toLowerCase()
      if (prevStatus === 'cancelled' && nextStatus !== 'cancelled') map.set(key, r)
    }
    return Array.from(map.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }, [visibleRows])

  // Busy-bar data: employee day load + work-hours capacity.
  useEffect(() => {
    if (!routeDayRows || routeDayRows.length === 0) {
      setLoadByKey({})
      return
    }
    let alive = true
    const byUser = new Map<number, Set<string>>()
    for (const r of routeDayRows) {
      if (r.user_id == null) continue
      const date = String(r.date).slice(0, 10)
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Set())
      byUser.get(r.user_id)!.add(date)
    }
    ;(async () => {
      const next: Record<string, { used: number; capacity: number }> = {}
      await Promise.all(Array.from(byUser.entries()).map(async ([userId, dates]) => {
        const dateList = Array.from(dates).sort()
        const dayFrom = dateList[0]
        const dayTo = dateList[dateList.length - 1]
        let days: Awaited<ReturnType<typeof fetchEmployeeDays>> = []
        try {
          days = await fetchEmployeeDays(userId, dayFrom, dayTo)
        } catch {
          days = []
        }
        const byDate = new Map(days.map(d => [String(d.date).slice(0, 10), d]))
        await Promise.all(dateList.map(async date => {
          const capacity = await fetchDayCapacityMinutes(userId, date)
          const ed = byDate.get(date)
          const used = ed ? (Number(ed.job_minutes) || 0) + (Number(ed.drive_minutes) || 0) : 0
          next[`${date}:${userId}`] = { used, capacity }
        }))
      }))
      if (alive) setLoadByKey(next)
    })()
    return () => { alive = false }
  }, [routeDayRows])

  // Calendar day → single-select a route in range (like location “closest”).
  // If the user clears the preview on the same span, don’t force-reselect.
  const rangeFrom = dateRange?.from ?? null
  const rangeTo = dateRange?.to ?? null
  const lastAutoRangeRef = useRef<string | null>(null)
  useEffect(() => {
    if (!onSetPreviewRouteDays) return
    if (!rangeFrom || !rangeTo || !routeDayRows) {
      lastAutoRangeRef.current = null
      return
    }
    const rangeKey = `${rangeFrom}:${rangeTo}`
    const inRange = routeDayRows.filter(r => {
      const d = String(r.date || '').slice(0, 10)
      if (d < rangeFrom || d > rangeTo) return false
      return String(r.status || '').toLowerCase() !== 'cancelled'
    })
    if (inRange.length === 0) {
      if (lastAutoRangeRef.current !== rangeKey) {
        onSetPreviewRouteDays([])
        lastAutoRangeRef.current = rangeKey
      }
      return
    }
    const current = previewKeys[0]
    if (current && inRange.some(r => `${String(r.date).slice(0, 10)}:${r.user_id}` === current)) {
      lastAutoRangeRef.current = rangeKey
      return
    }
    // Same calendar span + empty preview → user deselected; leave it cleared.
    if (lastAutoRangeRef.current === rangeKey && !current) return
    const first = inRange[0]
    onSetPreviewRouteDays([{ date: String(first.date).slice(0, 10), user_id: Number(first.user_id) }])
    lastAutoRangeRef.current = rangeKey
  }, [rangeFrom, rangeTo, routeDayRows, previewKeys, onSetPreviewRouteDays])

  const selectRouteDay = useCallback((row: ClientRouteRow, opts?: { force?: boolean }) => {
    if (row.user_id == null) return
    if (String(row.status || '').toLowerCase() === 'cancelled') return
    const date = String(row.date).slice(0, 10)
    const key = `${date}:${row.user_id}`
    // Clicking the active route again clears it (backdrop pins return to full strength).
    if (!opts?.force && previewKeys.includes(key)) {
      onSetPreviewRouteDays?.([])
      setExpandedKey(null)
      onHoverJob?.(null)
      return
    }
    onSetPreviewRouteDays?.([{ date, user_id: row.user_id }])
  }, [onSetPreviewRouteDays, previewKeys, onHoverJob])

  useEffect(() => {
    if (!expandedKey) return
    if (previewKeys.length === 0 || !previewKeys.includes(expandedKey)) {
      setExpandedKey(null)
    }
  }, [previewKeys, expandedKey])

  const fullName = client
    ? `${client.name}${client.last_name ? ` ${client.last_name}` : ''}`
    : ''
  const addressLine = client
    ? [client.address, client.zip_code, client.city].filter(Boolean).join(', ')
    : ''
  const hasCoords = client?.lat != null && client?.lng != null

  // Prefill Schedule job from the active preview (same as location nearby routes).
  const scheduleFromPreview = useMemo(() => {
    const key = previewKeys[0]
    if (!key) return { date: undefined as string | undefined, userId: null as number | null }
    const [date, userIdStr] = String(key).split(':')
    const userId = parseInt(userIdStr, 10)
    return {
      date: date || undefined,
      userId: Number.isFinite(userId) ? userId : null,
    }
  }, [previewKeys])

  const listHeading = !dateRange
    ? 'Upcoming routes'
    : dateRange.from === dateRange.to
      ? `Routes · ${fmtDate(dateRange.from)}`
      : `Routes · ${fmtDate(dateRange.from)} – ${fmtDate(dateRange.to)}`

  return (
    <PanelShell>
      <BackButton onClick={() => navigate({ kind: 'idle' })} label="Search" />

      {client == null ? (
        <div className="space-y-1.5 px-0.5">
          <div className="h-4 w-40 rounded bg-gray-200/80 animate-pulse" />
          <div className="h-3 w-56 rounded bg-gray-200/60 animate-pulse" />
        </div>
      ) : (
        <div className="px-0.5 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-[15px] font-bold text-gray-900 leading-snug truncate">{fullName}</h2>
            <Link
              href={`/clients/${client.id}`}
              className="flex-shrink-0 mt-0.5 text-gray-400 hover:text-gray-700 transition-colors"
              title="Open profile"
            >
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
            </Link>
          </div>
          <p className="text-[12px] text-gray-500 mt-0.5 leading-snug truncate">
            {addressLine || 'No address'}
          </p>
        </div>
      )}

      <div className="rounded-xl bg-white border border-gray-200/90 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <button
          type="button"
          disabled={!client}
          onClick={() => setCreateJobOpen(true)}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-semibold text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-50 border-b border-gray-100"
        >
          <CalendarDaysIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          Schedule job
        </button>
        <button
          type="button"
          disabled={!client || !hasCoords}
          onClick={() => {
            if (!client || !hasCoords) return
            navigate({
              kind: 'location',
              lat: Number(client.lat),
              lng: Number(client.lng),
              label: addressLine || fullName,
              ...(client.address ? { address: String(client.address) } : {}),
              ...(client.zip_code ? { zip_code: String(client.zip_code) } : {}),
              ...(client.city ? { city: String(client.city) } : {}),
            })
          }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-semibold text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <MapPinIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          Create offer
        </button>
      </div>

      <div className="px-0.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
          {listHeading}
        </h3>
        {routeDayRows == null && (
          <div className="space-y-1.5">
            {[0, 1, 2].map(i => <div key={i} className="h-[72px] rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        )}
        {routeDayRows != null && routeDayRows.length === 0 && (
          <p className="text-[12px] text-gray-500 leading-relaxed py-1">
            {dateRange
              ? 'Nothing upcoming for this client on the selected day(s).'
              : 'No upcoming routes for this client.'}
          </p>
        )}
        <div className="space-y-1.5">
          {(routeDayRows || []).map(r => {
            const date = String(r.date || '').slice(0, 10)
            const key: RouteDayKey = `${date}:${r.user_id}`
            const isPreview = previewKeys.includes(key)
            const isExpanded = expandedKey === key
            const status = String(r.status || 'scheduled').toLowerCase()
            const cancelled = status === 'cancelled'
            const load = loadByKey[key]
            const previewRoute = previewRoutesByKey[key]
            const stops = (previewRoute?.jobs || []).filter(j => !j.is_home)
            const showStopSkeleton = isExpanded && isPreview && !previewRoute && previewLoading

            return (
              <div
                key={key}
                className={`rounded-xl border transition-colors ${
                  cancelled
                    ? 'border-gray-200 bg-white opacity-55'
                    : isPreview
                      ? 'border-accent-500 bg-accent-500/[0.08] shadow-[0_0_0_1px_rgba(61,213,122,0.25)]'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div
                  role="button"
                  tabIndex={cancelled ? -1 : 0}
                  onClick={() => { if (!cancelled) selectRouteDay(r) }}
                  onKeyDown={e => {
                    if (cancelled) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      selectRouteDay(r)
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-2.5 ${cancelled ? '' : 'cursor-pointer'}`}
                >
                  {!cancelled && (
                    <button
                      type="button"
                      aria-label={isExpanded ? 'Collapse stops' : 'Expand stops'}
                      aria-expanded={isExpanded}
                      onClick={e => {
                        e.stopPropagation()
                        const next = isExpanded ? null : key
                        setExpandedKey(next)
                        if (next) selectRouteDay(r, { force: true })
                        else onHoverJob?.(null)
                      }}
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 transition-colors"
                    >
                      {isExpanded
                        ? <ChevronDownIcon className="w-3.5 h-3.5" />
                        : <ChevronRightIcon className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-sm font-semibold text-gray-800 ${cancelled ? 'line-through' : ''}`}>
                        {fmtDate(date)}
                      </span>
                      <span className="text-xs text-gray-500 truncate">{r.user_name || 'Unassigned'}</span>
                      {r.is_projected && (
                        <span className="text-[10px] font-medium text-gray-400">projected</span>
                      )}
                      {cancelled && (
                        <span className="text-[10px] font-medium text-red-500">cancelled</span>
                      )}
                      {status === 'completed' && (
                        <span className="text-[10px] font-medium text-accent-600">done</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                      {r.time_from ? <span>{String(r.time_from).substring(0, 5)}</span> : null}
                      {r.duration_minutes > 0 ? <span>{fmtMinutes(r.duration_minutes)} here</span> : null}
                    </div>
                    {load && !cancelled && (
                      <BusyBar usedMinutes={load.used} capacityMinutes={load.capacity} />
                    )}
                  </div>
                  {Number.isFinite(Number(r.user_id)) && Number(r.user_id) > 0 && !cancelled && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        // Opens the planner in place — the client card and the
                        // calendar span you set are restored when you come back.
                        navigate(withReturnTo(
                          { kind: 'route', date, userId: Number(r.user_id) },
                          {
                            kind: 'client',
                            clientId,
                            ...(dateRange ? { spanFrom: dateRange.from, spanTo: dateRange.to } : {}),
                          },
                        ))
                      }}
                      className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold transition-colors ${
                        isPreview
                          ? 'bg-accent-500 text-white hover:bg-accent-600'
                          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                      }`}
                      title="Open this route in the planner"
                    >
                      <PencilSquareIcon className="w-3.5 h-3.5" />
                      {isPreview && <span>Plan</span>}
                    </button>
                  )}
                </div>

                {isExpanded && !cancelled && (
                  <div className="border-t border-gray-100/80 px-2.5 pb-2.5 pt-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1.5 mb-1">
                      Stops in order
                    </div>
                    {showStopSkeleton && (
                      <div className="space-y-1">
                        {[0, 1, 2].map(i => (
                          <div key={i} className="h-9 rounded-lg bg-gray-100/80 animate-pulse" />
                        ))}
                      </div>
                    )}
                    {!showStopSkeleton && stops.length === 0 && (
                      <p className="text-[12px] text-gray-500 px-1.5 py-1">
                        {isPreview ? 'No stops on this route.' : 'Select this route to load stops.'}
                      </p>
                    )}
                    <div className="space-y-0.5">
                      {stops.map((j, idx) => (
                        <div
                          key={String(j.id)}
                          onMouseEnter={() => onHoverJob?.(j.id)}
                          onMouseLeave={() => onHoverJob?.(null)}
                          className={`flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors ${
                            j.is_cancelled ? 'opacity-45' : 'hover:bg-white/80'
                          }`}
                        >
                          <span
                            className="mt-0.5 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                            style={{ background: previewRoute?.color || '#9CA3AF' }}
                          >
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-gray-800 truncate">
                              {j.label}
                              {j.is_projected && (
                                <span className="ml-1.5 text-[10px] font-semibold text-gray-400">projected</span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500 truncate">
                              {j.time ? `${j.time} · ` : ''}{j.address}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {client && (
        <CreateJobSlideout
          isOpen={createJobOpen}
          onClose={() => setCreateJobOpen(false)}
          onJobCreated={() => {
            setCreateJobOpen(false)
            onJobsChanged?.()
            fetchClientRoutes(clientId, from, to)
              .then(r => {
                setRows(r)
                publishMarks(r)
              })
              .catch(() => {})
          }}
          clientId={client.id}
          clientName={fullName}
          initialDate={scheduleFromPreview.date}
          initialAssignedUserId={scheduleFromPreview.userId}
        />
      )}
    </PanelShell>
  )
}

// ── Idle panel ──────────────────────────────────────────────────────────────

function IdleAction({
  icon,
  title,
  subtitle,
  onClick,
  href,
  accent = false,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  onClick?: () => void
  href?: string
  accent?: boolean
}) {
  const className = `w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
    accent
      ? 'bg-accent-50 border border-accent-200/80 hover:bg-accent-100/70'
      : 'border border-gray-200 hover:border-gray-300 hover:bg-gray-50/80 bg-white'
  }`

  const inner = (
    <>
      <span
        className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          accent ? 'bg-accent-500 text-white' : 'bg-gray-100 text-gray-600'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] font-bold leading-tight ${accent ? 'text-accent-950' : 'text-gray-900'}`}>
          {title}
        </span>
        {subtitle && (
          <span className={`block text-[11px] leading-snug mt-0.5 ${accent ? 'text-accent-800/75' : 'text-gray-500'}`}>
            {subtitle}
          </span>
        )}
      </span>
    </>
  )

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  )
}

function IdlePanel({
  companySlug,
  navigate,
}: {
  companySlug: string
  navigate: (mode: MapMode) => void
}) {
  const today = todayStr()
  const tomorrow = addDaysStr(today, 1)
  const backToMap = `/${companySlug}/map`

  return (
    <PanelShell>
      <div className="px-0.5">
        <h2 className="text-sm font-bold text-gray-900 leading-tight">Plan on the map</h2>
        <p className="text-[11px] text-gray-500 mt-1 leading-snug">
          Search a client or address above — or jump in with one of these.
        </p>
      </div>

      <div className="space-y-1.5">
        <IdleAction
          accent
          icon={<PlusCircleIcon className="w-4 h-4" strokeWidth={2} />}
          title="Create new round"
          subtitle="Build an ordered route from scratch — place it on a day later"
          onClick={() => navigate({ kind: 'round', roundId: null, returnTo: backToMap })}
        />
        <IdleAction
          icon={<CalendarDaysIcon className="w-4 h-4" strokeWidth={2} />}
          title="Today's routes"
          subtitle="Open today's day planner for every employee"
          onClick={() => navigate({ kind: 'day', date: today, returnTo: backToMap })}
        />
        <IdleAction
          icon={<SparklesIcon className="w-4 h-4" strokeWidth={2} />}
          title="Tomorrow"
          subtitle="Start planning the next working day"
          onClick={() => navigate({ kind: 'day', date: tomorrow, returnTo: backToMap })}
        />
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 px-0.5">
          Browse
        </p>
        <div className="space-y-1.5">
          <IdleAction
            icon={<ArrowPathIcon className="w-4 h-4" strokeWidth={2} />}
            title="Recurring rounds"
            subtitle="Drafts and weekly route packages"
            href={`/${companySlug}/recurring/rounds`}
          />
          <IdleAction
            icon={<BriefcaseIcon className="w-4 h-4" strokeWidth={2} />}
            title="Jobs week"
            subtitle="Week board — move jobs, then plan a route"
            href={`/${companySlug}/jobs`}
          />
          <IdleAction
            icon={<ClipboardDocumentListIcon className="w-4 h-4" strokeWidth={2} />}
            title="Subscriptions"
            subtitle="Standing visits on a schedule"
            href={`/${companySlug}/recurring/subscriptions`}
          />
        </div>
      </div>

      <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <MagnifyingGlassIcon className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-gray-500 leading-snug">
            Tip: pick a day in the calendar to open that day&apos;s routes, or search to drop a client or prospect on the map.
          </p>
        </div>
      </div>
    </PanelShell>
  )
}

// ── Main switch ─────────────────────────────────────────────────────────────

export default function MapSidebar({
  mode,
  users,
  companySlug,
  navigate,
  onHoverJob,
  onPreviewRouteDay,
  onSetPreviewRouteDays,
  previewKeys,
  previewRoutesByKey = {},
  previewLoading = false,
  onClientLoaded,
  onNearestClientsLoaded,
  linkedClient,
  onNavigateToClient,
  onJobsChanged,
  exploreClientId = null,
  exploreLayer = 'dashboard',
  onExploreLayerChange,
  onCloseExploreClient,
  exploreLocation = null,
  onCloseExploreLocation,
  onPlanNewRoundForClient,
  scheduleDate = null,
  scheduleUserId = null,
  parkedRoutes = [],
  onSaveAllParked,
  savingAllParked = false,
}: {
  mode: MapMode
  users: MapUser[]
  companySlug: string
  navigate: (mode: MapMode, opts?: { replace?: boolean }) => void
  onHoverJob: (id: number | string | null) => void
  /** Toggle a route-day on/off the map preview (multi-select). */
  onPreviewRouteDay: (row: { date: string; user_id: number }) => void
  /** Replace the whole preview set (calendar day/span in client view). */
  onSetPreviewRouteDays?: (rows: { date: string; user_id: number }[]) => void
  previewKeys: RouteDayKey[]
  /** Preview routes keyed by `${date}:${userId}` for expandable stop lists. */
  previewRoutesByKey?: Record<string, UserRoute>
  previewLoading?: boolean
  onClientLoaded: (client: MapClient | null) => void
  onNearestClientsLoaded: (payload: { clients: NearestClientRow[]; radiusKm: number } | null) => void
  /** In location mode launched from a client card. */
  linkedClient?: MapClient | null
  /** Called just before navigating to a client from a list row (not a backdrop pin click). */
  onNavigateToClient?: () => void
  /** Bust caches + rebuild the map preview after scheduling a job. */
  onJobsChanged?: () => void
  /** Selected client stacked on top of the idle/main sidebar. */
  exploreClientId?: number | null
  exploreLayer?: ClientExploreLayer
  onExploreLayerChange?: (layer: ClientExploreLayer) => void
  onCloseExploreClient?: () => void
  /** Searched location stacked on top of the idle/main sidebar. */
  exploreLocation?: MapOverlayLocation | null
  onCloseExploreLocation?: () => void
  onPlanNewRoundForClient?: (stop: {
    clientId?: number | null
    label: string
    address?: string
    zip_code?: string
    city?: string
    lat?: number | null
    lng?: number | null
  }) => void
  scheduleDate?: string | null
  scheduleUserId?: number | null
  parkedRoutes?: ParkedRouteMeta[]
  onSaveAllParked?: () => void | Promise<void>
  savingAllParked?: boolean
}) {
  const selectedDate =
    mode.kind === 'day' || mode.kind === 'route' ? mode.date
    : mode.kind === 'location' ? (mode.date ?? null)
    : null
  const [markedDays, setMarkedDays] = useState<CalendarDayMark[]>([])
  const [locationMarkedDays, setLocationMarkedDays] = useState<CalendarDayMark[]>([])
  const [exploreLocDate, setExploreLocDate] = useState<string | null>(null)
  const [exploreLocUserId, setExploreLocUserId] = useState<number | null>(null)

  useEffect(() => {
    setExploreLocDate(null)
    setExploreLocUserId(null)
    setLocationMarkedDays([])
  }, [exploreLocation?.key])

  const employeeWeekRange = useMemo((): CalendarRange | null => {
    if (mode.kind !== 'employee') return null
    return weekRangeContaining(mode.from)
  }, [mode.kind, mode.kind === 'employee' ? mode.from : null]) // eslint-disable-line react-hooks/exhaustive-deps

  // Calendar span lives in the URL (?spanFrom=&spanTo=) — single source of truth.
  // Memoize by date strings so the object identity is stable across parent re-renders
  // (a fresh `{from,to}` every render was looping the preview useEffect).
  const clientSpanFrom = mode.kind === 'client' ? mode.spanFrom : undefined
  const clientSpanTo = mode.kind === 'client' ? mode.spanTo : undefined
  const clientRange = useMemo(() => {
    if (mode.kind !== 'client') return null
    return clientDateRange(mode)
  }, [mode.kind, clientSpanFrom, clientSpanTo]) // eslint-disable-line react-hooks/exhaustive-deps -- primitives only
  const clientId = mode.kind === 'client' ? mode.clientId : null

  const setClientRange = useCallback((next: CalendarRange | null) => {
    if (clientId == null) return
    if (!next) {
      navigate({ kind: 'client', clientId }, { replace: true })
      return
    }
    navigate({
      kind: 'client',
      clientId,
      spanFrom: next.from,
      spanTo: next.to,
    }, { replace: true })
  }, [clientId, navigate])

  const setLocationDate = useCallback((date: string | null) => {
    if (mode.kind !== 'location') return
    // Calendar day only — no userId → ProspectPanel picks the closest route that day.
    navigate({
      ...locationBase(mode),
      ...(date ? { date } : {}),
    }, { replace: true })
  }, [mode, navigate])

  const setLocationRouteDay = useCallback((next: { date: string; userId?: number } | null) => {
    if (mode.kind !== 'location') return
    if (!next) {
      navigate(locationBase(mode), { replace: true })
      return
    }
    navigate({
      ...locationBase(mode),
      date: next.date,
      ...(next.userId != null ? { userId: next.userId } : {}),
    }, { replace: true })
  }, [mode, navigate])

  useEffect(() => {
    if (mode.kind !== 'client') setMarkedDays([])
    if (mode.kind !== 'location') setLocationMarkedDays([])
  }, [mode.kind])

  // day/route are the planner — the map page renders MapPlannerPanel for those.
  // Client explore sits on top of the main sidebar (idle/employee/…) without
  // changing the URL — Back returns here, not a hard reset of the map tool.
  if (exploreClientId != null && onCloseExploreClient && onExploreLayerChange) {
    return (
      <div className="flex flex-col gap-3">
        <MapMonthCalendar
          selectedDate={selectedDate}
          selectionMode="navigate"
          onSelectDate={(date) => navigate(withReturnTo({ kind: 'day', date }, { kind: 'idle' }))}
        />
        <ClientExplorePanel
          clientId={exploreClientId}
          companySlug={companySlug}
          layer={exploreLayer}
          onLayerChange={onExploreLayerChange}
          onBackToMap={() => {
            onSetPreviewRouteDays?.([])
            onCloseExploreClient()
          }}
          navigate={navigate}
          previewKeys={previewKeys}
          previewRoutesByKey={previewRoutesByKey}
          previewLoading={previewLoading}
          onSetPreviewRouteDays={onSetPreviewRouteDays}
          onHoverJob={onHoverJob}
          onJobsChanged={onJobsChanged}
          onPlanNewRound={onPlanNewRoundForClient}
          scheduleDate={scheduleDate}
          scheduleUserId={scheduleUserId}
        />
      </div>
    )
  }

  // Searched location — same left-rail treatment as clients, without "See routes".
  if (exploreLocation != null && onCloseExploreLocation) {
    return (
      <div className="flex flex-col gap-3">
        <MapMonthCalendar
          selectedDate={exploreLocDate}
          markedDays={locationMarkedDays}
          selectionMode="navigate"
          resetViewKey={exploreLocation.key}
          onSelectDate={(date) => {
            setExploreLocDate(date)
            setExploreLocUserId(null)
          }}
        />
        <ProspectPanel
          lat={exploreLocation.lat}
          lng={exploreLocation.lng}
          label={exploreLocation.label}
          address={exploreLocation.address}
          zip_code={exploreLocation.zip_code}
          city={exploreLocation.city}
          selectedDate={exploreLocDate}
          selectedUserId={exploreLocUserId}
          onSelectRouteDay={(next) => {
            if (!next) {
              setExploreLocDate(null)
              setExploreLocUserId(null)
              return
            }
            setExploreLocDate(next.date)
            setExploreLocUserId(next.userId ?? null)
          }}
          linkedClient={linkedClient}
          previewKeys={previewKeys}
          previewRoutesByKey={previewRoutesByKey}
          previewLoading={previewLoading}
          onSetPreviewRouteDays={onSetPreviewRouteDays || (() => {})}
          onNearestClientsLoaded={onNearestClientsLoaded}
          onMarkedDays={setLocationMarkedDays}
          onHoverJob={onHoverJob}
          onJobsChanged={onJobsChanged}
          onBackToMap={() => {
            onSetPreviewRouteDays?.([])
            onCloseExploreLocation()
          }}
          onOpenPlanner={row => {
            navigate(withReturnTo(
              { kind: 'route', date: String(row.date).slice(0, 10), userId: Number(row.user_id) },
              { kind: 'idle' },
            ))
          }}
        />
      </div>
    )
  }

  let body: ReactNode
  switch (mode.kind) {
    case 'employee':
      body = (
        <EmployeeExplorePanel
          userId={mode.userId}
          from={mode.from}
          to={mode.to}
          users={users}
          navigate={navigate}
          previewKeys={previewKeys}
          onSetPreviewRouteDays={onSetPreviewRouteDays}
          parkedRoutes={parkedRoutes}
          onSaveAllParked={onSaveAllParked}
          savingAll={savingAllParked}
          initialLayer={mode.layer === 'routes' ? 'routes' : 'dashboard'}
        />
      )
      break
    case 'client':
      body = (
        <ClientContextPanel
          clientId={mode.clientId}
          companySlug={companySlug}
          navigate={navigate}
          previewKeys={previewKeys}
          previewRoutesByKey={previewRoutesByKey}
          previewLoading={previewLoading}
          onClientLoaded={onClientLoaded}
          onMarkedDays={setMarkedDays}
          dateRange={clientRange}
          onSetPreviewRouteDays={onSetPreviewRouteDays}
          onHoverJob={onHoverJob}
          onJobsChanged={onJobsChanged}
        />
      )
      break
    case 'location':
      body = (
        <ProspectPanel
          lat={mode.lat}
          lng={mode.lng}
          label={mode.label}
          address={mode.address}
          zip_code={mode.zip_code}
          city={mode.city}
          selectedDate={mode.date ?? null}
          selectedUserId={mode.userId ?? null}
          onSelectRouteDay={setLocationRouteDay}
          linkedClient={linkedClient}
          previewKeys={previewKeys}
          previewRoutesByKey={previewRoutesByKey}
          previewLoading={previewLoading}
          onSetPreviewRouteDays={onSetPreviewRouteDays || (() => {})}
          onNearestClientsLoaded={onNearestClientsLoaded}
          onMarkedDays={setLocationMarkedDays}
          onHoverJob={onHoverJob}
          onJobsChanged={onJobsChanged}
          onOpenPlanner={row => {
            if (mode.kind !== 'location') return
            navigate(withReturnTo(
              { kind: 'route', date: String(row.date).slice(0, 10), userId: Number(row.user_id) },
              mode,
            ))
          }}
        />
      )
      break
    default:
      body = <IdlePanel companySlug={companySlug} navigate={navigate} />
  }

  return (
    <div className="flex flex-col gap-3">
      <MapMonthCalendar
        selectedDate={selectedDate}
        markedDays={
          mode.kind === 'client' ? markedDays
          : mode.kind === 'location' ? locationMarkedDays
          : undefined
        }
        selectionMode={mode.kind === 'client' ? 'range' : 'navigate'}
        range={clientRange}
        onRangeChange={setClientRange}
        highlightRange={mode.kind === 'employee' ? employeeWeekRange : null}
        resetViewKey={
          mode.kind === 'client' ? mode.clientId
          : mode.kind === 'location' ? `loc:${mode.lat.toFixed(4)},${mode.lng.toFixed(4)}`
          : mode.kind === 'employee' ? `emp:${mode.userId}:${mode.from}`
          : mode.kind
        }
        onSelectDate={date => {
          if (mode.kind === 'location') {
            setLocationDate(date)
            return
          }
          if (mode.kind === 'employee') {
            onSetPreviewRouteDays?.([{ date, user_id: mode.userId }])
            return
          }
          navigate({ kind: 'day', date })
        }}
      />
      {body}
    </div>
  )
}
