'use client'

/**
 * Compact month calendar for the map multitool sidebar.
 *
 * Modes:
 *   navigate  — click a day → onSelectDate (day/route planner views)
 *   range     — client context: click + hover to pick a day span (can span months);
 *               committed selection is owned by the parent / URL.
 *
 * Marks: tiny status dots (green completed, red cancelled, grey scheduled).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { toLocalDateString, todayStr } from './mapMode'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

export type CalendarDayStatus = 'scheduled' | 'completed' | 'cancelled'

export type CalendarDayMark = {
  date: string
  status: CalendarDayStatus
}

export type CalendarRange = { from: string; to: string }

function monthLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

function fmtSpanDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function buildMonthCells(year: number, monthIndex: number) {
  const first = new Date(year, monthIndex, 1)
  const startPad = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const prevMonthDays = new Date(year, monthIndex, 0).getDate()

  const cells: { date: string; day: number; inMonth: boolean }[] = []

  for (let i = startPad - 1; i >= 0; i--) {
    const day = prevMonthDays - i
    cells.push({
      date: toLocalDateString(new Date(year, monthIndex - 1, day)),
      day,
      inMonth: false,
    })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      date: toLocalDateString(new Date(year, monthIndex, day)),
      day,
      inMonth: true,
    })
  }

  let next = 1
  while (cells.length % 7 !== 0) {
    cells.push({
      date: toLocalDateString(new Date(year, monthIndex + 1, next)),
      day: next,
      inMonth: false,
    })
    next += 1
  }

  return cells
}

function statusDotClass(status: CalendarDayStatus): string {
  if (status === 'completed') return 'bg-accent-500'
  if (status === 'cancelled') return 'bg-red-500'
  return 'bg-gray-400'
}

function preferStatus(a: CalendarDayStatus, b: CalendarDayStatus): CalendarDayStatus {
  const rank = { cancelled: 3, completed: 2, scheduled: 1 }
  return rank[a] >= rank[b] ? a : b
}

function fmtCollapsedDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function MapMonthCalendar({
  selectedDate,
  markedDays,
  onSelectDate,
  selectionMode = 'navigate',
  range = null,
  onRangeChange,
  /** Read-only week/span band (e.g. employee week view) — does not change click behaviour. */
  highlightRange = null,
  resetViewKey,
  defaultOpen = true,
}: {
  /** YYYY-MM-DD when a day/route view is active (navigate mode). */
  selectedDate?: string | null
  /** Days with activity — one status per date (caller collapses duplicates). */
  markedDays?: CalendarDayMark[]
  onSelectDate?: (date: string) => void
  /** navigate = jump to day view; range = client span selection. */
  selectionMode?: 'navigate' | 'range'
  /** Committed range from URL / parent. null = show all. */
  range?: CalendarRange | null
  onRangeChange?: (range: CalendarRange | null) => void
  /** Soft background band under days (week currently shown). */
  highlightRange?: CalendarRange | null
  /** When this changes (e.g. clientId), jump the visible month to the selection / today. */
  resetViewKey?: string | number
  /** Planner chrome starts collapsed to free vertical space for the route. */
  defaultOpen?: boolean
}) {
  const today = todayStr()
  const marksByDate = useMemo(() => {
    const map = new Map<string, CalendarDayStatus>()
    for (const m of markedDays || []) {
      const d = String(m.date).slice(0, 10)
      const prev = map.get(d)
      map.set(d, prev ? preferStatus(prev, m.status) : m.status)
    }
    return map
  }, [markedDays])

  const initial = selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
    ? selectedDate
    : range?.from && /^\d{4}-\d{2}-\d{2}$/.test(range.from)
      ? range.from
      : today
  const [y0, m0] = initial.split('-').map(Number)
  const [viewYear, setViewYear] = useState(y0)
  const [viewMonth, setViewMonth] = useState(m0 - 1)
  const [open, setOpen] = useState(defaultOpen)

  // Range-mode: after first click, hover stretches forward (survives month changes).
  const [anchor, setAnchor] = useState<string | null>(null)
  const [stretching, setStretching] = useState(false)
  const [hoverEnd, setHoverEnd] = useState<string | null>(null)
  const ignoreLeaveRef = useRef(false)
  const stretchingRef = useRef(false)
  const calendarRootRef = useRef<HTMLDivElement>(null)
  stretchingRef.current = stretching

  useEffect(() => {
    if (selectionMode !== 'range') {
      setAnchor(null)
      setStretching(false)
      setHoverEnd(null)
    }
  }, [selectionMode])

  // Sync local anchor from URL when not mid-stretch (shareable links / back button).
  useEffect(() => {
    if (selectionMode !== 'range') return
    if (stretchingRef.current) return
    if (range) {
      setAnchor(range.from)
    } else {
      setAnchor(null)
    }
    setHoverEnd(null)
  }, [selectionMode, range?.from, range?.to])

  // Jump the visible month only for navigate-mode date changes — never yank the
  // view while the user is picking a multi-month span in range mode.
  useEffect(() => {
    if (selectionMode === 'range') return
    if (!selectedDate || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return
    const [y, m] = selectedDate.split('-').map(Number)
    setViewYear(y)
    setViewMonth(m - 1)
  }, [selectedDate, selectionMode])

  // New client / employee week / shared link: open on the span (or today), then leave month nav alone.
  useEffect(() => {
    if (resetViewKey == null) return
    const focus =
      (highlightRange?.from && /^\d{4}-\d{2}-\d{2}$/.test(highlightRange.from))
        ? highlightRange.from
        : (range?.from && /^\d{4}-\d{2}-\d{2}$/.test(range.from))
          ? range.from
          : todayStr()
    const [y, m] = focus.split('-').map(Number)
    setViewYear(y)
    setViewMonth(m - 1)
    setStretching(false)
    setHoverEnd(null)
  }, [resetViewKey]) // eslint-disable-line react-hooks/exhaustive-deps — intentional: only on identity change

  const cells = useMemo(() => buildMonthCells(viewYear, viewMonth), [viewYear, viewMonth])

  const visualRange = useMemo((): CalendarRange | null => {
    if (selectionMode !== 'range') {
      // Soft week/span highlight for navigate mode (employee week, etc.)
      if (highlightRange?.from && highlightRange?.to) return highlightRange
      if (selectedDate) return { from: selectedDate, to: selectedDate }
      return null
    }
    if (stretching && anchor) {
      const end = hoverEnd && hoverEnd >= anchor ? hoverEnd : anchor
      return { from: anchor, to: end }
    }
    return range
  }, [selectionMode, selectedDate, stretching, anchor, hoverEnd, range, highlightRange])

  const shiftMonth = (delta: number) => {
    // Month arrows remount day cells and can fire mouseleave — keep stretch alive.
    ignoreLeaveRef.current = true
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
    window.setTimeout(() => { ignoreLeaveRef.current = false }, 100)
  }

  const commitRange = (from: string, to: string) => {
    // Ignore late mouseleave commits that fire in the same gesture as clear.
    if (ignoreLeaveRef.current) return
    onRangeChange?.({ from, to })
  }

  const clearRange = () => {
    // Block grid mouseleave from immediately re-committing the old span when clicking X.
    // Update the ref synchronously — setState alone is too late for leave handlers in this tick.
    ignoreLeaveRef.current = true
    stretchingRef.current = false
    setAnchor(null)
    setStretching(false)
    setHoverEnd(null)
    onRangeChange?.(null)
    window.setTimeout(() => { ignoreLeaveRef.current = false }, 250)
  }

  const handleDayClick = (date: string) => {
    if (selectionMode === 'navigate') {
      onSelectDate?.(date)
      return
    }

    // Clicking the already-committed single day again clears → show all.
    if (
      !stretching &&
      range &&
      range.from === range.to &&
      range.from === date
    ) {
      clearRange()
      return
    }

    if (!stretching || !anchor) {
      setAnchor(date)
      setStretching(true)
      setHoverEnd(null)
      commitRange(date, date)
      return
    }

    if (date === anchor) {
      setStretching(false)
      setHoverEnd(null)
      commitRange(date, date)
      return
    }

    if (date > anchor) {
      setStretching(false)
      setHoverEnd(null)
      commitRange(anchor, date)
      return
    }

    // Earlier day → new anchor
    setAnchor(date)
    setStretching(true)
    setHoverEnd(null)
    commitRange(date, date)
  }

  const handleDayEnter = (date: string) => {
    if (selectionMode !== 'range' || !stretching || !anchor) return
    if (date >= anchor) setHoverEnd(date)
  }

  const handleGridLeave = (e: React.MouseEvent) => {
    if (ignoreLeaveRef.current) return
    if (selectionMode !== 'range' || !stretchingRef.current || !anchor) return
    // Moving to the selection label / X / month arrows is still "inside" the calendar —
    // do not lock the stretch (that made X appear to do nothing).
    const related = e.relatedTarget as Node | null
    if (related && calendarRootRef.current?.contains(related)) return
    stretchingRef.current = false
    setStretching(false)
    setHoverEnd(null)
    commitRange(anchor, anchor)
  }

  const committedLabel = range
    ? range.from === range.to
      ? fmtSpanDay(range.from)
      : `${fmtSpanDay(range.from)} – ${fmtSpanDay(range.to)}`
    : null

  const collapsedDate =
    selectionMode === 'navigate' && selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
      ? selectedDate
      : null

  return (
    <div ref={calendarRootRef} className="px-0.5 pt-0.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="w-6 h-6 rounded-full flex items-center justify-center text-gray-500 hover:bg-black/5 hover:text-gray-800 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeftIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex-1 min-w-0 flex items-center justify-center gap-1 rounded-lg px-1 py-0.5 hover:bg-black/[0.03] transition-colors"
          aria-expanded={open}
          aria-label={open ? 'Hide calendar' : 'Show calendar'}
        >
          <span className="min-w-0 text-center">
            <span className="block text-[11px] font-bold text-gray-800 tracking-tight capitalize truncate leading-tight">
              {open
                ? monthLabel(viewYear, viewMonth)
                : (collapsedDate ? fmtCollapsedDay(collapsedDate) : monthLabel(viewYear, viewMonth))}
            </span>
            {!open && collapsedDate && (
              <span className="block text-[9px] font-medium text-gray-400 truncate leading-tight mt-px capitalize">
                {monthLabel(viewYear, viewMonth)}
              </span>
            )}
          </span>
          {open
            ? <ChevronUpIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
            : <ChevronDownIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />}
        </button>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="w-6 h-6 rounded-full flex items-center justify-center text-gray-500 hover:bg-black/5 hover:text-gray-800 transition-colors"
          aria-label="Next month"
        >
          <ChevronRightIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden min-h-0">
          <div className="grid grid-cols-7 mt-1 mb-0.5">
            {WEEKDAYS.map((d, i) => (
              <div
                key={`${d}-${i}`}
                className="h-4 flex items-center justify-center text-[9px] font-semibold text-gray-400"
              >
                {d}
              </div>
            ))}
          </div>
          <div
            className="grid grid-cols-7 gap-y-0.5 pb-0.5"
            onMouseLeave={handleGridLeave}
          >
            {cells.map((cell, index) => {
              const isToday = cell.date === today
              const isPast = cell.date < today
              const inRange = !!(
                visualRange &&
                cell.date >= visualRange.from &&
                cell.date <= visualRange.to
              )
              const isRangeStart = !!(visualRange && cell.date === visualRange.from)
              const isRangeEnd = !!(visualRange && cell.date === visualRange.to)
              // Navigate mode: the clicked day — green number (filled accent).
              const isSelectedDay =
                selectionMode === 'navigate' && !!selectedDate && cell.date === selectedDate
              const isSoftWeek =
                selectionMode === 'navigate'
                && !!highlightRange
                && inRange
                && !isSelectedDay
              const col = index % 7
              const roundLeft = inRange && (isRangeStart || col === 0)
              const roundRight = inRange && (isRangeEnd || col === 6)
              const markStatus = marksByDate.get(cell.date)

              return (
                <div
                  key={cell.date + (cell.inMonth ? '' : '-o')}
                  className={[
                    'relative flex items-center justify-center py-0.5',
                    inRange && !isSelectedDay
                      ? (isSoftWeek ? 'bg-primary-500/[0.08]' : 'bg-accent-500/15')
                      : '',
                    roundLeft ? 'rounded-l-full' : '',
                    roundRight ? 'rounded-r-full' : '',
                  ].filter(Boolean).join(' ')}
                  onMouseEnter={() => handleDayEnter(cell.date)}
                >
                  <button
                    type="button"
                    onClick={() => handleDayClick(cell.date)}
                    className={[
                      'relative w-[22px] h-[22px] rounded-full text-[10px] font-semibold flex items-center justify-center transition-colors',
                      !cell.inMonth ? 'text-gray-300 opacity-40' : '',
                      // Selected day wins — green fill so the clicked date is obvious.
                      cell.inMonth && isSelectedDay ? 'bg-accent-500 text-white opacity-100' : '',
                      // Today (when not the selected day) stays brand-dark.
                      cell.inMonth && isToday && !isSelectedDay ? 'bg-primary-500 text-white opacity-100' : '',
                      cell.inMonth && !isToday && !isSelectedDay && isPast ? 'text-gray-500 opacity-40' : '',
                      cell.inMonth && !isToday && !isSelectedDay && !isPast ? 'text-gray-800' : '',
                      inRange && !isToday && !isSelectedDay ? 'text-primary-800 opacity-100' : '',
                      'hover:opacity-100',
                    ].filter(Boolean).join(' ')}
                    aria-current={isToday ? 'date' : undefined}
                    aria-pressed={inRange || isSelectedDay}
                  >
                    {cell.day}
                  </button>
                  {markStatus && (
                    <span
                      className={`pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${statusDotClass(markStatus)}`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Committed selection label — clear returns to “show all” (and updates URL). */}
      {selectionMode === 'range' && committedLabel && (
        <div className="flex items-center justify-center gap-1.5 pt-1 pb-0.5">
          <span className="text-[11px] text-gray-500 truncate">
            <span className="text-gray-400">Selected </span>
            <span className="font-semibold text-gray-800">{committedLabel}</span>
          </span>
          <button
            type="button"
            onMouseDown={(e) => {
              // mousedown runs before any residual leave/click races from the day grid.
              e.preventDefault()
              e.stopPropagation()
              clearRange()
            }}
            className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 transition-colors"
            aria-label="Clear date selection"
            title="Clear selection"
          >
            <XMarkIcon className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}
