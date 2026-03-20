'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { MapPinIcon } from '@heroicons/react/24/outline'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

interface AddressSuggestion {
  address: string
  zip_code: string
  city: string
  lat: number
  lng: number
  display: string
}

export interface AddressData {
  address: string
  zip_code: string
  city: string
  lat?: number | null
  lng?: number | null
}

interface AddressAutocompleteProps {
  address: string
  zip_code: string
  city: string
  lat?: number | null
  lng?: number | null
  onChange: (data: AddressData) => void
  inputClassName?: string
  label?: string
  placeholder?: string
}

export default function AddressAutocomplete({
  address,
  zip_code,
  city,
  lat,
  lng,
  onChange,
  inputClassName,
  label = 'Address',
  placeholder = 'Start typing an address...',
}: AddressAutocompleteProps) {
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

  // Sync query when address prop changes externally
  useEffect(() => {
    setQuery(address || '')
  }, [address])

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
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&types=address&limit=5`
      )
      const data = await res.json()
      const results: AddressSuggestion[] = (data.features || []).map((f: {
        place_name?: string
        text?: string
        address?: string
        center: [number, number]
        context?: Array<{ id: string; text: string }>
      }) => {
        const postcode = f.context?.find(c => c.id?.startsWith('postcode'))?.text || ''
        const place = f.context?.find(c => c.id?.startsWith('place'))?.text || ''
        const streetAddress = f.place_name?.split(',')[0]?.trim() || f.text || ''
        return {
          address: streetAddress,
          zip_code: postcode,
          city: place,
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
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    onChange({ address: val, zip_code, city, lat, lng })
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 400)
  }

  const handleSelect = (result: AddressSuggestion) => {
    setQuery(result.address)
    setSuggestions([])
    setIsOpen(false)
    onChange({
      address: result.address,
      zip_code: result.zip_code,
      city: result.city,
      lat: result.lat,
      lng: result.lng,
    })
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

      {/* Zip + City row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Zip code</label>
          <input
            type="text"
            value={zip_code}
            onChange={(e) =>
              onChange({ address, zip_code: e.target.value, city, lat, lng })
            }
            autoComplete="off"
            placeholder="e.g. 2100"
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">City</label>
          <input
            type="text"
            value={city}
            onChange={(e) =>
              onChange({ address, zip_code, city: e.target.value, lat, lng })
            }
            autoComplete="off"
            placeholder="e.g. Copenhagen"
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
          />
        </div>
      </div>

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
