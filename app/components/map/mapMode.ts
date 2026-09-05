/**
 * Map multitool URL state.
 *
 * The URL *is* the state — every view is a shareable link:
 *   /[company]/map                                  → idle (search)
 *   ?focus=day&date=YYYY-MM-DD                      → all routes for a day
 *   ?focus=route&userId=5&date=YYYY-MM-DD           → one employee's day route
 *   ?focus=employee&userId=5&from=&to=              → employee across a range
 *   ?focus=client&clientId=123                      → client context (all dates)
 *   ?focus=client&clientId=123&spanFrom=&spanTo=    → client with calendar day/span
 *   ?focus=location&lat=&lng=&q=                    → prospect location
 *   ?focus=location&lat=&lng=&q=&date=              → prospect + active day
 *   ?focus=location&…&date=&userId=                 → prospect + specific nearby route
 *   ?focus=round&roundId=12                         → open a round unit by id
 *   ?focus=round                                    → empty round planner (create)
 * Back-compat: ?focus=sandbox&roundId= → same as focus=round
 * Back-compat: ?view=day&date= (old jobs link) is treated as focus=day.
 * Client calendar also accepts legacy &from=&to= as aliases for spanFrom/spanTo.
 *
 * Planner views (day/route/round) can also carry `&back=<encoded query>` — the view to
 * return to when you leave the planner. That's what makes client → route → edit
 * → back land you on the exact client card and calendar span you started from.
 */

/**
 * Fired by the global header search right before it navigates to a client.
 * The map listens so it can release the camera lock it holds while you browse
 * the all-clients backdrop — a search is an explicit "take me there".
 */
export const MAP_SEARCH_PICK_EVENT = 'pathpilo:map-search-pick'

/**
 * Fired by the header (or any search) to open CreateJob prefilled onto the
 * active day/route without leaving the planner. Detail shape:
 *   { date, userId?, clientId?, newClient? }
 *
 * When the active planner is a round unit (`focus=round`), the map
 * page instead appends a stop to that round — date/user stay unset until place.
 */
export const MAP_ADD_TO_ROUTE_EVENT = 'pathpilo:map-add-to-route'

export type MapMode =
  | { kind: 'idle' }
  | { kind: 'day'; date: string; returnTo?: string }
  | { kind: 'route'; date: string; userId: number; returnTo?: string }
  /**
   * Round unit planner — ordered stops as one package.
   * `roundId` null = empty "create round" shell (map creates a draft row + fills the URL).
   */
  | { kind: 'round'; roundId: number | null; returnTo?: string }
  | { kind: 'employee'; userId: number; from: string; to: string; layer?: 'dashboard' | 'routes' }
  | {
      kind: 'client'
      clientId: number
      /** Calendar selection start (inclusive). Omit both = show all. */
      spanFrom?: string
      /** Calendar selection end (inclusive). Defaults to spanFrom when omitted. */
      spanTo?: string
      /** Optional pin from search — lets the map zoom before /clients finishes loading. */
      lat?: number
      lng?: number
    }
  | {
      kind: 'location'
      lat: number
      lng: number
      label: string
      /** Street line (without zip/city) — used to prefill Schedule job / Add client. */
      address?: string
      zip_code?: string
      city?: string
      date?: string
      userId?: number
    }

export function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayStr(): string {
  return toLocalDateString(new Date())
}

export function addDaysStr(base: string, days: number): string {
  const [y, m, d] = base.split('-').map(Number)
  return toLocalDateString(new Date(y, m - 1, d + days))
}

/** Monday (YYYY-MM-DD) of the week containing `date` (local calendar). */
export function mondayOfWeek(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  const dt = new Date(y, m - 1, d)
  const day = (dt.getDay() + 6) % 7 // Mon = 0
  dt.setDate(dt.getDate() - day)
  return toLocalDateString(dt)
}

