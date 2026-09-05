'use client'

/**
 * Interactive month calendar for a library round:
 * placed / modified packages, place / move / cancel.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '@/app/utils/api'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

type PreviewStop = {
  id: number | string
  order: number
  title: string
  duration_minutes: number | null
  kind: 'round' | 'extra'
  lat?: number | null
  lng?: number | null
}

export type CalendarDay = {
  date: string
  state: 'expected' | 'placed' | 'modified'
  is_expected: boolean
  is_placed: boolean
  is_modified: boolean
  daily_route_id: number | null
  assigned_user_id: number | null
  assigned_first_name?: string | null
  assigned_last_name?: string | null
  name: string | null
  round_job_count: number
  extra_job_count: number
  missing_round_count: number
  preview: PreviewStop[]
  extras?: Array<{ id: number; title: string }>
  round_jobs?: Array<{ id: number; title: string }>
}

type Emp = { id: number; first_name: string; last_name: string }

function empLabel(u: Pick<Emp, 'first_name' | 'last_name'> | null | undefined) {
  if (!u) return ''
  return [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
}

function dayEmpLabel(day: CalendarDay) {
  const fromNames = [day.assigned_first_name, day.assigned_last_name].filter(Boolean).join(' ').trim()
  return fromNames || (day.assigned_user_id != null ? `Employee #${day.assigned_user_id}` : 'Another employee')
}


type ActionMode =
  | { type: 'place'; date: string }
  | { type: 'move'; from: string; day: CalendarDay }
  | { type: 'cancel'; day: CalendarDay }
  | null

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function ymdFromParts(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Monday-first grid including leading/trailing days from adjacent months. */
function buildGrid(year: number, monthIndex: number) {
  const first = new Date(year, monthIndex, 1)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const startPad = (first.getDay() + 6) % 7 // Mon-first

  const prevMonth = monthIndex === 0 ? 11 : monthIndex - 1
  const prevYear = monthIndex === 0 ? year - 1 : year
  const daysInPrev = new Date(prevYear, prevMonth + 1, 0).getDate()

  const nextMonth = monthIndex === 11 ? 0 : monthIndex + 1
  const nextYear = monthIndex === 11 ? year + 1 : year

  const cells: Array<{ ymd: string; dayNum: number; inMonth: boolean }> = []

  for (let i = startPad - 1; i >= 0; i--) {
    const d = daysInPrev - i
    cells.push({
      ymd: ymdFromParts(prevYear, prevMonth, d),
      dayNum: d,
      inMonth: false,
    })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      ymd: ymdFromParts(year, monthIndex, d),
      dayNum: d,
      inMonth: true,
    })
  }

  let nextDay = 1
  while (cells.length % 7 !== 0) {
    cells.push({
      ymd: ymdFromParts(nextYear, nextMonth, nextDay),
      dayNum: nextDay,
      inMonth: false,
    })
    nextDay += 1
  }

  // Prefer a full 6-week grid so months feel consistent.
  while (cells.length < 42) {
    cells.push({
      ymd: ymdFromParts(nextYear, nextMonth, nextDay),
      dayNum: nextDay,
      inMonth: false,
    })
    nextDay += 1
  }

  return cells
}

function gridDateRange(year: number, monthIndex: number) {
  const cells = buildGrid(year, monthIndex)
  return { from: cells[0].ymd, to: cells[cells.length - 1].ymd }
}

