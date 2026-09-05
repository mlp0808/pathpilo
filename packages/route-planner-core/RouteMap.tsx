'use client'

import { useEffect, useLayoutEffect, useRef, useCallback, useMemo, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { buildSequentialPickMapFeatures } from './sequentialPick/buildMapPinFeatures'
import type { MapPinJobInput } from './sequentialPick/buildMapPinFeatures'
import { SEQUENTIAL_PICK_THEME } from './sequentialPick/theme'
import type { SequentialPickId } from './sequentialPick'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

export const USER_COLORS = [
  '#3DD57A', '#FF6B6B', '#4ECDC4', '#45B7D1',
  '#F4A261', '#A8DADC', '#E76F51', '#7B2D8B',
  '#2196F3', '#FF9800',
]

/** Stable employee color from user id — same person always gets the same swatch. */
export function colorForUserId(userId: number): string {
  const id = Math.abs(Number(userId) || 0)
  return USER_COLORS[id % USER_COLORS.length]
}

/** First + last name initials (e.g. "James Walker" → "JW"). */
export function initialsFromName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase()
}

export interface RouteJob {
  id: number | string
  lat: number | null
  lng: number | null
  label: string
  address: string
  time?: string
  etaMinutes?: number
  legMinutes?: number
  is_projected?: boolean
  is_cancelled?: boolean
  has_own_coords?: boolean
  estimated_duration_minutes?: number
  /** Planned job value (all tasks) from jobs API `estimated_price` / `total_price`. */
  estimated_price?: number
  /** Same-client same-day visit size from jobs API (1 = solo). */
  visit_size?: number
  /** Client id when this stop is a real/client job — used to sync overlay pins. */
  client_id?: number | null
  /** Fixed start/end location (e.g. home); shown as employee initials on a color pin */
  is_home?: boolean
  /** Initials drawn on home pins (e.g. "JW"). Falls back to route/user name when omitted. */
  home_initials?: string
  /** Used by plainPins client markers — person vs company glyph inside the dot. */
  client_type?: 'person' | 'company' | string | null
  /** Prospect / searched address — classic teardrop map pin instead of a circle. */
  is_location_pin?: boolean
}

export interface UserRoute {
  userId: number
  userName: string
  color: string
  jobs: RouteJob[]
  totalMinutes?: number
  totalKm?: number
  routeGeometry?: { type: string; coordinates: [number, number][] }
  /** True for pin-only groups (e.g. "nearby clients") — never draw a connecting line even with 2+ jobs. */
  noLine?: boolean
  /**
   * True for client-location overlays (all-clients backdrop, selected client, nearby clients).
   * Skips route sequence numbers; optionally shows a person/company icon from job.client_type.
   */
  plainPins?: boolean
  /** Slightly larger pins — used for employee home backdrop markers so they stand out from client dots. */
  emphasizePins?: boolean
  /**
   * De-emphasize this pin group (smaller + lower opacity) while a route is in focus.
   * Selected / hovered pins stay full strength via bubbled/selected feature props.
   */
  dimPins?: boolean
}

/** Identifies a single route leg for hover-to-isolate on the map. */
export interface IsolatedRouteSeg {
  userId: number
  fromCoord: [number, number]
  toCoord: [number, number]
}

/** Pin for a top-right profile card — always drawn above route/client backdrop layers. */
export type OverlayPin = {
  id: string
  lat: number
  lng: number
  kind: 'location' | 'client'
  label?: string
  /** Shown in the map hover popup (especially for non-client location pins). */
  address?: string
  /** 1-based stop index when this pin is on the focused route; null = brand dark pin. */
  stopNumber?: number | null
  /** Route employee color when stopNumber is set. */
  routeColor?: string | null
}

interface RouteMapProps {
  routes: UserRoute[]
  focusUserId: number | null
  onJobClick: (jobId: number | string) => void
  className?: string
  highlightedJobId?: number | string | null
  /**
   * Persistently “active” pin (e.g. selected client). Updates via setData only —
   * keeps the pin in the same GeoJSON layer so switching clients can bubble
   * without tearing layers down.
   */
  selectedJobId?: number | string | null
  /** Multiple selected pins (e.g. several open client profile cards). */
  selectedJobIds?: (number | string)[]
  /** Brand color for selected plain pins (defaults to dark brand green). */
  selectedPinColor?: string
  /**
   * When true, skip camera fit/refit (client-pin browsing should feel static).
   */
  lockCamera?: boolean
  onPinHover?: (jobId: number | string | null) => void
  /**
   * Highlight a single route leg: hides all other routes and shows only the
   * segment from `fromCoord` to `toCoord` without moving the camera.
   * `null` = no isolation (falls back to normal `focusUserId` behaviour).
   */
  isolatedLeg?: IsolatedRouteSeg | null
  /** Show a "Calculating route…" spinner badge over the map while directions are loading. */
  isDirectionsLoading?: boolean
  /** When true, the map enters manual draw-route mode (white dots, click-to-assign). */
  drawMode?: boolean
  /** Which route accepts draw picks. Defaults to focusUserId, then sole visible route. */
  drawUserId?: number | null
  /** Job ids already assigned a number, in chosen order (only meaningful when drawMode). */
  drawOrder?: (number | string)[]
  /** Called when an un-numbered draw-mode pin is clicked. */
  onDrawAssign?: (jobId: number | string) => void
  /**
   * Drag a stop pin onto another employee's home pin (or a sidebar row tagged
   * with `data-reassign-userid`) to reassign it. Receives the dragged job id,
   * the employee it currently belongs to, and the employee to move it to.
   */
  onReassignJob?: (jobId: number | string, fromUserId: number, toUserId: number) => void
  /**
   * When set, only these users' routes are drawn (used by the AllEmployees panel for
   * hover-to-preview and multi-select-to-isolate). `null` means draw all routes.
   */
  visibleUserIds?: number[] | null
  /** Inset the camera fit so pins sit in the visible map (e.g. above a mobile bottom sheet). */
  fitInsets?: {
    top?: number
    /** Fraction of map container height covered by bottom UI (0–1). */
    bottomRatio?: number
    side?: number
  }
  /** Mapbox +/- zoom buttons. Off on mobile route planner (pinch zoom); on by default. */
  showZoomControl?: boolean
  zoomControlPosition?: 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left'
  /** Faint filled circle (e.g. a search radius around a target location). `null`/omit = none. */
  circleOverlay?: { lat: number; lng: number; radiusKm: number; color?: string } | null
  /**
   * Frame a single point instead of the whole route set — used when the map is
   * opened straight onto one pin (e.g. a client picked from the global search).
   * Runs once per distinct coordinate, and wins over the routes fit.
   */
  focusPoint?: { lat: number; lng: number } | null
  /**
   * Floating profile-card pins (searched locations + open clients). Rendered as
   * HTML markers above every Mapbox layer so they always stay visible and on top.
   */
  overlayPins?: OverlayPin[]
  /** Profile-card hover — makes the matching overlay pin pop. */
  highlightedOverlayId?: string | null
  /** Map pin hover on overlay pins — lights the matching profile card. */
  onOverlayHover?: (id: string | null) => void
  /**
   * Bump when the map phase changes (e.g. back to idle) to force a camera fit
   * even if overlays are open or coords look similar to the previous view.
   */
  cameraFitEpoch?: number | string | null
}

