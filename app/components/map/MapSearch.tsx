'use client'

/**
 * Unified search for the map multitool: one box that matches existing clients
 * (by name/address), employees (by name), AND street addresses (Mapbox geocoder,
 * token server-side). Picking a client → Client Context Mode; picking an
 * employee → employee profile card; picking an address → Prospect Mode.
 * While planning a day/route, each result also offers "Add to route" so the
 * admin can open CreateJob without leaving the planner.
 */

import { useEffect, useRef, useState } from 'react'
import { HomeIcon, MagnifyingGlassIcon, MapPinIcon, PlusIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import {
  fetchAllClients,
  fetchGeocodeSuggestions,
  findClientAtPlace,
  parseMapboxFeature,
  type GeocodeFeature,
  type MapClient,
  type MapUser,
} from './useMapData'

export type MapSearchLocation = {
  lat: number
  lng: number
  label: string
  address: string
  zip_code: string
  city: string
}

const EMPTY_USERS: MapUser[] = []

export default function MapSearch({
  users = EMPTY_USERS,
  onPickClient,
  onPickEmployee,
  onPickLocation,
  onAddToRouteClient,
  onAddToRouteLocation,
  placeholder = 'Search clients, employees, or addresses…',
  autoFocus = false,
  initialQuery = '',
  compact = false,
  embedded = false,
}: {
  users?: MapUser[]
  onPickClient: (client: MapClient) => void
  onPickEmployee?: (user: MapUser) => void
  onPickLocation: (loc: MapSearchLocation) => void
  /** When set, each client row shows an "Add to route" action. */
  onAddToRouteClient?: (client: MapClient) => void
  /** When set, each address row shows an "Add to route" action. */
  onAddToRouteLocation?: (loc: MapSearchLocation) => void
  placeholder?: string
  autoFocus?: boolean
  /** Prefill (e.g. a lead's address handed over from the leads page). */
  initialQuery?: string
  /** Tighter bar for the global app header. */
  compact?: boolean
  /** Skip outer glass chrome — parent already provides the shared bar. */
  embedded?: boolean
}) {
  const [query, setQuery] = useState(initialQuery)
  const [open, setOpen] = useState(!!initialQuery)
  const [clientMatches, setClientMatches] = useState<MapClient[]>([])
  const [employeeMatches, setEmployeeMatches] = useState<MapUser[]>([])
  const [addressMatches, setAddressMatches] = useState<GeocodeFeature[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const allClientsRef = useRef<MapClient[]>([])
  const showAddToRoute = !!(onAddToRouteClient || onAddToRouteLocation)
  const usersKey = users.map(u => u.id).join(',')

  // Close on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setClientMatches(prev => (prev.length === 0 ? prev : []))
      setEmployeeMatches(prev => (prev.length === 0 ? prev : []))
      setAddressMatches(prev => (prev.length === 0 ? prev : []))
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const needle = q.toLowerCase()
        const employeeHits = users
          .filter(u => {
            const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase()
            return name.includes(needle)
          })
          .slice(0, 5)
        setEmployeeMatches(employeeHits)

        const [clients, features] = await Promise.all([
          fetchAllClients().catch(() => [] as MapClient[]),
          fetchGeocodeSuggestions(q),
        ])
        allClientsRef.current = clients
        setClientMatches(
          clients
            .filter(c => {
              const name = `${c.name || ''} ${c.last_name || ''}`.toLowerCase()
              const addr = `${c.address || ''} ${c.zip_code || ''} ${c.city || ''}`.toLowerCase()
              return name.includes(needle) || addr.includes(needle)
            })
            .slice(0, 5)
        )
        setAddressMatches(features.slice(0, 5))
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, usersKey]) // eslint-disable-line react-hooks/exhaustive-deps -- users via usersKey

  const hasResults = clientMatches.length > 0 || employeeMatches.length > 0 || addressMatches.length > 0

  const closeSearch = () => {
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <div
        className={
          embedded
            ? 'flex items-center gap-3 px-4 py-3.5'
            : compact
            ? 'flex items-center gap-2 rounded-full bg-white/70 border border-gray-900/[0.07] px-3.5 py-1.5 transition-colors focus-within:bg-white focus-within:border-gray-900/[0.14]'
            : `
          flex items-center gap-3 rounded-2xl
          bg-white/90 backdrop-blur-xl
          border border-white/70
          shadow-[0_8px_32px_rgba(15,23,42,0.12),0_1px_0_rgba(255,255,255,0.8)_inset]
          px-5 py-3.5
          ring-1 ring-black/[0.04]
        `
        }
      >
        <MagnifyingGlassIcon
          className={`flex-shrink-0 ${compact ? 'w-4 h-4 text-gray-400' : 'w-5 h-5 text-gray-500'}`}
        />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={
            compact
              ? 'w-full bg-transparent text-[13px] font-medium text-gray-900 placeholder-gray-400 outline-none'
              : 'w-full bg-transparent text-[15px] font-medium text-gray-900 placeholder-gray-400 outline-none'
          }
        />
        {loading && (
          <span className="w-4 h-4 flex-shrink-0 rounded-full border-2 border-gray-300 border-t-accent-500 animate-spin" />
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div
          className={`
            absolute left-0 right-0 top-full mt-1.5 z-50 overflow-hidden
            bg-white/95 backdrop-blur-xl border border-white/70
            shadow-[0_16px_48px_rgba(15,23,42,0.16)] ring-1 ring-black/[0.04]
            ${compact ? 'rounded-xl' : 'rounded-2xl mt-2'}
          `}
        >
          {!hasResults && !loading && (
            <div className="px-5 py-3.5 text-sm text-gray-500">No matches found</div>
          )}

          {employeeMatches.length > 0 && onPickEmployee && (
            <div>
              <div className="px-5 pt-3.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Employees
              </div>
              {employeeMatches.map(u => (
                <div
                  key={u.id}
                  className="flex items-center gap-2 px-3 hover:bg-black/[0.03] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => { closeSearch(); onPickEmployee(u) }}
                    className="min-w-0 flex-1 flex items-center gap-3 px-2 py-3 text-left"
                  >
                    <HomeIcon className="w-5 h-5 text-[#193434] flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 truncate">
                        {u.first_name}{u.last_name ? ` ${u.last_name}` : ''}
                      </span>
                      <span className="block text-xs text-gray-500 truncate">Employee</span>
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {clientMatches.length > 0 && (
            <div className={employeeMatches.length > 0 && onPickEmployee ? 'border-t border-gray-100/80' : ''}>
              <div className="px-5 pt-3.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Clients
              </div>
              {clientMatches.map(c => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 px-3 hover:bg-black/[0.03] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => { closeSearch(); onPickClient(c) }}
                    className="min-w-0 flex-1 flex items-center gap-3 px-2 py-3 text-left"
                  >
                    <UserCircleIcon className="w-5 h-5 text-accent-500 flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 truncate">
                        {c.name}{c.last_name ? ` ${c.last_name}` : ''}
                      </span>
                      <span className="block text-xs text-gray-500 truncate">
                        {[c.address, c.zip_code, c.city].filter(Boolean).join(', ') || 'No address'}
                      </span>
                    </span>
                  </button>
                  {showAddToRoute && onAddToRouteClient && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        closeSearch()
                        onAddToRouteClient(c)
                      }}
                      className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-accent-500 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-accent-500/25 hover:bg-accent-600 transition-colors mr-2"
                      title="Add to this route"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                      Add to route
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {addressMatches.length > 0 && (
            <div className="border-t border-gray-100/80">
              <div className="px-5 pt-3.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Addresses
              </div>
              {addressMatches.map((f, i) => {
                const loc = parseMapboxFeature(f)
                const existingClient = findClientAtPlace(allClientsRef.current, loc)
                return (
                  <div
                    key={`${f.place_name}-${i}`}
                    className="flex items-center gap-2 px-3 hover:bg-black/[0.03] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        closeSearch()
                        if (existingClient) onPickClient(existingClient)
                        else onPickLocation(loc)
                      }}
                      className="min-w-0 flex-1 flex items-center gap-3 px-2 py-3 text-left"
                    >
                      <MapPinIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-gray-800 truncate">{f.place_name}</span>
                        {existingClient && (
                          <span className="block text-[11px] text-gray-500 truncate mt-0.5">
                            {existingClient.client_type === 'company'
                              ? existingClient.name
                              : `${existingClient.name}${existingClient.last_name ? ` ${existingClient.last_name}` : ''}`.trim()}
                            {' · existing client'}
                          </span>
                        )}
                      </span>
                    </button>
                    {showAddToRoute && (existingClient ? onAddToRouteClient : onAddToRouteLocation) && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          closeSearch()
                          if (existingClient && onAddToRouteClient) onAddToRouteClient(existingClient)
                          else if (onAddToRouteLocation) onAddToRouteLocation(loc)
                        }}
                        className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-accent-500 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-accent-500/25 hover:bg-accent-600 transition-colors mr-2"
                        title="Add to this route"
                      >
                        <PlusIcon className="w-3.5 h-3.5" />
                        Add to route
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
