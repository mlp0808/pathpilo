'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/solid'
import { INDUSTRY_GROUPS, industryLabel } from '@/app/config/companyOnboarding'
import { setupFieldInputClass } from './SetupWizardLayout'

/** Searchable, grouped industry picker used by the company onboarding step. */
export default function IndustrySelect({
  value,
  onChange,
  id = 'industry',
  placeholder = 'Select your industry…',
  invalid = false,
}: {
  value: string
  onChange: (industryId: string) => void
  id?: string
  placeholder?: string
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return INDUSTRY_GROUPS
    return INDUSTRY_GROUPS.map((g) => ({
      ...g,
      options: g.options.filter((o) => o.label.toLowerCase().includes(q)),
    })).filter((g) => g.options.length > 0)
  }, [query])

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const select = (industryId: string) => {
    onChange(industryId)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        id={id}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          setupFieldInputClass,
          'flex items-center justify-between gap-2 text-left',
          invalid ? 'border-red-300' : '',
          value ? '' : 'text-gray-400',
        ].join(' ')}
      >
        <span className="truncate">{value ? industryLabel(value) : placeholder}</span>
        <ChevronDownIcon
          className={`h-4 w-4 flex-none text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="border-b border-gray-100 p-2">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search industries…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/15"
            />
          </div>

          <div className="max-h-[280px] overflow-y-auto py-1" role="listbox">
            {groups.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No industries match that search.</p>
            )}
            {groups.map((group) => (
              <div key={group.label}>
                <h5 className="px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  {group.label}
                </h5>
                {group.options.map((option) => {
                  const isSelected = option.id === value
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => select(option.id)}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <CheckIcon
                        className={`h-4 w-4 flex-none text-accent-500 ${isSelected ? '' : 'invisible'}`}
                      />
                      <span className="truncate">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