function fmtMin(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function safeRemoveLayer(map: mapboxgl.Map, id: string) {
  try { if (map.getLayer(id)) map.removeLayer(id) } catch { /* ignore */ }
}
function safeRemoveSource(map: mapboxgl.Map, id: string) {
  try { if (map.getSource(id)) map.removeSource(id) } catch { /* ignore */ }
}

/** Keep route planner strictly top-down: style reloads and wide fitBounds can restore globe / pitch. */
function enforceFlatRoadView(map: mapboxgl.Map) {
  try {
    map.setProjection({ name: 'mercator' })
  } catch {
    /* ignore */
  }
  try {
    map.setTerrain(null)
  } catch {
    /* ignore */
  }
  map.setMaxPitch(0)
  map.setMinPitch(0)
  map.setPitch(0)
  map.setBearing(0)
  try {
    map.dragRotate.disable()
    map.touchPitch.disable()
    map.touchZoomRotate.disableRotation()
  } catch {
    /* ignore */
  }
}

function parseCoord(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Mapbox [lng, lat] or null when coords are missing / invalid (API may return strings). */
function jobLngLat(job: Pick<RouteJob, 'lat' | 'lng'>): [number, number] | null {
  const lat = parseCoord(job.lat)
  const lng = parseCoord(job.lng)
  if (lat == null || lng == null) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return [lng, lat]
}

/**
 * Extract the sub-section of a LineString that runs between `from` and `to`.
 * Finds the closest vertex to each endpoint and slices the coordinate array,
 * then clamps the exact job coordinates at both ends.
 */
function sliceLineBetween(
  coords: [number, number][],
  from: [number, number],
  to: [number, number],
): [number, number][] {
  if (coords.length < 2) return [from, to]
  const d2 = (a: [number, number], b: [number, number]) => {
    const dx = a[0] - b[0]; const dy = a[1] - b[1]; return dx * dx + dy * dy
  }
  // Search the first 80% of the line for `from` (avoids double-back routes picking the far end)
  const cap = Math.max(0, Math.floor(coords.length * 0.8))
  let fi = 0; let fd = Infinity
  for (let i = 0; i <= cap; i++) { const d = d2(coords[i], from); if (d < fd) { fd = d; fi = i } }
  // Search from fi onwards for `to`
  let ti = coords.length - 1; let td = Infinity
  for (let i = fi; i < coords.length; i++) { const d = d2(coords[i], to); if (d < td) { td = d; ti = i } }
  const slice = coords.slice(fi, ti + 1)
  if (slice.length === 0) return [from, to]
  // Clamp exact job coordinates at both ends so the line starts/ends exactly at the stops
  return [from, ...slice, to]
}

function visibleRoutesForMap(
  routes: UserRoute[],
  focusUserId: number | null,
  visibleUserIds?: number[] | null,
): UserRoute[] {
  // Overlay layers (searched pins, client cards, homes backdrop) use negative userIds
  // and must stay visible even when the planner filters to specific employees.
  const isOverlay = (r: UserRoute) => r.userId < 0

  // AllEmployees panel hover/select: show only the highlighted employee(s).
  if (visibleUserIds != null && visibleUserIds.length > 0) {
    const filtered = routes.filter(r => isOverlay(r) || visibleUserIds.includes(r.userId))
    return filtered.length > 0 ? filtered : routes
  }
  const effectiveFocus =
    focusUserId ?? (routes.length === 1 ? routes[0]?.userId ?? null : null)
  const focused =
    effectiveFocus != null
      ? routes.filter(r => isOverlay(r) || r.userId === effectiveFocus)
      : routes
  // Stale focus id (employee with no jobs today) — still fit/show everyone
  return focused.length > 0 ? focused : routes
}

function collectCoordsForRoutes(routes: UserRoute[], focusUserId: number | null): [number, number][] {
  const visible = visibleRoutesForMap(routes, focusUserId)
  // When focused on one employee, fit that route only — backdrop client/home
  // layers stay painted but must not yank the camera to the whole company.
  const forFit = focusUserId != null
    ? visible.filter(r => r.userId === focusUserId)
    : visible
  const coords: [number, number][] = []
  const seen = new Set<string>()
  const add = (lng: number, lat: number) => {
    const key = `${lng.toFixed(6)},${lat.toFixed(6)}`
    if (seen.has(key)) return
    seen.add(key)
    coords.push([lng, lat])
  }
  for (const route of forFit) {
    for (const job of route.jobs) {
      const pair = jobLngLat(job)
      if (pair) add(pair[0], pair[1])
    }
    const geom = route.routeGeometry?.coordinates
    if (Array.isArray(geom)) {
      for (const c of geom) {
        if (!Array.isArray(c) || c.length < 2) continue
        const lng = parseCoord(c[0])
        const lat = parseCoord(c[1])
        if (lng != null && lat != null) add(lng, lat)
      }
    }
  }
  return coords
}

function resolveFitPadding(
  map: mapboxgl.Map,
  fitInsets?: RouteMapProps['fitInsets'],
): mapboxgl.PaddingOptions {
  const side = fitInsets?.side ?? 80
  const top = fitInsets?.top ?? 80
  const h = map.getContainer().clientHeight || 0
  const bottom =
    fitInsets?.bottomRatio != null && h > 0
      ? Math.round(h * fitInsets.bottomRatio)
      : 80
  return { top, bottom, left: side, right: side }
}

function fitMapToRouteCoords(
  map: mapboxgl.Map,
  coords: [number, number][],
  opts?: { animated?: boolean; fitInsets?: RouteMapProps['fitInsets'] },
) {
  if (coords.length === 0) return
  const animated = opts?.animated !== false
  const camera = { pitch: 0 as const, bearing: 0 as const }
  const padding = resolveFitPadding(map, opts?.fitInsets)
  try {
    if (coords.length === 1) {
      // fitBounds with padding keeps a lone pin centred in the unobscured map area.
      const [lng, lat] = coords[0]
      const pad = 0.002
      const bounds = new mapboxgl.LngLatBounds(
        [lng - pad, lat - pad],
        [lng + pad, lat + pad],
      )
      if (animated) {
        map.fitBounds(bounds, { padding, duration: 600, maxZoom: 14, ...camera })
      } else {
        map.fitBounds(bounds, { padding, maxZoom: 14, duration: 0, ...camera })
      }
    } else {
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(coords[0], coords[0]),
      )
      if (animated) {
        map.fitBounds(bounds, { padding, duration: 600, maxZoom: 14, ...camera })
      } else {
        map.fitBounds(bounds, { padding, maxZoom: 14, duration: 0, ...camera })
      }
    }
  } catch (e) {
    console.warn('[RouteMap] camera fit failed', e)
  }
}

const OVERLAY_PINS_SOURCE = 'profile-overlay-pins'
const OVERLAY_BRAND = '#193434'

const LOCATION_PIN_W = 26
const LOCATION_PIN_H = 39

function locationPinMarkerSvg(color: string, stopNumber?: number | null): string {
  if (stopNumber != null && stopNumber > 0) {
    const n = String(stopNumber)
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">` +
      `<circle fill="${color}" cx="15" cy="15" r="13"/>` +
      `<circle fill="none" stroke="#ffffff" stroke-width="3" cx="15" cy="15" r="13"/>` +
      `<text x="15" y="15.5" text-anchor="middle" dominant-baseline="central" ` +
      `fill="#ffffff" font-family="system-ui,Segoe UI,sans-serif" font-size="13" font-weight="700">${n}</text>` +
      `</svg>`
    )
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${LOCATION_PIN_W}" height="${LOCATION_PIN_H}" viewBox="0 0 24 36" aria-hidden="true">` +
    `<path fill="${color}" d="M12 0C5.373 0 0 5.373 0 12c0 9.75 12 24 12 24S24 21.75 24 12C24 5.373 18.627 0 12 0z"/>` +
    `<circle fill="#ffffff" cx="12" cy="12" r="5.25"/>` +
    `</svg>`
  )
}

function createLocationDropMarkerElement(
  label: string,
  opts: {
    animate: boolean
    highlighted: boolean
    stopNumber?: number | null
    routeColor?: string | null
  },
): HTMLDivElement {
  const onRoute = opts.stopNumber != null && opts.stopNumber > 0
  const color = onRoute ? (opts.routeColor || OVERLAY_BRAND) : OVERLAY_BRAND
  const w = onRoute ? 30 : LOCATION_PIN_W
  const h = onRoute ? 30 : LOCATION_PIN_H
  const root = document.createElement('div')
  root.dataset.overlayLocationPin = '1'
  root.dataset.stopNumber = onRoute ? String(opts.stopNumber) : ''
  root.dataset.routeColor = onRoute ? color : ''
  root.style.cssText = `width:${w}px;height:${h}px;cursor:pointer;pointer-events:auto;`
  root.style.setProperty('z-index', opts.highlighted ? '40' : '25', 'important')
  root.title = label || 'Location'

  const inner = document.createElement('div')
  inner.style.cssText =
    `width:${w}px;height:${h}px;transform-origin:50% ${onRoute ? '50%' : '100%'};will-change:transform,opacity;` +
    'filter:drop-shadow(0 2px 5px rgba(25,52,52,0.28));'
  inner.innerHTML = locationPinMarkerSvg(color, opts.stopNumber)

  if (opts.animate && !onRoute) {
    // Start above the map — animation brings it down immediately.
    inner.style.opacity = '0'
    inner.style.transform = 'translateY(-48px) scale(1.05)'
  } else {
    inner.style.opacity = '1'
    inner.style.transform = opts.highlighted ? 'translateY(0) scale(1.16)' : 'translateY(0) scale(1)'
  }

  root.appendChild(inner)
  return root
}

function applyLocationMarkerRouteStyle(
  el: HTMLElement,
  pin: Pick<OverlayPin, 'stopNumber' | 'routeColor' | 'label'>,
  highlighted: boolean,
) {
  const onRoute = pin.stopNumber != null && pin.stopNumber > 0
  const color = onRoute ? (pin.routeColor || OVERLAY_BRAND) : OVERLAY_BRAND
  const nextNum = onRoute ? String(pin.stopNumber) : ''
  const nextColor = onRoute ? color : ''
  if (el.dataset.stopNumber === nextNum && el.dataset.routeColor === nextColor) {
    applyLocationMarkerHighlight(el, highlighted)
    return
  }
  el.dataset.stopNumber = nextNum
  el.dataset.routeColor = nextColor
  const w = onRoute ? 30 : LOCATION_PIN_W
  const h = onRoute ? 30 : LOCATION_PIN_H
  el.style.width = `${w}px`
  el.style.height = `${h}px`
  const inner = el.firstElementChild as HTMLElement | null
  if (!inner) return
  inner.style.width = `${w}px`
  inner.style.height = `${h}px`
  inner.style.transformOrigin = onRoute ? '50% 50%' : '50% 100%'
  inner.innerHTML = locationPinMarkerSvg(color, pin.stopNumber)
  applyLocationMarkerHighlight(el, highlighted)
}

function applyLocationMarkerHighlight(el: HTMLElement, highlighted: boolean) {
  const inner = el.firstElementChild as HTMLElement | null
  if (!inner) return
  el.style.setProperty('z-index', highlighted ? '40' : '25', 'important')
  inner.style.transition = 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1), filter 160ms ease'
  inner.style.transform = highlighted ? 'translateY(0) scale(1.16)' : 'translateY(0) scale(1)'
  inner.style.filter = highlighted
    ? 'drop-shadow(0 5px 12px rgba(25,52,52,0.4))'
    : 'drop-shadow(0 2px 5px rgba(25,52,52,0.28))'
  inner.style.opacity = '1'
}

function playLocationDropAnimation(inner: HTMLElement, highlighted: boolean) {
  const land = highlighted ? 'translateY(0) scale(1.16)' : 'translateY(0) scale(1)'
  // Never leave the pin invisible if the animation API hiccups.
  const safety = window.setTimeout(() => {
    inner.style.opacity = '1'
    inner.style.transform = land
  }, 80)
  try {
    const anim = inner.animate(
      [
        { transform: 'translateY(-48px) scale(1.05)', opacity: 0, offset: 0 },
        { transform: 'translateY(4px) scale(1)', opacity: 1, offset: 0.7 },
        { transform: 'translateY(-2px) scale(1.02)', opacity: 1, offset: 0.85 },
        { transform: land, opacity: 1, offset: 1 },
      ],
      {
        duration: 480,
        easing: 'cubic-bezier(0.22, 1.2, 0.36, 1)',
        fill: 'forwards',
      },
    )
    anim.onfinish = () => {
      window.clearTimeout(safety)
      inner.style.opacity = '1'
      inner.style.transform = land
    }
  } catch {
    window.clearTimeout(safety)
    inner.style.opacity = '1'
    inner.style.transform = land
  }
}

function buildOverlayPinCollection(
  pins: OverlayPin[],
  highlightedId: string | null | undefined,
): GeoJSON.FeatureCollection {
  // Clients + searched locations — same GeoJSON stack so cold-open search pins
  // always paint with the map style (HTML teardrops are additive decoration).
  const overlay = pins.filter(p => p.kind === 'client' || p.kind === 'location')
  return {
    type: 'FeatureCollection',
    features: overlay.map(p => ({
      type: 'Feature' as const,
      properties: {
        id: p.id,
        kind: p.kind,
        label: p.label || '',
        address: p.address || p.label || '',
        highlighted: highlightedId === p.id ? 1 : 0,
        stopNumber: p.stopNumber != null && p.stopNumber > 0 ? Number(p.stopNumber) : 0,
        routeColor: p.routeColor || OVERLAY_BRAND,
        onRoute: p.stopNumber != null && p.stopNumber > 0 ? 1 : 0,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [p.lng, p.lat],
      },
    })),
  }
}

