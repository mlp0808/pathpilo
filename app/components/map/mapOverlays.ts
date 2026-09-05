/**
 * Session overlays for the map multitool — searched locations, clients, and
 * employees that float as profile cards (top-right) with sticky pins, independent
 * of URL mode. Closing a card removes its pin; leaving the map clears everything.
 */

export const MAP_OPEN_OVERLAY_EVENT = 'pathpilo:map-open-overlay'

export type MapOverlayLocation = {
  key: string
  kind: 'location'
  lat: number
  lng: number
  label: string
  address?: string
  zip_code?: string
  city?: string
  /** When opened from an existing client (offers attach to them). */
  linkedClientId?: number
}

export type MapOverlayClient = {
  key: string
  kind: 'client'
  clientId: number
  name: string
  last_name?: string | null
  address?: string | null
  zip_code?: string | null
  city?: string | null
  lat?: number | null
  lng?: number | null
  client_type?: string | null
}

export type MapOverlayEmployee = {
  key: string
  kind: 'employee'
  userId: number
  first_name: string
  last_name: string
  address?: string | null
  lat?: number | null
  lng?: number | null
}

export type MapOverlay = MapOverlayLocation | MapOverlayClient | MapOverlayEmployee

export type MapOpenOverlayDetail =
  | {
      kind: 'location'
      lat: number
      lng: number
      label: string
      address?: string
      zip_code?: string
      city?: string
      linkedClientId?: number
    }
  | {
      kind: 'client'
      clientId: number
      name?: string
      last_name?: string | null
      address?: string | null
      zip_code?: string | null
      city?: string | null
      lat?: number | null
      lng?: number | null
      client_type?: string | null
    }
  | {
      kind: 'employee'
      userId: number
      first_name: string
      last_name: string
      address?: string | null
      lat?: number | null
      lng?: number | null
    }

/** Stable key for a geocoded place (~1m precision). */
export function locationOverlayKey(lat: number, lng: number): string {
  return `loc:${lat.toFixed(5)},${lng.toFixed(5)}`
}

export function clientOverlayKey(clientId: number): string {
  return `client:${clientId}`
}

export function employeeOverlayKey(userId: number): string {
  return `employee:${userId}`
}

export function overlayFromLocationDetail(
  d: Extract<MapOpenOverlayDetail, { kind: 'location' }>,
): MapOverlayLocation {
  return {
    key: locationOverlayKey(d.lat, d.lng),
    kind: 'location',
    lat: d.lat,
    lng: d.lng,
    label: d.label,
    ...(d.address ? { address: d.address } : {}),
    ...(d.zip_code ? { zip_code: d.zip_code } : {}),
    ...(d.city ? { city: d.city } : {}),
    ...(d.linkedClientId != null ? { linkedClientId: d.linkedClientId } : {}),
  }
}

export function overlayFromClientDetail(
  d: Extract<MapOpenOverlayDetail, { kind: 'client' }>,
): MapOverlayClient {
  return {
    key: clientOverlayKey(d.clientId),
    kind: 'client',
    clientId: d.clientId,
    name: d.name || `Client #${d.clientId}`,
    last_name: d.last_name,
    address: d.address,
    zip_code: d.zip_code,
    city: d.city,
    lat: d.lat,
    lng: d.lng,
    client_type: d.client_type,
  }
}

export function overlayFromEmployeeDetail(
  d: Extract<MapOpenOverlayDetail, { kind: 'employee' }>,
): MapOverlayEmployee {
  return {
    key: employeeOverlayKey(d.userId),
    kind: 'employee',
    userId: d.userId,
    first_name: d.first_name,
    last_name: d.last_name,
    address: d.address,
    lat: d.lat,
    lng: d.lng,
  }
}

/** Insert or move-to-front (newest search rises to the top of the stack). */
export function upsertOverlay(list: MapOverlay[], next: MapOverlay): MapOverlay[] {
  const without = list.filter(o => o.key !== next.key)
  return [next, ...without]
}

export function dispatchOpenOverlay(detail: MapOpenOverlayDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MAP_OPEN_OVERLAY_EVENT, { detail }))
}
