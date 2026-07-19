// Shared helpers for the free Route Planner tool (marketing site).
// Client-only: localStorage persistence, Mapbox Directions, geocoding scope,
// and the guest-route -> sign-up handoff encoding. Deliberately simple: one
// route (a single ordered list of stops), no login.

export interface GuestStop {
  id: number
  name: string
  address: string
  zip_code?: string
  city?: string
  lat: number
  lng: number
}

const STORAGE_KEY = 'pathpilo_guest_route'
const PAYLOAD_VERSION = 2

interface StoredShape {
  v: number
  stops: GuestStop[]
  country?: string
}

export interface GuestState {
  stops: GuestStop[]
  country: string
}

// ── Persistence ─────────────────────────────────────────────────────────────

export function loadState(): GuestState {
  if (typeof window === 'undefined') return { stops: [], country: '' }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { stops: [], country: '' }
    const parsed = JSON.parse(raw) as StoredShape
    if (!parsed || !Array.isArray(parsed.stops)) return { stops: [], country: '' }
    const stops = parsed.stops
      .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number')
      .map((s, i) => ({
        id: typeof s.id === 'number' ? s.id : i + 1,
        name: String(s.name || `Stop ${i + 1}`),
        address: String(s.address || ''),
        zip_code: s.zip_code ? String(s.zip_code) : undefined,
        city: s.city ? String(s.city) : undefined,
        lat: s.lat,
        lng: s.lng,
      }))
    return { stops, country: typeof parsed.country === 'string' ? parsed.country : '' }
  } catch {
    return { stops: [], country: '' }
  }
}

export function saveState(state: GuestState): void {
  if (typeof window === 'undefined') return
  try {
    const shape: StoredShape = { v: PAYLOAD_VERSION, stops: state.stops, country: state.country }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shape))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export function clearStoredState(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Next id for a new stop (max existing + 1). */
export function nextStopId(stops: GuestStop[]): number {
  return stops.reduce((max, s) => Math.max(max, s.id), 0) + 1
}

// ── Countries (geocoding scope) ───────────────────────────────────────────────

export interface CountryOption {
  code: string // ISO 3166-1 alpha-2 (lowercase) or '' for worldwide
  label: string
  flag: string
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: '', label: 'Worldwide', flag: '🌍' },
  { code: 'gb', label: 'United Kingdom', flag: '🇬🇧' },
  { code: 'ie', label: 'Ireland', flag: '🇮🇪' },
  { code: 'us', label: 'United States', flag: '🇺🇸' },
  { code: 'ca', label: 'Canada', flag: '🇨🇦' },
  { code: 'au', label: 'Australia', flag: '🇦🇺' },
  { code: 'dk', label: 'Denmark', flag: '🇩🇰' },
  { code: 'se', label: 'Sweden', flag: '🇸🇪' },
  { code: 'no', label: 'Norway', flag: '🇳🇴' },
  { code: 'de', label: 'Germany', flag: '🇩🇪' },
  { code: 'nl', label: 'Netherlands', flag: '🇳🇱' },
  { code: 'fr', label: 'France', flag: '🇫🇷' },
  { code: 'es', label: 'Spain', flag: '🇪🇸' },
]

export function defaultCountryForLocale(locale: string): string {
  return locale === 'da' ? 'dk' : 'gb'
}

// ── Directions ────────────────────────────────────────────────────────────────

export interface RouteGeometryResult {
  routeGeometry: { type: string; coordinates: [number, number][] }
  totalMinutes: number
  totalKm: number
  legInfo: Map<number, { legMinutes: number; etaMinutes: number }>
}

export async function fetchRouteGeometry(
  stops: Array<{ id: number; lat: number; lng: number }>,
): Promise<RouteGeometryResult | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) return null
  const pts = stops.filter((s) => s.lat != null && s.lng != null).slice(0, 25)
  if (pts.length < 2) return null

  const coords = pts.map((s) => `${s.lng},${s.lat}`).join(';')
  try {
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${token}&geometries=geojson&overview=full`,
    )
    const data = await res.json()
    if (!data.routes?.[0]) return null
    const r = data.routes[0]

    const legInfo = new Map<number, { legMinutes: number; etaMinutes: number }>()
    let cumulative = 0
    pts.forEach((p, idx) => {
      if (idx === 0) {
        legInfo.set(p.id, { legMinutes: 0, etaMinutes: 0 })
        return
      }
      const legSec = r.legs?.[idx - 1]?.duration ?? 0
      const legMin = legSec / 60
      cumulative += legMin
      legInfo.set(p.id, { legMinutes: legMin, etaMinutes: cumulative })
    })

    return {
      routeGeometry: r.geometry,
      totalMinutes: r.duration / 60,
      totalKm: r.distance / 1000,
      legInfo,
    }
  } catch {
    return null
  }
}

export function formatDuration(minutes?: number): string {
  if (minutes == null || Number.isNaN(minutes)) return '—'
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

// ── Guest -> sign-up handoff ────────────────────────────────────────────────

export interface GuestRouteStopPayload {
  name: string
  address: string
  zip_code?: string
  city?: string
  lat: number
  lng: number
}

/** Base64 (UTF-8 safe) encoding of the guest route for the register handoff. */
export function encodeGuestRoute(stops: GuestStop[]): string {
  const payload = {
    v: PAYLOAD_VERSION,
    stops: stops.map<GuestRouteStopPayload>((s) => ({
      name: s.name,
      address: s.address,
      zip_code: s.zip_code,
      city: s.city,
      lat: s.lat,
      lng: s.lng,
    })),
  }
  const json = JSON.stringify(payload)
  if (typeof window === 'undefined') return ''
  return window.btoa(unescape(encodeURIComponent(json)))
}

const APP_REGISTER_URL = 'https://app.pathpilo.com/register'

/**
 * Build the register URL carrying the guest route as a base64 param.
 * The app reads `guestRoute` after sign-up and claims it into the new account.
 */
export function buildRegisterUrl(locale: string, stops: GuestStop[]): string {
  const params = new URLSearchParams()
  params.set('lang', locale)
  if (stops.length > 0) {
    const encoded = encodeGuestRoute(stops)
    if (encoded) params.set('guestRoute', encoded)
  }
  return `${APP_REGISTER_URL}?${params.toString()}`
}
