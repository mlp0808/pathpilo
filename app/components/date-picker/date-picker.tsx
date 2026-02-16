'use client'

import { DatePicker as AriaDatePicker } from 'react-aria-components'
import { DateInput } from './date-input'
import { Calendar } from './calendar'
import { Dialog, DialogTrigger, Popover } from 'react-aria-components'
import { CalendarIcon } from '@heroicons/react/24/outline'

export function DatePicker(props: any) {
  return (
    <AriaDatePicker {...props}>
      <DialogTrigger>
        <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-500">
          <CalendarIcon className="w-5 h-5 text-gray-500" />
          <DateInput />
        </button>
        <Popover className="w-auto">
          <Dialog>
            <Calendar />
          </Dialog>
        </Popover>
      </DialogTrigger>
    </AriaDatePicker>
  )
}
