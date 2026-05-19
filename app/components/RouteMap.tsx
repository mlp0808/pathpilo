'use client'

import { useEffect, useLayoutEffect, useRef, useCallback } from 'react'
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

interface RouteMapProps {
  routes: UserRoute[]
  focusUserId: number | null
  onJobClick: (jobId: number) => void
  className?: string
  highlightedJobId?: number | string | null
  onPinHover?: (jobId: number | string | null) => void
  /** When true, the map enters manual draw-route mode (white dots, click-to-assign). */
  drawMode?: boolean
  /** Job ids already assigned a number, in chosen order (only meaningful when drawMode). */
  drawOrder?: (number | string)[]
  /** Called when an un-numbered draw-mode pin is clicked. */
  onDrawAssign?: (jobId: number | string) => void
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

type PinSourceMeta = {
  pickActive: boolean
  pickOrder: SequentialPickId[]
  highlightedId: SequentialPickId | null | undefined
}

const PICK_PIN_ICON_ID = 'sequential-pick-pin'

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
  drawMode,
  drawOrder,
  onDrawAssign,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
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

  // ── Init map once ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!TOKEN) { console.error('NEXT_PUBLIC_MAPBOX_TOKEN not set'); return }
    mapboxgl.accessToken = TOKEN

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [10.2, 56.15],
      zoom: 9,
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Pin data refresh on hover / pick order (layer swap handled in draw() + useLayoutEffect).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    Object.entries(pinSourceJobsRef.current).forEach(([sourceId, jobs]) => {
      const src = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
      const meta = pinSourceMetaRef.current[sourceId]
      if (!src || !meta) return
      const onPickLayers = !!map.getLayer(`${sourceId}-hit`)
      if (onPickLayers !== meta.pickActive) return

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

    addedSourcesRef.current.forEach(({ id, layers }) => {
      layers.forEach(lid => safeRemoveLayer(map, lid))
      safeRemoveSource(map, id)
    })
    addedSourcesRef.current = []
    pinSourceJobsRef.current = {}
    pinSourceMetaRef.current = {}

    const visibleRoutes = focusUserId != null
      ? routes.filter(r => r.userId === focusUserId)
      : routes

    // Solo companies may show a route before dayFocusUserId is set — align draw mode
    // with the single visible route in that case.
    const drawTargetUserId =
      focusUserId ?? (visibleRoutes.length === 1 ? visibleRoutes[0].userId : null)

    const allCoords: [number, number][] = []

    visibleRoutes.forEach(route => {
      const pts = route.jobs.filter(j => j.lat && j.lng)
      if (pts.length === 0) return

      const activeJobs = pts.filter(j => !j.is_cancelled)
      const cancelledJobs = pts.filter(j => j.is_cancelled)

      allCoords.push(...pts.map(j => [j.lng, j.lat] as [number, number]))

      const isRouteInDrawMode = !!drawMode && drawTargetUserId === route.userId

      // ── Route line — 3-layer glow (hidden during draw mode) ──────────────
      const rawCoords: [number, number][] = activeJobs.map(j => [j.lng, j.lat])
      const lineCoords = route.routeGeometry?.coordinates ?? rawCoords

      if (!isRouteInDrawMode && activeJobs.length >= 2) {
        const lId = `line-${route.userId}`
        try {
          map.addSource(lId, {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: lineCoords } },
          })
          map.addLayer({ id: `${lId}-halo`, type: 'line', source: lId, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': route.color, 'line-width': 20, 'line-opacity': 0.07 } })
          map.addLayer({ id: `${lId}-glow`, type: 'line', source: lId, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': route.color, 'line-width': 8, 'line-opacity': 0.2 } })
          map.addLayer({ id: lId, type: 'line', source: lId, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': route.color, 'line-width': 3.5, 'line-opacity': 0.92 } })
          addedSourcesRef.current.push({ id: lId, layers: [`${lId}-halo`, `${lId}-glow`, lId] })
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
                'circle-stroke-width': ['case', ['==', ['get', 'isHome'], 1], 2.5, 0],
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
              id: `${pId}-label`,
              type: 'symbol',
              source: pId,
              layout: {
                'text-field': ['case', ['==', ['get', 'isHome'], 1], '⌂', ''],
                'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 14],
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              },
              paint: { 'text-color': '#ffffff' },
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
              layers: [`${pId}-shadow`, `${pId}-circle`, `${pId}-pin-icon`, `${pId}-center`, `${pId}-label`, `${pId}-hit`],
            })
          } else {
            // Normal mode: numbered route pins
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
                  8,  ['case', ['==', ['get', 'highlight'], 1], 17, 12],
                  14, ['case', ['==', ['get', 'highlight'], 1], 22, 16],
                ],
                'circle-color': route.color,
                'circle-stroke-width': ['case', ['==', ['get', 'highlight'], 1], 4, 2.5],
                'circle-stroke-color': '#ffffff',
              },
            })

            map.addLayer({
              id: `${pId}-label`,
              type: 'symbol', source: pId,
              layout: {
                'text-field': ['case', ['==', ['get', 'isHome'], 1], '⌂', ['get', 'seq']],
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

            addedSourcesRef.current.push({ id: pId, layers: [`${pId}-ring`, `${pId}-circle`, `${pId}-label`] })
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
            // Map-level query so symbol/icon layers never block picks
            const onMapClick = (e: mapboxgl.MapMouseEvent) => {
              const features = map.queryRenderedFeatures(e.point, { layers: [`${pId}-hit`] })
              if (!features[0]) return
              handlePinPick(features[0].properties as { jobId?: unknown; isHome?: unknown })
            }
            map.on('click', onMapClick)
            mapClickHandlersRef.current.push({ fn: onMapClick })
          } else {
            const onPinClick = (e: mapboxgl.MapLayerMouseEvent) => {
              if (!e.features?.[0]) return
              handlePinPick(e.features[0].properties as { jobId?: unknown; isHome?: unknown })
            }
            pickHoverLayers.forEach(layer => {
              map.on('click', layer, onPinClick)
              clickHandlersRef.current.push({ layer, fn: onPinClick })
            })
          }
        } catch (e) { console.warn('active pins add failed', e) }
      }

      // ── Cancelled pins — grey ────────────────────────────────────────────
      if (cancelledJobs.length > 0) {
        const cId = `pins-cancelled-${route.userId}`
        const cFeatures = cancelledJobs.map((job) => ({
          type: 'Feature' as const,
          properties: { jobId: job.id, label: job.label, address: job.address || '' },
          geometry: { type: 'Point' as const, coordinates: [job.lng, job.lat] as [number, number] },
        }))
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

    // Fit bounds
    if (allCoords.length === 1) {
      map.easeTo({ center: allCoords[0], zoom: 13, duration: 600 })
    } else if (allCoords.length >= 2) {
      const bounds = allCoords.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(allCoords[0], allCoords[0])
      )
      map.fitBounds(bounds, { padding: 80, duration: 600, maxZoom: 14 })
    }
  }, [routes, focusUserId, onJobClick, onPinHover, highlightedJobId, drawMode, drawOrder, onDrawAssign])

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

  // Swap layer stack before paint when toggling pick mode or employee focus.
  useLayoutEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    drawRef.current()
  }, [drawMode, focusUserId])

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
      `}</style>
      <div ref={containerRef} className={className ?? 'w-full h-full rounded-2xl overflow-hidden'} />
    </>
  )
}
