'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarDaysIcon } from '@heroicons/react/24/outline'
import { buildPeriod, customPeriod, type Period, type PeriodId } from './period'

const PRESETS: Array<{ id: Exclude<PeriodId, 'custom'>; label: string }> = [
  { id: 'month', label: 'This month' },
  { id: 'ytd', label: 'Year to date' },
  { id: 'year12', label: '12 months' },
]

/**
 * A segmented control rather than a dropdown: on a phone the choice stays one
 * tap away, and the active period is readable without opening anything.
 */
export default function PeriodSelector({
  period,
  onChange,
  className = '',
}: {
  period: Period
  onChange: (period: Period) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [from, setFrom] = useState(period.from)
  const [to, setTo] = useState(period.to)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setFrom(period.from)
    setTo(period.to)
  }, [period.from, period.to])

  useEffect(() => {
    if (!editing) return
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setEditing(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [editing])

  const applyCustom = () => {
    if (!from || !to || from > to) return
    onChange(customPeriod(from, to))
    setEditing(false)
  }

  const segment = (active: boolean) =>
    `inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all sm:flex-none ${
      active ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-900/5' : 'text-gray-500 hover:text-gray-900'
    }`

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="flex w-full rounded-xl bg-gray-100 p-1 sm:inline-flex sm:w-auto">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => {
              setEditing(false)
              onChange(buildPeriod(preset.id))
            }}
            className={segment(period.id === preset.id)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className={segment(period.id === 'custom')}
          aria-expanded={editing}
          aria-label="Pick your own dates"
        >
          <CalendarDaysIcon className="h-3.5 w-3.5" />
          <span className={period.id === 'custom' ? '' : 'hidden sm:inline'}>
            {period.id === 'custom' ? period.short : 'Custom'}
          </span>
        </button>
      </div>

      {editing && (
        <div className="absolute right-0 top-full z-30 mt-2 w-full rounded-2xl border border-gray-200 bg-white p-3 shadow-xl sm:w-[320px]">
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="mb-1 block text-[11px] font-semibold text-gray-500">From</span>
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-accent-400"
              />
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-[11px] font-semibold text-gray-500">To</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-accent-400"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyCustom}
              disabled={!from || !to || from > to}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
            >
              Show
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
