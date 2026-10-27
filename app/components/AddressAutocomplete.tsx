'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { MapPinIcon } from '@heroicons/react/24/outline'
import { formatAddressLine, getCountryRule, type LocalityField } from '../config/countryRules'
import { getStoredCompanyCountryCode } from '../utils/companyCountry'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

interface AddressSuggestion {
  address: string
  zip_code: string
  city: string
  state: string
  lat: number
  lng: number
  display: string
}

export interface AddressData {
  address: string
  zip_code: string
  city: string
  /** State code for countries whose addresses use one (US); '' elsewhere. */
  state?: string
  lat?: number | null
  lng?: number | null
}

interface AddressAutocompleteProps {
  address: string
  zip_code: string
  city: string
  state?: string
  lat?: number | null
  lng?: number | null
  onChange: (data: AddressData) => void
  inputClassName?: string
  label?: string
  placeholder?: string
  countryCode?: string
  zipLabel?: string
  cityLabel?: string
  /** Hide zip/city inputs — values still populate from autocomplete selection. */
  hidePostalFields?: boolean
}

type MapboxContext = { id: string; text: string; short_code?: string }

/** "US-CA" -> "CA"; only for countries that list states. */
function stateFromContext(context: MapboxContext[] | undefined, countryCode: string): string {
  const states = getCountryRule(countryCode).address.states
  if (!states) return ''
  const region = context?.find((c) => c.id?.startsWith('region'))
  if (!region) return ''
  const code = String(region.short_code || '').split('-').pop()?.toUpperCase() || ''
  if (states.some(([c]) => c === code)) return code
  return states.find(([, name]) => name.toLowerCase() === region.text.toLowerCase())?.[0] || ''
}