function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function RoundOccurrenceCalendar({
  roundId,
  assignedUserId,
  hasStops,
  schedule,
  onPlaced,
  onOpenPlacedDay,
  manageDay,
  onManageDayHandled,
}: {
  roundId: number
  assignedUserId: number | null
  hasStops: boolean
  schedule?: {
    schedule_kind: 'manual' | 'recurring' | null
    recurrence_type: 'weekly' | 'monthly' | null
    day_of_week: number | null
    day_of_month: number | null
    interval_value: number | null
    starting_date: string | null
  }
  onPlaced?: () => void
  /** When a day already has this round — open the day route (sidebar) instead of place/cancel. */
  onOpenPlacedDay?: (day: CalendarDay) => void
  /** Parent asks calendar to open move/cancel sheet for this day. */
  manageDay?: CalendarDay | null
  onManageDayHandled?: () => void
}) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [days, setDays] = useState<CalendarDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<{ date: string; x: number; y: number } | null>(null)
  const [action, setAction] = useState<ActionMode>(null)
  const [moveTo, setMoveTo] = useState('')
  const [scope, setScope] = useState<'round_only' | 'all'>('round_only')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pickMoveTarget, setPickMoveTarget] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [users, setUsers] = useState<Emp[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(
    assignedUserId != null && assignedUserId > 0 ? assignedUserId : null,
  )

  useEffect(() => {
    if (assignedUserId != null && assignedUserId > 0) {
      setSelectedUserId(assignedUserId)
    }
  }, [assignedUserId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(apiUrl('/users'), { headers: authHeaders() })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok) {
          setUsers(Array.isArray(data.users) ? data.users : [])
        }
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [])

  const selectedUser = useMemo(
    () => (selectedUserId != null ? users.find(u => u.id === selectedUserId) ?? null : null),
    [users, selectedUserId],
  )

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarDay>()
    for (const d of days) m.set(d.date, d)
    return m
  }, [days])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { from, to } = gridDateRange(year, month)
      const res = await fetch(
        apiUrl(`/rounds/${roundId}/calendar?from=${from}&to=${to}`),
        { headers: authHeaders() },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not load calendar')
      setDays(Array.isArray(data.days) ? data.days : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load calendar')
    } finally {
      setLoading(false)
    }
  }, [roundId, year, month])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!manageDay?.is_placed) return
    setAction({ type: 'cancel', day: manageDay })
    setScope(manageDay.is_modified ? 'round_only' : 'all')
    setMoveTo('')
    setActionError(null)
    onManageDayHandled?.()
  }, [manageDay]) // eslint-disable-line react-hooks/exhaustive-deps

  const grid = useMemo(() => buildGrid(year, month), [year, month])
  const today = todayYmd()
  const canPlace = selectedUserId != null && selectedUserId > 0

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  const openDay = (ymd: string) => {
    if (pickMoveTarget && action?.type === 'move') {
      setMoveTo(ymd)
      setPickMoveTarget(false)
      return
    }
    const day = byDate.get(ymd)
    if (day?.is_placed) {
      const dayUser = day.assigned_user_id != null ? Number(day.assigned_user_id) : null
      // Other employee's placement — switch to them so green days match.
      if (dayUser != null && dayUser !== selectedUserId) {
        setSelectedUserId(dayUser)
      }
      if (onOpenPlacedDay) {
        onOpenPlacedDay(day)
        return
      }
      setAction({ type: 'cancel', day })
      setScope(day.is_modified ? 'round_only' : 'all')
      setMoveTo('')
      setActionError(null)
      return
    }
    if (ymd < today) {
      setActionError(null)
      return
    }
    if (!canPlace) {
      setAction({ type: 'place', date: ymd })
      setActionError('Choose an employee above before placing on the calendar.')
      return
    }
    setAction({ type: 'place', date: ymd })
    setActionError(null)
  }

  const runPlace = async (date: string) => {
    if (selectedUserId == null || selectedUserId <= 0) {
      setActionError('Choose an employee above before placing.')
      return
    }
    if (!hasStops) {
      setActionError('Add at least one stop first.')
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      const body: Record<string, unknown> = {
        assigned_user_id: selectedUserId,
        dates: [date],
      }
      if (schedule?.schedule_kind === 'recurring') {
        body.schedule_kind = 'recurring'
        body.recurrence_type = schedule.recurrence_type || 'weekly'
        body.day_of_week = schedule.day_of_week
        body.day_of_month = schedule.day_of_month
        body.interval_value = schedule.interval_value || 1
        body.starting_date = schedule.starting_date || date
      }
      const res = await fetch(apiUrl(`/rounds/${roundId}/place`), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not place round')
      setAction(null)
      await load()
      onPlaced?.()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not place')
    } finally {
      setBusy(false)
    }
  }

  const runCancel = async () => {
    if (action?.type !== 'cancel') return
    setBusy(true)
    setActionError(null)
    try {
      const res = await fetch(apiUrl(`/rounds/${roundId}/calendar/cancel`), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ date: action.day.date, scope }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not cancel')
      setAction(null)
      await load()
      onPlaced?.()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not cancel')
    } finally {
      setBusy(false)
    }
  }

  const runMove = async () => {
    if (!action || (action.type !== 'move' && action.type !== 'cancel')) return
    const from = action.type === 'move' ? action.from : action.day.date
    const day = action.day
    if (!moveTo || !/^\d{4}-\d{2}-\d{2}$/.test(moveTo)) {
      setActionError('Pick a target day on the calendar.')
      setPickMoveTarget(true)
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      const res = await fetch(apiUrl(`/rounds/${roundId}/calendar/move`), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          from_date: from,
          to_date: moveTo,
          scope: day.is_modified ? scope : 'all',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not move')
      setAction(null)
      setPickMoveTarget(false)
      setMoveTo('')
      await load()
      onPlaced?.()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not move')
    } finally {
      setBusy(false)
    }
  }

  const hoverDay = hover ? byDate.get(hover.date) : null

  return (
    <div className="rounded-[24px] border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 sm:px-5 py-4 border-b border-gray-100 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-gray-900">On the calendar</h2>
            <p className="text-[12px] text-gray-400 mt-0.5 truncate">
              {pickMoveTarget
                ? 'Click a day to move onto'
                : canPlace
                  ? 'Green = this employee’s placements · tap to open · empty day to place'
                  : 'Choose an employee to place and manage days'}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="h-8 w-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
              aria-label="Previous month"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <p className="text-[13px] font-semibold text-gray-800 w-[7.5rem] text-center tabular-nums">
              {MONTHS[month].slice(0, 3)} {year}
            </p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="h-8 w-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
              aria-label="Next month"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400 sm:w-[5.5rem] flex-shrink-0">
            Employee
          </label>
          <select
            value={selectedUserId ?? ''}
            onChange={e => {
              const v = e.target.value
              setSelectedUserId(v ? Number(v) : null)
              setActionError(null)
            }}
            className={[
              'w-full sm:flex-1 h-10 rounded-xl border bg-white px-3 text-[13px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#193434]/15',
              canPlace ? 'border-gray-200 text-gray-900' : 'border-amber-300 text-amber-900 bg-amber-50/40',
            ].join(' ')}
          >
            <option value="">Select employee…</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {empLabel(u) || `User #${u.id}`}
              </option>
            ))}
          </select>
        </div>
        {!canPlace && (
          <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            Pick who this round is for — then you can place days on the calendar.
          </p>
        )}
      </div>

      <div className="px-3 sm:px-4 pt-3 pb-2">
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wide text-gray-400 py-1">
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="h-[280px] rounded-2xl bg-gray-50 animate-pulse" />
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {grid.map(cell => {
              const day = byDate.get(cell.ymd)
              const isToday = cell.ymd === today
              const isMoveTarget = pickMoveTarget && moveTo === cell.ymd
              const placed = !!day?.is_placed
              const modified = !!day?.is_modified
              const outside = !cell.inMonth
              const dayUserId = day?.assigned_user_id != null ? Number(day.assigned_user_id) : null
              const forSelected =
                placed
                && canPlace
                && dayUserId != null
                && dayUserId === selectedUserId
              const forOther =
                placed
                && dayUserId != null
                && (!canPlace || dayUserId !== selectedUserId)

              return (
                <button
                  key={cell.ymd}
                  type="button"
                  title={forOther ? `Assigned to ${dayEmpLabel(day!)}` : undefined}
                  onClick={() => openDay(cell.ymd)}
                  onMouseEnter={(e) => {
                    if (!day?.is_placed) return
                    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                    if (hoverTimer.current) clearTimeout(hoverTimer.current)
                    hoverTimer.current = setTimeout(() => {
                      setHover({ date: cell.ymd, x: rect.left + rect.width / 2, y: rect.top })
                    }, 180)
                  }}
                  onMouseLeave={() => {
                    if (hoverTimer.current) clearTimeout(hoverTimer.current)
                    setHover(null)
                  }}
                  className={[
                    'relative aspect-square rounded-2xl flex flex-col items-center justify-center transition-all',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#193434]/25',
                    forOther
                      ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                      : modified && forSelected
                        ? 'bg-amber-400 text-amber-950 shadow-sm shadow-amber-500/25 hover:bg-amber-300'
                        : forSelected
                          ? 'bg-accent-500 text-white shadow-sm shadow-accent-500/30 hover:bg-accent-600'
                          : outside
                            ? 'text-gray-300 hover:bg-gray-50/80'
                            : canPlace
                              ? 'text-gray-700 hover:bg-gray-50'
                              : 'text-gray-400 hover:bg-gray-50',
                    isToday && !forSelected && !forOther
                      ? 'ring-2 ring-[#193434]/35 ring-offset-1'
                      : '',
                    isMoveTarget ? 'ring-2 ring-[#193434] ring-offset-1 scale-[1.03]' : '',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'text-[13px] font-semibold tabular-nums leading-none',
                      outside && !forSelected && !forOther ? 'text-gray-300' : '',
                    ].join(' ')}
                  >
                    {cell.dayNum}
                  </span>
                  {forSelected && !modified && (
                    <span className="mt-1 h-1 w-1 rounded-full bg-white/90" />
                  )}
                  {forSelected && modified && (
                    <span className="mt-1 h-1 w-1 rounded-full bg-amber-950/50" />
                  )}
                  {forOther && (
                    <span className="mt-1 h-1 w-1 rounded-full bg-gray-500/70" />
                  )}
                </button>
              )
            })}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3 px-1 pb-3 text-[10px] font-semibold text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-md bg-accent-500" /> This employee
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-md bg-amber-400" /> Modified
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-md bg-gray-200" /> Other employee
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-md bg-accent-50 ring-1 ring-inset ring-accent-300" /> Expected
          </span>
        </div>
      </div>

      {/* Hover preview */}
      {hover && hoverDay && (
        <div
          className="fixed z-[80] w-64 pointer-events-none"
          style={{
            left: Math.min(hover.x - 128, (typeof window !== 'undefined' ? window.innerWidth : 400) - 280),
            top: Math.max(12, hover.y - 8),
            transform: 'translateY(-100%)',
          }}
        >
          <div className="rounded-2xl border border-gray-200 bg-white shadow-xl shadow-gray-900/10 p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-[12px] font-semibold text-gray-900 truncate">
                {hoverDay.name || 'Round'}
              </p>
              {hoverDay.is_modified && (
                <span className="text-[9px] font-bold uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5">
                  Modified
                </span>
              )}
            </div>
            {hoverDay.is_placed && hoverDay.assigned_user_id != null && (
              <p className={[
                'text-[11px] font-medium mb-2',
                selectedUserId === Number(hoverDay.assigned_user_id) ? 'text-accent-800' : 'text-gray-600',
              ].join(' ')}>
                {selectedUserId === Number(hoverDay.assigned_user_id)
                  ? `For ${dayEmpLabel(hoverDay)}`
                  : `Assigned to ${dayEmpLabel(hoverDay)} — switch employee to manage`}
              </p>
            )}
            {hoverDay.is_placed && (hoverDay.preview || []).length > 0 ? (
              <ol className="space-y-1 max-h-40 overflow-hidden">
                {(hoverDay.preview || []).slice(0, 8).map(p => (
                  <li key={String(p.id)} className="flex items-center gap-2 text-[11px]">
                    <span className={[
                      'h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0',
                      p.kind === 'extra' ? 'bg-amber-100 text-amber-800' : 'bg-[#193434] text-white',
                    ].join(' ')}>
                      {p.order}
                    </span>
                    <span className={`truncate ${p.kind === 'extra' ? 'text-amber-900' : 'text-gray-700'}`}>
                      {p.title}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
            {hoverDay.extra_job_count > 0 && (
              <p className="mt-2 text-[10px] text-amber-700 font-medium">
                +{hoverDay.extra_job_count} other job{hoverDay.extra_job_count === 1 ? '' : 's'} on this day
              </p>
            )}
          </div>
        </div>
      )}

      {/* Move target picker banner (modal closes so calendar stays usable) */}
      {pickMoveTarget && action?.type === 'move' && (
        <div className="border-t border-accent-100 bg-accent-50 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-[12px] font-semibold text-accent-900">
            {moveTo ? `Move to ${moveTo}` : 'Click a day to move onto'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !moveTo}
              onClick={() => void runMove()}
              className="h-8 px-3 rounded-lg bg-[#193434] text-white text-[11px] font-semibold disabled:opacity-40"
            >
              {busy ? '…' : 'Confirm'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPickMoveTarget(false)
                setAction({ type: 'cancel', day: action.day })
                setMoveTo('')
              }}
              className="h-8 px-2 rounded-lg border border-accent-200 text-[11px] font-semibold text-accent-900"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Action sheet — hidden while picking a move target */}
      {action && !(pickMoveTarget && action.type === 'move') && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close"
            disabled={busy}
            onClick={() => { if (!busy) { setAction(null); setPickMoveTarget(false) } }}
          />
          <div className="relative w-full max-w-md rounded-3xl bg-white border border-gray-200 shadow-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                {action.type === 'place' && (
                  <>
                    <h3 className="text-[16px] font-semibold text-gray-950">Place round</h3>
                    <p className="text-[13px] text-gray-500 mt-1">
                      Create this round’s jobs on <span className="font-semibold text-gray-800">{action.date}</span>.
                    </p>
                  </>
                )}
                {(action.type === 'cancel' || action.type === 'move') && (
                  <>
                    <h3 className="text-[16px] font-semibold text-gray-950">
                      {action.type === 'move' ? 'Move round' : action.day.date}
                    </h3>
                    <p className="text-[13px] text-gray-500 mt-1">
                      {action.day.is_modified
                        ? 'This day mixes round stops with other jobs — choose carefully.'
                        : 'This day is a clean round package.'}
                    </p>
                  </>
                )}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => { setAction(null); setPickMoveTarget(false) }}
                className="h-8 w-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            {action.type === 'place' && (
              <div className="space-y-3">
                {actionError && <p className="text-[12px] text-red-600">{actionError}</p>}
                {!canPlace ? (
                  <p className="text-[13px] text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    Choose an employee in the dropdown above, then place again.
                  </p>
                ) : (
                  <p className="text-[12px] text-gray-500">
                    Places for <span className="font-semibold text-gray-800">{empLabel(selectedUser) || 'selected employee'}</span>.
                  </p>
                )}
                <button
                  type="button"
                  disabled={busy || !canPlace}
                  onClick={() => void runPlace(action.date)}
                  className="w-full h-11 rounded-2xl bg-accent-500 text-white text-sm font-semibold hover:bg-accent-600 disabled:opacity-50"
                >
                  {busy ? 'Placing…' : 'Place on this day'}
                </button>
              </div>
            )}

            {action.type === 'cancel' && (
              <div className="space-y-3">
                {action.day.is_modified && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">What to include</p>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        className="mt-1"
                        checked={scope === 'round_only'}
                        onChange={() => setScope('round_only')}
                      />
                      <span className="text-[13px] text-gray-800">
                        <span className="font-semibold">Only round stops</span>
                        <span className="block text-[12px] text-gray-500">
                          {action.day.round_job_count} job{(action.day.round_job_count === 1 ? '' : 's')}
                          {(action.day.round_jobs || []).slice(0, 3).map(j => ` · ${j.title}`).join('')}
                          {(action.day.round_jobs || []).length > 3 ? '…' : ''}
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        className="mt-1"
                        checked={scope === 'all'}
                        onChange={() => setScope('all')}
                      />
                      <span className="text-[13px] text-gray-800">
                        <span className="font-semibold">Entire day package</span>
                        <span className="block text-[12px] text-gray-500">
                          Includes {action.day.extra_job_count} other job{action.day.extra_job_count === 1 ? '' : 's'}
                          {(action.day.extras || []).slice(0, 2).map(j => ` · ${j.title}`).join('')}
                        </span>
                      </span>
                    </label>
                  </div>
                )}

                {pickMoveTarget && (
                  <p className="text-[12px] font-medium text-accent-800 bg-accent-50 border border-accent-100 rounded-xl px-3 py-2">
                    Click a day on the calendar{moveTo ? ` → ${moveTo}` : ''}
                  </p>
                )}
                {actionError && <p className="text-[12px] text-red-600">{actionError}</p>}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setAction({ type: 'move', from: action.day.date, day: action.day })
                      setPickMoveTarget(false)
                      setMoveTo('')
                      setActionError(null)
                    }}
                    className="h-11 rounded-2xl border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Move…
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runCancel()}
                    className="h-11 rounded-2xl border border-red-200 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    {busy ? 'Cancelling…' : 'Cancel round'}
                  </button>
                </div>
              </div>
            )}

            {action.type === 'move' && (
              <div className="space-y-3">
                {action.day.is_modified && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3 space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="radio" className="mt-1" checked={scope === 'round_only'} onChange={() => setScope('round_only')} />
                      <span className="text-[13px] font-semibold text-gray-800">Only round stops ({action.day.round_job_count})</span>
                    </label>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="radio" className="mt-1" checked={scope === 'all'} onChange={() => setScope('all')} />
                      <span className="text-[13px] font-semibold text-gray-800">Entire package (+{action.day.extra_job_count} others)</span>
                    </label>
                  </div>
                )}
                {actionError && <p className="text-[12px] text-red-600">{actionError}</p>}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setPickMoveTarget(true); setMoveTo(''); setActionError(null) }}
                  className="w-full h-11 rounded-2xl bg-[#193434] text-white text-sm font-semibold disabled:opacity-50"
                >
                  Pick day on calendar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
