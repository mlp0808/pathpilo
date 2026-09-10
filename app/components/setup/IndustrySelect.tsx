'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/solid'
import { INDUSTRIES, industryLabel } from '@/app/config/companyOnboarding'
import { setupFieldInputClass } from './SetupWizardLayout'

/** Industry picker for the company onboarding step. */
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
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
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
        <div
          role="listbox"
          className="absolute z-30 mt-2 max-h-[300px] w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl"
        >
          {INDUSTRIES.map((industry) => {
            const isSelected = industry.id === value
            return (
              <button
                key={industry.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => select(industry.id)}
                className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-gray-50 ${
                  isSelected ? 'font-medium text-accent-700' : 'text-gray-700'
                }`}
              >
                <CheckIcon
                  className={`h-4 w-4 flex-none text-accent-500 ${isSelected ? '' : 'invisible'}`}
                />
                <span className="truncate">{industry.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
