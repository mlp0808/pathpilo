const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

type Coord = { lat: number; lng: number }

function pathCost(matrix: number[][], startIdx: number, endIdx: number, tour: number[]): number {
  if (tour.length === 0) return matrix[startIdx]?.[endIdx] ?? 0
  let cost = matrix[startIdx]?.[tour[0]] ?? Infinity
  for (let i = 0; i < tour.length - 1; i++) {
    cost += matrix[tour[i]]?.[tour[i + 1]] ?? Infinity
  }
  cost += matrix[tour[tour.length - 1]]?.[endIdx] ?? Infinity
  return cost
}

function nearestNeighborTour(
  matrix: number[][],
  startIdx: number,
  jobIndices: number[],
): number[] {
  const remaining = new Set(jobIndices)
  const tour: number[] = []
  let current = startIdx

  while (remaining.size > 0) {
    let best: number | null = null
    let bestCost = Infinity
    for (const j of remaining) {
      const cost = matrix[current]?.[j] ?? Infinity
      if (cost < bestCost) {
        bestCost = cost
        best = j
      }
    }
    if (best == null) {
      // Append any leftovers so nothing is ever dropped.
      for (const j of remaining) tour.push(j)
      break
    }
    tour.push(best)
    remaining.delete(best)
    current = best
  }

  return tour
}

function twoOptImprove(
  matrix: number[][],
  startIdx: number,
  endIdx: number,
  tour: number[],
): number[] {
  if (tour.length < 2) return tour
  let improved = true
  let best = [...tour]

  while (improved) {
    improved = false
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ]
        if (pathCost(matrix, startIdx, endIdx, candidate) < pathCost(matrix, startIdx, endIdx, best)) {
          best = candidate
          improved = true
        }
      }
    }
  }

  return best
}

async function fetchDriveMatrix(coords: Coord[]): Promise<number[][] | null> {
  if (!MAPBOX_TOKEN || coords.length === 0) return null
  if (coords.length === 1) return [[0]]
  if (coords.length > 25) return null // Matrix API caps at 25 coordinates

  try {
    const coordStr = coords.map(c => `${c.lng},${c.lat}`).join(';')
    const url =
      `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordStr}` +
      `?annotations=duration&access_token=${MAPBOX_TOKEN}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (data.code !== 'Ok' || !Array.isArray(data.durations)) return null
    return data.durations.map((row: Array<number | null>) =>
      row.map((v: number | null) => (v == null ? 1e9 : v)),
    )
  } catch {
    return null
  }
}

function haversineSeconds(a: Coord, b: Coord): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  const distM = 2 * R * Math.asin(Math.sqrt(h))
  return distM / 13.9 // ~50 km/h average driving
}

function haversineMatrix(coords: Coord[]): number[][] {
  return coords.map(a => coords.map(b => haversineSeconds(a, b)))
}

export type ClientOptimizeJob = {
  id: number | string
  lat: number
  lng: number
}

export type ClientOptimizeResult = {
  /** Job ids (original type) in optimized visiting order. */
  orderedIds: (number | string)[]
  /** Drive seconds of the input order (start → jobs in given order → end). */
  beforeSeconds: number
  /** Drive seconds of the optimized order. */
  afterSeconds: number
  /** True when a real Mapbox drive matrix was used (vs straight-line fallback). */
  usedRoadMatrix: boolean
}

/**
 * Browser-side route order optimizer (Mapbox Matrix + nearest-neighbour / 2-opt).
 * Preserves original job id types so subscription/projected stops are never dropped.
 */
export async function optimizeMiddleJobsClient(
  middleJobs: ClientOptimizeJob[],
  depot?: { start?: Coord | null; end?: Coord | null },
): Promise<ClientOptimizeResult> {
  if (middleJobs.length < 2) {
    return {
      orderedIds: middleJobs.map(j => j.id),
      beforeSeconds: 0,
      afterSeconds: 0,
      usedRoadMatrix: false,
    }
  }

  const coords: Coord[] = []
  const startIdx = 0

  const hasStart = !!depot?.start
  if (depot?.start) coords.push(depot.start)

  for (const job of middleJobs) {
    coords.push({ lat: job.lat, lng: job.lng })
  }

  const hasEnd =
    !!depot?.end &&
    (!depot?.start || depot.end.lat !== depot.start.lat || depot.end.lng !== depot.start.lng)

  let endIdx: number
  if (hasEnd && depot?.end) {
    coords.push(depot.end)
    endIdx = coords.length - 1
  } else if (hasStart) {
    endIdx = 0 // return to start depot
  } else {
    endIdx = coords.length - 1 // open path: end at the last visited stop
  }

  const jobOffset = hasStart ? 1 : 0
  const jobMatrixIndices = middleJobs.map((_, i) => i + jobOffset)

  const roadMatrix = await fetchDriveMatrix(coords)
  const matrix = roadMatrix ?? haversineMatrix(coords)

  // When there is no depot, an open path's end float to the last stop; we keep
  // endIdx as a sentinel meaning "free end" by setting it to the seed's last node.
  const seed = nearestNeighborTour(matrix, startIdx, jobMatrixIndices)
  const effectiveEnd = hasStart || hasEnd ? endIdx : seed[seed.length - 1] ?? startIdx

  const beforeSeconds = pathCost(matrix, startIdx, effectiveEnd, jobMatrixIndices)
  const optimized = twoOptImprove(matrix, startIdx, effectiveEnd, seed)
  const afterSeconds = pathCost(matrix, startIdx, effectiveEnd, optimized)

  const orderedIds = optimized
    .map(matrixIdx => middleJobs[matrixIdx - jobOffset]?.id)
    .filter((id): id is number | string => id != null)

  // Safety net: append any job the tour somehow missed.
  if (orderedIds.length < middleJobs.length) {
    const seen = new Set(orderedIds.map(String))
    for (const job of middleJobs) {
      if (!seen.has(String(job.id))) orderedIds.push(job.id)
    }
  }

  return {
    orderedIds,
    beforeSeconds,
    afterSeconds,
    usedRoadMatrix: !!roadMatrix,
  }
}
