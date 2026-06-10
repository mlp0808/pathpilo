'use client'

import { useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { buildSequentialPickMapFeatures } from '@/app/lib/sequentialPick/buildMapPinFeatures'
import { SEQUENTIAL_PICK_THEME } from '@/app/lib/sequentialPick/theme'
import type { SequentialPickId } from '@/app/lib/sequentialPick'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

export const USER_COLORS = [
  '#3DD57A', '#FF6B6B', '#4ECDC4', '#45B7D1',
  '#F4A261', '#A8DADC', '#E76F51', '#7B2D8B',
  '#2196F3', '#FF9800',
]

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
  /** Fixed start/end location (e.g. home); not draggable, shown with home icon */
  is_home?: boolean
}

export interface UserRoute {
  userId: number
  userName: string
  color: string
  jobs: RouteJob[]
  totalMinutes?: number
  totalKm?: number
  routeGeometry?: { type: string; coordinates: [number, number][] }
}

/** Identifies a single route leg for hover-to-isolate on the map. */
export interface IsolatedRouteSeg {
  userId: number
  fromCoord: [number, number]
  toCoord: [number, number]
}

interface RouteMapProps {
  routes: UserRoute[]
  focusUserId: number | null
  onJobClick: (jobId: number) => void
  className?: string
  highlightedJobId?: number | string | null
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
  zoomControlPosition?: 'top-right' | 'bottom-right'
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
  // AllEmployees panel hover/select: show only the highlighted employee(s).
  if (visibleUserIds != null && visibleUserIds.length > 0) {
    const filtered = routes.filter(r => visibleUserIds.includes(r.userId))
    return filtered.length > 0 ? filtered : routes
  }
  const effectiveFocus =
    focusUserId ?? (routes.length === 1 ? routes[0]?.userId ?? null : null)
  const focused =
    effectiveFocus != null ? routes.filter(r => r.userId === effectiveFocus) : routes
  // Stale focus id (employee with no jobs today) — still fit/show everyone
  return focused.length > 0 ? focused : routes
}

