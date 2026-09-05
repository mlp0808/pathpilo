'use client'

/**
 * Floating profile cards for searched locations and clients — top-right of the
 * map, independent of the left sidebar / planner. Multiple cards stack and
 * scroll; each closes only via its own X (and removes its map pin).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  HomeIcon,
  MapIcon,
  MapPinIcon,
  PlusCircleIcon,
  UserCircleIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import AddClientModal from '@/app/components/AddClientModal'
import CreateJob from '@/app/components/CreateJob'
import CreateJobSlideout from '@/app/components/CreateJobSlideout'
import NearestRoutesList, { fmtDate, type RouteDayKey } from './NearestRoutesList'
import {
  createOffer,
  fetchClient,
  parsePlaceLabel,
  type MapClient,
  type NearestRouteRow,
} from './useMapData'
import type { MapOverlay, MapOverlayClient, MapOverlayEmployee, MapOverlayLocation } from './mapOverlays'

const BRAND = '#193434'

function ProfileActionButtons({
  items,
}: {
  items: { key: string; label: string; icon: ReactNode; onClick: () => void; active?: boolean }[]
}) {
  if (items.length === 0) return null

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          onClick={item.onClick}
          className={`inline-flex h-7 max-w-full items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition-colors ${
            item.active
              ? 'border-primary-500/20 bg-primary-500 text-white'
              : 'border-gray-200/90 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-white hover:text-gray-900'
          }`}
        >
          <span className={`flex-shrink-0 ${item.active ? 'text-white/90' : 'text-gray-400'}`}>
            {item.icon}
          </span>
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  )
}

function clientDisplayName(c: MapOverlayClient) {
  return `${c.name}${c.last_name ? ` ${c.last_name}` : ''}`.trim()
}

function clientAddressLine(c: MapOverlayClient) {
  return [c.address, c.zip_code, c.city].filter(Boolean).join(', ')
}

function LocationCardBody({
  overlay,
  scheduleDate,
  scheduleUserId,
  onRoute = false,
  routeStopNumber = null,
  routeColor = null,
  onAddToRoute,
  onPlanNewRoute,
  onJobsChanged,
  onClose,
  onBecameClient,
}: {
  overlay: MapOverlayLocation
  scheduleDate?: string | null
  scheduleUserId?: number | null
  /** True when a day/route/sandbox planner is open. */
  onRoute?: boolean
  routeStopNumber?: number | null
  routeColor?: string | null
  onAddToRoute?: (stop: {
    clientId?: number | null
    label: string
    address?: string
    zip_code?: string
    city?: string
    lat?: number | null
    lng?: number | null
    locationKey?: string
  }) => void
  onPlanNewRoute?: (stop: {
    clientId?: number | null
    label: string
    address?: string
    zip_code?: string
    city?: string
    lat?: number | null
    lng?: number | null
    locationKey?: string
  }) => void
  onJobsChanged?: () => void
  onClose: () => void
  onBecameClient?: (clientId: number) => void
}) {
  const [showAddClient, setShowAddClient] = useState(false)
  const [createJobOpen, setCreateJobOpen] = useState(false)
  const [showOffer, setShowOffer] = useState(false)
  const [clientAddedNote, setClientAddedNote] = useState(false)
  const [linkedClient, setLinkedClient] = useState<MapClient | null>(null)

  const [offerSelection, setOfferSelection] = useState<Map<RouteDayKey, NearestRouteRow>>(new Map())
  const [offerTitle, setOfferTitle] = useState('')
  const [offerMessage, setOfferMessage] = useState('')
  const [offerPrice, setOfferPrice] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [offerError, setOfferError] = useState<string | null>(null)
  const [offerLink, setOfferLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const parsed = useMemo(
    () => parsePlaceLabel(overlay.label),
    [overlay.label],
  )
  const address = overlay.address || parsed.address
  const zip_code = overlay.zip_code || parsed.zip_code
  const city = overlay.city || parsed.city

  useEffect(() => {
    if (overlay.linkedClientId == null) {
      setLinkedClient(null)
      return
    }
    let alive = true
    fetchClient(overlay.linkedClientId).then(c => {
      if (alive) setLinkedClient(c)
    }).catch(() => {
      if (alive) setLinkedClient(null)
    })
    return () => { alive = false }
  }, [overlay.linkedClientId])

  useEffect(() => {
    setShowOffer(false)
    setOfferLink(null)
    setOfferSelection(new Map())
    setOfferError(null)
  }, [overlay.key])

  const selectedRows = useMemo(() => Array.from(offerSelection.values()), [offerSelection])

  const toggleOfferDate = useCallback((row: NearestRouteRow) => {
    const key: RouteDayKey = `${String(row.date).slice(0, 10)}:${row.user_id}`
    setOfferSelection(prev => {
      const next = new Map(prev)
      if (next.has(key)) next.delete(key)
      else if (next.size < 4) next.set(key, row)
      return next
    })
  }, [])

  const submitOffer = async () => {
    if (selectedRows.length === 0) {
      setOfferError('Pick at least one nearby route-day.')
      return
    }
    if (!linkedClient && !contactName.trim()) {
      setOfferError('Add the recipient name.')
      return
    }
    setSending(true)
    setOfferError(null)
    try {
      const { offer } = await createOffer({
        client_id: linkedClient?.id ?? null,
        title: offerTitle.trim() || 'Service offer',
        message: offerMessage.trim() || null,
        contact_name: linkedClient ? null : contactName.trim(),
        contact_email: contactEmail.trim() || null,
        contact_phone: null,
        address: overlay.label,
        lat: overlay.lat,
        lng: overlay.lng,
        service_minutes: 30,
        price: offerPrice ? parseFloat(offerPrice) : null,
        proposed_dates: selectedRows.map(r => ({
          date: r.date,
          user_id: r.user_id,
          user_name: r.user_name,
        })),
      })
      setOfferLink(`${window.location.origin}/o/${offer.token}`)
    } catch (e: any) {
      setOfferError(e?.message || 'Could not create offer.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="flex items-start gap-3 pr-6">
        <span
          className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl text-[13px] font-bold text-white shadow-sm"
          style={{ background: routeStopNumber != null ? (routeColor || BRAND) : BRAND }}
        >
          {routeStopNumber != null ? routeStopNumber : <MapPinIcon className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-bold leading-snug text-gray-900">{overlay.label}</h3>
          <p className="mt-0.5 text-[11.5px] font-medium leading-snug text-gray-500">
            {linkedClient
              ? `Linked to ${linkedClient.name}${linkedClient.last_name ? ` ${linkedClient.last_name}` : ''}`
              : 'Searched location'}
          </p>
          {clientAddedNote && (
            <p className="mt-1.5 text-[11px] font-semibold text-accent-600">
              Client created — search their name to open them.
            </p>
          )}
        </div>
      </div>

      <ProfileActionButtons
        items={[
          ...(onRoute && onAddToRoute
            ? [{
                key: 'add-to-route',
                label: 'Add to route',
                icon: <PlusCircleIcon className="h-3 w-3" />,
                onClick: () => onAddToRoute({
                  clientId: linkedClient?.id ?? overlay.linkedClientId ?? null,
                  label: linkedClient
                    ? `${linkedClient.name}${linkedClient.last_name ? ` ${linkedClient.last_name}` : ''}`.trim()
                    : overlay.label,
                  address: address || overlay.label,
                  zip_code: zip_code || '',
                  city: city || '',
                  lat: overlay.lat,
                  lng: overlay.lng,
                  locationKey: overlay.key,
                }),
              }]
            : [
                {
                  key: 'schedule',
                  label: 'Schedule',
                  icon: <CalendarDaysIcon className="h-3 w-3" />,
                  onClick: () => setCreateJobOpen(true),
                },
                ...(!onRoute && onPlanNewRoute
                  ? [{
                      key: 'plan-new-route',
                      label: 'Plan new route',
                      icon: <MapIcon className="h-3 w-3" />,
                      onClick: () => onPlanNewRoute!({
                        clientId: linkedClient?.id ?? overlay.linkedClientId ?? null,
                        label: linkedClient
                          ? `${linkedClient.name}${linkedClient.last_name ? ` ${linkedClient.last_name}` : ''}`.trim()
                          : overlay.label,
                        address: address || overlay.label,
                        zip_code: zip_code || '',
                        city: city || '',
                        lat: overlay.lat,
                        lng: overlay.lng,
                        locationKey: overlay.key,
                      }),
                    }]
                  : []),
              ]),
          ...(!linkedClient
            ? [{
                key: 'add-client',
                label: 'Add client',
                icon: <UserPlusIcon className="h-3 w-3" />,
                onClick: () => setShowAddClient(true),
              }]
            : []),
          {
            key: 'offer',
            label: 'Offer',
            icon: <DocumentTextIcon className="h-3 w-3" />,
            onClick: () => setShowOffer(v => !v),
            active: showOffer,
          },
        ]}
      />

      {showOffer && (
        <div className="mt-3 rounded-xl border border-gray-200/80 bg-white p-3">
          {offerLink ? (
            <div>
              <p className="text-[12px] font-bold text-gray-900">Offer created</p>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                Send this link — they pick a date and it lands on that route.
              </p>
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
                <span className="flex-1 truncate text-[11px] text-gray-600">{offerLink}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(offerLink).then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    })
                  }}
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold text-white"
                  style={{ background: BRAND }}
                >
                  <ClipboardDocumentIcon className="h-3 w-3" />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[11px] leading-relaxed text-gray-500">
                Tick up to 4 nearby route-days. The recipient picks one.
              </p>
              {selectedRows.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedRows.map(r => (
                    <button
                      key={`${r.date}:${r.user_id}`}
                      type="button"
                      onClick={() => toggleOfferDate(r)}
                      className="inline-flex items-center rounded-full bg-primary-500/10 px-2 py-0.5 text-[10px] font-semibold text-primary-500"
                    >
                      {fmtDate(String(r.date), { day: 'numeric', month: 'short' })} · {r.user_name.split(' ')[0]} ✕
                    </button>
                  ))}
                </div>
              )}
              <NearestRoutesList
                lat={overlay.lat}
                lng={overlay.lng}
                selectable
                selected={Array.from(offerSelection.keys())}
                onToggleSelect={toggleOfferDate}
                expandable={false}
              />
              {!linkedClient && (
                <>
                  <input
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                    placeholder="Recipient name *"
                    className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-primary-500/40"
                  />
                  <input
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-primary-500/40"
                  />
                </>
              )}
              <input
                value={offerTitle}
                onChange={e => setOfferTitle(e.target.value)}
                placeholder="Offer title"
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-primary-500/40"
              />
              {offerError && <p className="text-[11px] font-medium text-red-500">{offerError}</p>}
              <button
                type="button"
                disabled={sending}
                onClick={submitOffer}
                className="w-full rounded-xl py-2 text-[12px] font-bold text-white disabled:opacity-60"
                style={{ background: BRAND }}
              >
                {sending ? 'Creating…' : 'Create offer link'}
              </button>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        aria-label="Close"
      >
        <XMarkIcon className="h-4 w-4" strokeWidth={2.25} />
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AddClientModal
          isOpen={showAddClient}
          onClose={() => setShowAddClient(false)}
          initialAddress={address || overlay.label}
          initialZip={zip_code || ''}
          initialCity={city || ''}
          initialLat={overlay.lat}
          initialLng={overlay.lng}
          onClientAdded={(clientId) => {
            setShowAddClient(false)
            if (clientId) {
              onBecameClient?.(clientId)
            } else {
              setClientAddedNote(true)
            }
            onJobsChanged?.()
          }}
        />,
        document.body,
      )}

      {typeof document !== 'undefined' && createPortal(
        linkedClient ? (
          <CreateJobSlideout
            isOpen={createJobOpen}
            onClose={() => setCreateJobOpen(false)}
            onJobCreated={() => {
              setCreateJobOpen(false)
              onJobsChanged?.()
            }}
            clientId={linkedClient.id}
            clientName={`${linkedClient.name}${linkedClient.last_name ? ` ${linkedClient.last_name}` : ''}`}
            initialDate={scheduleDate || undefined}
            initialAssignedUserId={scheduleUserId ?? null}
          />
        ) : (
          <CreateJob
            isOpen={createJobOpen}
            onClose={() => setCreateJobOpen(false)}
            onJobCreated={(info) => {
              setCreateJobOpen(false)
              if (info?.clientId) onBecameClient?.(info.clientId)
              onJobsChanged?.()
            }}
            initialDate={scheduleDate || undefined}
            initialAssignedUserId={scheduleUserId ?? undefined}
            initialNewClient={{
              address: address || overlay.label,
              zip_code: zip_code || '',
              city: city || '',
              lat: overlay.lat,
              lng: overlay.lng,
            }}
          />
        ),
        document.body,
      )}
    </>
  )
}

