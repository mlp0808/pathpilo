import { getSequentialPickMeta } from './utils'
import type { SequentialPickId } from './types'

export interface MapPinJobInput {
  id: SequentialPickId
  lat: number
  lng: number
  label: string
  address?: string
  time?: string
  estimated_duration_minutes?: number
  legMinutes?: number
  is_home?: boolean
  /** Initials for employee home pins (e.g. "JW"). */
  home_initials?: string
  client_type?: 'person' | 'company' | string | null
  is_location_pin?: boolean
}

/** GeoJSON features for RouteMap — supports normal numbering and sequential pick mode. */
export function buildSequentialPickMapFeatures(
  jobs: MapPinJobInput[],
  options: {
    pickActive: boolean
    pickOrder: SequentialPickId[]
    highlightedId: SequentialPickId | null | undefined
    /** Persisted selection (e.g. active client pin) — keeps bubble size without hover. */
    selectedId?: SequentialPickId | null | undefined
    /** Multiple open client cards — any matching id is selected. */
    selectedIds?: SequentialPickId[]
    /** Skip 1,2,3 labels — client location overlays use plain dots (+ optional person/company icon). */
    plainPins?: boolean
  },
) {
  let clientIndex = 0
  const selectedSet = new Set(
    [
      ...(options.selectedId != null ? [String(options.selectedId)] : []),
      ...(options.selectedIds || []).map(String),
    ],
  )
  return jobs
    .filter((j): j is MapPinJobInput & { lat: number; lng: number } => j.lat != null && j.lng != null)
    .map((job, idx) => {
      const isHome = !!job.is_home
      const highlight =
        options.highlightedId != null && String(job.id) === String(options.highlightedId)
      const selected = selectedSet.has(String(job.id))

      const pick = options.pickActive && !isHome
        ? getSequentialPickMeta(job.id, true, options.pickOrder, options.highlightedId)
        : null

      const pickNumber = pick?.pickNumber ?? null
      const pickAvailable = pick?.pickAvailable ?? false
      const isPicked = pick?.isPicked ?? false
      const previewNumber = pick?.previewNumber ?? null

      // Center label on pin: picked number, hover preview, or empty (icon layer shows)
      let centerLabel = ''
      if (options.pickActive && !isHome) {
        if (isPicked && pickNumber != null) centerLabel = String(pickNumber)
        else if (previewNumber != null) centerLabel = String(previewNumber)
      }

      const showPinIcon = pickAvailable && !isPicked && previewNumber == null

      // Plain client overlays: never number. Route stops: 1, 2, 3…
      const seq = options.plainPins || options.pickActive || isHome
        ? ''
        : String(++clientIndex)

      const ct = String(job.client_type || '').toLowerCase()
      const clientIcon = options.plainPins && !isHome && !job.is_location_pin
        ? (ct === 'company' ? 'company' : ct === 'person' ? 'person' : '')
        : ''

      const homeInitials = isHome
        ? String(job.home_initials || '').trim().toUpperCase().slice(0, 2)
        : ''

      return {
        type: 'Feature' as const,
        properties: {
          jobId: job.id,
          seq,
          centerLabel,
          showPinIcon: showPinIcon ? 1 : 0,
          clientIcon,
          locationPin: job.is_location_pin ? 1 : 0,
          label: job.label,
          address: job.address || '',
          time: job.time || '',
          durationMinutes: job.estimated_duration_minutes ?? -1,
          legMinutes: job.legMinutes ?? -1,
          idx,
          isHome: isHome ? 1 : 0,
          homeInitials,
          highlight: highlight ? 1 : 0,
          selected: selected ? 1 : 0,
          // Bubble = hover or active selection (paint expressions read this).
          bubbled: highlight || selected ? 1 : 0,
          pickAvailable: pickAvailable ? 1 : 0,
          isPicked: isPicked ? 1 : 0,
        },
        geometry: { type: 'Point' as const, coordinates: [job.lng, job.lat] as [number, number] },
      }
    })
}