function collectCoordsForRoutes(routes: UserRoute[], focusUserId: number | null): [number, number][] {
  const visible = visibleRoutesForMap(routes, focusUserId)
  const coords: [number, number][] = []
  const seen = new Set<string>()
  const add = (lng: number, lat: number) => {
    const key = `${lng.toFixed(6)},${lat.toFixed(6)}`
    if (seen.has(key)) return
    seen.add(key)
    coords.push([lng, lat])
  }
  for (const route of visible) {
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

type PinSourceMeta = {
  pickActive: boolean
  pickOrder: SequentialPickId[]
  highlightedId: SequentialPickId | null | undefined
}

/** Home glyph ≈ 50% of stop circle diameter (circle r 12→16 px @ zoom 8→14; 64px image @ pixelRatio 2 = 32 logical px). */
const HOME_ICON_SIZE_EXPR: mapboxgl.Expression = ['interpolate', ['linear'], ['zoom'], 8, 0.375, 14, 0.5]
const PICK_PIN_ICON_ID = 'sequential-pick-pin'
const HOME_PIN_ICON_ID = 'route-home-pin-v2'

/** Heroicons outline Home — same glyph as dashboard nav (`HomeIcon`). */
const HOME_PIN_ICON_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">` +
  `<path d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12"/>` +
  `<path d="M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"/>` +
  `<path d="M8.25 21h7.5"/>` +
  `</svg>`

function ensureHomePinImage(map: mapboxgl.Map) {
  if (map.hasImage(HOME_PIN_ICON_ID)) return
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(HOME_PIN_ICON_SVG)}`
  const img = new Image(64, 64)
  img.onload = () => {
    if (!map.hasImage(HOME_PIN_ICON_ID)) {
      map.addImage(HOME_PIN_ICON_ID, img, { pixelRatio: 2 })
      map.triggerRepaint()
    }
  }
  img.src = url
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
  return buildSequentialPickMapFeatures(jobs, meta)
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
  onPinHover,
  isolatedLeg,
  isDirectionsLoading,
  drawMode,
  drawOrder,
  onDrawAssign,
  onReassignJob,
  visibleUserIds,
  fitInsets,
  showZoomControl = true,
  zoomControlPosition = 'top-right',
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
  const onReassignJobRef = useRef(onReassignJob)
  onReassignJobRef.current = onReassignJob
  // Layer-bound mousedown handlers for pin dragging (cleaned up on each redraw).
  const dragHandlersRef = useRef<{ layer: string; fn: (e: mapboxgl.MapLayerMouseEvent) => void }[]>([])
  // Circle layer ids that contain home pins, used as drop-target hit layers.
  const homeLayersRef = useRef<string[]>([])
  // Set true briefly after a drag so the trailing click doesn't open the job.
  const suppressClickRef = useRef(false)
  /** Cancel stale moveend listener when draw() runs again before camera animation finishes. */
  const pendingMoveEndEnforceRef = useRef<(() => void) | null>(null)
  const hasFittedCameraRef = useRef(false)

  const routesFitKey = useMemo(
    () => collectCoordsForRoutes(routes, focusUserId).map(c => c.join(',')).join('|'),
    [routes, focusUserId],
  )

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
    const onStyleLoad = () => { enforceFlatRoadView(map) }
    const onInitialLoad = () => { enforceFlatRoadView(map) }
    // Style JSON and style updates can reset projection / pitch (common on first wide fitBounds)
    map.once('load', onInitialLoad)
    map.on('style.load', onStyleLoad)
    mapRef.current = map
    return () => {
      if (pendingMoveEndEnforceRef.current) {
        try { map.off('moveend', pendingMoveEndEnforceRef.current) } catch { /* ignore */ }
        pendingMoveEndEnforceRef.current = null
      }
      try { map.off('load', onInitialLoad) } catch { /* ignore */ }
      try { map.off('style.load', onStyleLoad) } catch { /* ignore */ }
      hasFittedCameraRef.current = false
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

  // Fit camera when coords appear (geocode, load day routes) — separate from layer draw().
  useEffect(() => {
    const map = mapRef.current
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
      const coords = collectCoordsForRoutes(routes, focusUserId)
      if (coords.length === 0) return
      const animated = hasFittedCameraRef.current
      fitMapToRouteCoords(map, coords, { animated, fitInsets })
      hasFittedCameraRef.current = true
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
  }, [routesFitKey, routes, focusUserId, fitInsets])

  // Pin data refresh on hover / pick order (layer swap handled in draw() + useLayoutEffect).
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
      }
      pinSourceMetaRef.current[sourceId] = nextMeta
      src.setData({
        type: 'FeatureCollection',
        features: buildPinFeatures(jobs, nextMeta),
      })
    })
  }, [highlightedJobId, drawOrder])

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
      focusUserId ?? (visibleRoutes.length === 1 ? visibleRoutes[0].userId : null)

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
      const rawCoords: [number, number][] = activeJobs
        .map(j => jobLngLat(j))
        .filter((c): c is [number, number] => c != null)
      const fullLineCoords = route.routeGeometry?.coordinates ?? rawCoords
      // When a specific leg is isolated, slice the geometry to just that segment.
      const lineCoords =
        isolatedLeg != null && isolatedLeg.userId === route.userId
          ? sliceLineBetween(fullLineCoords as [number, number][], isolatedLeg.fromCoord, isolatedLeg.toCoord)
          : fullLineCoords

      if (!isRouteInDrawMode && activeJobs.length >= 2 && lineCoords.length >= 2) {
        const lId = `line-${route.userId}`
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
            paint: { 'line-color': route.color, 'line-width': 3, 'line-opacity': 0.85 },
          })
          addedSourcesRef.current.push({ id: lId, layers: [`${lId}-halo`, lId] })
        } catch (e) { console.warn('line add failed', e) }
      }

      // ── Active pins ──────────────────────────────────────────────────────
      if (activeJobs.length > 0) {
        const pId = `pins-${route.userId}`
        const pickMeta: PinSourceMeta = {
          pickActive: isRouteInDrawMode,
          pickOrder: drawOrder ?? [],
          highlightedId: highlightedJobId,
        }
        pinSourceJobsRef.current[pId] = activeJobs
        pinSourceMetaRef.current[pId] = pickMeta

        const features = buildPinFeatures(activeJobs, pickMeta)

        try {
          map.addSource(pId, { type: 'geojson', data: { type: 'FeatureCollection', features } })

          if (isRouteInDrawMode) {
            ensureSequentialPickPinImage(map)
            ensureHomePinImage(map)
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
              id: `${pId}-home-icon-draw`,
              type: 'symbol',
              source: pId,
              filter: ['==', ['get', 'isHome'], 1],
              layout: {
                'icon-image': HOME_PIN_ICON_ID,
                'icon-size': HOME_ICON_SIZE_EXPR,
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
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
              layers: [`${pId}-shadow`, `${pId}-circle`, `${pId}-pin-icon`, `${pId}-center`, `${pId}-home-icon-draw`, `${pId}-hit`],
            })
          } else {
            ensureHomePinImage(map)
            // Normal mode: numbered route pins + prominent home depot
            map.addLayer({
              id: `${pId}-ring`,
              type: 'circle', source: pId,
              paint: {
                'circle-radius': ['case', ['==', ['get', 'highlight'], 1], 26, 0],
                'circle-color': route.color,
                'circle-opacity': ['case', ['==', ['get', 'highlight'], 1], 0.15, 0],
                'circle-stroke-width': ['case', ['==', ['get', 'highlight'], 1], 2.5, 0],
                'circle-stroke-color': route.color,
                'circle-stroke-opacity': ['case', ['==', ['get', 'highlight'], 1], 0.5, 0],
              },
            })

            map.addLayer({
              id: `${pId}-circle`,
              type: 'circle', source: pId,
              paint: {
                'circle-radius': [
                  'interpolate', ['linear'], ['zoom'],
                  8, ['case', ['==', ['get', 'highlight'], 1], 17, 12],
                  14, ['case', ['==', ['get', 'highlight'], 1], 22, 16],
                ],
                'circle-color': route.color,
                'circle-stroke-width': ['case', ['==', ['get', 'highlight'], 1], 4, 2.5],
                'circle-stroke-color': '#ffffff',
              },
            })

            map.addLayer({
              id: `${pId}-home-icon`,
              type: 'symbol', source: pId,
              filter: ['==', ['get', 'isHome'], 1],
              layout: {
                'icon-image': HOME_PIN_ICON_ID,
                'icon-size': HOME_ICON_SIZE_EXPR,
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
              },
            })

            map.addLayer({
              id: `${pId}-label`,
              type: 'symbol', source: pId,
              filter: ['==', ['get', 'isHome'], 0],
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

            addedSourcesRef.current.push({
              id: pId,
              layers: [`${pId}-ring`, `${pId}-circle`, `${pId}-home-icon`, `${pId}-label`],
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
            : [`${pId}-circle`]

          const handlePinPick = (props: { jobId?: unknown; isHome?: unknown }) => {
            if (suppressClickRef.current) return  // trailing click after a drag
            if (featIsHome(props)) return
            const jobId = featJobId(props)
            if (clickPopupRef.current) { clickPopupRef.current.remove(); clickPopupRef.current = null }
            if (isRouteInDrawMode && onDrawAssignRef.current) {
              onDrawAssignRef.current(jobId)
              return
            }
            onJobClick(Number(jobId))
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
            // ${pId}-hit is the top-most layer so a direct layer click works and
            // avoids the queryRenderedFeatures race where features are not yet in
            // the WebGL buffer on the very first click after entering draw mode.
            const onHitClick = (e: mapboxgl.MapLayerMouseEvent) => {
              if (!e.features?.[0]) return
              handlePinPick(e.features[0].properties as { jobId?: unknown; isHome?: unknown })
            }
            map.on('click', `${pId}-hit`, onHitClick)
            clickHandlersRef.current.push({ layer: `${pId}-hit`, fn: onHitClick })
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
        const cId = `pins-cancelled-${route.userId}`
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, focusUserId, isolatedLeg, onJobClick, onPinHover, drawMode, drawOrder, onDrawAssign, onReassignJob, visibleUserIds?.join(',') ?? ''])

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
  }, [drawMode, focusUserId, isolatedLeg, visibleUserIds?.join(',') ?? ''])

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