function ClientCardBody({
  overlay,
  scheduleDate,
  scheduleUserId,
  onRoute = false,
  routeStopNumber = null,
  routeColor = null,
  onAddToRoute,
  onPlanNewRoute,
  onSelectClient,
  onJobsChanged,
  onClose,
}: {
  overlay: MapOverlayClient
  scheduleDate?: string | null
  scheduleUserId?: number | null
  onRoute?: boolean
  routeStopNumber?: number | null
  routeColor?: string | null
  onAddToRoute?: (stop: {
    clientId?: number | null
    label: string
    address?: string
    zip_code?: string
    city?: string
    lat?: number | null
    lng?: number | null
  }) => void
  onPlanNewRoute?: (stop: {
    clientId?: number | null
    label: string
    address?: string
    zip_code?: string
    city?: string
    lat?: number | null
    lng?: number | null
  }) => void
  /** Open the left-sidebar client dashboard for this client. */
  onSelectClient?: (clientId: number) => void
  onJobsChanged?: () => void
  onClose: () => void
}) {
  const [createJobOpen, setCreateJobOpen] = useState(false)
  const [resolved, setResolved] = useState<MapClient | null>(null)

  useEffect(() => {
    let alive = true
    fetchClient(overlay.clientId)
      .then(c => { if (alive) setResolved(c) })
      .catch(() => { if (alive) setResolved(null) })
    return () => { alive = false }
  }, [overlay.clientId])

  const name = resolved
    ? `${resolved.name}${resolved.last_name ? ` ${resolved.last_name}` : ''}`
    : clientDisplayName(overlay)
  const addressLine = resolved
    ? [resolved.address, resolved.zip_code, resolved.city].filter(Boolean).join(', ')
    : clientAddressLine(overlay)

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() || '')
    .join('') || '?'

  return (
    <>
      <div className="flex items-start gap-3 pr-6">
        <span
          className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl text-[13px] font-bold text-white shadow-sm"
          style={{ background: routeStopNumber != null ? (routeColor || BRAND) : BRAND }}
        >
          {routeStopNumber != null ? routeStopNumber : initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <h3 className="min-w-0 flex-1 truncate text-[14px] font-bold leading-snug text-gray-900">
              {name}
            </h3>
            <Link
              href={`/clients/${overlay.clientId}`}
              className="mt-0.5 flex-shrink-0 text-gray-400 transition-colors hover:text-gray-700"
              title="Open profile"
            >
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
          <p className="mt-0.5 truncate text-[11.5px] font-medium leading-snug text-gray-500">
            {addressLine || 'Existing client'}
          </p>
        </div>
      </div>

      <ProfileActionButtons
        items={[
          ...(onSelectClient
            ? [{
                key: 'select',
                label: 'Select',
                icon: <UserCircleIcon className="h-3 w-3" />,
                onClick: () => onSelectClient(overlay.clientId),
                active: true,
              }]
            : []),
          {
            key: 'schedule',
            label: 'Schedule',
            icon: <CalendarDaysIcon className="h-3 w-3" />,
            onClick: () => setCreateJobOpen(true),
          },
          ...(onRoute && onAddToRoute
            ? [{
                key: 'add-to-route',
                label: 'Add to route',
                icon: <PlusCircleIcon className="h-3 w-3" />,
                onClick: () => onAddToRoute({
                  clientId: overlay.clientId,
                  label: name,
                  address: resolved?.address || overlay.address || '',
                  zip_code: resolved?.zip_code || overlay.zip_code || '',
                  city: resolved?.city || overlay.city || '',
                  lat: resolved?.lat ?? overlay.lat ?? null,
                  lng: resolved?.lng ?? overlay.lng ?? null,
                }),
              }]
            : !onRoute && onPlanNewRoute
              ? [{
                  key: 'plan-new-route',
                  label: 'Plan new route',
                  icon: <MapIcon className="h-3 w-3" />,
                  onClick: () => onPlanNewRoute({
                    clientId: overlay.clientId,
                    label: name,
                    address: resolved?.address || overlay.address || '',
                    zip_code: resolved?.zip_code || overlay.zip_code || '',
                    city: resolved?.city || overlay.city || '',
                    lat: resolved?.lat ?? overlay.lat ?? null,
                    lng: resolved?.lng ?? overlay.lng ?? null,
                  }),
                }]
              : []),
        ]}
      />

      <button
        type="button"
        onClick={onClose}
        className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        aria-label="Close"
      >
        <XMarkIcon className="h-4 w-4" strokeWidth={2.25} />
      </button>

      {typeof document !== 'undefined' && createPortal(
        <CreateJobSlideout
          isOpen={createJobOpen}
          onClose={() => setCreateJobOpen(false)}
          onJobCreated={() => {
            setCreateJobOpen(false)
            onJobsChanged?.()
          }}
          clientId={overlay.clientId}
          clientName={name}
          initialDate={scheduleDate || undefined}
          initialAssignedUserId={scheduleUserId ?? null}
        />,
        document.body,
      )}
    </>
  )
}

