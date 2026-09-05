'use client'

/**
 * Round placement controls:
 * - RoundNameField: editable name in the top control strip
 * - RoundEmployeePicker: employee at the top of the stop list
 * - RoundScheduleBar: Schedule button → days / repeat (when)
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowPathRoundedSquareIcon,
  CalendarDaysIcon,
  PencilSquareIcon,
  PlusIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useAppI18n } from '@/app/components/I18nProvider'

export type PlacementUser = { id: number; first_name: string; last_name: string }

export type RoundScheduleMode = 'manual' | 'recurring' | null
export type RoundRecurrenceType = 'weekly' | 'monthly'

type AnchorRect = { top: number; left: number; bottom: number; width: number }

function useAnchorRect(open: boolean, ref: React.RefObject<HTMLElement | null>) {
  const [rect, setRect] = useState<AnchorRect | null>(null)

  useEffect(() => {
    if (!open || !ref.current) {
      setRect(null)
      return
    }
    const place = () => {
      const r = ref.current!.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, bottom: r.bottom, width: r.width })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, ref])

  return rect
}

function fmtPlacementDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function userLabel(u: PlacementUser | null | undefined): string {
  if (!u) return ''
  return `${u.first_name} ${u.last_name}`.trim()
}

const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEKDAY_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Click-to-edit round name for the top strip. */
export function RoundNameField({
  name,
  placeholder = 'New round',
  onChange,
  className = '',
}: {
  name: string | null | undefined
  placeholder?: string
  onChange: (name: string | null) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name?.trim() || '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(name?.trim() || '')
  }, [name, editing])

  useEffect(() => {
    if (!editing) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [editing])

  const commit = () => {
    const next = draft.trim() || null
    setEditing(false)
    if ((next || null) !== (name?.trim() || null)) onChange(next)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(name?.trim() || '')
            setEditing(false)
          }
        }}
        placeholder={placeholder}
        className={`min-w-0 flex-1 h-8 rounded-xl border border-[#193434]/30 bg-white px-2.5 text-[13px] font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#193434]/15 ${className}`}
        aria-label="Round name"
      />
    )
  }

  const display = name?.trim() || placeholder
  const isPlaceholder = !name?.trim()

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`min-w-0 flex-1 h-8 flex items-center gap-1.5 rounded-xl border border-transparent hover:border-gray-200 hover:bg-white px-2 text-left transition-colors group ${className}`}
      title="Rename round"
    >
      <span className={`flex-1 min-w-0 truncate text-[13px] font-bold leading-tight ${isPlaceholder ? 'text-gray-400' : 'text-gray-900'}`}>
        {display}
      </span>
      <PencilSquareIcon className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 flex-shrink-0" strokeWidth={2} />
    </button>
  )
}

