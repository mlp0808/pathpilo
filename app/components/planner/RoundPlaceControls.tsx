'use client'

/**
 * Round place controls above Save — same idea as Create Job:
 * date on the left (places one copy), Recurring on the right (compact schedule).
 */

import { useMemo, useRef, useState } from 'react'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CalendarDaysIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useAppI18n } from '@/app/components/I18nProvider'
import DashedPickerTrigger from '@/app/components/DashedPickerTrigger'
import { SchedulePanel } from '@/app/components/SubscriptionPanels'
import {
  todayYmdLocal,
  firstOccurrenceOnOrAfterAnchor,
} from '@/app/utils/subscriptionHelpers'
import type { RoundRecurrenceType, RoundScheduleMode } from './RoundPlacementBar'

function formatPlaceDate(dateStr: string, locale: 'en' | 'da') {
  const raw = dateStr.split('T')[0]
  const [y, m, d] = raw.split('-').map(Number)
  if (!y || !m || !d) return { primary: raw, secondary: '' }
  const date = new Date(y, m - 1, d)
  const loc = locale === 'da' ? 'da-DK' : 'en-US'
  const today = new Date()
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  return {
    primary: date.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' }),
    secondary: isToday
      ? (locale === 'da' ? 'I dag' : 'Today')
      : date.toLocaleDateString(loc, { year: 'numeric' }),
  }
}

