'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import RouteAddSearch, { type RouteLocationPick } from '@pathpilo/route-planner-core/RouteAddSearch'
import { optimizeMiddleJobsClient } from '@pathpilo/route-planner-core/clientRouteOptimize'
import MobileRouteSheet from '@pathpilo/route-planner-core/MobileRouteSheet'
import type { UserRoute, RouteJob } from '@pathpilo/route-planner-core'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ArrowRightIcon,
  ClockIcon,
  LockClosedIcon,
  MapIcon,
  PencilIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
  MapPinIcon,
  CloudArrowUpIcon,
} from '@heroicons/react/24/outline'
import {
  type GuestStop,
  type RouteGeometryResult,
  COUNTRY_OPTIONS,
  defaultCountryForLocale,
  loadState,
  saveState,
  nextStopId,
  fetchRouteGeometry,
  formatDuration,
  buildRegisterUrl,
} from './routePlannerShared'

const RouteMap = dynamic(() => import('@pathpilo/route-planner-core/RouteMap'), { ssr: false })

const ACCENT = '#3DD57A'
// Fraction of the map container the mobile sheet covers, ascending — peek / half / full.
const MOBILE_SHEET_SNAPS = [0.14, 0.5, 0.92]
const MOBILE_SHEET_INITIAL_SNAP = 1

type Variant = 'full' | 'compact'

/** Tracks the `(min-width: 1024px)` breakpoint client-side (Tailwind `lg`). */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => setIsDesktop(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isDesktop
}

