'use client'

/**
 * Employee context for the map left sidebar — dashboard + routes, with an
 * edit scope that parks unsaved day routes until Save all / leave.
 *
 *   Map
 *     → Employee dashboard (stats + actions)
 *         → See routes (compact week list)
 *         → Create route (blank playground round)
 *         → Open a day route (edit freely, back keeps drafts)
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MapIcon,
  PlusCircleIcon,
} from '@heroicons/react/24/outline'
import { colorForUserId, initialsFromName } from '@/app/components/RouteMap'
import {
  addDaysStr,
  mondayOfWeek,
  todayStr,
  weekRangeContaining,
  withReturnTo,
  type MapMode,
} from './mapMode'
import { fmtDate, fmtMinutes, type RouteDayKey } from './NearestRoutesList'
import {
  fetchDayCapacityMinutes,
  fetchEmployeeDays,
  type EmployeeDayRow,
  type MapUser,
} from './useMapData'

export type EmployeeExploreLayer = 'dashboard' | 'routes'

export type ParkedRouteMeta = {
  date: string
  userId: number
  workMinutes: number
  driveMinutes: number
  stopCount: number
}

function weekDates(weekFrom: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysStr(weekFrom, i))
}

function fmtWeekdayShort(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })
}

function fmtDayNum(date: string) {
  return new Date(`${date}T12:00:00`).getDate()
}

function fmtWeekHeading(from: string, to: string) {
  const a = new Date(`${from}T12:00:00`)
  const b = new Date(`${to}T12:00:00`)
  const sameMonth = a.getMonth() === b.getMonth()
  const left = a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const right = b.toLocaleDateString(undefined, sameMonth
    ? { day: 'numeric' }
    : { month: 'short', day: 'numeric' })
  return `${left} – ${right}`
}

function busyTone(ratio: number) {
  if (ratio >= 1.05) return { label: 'Over', chip: 'border-rose-200 bg-rose-50 text-rose-700', bar: 'bg-rose-500' }
  if (ratio >= 0.85) return { label: 'Full', chip: 'border-amber-200 bg-amber-50 text-amber-800', bar: 'bg-amber-500' }
  if (ratio >= 0.45) return { label: 'Busy', chip: 'border-sky-200 bg-sky-50 text-sky-800', bar: 'bg-sky-500' }
  return { label: 'Light', chip: 'border-emerald-200 bg-emerald-50 text-emerald-800', bar: 'bg-emerald-500' }
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
    >
      <ArrowLeftIcon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

function ActionRow({
  icon,
  title,
  subtitle,
  onClick,
  badge,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  onClick?: () => void
  badge?: string | null
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80 transition-colors"
    >
      <span className="mt-0.5 w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center flex-shrink-0">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="block text-[13px] font-bold leading-tight text-gray-900">{title}</span>
          {badge ? (
            <span className="text-[9px] font-bold uppercase tracking-wide text-amber-800 bg-amber-100 rounded-full px-1.5 py-0.5">
              {badge}
            </span>
          ) : null}
        </span>
        {subtitle && (
          <span className="block text-[11px] leading-snug mt-0.5 text-gray-500">{subtitle}</span>
        )}
      </span>
    </button>
  )
}

function PanelShell({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>
}

export default function EmployeeExplorePanel({
  userId,
  from,
  to,
  users,
  navigate,
  previewKeys = [],
  onSetPreviewRouteDays,
  parkedRoutes = [],
  onSaveAllParked,
  savingAll = false,
  initialLayer = 'dashboard',
}: {
  userId: number
  from: string
  to: string
  users: MapUser[]
  navigate: (mode: MapMode, opts?: { replace?: boolean }) => void
  previewKeys?: RouteDayKey[]
  onSetPreviewRouteDays?: (rows: { date: string; user_id: number }[]) => void
  /** Unsaved day routes parked in the employee edit scope. */
  parkedRoutes?: ParkedRouteMeta[]
  onSaveAllParked?: () => void | Promise<void>
  savingAll?: boolean
  initialLayer?: EmployeeExploreLayer
}) {
  const user = users.find(u => u.id === userId)
  const weekFrom = mondayOfWeek(from)
  const weekTo = addDaysStr(weekFrom, 6)
  const dates = useMemo(() => weekDates(weekFrom), [weekFrom])
  const today = todayStr()
  const color = colorForUserId(userId)
  const name = user ? `${user.first_name} ${user.last_name}` : `User ${userId}`
  const initials = initialsFromName(name)

  const [layer, setLayer] = useState<EmployeeExploreLayer>(initialLayer)
  const [daysByDate, setDaysByDate] = useState<Record<string, EmployeeDayRow>>({})
  const [capacityByDate, setCapacityByDate] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLayer(initialLayer)
  }, [initialLayer, userId])

  useEffect(() => {
    if (from !== weekFrom || to !== weekTo) {
      navigate({
        kind: 'employee',
        userId,
        from: weekFrom,
        to: weekTo,
        ...(initialLayer === 'routes' ? { layer: 'routes' as const } : {}),
      }, { replace: true })
    }
  }, [from, to, weekFrom, weekTo, userId, navigate, initialLayer])

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

  const employeeReturn: MapMode = {
    kind: 'employee',
    userId,
    from: weekFrom,
    to: weekTo,
    layer: 'routes',
  }

  const openDay = (date: string) => {
    navigate(withReturnTo(
      { kind: 'route', date, userId },
      employeeReturn,
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

  const createRoute = () => {
    navigate(withReturnTo(
      { kind: 'round', roundId: null },
      employeeReturn,
    ))
  }

  const shiftWeek = (delta: number) => {
    const nextFrom = addDaysStr(weekFrom, delta * 7)
    navigate({
      kind: 'employee',
      userId,
      from: nextFrom,
      to: addDaysStr(nextFrom, 6),
      ...(layer === 'routes' ? { layer: 'routes' as const } : {}),
    })
  }

  const parkedForUser = useMemo(
    () => parkedRoutes.filter(p => p.userId === userId),
    [parkedRoutes, userId],
  )
  const parkedByDate = useMemo(() => {
    const m: Record<string, ParkedRouteMeta> = {}
    for (const p of parkedForUser) m[p.date] = p
    return m
  }, [parkedForUser])

  const weekRows = dates.map(date => {
    const parked = parkedByDate[date]
    const row = daysByDate[date]
    const used = parked
      ? parked.workMinutes + parked.driveMinutes
      : row
        ? Number(row.job_minutes || 0) + Number(row.drive_minutes || 0)
        : 0
    const capacity = capacityByDate[date] || 480
    const ratio = used / Math.max(1, capacity)
    const stopCount = parked ? parked.stopCount : (row?.stop_count || 0)
    return {
      date,
      row,
      parked,
      used,
      capacity,
      ratio,
      tone: busyTone(ratio),
      stopCount,
      workMinutes: parked ? parked.workMinutes : Number(row?.job_minutes || 0),
      driveMinutes: parked ? parked.driveMinutes : Number(row?.drive_minutes || 0),
    }
  })

  const weekUsed = weekRows.reduce((s, r) => s + r.used, 0)
  const weekCap = weekRows.reduce((s, r) => s + r.capacity, 0)
  const weekRatio = weekUsed / Math.max(1, weekCap)
  const weekTone = busyTone(weekRatio)
  const weekJobs = weekRows.reduce((s, r) => s + r.stopCount, 0)
  const unsavedCount = parkedForUser.length

  const layerIndex = layer === 'dashboard' ? 0 : 1

  return (
    <PanelShell>
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ width: '200%', transform: `translateX(-${layerIndex * 50}%)` }}
        >
          {/* ── Dashboard ─────────────────────────────────────────── */}
          <div className="w-1/2 flex-shrink-0 pr-1 space-y-3">
            <BackButton
              onClick={() => navigate({ kind: 'idle' })}
              label="Map"
            />

            <div className="rounded-2xl bg-white border border-gray-200/80 p-3.5 shadow-sm shadow-black/[0.02]">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-sm font-bold shadow-sm ring-2 ring-white"
                  style={{ background: color }}
                >
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[16px] font-bold text-gray-900 truncate leading-tight">{name}</h2>
                  <p className="text-[11px] text-gray-500 mt-0.5">Employee · routes & capacity</p>
                </div>
                <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${weekTone.chip}`}>
                  {weekTone.label}
                </span>
              </div>

              <div className="mt-3.5 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-gray-50 border border-gray-100 px-2.5 py-2 text-center">
                  <div className="text-[15px] font-bold tabular-nums text-gray-900">{weekJobs}</div>
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mt-0.5">Stops</div>
                </div>
                <div className="rounded-xl bg-gray-50 border border-gray-100 px-2.5 py-2 text-center">
                  <div className="text-[15px] font-bold tabular-nums text-gray-900">{fmtMinutes(weekUsed)}</div>
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mt-0.5">Load</div>
                </div>
                <div className="rounded-xl bg-gray-50 border border-gray-100 px-2.5 py-2 text-center">
                  <div className="text-[15px] font-bold tabular-nums text-gray-900">{unsavedCount}</div>
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mt-0.5">Unsaved</div>
                </div>
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

            {unsavedCount > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5">
                <p className="text-[12px] font-semibold text-amber-950">
                  {unsavedCount} unsaved route{unsavedCount === 1 ? '' : 's'}
                </p>
                <p className="text-[11px] text-amber-900/80 mt-0.5 leading-snug">
                  Edits stay parked here until you save. Leaving this employee will ask you to save first.
                </p>
                <button
                  type="button"
                  disabled={savingAll || !onSaveAllParked}
                  onClick={() => void onSaveAllParked?.()}
                  className="mt-2 w-full rounded-lg bg-[#193434] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#244444] disabled:opacity-50"
                >
                  {savingAll ? 'Saving…' : `Save all (${unsavedCount})`}
                </button>
              </div>
            )}

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 px-0.5">
                Actions
              </p>
              <div className="space-y-1.5">
                <ActionRow
                  icon={<CalendarDaysIcon className="w-4 h-4" strokeWidth={2} />}
                  title="See routes"
                  subtitle="This week’s days — preview or open to edit"
                  badge={unsavedCount > 0 ? `${unsavedCount} unsaved` : null}
                  onClick={() => {
                    setLayer('routes')
                    navigate({
                      kind: 'employee',
                      userId,
                      from: weekFrom,
                      to: weekTo,
                      layer: 'routes',
                    }, { replace: true })
                  }}
                />
                <ActionRow
                  icon={<PlusCircleIcon className="w-4 h-4" strokeWidth={2} />}
                  title="Create route"
                  subtitle="Blank round — not scheduled until you place it"
                  onClick={createRoute}
                />
                <ActionRow
                  icon={<MapIcon className="w-4 h-4" strokeWidth={2} />}
                  title="Open today"
                  subtitle={fmtDate(today)}
                  onClick={() => openDay(today)}
                />
              </div>
            </div>
          </div>

          {/* ── See routes ────────────────────────────────────────── */}
          <div className="w-1/2 flex-shrink-0 pl-1 space-y-3">
            <BackButton
              onClick={() => {
                setLayer('dashboard')
                navigate({
                  kind: 'employee',
                  userId,
                  from: weekFrom,
                  to: weekTo,
                }, { replace: true })
              }}
              label="Employee"
            />

            <div className="px-0.5 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Routes</h2>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                  Tap to preview · Plan to edit. Unsaved edits stay until you save all.
                </p>
              </div>
              {unsavedCount > 0 && (
                <button
                  type="button"
                  disabled={savingAll || !onSaveAllParked}
                  onClick={() => void onSaveAllParked?.()}
                  className="flex-shrink-0 rounded-full bg-[#193434] px-2.5 py-1 text-[10px] font-bold text-white hover:bg-[#244444] disabled:opacity-50"
                >
                  {savingAll ? '…' : 'Save all'}
                </button>
              )}
            </div>

            <div className="rounded-2xl bg-white border border-gray-200/80 overflow-hidden shadow-sm shadow-black/[0.02]">
              <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 bg-gray-50/60">
                <button
                  type="button"
                  onClick={() => shiftWeek(-1)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-white hover:text-gray-800 hover:shadow-sm transition-all"
                  aria-label="Previous week"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0 text-center">
                  <div className="text-[11px] font-bold text-gray-800 tracking-tight">
                    {fmtWeekHeading(weekFrom, weekTo)}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const { from: mon, to: sun } = weekRangeContaining(today)
                      navigate({ kind: 'employee', userId, from: mon, to: sun })
                    }}
                    className="text-[9px] font-semibold text-accent-600 hover:text-accent-700"
                  >
                    This week
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => shiftWeek(1)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-white hover:text-gray-800 hover:shadow-sm transition-all"
                  aria-label="Next week"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="p-1.5 space-y-0.5">
                {loading && (
                  <div className="space-y-1 p-1">
                    {[0, 1, 2, 3, 4].map(i => (
                      <div key={i} className="h-11 rounded-lg bg-gray-100 animate-pulse" />
                    ))}
                  </div>
                )}
                {!loading && weekRows.map(({
                  date, row, parked, used, capacity, ratio, tone, stopCount, workMinutes, driveMinutes,
                }) => {
                  const isToday = date === today
                  const isPast = date < today
                  const hasWork = stopCount > 0
                  const previewKey = `${date}:${userId}`
                  const isPreview = previewKeys.includes(previewKey)
                  return (
                    <div
                      key={date}
                      className={[
                        'w-full rounded-lg border px-2.5 py-2 text-left transition-all',
                        parked
                          ? 'border-amber-300 bg-amber-50/70'
                          : isPreview
                            ? 'border-accent-500 bg-accent-500/[0.08]'
                            : isToday
                              ? 'border-primary-500/25 bg-primary-500/[0.04]'
                              : hasWork
                                ? 'border-gray-200 bg-white hover:border-gray-300'
                                : 'border-transparent hover:bg-gray-50',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => previewOrOpenDay(date, hasWork)}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        >
                          <div className="w-9 flex-shrink-0">
                            <div className={`text-[9px] font-bold uppercase tracking-wide ${isToday ? 'text-primary-600' : 'text-gray-400'}`}>
                              {fmtWeekdayShort(date)}
                            </div>
                            <div className={`text-[13px] font-bold tabular-nums leading-none ${isPast && !hasWork ? 'text-gray-400' : 'text-gray-900'}`}>
                              {fmtDayNum(date)}
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            {hasWork ? (
                              <>
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-[12px] font-semibold text-gray-800 truncate">
                                    {stopCount} stop{stopCount === 1 ? '' : 's'}
                                  </span>
                                  {parked && (
                                    <span className="text-[8px] font-bold uppercase tracking-wide text-amber-800 bg-amber-200/80 rounded px-1 py-0.5">
                                      Unsaved
                                    </span>
                                  )}
                                  {!parked && row?.has_saved_route && (
                                    <span className="text-[8px] font-bold text-accent-700 bg-accent-500/10 rounded px-1 py-0.5">
                                      Planned
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                  <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${tone.bar}`}
                                      style={{ width: `${Math.min(100, ratio * 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-[9px] font-medium text-gray-400 tabular-nums">
                                    {fmtMinutes(workMinutes)}w · {fmtMinutes(driveMinutes)}d
                                  </span>
                                </div>
                              </>
                            ) : (
                              <span className={`text-[12px] font-medium ${isPast ? 'text-gray-400' : 'text-gray-500'}`}>
                                {isPast ? 'No route' : 'Empty — open to add'}
                              </span>
                            )}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => openDay(date)}
                          className={`flex-shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold transition-colors ${
                            parked
                              ? 'bg-amber-600 text-white hover:bg-amber-700'
                              : isPreview
                                ? 'bg-accent-500 text-white hover:bg-accent-600'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {parked ? 'Edit' : hasWork ? 'Plan' : 'Open'}
                        </button>
                      </div>
                      {hasWork && (
                        <div className="mt-1 pl-11 text-[9px] text-gray-400 tabular-nums">
                          {fmtMinutes(used)} / {fmtMinutes(capacity)} · {Math.round(ratio * 100)}% {tone.label.toLowerCase()}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PanelShell>
  )
}
