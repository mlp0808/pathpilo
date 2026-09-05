'use client'

/**
 * "Which routes pass nearby?" — ranked candidate route-days for a target location.
 * Always sorted closest-first; only filter is the date window (next 7/14/30 days).
 * Each row shows a busy bar and can expand to ordered stops (from the map preview).
 */

import { useEffect, useMemo, useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import type { UserRoute } from '@/app/components/RouteMap'
import {
  fetchDayCapacityMinutes,
  fetchNearestRoutes,
  type NearestRouteRow,
} from './useMapData'
import { addDaysStr, todayStr } from './mapMode'

export function fmtMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '–'
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function fmtDate(dateStr: string, opts?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts ?? { weekday: 'short', day: 'numeric', month: 'short' })
}

export type RouteDayKey = string // `${date}:${userId}`

function routeKey(row: Pick<NearestRouteRow, 'date' | 'user_id'>): RouteDayKey {
  return `${String(row.date).slice(0, 10)}:${row.user_id}`
}

/** Visual load vs capacity — fills green → amber → red as the day fills up. */
export function BusyBar({
  usedMinutes,
  capacityMinutes,
}: {
  usedMinutes: number
  capacityMinutes: number
}) {
  const capacity = Math.max(1, capacityMinutes)
  const used = Math.max(0, usedMinutes)
  const ratio = used / capacity
  const fillPct = Math.min(100, ratio * 100)
  const tone =
    ratio >= 1 ? 'bg-red-500'
    : ratio >= 0.85 ? 'bg-amber-500'
    : 'bg-accent-500'

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Day load</span>
        <span className="text-[10px] font-semibold text-gray-500 tabular-nums">
          {fmtMinutes(used)}
          <span className="font-normal text-gray-400"> / {fmtMinutes(capacity)}</span>
        </span>
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden"
        title={`${Math.round(ratio * 100)}% of day capacity`}
      >
        <div
          className={`h-full rounded-full transition-[width,background-color] duration-300 ease-out ${tone}`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  )
}

