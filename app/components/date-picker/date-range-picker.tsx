'use client'

import { DateRangePicker as AriaDateRangePicker } from 'react-aria-components'
import { DateInput } from './date-input'
import { RangeCalendar } from './range-calendar'
import { Dialog, DialogTrigger, Popover } from 'react-aria-components'
import { CalendarIcon } from '@heroicons/react/24/outline'

export function DateRangePicker(props: any) {
  return (
    <AriaDateRangePicker {...props}>
      <DialogTrigger>
        <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-500 bg-white">
          <CalendarIcon className="w-5 h-5 text-gray-500" />
          <div className="flex items-center gap-2">
            <DateInput slot="start" className="w-32" />
            <span className="text-gray-400">–</span>
            <DateInput slot="end" className="w-32" />
          </div>
        </button>
        <Popover className="w-auto">
          <Dialog>
            <RangeCalendar />
          </Dialog>
        </Popover>
      </DialogTrigger>
    </AriaDateRangePicker>
  )
}
