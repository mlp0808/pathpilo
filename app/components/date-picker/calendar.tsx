'use client'

import { useCalendar, useLocale, useCalendarCell, useCalendarGrid } from 'react-aria-components'
import { getLocalTimeZone, today, CalendarDate, isSameDay } from '@internationalized/date'
import { useCalendarState } from 'react-stately'
import type { CalendarProps } from 'react-aria-components'

interface CalendarComponentProps extends CalendarProps {
  focusedValue?: CalendarDate | null
  onFocusChange?: (date: CalendarDate | null) => void
}

export function Calendar(props: CalendarComponentProps) {
  const { locale } = useLocale()
  const state = useCalendarState({
    ...props,
    locale,
    createCalendar: (locale) => {
      const { createCalendar } = require('@internationalized/date')
      return createCalendar(locale)
    }
  })

  const { calendarProps, prevButtonProps, nextButtonProps, title } = useCalendar(props, state)
  const { gridProps, headerDays } = useCalendarGrid({ weekdayStyle: 'short' }, state)

  return (
    <div {...calendarProps} className="p-4">
      <div className="flex items-center justify-between mb-4">
        <button
          {...prevButtonProps}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          type="button"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <button
          {...nextButtonProps}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          type="button"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <table {...gridProps} className="w-full">
        <thead>
          <tr>
            {headerDays.map((day, index) => (
              <th key={index} className="text-xs font-medium text-gray-500 pb-2">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state.weeksInMonth.map((week, weekIndex) => (
            <tr key={weekIndex}>
              {week.map((date, i) => (
                <CalendarCell key={i} state={state} date={date} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CalendarCell({ state, date }: { state: any; date: CalendarDate }) {
  const { cellProps, buttonProps, isSelected, isOutsideVisibleRange, isDisabled, formattedDate } = useCalendarCell(
    { date },
    state
  )

  const isToday = isSameDay(date, today(getLocalTimeZone()))

  return (
    <td {...cellProps} className="p-0.5">
      <div
        {...buttonProps}
        className={`
          w-10 h-10 flex items-center justify-center rounded-lg text-sm font-medium transition-colors
          ${isSelected ? 'bg-accent-500 text-white' : ''}
          ${isToday && !isSelected ? 'bg-accent-100 text-accent-600 font-semibold' : ''}
          ${!isSelected && !isToday ? 'text-gray-900 hover:bg-gray-100' : ''}
          ${isOutsideVisibleRange ? 'text-gray-300' : ''}
          ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {formattedDate}
      </div>
    </td>
  )
}