export default function NearestRoutesList({
  lat,
  lng,
  selectable = false,
  selected = [],
  onToggleSelect,
  onSelectRoute,
  onRowsChange,
  previewKeys = [],
  previewRoutesByKey = {},
  previewLoading = false,
  onHoverJob,
  expandable = true,
  refreshKey = 0,
  onOpenPlanner,
}: {
  lat: number
  lng: number
  /** Offer composer: rows become checkboxes (max 4 selections). */
  selectable?: boolean
  selected?: RouteDayKey[]
  onToggleSelect?: (row: NearestRouteRow) => void
  /**
   * Single-select a route for map preview + calendar day.
   * Replaces multi-toggle preview behaviour.
   */
  onSelectRoute?: (row: NearestRouteRow) => void
  /** Notify parent when the loaded list changes (for calendar sync). */
  onRowsChange?: (rows: NearestRouteRow[] | null) => void
  previewKeys?: RouteDayKey[]
  /** Loaded preview routes keyed by `${date}:${userId}` (real employee id). */
  previewRoutesByKey?: Record<string, UserRoute>
  previewLoading?: boolean
  onHoverJob?: (id: number | string | null) => void
  /** Show chevron + stop list (off inside offer composer if desired). */
  expandable?: boolean
  /** Bump to re-fetch after a job was scheduled onto one of these routes. */
  refreshKey?: number
  /** Open this route-day in the in-map planner. Omit to hide the affordance. */
  onOpenPlanner?: (row: NearestRouteRow) => void
}) {
  const [withinDays, setWithinDays] = useState(14)
  const [rows, setRows] = useState<NearestRouteRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** `${date}:${userId}` → capacity minutes for that employee-day */
  const [capacityByKey, setCapacityByKey] = useState<Record<string, number>>({})
  const [expandedKey, setExpandedKey] = useState<RouteDayKey | null>(null)

  const from = useMemo(() => todayStr(), [])
  const to = useMemo(() => addDaysStr(from, withinDays - 1), [from, withinDays])

  useEffect(() => {
    let alive = true
    setRows(null)
    onRowsChange?.(null)
    setError(null)
    setCapacityByKey({})
    setExpandedKey(null)
    // Fixed search radius — UI no longer exposes km filters.
    fetchNearestRoutes({ lat, lng, from, to, radius: 30, sort: 'closest' })
      .then(async r => {
        if (!alive) return
        setRows(r)
        onRowsChange?.(r)
        // Resolve capacity in parallel (work-hours responses are TTL-cached).
        const unique = new Map<string, { userId: number; date: string }>()
        for (const row of r) {
          const key = routeKey(row)
          if (!unique.has(key)) unique.set(key, { userId: row.user_id, date: String(row.date).slice(0, 10) })
        }
        const entries = await Promise.all(
          Array.from(unique.entries()).map(async ([key, { userId, date }]) => {
            const mins = await fetchDayCapacityMinutes(userId, date)
            return [key, mins] as const
          }),
        )
        if (!alive) return
        const next: Record<string, number> = {}
        for (const [key, mins] of entries) next[key] = mins
        setCapacityByKey(next)
      })
      .catch(() => {
        if (!alive) return
        setError('Could not load nearby routes')
        onRowsChange?.([])
      })
    return () => { alive = false }
  }, [lat, lng, from, to, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps -- onRowsChange stable enough

  // Keep expand on the active preview row when selection changes from calendar.
  useEffect(() => {
    if (!expandedKey) return
    if (previewKeys.length === 0) {
      setExpandedKey(null)
      return
    }
    if (!previewKeys.includes(expandedKey)) {
      setExpandedKey(null)
    }
  }, [previewKeys, expandedKey])

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <select
          value={withinDays}
          onChange={e => setWithinDays(parseInt(e.target.value, 10))}
          className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 outline-none"
        >
          <option value={7}>Next 7 days</option>
          <option value={14}>Next 14 days</option>
          <option value={30}>Next 30 days</option>
        </select>
        <span className="text-[11px] text-gray-400">Closest first</span>
      </div>

      {error && <div className="text-sm text-red-500 py-2">{error}</div>}
      {!error && rows == null && (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-[72px] rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}
      {rows != null && rows.length === 0 && (
        <div className="text-sm text-gray-500 py-2">
          No nearby routes in this window. Try a longer period.
        </div>
      )}

      <div className="space-y-1.5">
        {(rows || []).map(row => {
          const key = routeKey(row)
          const isSelected = selected.includes(key)
          const isPreview = previewKeys.includes(key)
          const isExpanded = expandable && expandedKey === key
          const used = row.current_drive_minutes + row.current_job_minutes
          const capacity = capacityByKey[key]
          const previewRoute = previewRoutesByKey[key]
          const stops = (previewRoute?.jobs || []).filter(j => !j.is_home)
          const showStopSkeleton = isExpanded && isPreview && !previewRoute && previewLoading

          return (
            <div
              key={key}
              className={`rounded-xl border transition-colors ${
                isPreview
                  ? 'border-accent-500 bg-accent-500/[0.08] shadow-[0_0_0_1px_rgba(61,213,122,0.25)]'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelectRoute?.(row)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectRoute?.(row)
                  }
                }}
                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
              >
                {selectable && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect?.(row)}
                    onClick={e => e.stopPropagation()}
                    className="w-4 h-4 accent-accent-500 flex-shrink-0"
                  />
                )}
                {expandable && (
                  <button
                    type="button"
                    aria-label={isExpanded ? 'Collapse stops' : 'Expand stops'}
                    aria-expanded={isExpanded}
                    onClick={e => {
                      e.stopPropagation()
                      const next = isExpanded ? null : key
                      setExpandedKey(next)
                      // Expanding selects only if not already previewed (avoids toggle-off).
                      if (next && !isPreview) onSelectRoute?.(row)
                      else if (!next) onHoverJob?.(null)
                    }}
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/5 transition-colors"
                  >
                    {isExpanded
                      ? <ChevronDownIcon className="w-3.5 h-3.5" />
                      : <ChevronRightIcon className="w-3.5 h-3.5" />}
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-gray-800">{fmtDate(String(row.date).slice(0, 10))}</span>
                    <span className="text-xs text-gray-500 truncate">{row.user_name}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                    <span>{row.nearest_km} km away</span>
                    <span>{row.stop_count} stops</span>
                  </div>
                  {capacity != null && (
                    <BusyBar usedMinutes={used} capacityMinutes={capacity} />
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-sm font-bold text-accent-600">+{fmtMinutes(row.added_minutes)}</div>
                  <div className="text-[10px] text-gray-400">if added</div>
                </div>
                {onOpenPlanner && Number(row.user_id) > 0 && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onOpenPlanner(row) }}
                    className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold transition-colors ${
                      isPreview
                        ? 'bg-accent-500 text-white hover:bg-accent-600'
                        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                    title="Open this route in the planner"
                  >
                    <PencilSquareIcon className="w-3.5 h-3.5" />
                    {isPreview && <span>Plan</span>}
                  </button>
                )}
              </div>

              {isExpanded && (
                <div className="border-t border-gray-100/80 px-2.5 pb-2.5 pt-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1.5 mb-1">
                    Stops in order
                  </div>
                  {showStopSkeleton && (
                    <div className="space-y-1">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="h-9 rounded-lg bg-gray-100/80 animate-pulse" />
                      ))}
                    </div>
                  )}
                  {!showStopSkeleton && stops.length === 0 && (
                    <p className="text-[12px] text-gray-500 px-1.5 py-1">
                      {isPreview ? 'No stops on this route.' : 'Select this route to load stops.'}
                    </p>
                  )}
                  <div className="space-y-0.5">
                    {stops.map((j, idx) => (
                      <div
                        key={String(j.id)}
                        onMouseEnter={() => onHoverJob?.(j.id)}
                        onMouseLeave={() => onHoverJob?.(null)}
                        className={`flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors ${
                          j.is_cancelled ? 'opacity-45' : 'hover:bg-white/80'
                        }`}
                      >
                        <span
                          className="mt-0.5 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                          style={{ background: previewRoute?.color || '#9CA3AF' }}
                        >
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-gray-800 truncate">
                            {j.label}
                            {j.is_projected && (
                              <span className="ml-1.5 text-[10px] font-semibold text-gray-400">projected</span>
                            )}
                            {j.is_cancelled && (
                              <span className="ml-1.5 text-[10px] font-semibold text-red-500">cancelled</span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500 truncate">
                            {j.time ? `${j.time} · ` : ''}{j.address}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
