'use client'

import { useDateField, useLocale } from 'react-aria-components'
import { useDateFieldState } from 'react-stately'
import { createCalendar, getLocalTimeZone } from '@internationalized/date'
import { useRef } from 'react'

export function DateInput(props: any) {
  const { locale } = useLocale()
  const state = useDateFieldState({
    ...props,
    locale,
    createCalendar
  })
  const ref = useRef<HTMLDivElement>(null)
  const { fieldProps, inputProps } = useDateField(props, state, ref)

  return (
    <div {...fieldProps} ref={ref} className="flex items-center">
      <input
        {...inputProps}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
      />
    </div>
  )
}