/** Mon–Sun week covering `date`. */
export function weekRangeContaining(date: string): { from: string; to: string } {
  const from = mondayOfWeek(date)
  return { from, to: addDaysStr(from, 6) }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isDateStr(v: string | null | undefined): v is string {
  return !!v && DATE_RE.test(v)
}

/** Copy lat/lng/label/address fields when rewriting a location URL (date/route changes). */
export function locationBase(
  mode: Extract<MapMode, { kind: 'location' }>,
): Pick<Extract<MapMode, { kind: 'location' }>, 'kind' | 'lat' | 'lng' | 'label' | 'address' | 'zip_code' | 'city'> {
  return {
    kind: 'location',
    lat: mode.lat,
    lng: mode.lng,
    label: mode.label,
    ...(mode.address ? { address: mode.address } : {}),
    ...(mode.zip_code ? { zip_code: mode.zip_code } : {}),
    ...(mode.city ? { city: mode.city } : {}),
  }
}

function dateOr(v: string | null, fallback: string): string {
  return v && DATE_RE.test(v) ? v : fallback
}

function intOr(v: string | null): number | null {
  const n = v != null ? parseInt(v, 10) : NaN
  return Number.isFinite(n) ? n : null
}

/** Normalize a client calendar span from URL/mode (null = no selection / show all). */
export function clientDateRange(mode: Extract<MapMode, { kind: 'client' }>): { from: string; to: string } | null {
  if (!isDateStr(mode.spanFrom)) return null
  const to = isDateStr(mode.spanTo) ? mode.spanTo : mode.spanFrom
  return mode.spanFrom <= to ? { from: mode.spanFrom, to } : { from: to, to: mode.spanFrom }
}

/**
 * Stamp the view you're leaving onto a planner mode, so its back button can
 * restore it exactly. An existing return target is kept — stepping between days
 * inside the planner shouldn't lose the client you came from.
 */
export function withReturnTo<T extends Extract<MapMode, { kind: 'day' | 'route' | 'round' }>>(
  next: T,
  from: MapMode,
): T {
  if (next.returnTo) return next
  const encoded = modeToQuery(from).replace(/^\?/, '')
  return encoded ? { ...next, returnTo: encoded } : next
}

/** The view a planner mode should return to, or null when there's nowhere to go back to. */
export function returnMode(mode: MapMode): MapMode | null {
  const resolved = resolvePlannerBack(mode)
  return resolved?.kind === 'mode' ? resolved.mode : null
}

/**
 * Where “Back” should go from a planner view.
 * - `mode` — another map focus (client card, idle day, etc.)
 * - `path` — an app path like `/acme/jobs` (set via `&back=/acme/jobs`)
 */
export function resolvePlannerBack(
  mode: MapMode,
): { kind: 'mode'; mode: MapMode } | { kind: 'path'; path: string } | null {
  const raw =
    mode.kind === 'day' || mode.kind === 'route' || mode.kind === 'round'
      ? mode.returnTo
      : undefined
  if (!raw) return null
  // External app path (jobs page, rounds list, …) — not a map query string.
  if (raw.startsWith('/')) {
    const path = raw.split('?')[0]
    return path ? { kind: 'path', path: raw.includes('?') ? raw : path } : null
  }
  const parsed = parseMapMode(new URLSearchParams(raw))
  return parsed.kind === 'idle' ? null : { kind: 'mode', mode: parsed }
}

export function parseMapMode(sp: URLSearchParams): MapMode {
  let focus = sp.get('focus')

  // Back-compat with the jobs page's ?view=day&date= links.
  if (!focus && sp.get('view') === 'day') focus = sp.get('userId') ? 'route' : 'day'

  // Nested return targets would compound the URL on every hop; one level is enough.
  const back = (sp.get('back') || '').trim()
  const returnTo = back && !back.includes('back=') ? { returnTo: back } : {}

  switch (focus) {
    case 'day':
      return { kind: 'day', date: dateOr(sp.get('date'), todayStr()), ...returnTo }
    case 'route': {
      const userId = intOr(sp.get('userId'))
      const date = dateOr(sp.get('date'), todayStr())
      if (userId == null) return { kind: 'day', date, ...returnTo }
      return { kind: 'route', date, userId, ...returnTo }
    }
    case 'round':
    case 'sandbox': {
      // sandbox = legacy alias for round. Missing roundId = empty create shell.
      const roundId = intOr(sp.get('roundId'))
      return { kind: 'round', roundId, ...returnTo }
    }
    case 'employee': {
      const userId = intOr(sp.get('userId'))
      if (userId == null) return { kind: 'idle' }
      const from = dateOr(sp.get('from'), todayStr())
      const layer = sp.get('layer') === 'routes' ? 'routes' as const : 'dashboard' as const
      return {
        kind: 'employee',
        userId,
        from,
        to: dateOr(sp.get('to'), addDaysStr(from, 6)),
        ...(layer === 'routes' ? { layer } : {}),
      }
    }
    case 'client': {
      const clientId = intOr(sp.get('clientId'))
      if (clientId == null) return { kind: 'idle' }
      // Prefer spanFrom/spanTo; accept legacy from/to so older links keep working.
      const spanFrom = sp.get('spanFrom') || sp.get('from')
      const spanTo = sp.get('spanTo') || sp.get('to')
      const lat = parseFloat(sp.get('lat') || '')
      const lng = parseFloat(sp.get('lng') || '')
      const coords = Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : {}
      if (isDateStr(spanFrom)) {
        return {
          kind: 'client',
          clientId,
          spanFrom,
          spanTo: isDateStr(spanTo) ? spanTo : spanFrom,
          ...coords,
        }
      }
      return { kind: 'client', clientId, ...coords }
    }
    case 'location': {
      const lat = parseFloat(sp.get('lat') || '')
      const lng = parseFloat(sp.get('lng') || '')
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { kind: 'idle' }
      const date = sp.get('date')
      const userId = intOr(sp.get('userId'))
      const address = (sp.get('addr') || '').trim() || undefined
      const zip_code = (sp.get('zip') || '').trim() || undefined
      const city = (sp.get('city') || '').trim() || undefined
      return {
        kind: 'location',
        lat,
        lng,
        label: sp.get('q') || 'Selected location',
        ...(address ? { address } : {}),
        ...(zip_code ? { zip_code } : {}),
        ...(city ? { city } : {}),
        ...(isDateStr(date) ? { date } : {}),
        ...(userId != null && isDateStr(date) ? { userId } : {}),
      }
    }
    default:
      return { kind: 'idle' }
  }
}

/** Build the query string for a mode (preserves nothing else — modes are self-contained). */
export function modeToQuery(mode: MapMode): string {
  const p = new URLSearchParams()
  switch (mode.kind) {
    case 'day':
      p.set('focus', 'day'); p.set('date', mode.date)
      if (mode.returnTo) p.set('back', mode.returnTo)
      break
    case 'route':
      p.set('focus', 'route'); p.set('date', mode.date); p.set('userId', String(mode.userId))
      if (mode.returnTo) p.set('back', mode.returnTo)
      break
    case 'round':
      p.set('focus', 'round')
      if (mode.roundId != null) p.set('roundId', String(mode.roundId))
      if (mode.returnTo) p.set('back', mode.returnTo)
      break
    case 'employee':
      p.set('focus', 'employee'); p.set('userId', String(mode.userId)); p.set('from', mode.from); p.set('to', mode.to)
      if (mode.layer === 'routes') p.set('layer', 'routes')
      break
    case 'client': {
      p.set('focus', 'client')
      p.set('clientId', String(mode.clientId))
      if (isDateStr(mode.spanFrom)) {
        const to = isDateStr(mode.spanTo) ? mode.spanTo : mode.spanFrom
        p.set('spanFrom', mode.spanFrom <= to ? mode.spanFrom : to)
        p.set('spanTo', mode.spanFrom <= to ? to : mode.spanFrom)
      }
      if (
        mode.lat != null && mode.lng != null
        && Number.isFinite(Number(mode.lat)) && Number.isFinite(Number(mode.lng))
      ) {
        p.set('lat', Number(mode.lat).toFixed(6))
        p.set('lng', Number(mode.lng).toFixed(6))
      }
      break
    }
    case 'location': {
      p.set('focus', 'location')
      p.set('lat', mode.lat.toFixed(6))
      p.set('lng', mode.lng.toFixed(6))
      p.set('q', mode.label)
      if (mode.address) p.set('addr', mode.address)
      if (mode.zip_code) p.set('zip', mode.zip_code)
      if (mode.city) p.set('city', mode.city)
      if (isDateStr(mode.date)) {
        p.set('date', mode.date)
        if (mode.userId != null && Number.isFinite(mode.userId)) {
          p.set('userId', String(mode.userId))
        }
      }
      break
    }
    case 'idle':
      break
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}
