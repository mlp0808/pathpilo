'use client'

import { useEffect, useRef, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

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

// Builds the GeoJSON FeatureCollection for a route's active pins (only jobs with coords).
// Marks one job as highlighted; is_home jobs get a home icon in the layer.
function buildPinFeatures(
  jobs: RouteJob[],
  highlightedJobId: number | string | null | undefined,
) {
  let clientIndex = 0
  return jobs
    .filter((j): j is RouteJob & { lat: number; lng: number } => j.lat != null && j.lng != null)
    .map((job, idx) => {
      const isHome = !!job.is_home
      const seq = isHome ? '' : String(++clientIndex)
      return {
        type: 'Feature' as const,
        properties: {
          jobId: job.id,
          seq,
          label: job.label,
          address: job.address || '',
          time: job.time || '',
          durationMinutes: job.estimated_duration_minutes ?? -1,
          legMinutes: job.legMinutes ?? -1,
          idx,
          isHome,
          highlight: highlightedJobId != null && String(job.id) === String(highlightedJobId),
        },
        geometry: { type: 'Point' as const, coordinates: [job.lng, job.lat] as [number, number] },
      }
    })
}

export default function RouteMap({
  routes,
  focusUserId,
  onJobClick,
  className,
  highlightedJobId,
  onPinHover,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const hoverPopupRef = useRef<mapboxgl.Popup | null>(null)  // shown on hover
  const clickPopupRef = useRef<mapboxgl.Popup | null>(null)  // shown on click (stays until next click)
  const addedSourcesRef = useRef<{ id: string; layers: string[] }[]>([])

  // Maps active-pin sourceId → array of jobs, so we can re-call setData on hover
  const pinSourceJobsRef = useRef<Record<string, RouteJob[]>>({})
  // Tracks mouseenter/leave handlers for cleanup on redraw
  const hoverHandlersRef = useRef<{ layer: string; type: string; fn: (e?: mapboxgl.MapLayerMouseEvent) => void }[]>([])

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

  // ── Update only the highlight property when hover changes ─────────────────
  // Calls setData on each active-pin source — no full layer redraw needed.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    Object.entries(pinSourceJobsRef.current).forEach(([sourceId, jobs]) => {
      const src = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
      if (!src) return
      src.setData({
        type: 'FeatureCollection',
        features: buildPinFeatures(jobs, highlightedJobId),
      })
    })
  }, [highlightedJobId])

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

    addedSourcesRef.current.forEach(({ id, layers }) => {
      layers.forEach(lid => safeRemoveLayer(map, lid))
      safeRemoveSource(map, id)
    })
    addedSourcesRef.current = []
    pinSourceJobsRef.current = {}

    const visibleRoutes = focusUserId != null
      ? routes.filter(r => r.userId === focusUserId)
      : routes

    const allCoords: [number, number][] = []

    visibleRoutes.forEach(route => {
      const pts = route.jobs.filter(j => j.lat && j.lng)
      if (pts.length === 0) return

      const activeJobs = pts.filter(j => !j.is_cancelled)
      const cancelledJobs = pts.filter(j => j.is_cancelled)

      allCoords.push(...pts.map(j => [j.lng, j.lat] as [number, number]))

      // ── Route line — 3-layer glow ────────────────────────────────────────
      const rawCoords: [number, number][] = activeJobs.map(j => [j.lng, j.lat])
      const lineCoords = route.routeGeometry?.coordinates ?? rawCoords

      if (activeJobs.length >= 2) {
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

      // ── Active numbered pins ─────────────────────────────────────────────
      if (activeJobs.length > 0) {
        const pId = `pins-${route.userId}`
        pinSourceJobsRef.current[pId] = activeJobs

        const features = buildPinFeatures(activeJobs, highlightedJobId)

        try {
          map.addSource(pId, { type: 'geojson', data: { type: 'FeatureCollection', features } })

          // Outer ring — visible only on hover (fixed size, no zoom nesting in case)
          map.addLayer({
            id: `${pId}-ring`,
            type: 'circle', source: pId,
            paint: {
              'circle-radius': ['case', ['get', 'highlight'], 26, 0],
              'circle-color': route.color,
              'circle-opacity': ['case', ['get', 'highlight'], 0.15, 0],
              'circle-stroke-width': ['case', ['get', 'highlight'], 2.5, 0],
              'circle-stroke-color': route.color,
              'circle-stroke-opacity': ['case', ['get', 'highlight'], 0.5, 0],
            },
          })

          // Main circle — zoom at top level, case inside stop values
          map.addLayer({
            id: `${pId}-circle`,
            type: 'circle', source: pId,
            paint: {
              'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                8,  ['case', ['get', 'highlight'], 17, 12],
                14, ['case', ['get', 'highlight'], 22, 16],
              ],
              'circle-color': route.color,
              'circle-stroke-width': ['case', ['get', 'highlight'], 4, 2.5],
              'circle-stroke-color': '#ffffff',
            },
          })

          // Number or home icon label
          map.addLayer({
            id: `${pId}-label`,
            type: 'symbol', source: pId,
            layout: {
              'text-field': ['case', ['get', 'isHome'], '⌂', ['get', 'seq']],
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

          // ── Hover: show popup + highlight ──────────────────────────────────
          const onEnter = (e: mapboxgl.MapLayerMouseEvent) => {
            if (!e.features?.[0]) return
            map.getCanvas().style.cursor = 'pointer'

            const props = e.features[0].properties as {
              jobId: number | string
              seq: string; label: string; address: string
              time: string; durationMinutes: number; legMinutes: number; idx: number
            }
            const coords = (e.features[0].geometry as GeoJSON.Point).coordinates as [number, number]

            onPinHover?.(props.jobId)

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

          map.on('mouseenter', `${pId}-circle`, onEnter)
          map.on('mouseleave', `${pId}-circle`, onLeave)
          hoverHandlersRef.current.push(
            { layer: `${pId}-circle`, type: 'mouseenter', fn: onEnter },
            { layer: `${pId}-circle`, type: 'mouseleave', fn: onLeave },
          )

          // ── Click: open job detail (skip home pins — they are not jobs)
          map.on('click', `${pId}-circle`, (e) => {
            if (!e.features?.[0]) return
            const props = e.features[0].properties as { jobId: number | string; isHome?: boolean }
            if (props.isHome) return
            if (clickPopupRef.current) { clickPopupRef.current.remove(); clickPopupRef.current = null }
            onJobClick(Number(props.jobId))
          })
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

          map.on('mouseenter', `${cId}-circle`, () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', `${cId}-circle`, () => { map.getCanvas().style.cursor = '' })
          map.on('click', `${cId}-circle`, (e) => {
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
          })
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
  }, [routes, focusUserId, onJobClick, onPinHover, highlightedJobId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (map.isStyleLoaded()) {
      draw()
    } else {
      map.once('load', draw)
      return () => { map.off('load', draw) }
    }
  }, [draw])

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
