'use client'

import { useMemo } from 'react'
import SearchableSelect, { type SearchableGroup } from '@/app/components/ui/SearchableSelect'
import {
  SUPPORTED_COUNTRIES,
  countryMatchesQuery,
  countryRules,
  type CountryRule,
} from '@/app/config/countryRules'

/** Business-country picker: searchable, with the detected country offered first. */
export default function CountrySelect({
  value,
  onChange,
  invalid = false,
  suggestedCountryCode = null,
}: {
  value: string
  onChange: (countryCode: string) => void
  invalid?: boolean
  /** Guessed from the visitor's location; pinned above the full list. */
  suggestedCountryCode?: string | null
}) {
  const groups = useMemo((): SearchableGroup[] => {
    const suggested = suggestedCountryCode ? countryRules[suggestedCountryCode.toUpperCase()] : null
    const rest = SUPPORTED_COUNTRIES.filter((c) => c.countryCode !== suggested?.countryCode)
    const out: SearchableGroup[] = []
    if (suggested) {
      out.push({ label: 'Suggested', options: [toOption(suggested)] })
    }
    out.push({
      label: suggested ? 'All countries' : undefined,
      options: rest.map(toOption),
    })
    return out
  }, [suggestedCountryCode])

  return (
    <SearchableSelect
      value={value}
      groups={groups}
      onChange={onChange}
      invalid={invalid}
      ariaLabel="Business country"
      placeholder="Choose your country"
      searchPlaceholder="Search countries…"
      emptyLabel="No country matches that search"
      matches={(option, query) => {
        const rule = countryRules[option.value]
        return rule ? countryMatchesQuery(rule, query) : true
      }}
    />
  )
}

function toOption(rule: CountryRule) {
  return {
    value: rule.countryCode,
    label: rule.countryName,
    prefix: rule.flag,
    keywords: [rule.countryCode, ...rule.aliases],
  }
}