export default function AddressAutocomplete({
  address,
  zip_code,
  city,
  state = '',
  lat,
  lng,
  onChange,
  inputClassName,
  label = 'Address',
  placeholder = 'Start typing an address...',
  countryCode,
  zipLabel,
  cityLabel,
  hidePostalFields = false,
}: AddressAutocompleteProps) {
  const [storedCountry, setStoredCountry] = useState('')
  useEffect(() => {
    if (!countryCode) setStoredCountry(getStoredCompanyCountryCode())
  }, [countryCode])
  const effectiveCountry = String(countryCode || storedCountry || '').toUpperCase()
  const rule = getCountryRule(effectiveCountry)
  const formatFullAddress = (street: string, zip: string, town: string, region = '') =>
    formatAddressLine({ address: street, zip, city: town, state: region }, rule.countryCode)
  const [query, setQuery] = useState(address || '')
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Sync visible input when parent state changes (e.g. after picking a suggestion).
  useEffect(() => {
    if (hidePostalFields && lat != null && lng != null) {
      const formatted = formatFullAddress(address, zip_code, city, state)
      if (formatted) setQuery(formatted)
      return
    }
    if (!hidePostalFields) {
      setQuery(address || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, zip_code, city, state, lat, lng, hidePostalFields, rule.countryCode])

  const updateDropdownPos = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      })
    }
  }

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 3 || !MAPBOX_TOKEN) {
      setSuggestions([])
      setIsOpen(false)
      return
    }
    setIsLoading(true)
    try {
      const encoded = encodeURIComponent(q)
      const countryParam = effectiveCountry.length === 2 ? `&country=${effectiveCountry.toLowerCase()}` : ''
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&types=address&limit=5${countryParam}`
      )
      const data = await res.json()
      const results: AddressSuggestion[] = (data.features || []).map((f: {
        place_name?: string
        text?: string
        address?: string
        center: [number, number]
        context?: MapboxContext[]
      }) => {
        const postcode = f.context?.find(c => c.id?.startsWith('postcode'))?.text || ''
        const place = f.context?.find(c => c.id?.startsWith('place'))?.text || ''
        const streetAddress = f.place_name?.split(',')[0]?.trim() || f.text || ''
        return {
          address: streetAddress,
          zip_code: postcode,
          city: place,
          state: stateFromContext(f.context, effectiveCountry),
          lat: f.center[1],
          lng: f.center[0],
          display: f.place_name || streetAddress,
        }
      })
      setSuggestions(results)
      setIsOpen(results.length > 0)
    } catch {
      setSuggestions([])
    } finally {
      setIsLoading(false)
    }
  }, [effectiveCountry])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (hidePostalFields) {
      onChange({ address: val, zip_code: '', city: '', state: '', lat: null, lng: null })
    } else {
      onChange({ address: val, zip_code, city, state, lat, lng })
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 400)
  }

  const handleSelect = (result: AddressSuggestion) => {
    const displayValue = hidePostalFields
      ? (result.display || formatFullAddress(result.address, result.zip_code, result.city, result.state))
      : result.address
    setQuery(displayValue)
    setSuggestions([])
    setIsOpen(false)
    onChange({
      address: result.address,
      zip_code: result.zip_code,
      city: result.city,
      state: result.state,
      lat: result.lat,
      lng: result.lng,
    })
  }

  const setField = (field: LocalityField, value: string) => {
    onChange({
      address,
      zip_code: field === 'zip' ? value : zip_code,
      city: field === 'city' ? value : city,
      state: field === 'state' ? value : state,
      lat,
      lng,
    })
  }

  const smallInputCls =
    'w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400'
  const localityFields = rule.address.order
  const localityGridCls = localityFields.length === 3 ? 'grid grid-cols-2 gap-3 sm:grid-cols-[1.4fr_1fr_0.9fr]' : 'grid grid-cols-2 gap-3'

  const renderLocalityField = (field: LocalityField) => {
    if (field === 'state') {
      return (
        <div key={field} className={localityFields.length === 3 ? 'col-span-1' : ''}>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">{rule.address.stateLabel || 'State'}</label>
          <select
            value={state}
            onChange={(e) => setField('state', e.target.value)}
            className={`${smallInputCls} ${state ? 'text-gray-900' : 'text-gray-400'}`}
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
      <div key={field} className={localityFields.length === 3 && field === 'city' ? 'col-span-2 sm:col-span-1' : ''}>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">
          {isZip ? zipLabel || rule.address.postalLabel : cityLabel || rule.address.cityLabel}
        </label>
        <input
          type="text"
          value={isZip ? zip_code : city}
          onChange={(e) => setField(field, e.target.value)}
          autoComplete="off"
          placeholder={`e.g. ${isZip ? rule.address.postalPlaceholder : rule.address.cityPlaceholder}`}
          className={smallInputCls}
        />
      </div>
    )
  }

  const handleFocus = () => {
    updateDropdownPos()
    if (suggestions.length > 0) setIsOpen(true)
  }

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (!inputRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const defaultInputCls =
    'w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400'

  return (
    <div className="space-y-3">
      <div className="group">
        {label && (
          <label className="block text-sm font-medium text-gray-900 mb-2 flex items-center gap-1.5">
            <MapPinIcon className="w-3.5 h-3.5 text-gray-400" />
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onClick={() => { updateDropdownPos(); if (suggestions.length > 0) setIsOpen(true) }}
            autoComplete="off"
            placeholder={placeholder}
            className={inputClassName || defaultInputCls}
          />
          {isLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {lat && lng && !isLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-2 h-2 bg-green-400 rounded-full" title="Location confirmed" />
            </div>
          )}
        </div>
      </div>

      {!hidePostalFields && (
        <div className={localityGridCls}>{localityFields.map(renderLocalityField)}</div>
      )}

      {/* Dropdown portal */}
      {mounted && isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'absolute',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              zIndex: 99999,
            }}
            className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
          >
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(s) }}
                className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 flex items-start gap-3"
              >
                <MapPinIcon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <span className="text-gray-700">{s.display}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}
