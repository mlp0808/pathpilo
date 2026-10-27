'use client'

import { getCountryRule, type LocalityField } from '../config/countryRules'

/** Postal code / city / state inputs in the order and wording of the given country. */
export default function LocalityInputs({
  countryCode,
  zip,
  city,
  state,
  onChange,
  idPrefix,
  inputClassName,
  labelClassName,
  cityLabel,
  cityPlaceholder,
  zipPlaceholder,
}: {
  countryCode?: string | null
  zip: string
  city: string
  state?: string
  onChange: (field: LocalityField, value: string) => void
  idPrefix: string
  inputClassName: string
  labelClassName: string
  cityLabel?: string
  cityPlaceholder?: string
  zipPlaceholder?: string
}) {
  const rule = getCountryRule(countryCode)
  const fields = rule.address.order

  return (
    <div className={`grid gap-4 ${fields.length === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
      {fields.map((field) => {
        const id = `${idPrefix}_${field}`
        if (field === 'state') {
          return (
            <div key={field}>
              <label htmlFor={id} className={labelClassName}>{rule.address.stateLabel || 'State'}</label>
              <select
                id={id}
                value={state || ''}
                onChange={(e) => onChange('state', e.target.value)}
                className={inputClassName}
              >
                <option value="">Select…</option>
                {rule.address.states?.map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
            </div>
          )
        }
        const isZip = field === 'zip'
        return (
          <div key={field} className={fields.length === 3 && !isZip ? 'col-span-2 sm:col-span-1' : ''}>
            <label htmlFor={id} className={labelClassName}>
              {isZip ? rule.address.postalLabel : cityLabel || rule.address.cityLabel}
            </label>
            <input
              type="text"
              id={id}
              value={isZip ? zip : city}
              onChange={(e) => onChange(field, e.target.value)}
              className={inputClassName}
              placeholder={
                isZip
                  ? zipPlaceholder || `e.g. ${rule.address.postalPlaceholder}`
                  : cityPlaceholder || `e.g. ${rule.address.cityPlaceholder}`
              }
            />
          </div>
        )
      })}
    </div>
  )
}