/** Dedicated top-of-stack layers for open profile cards (clients + locations). */
function syncOverlayPinLayers(
  map: mapboxgl.Map,
  pins: OverlayPin[],
  highlightedId: string | null | undefined,
  onPick?: (id: string) => void,
  onHover?: (payload: {
    id: string | null
    label?: string
    address?: string
    lngLat?: [number, number]
  }) => void,
) {
  ensureClientTypePinImages(map)

  const data = buildOverlayPinCollection(pins, highlightedId)
  const existing = map.getSource(OVERLAY_PINS_SOURCE) as mapboxgl.GeoJSONSource | undefined

  if (!existing) {
    map.addSource(OVERLAY_PINS_SOURCE, { type: 'geojson', data })

    map.addLayer({
      id: `${OVERLAY_PINS_SOURCE}-ring`,
      type: 'circle',
      source: OVERLAY_PINS_SOURCE,
      filter: ['in', ['get', 'kind'], ['literal', ['client', 'location']]],
      paint: {
        'circle-radius': [
          'case',
          ['==', ['get', 'highlighted'], 1], 28,
          22,
        ],
        'circle-color': [
          'case',
          ['==', ['get', 'onRoute'], 1], ['get', 'routeColor'],
          OVERLAY_BRAND,
        ],
        'circle-opacity': [
          'case',
          ['==', ['get', 'highlighted'], 1], 0.22,
          0.12,
        ],
        'circle-stroke-width': [
          'case',
          ['==', ['get', 'highlighted'], 1], 2.5,
          0,
        ],
        'circle-stroke-color': [
          'case',
          ['==', ['get', 'onRoute'], 1], ['get', 'routeColor'],
          OVERLAY_BRAND,
        ],
        'circle-stroke-opacity': 0.45,
      },
    })

    map.addLayer({
      id: `${OVERLAY_PINS_SOURCE}-client-circle`,
      type: 'circle',
      source: OVERLAY_PINS_SOURCE,
      filter: ['in', ['get', 'kind'], ['literal', ['client', 'location']]],
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          8, ['case', ['==', ['get', 'highlighted'], 1], 16, 13],
          14, ['case', ['==', ['get', 'highlighted'], 1], 22, 17],
        ],
        'circle-color': [
          'case',
          ['==', ['get', 'onRoute'], 1], ['get', 'routeColor'],
          OVERLAY_BRAND,
        ],
        'circle-opacity': 1,
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
      },
    })

    // Brand person icon — only when NOT numbered on a route.
    map.addLayer({
      id: `${OVERLAY_PINS_SOURCE}-client-icon`,
      type: 'symbol',
      source: OVERLAY_PINS_SOURCE,
      filter: ['all', ['==', ['get', 'kind'], 'client'], ['!=', ['get', 'onRoute'], 1]],
      layout: {
        'icon-image': 'client-person-pin-v1',
        'icon-size': [
          'interpolate', ['linear'], ['zoom'],
          8, ['case', ['==', ['get', 'highlighted'], 1], 0.42, 0.34],
          14, ['case', ['==', ['get', 'highlighted'], 1], 0.55, 0.45],
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    })

    // Route stop number — when this open card is on the focused route.
    map.addLayer({
      id: `${OVERLAY_PINS_SOURCE}-client-num`,
      type: 'symbol',
      source: OVERLAY_PINS_SOURCE,
      filter: ['all', ['==', ['get', 'kind'], 'client'], ['==', ['get', 'onRoute'], 1]],
      layout: {
        'text-field': ['to-string', ['get', 'stopNumber']],
        'text-size': [
          'interpolate', ['linear'], ['zoom'],
          8, ['case', ['==', ['get', 'highlighted'], 1], 12, 11],
          14, ['case', ['==', ['get', 'highlighted'], 1], 15, 13],
        ],
        'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#ffffff',
      },
    })

    map.addLayer({
      id: `${OVERLAY_PINS_SOURCE}-hit`,
      type: 'circle',
      source: OVERLAY_PINS_SOURCE,
      filter: ['in', ['get', 'kind'], ['literal', ['client', 'location']]],
      paint: {
        'circle-radius': 26,
        'circle-color': '#000000',
        'circle-opacity': 0.01,
      },
    })
  } else {
    existing.setData(data)
    // Older sessions may lack the number layer — add it once.
    if (!map.getLayer(`${OVERLAY_PINS_SOURCE}-client-num`)) {
      try {
        map.addLayer({
          id: `${OVERLAY_PINS_SOURCE}-client-num`,
          type: 'symbol',
          source: OVERLAY_PINS_SOURCE,
          filter: ['all', ['==', ['get', 'kind'], 'client'], ['==', ['get', 'onRoute'], 1]],
          layout: {
            'text-field': ['to-string', ['get', 'stopNumber']],
            'text-size': 13,
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: { 'text-color': '#ffffff' },
        }, `${OVERLAY_PINS_SOURCE}-hit`)
      } catch { /* ignore */ }
    }
    try {
      map.setFilter(`${OVERLAY_PINS_SOURCE}-client-icon`, [
        'all', ['==', ['get', 'kind'], 'client'], ['!=', ['get', 'onRoute'], 1],
      ])
    } catch { /* ignore */ }
    try {
      map.setFilter(`${OVERLAY_PINS_SOURCE}-hit`, [
        'in', ['get', 'kind'], ['literal', ['client', 'location']],
      ])
    } catch { /* ignore */ }
    try {
      map.setPaintProperty(`${OVERLAY_PINS_SOURCE}-client-circle`, 'circle-color', [
        'case',
        ['==', ['get', 'onRoute'], 1], ['get', 'routeColor'],
        OVERLAY_BRAND,
      ])
      map.setPaintProperty(`${OVERLAY_PINS_SOURCE}-ring`, 'circle-color', [
        'case',
        ['==', ['get', 'onRoute'], 1], ['get', 'routeColor'],
        OVERLAY_BRAND,
      ])
      map.setPaintProperty(`${OVERLAY_PINS_SOURCE}-ring`, 'circle-stroke-color', [
        'case',
        ['==', ['get', 'onRoute'], 1], ['get', 'routeColor'],
        OVERLAY_BRAND,
      ])
    } catch { /* ignore */ }
  }

  // Remove legacy location GeoJSON layers if an older session created them.
  safeRemoveLayer(map, `${OVERLAY_PINS_SOURCE}-location`)
  safeRemoveLayer(map, `${OVERLAY_PINS_SOURCE}-location-dot`)

  const layerIds = [
    `${OVERLAY_PINS_SOURCE}-ring`,
    `${OVERLAY_PINS_SOURCE}-client-circle`,
    `${OVERLAY_PINS_SOURCE}-client-icon`,
    `${OVERLAY_PINS_SOURCE}-client-num`,
    `${OVERLAY_PINS_SOURCE}-hit`,
  ]
  for (const id of layerIds) {
    if (map.getLayer(id)) {
      try { map.moveLayer(id) } catch { /* ignore */ }
    }
  }

  const hitId = `${OVERLAY_PINS_SOURCE}-hit`
  if (map.getLayer(hitId)) {
    type OverlayMapHooks = {
      _overlayHitFn?: (e: mapboxgl.MapLayerMouseEvent) => void
      _overlayEnterFn?: (e: mapboxgl.MapLayerMouseEvent) => void
      _overlayLeaveFn?: () => void
    }
    const hooks = map as unknown as OverlayMapHooks

    if (onPick) {
      const handler = (e: mapboxgl.MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id
        if (id != null) onPick(String(id))
      }
      try { if (hooks._overlayHitFn) map.off('click', hitId, hooks._overlayHitFn) } catch { /* ignore */ }
      hooks._overlayHitFn = handler
      map.on('click', hitId, handler)
    }

    if (onHover) {
      const onEnter = (e: mapboxgl.MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = 'pointer'
        const f = e.features?.[0]
        if (!f) return
        const props = f.properties as { id?: string; label?: string; address?: string; kind?: string }
        const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number]
        onHover({
          id: props.id != null ? String(props.id) : null,
          label: props.label || '',
          address: props.address || props.label || '',
          lngLat: coords,
        })
      }
      const onLeave = () => {
        map.getCanvas().style.cursor = ''
        onHover({ id: null })
      }
      try { if (hooks._overlayEnterFn) map.off('mouseenter', hitId, hooks._overlayEnterFn) } catch { /* ignore */ }
      try { if (hooks._overlayLeaveFn) map.off('mouseleave', hitId, hooks._overlayLeaveFn) } catch { /* ignore */ }
      hooks._overlayEnterFn = onEnter
      hooks._overlayLeaveFn = onLeave
      map.on('mouseenter', hitId, onEnter)
      map.on('mouseleave', hitId, onLeave)
    }
  }
}

function removeOverlayPinLayers(map: mapboxgl.Map) {
  const layerIds = [
    `${OVERLAY_PINS_SOURCE}-hit`,
    `${OVERLAY_PINS_SOURCE}-location`,
    `${OVERLAY_PINS_SOURCE}-location-dot`,
    `${OVERLAY_PINS_SOURCE}-client-num`,
    `${OVERLAY_PINS_SOURCE}-client-icon`,
    `${OVERLAY_PINS_SOURCE}-client-circle`,
    `${OVERLAY_PINS_SOURCE}-ring`,
  ]
  for (const id of layerIds) safeRemoveLayer(map, id)
  safeRemoveSource(map, OVERLAY_PINS_SOURCE)
}

type PinSourceMeta = {
  pickActive: boolean
  pickOrder: SequentialPickId[]
  highlightedId: SequentialPickId | null | undefined
  selectedId?: SequentialPickId | null | undefined
  selectedIds?: SequentialPickId[]
  plainPins?: boolean
}

/** Hover / selected pin bubble — shared by radius + ring paint. */
const BUBBLED: mapboxgl.Expression = ['==', ['get', 'bubbled'], 1]
const SELECTED: mapboxgl.Expression = ['==', ['get', 'selected'], 1]
const DEFAULT_SELECTED_PIN_COLOR = '#193434'
/** Soft spring-ish paint transition for the bubble grow/shrink. */
const BUBBLE_TRANSITION = { duration: 280, delay: 0 }

const PICK_PIN_ICON_ID = 'sequential-pick-pin'
const PERSON_PIN_ICON_ID = 'client-person-pin-v1'
const COMPANY_PIN_ICON_ID = 'client-company-pin-v1'

/** Heroicons outline User — white glyph for person clients on plain pins. */
const PERSON_PIN_ICON_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
  `<path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/>` +
  `</svg>`

/** Heroicons outline BuildingOffice2 — white glyph for company clients on plain pins. */
const COMPANY_PIN_ICON_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">` +
  `<path d="M3.75 21h16.5M4.5 3h15v18h-15V3Z"/>` +
  `<path d="M9 6.75h.008v.008H9V6.75Zm3 0h.008v.008H12V6.75Zm3 0h.008v.008H15V6.75ZM9 10.5h.008v.008H9V10.5Zm3 0h.008v.008H12V10.5Zm3 0h.008v.008H15V10.5ZM9 14.25h.008v.008H9v-.008Zm3 0h.008v.008H12v-.008Zm3 0h.008v.008H15v-.008Z"/>` +
  `<path d="M9 21v-4.5h6V21"/>` +
  `</svg>`

function loadMapSvgImage(map: mapboxgl.Map, id: string, svg: string) {
  if (map.hasImage(id)) return
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  const img = new Image(64, 64)
  img.onload = () => {
    if (!map.hasImage(id)) {
      map.addImage(id, img, { pixelRatio: 2 })
      map.triggerRepaint()
    }
  }
  img.src = url
}

function ensureClientTypePinImages(map: mapboxgl.Map) {
  loadMapSvgImage(map, PERSON_PIN_ICON_ID, PERSON_PIN_ICON_SVG)
  loadMapSvgImage(map, COMPANY_PIN_ICON_ID, COMPANY_PIN_ICON_SVG)
}

