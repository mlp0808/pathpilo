'use client'

import { CheckCircleIcon } from '@heroicons/react/24/solid'
import { SUPPORTED_COUNTRIES } from '@/app/config/countryRules'

/** Business-country picker for the company onboarding step. */
export default function CountrySelect({
  value,
  onChange,
  invalid = false,
}: {
  value: string
  onChange: (countryCode: string) => void
  invalid?: boolean
}) {
  return (
    <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {SUPPORTED_COUNTRIES.map((country) => {
        const selected = country.countryCode === value
        return (
          <button
            key={country.countryCode}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(country.countryCode)}
            className={[
              'relative flex items-center gap-2.5 rounded-xl border bg-white px-3.5 py-3 text-left text-sm transition-all',
              selected
                ? 'border-accent-500 ring-2 ring-accent-500/15 font-medium text-gray-900'
                : invalid
                  ? 'border-red-300 text-gray-700 hover:border-red-400'
                  : 'border-gray-200/90 text-gray-700 hover:border-gray-300',
            ].join(' ')}
          >
            <span className="text-lg leading-none" aria-hidden>{country.flag}</span>
            <span className="truncate">{country.countryName}</span>
            {selected && <CheckCircleIcon className="ml-auto h-4 w-4 flex-none text-accent-500" />}
          </button>
        )
      })}
    </div>
  )
}
