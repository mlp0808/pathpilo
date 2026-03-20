'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

interface Suggestion {
  display: string   // full place_name used as the stored value
  secondary: string // city / country context
}

interface Props {
  value: string
  onChange: (fullAddress: string) => void
  placeholder?: string
  className?: string
  label?: string
  dotColor?: string  // small colored dot shown before the label
}

export default function AddressSearchInput({
  value,
  onChange,
  placeholder = 'Search for an address…',
  className,
  label,
  dotColor,
}: Props) {
  const [query, setQuery] = useState(value || '')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })
  const [mounted, setMounted] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setMounted(true) }, [])

  // Keep local query in sync if parent resets the value
  useEffect(() => { setQuery(value || '') }, [value])

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
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&types=address,place&limit=6`
      )
      const data = await res.json()
      const results: Suggestion[] = (data.features || []).map((f: {
        place_name?: string
        text?: string
        context?: Array<{ id: string; text: string }>
      }) => {
        const parts = (f.place_name || '').split(',')
        const primary = parts[0]?.trim() || ''
        const secondary = parts.slice(1).join(',').trim()
        return { display: f.place_name || primary, secondary }
      })
      setSuggestions(results)
      setIsOpen(results.length > 0)
    } catch {
      setSuggestions([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    onChange(val)   // keep parent in sync with typed text too
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 350)
  }

  const handleSelect = (s: Suggestion) => {
    setQuery(s.display)
    onChange(s.display)
    setSuggestions([])
    setIsOpen(false)
  }

  const handleFocus = () => {
    updateDropdownPos()
    if (suggestions.length > 0) setIsOpen(true)
  }

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (!inputRef.current?.contains(t) && !dropdownRef.current?.contains(t)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  const baseInput =
    'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none transition-colors pr-8'

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          <span className="inline-flex items-center gap-1.5">
            {dotColor && <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: dotColor }} />}
            {label}
          </span>
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          onClick={() => { updateDropdownPos(); if (suggestions.length > 0) setIsOpen(true) }}
          autoComplete="off"
          placeholder={placeholder}
          className={className || baseInput}
        />

        {/* Loading spinner */}
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <div className="w-3.5 h-3.5 border-2 border-accent-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Confirmed indicator (non-empty, not loading) */}
        {!isLoading && query && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <div className="w-2 h-2 bg-accent-400 rounded-full" />
          </div>
        )}
      </div>

      {/* Suggestions dropdown — rendered in a portal to escape overflow:hidden parents */}
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
                onMouseDown={e => { e.preventDefault(); handleSelect(s) }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 flex items-start gap-3"
              >
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-gray-800 font-medium truncate">{s.display.split(',')[0]}</p>
                  {s.secondary && (
                    <p className="text-gray-400 text-xs truncate mt-0.5">{s.secondary}</p>
                  )}
                </div>
              </button>
            ))}
          </div>,
          document.body
        )
      }
    </div>
  )
}