function EmployeeCardBody({
  overlay,
  scheduleDate,
  onSelectEmployee,
  onJobsChanged,
  onClose,
}: {
  overlay: MapOverlayEmployee
  scheduleDate?: string | null
  onSelectEmployee?: (userId: number) => void
  onJobsChanged?: () => void
  onClose: () => void
}) {
  const [createJobOpen, setCreateJobOpen] = useState(false)
  const name = `${overlay.first_name}${overlay.last_name ? ` ${overlay.last_name}` : ''}`.trim()
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() || '')
    .join('') || '?'

  return (
    <>
      <div className="flex items-start gap-3 pr-6">
        <span
          className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl text-[13px] font-bold text-white shadow-sm"
          style={{ background: BRAND }}
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="min-w-0 truncate text-[14px] font-bold leading-snug text-gray-900">
            {name}
          </h3>
          <p className="mt-0.5 truncate text-[11.5px] font-medium leading-snug text-gray-500">
            {overlay.address || 'Employee'}
          </p>
        </div>
      </div>

      <ProfileActionButtons
        items={[
          ...(onSelectEmployee
            ? [{
                key: 'select',
                label: 'Select',
                icon: <HomeIcon className="h-3 w-3" />,
                onClick: () => onSelectEmployee(overlay.userId),
                active: true,
              }]
            : []),
          {
            key: 'schedule',
            label: 'Schedule',
            icon: <CalendarDaysIcon className="h-3 w-3" />,
            onClick: () => setCreateJobOpen(true),
          },
        ]}
      />

      <button
        type="button"
        onClick={onClose}
        className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        aria-label="Close"
      >
        <XMarkIcon className="h-4 w-4" strokeWidth={2.25} />
      </button>

      {typeof document !== 'undefined' && createPortal(
        <CreateJob
          isOpen={createJobOpen}
          onClose={() => setCreateJobOpen(false)}
          onJobCreated={() => {
            setCreateJobOpen(false)
            onJobsChanged?.()
          }}
          initialDate={scheduleDate || undefined}
          initialAssignedUserId={overlay.userId}
        />,
        document.body,
      )}
    </>
  )
}

