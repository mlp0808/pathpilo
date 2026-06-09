'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

/**
 * Frosted glass chrome for route planner controls floating over the map.
 * Matches the desktop week picker: milky white + blur + soft border.
 */
export const ROUTE_MAP_GLASS_PILL =
  'bg-white/96 backdrop-blur-md backdrop-saturate-150 border border-white/60 shadow-xl shadow-black/[0.12]'
export const ROUTE_MAP_GLASS_PANEL =
  'bg-white/96 backdrop-blur-md backdrop-saturate-150 border border-white/60 shadow-xl shadow-black/[0.12]'

/** Inline fallback — mobile Safari needs explicit webkit backdrop-filter. */
export const ROUTE_MAP_GLASS_STYLE = {
  WebkitBackdropFilter: 'blur(12px) saturate(1.5)',
  backdropFilter: 'blur(12px) saturate(1.5)',
} as const

export interface RouteSearchClient {
  id: number
  client_type?: 'person' | 'company'
  name: string
  last_name?: string | null
  address?: string | null
  zip_code?: string | null
  city?: string | null
  lat?: number | null
  lng?: number | null
}

export interface RouteLocationPick {
  name?: string
  address: string
  zip_code: string
  city: string
  lat?: number | null
  lng?: number | null
}

interface LocationSuggestion {
  address: string
  zip_code: string
  city: string
  lat: number
  lng: number
  display: string
}

function clientDisplayName(c: RouteSearchClient) {
  const name = (c.name || '').trim()
  const last = (c.last_name || '').trim()
  if (c.client_type === 'person' && last) return `${name} ${last}`
  return name
}

