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
}

/** GeoJSON features for RouteMap — supports normal numbering and sequential pick mode. */
export function buildSequentialPickMapFeatures(
  jobs: MapPinJobInput[],
  options: {
    pickActive: boolean
    pickOrder: SequentialPickId[]
    highlightedId: SequentialPickId | null | undefined
  },
) {
  let clientIndex = 0
  return jobs
    .filter((j): j is MapPinJobInput & { lat: number; lng: number } => j.lat != null && j.lng != null)
    .map((job, idx) => {
      const isHome = !!job.is_home
      const highlight =
        options.highlightedId != null && String(job.id) === String(options.highlightedId)

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

      const seq = options.pickActive
        ? ''
        : isHome
          ? ''
          : String(++clientIndex)

      return {
        type: 'Feature' as const,
        properties: {
          jobId: job.id,
          seq,
          centerLabel,
          showPinIcon: showPinIcon ? 1 : 0,
          label: job.label,
          address: job.address || '',
          time: job.time || '',
          durationMinutes: job.estimated_duration_minutes ?? -1,
          legMinutes: job.legMinutes ?? -1,
          idx,
          isHome: isHome ? 1 : 0,
          highlight: highlight ? 1 : 0,
          pickAvailable: pickAvailable ? 1 : 0,
          isPicked: isPicked ? 1 : 0,
        },
        geometry: { type: 'Point' as const, coordinates: [job.lng, job.lat] as [number, number] },
      }
    })
}