export default function MapProfileStack({
  overlays,
  onClose,
  onLocationBecameClient,
  onHoverOverlay,
  hoveredKey = null,
  scheduleDate = null,
  scheduleUserId = null,
  onRoute = false,
  routeStopMeta = {},
  onAddToRoute,
  onPlanNewRoute,
  onSelectClient,
  onSelectEmployee,
  onJobsChanged,
}: {
  overlays: MapOverlay[]
  onClose: (key: string) => void
  /** Called when a location card is converted to a client after "Add client". */
  onLocationBecameClient?: (locationKey: string, clientId: number) => void
  /** Hover a card → highlight its map pin. */
  onHoverOverlay?: (key: string | null) => void
  /** Active hover from card or matching map pin — lights the cart. */
  hoveredKey?: string | null
  /** Prefill Schedule job from the active day/route planner. */
  scheduleDate?: string | null
  scheduleUserId?: number | null
  /** Day/route/sandbox planner is open — show Add to route instead of Plan new route. */
  onRoute?: boolean
  /** Stop number + route color for overlays that are on the focused route. */
  routeStopMeta?: Record<string, { stopNumber: number; routeColor: string }>
  onAddToRoute?: (stop: {
    clientId?: number | null
    label: string
    address?: string
    zip_code?: string
    city?: string
    lat?: number | null
    lng?: number | null
    locationKey?: string
  }) => void
  onPlanNewRoute?: (stop: {
    clientId?: number | null
    label: string
    address?: string
    zip_code?: string
    city?: string
    lat?: number | null
    lng?: number | null
    locationKey?: string
  }) => void
  /** Open left-sidebar client dashboard. */
  onSelectClient?: (clientId: number) => void
  /** Open left-sidebar employee week view. */
  onSelectEmployee?: (userId: number) => void
  onJobsChanged?: () => void
}) {
  if (overlays.length === 0) return null

  return (
    <div className="pointer-events-none absolute bottom-3 right-3 top-3 z-30 flex w-[min(100%-1.5rem,320px)] flex-col sm:bottom-4 sm:right-4 sm:top-4 lg:top-[4.25rem]">
      <div
        className="pointer-events-auto flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain pr-0.5"
        style={{ scrollbarWidth: 'thin' }}
      >
        {overlays.map(overlay => {
          const meta = routeStopMeta[overlay.key]
          const isLit = hoveredKey === overlay.key
          return (
          <article
            key={overlay.key}
            onMouseEnter={() => onHoverOverlay?.(overlay.key)}
            onMouseLeave={() => onHoverOverlay?.(null)}
            className={`relative flex-shrink-0 rounded-2xl border bg-white/95 p-3.5 backdrop-blur-xl transition-all duration-200 animate-in fade-in slide-in-from-right-2 ${
              isLit
                ? 'border-[#193434]/35 shadow-[0_16px_44px_rgba(25,52,52,0.22),0_0_0_3px_rgba(25,52,52,0.12)] ring-1 ring-[#193434]/25'
                : 'border-white/70 shadow-[0_12px_40px_rgba(25,52,52,0.14),0_2px_8px_rgba(0,0,0,0.06)]'
            }`}
          >
            {overlay.kind === 'location' ? (
              <LocationCardBody
                overlay={overlay}
                scheduleDate={scheduleDate}
                scheduleUserId={scheduleUserId}
                onRoute={onRoute}
                routeStopNumber={meta?.stopNumber ?? null}
                routeColor={meta?.routeColor ?? null}
                onAddToRoute={onAddToRoute}
                onPlanNewRoute={onPlanNewRoute}
                onJobsChanged={onJobsChanged}
                onClose={() => onClose(overlay.key)}
                onBecameClient={clientId => onLocationBecameClient?.(overlay.key, clientId)}
              />
            ) : overlay.kind === 'employee' ? (
              <EmployeeCardBody
                overlay={overlay}
                scheduleDate={scheduleDate}
                onSelectEmployee={onSelectEmployee}
                onJobsChanged={onJobsChanged}
                onClose={() => onClose(overlay.key)}
              />
            ) : (
              <ClientCardBody
                overlay={overlay}
                scheduleDate={scheduleDate}
                scheduleUserId={scheduleUserId}
                onRoute={onRoute}
                routeStopNumber={meta?.stopNumber ?? null}
                routeColor={meta?.routeColor ?? null}
                onAddToRoute={onAddToRoute}
                onPlanNewRoute={onPlanNewRoute}
                onSelectClient={onSelectClient}
                onJobsChanged={onJobsChanged}
                onClose={() => onClose(overlay.key)}
              />
            )}
          </article>
          )
        })}
      </div>
    </div>
  )
}
