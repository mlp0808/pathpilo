'use client'

import { useMemo, useState } from 'react'
import { endOfMonth, endOfWeek, getLocalTimeZone, startOfMonth, startOfWeek, today } from '@internationalized/date'
import type { DateValue } from 'react-aria-components'
import {
  DateRangePicker as AriaDateRangePicker,
  useLocale,
  Popover,
  Dialog,
  Button,
  Group,
  DateInput,
  DateSegment,
} from 'react-aria-components'
import { RangeCalendar } from './range-calendar'
import { RangePresetButton } from './range-preset'
import { CalendarIcon } from '@heroicons/react/24/outline'

interface DashboardDateRangePickerProps {
  value: { start: DateValue; end: DateValue } | null
  onChange: (value: { start: DateValue; end: DateValue } | null) => void
}

export function DashboardDateRangePicker({ value, onChange }: DashboardDateRangePickerProps) {
  const { locale } = useLocale()
  const now = today(getLocalTimeZone())
  const [focusedValue, setFocusedValue] = useState<DateValue | null>(null)

  const presets = useMemo(
    () => ({
      today: { label: 'Today', value: { start: now, end: now } },
      yesterday: { label: 'Yesterday', value: { start: now.subtract({ days: 1 }), end: now.subtract({ days: 1 }) } },
      thisWeek: { label: 'This week', value: { start: startOfWeek(now, locale), end: endOfWeek(now, locale) } },
      lastWeek: {
        label: 'Last week',
        value: {
          start: startOfWeek(now, locale).subtract({ weeks: 1 }),
          end: endOfWeek(now, locale).subtract({ weeks: 1 }),
        },
      },
      thisMonth: { label: 'This month', value: { start: startOfMonth(now), end: endOfMonth(now) } },
      lastMonth: {
        label: 'Last month',
        value: {
          start: startOfMonth(now).subtract({ months: 1 }),
          end: endOfMonth(now).subtract({ months: 1 }),
        },
      },
      thisYear: { label: 'This year', value: { start: startOfMonth(now.set({ month: 1 })), end: endOfMonth(now.set({ month: 12 })) } },
      lastYear: {
        label: 'Last year',
        value: {
          start: startOfMonth(now.set({ month: 1 }).subtract({ years: 1 })),
          end: endOfMonth(now.set({ month: 12 }).subtract({ years: 1 })),
        },
      },
      allTime: {
        label: 'All time',
        value: {
          start: now.set({ year: 2000, month: 1, day: 1 }),
          end: now,
        },
      },
    }),
    [locale, now]
  )

  const formatDate = (date: DateValue | null) => {
    if (!date) return ''
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${monthNames[date.month - 1]} ${date.day}, ${date.year}`
  }

  return (
    <AriaDateRangePicker
      aria-label="Range calendar"
      value={value}
      onChange={onChange}
      shouldCloseOnSelect={false}
    >
      <Group className="flex">
        <Button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-500 transition-colors shadow-sm">
          <CalendarIcon className="w-5 h-5 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">
            {value ? `${formatDate(value.start)} – ${formatDate(value.end)}` : 'Select date range'}
          </span>
        </Button>
      </Group>
      <Popover className="w-auto z-50 mt-2" placement="bottom start">
        <Dialog className="flex rounded-2xl bg-white shadow-xl ring-1 ring-gray-200 focus:outline-none overflow-hidden">
          {(opts) => (
            <>
              <div className="hidden w-38 flex-col gap-0.5 border-r border-solid border-gray-200 p-3 lg:flex">
                {Object.values(presets).map((preset) => (
                  <RangePresetButton
                    key={preset.label}
                    value={preset.value}
                    onClick={() => {
                      setFocusedValue(preset.value.start)
                      onChange(preset.value)
                    }}
                  >
                    {preset.label}
                  </RangePresetButton>
                ))}
              </div>
              <div className="flex flex-col min-w-0">
                <RangeCalendar
                  focusedValue={focusedValue}
                  onFocusChange={setFocusedValue}
                  visibleDuration={{ months: 2 }}
                />
                <div className="flex justify-between gap-3 border-t border-gray-200 p-4">
                  <div className="hidden items-center gap-3 md:flex">
                    <DateInput slot="start" className="w-36 min-w-0 flex items-center gap-0.5 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-accent-500">
                      {(segment) => <DateSegment segment={segment} className="inline rounded px-0.5 outline-none placeholder:text-gray-400 focus:bg-accent-100" />}
                    </DateInput>
                    <span className="text-gray-500">–</span>
                    <DateInput slot="end" className="w-36 min-w-0 flex items-center gap-0.5 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-accent-500">
                      {(segment) => <DateSegment segment={segment} className="inline rounded px-0.5 outline-none placeholder:text-gray-400 focus:bg-accent-100" />}
                    </DateInput>
                  </div>
                  <div className="grid w-full grid-cols-2 gap-3 md:flex md:w-auto">
                    <Button
                      onPress={opts.close}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                    >
                      Cancel
                    </Button>
                    <Button
                      onPress={opts.close}
                      className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600"
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </Dialog>
      </Popover>
    </AriaDateRangePicker>
  )
}