export function RoundPlaceControls({
  mode,
  dates,
  dayOfWeek,
  intervalWeeks,
  recurrenceType,
  dayOfMonth,
  intervalMonths,
  startingDate,
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
  busy = false,
}: {
  mode: RoundScheduleMode
  dates: string[]
  dayOfWeek: number
  intervalWeeks: number
  recurrenceType: RoundRecurrenceType
  dayOfMonth: number
  intervalMonths: number
  startingDate: string
  onModeChange: (mode: RoundScheduleMode) => void
  onDatesChange: (dates: string[]) => void
  onDayOfWeekChange: (day: number) => void
  onIntervalWeeksChange: (n: number) => void
  onRecurrenceTypeChange?: (t: RoundRecurrenceType) => void
  onDayOfMonthChange?: (d: number) => void
  onIntervalMonthsChange?: (n: number) => void
  onStartingDateChange?: (d: string) => void
  onApplyManual?: (dates: string[]) => void
  onApplyRecurring?: (next: {
    recurrenceType: RoundRecurrenceType
    dayOfWeek: number
    intervalWeeks: number
    dayOfMonth: number
    intervalMonths: number
    startingDate: string
  }) => void
  busy?: boolean
}) {
  const { t, locale } = useAppI18n()
  const dateInputRef = useRef<HTMLInputElement>(null)
  const [recurringOpen, setRecurringOpen] = useState(false)
  const [startAsap, setStartAsap] = useState(true)
  const [customStartingDate, setCustomStartingDate] = useState('')
  const [customInterval, setCustomInterval] = useState('')
  const [localRecurrenceType, setLocalRecurrenceType] = useState<RoundRecurrenceType>(recurrenceType || 'weekly')
  const [localDayOfWeek, setLocalDayOfWeek] = useState(dayOfWeek)
  const [localIntervalWeeks, setLocalIntervalWeeks] = useState(intervalWeeks || 1)
  const [localDayOfMonth, setLocalDayOfMonth] = useState(dayOfMonth || 1)
  const [localIntervalMonths, setLocalIntervalMonths] = useState(intervalMonths || 1)

  const placedDate = mode === 'manual' && dates[0] ? dates[0] : ''
  const dateDisplay = placedDate ? formatPlaceDate(placedDate, locale) : null
  const isRecurringActive = mode === 'recurring'

  const effectiveStartingDate = useMemo(
    () => (startAsap ? todayYmdLocal() : customStartingDate),
    [startAsap, customStartingDate],
  )
  const firstVisitYmd = useMemo(() => {
    const anchor = startAsap ? todayYmdLocal() : customStartingDate.trim()
    if (!anchor) return ''
    return firstOccurrenceOnOrAfterAnchor(
      anchor,
      localRecurrenceType,
      localDayOfWeek,
      localIntervalWeeks,
      localDayOfMonth,
      localIntervalMonths,
    )
  }, [
    startAsap,
    customStartingDate,
    localRecurrenceType,
    localDayOfWeek,
    localIntervalWeeks,
    localDayOfMonth,
    localIntervalMonths,
  ])

  const openDatePicker = () => {
    const input = dateInputRef.current
    if (!input) return
    try {
      input.showPicker?.()
    } catch {
      input.click()
    }
  }

  const placeOnDate = (ymd: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return
    onModeChange('manual')
    onDatesChange([ymd])
    onApplyManual?.([ymd])
  }

  const clearDate = () => {
    onModeChange(null)
    onDatesChange([])
  }

  const openRecurring = () => {
    setLocalRecurrenceType(recurrenceType || 'weekly')
    setLocalDayOfWeek(dayOfWeek)
    setLocalIntervalWeeks(intervalWeeks || 1)
    setLocalDayOfMonth(dayOfMonth || 1)
    setLocalIntervalMonths(intervalMonths || 1)
    setCustomInterval('')
    const anchor = startingDate || placedDate || todayYmdLocal()
    if (startingDate && startingDate > todayYmdLocal()) {
      setStartAsap(false)
      setCustomStartingDate(startingDate)
    } else {
      setStartAsap(true)
      setCustomStartingDate(anchor)
    }
    const [y, m, d] = anchor.split('-').map(Number)
    if (y && m && d) {
      const parsed = new Date(y, m - 1, d)
      setLocalDayOfWeek(parsed.getDay())
      setLocalDayOfMonth(Math.min(28, parsed.getDate()))
    }
    setRecurringOpen(true)
  }

  const applyRecurring = () => {
    const start = startAsap ? firstVisitYmd : customStartingDate.trim()
    if (!start) return
    onApplyRecurring?.({
      recurrenceType: localRecurrenceType,
      dayOfWeek: localDayOfWeek,
      intervalWeeks: localIntervalWeeks,
      dayOfMonth: localDayOfMonth,
      intervalMonths: localIntervalMonths,
      startingDate: start,
    })
    onRecurrenceTypeChange?.(localRecurrenceType)
    onDayOfWeekChange(localDayOfWeek)
    onIntervalWeeksChange(localIntervalWeeks)
    onDayOfMonthChange?.(localDayOfMonth)
    onIntervalMonthsChange?.(localIntervalMonths)
    onStartingDateChange?.(start)
    setRecurringOpen(false)
  }

  if (recurringOpen) {
    return (
      <div className="mb-2.5 rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-gray-50/60">
          <button
            type="button"
            onClick={() => setRecurringOpen(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-gray-200 bg-white hover:bg-gray-50"
            aria-label={t('app.createJob.back', 'Back')}
          >
            <ArrowLeftIcon className="w-4 h-4 text-gray-600" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-900 truncate">
              {t('app.createJob.makeRecurringTitle', 'Make recurring')}
            </div>
            <div className="text-[11px] text-gray-500 truncate">
              {t('app.rounds.recurringHint', 'Places upcoming copies of this round')}
            </div>
          </div>
        </div>
        <div className="max-h-[min(52vh,420px)] overflow-y-auto px-3 py-3">
          <SchedulePanel
            variant="compact"
            effectiveStartingDate={effectiveStartingDate}
            firstVisitYmd={firstVisitYmd}
            startAsap={startAsap}
            onStartAsapChange={setStartAsap}
            customStartingDate={customStartingDate}
            onCustomStartingDateChange={setCustomStartingDate}
            recurrenceType={localRecurrenceType}
            onRecurrenceTypeChange={setLocalRecurrenceType}
            dayOfWeek={localDayOfWeek}
            onDayOfWeekChange={setLocalDayOfWeek}
            intervalWeeks={localIntervalWeeks}
            onIntervalWeeksChange={setLocalIntervalWeeks}
            customInterval={customInterval}
            onCustomIntervalChange={setCustomInterval}
            dayOfMonth={localDayOfMonth}
            onDayOfMonthChange={setLocalDayOfMonth}
            intervalMonths={localIntervalMonths}
            onIntervalMonthsChange={setLocalIntervalMonths}
          />
        </div>
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={applyRecurring}
            disabled={busy || !(startAsap ? !!firstVisitYmd : !!customStartingDate.trim())}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('app.rounds.applyRecurring', 'Apply recurring')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-2.5">
      <input
        ref={dateInputRef}
        type="date"
        value={placedDate}
        min={todayYmdLocal()}
        onChange={(e) => {
          const v = e.target.value
          if (v) placeOnDate(v)
        }}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />
      <div className="flex items-stretch gap-2">
        <div className="flex-1 min-w-0">
          {placedDate && dateDisplay ? (
            <div className="flex items-center gap-2.5 bg-white rounded-xl border border-gray-200/80 px-3 py-2 shadow-sm h-full min-h-[3rem]">
              <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                <CalendarDaysIcon className="w-4 h-4 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-gray-900 truncate">{dateDisplay.primary}</div>
                <div className="text-[10px] text-gray-500 truncate">{dateDisplay.secondary}</div>
              </div>
              <button
                type="button"
                onClick={clearDate}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 flex-shrink-0"
                aria-label={t('app.createJob.changeDate', 'Change date')}
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <DashedPickerTrigger onClick={openDatePicker} size="md" className="h-full min-h-[3rem] rounded-xl">
              {t('app.createJob.selectDate', 'Select date')}
            </DashedPickerTrigger>
          )}
        </div>
        <button
          type="button"
          onClick={openRecurring}
          disabled={busy}
          title={t('app.createJob.makeRecurring', 'Make recurring')}
          className={`flex-shrink-0 inline-flex flex-col items-center justify-center gap-0.5 px-2.5 min-w-[4.75rem] rounded-xl border transition-all duration-200 shadow-sm disabled:opacity-40 ${
            isRecurringActive
              ? 'border-gray-900 bg-gray-900 text-white'
              : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50 hover:border-gray-300'
          }`}
        >
          <ArrowPathIcon className="w-4 h-4" />
          <span className="text-[10px] font-semibold leading-tight text-center">
            {t('app.createJob.makeRecurringShort', 'Recurring')}
          </span>
        </button>
      </div>
    </div>
  )
}
