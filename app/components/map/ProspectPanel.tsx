'use client'

/**
 * Prospect / searched-location panel — same slide + ActionRow pattern as
 * ClientExplorePanel, without "See routes" (no history for a new place).
 *
 * Layers: dashboard → nearest routes → create offer
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
  MapIcon,
  MapPinIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline'
import AddClientModal from '@/app/components/AddClientModal'
import CreateJob from '@/app/components/CreateJob'
import CreateJobSlideout from '@/app/components/CreateJobSlideout'
import CreateOfferModal from '@/app/components/offers/CreateOfferModal'
import NearestRoutesList, { fmtDate, type RouteDayKey } from './NearestRoutesList'
import type { CalendarDayMark } from './MapMonthCalendar'
import {
  invalidateMapCaches,
  parsePlaceLabel,
  type MapClient,
  type NearestClientRow,
  type NearestRouteRow,
} from './useMapData'

export type ProspectExploreLayer = 'dashboard' | 'nearest'

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
  trailing,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  onClick?: () => void
  disabled?: boolean
  trailing?: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80 transition-colors disabled:opacity-55 disabled:hover:bg-white disabled:hover:border-gray-200"
    >
      <span className="mt-0.5 w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center flex-shrink-0">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="block text-[13px] font-bold leading-tight text-gray-900">{title}</span>
          {trailing}
        </span>
        {subtitle && (
          <span className="block text-[11px] leading-snug mt-0.5 text-gray-500">{subtitle}</span>
        )}
      </span>
    </button>
  )
}

export default function ProspectPanel({
  lat,
  lng,
  label,
  address: addressProp,
  zip_code: zipProp,
  city: cityProp,
  selectedDate = null,
  selectedUserId = null,
  onSelectRouteDay,
  linkedClient = null,
  previewKeys,
  previewRoutesByKey = {},
  previewLoading = false,
  onSetPreviewRouteDays,
  onNearestClientsLoaded,
  onMarkedDays,
  onHoverJob,
  onJobsChanged,
  onOpenPlanner,
  onBackToMap,
}: {
  lat: number
  lng: number
  label: string
  address?: string
  zip_code?: string
  city?: string
  selectedDate?: string | null
  selectedUserId?: number | null
  onSelectRouteDay: (next: { date: string; userId?: number } | null) => void
  linkedClient?: MapClient | null
  previewKeys: RouteDayKey[]
  previewRoutesByKey?: Record<string, import('@/app/components/RouteMap').UserRoute>
  previewLoading?: boolean
  onSetPreviewRouteDays: (rows: { date: string; user_id: number }[]) => void
  onNearestClientsLoaded: (payload: { clients: NearestClientRow[]; radiusKm: number } | null) => void
  onMarkedDays?: (marks: CalendarDayMark[]) => void
  onHoverJob?: (id: number | string | null) => void
  onJobsChanged?: () => void
  onOpenPlanner?: (row: NearestRouteRow) => void
  /** When set, shows Map back on the dashboard (explore-sidebar mode). */
  onBackToMap?: () => void
}) {
  const [layer, setLayer] = useState<ProspectExploreLayer>('dashboard')
  const [showAddClient, setShowAddClient] = useState(false)
  const [createJobOpen, setCreateJobOpen] = useState(false)
  const [createOfferOpen, setCreateOfferOpen] = useState(false)
  const [clientAddedNote, setClientAddedNote] = useState(false)
  const [routeRows, setRouteRows] = useState<NearestRouteRow[] | null>(null)
  const [routesRefreshKey, setRoutesRefreshKey] = useState(0)

  useEffect(() => {
    onNearestClientsLoaded(null)
    return () => onNearestClientsLoaded(null)
  }, [onNearestClientsLoaded])

  useEffect(() => {
    setLayer('dashboard')
    setRouteRows(null)
  }, [lat, lng, label])

  const publishMarks = useCallback((list: NearestRouteRow[] | null) => {
    if (!onMarkedDays) return
    if (!list || list.length === 0) {
      onMarkedDays([])
      return
    }
    const dates = new Set(list.map(r => String(r.date).slice(0, 10)))
    onMarkedDays(Array.from(dates).map(date => ({ date, status: 'scheduled' as const })))
  }, [onMarkedDays])

  const handleRowsChange = useCallback((list: NearestRouteRow[] | null) => {
    setRouteRows(list)
    publishMarks(list)
  }, [publishMarks])

  useEffect(() => {
    if (!selectedDate) {
      onSetPreviewRouteDays([])
      return
    }
    if (!routeRows) return
    const forDay = routeRows.filter(r => String(r.date).slice(0, 10) === selectedDate)
    if (forDay.length === 0) {
      onSetPreviewRouteDays([])
      return
    }
    const pinned = selectedUserId != null
      ? forDay.find(r => r.user_id === selectedUserId)
      : null
    const best = pinned || forDay[0]
    onSetPreviewRouteDays([{ date: String(best.date).slice(0, 10), user_id: best.user_id }])
  }, [selectedDate, selectedUserId, routeRows, onSetPreviewRouteDays])

  const handleSelectRoute = useCallback((row: NearestRouteRow) => {
    const date = String(row.date).slice(0, 10)
    const key = `${date}:${row.user_id}`
    if (previewKeys.includes(key)) {
      onSetPreviewRouteDays([])
      onSelectRouteDay(null)
      return
    }
    onSetPreviewRouteDays([{ date, user_id: row.user_id }])
    onSelectRouteDay({ date, userId: row.user_id })
  }, [onSelectRouteDay, onSetPreviewRouteDays, previewKeys])

  const linkedName = linkedClient
    ? `${linkedClient.name}${linkedClient.last_name ? ` ${linkedClient.last_name}` : ''}`
    : ''

  const resolvedAddress = useMemo(() => {
    const guessed = parsePlaceLabel(label)
    return {
      address: (addressProp || '').trim() || guessed.address || label,
      zip_code: (zipProp || '').trim() || guessed.zip_code,
      city: (cityProp || '').trim() || guessed.city,
    }
  }, [addressProp, zipProp, cityProp, label])

  const scheduleDateLabel = selectedDate
    ? fmtDate(selectedDate, { weekday: 'short', day: 'numeric', month: 'short' })
    : null

  const scheduleUserId = useMemo(() => {
    if (selectedUserId != null && Number.isFinite(selectedUserId)) return selectedUserId
    const key = previewKeys[0]
    if (!key) return null
    const uid = parseInt(String(key).split(':')[1], 10)
    return Number.isFinite(uid) ? uid : null
  }, [selectedUserId, previewKeys])

  const addressLine = [resolvedAddress.address, resolvedAddress.zip_code, resolvedAddress.city]
    .filter(Boolean)
    .join(', ')

  const slideIndex = layer === 'dashboard' ? 0 : 1

  const newClientPrefill = {
    address: resolvedAddress.address,
    zip_code: resolvedAddress.zip_code,
    city: resolvedAddress.city,
    lat,
    lng,
  }

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{
            width: '200%',
            transform: `translateX(-${(slideIndex / 2) * 100}%)`,
          }}
        >
          {/* ── Dashboard ─────────────────────────────────────────── */}
          <div className="w-1/2 flex-shrink-0 pr-1 space-y-3">
            {onBackToMap && <BackButton onClick={onBackToMap} label="Map" />}

            <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold text-gray-900 leading-snug">
                  {label}
                </h2>
                <p className="text-[12px] text-gray-500 mt-0.5 leading-snug flex items-start gap-1">
                  <MapPinIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                  <span className="truncate">{addressLine || 'Searched location'}</span>
                </p>
              </div>
              <p className="mt-2.5 text-[11px] text-gray-500 border-t border-gray-100 pt-2.5">
                {linkedClient ? `Linked to ${linkedName}` : 'Not a client yet — add them or schedule a job here.'}
              </p>
              {clientAddedNote && (
                <p className="mt-2 text-xs text-accent-600 font-medium">
                  Client created — search their name to open them.
                </p>
              )}
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 px-0.5">
                Actions
              </p>
              <div className="space-y-1.5">
                <ActionRow
                  icon={<MapIcon className="w-4 h-4" strokeWidth={2} />}
                  title="Nearest routes"
                  subtitle="Closest employee days nearby"
                  onClick={() => setLayer('nearest')}
                />
                <ActionRow
                  icon={<CalendarDaysIcon className="w-4 h-4" strokeWidth={2} />}
                  title="Schedule job"
                  subtitle="Create a job at this address"
                  trailing={
                    scheduleDateLabel ? (
                      <span className="text-[10px] font-semibold text-accent-600">
                        for {scheduleDateLabel}
                      </span>
                    ) : undefined
                  }
                  onClick={() => setCreateJobOpen(true)}
                />
                {!linkedClient && (
                  <ActionRow
                    icon={<UserPlusIcon className="w-4 h-4" strokeWidth={2} />}
                    title="Add as client"
                    subtitle="Save this place to your clients"
                    onClick={() => setShowAddClient(true)}
                  />
                )}
                <ActionRow
                  icon={<DocumentTextIcon className="w-4 h-4" strokeWidth={2} />}
                  title="Create offer"
                  subtitle="Quote this place"
                  onClick={() => setCreateOfferOpen(true)}
                />
              </div>
            </div>
          </div>

          {/* ── Nearest routes ────────────────────────────────────── */}
          <div className="w-1/2 flex-shrink-0 px-1 space-y-3">
            <BackButton onClick={() => setLayer('dashboard')} label="Location" />
            <div>
              <h2 className="text-sm font-bold text-gray-900">Nearest routes</h2>
              <p className="text-[11px] text-gray-500 mt-0.5 mb-2">
                Closest employee days to this place
              </p>
              <NearestRoutesList
                lat={lat}
                lng={lng}
                onSelectRoute={handleSelectRoute}
                onRowsChange={handleRowsChange}
                previewKeys={previewKeys}
                previewRoutesByKey={previewRoutesByKey}
                previewLoading={previewLoading}
                onHoverJob={onHoverJob}
                refreshKey={routesRefreshKey}
                onOpenPlanner={onOpenPlanner}
              />
            </div>
          </div>

        </div>
      </div>

      <AddClientModal
        isOpen={showAddClient}
        onClose={() => setShowAddClient(false)}
        initialAddress={resolvedAddress.address}
        initialZip={resolvedAddress.zip_code}
        initialCity={resolvedAddress.city}
        initialLat={lat}
        initialLng={lng}
        onClientAdded={() => {
          setShowAddClient(false)
          invalidateMapCaches()
          setClientAddedNote(true)
          setTimeout(() => setClientAddedNote(false), 6000)
        }}
      />

      {linkedClient ? (
        <CreateJobSlideout
          isOpen={createJobOpen}
          onClose={() => setCreateJobOpen(false)}
          onJobCreated={() => {
            setCreateJobOpen(false)
            onJobsChanged?.()
            setRoutesRefreshKey(k => k + 1)
          }}
          clientId={linkedClient.id}
          clientName={`${linkedClient.name}${linkedClient.last_name ? ` ${linkedClient.last_name}` : ''}`}
          initialDate={selectedDate || undefined}
          initialAssignedUserId={scheduleUserId}
        />
      ) : (
        <CreateJob
          isOpen={createJobOpen}
          onClose={() => setCreateJobOpen(false)}
          onJobCreated={() => {
            setCreateJobOpen(false)
            onJobsChanged?.()
            setRoutesRefreshKey(k => k + 1)
          }}
          initialDate={selectedDate || undefined}
          initialAssignedUserId={scheduleUserId}
          initialNewClient={newClientPrefill}
        />
      )}

      <CreateOfferModal
        isOpen={createOfferOpen}
        onClose={() => setCreateOfferOpen(false)}
        lockClient={Boolean(linkedClient)}
        prefill={{
          clientId: linkedClient?.id ?? null,
          clientName: linkedClient
            ? `${linkedClient.name}${linkedClient.last_name ? ` ${linkedClient.last_name}` : ''}`
            : '',
          email: linkedClient?.email,
          phone: linkedClient?.phone,
          address: resolvedAddress.address,
          zip_code: resolvedAddress.zip_code,
          city: resolvedAddress.city,
          lat,
          lng,
        }}
      />
    </div>
  )
}