export default function RoutePlannerTool({
  locale = 'en',
  variant = 'full',
}: {
  locale?: string
  variant?: Variant
}) {
  const da = locale === 'da'
  const compact = variant === 'compact'
  const isDesktop = useIsDesktop()

  const [stops, setStops] = useState<GuestStop[]>([])
  const [country, setCountry] = useState<string>(() => defaultCountryForLocale(locale))
  const [hydrated, setHydrated] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const [geo, setGeo] = useState<RouteGeometryResult | null>(null)
  const [directionsLoading, setDirectionsLoading] = useState(false)
  const [optimising, setOptimising] = useState(false)
  const [hoverId, setHoverId] = useState<number | string | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [drawMode, setDrawMode] = useState(false)
  const [drawOrder, setDrawOrder] = useState<number[]>([])
  const [dragId, setDragId] = useState<number | null>(null)
  const [nudge, setNudge] = useState<string | null>(null)
  const [nudgesSilenced, setNudgesSilenced] = useState(false)

  const directionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Hydrate ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = loadState()
    setStops(s.stops)
    if (s.country) setCountry(s.country)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) saveState({ stops, country })
  }, [stops, country, hydrated])

  // ── Fullscreen: lock body scroll + Escape to exit ──────────────────────────
  useEffect(() => {
    if (!fullscreen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [fullscreen])

  // ── Directions ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return
    if (directionsTimer.current) clearTimeout(directionsTimer.current)
    if (stops.length < 2) {
      setGeo(null)
      setDirectionsLoading(false)
      return
    }
    setDirectionsLoading(true)
    directionsTimer.current = setTimeout(async () => {
      const result = await fetchRouteGeometry(stops.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng })))
      setGeo(result)
      setDirectionsLoading(false)
    }, 450)
    return () => {
      if (directionsTimer.current) clearTimeout(directionsTimer.current)
    }
  }, [stops, hydrated])

  // Apply draw order once every stop has been clicked in sequence.
  useEffect(() => {
    if (!drawMode) return
    if (stops.length > 0 && drawOrder.length === stops.length) {
      reorder(drawOrder)
      setDrawMode(false)
      setDrawOrder([])
      fireNudge(da ? 'Flot rute! Opret en gratis konto for at gemme den.' : 'Nice route! Create a free account to save it.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, drawOrder, stops.length])

  // ── Mutations ──────────────────────────────────────────────────────────────
  function reorder(orderedIds: number[]) {
    setStops((prev) => {
      const byId = new Map(prev.map((s) => [s.id, s]))
      const next = orderedIds.map((id) => byId.get(id)).filter(Boolean) as GuestStop[]
      return next.length === prev.length ? next : prev
    })
  }

  const handleAddLocation = useCallback((loc: RouteLocationPick) => {
    if (loc.lat == null || loc.lng == null) return
    setStops((prev) => {
      const id = nextStopId(prev)
      const name = (loc.name || '').trim() || (loc.address || '').trim() || `Stop ${prev.length + 1}`
      return [
        ...prev,
        {
          id,
          name,
          address: (loc.address || '').trim(),
          zip_code: loc.zip_code || undefined,
          city: loc.city || undefined,
          lat: loc.lat as number,
          lng: loc.lng as number,
        },
      ]
    })
  }, [])

  const removeStop = (id: number) => {
    setStops((prev) => prev.filter((s) => s.id !== id))
    if (detailId === id) setDetailId(null)
  }

  const renameStop = (id: number, name: string) =>
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)))

  const moveStop = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= stops.length) return
    const ids = stops.map((s) => s.id)
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    reorder(ids)
  }

  const handleOptimise = async () => {
    if (stops.length < 2) return
    setOptimising(true)
    try {
      const result = await optimizeMiddleJobsClient(stops.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng })))
      reorder(result.orderedIds.map((id) => Number(id)))
      fireNudge(
        da
          ? 'Ruten er optimeret! Opret en gratis konto for at gemme og åbne den på mobilen.'
          : 'Route optimised! Create a free account to save it and open it on mobile.',
      )
    } finally {
      setOptimising(false)
    }
  }

  const clearAll = () => {
    setStops([])
    setGeo(null)
    setDetailId(null)
    setDrawMode(false)
    setDrawOrder([])
  }

  const handleSave = () => {
    window.location.href = buildRegisterUrl(locale, stops)
  }

  function fireNudge(msg: string) {
    if (compact || nudgesSilenced) return
    setNudge(msg)
  }

  const onListDragOver = (e: React.DragEvent, overId: number) => {
    e.preventDefault()
    if (dragId == null || dragId === overId) return
    const ids = stops.map((s) => s.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(overId)
    if (from < 0 || to < 0) return
    const next = [...ids]
    const [m] = next.splice(from, 1)
    next.splice(to, 0, m)
    reorder(next)
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const route: UserRoute = useMemo(
    () => ({
      userId: 1,
      userName: da ? 'Din rute' : 'Your route',
      color: ACCENT,
      jobs: stops.map((s, i): RouteJob => {
        const leg = geo?.legInfo.get(s.id)
        return {
          id: s.id,
          lat: s.lat,
          lng: s.lng,
          label: s.name || `${i + 1}`,
          address: s.address,
          etaMinutes: leg?.etaMinutes,
          legMinutes: leg?.legMinutes,
        }
      }),
      routeGeometry: geo?.routeGeometry,
      totalMinutes: geo?.totalMinutes,
      totalKm: geo?.totalKm,
    }),
    [stops, geo, da],
  )
  const routes = stops.length > 0 ? [route] : []
  const highlighted = hoverId ?? detailId
  const detailStop = stops.find((s) => s.id === detailId) || null

  const t = {
    addPlaceholder: da ? 'Søg en adresse for at tilføje et stop' : 'Search an address to add a stop',
    optimise: da ? 'Optimér' : 'Optimise',
    optimising: da ? 'Optimerer…' : 'Optimising…',
    draw: da ? 'Tegn rute' : 'Draw route',
    cancelDraw: da ? 'Annullér' : 'Cancel',
    clear: da ? 'Ryd' : 'Clear',
    stops: da ? 'stop' : 'stops',
    emptyTitle: da ? 'Ingen stop endnu' : 'No stops yet',
    emptyBody: da ? 'Søg en adresse i feltet på kortet for at tilføje dit første stop.' : 'Search an address in the field on the map to add your first stop.',
    driveTime: da ? 'Køretid' : 'Drive time',
    distance: da ? 'Afstand' : 'Distance',
    savedLocally: da ? 'Gemt lokalt' : 'Saved locally',
    saveSync: da ? 'Gem & synk' : 'Save & sync',
    signUp: da ? 'Opret konto' : 'Sign up',
    enlarge: da ? 'Åbn fuld version' : 'Open full tool',
    fullscreenOn: da ? 'Fuld skærm' : 'Fullscreen',
    fullscreenOff: da ? 'Luk fuld skærm' : 'Exit fullscreen',
    drawingHint: da ? 'Klik på stop i den rækkefølge du vil køre' : 'Click stops in the order you want to drive',
    dismiss: da ? 'Luk' : 'Dismiss',
    liteTitle: da ? 'Ruteplanlægger' : 'Route planner',
    remove: da ? 'Fjern' : 'Remove',
    yourRoute: da ? 'Din rute' : 'Your route',
    stopName: da ? 'Navn på stop' : 'Stop name',
    address: da ? 'Adresse' : 'Address',
    detailsLockedTitle: da ? 'Kundedetaljer er låst' : 'Client details are locked',
    detailsLockedBody: da
      ? 'Opret en gratis konto for at tilføje telefon, e-mail, service, pris og noter — og gemme ruten til din telefon.'
      : 'Create a free account to add phone, email, service, price and notes — and save this route to your phone.',
    unlock: da ? 'Opret gratis konto' : 'Create free account',
    fieldPhone: da ? 'Telefon' : 'Phone',
    fieldEmail: da ? 'E-mail' : 'Email',
    fieldService: da ? 'Service' : 'Service',
    fieldPrice: da ? 'Pris' : 'Price',
    fieldNotes: da ? 'Noter' : 'Notes',
  }

  // The mobile sheet only applies inside the full tool (compact stays a tiny
  // fixed-size demo card with no sheet or fullscreen toggle).
  const useMobileSheet = !compact && !isDesktop

  // ── Locked client drawer ─────────────────────────────────────────────────
  const renderDrawer = () =>
    detailStop && (
      <>
        <div
          className="absolute inset-0 z-40 bg-black/10 lg:bg-transparent"
          onClick={() => setDetailId(null)}
          aria-hidden
        />
        <aside className="absolute inset-x-0 bottom-0 z-50 max-h-[78%] overflow-y-auto rounded-t-2xl border-t border-gray-200 bg-white shadow-2xl lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[340px] lg:rounded-none lg:rounded-l-2xl lg:border-l lg:border-t-0">
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-accent-600">{t.yourRoute}</p>
              <h3 className="truncate text-base font-bold text-primary-800">{detailStop.name}</h3>
            </div>
            <button
              type="button"
              onClick={() => setDetailId(null)}
              className="flex-shrink-0 rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              aria-label={t.dismiss}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4 p-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">{t.stopName}</label>
              <input
                value={detailStop.name}
                onChange={(e) => renameStop(detailStop.id, e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-primary-800 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">{t.address}</label>
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
                {[detailStop.address, [detailStop.zip_code, detailStop.city].filter(Boolean).join(' ')]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </p>
            </div>

            {/* Locked, blurred fields — the tempt-to-signup teaser */}
            <div className="relative">
              <div className="pointer-events-none select-none space-y-3 opacity-50 blur-[1.5px]">
                {[t.fieldPhone, t.fieldEmail, t.fieldService, t.fieldPrice].map((f) => (
                  <div key={f}>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">{f}</label>
                    <div className="h-9 rounded-lg border border-gray-200 bg-white" />
                  </div>
                ))}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">{t.fieldNotes}</label>
                  <div className="h-16 rounded-lg border border-gray-200 bg-white" />
                </div>
              </div>

              <div className="absolute inset-0 flex items-center justify-center p-3">
                <div className="w-full max-w-[280px] rounded-2xl border border-accent-200 bg-white/95 p-4 text-center shadow-lg backdrop-blur">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-accent-500/15">
                    <LockClosedIcon className="h-5 w-5 text-accent-600" />
                  </div>
                  <p className="text-sm font-bold text-primary-800">{t.detailsLockedTitle}</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{t.detailsLockedBody}</p>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-accent-600"
                  >
                    {t.unlock}
                    <ArrowRightIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => removeStop(detailStop.id)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 transition hover:text-red-500"
            >
              <TrashIcon className="h-4 w-4" />
              {t.remove}
            </button>
          </div>
        </aside>
      </>
    )

  // ── Toolbar (optimise / draw / clear) — shared between desktop panel & mobile sheet
  const renderToolbar = () => (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-2.5">
      <button
        type="button"
        onClick={handleOptimise}
        disabled={stops.length < 2 || optimising}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary-800 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-primary-900/15 transition hover:bg-primary-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        <SparklesIcon className="h-4 w-4" />
        {optimising ? t.optimising : t.optimise}
      </button>
      <button
        type="button"
        onClick={() => {
          setDrawOrder([])
          setDrawMode((m) => !m)
        }}
        disabled={stops.length < 2}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
          drawMode ? 'border-accent-500 bg-accent-500/10 text-accent-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        <PencilIcon className="h-4 w-4" />
        {drawMode ? t.cancelDraw : t.draw}
      </button>
      {stops.length > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-xs font-medium text-gray-400 transition hover:bg-red-50 hover:text-red-500"
        >
          <TrashIcon className="h-4 w-4" />
          {t.clear}
        </button>
      )}
    </div>
  )

  // ── Drive time / distance stat cards — shown above the stop list once there's a route
  const renderStats = () =>
    stops.length >= 2 ? (
      <div className="grid grid-cols-2 gap-2 border-b border-gray-100 p-2">
        <div className="flex items-center gap-2 rounded-lg bg-primary-50/80 px-2.5 py-1.5">
          <ClockIcon className="h-3.5 w-3.5 flex-shrink-0 text-primary-600/70" />
          <div className="min-w-0 leading-tight">
            <div className="text-[9px] font-bold uppercase tracking-wide text-primary-600/70">{t.driveTime}</div>
            <div className="text-sm font-bold tabular-nums text-primary-800">
              {directionsLoading ? '…' : formatDuration(geo?.totalMinutes)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-primary-50/80 px-2.5 py-1.5">
          <MapIcon className="h-3.5 w-3.5 flex-shrink-0 text-primary-600/70" />
          <div className="min-w-0 leading-tight">
            <div className="text-[9px] font-bold uppercase tracking-wide text-primary-600/70">{t.distance}</div>
            <div className="text-sm font-bold tabular-nums text-primary-800">
              {directionsLoading || geo?.totalKm == null ? '…' : `${geo.totalKm.toFixed(1)} km`}
            </div>
          </div>
        </div>
      </div>
    ) : null

  // ── Stop list — shared between desktop panel & mobile sheet
  const renderList = () => (
    <>
      {drawMode && (
        <p className="border-b border-gray-100 bg-accent-500/10 px-3 py-2 text-xs font-medium text-accent-700">
          {t.drawingHint} ({drawOrder.length}/{stops.length})
        </p>
      )}
      {stops.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-500/10">
            <MapPinIcon className="h-6 w-6 text-accent-600" />
          </div>
          <p className="text-sm font-semibold text-primary-800">{t.emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-[220px] text-xs leading-relaxed text-gray-400">{t.emptyBody}</p>
        </div>
      ) : (
        <ul className="space-y-1.5 p-2">
          {stops.map((s, i) => {
            const leg = geo?.legInfo.get(s.id)
            const drawIdx = drawOrder.indexOf(s.id)
            const active = detailId === s.id || hoverId === s.id
            return (
              <li
                key={s.id}
                draggable={!drawMode}
                onDragStart={() => setDragId(s.id)}
                onDragOver={(e) => onListDragOver(e, s.id)}
                onDragEnd={() => setDragId(null)}
                onMouseEnter={() => setHoverId(s.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={() => setDetailId(s.id)}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 transition-colors ${
                  active ? 'bg-accent-500/8 ring-1 ring-accent-500/25' : 'hover:bg-gray-50'
                } ${drawMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
              >
                <span
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm"
                  style={{ background: drawMode && drawIdx === -1 ? '#cbd5e1' : ACCENT }}
                >
                  {drawMode ? (drawIdx === -1 ? '' : drawIdx + 1) : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-primary-800">{s.name}</p>
                  <p className="truncate text-[11px] text-gray-400">
                    {[s.address, [s.zip_code, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                    {leg && leg.etaMinutes > 0 ? ` · ${formatDuration(leg.etaMinutes)}` : ''}
                  </p>
                </div>
                {!drawMode && (
                  <div className="flex flex-shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        moveStop(i, -1)
                      }}
                      disabled={i === 0}
                      aria-label="Move up"
                      className="rounded-full p-1 text-gray-300 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ArrowUpIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        moveStop(i, 1)
                      }}
                      disabled={i === stops.length - 1}
                      aria-label="Move down"
                      className="rounded-full p-1 text-gray-300 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ArrowDownIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeStop(s.id)
                      }}
                      aria-label={t.remove}
                      className="rounded-full p-1 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )

  // ── Mobile sheet pinned bar — stats + signup CTA, always visible regardless of drag position
  const renderMobilePinnedBar = () => (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      {stops.length >= 2 ? (
        <div className="min-w-0 flex-1 text-xs font-semibold text-gray-500">
          {directionsLoading ? t.optimising : formatDuration(geo?.totalMinutes)}
          {geo?.totalKm != null && !directionsLoading ? ` · ${geo.totalKm.toFixed(0)} km` : ''}
        </div>
      ) : (
        <div className="min-w-0 flex-1 text-xs font-medium text-gray-400">{t.savedLocally}</div>
      )}
      <button
        type="button"
        onClick={handleSave}
        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-accent-500 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-accent-600"
      >
        <CloudArrowUpIcon className="h-4 w-4" />
        {t.saveSync}
      </button>
    </div>
  )

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-[200] flex h-[100dvh] w-full flex-col overflow-hidden bg-white'
          : `relative flex ${compact ? 'h-[460px]' : 'h-full'} flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/[0.02]`
      }
    >
      {/* Top bar */}
      <div
        className={`flex flex-shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-3 py-2 ${
          fullscreen ? 'pt-[max(0.5rem,env(safe-area-inset-top))]' : ''
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-bold text-primary-800">{t.liteTitle}</span>
          {stops.length > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
              {stops.length} {t.stops}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-[11px] font-medium text-gray-400 md:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
            {t.savedLocally}
          </span>
          {compact ? (
            <a
              href={`/${locale}/tools/route-planner`}
              className="inline-flex items-center gap-1 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-accent-600"
            >
              <ArrowsPointingOutIcon className="h-4 w-4" />
              {t.enlarge}
            </a>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSave}
                className="hidden items-center gap-1.5 rounded-lg border border-accent-500 px-3 py-1.5 text-xs font-bold text-accent-700 transition hover:bg-accent-500/10 md:inline-flex"
              >
                <CloudArrowUpIcon className="h-4 w-4" />
                {t.saveSync}
              </button>
              <button
                type="button"
                onClick={() => setFullscreen((v) => !v)}
                title={fullscreen ? t.fullscreenOff : t.fullscreenOn}
                aria-label={fullscreen ? t.fullscreenOff : t.fullscreenOn}
                className="inline-flex flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
              >
                {fullscreen ? <ArrowsPointingInIcon className="h-4 w-4" /> : <ArrowsPointingOutIcon className="h-4 w-4" />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body: list + map */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Desktop route list */}
        {!compact && (
          <aside className="hidden flex-shrink-0 flex-col border-r border-gray-200 lg:flex lg:w-[300px]">
            {renderToolbar()}
            {renderStats()}
            <div className="flex-1 overflow-y-auto">{renderList()}</div>
          </aside>
        )}

        {/* Map with floating search (+ mobile sheet) */}
        <div className="relative min-h-0 flex-1">
          <RouteMap
            routes={routes}
            focusUserId={1}
            onJobClick={(id) => setDetailId(Number(id))}
            onPinHover={(id) => setHoverId(id)}
            highlightedJobId={highlighted}
            isDirectionsLoading={directionsLoading}
            drawMode={drawMode}
            drawOrder={drawOrder}
            onDrawAssign={(id) => setDrawOrder((prev) => (prev.includes(Number(id)) ? prev : [...prev, Number(id)]))}
            className="h-full w-full"
            showZoomControl={isDesktop}
            fitInsets={
              useMobileSheet
                ? { top: 72, side: 48, bottomRatio: MOBILE_SHEET_SNAPS[MOBILE_SHEET_INITIAL_SNAP] }
                : undefined
            }
          />

          {/* Floating, wide search — top-centre of the map */}
          <div
            className="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center px-3"
            style={fullscreen ? { top: 'max(0.75rem, calc(env(safe-area-inset-top) + 0.5rem))' } : undefined}
          >
            <div className="pointer-events-auto w-full max-w-[640px]">
              <RouteAddSearch
                clients={[]}
                countryCode={country}
                countryOptions={COUNTRY_OPTIONS}
                onCountryChange={(code) => setCountry(code)}
                placeholder={t.addPlaceholder}
                accentColor={ACCENT}
                appearance="glass"
                    labels={
                      da
                        ? {
                            saved: 'Gemt',
                            newLocation: 'Ny placering',
                            searching: 'Søger…',
                            hint: 'Bliv ved med at skrive for at finde en adresse',
                            needNumber: 'Tilføj et husnummer for at vælge denne adresse',
                          }
                        : undefined
                    }
                onPickClient={() => {}}
                onPickLocation={handleAddLocation}
              />
            </div>
          </div>

          {/* Mobile: toolbar + list live in a draggable bottom sheet over the map */}
          {useMobileSheet && (
            <MobileRouteSheet
              snapPoints={MOBILE_SHEET_SNAPS}
              initialSnap={MOBILE_SHEET_INITIAL_SNAP}
              toolbar={renderMobilePinnedBar()}
            >
              {renderToolbar()}
              {renderStats()}
              {renderList()}
            </MobileRouteSheet>
          )}

          {renderDrawer()}
        </div>
      </div>

      {/* Soft nudge toast — desktop only; mobile already has the persistent pinned save bar */}
      {nudge && !compact && !useMobileSheet && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[60] flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-gray-200 bg-white/95 py-2 pl-4 pr-2 shadow-lg backdrop-blur">
            <p className="text-sm text-gray-700">{nudge}</p>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-full bg-accent-500 px-3 py-1 text-xs font-bold text-white transition hover:bg-accent-600"
            >
              {t.signUp}
            </button>
            <button
              type="button"
              onClick={() => {
                setNudge(null)
                setNudgesSilenced(true)
              }}
              aria-label={t.dismiss}
              className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