function clientSubtitle(c: RouteSearchClient) {
  const street = (c.address || '').trim()
  const locality = [c.zip_code, c.city].filter(Boolean).join(' ').trim()
  if (street && locality) return `${street}, ${locality}`
  return street || locality
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Unified "add a job" search used on the route planner. Searches the company's
 * saved clients AND map locations in one field. Picking a saved client starts a
 * job for them; picking a location starts a job with that address prefilled.
 */
export default function RouteAddSearch({
  clients,
  countryCode,
  accentColor = '#3DD57A',
  placeholder = 'Add a job — search client or address',
  appearance = 'solid',
  onFocus,
  onPickClient,
  onPickLocation,
}: {
  clients: RouteSearchClient[]
  countryCode?: string
  accentColor?: string
  placeholder?: string
  /** `glass` — frosted overlay for mobile map header */
  appearance?: 'solid' | 'glass'
  onFocus?: () => void
  onPickClient: (clientId: number) => void
  onPickLocation: (data: RouteLocationPick) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [locations, setLocations] = useState<LocationSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const q = query.trim().toLowerCase()
  const clientMatches = q.length === 0
    ? []
    : clients
        .filter(c => {
          const hay = [
            clientDisplayName(c),
            c.address,
            c.city,
            c.zip_code,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          return hay.includes(q)
        })
        .slice(0, 4)

  const fetchLocations = useCallback(
    async (text: string) => {
      if (!text.trim() || text.trim().length < 3 || !MAPBOX_TOKEN) {
        setLocations([])
        return
      }
      setLoading(true)
      try {
        const encoded = encodeURIComponent(text)
        const cc = String(countryCode || '').trim().toLowerCase()
        const countryParam = cc.length === 2 ? `&country=${encodeURIComponent(cc)}` : ''
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&types=address&limit=5${countryParam}`,
        )
        const data = await res.json()
        const results: LocationSuggestion[] = (data.features || []).map(
          (f: {
            place_name?: string
            text?: string
            center: [number, number]
            context?: Array<{ id: string; text: string }>
          }) => {
            const postcode = f.context?.find(c => c.id?.startsWith('postcode'))?.text || ''
            const place = f.context?.find(c => c.id?.startsWith('place'))?.text || ''
            const street = f.place_name?.split(',')[0]?.trim() || f.text || ''
            return {
              address: street,
              zip_code: postcode,
              city: place,
              lat: f.center[1],
              lng: f.center[0],
              display: f.place_name || street,
            }
          },
        )
        setLocations(results)
      } catch {
        setLocations([])
      } finally {
        setLoading(false)
      }
    },
    [countryCode],
  )

  const handleChange = (val: string) => {
    setQuery(val)
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchLocations(val), 350)
  }

  const reset = () => {
    setQuery('')
    setLocations([])
    setOpen(false)
    inputRef.current?.blur()
  }

  const pickClient = (id: number) => {
    onPickClient(id)
    reset()
  }
  const pickLocation = (loc: LocationSuggestion) => {
    onPickLocation({
      address: loc.address,
      zip_code: loc.zip_code,
      city: loc.city,
      lat: loc.lat,
      lng: loc.lng,
    })
    reset()
  }

  // Close on outside click
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  const showPanel = open && q.length > 0
  const hasResults = clientMatches.length > 0 || locations.length > 0
  const isGlass = appearance === 'glass'

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* Search field */}
      <div
        className={`flex items-center gap-2.5 rounded-full px-4 h-12 transition-all duration-200 ${
          isGlass ? ROUTE_MAP_GLASS_PILL : 'bg-white'
        } ${isGlass && showPanel ? 'ring-1 ring-white/70' : ''}`}
        style={
          isGlass
            ? ROUTE_MAP_GLASS_STYLE
            : {
                boxShadow: showPanel
                  ? '0 8px 30px rgba(15,30,22,0.18)'
                  : '0 4px 18px rgba(15,30,22,0.12)',
              }
        }
      >
        <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => {
            onFocus?.()
            if (query.length > 0) setOpen(true)
          }}
          placeholder={placeholder}
          className={`flex-1 min-w-0 bg-transparent text-[15px] outline-none ${
            isGlass ? 'text-gray-900 placeholder:text-gray-500/90' : 'text-gray-900 placeholder-gray-400'
          }`}
        />
        {query.length > 0 ? (
          <button
            type="button"
            onClick={reset}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Clear"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <div
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: accentColor }}
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {showPanel && (
        <div
          className={`absolute left-0 right-0 mt-2 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 ${
            isGlass ? ROUTE_MAP_GLASS_PANEL : 'bg-white'
          }`}
          style={isGlass ? ROUTE_MAP_GLASS_STYLE : { boxShadow: '0 12px 40px rgba(15,30,22,0.22)' }}
        >
          <div className="max-h-[50vh] overflow-y-auto py-1.5">
            {/* Saved clients */}
            {clientMatches.map(c => {
              const name = clientDisplayName(c)
              const sub = clientSubtitle(c)
              return (
                <button
                  key={`client-${c.id}`}
                  type="button"
                  onClick={() => pickClient(c.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                    isGlass ? 'hover:bg-white/55 active:bg-white/70' : 'hover:bg-gray-50'
                  }`}
                >
                  <div
                    className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-bold"
                    style={{ background: accentColor }}
                  >
                    {initials(name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[14px] font-semibold text-gray-900 truncate">{name}</p>
                      <span
                        className="flex-shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                        style={{ background: `${accentColor}1f`, color: '#15803d' }}
                      >
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        Saved
                      </span>
                    </div>
                    {sub && <p className="text-[12px] text-gray-400 truncate mt-0.5">{sub}</p>}
                  </div>
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )
            })}

            {/* Separator label when both groups present */}
            {clientMatches.length > 0 && locations.length > 0 && (
              <div className="px-4 pt-2 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-300">New location</span>
              </div>
            )}

            {/* Map locations */}
            {locations.map((loc, i) => (
              <button
                key={`loc-${i}`}
                type="button"
                onClick={() => pickLocation(loc)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                  isGlass ? 'hover:bg-white/55 active:bg-white/70' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-gray-900 truncate">{loc.address}</p>
                  {(loc.zip_code || loc.city) && (
                    <p className="text-[12px] text-gray-400 truncate mt-0.5">
                      {[loc.zip_code, loc.city].filter(Boolean).join(' ')}
                    </p>
                  )}
                </div>
                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}

            {/* Empty / loading states */}
            {!hasResults && (
              <div className="px-4 py-6 text-center">
                {loading ? (
                  <span className="inline-flex items-center gap-2 text-[13px] text-gray-400">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Searching…
                  </span>
                ) : (
                  <p className="text-[13px] text-gray-400">Keep typing to find a client or address</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