/** Load location-pin SVG into the map sprite (idle unpicked stops). */
function ensureSequentialPickPinImage(map: mapboxgl.Map) {
  if (map.hasImage(PICK_PIN_ICON_ID)) return
  const fill = SEQUENTIAL_PICK_THEME.pinIdleIcon
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="${fill}" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>`
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  const img = new Image(24, 24)
  img.onload = () => {
    if (!map.hasImage(PICK_PIN_ICON_ID)) {
      map.addImage(PICK_PIN_ICON_ID, img, { pixelRatio: 2 })
      map.triggerRepaint()
    }
  }
  img.src = url
}

function buildPinFeatures(jobs: RouteJob[], meta: PinSourceMeta) {
  // RouteJob allows null coords; the feature builder filters those out.
  return buildSequentialPickMapFeatures(jobs as MapPinJobInput[], meta)
}

/** Ensure every home pin carries initials for the map glyph (color circle + letters). */
function withHomeInitials(jobs: RouteJob[], userName: string): RouteJob[] {
  const fallback = initialsFromName(userName)
  if (!fallback || fallback === '?') return jobs
  return jobs.map(j =>
    j.is_home && !String(j.home_initials || '').trim()
      ? { ...j, home_initials: fallback }
      : j
  )
}

/** Polygon approximating a circle of `radiusKm` around [lat,lng] (equirectangular — fine at city scale). */
function buildCirclePolygon(lat: number, lng: number, radiusKm: number, steps = 64): [number, number][] {
  const kmPerDegLat = 110.574
  const kmPerDegLng = 111.32 * Math.cos((lat * Math.PI) / 180)
  const coords: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    const dLat = (radiusKm * Math.sin(angle)) / kmPerDegLat
    const dLng = (radiusKm * Math.cos(angle)) / (kmPerDegLng || 1)
    coords.push([lng + dLng, lat + dLat])
  }
  return coords
}

/** Mapbox stringifies GeoJSON properties on feature query — avoid `if (props.isHome)`. */
function featIsHome(props: { isHome?: unknown }): boolean {
  const v = props.isHome
  return v === true || v === 1 || v === '1'
}

function featJobId(props: { jobId?: unknown }): number | string {
  const id = props.jobId
  if (typeof id === 'number' && !Number.isNaN(id)) return id
  if (typeof id === 'string' && id !== '') return id
  const n = Number(id)
  return Number.isNaN(n) ? String(id) : n
}

export default function RouteMap({
  routes,
  focusUserId,
  onJobClick,
  className,
  highlightedJobId,
  selectedJobId,
  selectedJobIds,
  selectedPinColor = DEFAULT_SELECTED_PIN_COLOR,
  lockCamera = false,
  onPinHover,
  isolatedLeg,
  isDirectionsLoading,
  drawMode,
  drawUserId,
  drawOrder,
  onDrawAssign,
  onReassignJob,
  visibleUserIds,
  fitInsets,
  showZoomControl = true,
  zoomControlPosition = 'top-right',
  circleOverlay,
  focusPoint,
  overlayPins = [],
  highlightedOverlayId = null,
  onOverlayHover,
  cameraFitEpoch = null,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const navControlRef = useRef<mapboxgl.NavigationControl | null>(null)
  const hoverPopupRef = useRef<mapboxgl.Popup | null>(null)  // shown on hover
  const clickPopupRef = useRef<mapboxgl.Popup | null>(null)  // shown on click (stays until next click)
  const addedSourcesRef = useRef<{ id: string; layers: string[] }[]>([])

  // Maps active-pin sourceId → jobs + pick meta for lightweight setData updates
  const pinSourceJobsRef = useRef<Record<string, RouteJob[]>>({})
  const pinSourceMetaRef = useRef<Record<string, PinSourceMeta>>({})
  // Tracks mouseenter/leave handlers for cleanup on redraw
  const hoverHandlersRef = useRef<{ layer: string; type: string; fn: (e?: mapboxgl.MapLayerMouseEvent) => void }[]>([])
  // Tracks click handlers for cleanup on redraw — Mapbox keeps them bound to the
  // layer id even after the layer is removed, so they leak across draws otherwise.
  const clickHandlersRef = useRef<{ layer: string; fn: (e: mapboxgl.MapLayerMouseEvent) => void }[]>([])
  const mapClickHandlersRef = useRef<{ fn: (e: mapboxgl.MapMouseEvent) => void }[]>([])
  const onDrawAssignRef = useRef(onDrawAssign)
  onDrawAssignRef.current = onDrawAssign
  const onJobClickRef = useRef(onJobClick)
  onJobClickRef.current = onJobClick
  const onOverlayHoverRef = useRef(onOverlayHover)
  onOverlayHoverRef.current = onOverlayHover
  const drawModeRef = useRef(!!drawMode)
  drawModeRef.current = !!drawMode
  const onReassignJobRef = useRef(onReassignJob)
  onReassignJobRef.current = onReassignJob
  // Layer-bound mousedown handlers for pin dragging (cleaned up on each redraw).
  const dragHandlersRef = useRef<{ layer: string; fn: (e: mapboxgl.MapLayerMouseEvent) => void }[]>([])
  // Circle layer ids that contain home pins, used as drop-target hit layers.
  const homeLayersRef = useRef<string[]>([])
  // Set true briefly after a drag so the trailing click doesn't open the job.
  const suppressClickRef = useRef(false)
  /** Swallow duplicate layer + map fallback picks on the same stop within one frame. */
  const recentPickRef = useRef<{ key: string; at: number } | null>(null)
  /** Cancel stale moveend listener when draw() runs again before camera animation finishes. */
  const pendingMoveEndEnforceRef = useRef<(() => void) | null>(null)
  const hasFittedCameraRef = useRef(false)
  /** Increments when the Mapbox style finishes loading — lets overlay pin sync retry. */
  const [mapReadyTick, setMapReadyTick] = useState(0)

  // Sorted so the key is invariant to which route contributed a coordinate first — e.g. clicking
  // between pins on a shared "all clients" backdrop reshuffles route order but not the underlying
  // point set, and should never re-trigger a camera fit.
  const routesFitKey = useMemo(
    () => collectCoordsForRoutes(routes, focusUserId).map(c => c.join(',')).sort().join('|'),
    [routes, focusUserId],
  )

  const overlayPinsKey = useMemo(
    () => overlayPins.map(p => `${p.id}::${p.kind}::${p.lat.toFixed(5)},${p.lng.toFixed(5)}::${p.stopNumber ?? ''}:${p.routeColor ?? ''}::${p.address ?? ''}::${p.label ?? ''}`).sort().join('|') || null,
    [overlayPins],
  )
  const newestOverlayPinKey = overlayPins.length > 0 ? overlayPins[0]?.id ?? null : null
  const overlayPinsRef = useRef(overlayPins)
  overlayPinsRef.current = overlayPins
  const highlightedOverlayIdRef = useRef(highlightedOverlayId)
  highlightedOverlayIdRef.current = highlightedOverlayId
  const lastBroughtOverlayIdRef = useRef<string | null>(null)
  /** HTML teardrop markers for location overlays (drop + bounce). */
  const locationPinMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  /** Ids that have already played their drop animation (while still open). */
  const animatedLocationIdsRef = useRef<Set<string>>(new Set())
  /** First pin sync after map create — skip drop anim (avoids opacity-0 race on cold nav). */
  const skipNextLocationDropAnimRef = useRef(true)

  // ── Init map once ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!TOKEN) { console.error('NEXT_PUBLIC_MAPBOX_TOKEN not set'); return }
    mapboxgl.accessToken = TOKEN

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      // Neutral default until route coords load (old default was Denmark and stuck when fit skipped)
      center: [-1.5, 52.5],
      zoom: 6,
      // Always top-down “on the road” map — never oblique / bird’s-eye (pitch)
      pitch: 0,
      bearing: 0,
      minPitch: 0,
      maxPitch: 0,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      // v3 defaults can use globe at low zoom; mercator stays flat for route planning
      projection: { name: 'mercator' },
    })
    // Belt-and-suspenders: block any gesture that could reintroduce tilt or spin
    map.dragRotate.disable()
    map.touchPitch.disable()
    map.touchZoomRotate.disableRotation()
    const onStyleLoad = () => {
      enforceFlatRoadView(map)
      setMapReadyTick(t => t + 1)
    }
    const onInitialLoad = () => {
      enforceFlatRoadView(map)
      setMapReadyTick(t => t + 1)
    }
    // Style JSON and style updates can reset projection / pitch (common on first wide fitBounds)
    map.once('load', onInitialLoad)
    map.on('style.load', onStyleLoad)
    mapRef.current = map

    // Mapbox only reacts to window resize events by default. When the
    // container itself changes size without the window resizing (e.g.
    // toggling a fullscreen layout, or a sidebar collapsing), nudge it.
    const ro = new ResizeObserver(() => {
      try { map.resize() } catch { /* ignore */ }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      if (pendingMoveEndEnforceRef.current) {
        try { map.off('moveend', pendingMoveEndEnforceRef.current) } catch { /* ignore */ }
        pendingMoveEndEnforceRef.current = null
      }
      try { map.off('load', onInitialLoad) } catch { /* ignore */ }
      try { map.off('style.load', onStyleLoad) } catch { /* ignore */ }
      try { removeOverlayPinLayers(map) } catch { /* ignore */ }
      for (const marker of locationPinMarkersRef.current.values()) {
        try { marker.remove() } catch { /* ignore */ }
      }
      locationPinMarkersRef.current.clear()
      animatedLocationIdsRef.current.clear()
      skipNextLocationDropAnimRef.current = true
      hasFittedCameraRef.current = false
      lastBroughtOverlayIdRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (navControlRef.current) {
      try { map.removeControl(navControlRef.current) } catch { /* ignore */ }
      navControlRef.current = null
    }

    if (showZoomControl) {
      const ctrl = new mapboxgl.NavigationControl({ showCompass: false })
      map.addControl(ctrl, zoomControlPosition)
      navControlRef.current = ctrl
    }
  }, [showZoomControl, zoomControlPosition])

  const focusPointKey = focusPoint ? `${focusPoint.lat},${focusPoint.lng}` : null
  /** Last cameraFitEpoch we applied a forced (phase) fit for. */
  const lastForcedEpochRef = useRef(cameraFitEpoch)
  const focusPointRef = useRef(focusPoint)
  focusPointRef.current = focusPoint

  // Fit camera when coords appear (geocode, load day routes) — separate from layer draw().
  // lockCamera: browsing client pins should not pan/zoom on every selection change.
  // focusPoint: framing one pin owns the camera — never let the all-clients backdrop
  // (or a phase fit) yank us back out to country level.
  useEffect(() => {
    const map = mapRef.current
    const force = cameraFitEpoch !== lastForcedEpochRef.current
    if (lockCamera) return
    // Single-pin framing always wins over route / all-clients fits.
    if (focusPointKey) return
    if (!map || !routesFitKey) {
      hasFittedCameraRef.current = false
      return
    }

    const scheduleEnforceAfterMove = () => {
      if (pendingMoveEndEnforceRef.current) {
        try { map.off('moveend', pendingMoveEndEnforceRef.current) } catch { /* ignore */ }
      }
      const onMoveEnd = () => {
        pendingMoveEndEnforceRef.current = null
        enforceFlatRoadView(map)
      }
      pendingMoveEndEnforceRef.current = onMoveEnd
      map.once('moveend', onMoveEnd)
    }

    const runFit = () => {
      // Focus may have landed between schedule and run — don't overwrite it.
      if (focusPointRef.current) return
      const coords = collectCoordsForRoutes(routes, focusUserId)
      if (focusUserId == null) {
        for (const p of overlayPinsRef.current) {
          if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
          coords.push([p.lng, p.lat])
        }
      }
      if (coords.length === 0) return
      const animated = force || hasFittedCameraRef.current
      fitMapToRouteCoords(map, coords, { animated, fitInsets })
      hasFittedCameraRef.current = true
      lastForcedEpochRef.current = cameraFitEpoch
      enforceFlatRoadView(map)
      scheduleEnforceAfterMove()
    }

    const scheduleFit = () => {
      const h = map.getContainer().clientHeight
      if (fitInsets?.bottomRatio != null && h < 100) {
        requestAnimationFrame(() => requestAnimationFrame(runFit))
        return
      }
      runFit()
    }

    if (map.isStyleLoaded()) scheduleFit()
    else {
      map.once('load', scheduleFit)
      return () => { try { map.off('load', scheduleFit) } catch { /* ignore */ } }
    }
  }, [routesFitKey, routes, focusUserId, fitInsets, lockCamera, focusPointKey, cameraFitEpoch])

  // When focus / isolation set changes, drop any sticky pin hover.
  useEffect(() => {
    try { onPinHover?.(null) } catch { /* ignore */ }
    if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    focusUserId,
    visibleUserIds?.join(',') ?? '',
    isolatedLeg?.userId,
    isolatedLeg?.fromCoord?.[0],
    isolatedLeg?.fromCoord?.[1],
    isolatedLeg?.toCoord?.[0],
    isolatedLeg?.toCoord?.[1],
  ])

  // Frame a single searched client/location tightly (street-level). Uses easeTo
  // with an explicit zoom so padding / all-clients fits cannot leave us at UK scale.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusPoint) return

    let cancelled = false
    let attempts = 0

    const run = () => {
      if (cancelled) return
      const fp = focusPointRef.current
      if (!fp) return
      try { map.resize() } catch { /* ignore */ }
      const h = map.getContainer().clientHeight
      const w = map.getContainer().clientWidth
      // Map may still be 0×0 on the first paint after navigating to /map — retry.
      if (h < 40 || w < 40) {
        if (attempts++ < 20) {
          window.setTimeout(run, 50)
        }
        return
      }
      try {
        map.stop() // cancel any in-flight all-clients fitBounds
        map.easeTo({
          center: [fp.lng, fp.lat],
          zoom: 14,
          duration: hasFittedCameraRef.current ? 700 : 0,
          pitch: 0,
          bearing: 0,
          essential: true,
        })
        hasFittedCameraRef.current = true
        enforceFlatRoadView(map)
      } catch (e) {
        console.warn('[RouteMap] focus zoom failed', e)
      }
    }

    if (map.isStyleLoaded()) {
      requestAnimationFrame(() => requestAnimationFrame(run))
      return () => { cancelled = true }
    }
    const onLoad = () => { if (!cancelled) run() }
    map.once('load', onLoad)
    return () => {
      cancelled = true
      try { map.off('load', onLoad) } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPointKey, mapReadyTick])

  const handleOverlayHover = useCallback((payload: {
    id: string | null
    label?: string
    address?: string
    lngLat?: [number, number]
  }) => {
    onOverlayHoverRef.current?.(payload.id)
    const map = mapRef.current
    if (!map) return
    if (!payload.id || !payload.lngLat) {
      if (hoverPopupRef.current) {
        try { hoverPopupRef.current.remove() } catch { /* ignore */ }
        hoverPopupRef.current = null
      }
      return
    }
    const address = (payload.address || payload.label || '').trim()
    const label = (payload.label || '').trim()
    const showLabel = label && label !== address
    if (hoverPopupRef.current) {
      try { hoverPopupRef.current.remove() } catch { /* ignore */ }
    }
    hoverPopupRef.current = new mapboxgl.Popup({
      offset: 18,
      closeButton: false,
      closeOnClick: false,
      maxWidth: '260px',
      className: 'vevago-hover-popup',
    })
      .setLngLat(payload.lngLat)
      .setHTML(`
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:2px 0">
          <div style="height:3px;background:${OVERLAY_BRAND};border-radius:2px;margin:-10px -10px 10px -10px"></div>
          ${showLabel ? `<p style="margin:0;font-size:13px;font-weight:700;color:#111;line-height:1.25">${escapeHtml(label)}</p>` : ''}
          <p style="margin:${showLabel ? '3px' : '0'} 0 0;font-size:12px;color:#555;line-height:1.35">${escapeHtml(address || label)}</p>
        </div>
      `)
      .addTo(map)
  }, [])

  const bindOverlayLayers = useCallback((
    map: mapboxgl.Map,
    pins: OverlayPin[],
    highlighted: string | null | undefined,
  ) => {
    syncOverlayPinLayers(
      map,
      pins,
      highlighted,
      (id) => onJobClickRef.current?.(id),
      handleOverlayHover,
    )
  }, [handleOverlayHover])
  useLayoutEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const pins = overlayPinsRef.current
    const highlighted = highlightedOverlayIdRef.current
    const markers = locationPinMarkersRef.current
    const locations = pins.filter(p => p.kind === 'location')
    const ids = new Set(locations.map(p => p.id))

    // Drop closed location markers
    for (const [id, marker] of Array.from(markers.entries())) {
      if (ids.has(id)) continue
      try { marker.remove() } catch { /* ignore */ }
      markers.delete(id)
      animatedLocationIdsRef.current.delete(id)
    }

    if (pins.length === 0) {
      removeOverlayPinLayers(map)
      lastBroughtOverlayIdRef.current = null
      return
    }

    bindOverlayLayers(map, pins, highlighted)

    // Location pins are painted via GeoJSON (same stack as clients) so they
    // survive cold map opens. HTML teardrops are only used for on-route numbered stops.
    for (const pin of locations) {
      const nowOnRoute = pin.stopNumber != null && pin.stopNumber > 0
      if (!nowOnRoute) {
        const existingPlain = markers.get(pin.id)
        if (existingPlain) {
          try { existingPlain.remove() } catch { /* ignore */ }
          markers.delete(pin.id)
        }
        continue
      }
      const isHighlighted = highlighted === pin.id
      let existing = markers.get(pin.id)
      if (existing) {
        const wasOnRoute = !!existing.getElement().dataset.stopNumber
        if (wasOnRoute !== nowOnRoute) {
          try { existing.remove() } catch { /* ignore */ }
          markers.delete(pin.id)
          existing = undefined
        } else {
          existing.setLngLat([pin.lng, pin.lat])
          applyLocationMarkerRouteStyle(existing.getElement(), pin, isHighlighted)
          continue
        }
      }

      const el = createLocationDropMarkerElement(pin.label || '', {
        animate: false,
        highlighted: isHighlighted,
        stopNumber: pin.stopNumber,
        routeColor: pin.routeColor,
      })
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onJobClickRef.current?.(pin.id)
      })
      el.addEventListener('mouseenter', () => {
        handleOverlayHover({
          id: pin.id,
          label: pin.label || '',
          address: pin.address || pin.label || '',
          lngLat: [pin.lng, pin.lat],
        })
        applyLocationMarkerHighlight(el, true)
      })
      el.addEventListener('mouseleave', () => {
        handleOverlayHover({ id: null })
        applyLocationMarkerHighlight(el, highlightedOverlayIdRef.current === pin.id)
      })
      const marker = new mapboxgl.Marker({
        element: el,
        anchor: 'center',
        offset: [0, 0],
      })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map)
      el.style.setProperty('z-index', isHighlighted ? '40' : '25', 'important')
      markers.set(pin.id, marker)
      animatedLocationIdsRef.current.add(pin.id)
    }

    skipNextLocationDropAnimRef.current = false

    // When focusPoint is framing a pin, skip soft bring-into-view — the focus
    // effect owns the tight zoom (same as client search).
    const newest = pins[0]
    if (newest && lastBroughtOverlayIdRef.current !== newest.id && !focusPointKey) {
      lastBroughtOverlayIdRef.current = newest.id
      try {
        const bounds = map.getBounds()
        if (bounds) {
          const padLng = (bounds.getEast() - bounds.getWest()) * 0.08
          const padLat = (bounds.getNorth() - bounds.getSouth()) * 0.08
          const { lng, lat } = newest
          const inside =
            lng >= bounds.getWest() + padLng &&
            lng <= bounds.getEast() - padLng &&
            lat >= bounds.getSouth() + padLat &&
            lat <= bounds.getNorth() - padLat
          if (!inside) {
            const next = bounds.extend([lng, lat])
            const padding = resolveFitPadding(map, fitInsets)
            map.fitBounds(next, {
              padding,
              duration: 650,
              maxZoom: map.getZoom(),
              pitch: 0,
              bearing: 0,
            })
            hasFittedCameraRef.current = true
            enforceFlatRoadView(map)
          }
        }
      } catch (e) {
        console.warn('[RouteMap] bring overlay pin into view failed', e)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayPinsKey, mapReadyTick, bindOverlayLayers, handleOverlayHover])

  // Hover highlight for existing location markers (does not remount / re-animate).
  useEffect(() => {
    const markers = locationPinMarkersRef.current
    for (const [id, marker] of markers.entries()) {
      if (!animatedLocationIdsRef.current.has(id)) continue
      applyLocationMarkerHighlight(marker.getElement(), highlightedOverlayId === id)
    }
    // Also refresh client GeoJSON highlight without remounting location markers.
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    if (overlayPinsRef.current.some(p => p.kind === 'client' || p.kind === 'location')) {
      bindOverlayLayers(map, overlayPinsRef.current, highlightedOverlayId)
    }
  }, [highlightedOverlayId, bindOverlayLayers])

  // Pin data refresh on hover / selection (layer swap handled in draw() + useLayoutEffect).
  useLayoutEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    Object.entries(pinSourceJobsRef.current).forEach(([sourceId, jobs]) => {
      const src = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
      const meta = pinSourceMetaRef.current[sourceId]
      if (!src || !meta) return

      const nextMeta: PinSourceMeta = {
        pickActive: meta.pickActive,
        pickOrder: drawOrder ?? [],
        highlightedId: highlightedJobId,
        selectedId: selectedJobId,
        selectedIds: selectedJobIds,
        plainPins: meta.plainPins,
      }
      pinSourceMetaRef.current[sourceId] = nextMeta
      src.setData({
        type: 'FeatureCollection',
        features: buildPinFeatures(jobs, nextMeta),
      })
    })
  }, [highlightedJobId, selectedJobId, selectedJobIds, drawOrder])

  // ── Full redraw when routes / focus change ────────────────────────────────
  const draw = useCallback(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null }
    if (clickPopupRef.current) { clickPopupRef.current.remove(); clickPopupRef.current = null }

    hoverHandlersRef.current.forEach(({ layer, type, fn }) => {
      try { map.off(type as 'mouseenter' | 'mouseleave', layer, fn) } catch { /* ignore */ }
    })
    hoverHandlersRef.current = []
    clickHandlersRef.current.forEach(({ layer, fn }) => {
      try { map.off('click', layer, fn) } catch { /* ignore */ }
    })
    clickHandlersRef.current = []
    mapClickHandlersRef.current.forEach(({ fn }) => {
      try { map.off('click', fn) } catch { /* ignore */ }
    })
    mapClickHandlersRef.current = []
    dragHandlersRef.current.forEach(({ layer, fn }) => {
      try { map.off('mousedown', layer, fn) } catch { /* ignore */ }
    })
    dragHandlersRef.current = []
    homeLayersRef.current = []

    addedSourcesRef.current.forEach(({ id, layers }) => {
      layers.forEach(lid => safeRemoveLayer(map, lid))
      safeRemoveSource(map, id)
    })
    addedSourcesRef.current = []
    pinSourceJobsRef.current = {}
    pinSourceMetaRef.current = {}

    // ── Optional radius circle (e.g. "clients within N km" search) ──────────
    if (circleOverlay) {
      const { lat, lng, radiusKm, color } = circleOverlay
      const fillColor = color || '#6366F1'
      try {
        const cId = 'circle-overlay'
        map.addSource(cId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [buildCirclePolygon(lat, lng, radiusKm)] },
          },
        })
        map.addLayer({
          id: `${cId}-fill`,
          type: 'fill',
          source: cId,
          paint: { 'fill-color': fillColor, 'fill-opacity': 0.07 },
        })
        map.addLayer({
          id: `${cId}-outline`,
          type: 'line',
          source: cId,
          paint: { 'line-color': fillColor, 'line-width': 1.5, 'line-opacity': 0.4, 'line-dasharray': [2, 2] },
        })
        addedSourcesRef.current.push({ id: cId, layers: [`${cId}-fill`, `${cId}-outline`] })
      } catch (e) { console.warn('circle overlay add failed', e) }
    }

    // Hover-to-isolate: show only the hovered leg's route user; camera stays put.
    // ONLY apply isolatedLeg when we are already focused on a single employee.
    // In all-employees overview (focusUserId == null) always show every route,
    // even if isolatedLeg was somehow left set from a previous focused session.
    const visibilityFocus =
      focusUserId != null && isolatedLeg != null ? isolatedLeg.userId : focusUserId
    // visibleUserIds only applies in all-employees mode (when focusUserId is null)
    const panelVisibleUserIds = focusUserId == null ? visibleUserIds : null
    const visibleRoutes = visibleRoutesForMap(routes, visibilityFocus, panelVisibleUserIds)

    // Solo companies may show a route before dayFocusUserId is set — align draw mode
    // with the single visible route in that case.
    const drawTargetUserId =
      drawUserId ?? focusUserId ?? (visibleRoutes.length === 1 ? visibleRoutes[0].userId : null)

    const drawPickLayers: string[] = []

    const handlePinPick = (props: { jobId?: unknown; isHome?: unknown }) => {
      if (suppressClickRef.current) return
      const jobId = featJobId(props)
      // Route depot start/end pins are not clickable. Backdrop employee homes (`home-{id}`) are.
      if (featIsHome(props)) {
        if (typeof jobId !== 'string' || !jobId.startsWith('home-')) return
      }
      const pickKey = String(jobId)
      const now = performance.now()
      if (recentPickRef.current?.key === pickKey && now - recentPickRef.current.at < 150) return
      recentPickRef.current = { key: pickKey, at: now }
      if (clickPopupRef.current) { clickPopupRef.current.remove(); clickPopupRef.current = null }
      // Refs — not the draw() closure — so the first click right after toggling
      // draw mode never falls through to onJobClick while layers are swapping.
      if (drawModeRef.current && onDrawAssignRef.current) {
        onDrawAssignRef.current(jobId)
        return
      }
      // Preserve string ids (e.g. "ac-123" map multitool pins, "subscription-1-2" projected
      // jobs). Only coerce pure numeric strings so Mapbox's stringified properties still
      // arrive as numbers for real job rows.
      if (typeof jobId === 'number') {
        onJobClickRef.current(jobId)
      } else if (/^-?\d+$/.test(String(jobId))) {
        onJobClickRef.current(Number(jobId))
      } else {
        onJobClickRef.current(jobId)
      }
    }

    // ── Pin drag-to-reassign machinery ──────────────────────────────────────
    // Begins a potential drag on pin mousedown. A real drag only starts once the
    // pointer moves past a small threshold (so plain clicks still open the job).
    const startPinDrag = (
      jobId: number | string,
      fromUserId: number,
      label: string,
      ev: MouseEvent,
    ) => {
      const startX = ev.clientX
      const startY = ev.clientY
      let dragging = false
      let ghost: HTMLDivElement | null = null
      let lastHover: Element | null = null

      const moveGhost = (x: number, y: number) => {
        if (ghost) { ghost.style.left = `${x + 14}px`; ghost.style.top = `${y + 14}px` }
      }

      const begin = () => {
        dragging = true
        try { map.dragPan.disable() } catch { /* ignore */ }
        map.getCanvas().style.cursor = 'grabbing'
        document.body.classList.add('vevago-reassigning')
        ghost = document.createElement('div')
        ghost.className = 'vevago-drag-ghost'
        ghost.textContent = label
        document.body.appendChild(ghost)
        moveGhost(startX, startY)
      }

      const highlightUnder = (x: number, y: number): Element | null => {
        const el = document.elementFromPoint(x, y)
        return el ? el.closest('[data-reassign-userid]') : null
      }

      const onMove = (me: MouseEvent) => {
        if (!dragging) {
          if (Math.abs(me.clientX - startX) + Math.abs(me.clientY - startY) < 5) return
          begin()
        }
        moveGhost(me.clientX, me.clientY)
        const target = highlightUnder(me.clientX, me.clientY)
        if (target !== lastHover) {
          lastHover?.classList.remove('vevago-drop-hover')
          target?.classList.add('vevago-drop-hover')
          lastHover = target
        }
      }

      const finish = (toUserId: number | null) => {
        if (toUserId != null && Number.isFinite(toUserId) && toUserId !== fromUserId) {
          onReassignJobRef.current?.(jobId, fromUserId, toUserId)
        }
      }

      const onUp = (ue: MouseEvent) => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        if (!dragging) return  // was a plain click — let normal handlers run

        // Teardown visuals
        try { map.dragPan.enable() } catch { /* ignore */ }
        map.getCanvas().style.cursor = ''
        document.body.classList.remove('vevago-reassigning')
        lastHover?.classList.remove('vevago-drop-hover')
        ghost?.remove()
        // Swallow the click Mapbox fires right after the drag.
        suppressClickRef.current = true
        setTimeout(() => { suppressClickRef.current = false }, 60)

        // 1) Dropped on a sidebar employee row?
        const sidebarTarget = highlightUnder(ue.clientX, ue.clientY)
        if (sidebarTarget) {
          finish(Number(sidebarTarget.getAttribute('data-reassign-userid')))
          return
        }

        // 2) Dropped on a home pin on the map?
        const rect = map.getCanvas().getBoundingClientRect()
        const inside =
          ue.clientX >= rect.left && ue.clientX <= rect.right &&
          ue.clientY >= rect.top && ue.clientY <= rect.bottom
        if (!inside) return
        const pt: [number, number] = [ue.clientX - rect.left, ue.clientY - rect.top]
        const layers = homeLayersRef.current.filter(id => map.getLayer(id))
        if (layers.length === 0) return
        const feats = map.queryRenderedFeatures(pt, { layers })
        const homeFeat = feats.find(f => featIsHome(f.properties as { isHome?: unknown }))
        if (!homeFeat) return
        const homeId = String(featJobId(homeFeat.properties as { jobId?: unknown }))
        const m = homeId.match(/(?:start|end)-(\d+)/)
        finish(m ? Number(m[1]) : null)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }

    visibleRoutes.forEach(route => {
      const pts = route.jobs.filter(j => jobLngLat(j) != null)
      if (pts.length === 0) return

      const activeJobs = pts.filter(j => !j.is_cancelled)
      const cancelledJobs = pts.filter(j => j.is_cancelled)

      const isRouteInDrawMode = !!drawMode && drawTargetUserId === route.userId

      // ── Route line (hidden during draw mode) ──
      // Prefer Mapbox road geometry. If it hasn't arrived yet (preview / slow
      // Directions), connect the ordered pins so the path is still visible.
      const roadCoords = route.routeGeometry?.coordinates
      const pinCoords = activeJobs
        .map(j => jobLngLat(j))
        .filter((c): c is [number, number] => c != null)
      const fullLineCoords =
        roadCoords && roadCoords.length >= 2
          ? roadCoords
          : (pinCoords.length >= 2 ? pinCoords : null)
      const usingRoadGeometry = !!(roadCoords && roadCoords.length >= 2)
      // When a specific leg is isolated, slice the geometry to just that segment.
      const lineCoords =
        fullLineCoords && isolatedLeg != null && isolatedLeg.userId === route.userId && usingRoadGeometry
          ? sliceLineBetween(fullLineCoords as [number, number][], isolatedLeg.fromCoord, isolatedLeg.toCoord)
          : fullLineCoords

      if (!isRouteInDrawMode && !route.noLine && activeJobs.length >= 2 && lineCoords && lineCoords.length >= 2) {
        // Avoid `line--100` style ids for synthetic preview userIds.
        const lId = `line-u${route.userId}`
        try {
          map.addSource(lId, {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: lineCoords } },
          })
          map.addLayer({
            id: `${lId}-halo`,
            type: 'line',
            source: lId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': route.color, 'line-width': 12, 'line-opacity': 0.12 },
          })
          map.addLayer({
            id: lId,
            type: 'line',
            source: lId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': route.color,
              'line-width': usingRoadGeometry ? 3 : 2.5,
              'line-opacity': usingRoadGeometry ? 0.85 : 0.7,
              ...(usingRoadGeometry ? {} : { 'line-dasharray': [1.2, 2.2] }),
            },
          })
          addedSourcesRef.current.push({ id: lId, layers: [`${lId}-halo`, lId] })
        } catch (e) { console.warn('line add failed', e) }
      }

      // ── Active pins ──────────────────────────────────────────────────────
      if (activeJobs.length > 0) {
        const pId = `pins-u${route.userId}`
        const pickMeta: PinSourceMeta = {
          pickActive: isRouteInDrawMode,
          pickOrder: drawOrder ?? [],
          highlightedId: highlightedJobId,
          selectedId: selectedJobId,
          selectedIds: selectedJobIds,
          plainPins: !!route.plainPins,
        }
        pinSourceJobsRef.current[pId] = withHomeInitials(activeJobs, route.userName)
        pinSourceMetaRef.current[pId] = pickMeta

        const features = buildPinFeatures(pinSourceJobsRef.current[pId], pickMeta)

        try {
          map.addSource(pId, { type: 'geojson', data: { type: 'FeatureCollection', features } })

          if (isRouteInDrawMode) {
            ensureSequentialPickPinImage(map)
            const idle = SEQUENTIAL_PICK_THEME.pinIdle
            const accent = route.color

            // Sequential pick: hide route lines; dark idle pins → green when picked
            map.addLayer({
              id: `${pId}-shadow`,
              type: 'circle',
              source: pId,
              paint: {
                'circle-radius': [
                  'interpolate', ['linear'], ['zoom'],
                  8, ['case', ['any', ['==', ['get', 'pickAvailable'], 1], ['==', ['get', 'isPicked'], 1]], 14, 0],
                  14, ['case', ['any', ['==', ['get', 'pickAvailable'], 1], ['==', ['get', 'isPicked'], 1]], 18, 0],
                ],
                'circle-color': '#000000',
                'circle-opacity': ['case', ['any', ['==', ['get', 'pickAvailable'], 1], ['==', ['get', 'isPicked'], 1]], 0.22, 0],
                'circle-blur': 0.55,
                'circle-translate': [0, 2],
              },
            })

            map.addLayer({
              id: `${pId}-circle`,
              type: 'circle',
              source: pId,
              paint: {
                'circle-radius': [
                  'interpolate', ['linear'], ['zoom'],
                  8, ['case', ['==', ['get', 'isPicked'], 1], 14, ['case', ['==', ['get', 'pickAvailable'], 1], 12, ['case', ['==', ['get', 'isHome'], 1], 12, 0]]],
                  14, ['case', ['==', ['get', 'isPicked'], 1], 18, ['case', ['==', ['get', 'pickAvailable'], 1], 16, ['case', ['==', ['get', 'isHome'], 1], 16, 0]]],
                ],
                'circle-color': [
                  'case',
                  ['==', ['get', 'isPicked'], 1], accent,
                  ['==', ['get', 'pickAvailable'], 1], idle,
                  ['==', ['get', 'isHome'], 1], accent,
                  accent,
                ],
                'circle-stroke-width': 0,
                'circle-stroke-color': '#ffffff',
              },
            })

            // Location pin icon on idle unpicked stops (matches sidebar badge)
            map.addLayer({
              id: `${pId}-pin-icon`,
              type: 'symbol',
              source: pId,
              filter: ['==', ['get', 'showPinIcon'], 1],
              layout: {
                'icon-image': PICK_PIN_ICON_ID,
                'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.55, 14, 0.65],
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
              },
            })

            // Picked number or hover preview in the centre
            map.addLayer({
              id: `${pId}-center`,
              type: 'symbol',
              source: pId,
              layout: {
                'text-field': ['get', 'centerLabel'],
                'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 14],
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              },
              paint: {
                'text-color': [
                  'case',
                  ['==', ['get', 'isPicked'], 1], SEQUENTIAL_PICK_THEME.pinPickedText,
                  SEQUENTIAL_PICK_THEME.previewTextOnIdle,
                ],
              },
            })

            map.addLayer({
              id: `${pId}-home-initials-draw`,
              type: 'symbol',
              source: pId,
              filter: ['all', ['==', ['get', 'isHome'], 1], ['!=', ['get', 'homeInitials'], '']],
              layout: {
                'text-field': ['get', 'homeInitials'],
                'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 14, 13],
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              },
              paint: {
                'text-color': '#ffffff',
                'text-halo-color': 'rgba(0,0,0,0.18)',
                'text-halo-width': 0.4,
              },
            })

            // Invisible hit target above icons/text so clicks are not blocked by symbols
            map.addLayer({
              id: `${pId}-hit`,
              type: 'circle',
              source: pId,
              filter: ['any', ['==', ['get', 'pickAvailable'], 1], ['==', ['get', 'isPicked'], 1]],
              paint: {
                'circle-radius': [
                  'interpolate', ['linear'], ['zoom'],
                  8, 18,
                  14, 22,
                ],
                'circle-color': '#000000',
                'circle-opacity': 0.01,
              },
            })

            addedSourcesRef.current.push({
              id: pId,
              layers: [`${pId}-shadow`, `${pId}-circle`, `${pId}-pin-icon`, `${pId}-center`, `${pId}-home-initials-draw`, `${pId}-hit`],
            })
          } else {
            if (route.plainPins) ensureClientTypePinImages(map)
            // Normal mode: numbered route pins + employee initials on home pins
            // plainPins (client overlays): no numbers — person/company glyph instead
            // locationPin: rendered as an HTML Marker (drop animation) — no circle underneath
            // Dimmed backdrop (other clients/homes while a route is shown).
            // Soft fade — still readable as context, clearly secondary to the route.
            // Selected / hovered stay full size & opacity so the active pin remains readable.
            const dim = !!route.dimPins
            const idleR8 = dim ? (route.emphasizePins ? 11 : 9) : (route.emphasizePins ? 14 : 12)
            const idleR14 = dim ? (route.emphasizePins ? 14 : 12) : (route.emphasizePins ? 18 : 16)
            const bubbledR8 = route.emphasizePins ? 20 : 18
            const bubbledR14 = route.emphasizePins ? 26 : 24
            const idleOpacity = dim ? 0.58 : 1
            const idleStroke = dim ? 1.75 : (route.emphasizePins ? 3 : 2.5)
            const idleIconSize8 = dim ? 0.28 : 0.35
            const idleIconSize14 = dim ? 0.36 : 0.45
            const homeInitialsSize: mapboxgl.Expression = dim
              ? ['interpolate', ['linear'], ['zoom'], 8, 9, 14, 12]
              : ['interpolate', ['linear'], ['zoom'], 8, 10, 14, 13]

            map.addLayer({
              id: `${pId}-ring`,
              type: 'circle', source: pId,
              filter: ['!=', ['get', 'locationPin'], 1],
              paint: {
                'circle-radius': ['case', BUBBLED, 28, 0],
                'circle-color': [
                  'case',
                  SELECTED, selectedPinColor,
                  route.color,
                ],
                'circle-opacity': ['case', BUBBLED, 0.18, 0],
                'circle-stroke-width': ['case', BUBBLED, 2.5, 0],
                'circle-stroke-color': [
                  'case',
                  SELECTED, selectedPinColor,
                  route.color,
                ],
                'circle-stroke-opacity': ['case', BUBBLED, 0.45, 0],
                'circle-radius-transition': BUBBLE_TRANSITION,
                'circle-opacity-transition': BUBBLE_TRANSITION,
              },
            })

            map.addLayer({
              id: `${pId}-circle`,
              type: 'circle', source: pId,
              filter: ['!=', ['get', 'locationPin'], 1],
              paint: {
                'circle-radius': [
                  'interpolate', ['linear'], ['zoom'],
                  8, ['case', BUBBLED, bubbledR8, idleR8],
                  14, ['case', BUBBLED, bubbledR14, idleR14],
                ],
                'circle-color': route.plainPins
                  ? ['case', SELECTED, selectedPinColor, route.color]
                  : route.color,
                'circle-opacity': ['case', SELECTED, 1, BUBBLED, 1, idleOpacity],
                'circle-stroke-width': ['case', BUBBLED, 4, idleStroke],
                'circle-stroke-color': '#ffffff',
                'circle-stroke-opacity': ['case', SELECTED, 1, BUBBLED, 1, dim ? 0.8 : 1],
                'circle-radius-transition': BUBBLE_TRANSITION,
                'circle-stroke-width-transition': BUBBLE_TRANSITION,
                'circle-color-transition': BUBBLE_TRANSITION,
                'circle-opacity-transition': BUBBLE_TRANSITION,
              },
            })

            map.addLayer({
              id: `${pId}-home-initials`,
              type: 'symbol', source: pId,
              filter: ['all', ['==', ['get', 'isHome'], 1], ['!=', ['get', 'homeInitials'], '']],
              layout: {
                'text-field': ['get', 'homeInitials'],
                'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
                'text-size': homeInitialsSize,
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              },
              paint: {
                'text-color': '#ffffff',
                'text-halo-color': 'rgba(0,0,0,0.18)',
                'text-halo-width': 0.4,
                'text-opacity': ['case', SELECTED, 1, BUBBLED, 1, idleOpacity],
              },
            })

            // Route stop numbers — skipped when seq is empty (plainPins / home)
            map.addLayer({
              id: `${pId}-label`,
              type: 'symbol', source: pId,
              filter: ['all', ['==', ['get', 'isHome'], 0], ['!=', ['get', 'seq'], ''], ['!=', ['get', 'locationPin'], 1]],
              layout: {
                'text-field': ['get', 'seq'],
                'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 12, 13, 14, 15],
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              },
              paint: {
                'text-color': '#ffffff',
                'text-halo-color': 'rgba(0,0,0,0.2)',
                'text-halo-width': 0.5,
              },
            })

            // Person / company glyph for plain client pins
            const clientIconLayers: string[] = []
            if (route.plainPins) {
              const iconSize: mapboxgl.Expression = [
                'interpolate', ['linear'], ['zoom'],
                8, ['case', BUBBLED, 0.42, idleIconSize8],
                14, ['case', BUBBLED, 0.55, idleIconSize14],
              ]
              const iconPaint: mapboxgl.SymbolPaint = {
                'icon-opacity': ['case', SELECTED, 1, BUBBLED, 1, idleOpacity],
              }
              map.addLayer({
                id: `${pId}-person-icon`,
                type: 'symbol', source: pId,
                filter: ['==', ['get', 'clientIcon'], 'person'],
                layout: {
                  'icon-image': PERSON_PIN_ICON_ID,
                  'icon-size': iconSize,
                  'icon-allow-overlap': true,
                  'icon-ignore-placement': true,
                },
                paint: iconPaint,
              })
              map.addLayer({
                id: `${pId}-company-icon`,
                type: 'symbol', source: pId,
                filter: ['==', ['get', 'clientIcon'], 'company'],
                layout: {
                  'icon-image': COMPANY_PIN_ICON_ID,
                  'icon-size': iconSize,
                  'icon-allow-overlap': true,
                  'icon-ignore-placement': true,
                },
                paint: iconPaint,
              })
              clientIconLayers.push(`${pId}-person-icon`, `${pId}-company-icon`)
            }

            addedSourcesRef.current.push({
              id: pId,
              layers: [`${pId}-ring`, `${pId}-circle`, `${pId}-home-initials`, `${pId}-label`, ...clientIconLayers],
            })
          }

          // ── Hover: show popup + highlight ──────────────────────────────────
          const onEnter = (e: mapboxgl.MapLayerMouseEvent) => {
            if (!e.features?.[0]) return
            map.getCanvas().style.cursor = 'pointer'

            const props = e.features[0].properties as {
              jobId: number | string
              seq: string; label: string; address: string
              time: string; durationMinutes: number; legMinutes: number; idx: number
              isHome?: boolean
              drawAvailable?: boolean
              drawNumbered?: boolean
              drawNextNumber?: number
            }
            const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number]

            onPinHover?.(props.jobId)

            // Draw mode: hover is purely visual (the pin itself shows the preview
            // number via the label layer). No popup, no extra UI.
            if (isRouteInDrawMode && !featIsHome(props)) return

            // Build info chips
            const timeChip = props.time
              ? `<span style="display:inline-flex;align-items:center;gap:4px;background:#f8f8f8;border:1px solid #ebebeb;border-radius:99px;padding:2px 8px 2px 6px;font-size:11px;color:#555">
                  <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  ${props.time}
                </span>` : ''
            const durChip = props.durationMinutes > 0
              ? `<span style="display:inline-flex;align-items:center;gap:4px;background:#f8f8f8;border:1px solid #ebebeb;border-radius:99px;padding:2px 8px 2px 6px;font-size:11px;color:#555">
                  <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                  ${fmtMin(props.durationMinutes)}
                </span>` : ''
            const driveChip = props.legMinutes > 0 && props.idx > 0
              ? `<span style="display:inline-flex;align-items:center;gap:4px;background:#f8f8f8;border:1px solid #ebebeb;border-radius:99px;padding:2px 8px 2px 6px;font-size:11px;color:#555">
                  <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M12 5l7 7-7 7"/></svg>
                  ${fmtMin(props.legMinutes)} drive
                </span>` : ''
            const chipsHtml = (timeChip || durChip || driveChip)
              ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">${timeChip}${durChip}${driveChip}</div>`
              : ''

            if (hoverPopupRef.current) hoverPopupRef.current.remove()
            hoverPopupRef.current = new mapboxgl.Popup({
              offset: 18,
              closeButton: false,
              closeOnClick: false,
              maxWidth: '240px',
              className: 'vevago-hover-popup',
            })
              .setLngLat(coords)
              .setHTML(`
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:0">
                  <div style="height:3px;background:${route.color};border-radius:2px;margin:-10px -10px 10px -10px"></div>
                  <div style="display:flex;align-items:center;gap:9px">
                    <div style="width:28px;height:28px;border-radius:50%;background:${route.color};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;box-shadow:0 2px 8px ${hexToRgba(route.color, 0.4)}">
                      ${props.seq}
                    </div>
                    <div style="flex:1;min-width:0">
                      <p style="margin:0;font-size:13px;font-weight:700;color:#111;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${props.label}</p>
                      ${props.address ? `<p style="margin:2px 0 0;font-size:11px;color:#888;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${props.address}</p>` : ''}
                    </div>
                  </div>
                  ${chipsHtml}
                </div>
              `)
              .addTo(map)
          }

          const onLeave = () => {
            map.getCanvas().style.cursor = ''
            if (hoverPopupRef.current) { hoverPopupRef.current.remove(); hoverPopupRef.current = null }
            onPinHover?.(null)
          }

          const pickHoverLayers = isRouteInDrawMode
            ? [`${pId}-hit`]
            : [`${pId}-circle`].filter(id => map.getLayer(id))

          const registerDrawPickLayer = (layerId: string) => {
            if (!map.getLayer(layerId)) return
            drawPickLayers.push(layerId)
            const onPickClick = (e: mapboxgl.MapLayerMouseEvent) => {
              if (!e.features?.[0]) return
              handlePinPick(e.features[0].properties as { jobId?: unknown; isHome?: unknown })
            }
            map.on('click', layerId, onPickClick)
            clickHandlersRef.current.push({ layer: layerId, fn: onPickClick })
          }

          pickHoverLayers.forEach(layer => {
            map.on('mouseenter', layer, onEnter)
            map.on('mouseleave', layer, onLeave)
            hoverHandlersRef.current.push(
              { layer, type: 'mouseenter', fn: onEnter },
              { layer, type: 'mouseleave', fn: onLeave },
            )
          })

          if (isRouteInDrawMode) {
            registerDrawPickLayer(`${pId}-hit`)
            registerDrawPickLayer(`${pId}-circle`)
            registerDrawPickLayer(`${pId}-center`)
          } else {
            const onPinClick = (e: mapboxgl.MapLayerMouseEvent) => {
              if (!e.features?.[0]) return
              handlePinPick(e.features[0].properties as { jobId?: unknown; isHome?: unknown })
            }
            pickHoverLayers.forEach(layer => {
              map.on('click', layer, onPinClick)
              clickHandlersRef.current.push({ layer, fn: onPinClick })
            })

            // ── Drag-to-reassign: pull a stop pin onto another employee's home
            //    pin (on the map) or onto a sidebar row (data-reassign-userid). ──
            if (onReassignJobRef.current) {
              // This route's circle layer carries its home pin → a drop target.
              homeLayersRef.current.push(`${pId}-circle`)

              const onPinMouseDown = (e: mapboxgl.MapLayerMouseEvent) => {
                if (!onReassignJobRef.current) return
                const feat = e.features?.[0]
                if (!feat) return
                const props = feat.properties as { jobId?: unknown; isHome?: unknown; label?: unknown }
                if (featIsHome(props)) return  // don't drag homes
                e.preventDefault()
                startPinDrag(
                  featJobId(props),
                  route.userId,
                  typeof props.label === 'string' ? props.label : 'Stop',
                  e.originalEvent,
                )
              }
              map.on('mousedown', `${pId}-circle`, onPinMouseDown)
              dragHandlersRef.current.push({ layer: `${pId}-circle`, fn: onPinMouseDown })
            }
          }
        } catch (e) { console.warn('active pins add failed', e) }
      }

      // ── Cancelled pins — grey ────────────────────────────────────────────
      if (cancelledJobs.length > 0) {
        const cId = `pins-cancelled-u${route.userId}`
        const cFeatures = cancelledJobs
          .map((job) => {
            const ll = jobLngLat(job)
            if (!ll) return null
            return {
              type: 'Feature' as const,
              properties: { jobId: job.id, label: job.label, address: job.address || '' },
              geometry: { type: 'Point' as const, coordinates: ll },
            }
          })
          .filter((f): f is NonNullable<typeof f> => f != null)
        try {
          map.addSource(cId, { type: 'geojson', data: { type: 'FeatureCollection', features: cFeatures } })
          map.addLayer({ id: `${cId}-circle`, type: 'circle', source: cId, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 8, 14, 11], 'circle-color': '#CBD5E1', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff', 'circle-opacity': 0.7 } })
          map.addLayer({ id: `${cId}-label`, type: 'symbol', source: cId, layout: { 'text-field': '✕', 'text-size': 9, 'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'], 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#94a3b8' } })
          addedSourcesRef.current.push({ id: cId, layers: [`${cId}-circle`, `${cId}-label`] })

          const cEnter = () => { map.getCanvas().style.cursor = 'pointer' }
          const cLeave = () => { map.getCanvas().style.cursor = '' }
          map.on('mouseenter', `${cId}-circle`, cEnter)
          map.on('mouseleave', `${cId}-circle`, cLeave)
          hoverHandlersRef.current.push(
            { layer: `${cId}-circle`, type: 'mouseenter', fn: cEnter },
            { layer: `${cId}-circle`, type: 'mouseleave', fn: cLeave },
          )
          const onCancelledClick = (e: mapboxgl.MapLayerMouseEvent) => {
            if (!e.features?.[0]) return
            const props = e.features[0].properties as { label: string; address: string }
            const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number]
            if (clickPopupRef.current) clickPopupRef.current.remove()
            clickPopupRef.current = new mapboxgl.Popup({ offset: 20, closeButton: false, maxWidth: '230px' })
              .setLngLat(coords)
              .setHTML(`
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:4px 2px">
                  <span style="display:inline-block;background:#f1f5f9;color:#64748b;font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;letter-spacing:.5px;margin-bottom:8px">CANCELLED</span>
                  <p style="margin:0;font-weight:600;font-size:12px;color:#94a3b8;text-decoration:line-through">${props.label}</p>
                  ${props.address ? `<p style="margin:4px 0 0;font-size:11px;color:#aaa">${props.address}</p>` : ''}
                </div>
              `)
              .addTo(map)
          }
          map.on('click', `${cId}-circle`, onCancelledClick)
          clickHandlersRef.current.push({ layer: `${cId}-circle`, fn: onCancelledClick })
        } catch (e) { console.warn('cancelled pins add failed', e) }
      }
    })

    // Fallback for the first click after entering draw mode — Mapbox can miss
    // layer-bound handlers until the new pin geometry is uploaded to the GPU.
    if (drawModeRef.current && drawTargetUserId != null && drawPickLayers.length > 0) {
      const layers = drawPickLayers.filter((id) => map.getLayer(id))
      const onMapDrawClick = (e: mapboxgl.MapMouseEvent) => {
        if (!drawModeRef.current || suppressClickRef.current) return
        const tryPick = () => {
          const features = map.queryRenderedFeatures(e.point, { layers })
          const feat = features.find((f) => !featIsHome(f.properties as { isHome?: unknown }))
          if (feat?.properties) {
            handlePinPick(feat.properties as { jobId?: unknown; isHome?: unknown })
          }
        }
        tryPick()
        requestAnimationFrame(tryPick)
      }
      map.on('click', onMapDrawClick)
      mapClickHandlersRef.current.push({ fn: onMapDrawClick })
    }

    // Profile-card pins must sit above every route/client/home layer redrawn above.
    bindOverlayLayers(
      map,
      overlayPinsRef.current,
      highlightedOverlayIdRef.current,
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, focusUserId, drawUserId, isolatedLeg, onJobClick, onPinHover, drawMode, drawOrder, onDrawAssign, onReassignJob, visibleUserIds?.join(',') ?? '', circleOverlay?.lat, circleOverlay?.lng, circleOverlay?.radiusKm, circleOverlay?.color, bindOverlayLayers])

  const drawRef = useRef(draw)
  drawRef.current = draw

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const run = () => { if (map.isStyleLoaded()) drawRef.current() }
    if (map.isStyleLoaded()) run()
    else {
      map.once('load', run)
      return () => { map.off('load', run) }
    }
  }, [draw])

  // Swap layer stack before paint when toggling pick mode, employee focus, or leg isolation.
  useLayoutEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    drawRef.current()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, drawUserId, focusUserId, isolatedLeg, visibleUserIds?.join(',') ?? ''])

  return (
    <>
      <style>{`
        .vevago-hover-popup .mapboxgl-popup-content {
          padding: 10px;
          border-radius: 12px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
          border: 1px solid rgba(0,0,0,0.06);
          overflow: hidden;
        }
        .vevago-hover-popup .mapboxgl-popup-tip { border-top-color: #fff; }
        .vevago-drag-ghost {
          position: fixed;
          z-index: 9999;
          pointer-events: none;
          background: #111827;
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 10px;
          border-radius: 8px;
          box-shadow: 0 6px 20px rgba(0,0,0,0.25);
          max-width: 220px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .vevago-drag-ghost::before {
          content: '↗';
          margin-right: 6px;
          opacity: 0.7;
        }
        body.vevago-reassigning [data-reassign-userid] {
          outline: 2px dashed rgba(61,213,122,0.5);
          outline-offset: 2px;
          border-radius: 16px;
          transition: outline-color 0.12s, background 0.12s;
        }
        body.vevago-reassigning [data-reassign-userid].vevago-drop-hover {
          outline: 2px solid #3DD57A;
          background: rgba(61,213,122,0.08);
        }
      `}</style>
      <div ref={containerRef} className={`${className ?? 'w-full h-full rounded-2xl overflow-hidden'} relative`} />
      {isDirectionsLoading && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-full px-3 py-1.5 shadow-md text-[11px] font-semibold text-gray-600">
            <svg className="w-3 h-3 animate-spin text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Calculating route…
          </div>
        </div>
      )}
    </>
  )
}
