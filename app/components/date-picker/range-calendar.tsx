'use client'

import type { DateValue } from '@internationalized/date'
import {
  RangeCalendar as AriaRangeCalendar,
  CalendarGrid,
  CalendarCell,
  Button,
} from 'react-aria-components'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export interface RangeCalendarProps {
  focusedValue?: DateValue | null
  onFocusChange?: (value: DateValue | null) => void
  visibleDuration?: { months?: number }
  className?: string
}

function formatVisibleRange(start: DateValue, end: DateValue): string {
  const startStr = `${MONTH_NAMES[start.month - 1]} ${start.year}`
  const endStr = `${MONTH_NAMES[end.month - 1]} ${end.year}`
  return startStr === endStr ? startStr : `${startStr} – ${endStr}`
}

export function RangeCalendar({
  focusedValue,
  onFocusChange,
  visibleDuration = { months: 2 },
  className,
  ...rest
}: RangeCalendarProps) {
  return (
    <AriaRangeCalendar
      {...rest}
      focusedValue={focusedValue ?? undefined}
      onFocusChange={onFocusChange}
      visibleDuration={visibleDuration}
      className={className ?? 'dashboard-range-calendar p-4'}
    >
      {({ state }) => (
        <>
          <div className="flex items-center justify-between gap-2 pb-4">
            <Button
              slot="previous"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 outline-none hover:bg-gray-100 focus:ring-2 focus:ring-accent-500 disabled:opacity-40"
              aria-label="Previous month"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1 text-center text-sm font-medium text-gray-800">
              {formatVisibleRange(state.visibleRange.start, state.visibleRange.end)}
            </div>
            <Button
              slot="next"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 outline-none hover:bg-gray-100 focus:ring-2 focus:ring-accent-500 disabled:opacity-40"
              aria-label="Next month"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex gap-6">
            <CalendarGrid className="border-collapse" weekdayStyle="short">
              {(date) => (
                <CalendarCell
                  date={date}
                  className={({ isSelected, isSelectionStart, isSelectionEnd, isToday, isOutsideMonth }) =>
                    [
                      'flex h-9 w-9 items-center justify-center rounded-full text-sm outline-none',
                      'focus:ring-2 focus:ring-accent-500 focus:ring-offset-1',
                      isOutsideMonth && 'text-gray-300',
                      !isOutsideMonth && 'text-gray-700',
                      isToday && !isSelected && 'font-semibold ring-1 ring-accent-500',
                      (isSelectionStart || isSelectionEnd) && 'bg-accent-500 text-white',
                      isSelected && !isSelectionStart && !isSelectionEnd && 'bg-accent-100 text-accent-700',
                    ].filter(Boolean).join(' ')
                  }
                />
              )}
            </CalendarGrid>
            <CalendarGrid offset={{ months: 1 }} className="border-collapse" weekdayStyle="short">
              {(date) => (
                <CalendarCell
                  date={date}
                  className={({ isSelected, isSelectionStart, isSelectionEnd, isToday, isOutsideMonth }) =>
                    [
                      'flex h-9 w-9 items-center justify-center rounded-full text-sm outline-none',
                      'focus:ring-2 focus:ring-accent-500 focus:ring-offset-1',
                      isOutsideMonth && 'text-gray-300',
                      !isOutsideMonth && 'text-gray-700',
                      isToday && !isSelected && 'font-semibold ring-1 ring-accent-500',
                      (isSelectionStart || isSelectionEnd) && 'bg-accent-500 text-white',
                      isSelected && !isSelectionStart && !isSelectionEnd && 'bg-accent-100 text-accent-700',
                    ].filter(Boolean).join(' ')
                  }
                />
              )}
            </CalendarGrid>
          </div>
        </>
      )}
    </AriaRangeCalendar>
  )
}