/** Compact employee chip (still used in deprecated RoundPlacementBar). */
export function RoundEmployeePicker({
  users,
  userId,
  onUserChange,
  className = '',
}: {
  users: PlacementUser[]
  userId: number | null
  onUserChange: (userId: number | null) => void
  className?: string
}) {
  const { t } = useAppI18n()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const rect = useAnchorRect(open, btnRef)
  const selected = userId != null ? users.find(u => u.id === userId) : null
  const label = selected
    ? userLabel(selected)
    : t('app.routePlanner.anyEmployee', 'Any')

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`min-w-0 flex-1 h-8 flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 text-left hover:border-gray-300 transition-colors ${className}`}
        aria-expanded={open}
      >
        <UserIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" strokeWidth={2} />
        <span className={`flex-1 min-w-0 truncate text-[12px] font-semibold ${selected ? 'text-gray-800' : 'text-gray-400'}`}>
          {label}
        </span>
        {selected && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => {
              e.stopPropagation()
              onUserChange(null)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onUserChange(null)
              }
            }}
            className="p-0.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Clear employee"
          >
            <XMarkIcon className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {open && rect && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[240]" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="fixed z-[250] max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl"
            style={{
              top: Math.min(rect.bottom + 4, window.innerHeight - 8),
              left: rect.left,
              width: Math.max(rect.width, 180),
            }}
          >
            <button
              type="button"
              onClick={() => { onUserChange(null); setOpen(false) }}
              className={`w-full px-3 py-2 text-left text-[12px] font-semibold ${userId == null ? 'bg-gray-50 text-gray-900' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {t('app.routePlanner.anyEmployee', 'Any')}
            </button>
            {users.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => { onUserChange(u.id); setOpen(false) }}
                className={`w-full px-3 py-2 text-left text-[12px] font-semibold ${
                  userId === u.id ? 'bg-gray-50 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {u.first_name} {u.last_name}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

/** Schedule button → one-time (batch jobs) or repeat (round-owned subscriptions). */
export function RoundScheduleBar({
  mode,
  dates,
  dayOfWeek,
  intervalWeeks,
  recurrenceType = 'weekly',
  dayOfMonth = 1,
  intervalMonths = 1,
  startingDate = '',
  users,
  userId,
  onModeChange,
  onDatesChange,
  onDayOfWeekChange,
  onIntervalWeeksChange,
  onRecurrenceTypeChange,
  onDayOfMonthChange,
  onIntervalMonthsChange,
  onStartingDateChange,
  onApplyManual,
  onApplyRecurring,
  onUserChange: _onUserChange,
}: {
  mode: RoundScheduleMode
  dates: string[]
  dayOfWeek: number
  intervalWeeks: number
  recurrenceType?: RoundRecurrenceType
  dayOfMonth?: number
  intervalMonths?: number
  startingDate?: string
  users: PlacementUser[]
  userId: number | null
  onModeChange: (mode: RoundScheduleMode) => void
  onDatesChange: (dates: string[]) => void
  onDayOfWeekChange: (day: number) => void
  onIntervalWeeksChange: (n: number) => void
  onRecurrenceTypeChange?: (t: RoundRecurrenceType) => void
  onDayOfMonthChange?: (d: number) => void
  onIntervalMonthsChange?: (n: number) => void
  onStartingDateChange?: (d: string) => void
  /** Prefer these for Done — one atomic write, avoids schedule_kind races. */
  onApplyManual?: (dates: string[]) => void
  onApplyRecurring?: (next: {
    recurrenceType: RoundRecurrenceType
    dayOfWeek: number
    intervalWeeks: number
    dayOfMonth: number
    intervalMonths: number
    startingDate: string
  }) => void
  onUserChange: (userId: number | null) => void
}) {
  const { t } = useAppI18n()
  const [open, setOpen] = useState(false)
  const [draftMode, setDraftMode] = useState<'manual' | 'recurring'>('manual')
  const [draftDates, setDraftDates] = useState<string[]>(dates)
  const [draftDay, setDraftDay] = useState(dayOfWeek)
  const [draftInterval, setDraftInterval] = useState(intervalWeeks)
  const [draftRecurrence, setDraftRecurrence] = useState<RoundRecurrenceType>(recurrenceType)
  const [draftDayOfMonth, setDraftDayOfMonth] = useState(dayOfMonth)
  const [draftIntervalMonths, setDraftIntervalMonths] = useState(intervalMonths)
  const [draftStart, setDraftStart] = useState(startingDate)
  const [draftCustomWeeks, setDraftCustomWeeks] = useState('')
  const [pendingDate, setPendingDate] = useState('')

  useEffect(() => {
    if (!open) return
    setDraftMode(mode === 'recurring' ? 'recurring' : 'manual')
    setDraftDates(dates.length ? [...dates] : [])
    setDraftDay(dayOfWeek)
    setDraftInterval(intervalWeeks)
    setDraftRecurrence(recurrenceType)
    setDraftDayOfMonth(dayOfMonth)
    setDraftIntervalMonths(intervalMonths)
    setDraftStart(startingDate || '')
    setDraftCustomWeeks([1, 2, 3, 4, 6].includes(intervalWeeks) ? '' : String(intervalWeeks || ''))
    setPendingDate('')
  }, [open, mode, dates, dayOfWeek, intervalWeeks, recurrenceType, dayOfMonth, intervalMonths, startingDate])

  const hasEmployee = userId != null && userId > 0

  const whenSummary = (() => {
    if (mode === 'manual' && dates.length > 0) {
      if (dates.length === 1) return `One-time · ${fmtPlacementDate(dates[0])}`
      return `One-time · ${dates.length} days`
    }
    if (mode === 'recurring') {
      if (recurrenceType === 'monthly') {
        const ord = dayOfMonth === 1 ? '1st' : dayOfMonth === 2 ? '2nd' : dayOfMonth === 3 ? '3rd' : `${dayOfMonth}th`
        return intervalMonths <= 1 ? `Monthly · ${ord}` : `Every ${intervalMonths} mo · ${ord}`
      }
      const day = WEEKDAY_LONG[dayOfWeek] || ''
      return intervalWeeks <= 1 ? `Weekly · ${day}` : `Every ${intervalWeeks}w · ${day}`
    }
    return null
  })()

  const summary = whenSummary
  const effectiveWeeks = draftCustomWeeks.trim()
    ? Math.max(1, Number(draftCustomWeeks) || 1)
    : draftInterval

  // Schedule can be confirmed without an employee; placing jobs needs one later.
  const canApply =
    draftMode === 'recurring'
    || (draftMode === 'manual' && draftDates.length > 0)

  const addDateValue = (raw: string) => {
    const v = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
    if (!v) return
    setDraftDates(prev => {
      const next = prev.includes(v) ? prev : [...prev, v].sort()
      // Commit as soon as a date is listed so the Schedule button leaves
      // the empty "Schedule" state without requiring a separate Done click.
      if (next !== prev && next.length > 0) {
        queueMicrotask(() => {
          if (onApplyManual) onApplyManual(next)
          else {
            onModeChange('manual')
            onDatesChange(next)
          }
        })
      }
      return next
    })
  }

  const addPendingDate = () => {
    addDateValue(pendingDate)
    setPendingDate('')
  }

  const removeDate = (d: string) => {
    setDraftDates(prev => {
      const next = prev.filter(x => x !== d)
      queueMicrotask(() => {
        if (next.length === 0) {
          onModeChange(null)
          onDatesChange([])
        } else if (onApplyManual) {
          onApplyManual(next)
        } else {
          onModeChange('manual')
          onDatesChange(next)
        }
      })
      return next
    })
  }

  const applyAndClose = () => {
    if (!canApply) return
    if (draftMode === 'manual') {
      const nextDates = [...draftDates].sort()
      if (onApplyManual) {
        onApplyManual(nextDates)
      } else {
        onModeChange('manual')
        onDatesChange(nextDates)
      }
    } else if (onApplyRecurring) {
      onApplyRecurring({
        recurrenceType: draftRecurrence,
        dayOfWeek: draftDay,
        intervalWeeks: effectiveWeeks,
        dayOfMonth: draftDayOfMonth,
        intervalMonths: draftIntervalMonths,
        startingDate: draftStart || '',
      })
    } else {
      onDayOfWeekChange(draftDay)
      onIntervalWeeksChange(effectiveWeeks)
      onRecurrenceTypeChange?.(draftRecurrence)
      onDayOfMonthChange?.(draftDayOfMonth)
      onIntervalMonthsChange?.(draftIntervalMonths)
      onStartingDateChange?.(draftStart || '')
      onModeChange('recurring')
    }
    setOpen(false)
  }

  const clearSchedule = () => {
    onModeChange(null)
    onDatesChange([])
    setOpen(false)
  }

  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  return (
    <div className="mb-2.5">
      <button
        type="button"
        onClick={() => {
          if (open) {
            // Closing the panel with a valid draft commits it (same as Done).
            if (canApply) applyAndClose()
            else setOpen(false)
            return
          }
          setOpen(true)
        }}
        className={[
          'w-full min-h-9 flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
          summary
            ? 'border-gray-200 bg-white hover:border-gray-300'
            : 'border-dashed border-gray-300 bg-white hover:border-accent-400 hover:bg-accent-50/30',
        ].join(' ')}
      >
        <CalendarDaysIcon className={`h-3.5 w-3.5 flex-shrink-0 ${summary ? 'text-gray-500' : 'text-gray-400'}`} strokeWidth={2} />
        <span className={`flex-1 min-w-0 truncate text-[12px] font-semibold ${summary ? 'text-gray-800' : 'text-gray-500'}`}>
          {summary || 'Schedule'}
        </span>
        {summary ? (
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Edit</span>
        ) : (
          <PlusIcon className="h-3.5 w-3.5 text-gray-300" strokeWidth={2.5} />
        )}
      </button>

      {open && (
        <div className="mt-1.5 rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm space-y-3.5">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
              When
            </label>
            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-gray-100">
              <button
                type="button"
                onClick={() => setDraftMode('manual')}
                className={[
                  'flex-1 h-8 inline-flex items-center justify-center gap-1.5 rounded-[10px] text-[11px] font-bold transition-colors',
                  draftMode === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                ].join(' ')}
              >
                <CalendarDaysIcon className="h-3.5 w-3.5" strokeWidth={2} />
                One-time
              </button>
              <button
                type="button"
                onClick={() => setDraftMode('recurring')}
                className={[
                  'flex-1 h-8 inline-flex items-center justify-center gap-1.5 rounded-[10px] text-[11px] font-bold transition-colors',
                  draftMode === 'recurring' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                ].join(' ')}
              >
                <ArrowPathRoundedSquareIcon className="h-3.5 w-3.5" strokeWidth={2} />
                Repeat
              </button>
            </div>

            {draftMode === 'manual' && (
              <div className="mt-2.5 space-y-2">
                <p className="text-[11px] text-gray-500 leading-snug">
                  Add one or more dates. Creates normal jobs on those days — no subscriptions. The round stays a reusable template.
                </p>
                {draftDates.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-3 py-3 text-center">
                    <p className="text-[12px] font-semibold text-gray-600">No dates yet</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Pick a date below — it adds to the list</p>
                  </div>
                ) : (
                  <ul className="space-y-1 max-h-36 overflow-y-auto">
                    {draftDates.map(d => (
                      <li
                        key={d}
                        className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-2.5 py-1.5"
                      >
                        <CalendarDaysIcon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        <span className="flex-1 text-[12px] font-semibold text-gray-800">
                          {fmtPlacementDate(d)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeDate(d)}
                          className="p-0.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-white"
                          aria-label={`Remove ${d}`}
                        >
                          <XMarkIcon className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={pendingDate}
                    onChange={e => {
                      const v = e.target.value
                      setPendingDate(v)
                      // Date pickers commit on change — add immediately so Done can enable.
                      if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
                        addDateValue(v)
                        setPendingDate('')
                      }
                    }}
                    className="flex-1 h-9 rounded-xl border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#193434]/15 focus:border-[#193434]/40"
                  />
                  <button
                    type="button"
                    onClick={addPendingDate}
                    disabled={!pendingDate}
                    className="h-9 w-9 flex items-center justify-center rounded-xl bg-[#193434] text-white disabled:opacity-35 hover:opacity-90"
                    title="Add date"
                    aria-label="Add date"
                  >
                    <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {[
                    { label: 'Today', value: today },
                    {
                      label: 'Tomorrow',
                      value: (() => {
                        const d = new Date()
                        d.setDate(d.getDate() + 1)
                        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                      })(),
                    },
                  ].map(chip => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => addDateValue(chip.value)}
                      className="h-7 px-2.5 rounded-lg text-[10px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 leading-snug">
                  Dates appear above as soon as you pick them. Tap <span className="font-bold text-gray-600">Done</span> when finished.
                </p>
              </div>
            )}

            {draftMode === 'recurring' && (
              <div className="mt-2.5 space-y-3">
                <p className="text-[11px] text-gray-500 leading-snug">
                  Creates a subscription for each stop with this cadence. Jobs stay linked as this round. Those subscriptions won&apos;t appear under Subscriptions — edit them via the round later.
                </p>
                <div className="flex p-0.5 gap-0.5 rounded-xl border border-gray-200 bg-white">
                  {(['weekly', 'monthly'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setDraftRecurrence(type)
                        setDraftCustomWeeks('')
                      }}
                      className={[
                        'flex-1 h-8 rounded-[10px] text-[11px] font-bold transition-colors',
                        draftRecurrence === type ? 'bg-[#193434] text-white' : 'text-gray-500 hover:bg-gray-50',
                      ].join(' ')}
                    >
                      {type === 'weekly' ? 'Weekly' : 'Monthly'}
                    </button>
                  ))}
                </div>

                {draftRecurrence === 'weekly' ? (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                        Day of week
                      </label>
                      <div className="flex items-center justify-between gap-1">
                        {WEEKDAY_SHORT.map((label, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setDraftDay(i)}
                            className={[
                              'h-8 w-8 rounded-full text-[10px] font-bold transition-colors',
                              draftDay === i
                                ? 'bg-accent-500 text-white'
                                : 'bg-gray-50 text-gray-500 hover:bg-gray-100',
                            ].join(' ')}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                        Every
                      </label>
                      <div className="flex items-center gap-1 flex-wrap">
                        {[1, 2, 3, 4, 6].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => {
                              setDraftInterval(n)
                              setDraftCustomWeeks('')
                            }}
                            className={[
                              'flex-1 min-w-[3.2rem] h-8 rounded-lg text-[10px] font-bold transition-colors',
                              !draftCustomWeeks && draftInterval === n
                                ? 'bg-[#193434] text-white'
                                : 'bg-gray-50 text-gray-500 hover:bg-gray-100',
                            ].join(' ')}
                          >
                            {n === 1 ? 'Week' : `${n}w`}
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={52}
                        placeholder="Custom weeks"
                        value={draftCustomWeeks}
                        onChange={e => setDraftCustomWeeks(e.target.value)}
                        className="mt-1.5 w-full h-8 rounded-lg border border-gray-200 px-2.5 text-[11px] font-semibold"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                        Day of month
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={draftDayOfMonth}
                        onChange={e => setDraftDayOfMonth(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                        className="w-full h-9 rounded-xl border border-gray-200 px-3 text-[12px] font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                        Every
                      </label>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 6].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setDraftIntervalMonths(n)}
                            className={[
                              'flex-1 h-8 rounded-lg text-[10px] font-bold transition-colors',
                              draftIntervalMonths === n
                                ? 'bg-[#193434] text-white'
                                : 'bg-gray-50 text-gray-500 hover:bg-gray-100',
                            ].join(' ')}
                          >
                            {n === 1 ? 'Month' : `${n} mo`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Starts
                  </label>
                  <div className="flex gap-1 mb-1.5">
                    <button
                      type="button"
                      onClick={() => setDraftStart('')}
                      className={[
                        'flex-1 h-8 rounded-lg text-[10px] font-bold',
                        !draftStart ? 'bg-[#193434] text-white' : 'bg-gray-50 text-gray-500',
                      ].join(' ')}
                    >
                      ASAP
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftStart(draftStart || today)}
                      className={[
                        'flex-1 h-8 rounded-lg text-[10px] font-bold',
                        draftStart ? 'bg-[#193434] text-white' : 'bg-gray-50 text-gray-500',
                      ].join(' ')}
                    >
                      Custom
                    </button>
                  </div>
                  {!!draftStart && (
                    <input
                      type="date"
                      value={draftStart}
                      onChange={e => setDraftStart(e.target.value)}
                      className="w-full h-9 rounded-xl border border-gray-200 px-3 text-[12px] font-semibold"
                    />
                  )}
                  <p className="text-[10px] text-gray-400 mt-1.5 leading-snug">
                    Saving places the next ~16 visits on the calendar as real jobs.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-0.5">
            {summary && (
              <button
                type="button"
                onClick={clearSchedule}
                className="h-8 px-2.5 rounded-lg text-[11px] font-semibold text-gray-500 hover:bg-gray-100"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto h-8 px-2.5 rounded-lg text-[11px] font-semibold text-gray-500 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canApply}
              onClick={applyAndClose}
              className="h-8 px-3 rounded-lg bg-[#193434] text-white text-[11px] font-bold disabled:opacity-40"
            >
              Done
            </button>
          </div>
          {!canApply && (
            <p className="text-[10px] text-gray-400 -mt-2">
              {draftMode === 'manual'
                ? t('app.rounds.scheduleDatesHint', 'Add at least one date, then tap Done.')
                : t('app.rounds.scheduleWhenHint', 'Choose a repeat pattern, then tap Done.')}
            </p>
          )}
          {canApply && !hasEmployee && (
            <p className="text-[10px] text-amber-600 -mt-2">
              {t('app.rounds.scheduleEmployeeHint', 'Tip: choose an employee above so jobs can be placed on the calendar.')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** @deprecated Prefer RoundNameField + RoundScheduleBar */
export default function RoundPlacementBar({
  users,
  userId,
  date,
  onUserChange,
  onDateChange,
}: {
  users: PlacementUser[]
  userId: number | null
  date: string | null
  onUserChange: (userId: number | null) => void
  onDateChange: (date: string | null) => void
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <RoundEmployeePicker users={users} userId={userId} onUserChange={onUserChange} />
      <button
        type="button"
        onClick={() => {
          const next = date || new Date().toISOString().slice(0, 10)
          onDateChange(date ? null : next)
        }}
        className="min-w-0 flex-1 h-9 flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 text-left"
      >
        <CalendarDaysIcon className="w-3.5 h-3.5 text-gray-400" />
        <span className={`truncate text-[12px] font-semibold ${date ? 'text-gray-800' : 'text-gray-400'}`}>
          {date ? fmtPlacementDate(date) : 'Any'}
        </span>
      </button>
    </div>
  )
}
