'use client'

/**
 * Nested client context for the map left sidebar.
 *
 * Hierarchy (each step has Back — never dumps you to the main map by accident):
 *   Main map (idle)
 *     → Client dashboard
 *         → See routes (upcoming jobs)
 *         → Nearest routes
 *   Popups: Schedule job, Create subscription, Plan new round
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  EnvelopeIcon,
  MapIcon,
  MapPinIcon,
  PhoneIcon,
  PlusCircleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import type { UserRoute } from '@/app/components/RouteMap'
import { colorForUserId, initialsFromName } from '@/app/components/RouteMap'
import CreateJobSlideout from '@/app/components/CreateJobSlideout'
import CreateSubscription from '@/app/components/CreateSubscription'
import {
  addDaysStr,
  todayStr,
  withReturnTo,
  type MapMode,
} from './mapMode'
import NearestRoutesList, {
  BusyBar,
  fmtDate,
  fmtMinutes,
  type RouteDayKey,
} from './NearestRoutesList'
import {
  fetchClient,
  fetchClientRoutes,
  fetchDayCapacityMinutes,
  fetchEmployeeDays,
  type ClientRouteRow,
  type MapClient,
} from './useMapData'

export type ClientExploreLayer = 'dashboard' | 'routes' | 'nearest'

type StopPayload = {
  clientId?: number | null
  label: string
  address?: string
  zip_code?: string
  city?: string
  lat?: number | null
  lng?: number | null
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
    >
      <ArrowLeftIcon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

function ActionRow({
  icon,
  title,
  subtitle,
  onClick,
  disabled = false,
  comingSoon = false,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  onClick?: () => void
  disabled?: boolean
  comingSoon?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled || comingSoon}
      onClick={onClick}
      className="w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80 transition-colors disabled:opacity-55 disabled:hover:bg-white disabled:hover:border-gray-200"
    >
      <span className="mt-0.5 w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center flex-shrink-0">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="block text-[13px] font-bold leading-tight text-gray-900">{title}</span>
          {comingSoon && (
            <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
              Soon
            </span>
          )}
        </span>
        {subtitle && (
          <span className="block text-[11px] leading-snug mt-0.5 text-gray-500">{subtitle}</span>
        )}
      </span>
    </button>
  )
}

function ClientRoutesList({
  clientId,
  previewKeys,
  previewRoutesByKey,
  previewLoading,
  onSetPreviewRouteDays,
  onHoverJob,
  onOpenPlanner,
}: {
  clientId: number
  previewKeys: RouteDayKey[]
  previewRoutesByKey: Record<string, UserRoute>
  previewLoading: boolean
  onSetPreviewRouteDays?: (rows: { date: string; user_id: number }[]) => void
  onHoverJob?: (id: number | string | null) => void
  onOpenPlanner?: (row: ClientRouteRow) => void
}) {
  const today = useMemo(() => todayStr(), [])
  const to = useMemo(() => addDaysStr(today, 180), [today])
  const [rows, setRows] = useState<ClientRouteRow[] | null>(null)
  const [loadByKey, setLoadByKey] = useState<Record<string, { used: number; capacity: number }>>({})
  const [expandedKey, setExpandedKey] = useState<RouteDayKey | null>(null)

  useEffect(() => {
    let alive = true
    setRows(null)
    fetchClientRoutes(clientId, today, to)
      .then((r) => {
        if (!alive) return
        const upcoming = r
          .filter((row) => String(row.date || '').slice(0, 10) >= today)
          .filter((row) => String(row.status || '').toLowerCase() !== 'cancelled')
          .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        // One card per employee-day, max 10.
        const map = new Map<string, ClientRouteRow>()
        for (const row of upcoming) {
          if (row.user_id == null) continue
          const key = `${String(row.date).slice(0, 10)}:${row.user_id}`
          if (!map.has(key)) map.set(key, row)
          if (map.size >= 10) break
        }
        setRows(Array.from(map.values()).slice(0, 10))
      })
      .catch(() => {
        if (alive) setRows([])
      })
    return () => {
      alive = false
    }
  }, [clientId, today, to])

  useEffect(() => {
    if (!rows || rows.length === 0) {
      setLoadByKey({})
      return
    }
    let alive = true
    ;(async () => {
      const next: Record<string, { used: number; capacity: number }> = {}
      const byUser = new Map<number, string[]>()
      for (const r of rows) {
        if (r.user_id == null) continue
        const date = String(r.date).slice(0, 10)
        if (!byUser.has(r.user_id)) byUser.set(r.user_id, [])
        byUser.get(r.user_id)!.push(date)
      }
      await Promise.all(
        Array.from(byUser.entries()).map(async ([userId, dates]) => {
          const sorted = [...dates].sort()
          let days: Awaited<ReturnType<typeof fetchEmployeeDays>> = []
          try {
            days = await fetchEmployeeDays(userId, sorted[0], sorted[sorted.length - 1])
          } catch {
            days = []
          }
          const byDate = new Map(days.map((d) => [String(d.date).slice(0, 10), d]))
          await Promise.all(
            sorted.map(async (date) => {
              const capacity = await fetchDayCapacityMinutes(userId, date)
              const ed = byDate.get(date)
              const used = ed
                ? (Number(ed.job_minutes) || 0) + (Number(ed.drive_minutes) || 0)
                : 0
              next[`${date}:${userId}`] = { used, capacity }
            }),
          )
        }),
      )
      if (alive) setLoadByKey(next)
    })()
    return () => {
      alive = false
    }
  }, [rows])

  if (rows == null) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[72px] rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-2">
        No upcoming visits scheduled for this client.
      </p>
    )
  }

  return (
    <div className="space-y-1.5">
      {rows.map((row) => {
        const date = String(row.date).slice(0, 10)
        const key = `${date}:${row.user_id}` as RouteDayKey
        const isPreview = previewKeys.includes(key)
        const isExpanded = expandedKey === key
        const load = loadByKey[key]
        const previewRoute = previewRoutesByKey[key]
        const stops = (previewRoute?.jobs || []).filter((j) => !j.is_home)
        const name = (row.user_name && String(row.user_name).trim()) || `Employee #${row.user_id}`
        const color = colorForUserId(Number(row.user_id))
        const initials = initialsFromName(name)

        return (
          <div
            key={key}
            className={`rounded-xl border transition-colors ${
              isPreview
                ? 'border-accent-500 bg-accent-500/[0.08]'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <button
              type="button"
              className="w-full text-left px-3 py-2.5"
              onClick={() => {
                if (row.user_id == null) return
                if (isPreview) {
                  onSetPreviewRouteDays?.([])
                  setExpandedKey(null)
                  onHoverJob?.(null)
                  return
                }
                onSetPreviewRouteDays?.([{ date, user_id: Number(row.user_id) }])
                setExpandedKey(key)
              }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="w-7 h-7 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                  style={{ background: color }}
                >
                  {initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-gray-900 truncate">
                    {fmtDate(date)}
                    <span className="font-medium text-gray-500"> · {name}</span>
                  </p>
                  <p className="text-[11px] text-gray-500 truncate mt-0.5">
                    {row.time_from
                      ? row.time_to
                        ? `${String(row.time_from).slice(0, 5)} – ${String(row.time_to).slice(0, 5)}`
                        : String(row.time_from).slice(0, 5)
                      : row.is_projected
                        ? 'From subscription'
                        : 'Visit'}
                  </p>
                </div>
              </div>
              {load && (
                <BusyBar usedMinutes={load.used} capacityMinutes={load.capacity} />
              )}
            </button>
            {isExpanded && (
              <div className="border-t border-gray-100 px-3 py-2 space-y-1.5">
                {previewLoading && stops.length === 0 && (
                  <p className="text-[11px] text-gray-400">Loading stops…</p>
                )}
                {stops.map((j) => (
                  <button
                    key={String(j.id)}
                    type="button"
                    className="w-full text-left text-[11px] text-gray-600 truncate hover:text-gray-900"
                    onMouseEnter={() => onHoverJob?.(j.id)}
                    onMouseLeave={() => onHoverJob?.(null)}
                  >
                    {j.label}
                  </button>
                ))}
                {onOpenPlanner && row.user_id != null && (
                  <button
                    type="button"
                    onClick={() => onOpenPlanner(row)}
                    className="mt-1 text-[11px] font-semibold text-accent-700 hover:text-accent-800"
                  >
                    Open in planner →
                  </button>
                )}
                {load && (
                  <p className="text-[10px] text-gray-400 tabular-nums">
                    {fmtMinutes(load.used)} used · {fmtMinutes(Math.max(0, load.capacity - load.used))} left
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ClientExplorePanel({
  clientId,
  companySlug,
  layer,
  onLayerChange,
  onBackToMap,
  navigate,
  previewKeys = [],
  previewRoutesByKey = {},
  previewLoading = false,
  onSetPreviewRouteDays,
  onHoverJob,
  onJobsChanged,
  onPlanNewRound,
  scheduleDate = null,
  scheduleUserId = null,
}: {
  clientId: number
  companySlug: string
  layer: ClientExploreLayer
  onLayerChange: (layer: ClientExploreLayer) => void
  onBackToMap: () => void
  navigate: (mode: MapMode, opts?: { replace?: boolean }) => void
  previewKeys?: RouteDayKey[]
  previewRoutesByKey?: Record<string, UserRoute>
  previewLoading?: boolean
  onSetPreviewRouteDays?: (rows: { date: string; user_id: number }[]) => void
  onHoverJob?: (id: number | string | null) => void
  onJobsChanged?: () => void
  onPlanNewRound?: (stop: StopPayload) => void
  scheduleDate?: string | null
  scheduleUserId?: number | null
}) {
  const [client, setClient] = useState<MapClient | null>(null)
  const [createJobOpen, setCreateJobOpen] = useState(false)
  const [createSubOpen, setCreateSubOpen] = useState(false)
  const [nearestRefresh, setNearestRefresh] = useState(0)

  useEffect(() => {
    let alive = true
    setClient(null)
    fetchClient(clientId).then((c) => {
      if (alive) setClient(c)
    })
    return () => {
      alive = false
    }
  }, [clientId])

  const fullName = client
    ? `${client.name}${client.last_name ? ` ${client.last_name}` : ''}`
    : ''
  const addressLine = client
    ? [client.address, client.zip_code, client.city].filter(Boolean).join(', ')
    : ''
  const hasCoords = client?.lat != null && client?.lng != null
  const slideIndex = layer === 'dashboard' ? 0 : layer === 'routes' ? 1 : 2

  const planRound = useCallback(() => {
    if (!client) return
    onPlanNewRound?.({
      clientId: client.id,
      label: fullName,
      address: client.address || '',
      zip_code: client.zip_code || '',
      city: client.city || '',
      lat: client.lat ?? null,
      lng: client.lng ?? null,
    })
  }, [client, fullName, onPlanNewRound])

  const openPlannerForRow = useCallback(
    (row: { date: string | Date; user_id: number }) => {
      const date = String(row.date).slice(0, 10)
      navigate(
        withReturnTo(
          { kind: 'route', date, userId: Number(row.user_id) },
          { kind: 'idle' },
        ),
      )
    },
    [navigate],
  )

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{
            width: '300%',
            transform: `translateX(-${(slideIndex / 3) * 100}%)`,
          }}
        >
          {/* ── Dashboard ─────────────────────────────────────────── */}
          <div className="w-1/3 flex-shrink-0 pr-1 space-y-3">
            <BackButton onClick={onBackToMap} label="Map" />

            {client == null ? (
              <div className="space-y-2 px-0.5">
                <div className="h-5 w-40 rounded bg-gray-200/80 animate-pulse" />
                <div className="h-3 w-56 rounded bg-gray-200/60 animate-pulse" />
                <div className="h-3 w-44 rounded bg-gray-200/60 animate-pulse" />
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-bold text-gray-900 leading-snug truncate">
                      {fullName}
                    </h2>
                    <p className="text-[12px] text-gray-500 mt-0.5 leading-snug flex items-start gap-1">
                      <MapPinIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                      <span className="truncate">{addressLine || 'No address on file'}</span>
                    </p>
                  </div>
                  <Link
                    href={`/clients/${client.id}`}
                    className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-accent-700 hover:text-accent-800"
                    title="Open client page"
                  >
                    Profile
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                  </Link>
                </div>
                <div className="mt-2.5 space-y-1.5 border-t border-gray-100 pt-2.5">
                  <div className="flex items-center gap-2 text-[12px] text-gray-600 min-w-0">
                    <EnvelopeIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="truncate">{client.email || 'No email'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-gray-600 min-w-0">
                    <PhoneIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="truncate">{client.phone || 'No phone'}</span>
                  </div>
                </div>
              </div>
            )}

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 px-0.5">
                Actions
              </p>
              <div className="space-y-1.5">
                <ActionRow
                  icon={<SparklesIcon className="w-4 h-4" strokeWidth={2} />}
                  title="Create offer"
                  subtitle="Send a quote for this location"
                  comingSoon
                />
                <ActionRow
                  icon={<CalendarDaysIcon className="w-4 h-4" strokeWidth={2} />}
                  title="See routes"
                  subtitle="Upcoming visits (up to 10)"
                  disabled={!client}
                  onClick={() => onLayerChange('routes')}
                />
                <ActionRow
                  icon={<MapIcon className="w-4 h-4" strokeWidth={2} />}
                  title="Nearest routes"
                  subtitle="Closest employee days — next 14 by default"
                  disabled={!client || !hasCoords}
                  onClick={() => onLayerChange('nearest')}
                />
                <ActionRow
                  icon={<PlusCircleIcon className="w-4 h-4" strokeWidth={2} />}
                  title="Schedule job"
                  subtitle="Open the create-job sheet"
                  disabled={!client}
                  onClick={() => setCreateJobOpen(true)}
                />
                <ActionRow
                  icon={<ArrowPathIcon className="w-4 h-4" strokeWidth={2} />}
                  title="Create subscription"
                  subtitle="Set up recurring visits"
                  disabled={!client}
                  onClick={() => setCreateSubOpen(true)}
                />
                <ActionRow
                  icon={<MapIcon className="w-4 h-4" strokeWidth={2} />}
                  title="Plan new round"
                  subtitle="Start a round with this stop"
                  disabled={!client}
                  onClick={planRound}
                />
              </div>
            </div>
          </div>

          {/* ── See routes ────────────────────────────────────────── */}
          <div className="w-1/3 flex-shrink-0 px-1 space-y-3">
            <BackButton onClick={() => onLayerChange('dashboard')} label="Client" />
            <div className="px-0.5">
              <h2 className="text-sm font-bold text-gray-900">Upcoming routes</h2>
              <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                Future visits for {fullName || 'this client'} — tap to preview on the map.
              </p>
            </div>
            <ClientRoutesList
              clientId={clientId}
              previewKeys={previewKeys}
              previewRoutesByKey={previewRoutesByKey}
              previewLoading={previewLoading}
              onSetPreviewRouteDays={onSetPreviewRouteDays}
              onHoverJob={onHoverJob}
              onOpenPlanner={(row) => {
                if (row.user_id == null) return
                openPlannerForRow({ date: String(row.date), user_id: Number(row.user_id) })
              }}
            />
          </div>

          {/* ── Nearest routes ────────────────────────────────────── */}
          <div className="w-1/3 flex-shrink-0 pl-1 space-y-3">
            <BackButton onClick={() => onLayerChange('dashboard')} label="Client" />
            <div className="px-0.5">
              <h2 className="text-sm font-bold text-gray-900">Nearest routes</h2>
              <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                Ranked by distance to this client. Load bars show how busy each day is.
              </p>
            </div>
            {hasCoords && client ? (
              <NearestRoutesList
                lat={Number(client.lat)}
                lng={Number(client.lng)}
                previewKeys={previewKeys}
                previewRoutesByKey={previewRoutesByKey}
                previewLoading={previewLoading}
                refreshKey={nearestRefresh}
                onSelectRoute={(row) => {
                  onSetPreviewRouteDays?.([
                    { date: String(row.date).slice(0, 10), user_id: Number(row.user_id) },
                  ])
                }}
                onHoverJob={onHoverJob}
                onOpenPlanner={(row) => openPlannerForRow(row)}
              />
            ) : (
              <p className="text-sm text-gray-500 py-2">
                This client needs a map location before nearest routes can be ranked.
              </p>
            )}
          </div>
        </div>
      </div>

      <CreateJobSlideout
        isOpen={createJobOpen}
        onClose={() => setCreateJobOpen(false)}
        onJobCreated={() => {
          setCreateJobOpen(false)
          setNearestRefresh((n) => n + 1)
          onJobsChanged?.()
        }}
        clientId={clientId}
        clientName={fullName}
        initialDate={scheduleDate || undefined}
        initialAssignedUserId={scheduleUserId ?? null}
      />

      <CreateSubscription
        isOpen={createSubOpen}
        onClose={() => setCreateSubOpen(false)}
        onSubscriptionCreated={() => {
          setCreateSubOpen(false)
          onJobsChanged?.()
        }}
        initialClientId={clientId}
        lockClient
      />
    </div>
  )
}
