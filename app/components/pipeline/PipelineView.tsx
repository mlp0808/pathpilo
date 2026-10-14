'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import {
  ArchiveBoxIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  CheckIcon,
  DocumentTextIcon,
  InboxArrowDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  Squares2X2Icon,
  UserPlusIcon,
} from '@heroicons/react/24/outline'
import AppLayout from '../AppLayout'
import ConfirmModal from '../ConfirmModal'
import { useAppI18n } from '../I18nProvider'
import { apiUrl } from '../../utils/api'
import { formatMoney } from '../../config/countryRules'
import { useCompanyCountryCode } from '../../hooks/useCompanyCountryCode'
import { refreshNotifications, useNotifications } from '../../hooks/useNotifications'
import { geocodeAddress } from '../../utils/dayRouteShared'
import { addDaysYmd, formatDay, todayYmd, type OfferPrefill, type OfferRecord } from '../../lib/offers'
import {
  ago,
  buildPipeline,
  countByStage,
  fill,
  type Bucket,
  type Lead,
  type PipelineItem,
  type Reason,
  type Stage,
} from '../../lib/pipeline'
import PipelineDetail, { type PipelineActions } from './PipelineDetail'

const CreateOfferModal = dynamic(() => import('../offers/CreateOfferModal'), { ssr: false })
const CreateJob = dynamic(() => import('../CreateJob'), { ssr: false })

type View = 'active' | 'done' | 'archived'

function authHeaders(json = false): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) }
}

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), { ...init, headers: authHeaders(!!init?.body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Request failed')
  return data as T
}

const STAGE_META: Record<Stage, { icon: React.ComponentType<{ className?: string }>; badge: string }> = {
  lead: { icon: InboxArrowDownIcon, badge: 'bg-sky-50 text-sky-600' },
  offer: { icon: DocumentTextIcon, badge: 'bg-gray-100 text-gray-600' },
  booking: { icon: CalendarDaysIcon, badge: 'bg-[#ecfdf3] text-[#1f7a46]' },
}

/** Items that have gone quiet — safe to clear in one go. */
const CLEANUP: Reason[] = ['offer.expired', 'offer.declined', 'lead.stale']

export default function PipelineView({ initialStage = null, legacyKind }: { initialStage?: Stage | null; legacyKind?: 'lead' | 'offer' }) {
  const { t, locale } = useAppI18n()
  const params = useParams<{ company?: string }>()
  const searchParams = useSearchParams()
  const companySlug = params?.company || ''
  const base = companySlug ? `/${companySlug}` : ''
  const countryCode = useCompanyCountryCode()
  const { items: notifications } = useNotifications()

  const [leads, setLeads] = useState<Lead[]>([])
  const [offers, setOffers] = useState<OfferRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A deep link shows the item in context, whatever stage it has reached.
  const [stage, setStage] = useState<Stage | null>(() =>
    searchParams.get('lead') || searchParams.get('offer') || searchParams.get('id') ? null : initialStage,
  )
  const [view, setView] = useState<View>('active')
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    const lead = searchParams.get('lead')
    const offer = searchParams.get('offer')
    const id = searchParams.get('id')
    if (offer) return `offer-${offer}`
    if (lead) return `lead-${lead}`
    if (id && legacyKind) return `${legacyKind}-${id}`
    return null
  })
  const [mobileOpen, setMobileOpen] = useState(() => !!(searchParams.get('lead') || searchParams.get('offer') || searchParams.get('id')))
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const [offerModal, setOfferModal] = useState<{ prefill?: OfferPrefill; existing?: OfferRecord } | null>(() => {
    if (searchParams.get('new') !== '1') return null
    const client = Number(searchParams.get('client'))
    return { prefill: Number.isFinite(client) && client > 0 ? { clientId: client } : undefined }
  })
  const [jobModal, setJobModal] = useState<{
    clientId?: number
    lockClient?: boolean
    newClient?: {
      name?: string
      last_name?: string
      email?: string
      phone?: string
      address?: string
      zip_code?: string
      city?: string
      lat?: number | null
      lng?: number | null
    }
    onCreated: (info?: { jobId?: number; clientId?: number | null }) => Promise<void>
  } | null>(null)
  const [addLeadOpen, setAddLeadOpen] = useState(false)
  const [newLead, setNewLead] = useState({ first_name: '', last_name: '', phone: '', email: '', address: '', message: '' })
  const [confirm, setConfirm] = useState<{ title: string; body?: string; label: string; run: () => Promise<void> } | null>(null)

  // ── Data ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [l, o] = await Promise.all([api<{ leads: Lead[] }>('/leads'), api<{ offers: OfferRecord[] }>('/offers?all=1')])
      setLeads(l.leads || [])
      setOffers(o.offers || [])
      setError(null)
    } catch (e: any) {
      setError(e?.message || 'Could not load')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // New notification (lead in, offer answered) → pull fresh data.
  const newestNotification = notifications[0]?.id
  const firstNotification = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (newestNotification == null) return
    if (firstNotification.current === undefined) {
      firstNotification.current = newestNotification
      return
    }
    if (newestNotification !== firstNotification.current) {
      firstNotification.current = newestNotification
      load()
    }
  }, [newestNotification, load])

  const all = useMemo(() => buildPipeline(leads, offers), [leads, offers])
  const counts = useMemo(() => countByStage(all), [all])
  const bucketCounts = useMemo(() => {
    const c: Record<Bucket, number> = { needs: 0, waiting: 0, done: 0, archived: 0 }
    for (const it of all) if (!stage || it.stage === stage) c[it.bucket]++
    return c
  }, [all, stage])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter(it => {
      if (stage && it.stage !== stage) return false
      if (view === 'active' && it.bucket !== 'needs' && it.bucket !== 'waiting') return false
      if (view === 'done' && it.bucket !== 'done') return false
      if (view === 'archived' && it.bucket !== 'archived') return false
      if (!q) return true
      const hay = [
        it.name,
        it.kind === 'offer' ? `#${it.offer.number} ${it.offer.title || ''}` : it.lead.message || '',
        it.kind === 'offer' ? it.offer.city || '' : it.lead.city || '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [all, stage, view, query])

  const needs = visible.filter(i => i.bucket === 'needs')
  const waiting = visible.filter(i => i.bucket === 'waiting')
  const cleanup = all.filter(i => CLEANUP.includes(i.reason) && (!stage || i.stage === stage))

  // Desktop always shows something. A selected item stays open after it moves
  // bucket, so the admin sees the result of what they just did.
  const selected = useMemo(() => all.find(i => i.key === selectedKey) || null, [all, selectedKey])
  useEffect(() => {
    if (!loaded || selected) return
    if (visible.length > 0 && window.innerWidth >= 1024) setSelectedKey(visible[0].key)
  }, [loaded, selected, visible])

  // Deep links from notifications / elsewhere — keep selection in sync when the URL changes.
  useEffect(() => {
    const lead = searchParams.get('lead')
    const offer = searchParams.get('offer')
    const id = searchParams.get('id')
    let key: string | null = null
    if (offer) key = `offer-${offer}`
    else if (lead) key = `lead-${lead}`
    else if (id && legacyKind) key = `${legacyKind}-${id}`
    if (!key) return
    setSelectedKey(key)
    setMobileOpen(true)
    setStage(null)
  }, [searchParams, legacyKind])

  // Deep link into an archived/done item → show that view.
  const deepLinked = useRef(false)
  useEffect(() => {
    if (deepLinked.current || !loaded || !selected) return
    deepLinked.current = true
    if (selected.bucket === 'done') setView('done')
    else if (selected.bucket === 'archived') setView('archived')
  }, [loaded, selected])

  const select = (it: PipelineItem) => {
    setSelectedKey(it.key)
    setMobileOpen(true)
    const [kind, id] = it.key.split('-')
    const url = new URL(window.location.href)
    url.searchParams.delete('id')
    url.searchParams.delete('lead')
    url.searchParams.delete('offer')
    url.searchParams.delete('new')
    url.searchParams.delete('client')
    url.searchParams.set(kind, id)
    window.history.replaceState(null, '', url.toString())
  }

  const showFlash = (msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash(null), 3200)
  }

  const run = async (key: string, fn: () => Promise<void>, done?: string) => {
    setBusyKey(key)
    try {
      await fn()
      await load()
      refreshNotifications()
      if (done) showFlash(done)
    } catch (e: any) {
      showFlash(e?.message || t('app.pipeline.error', 'Something went wrong'))
    } finally {
      setBusyKey(null)
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────
  const actions: PipelineActions = {
    createOfferFromLead: async lead => {
      setBusyKey(`lead-${lead.id}`)
      const addr = [lead.address, lead.zip_code, lead.city].filter(Boolean).join(', ')
      const coords = addr ? await geocodeAddress(addr) : null
      setBusyKey(null)
      setOfferModal({
        prefill: {
          leadId: lead.id,
          clientId: lead.client_id,
          clientName: [lead.first_name, lead.last_name].filter(Boolean).join(' '),
          firstName: lead.first_name,
          lastName: lead.last_name,
          email: lead.email,
          phone: lead.phone,
          address: lead.address || '',
          zip_code: lead.zip_code || '',
          city: lead.city || '',
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        },
      })
    },
    bookLeadDirectly: lead =>
      run(`lead-${lead.id}`, async () => {
        const hasAddress = String(lead.address || '').trim().length > 0
        const markWon = async (clientId?: number | null) => {
          const body: Record<string, unknown> = { status: 'won' }
          if (clientId && !lead.client_id) body.client_id = clientId
          await api(`/leads/${lead.id}`, { method: 'PUT', body: JSON.stringify(body) })
          await load()
          refreshNotifications()
          setView('done')
          showFlash(t('app.pipeline.flash.booked', 'Booked'))
        }

        // Already a client — open the job modal. Unlock client if address is
        // missing so they can add one before creating the job.
        if (lead.client_id) {
          setJobModal({
            clientId: lead.client_id,
            lockClient: hasAddress,
            onCreated: async () => markWon(lead.client_id),
          })
          return
        }

        // Has address — convert to client, then schedule.
        if (hasAddress) {
          const res = await api<{ client: { id: number } }>(`/leads/${lead.id}/convert`, { method: 'POST', body: '{}' })
          setJobModal({
            clientId: res.client.id,
            lockClient: true,
            onCreated: async () => markWon(res.client.id),
          })
          return
        }

        // No address yet — open Create Job with the lead prefilled; address is required to submit.
        setJobModal({
          newClient: {
            name: lead.first_name || lead.email || '',
            last_name: lead.last_name || '',
            email: lead.email || '',
            phone: lead.phone || '',
            address: '',
            zip_code: lead.zip_code || '',
            city: lead.city || '',
          },
          lockClient: false,
          onCreated: async info => markWon(info?.clientId),
        })
      }),
    markContacted: lead =>
      run(`lead-${lead.id}`, () => api(`/leads/${lead.id}`, { method: 'PUT', body: JSON.stringify({ status: 'contacted' }) })),
    saveLeadNote: async (lead, notes) => {
      await api(`/leads/${lead.id}`, { method: 'PUT', body: JSON.stringify({ notes }) })
      setLeads(prev => prev.map(l => (l.id === lead.id ? { ...l, notes } : l)))
    },
    archiveLead: lead =>
      run(`lead-${lead.id}`, () => api(`/leads/${lead.id}`, { method: 'PUT', body: JSON.stringify({ status: 'lost' }) }), t('app.pipeline.flash.archived', 'Archived')),
    restoreLead: lead =>
      run(`lead-${lead.id}`, () => api(`/leads/${lead.id}`, { method: 'PUT', body: JSON.stringify({ status: 'new' }) }), t('app.pipeline.flash.restored', 'Restored')),
    deleteLead: lead =>
      setConfirm({
        title: t('app.pipeline.confirmDelete', 'Delete this lead?'),
        body: t('app.pipeline.confirmDeleteBody', 'It will be removed for good.'),
        label: t('app.pipeline.action.delete', 'Delete'),
        run: async () => {
          await api(`/leads/${lead.id}`, { method: 'DELETE' })
          setSelectedKey(null)
        },
      }),
    editOffer: offer => setOfferModal({ existing: offer }),
    sendOffer: (offer, to) =>
      run(
        `offer-${offer.id}`,
        () => api(`/offers/${offer.id}/send`, { method: 'POST', body: JSON.stringify(to ? { to } : {}) }),
        t('app.pipeline.flash.sent', 'Sent'),
      ),
    extendOffer: offer =>
      run(
        `offer-${offer.id}`,
        () => api(`/offers/${offer.id}`, { method: 'PATCH', body: JSON.stringify({ valid_until: addDaysYmd(todayYmd(), 14) }) }),
        t('app.pipeline.flash.extended', 'Extended 14 days'),
      ),
    archiveOffer: offer =>
      run(`offer-${offer.id}`, () => api(`/offers/${offer.id}/archive`, { method: 'POST', body: '{}' }), t('app.pipeline.flash.archived', 'Archived')),
    restoreOffer: offer =>
      run(`offer-${offer.id}`, () => api(`/offers/${offer.id}/restore`, { method: 'POST', body: '{}' }), t('app.pipeline.flash.restored', 'Restored')),
    withdrawOffer: offer =>
      setConfirm({
        title: t('app.pipeline.confirmWithdraw', 'Withdraw this offer?'),
        body: t('app.pipeline.confirmWithdrawBody', 'The client link stops working.'),
        label: t('app.pipeline.action.withdraw', 'Withdraw offer'),
        run: () => api(`/offers/${offer.id}`, { method: 'DELETE' }),
      }),
    confirmBooking: offer =>
      run(`offer-${offer.id}`, async () => {
        const res = await api<{ emailed?: boolean }>(`/offers/${offer.id}/confirm`, { method: 'POST', body: '{}' })
        showFlash(
          res.emailed
            ? t('app.pipeline.flash.confirmedEmailed', 'Verified — confirmation sent to the client')
            : t('app.pipeline.flash.booked', 'Verified — added to the day'),
        )
      }),
    scheduleOffer: offer => {
      if (!offer.client_id) return
      setJobModal({
        clientId: offer.client_id,
        lockClient: true,
        onCreated: async info => {
          const jobId = info?.jobId
          if (!jobId) return
          await api(`/offers/${offer.id}/confirm`, { method: 'POST', body: JSON.stringify({ job_id: jobId }) })
          await load()
          refreshNotifications()
          showFlash(t('app.pipeline.flash.booked', 'Booked'))
        },
      })
    },
  }

  const createLead = async () => {
    const data = await api<{ lead: Lead }>('/leads', {
      method: 'POST',
      body: JSON.stringify({ ...newLead, status: 'new' }),
    })
    setAddLeadOpen(false)
    setNewLead({ first_name: '', last_name: '', phone: '', email: '', address: '', message: '' })
    await load()
    refreshNotifications()
    setView('active')
    setSelectedKey(`lead-${data.lead.id}`)
    setMobileOpen(true)
  }

  // ── Render helpers ─────────────────────────────────────────────────────
  const money = (n: number) => formatMoney(Number(n) || 0, countryCode)

  const reasonChip = (it: PipelineItem): { label: string; cls: string } => {
    const o = it.kind === 'offer' ? it.offer : null
    const date = o?.job_date ? formatDay(String(o.job_date).slice(0, 10), locale) : ''
    switch (it.reason) {
      case 'lead.new':
        return { label: t('app.pipeline.reason.new', 'New request'), cls: 'bg-sky-50 text-sky-700' }
      case 'lead.client':
        return { label: t('app.pipeline.reason.client', 'Client added · book job'), cls: 'bg-amber-50 text-amber-700' }
      case 'lead.stale':
        return { label: t('app.pipeline.reason.quiet', 'Gone quiet'), cls: 'bg-amber-50 text-amber-700' }
      case 'lead.contacted':
        return { label: t('app.pipeline.reason.contacted', 'Waiting for reply'), cls: 'bg-gray-100 text-gray-600' }
      case 'lead.won':
        return { label: t('app.pipeline.reason.booked', 'Booked'), cls: 'bg-[#ecfdf3] text-[#1f7a46]' }
      case 'offer.draft':
        return { label: t('app.pipeline.reason.draft', 'Draft · not sent'), cls: 'bg-gray-100 text-gray-700' }
      case 'offer.declined':
        return { label: t('app.pipeline.reason.declined', 'Declined'), cls: 'bg-rose-50 text-rose-700' }
      case 'offer.expired':
        return { label: t('app.pipeline.reason.expired', 'Expired'), cls: 'bg-amber-50 text-amber-700' }
      case 'offer.stale':
        return { label: t('app.pipeline.reason.noReply', 'No reply'), cls: 'bg-amber-50 text-amber-700' }
      case 'offer.viewed':
        return { label: fill(t('app.pipeline.reason.viewed', 'Opened {ago}'), { ago: ago(o?.viewed_at, locale) }), cls: 'bg-violet-50 text-violet-700' }
      case 'offer.sent':
        return { label: t('app.pipeline.reason.sent', 'Sent · not opened'), cls: 'bg-gray-100 text-gray-600' }
      case 'booking.confirm':
        return { label: fill(t('app.pipeline.reason.confirm', 'Accepted · {date}'), { date }), cls: 'bg-[#ecfdf3] text-[#1f7a46]' }
      case 'booking.schedule':
        return { label: t('app.pipeline.reason.schedule', 'Accepted · pick a day'), cls: 'bg-[#ecfdf3] text-[#1f7a46]' }
      case 'booking.done':
        return { label: date ? fill(t('app.pipeline.reason.bookedFor', 'Booked {date}'), { date }) : t('app.pipeline.reason.booked', 'Booked'), cls: 'bg-[#ecfdf3] text-[#1f7a46]' }
      case 'archived':
      default:
        return {
          label: o?.status === 'revoked' ? t('app.pipeline.reason.withdrawn', 'Withdrawn') : t('app.pipeline.reason.archived', 'Archived'),
          cls: 'bg-gray-100 text-gray-500',
        }
    }
  }

  const stageLabel = (s: Stage) =>
    s === 'lead'
      ? t('app.pipeline.kind.lead', 'Lead')
      : s === 'offer'
        ? t('app.pipeline.kind.offer', 'Offer')
        : t('app.pipeline.kind.booking', 'Booking')

  const subtitle = (it: PipelineItem) => {
    if (it.kind === 'offer') {
      return [it.offer.title, money(it.offer.total)].filter(Boolean).join(' · ')
    }
    const l = it.lead
    return l.message || l.meta?.answers?.find(a => a.value)?.value || [l.address, l.city].filter(Boolean).join(', ') || l.phone || ''
  }

  const renderRow = (it: PipelineItem) => {
    const active = it.key === selectedKey
    const chip = reasonChip(it)
    const Meta = STAGE_META[it.stage]
    const name = it.name || t('app.pipeline.unnamed', 'Unnamed')
    const init = name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
    return (
      <li key={it.key}>
        <button
          type="button"
          onClick={() => select(it)}
          className={`group relative flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
            active ? 'bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06),0_0_0_1px_rgba(15,23,42,0.06)]' : 'hover:bg-white/70'
          }`}
        >
          <span className="relative flex-shrink-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">{init}</span>
            <span className={`absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-[#fafaf9] ${Meta.badge}`}>
              <Meta.icon className="h-2.5 w-2.5" />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className={`truncate text-sm ${it.bucket === 'needs' ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>{name}</span>
              <span className="flex flex-shrink-0 items-center gap-2 text-[11px] text-gray-400">
                {ago(it.at, locale)}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-gray-500">
              <span className="font-medium text-gray-700">
                {stageLabel(it.stage)}
                {it.kind === 'offer' && it.offer.number ? ` #${it.offer.number}` : ''}
              </span>
              {subtitle(it) ? ` · ${subtitle(it)}` : ''}
            </span>
            <span className={`mt-1.5 inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${chip.cls}`}>
              {chip.label}
            </span>
          </span>
        </button>
      </li>
    )
  }

  const totalNeeds = counts.lead.needs + counts.offer.needs + counts.booking.needs
  const totalCount = (c: { needs: number; waiting: number }) => c.needs + c.waiting
  const stageTabs: Array<{ key: Stage | null; label: string; Icon: React.ComponentType<{ className?: string }>; needs: number; count: number }> = [
    {
      key: null,
      label: t('app.pipeline.stage.all', 'All'),
      Icon: Squares2X2Icon,
      needs: totalNeeds,
      count: totalCount(counts.lead) + totalCount(counts.offer) + totalCount(counts.booking),
    },
    { key: 'lead', label: t('app.pipeline.stage.leads', 'Leads'), Icon: STAGE_META.lead.icon, needs: counts.lead.needs, count: totalCount(counts.lead) },
    { key: 'offer', label: t('app.pipeline.stage.offers', 'Offers'), Icon: STAGE_META.offer.icon, needs: counts.offer.needs, count: totalCount(counts.offer) },
    { key: 'booking', label: t('app.pipeline.stage.bookings', 'Bookings'), Icon: STAGE_META.booking.icon, needs: counts.booking.needs, count: totalCount(counts.booking) },
  ]
  const nothingActive = loaded && needs.length === 0 && waiting.length === 0

  return (
    <AppLayout>
      <div className="-mx-4 -mb-4 -mt-1 flex h-[calc(100dvh-3.5rem)] min-h-[520px] sm:-mx-6 sm:-mb-6 sm:-mt-2 lg:-mx-[40px] lg:-mb-[15px]">
          {/* Sidebar: title, stages, list, views */}
          <div className={`flex w-full flex-col border-t border-gray-200 bg-[#fafaf9] lg:w-[400px] lg:flex-shrink-0 lg:border-r ${mobileOpen && selected ? 'hidden lg:flex' : 'flex'}`}>
            <div className="flex-shrink-0 px-4 pb-3 pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold tracking-tight text-gray-900">{t('app.pipeline.title', 'Leads & offers')}</h1>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                    {!loaded ? (
                      '\u00a0'
                    ) : totalNeeds > 0 ? (
                      fill(t('app.pipeline.headline', '{n} need you'), { n: totalNeeds })
                    ) : (
                      t('app.pipeline.headlineClear', 'All clear')
                    )}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAddLeadOpen(true)}
                    title={t('app.pipeline.addLead', 'Add lead')}
                    aria-label={t('app.pipeline.addLead', 'Add lead')}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:border-gray-300 hover:text-gray-900"
                  >
                    <UserPlusIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfferModal({})}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent-500 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-600"
                  >
                    <PlusIcon className="h-4 w-4" />
                    {t('app.pipeline.newOffer', 'New offer')}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-1 rounded-xl bg-gray-100/80 p-1">
                {stageTabs.map(s => {
                  const on = stage === s.key
                  return (
                    <button
                      key={s.key ?? 'all'}
                      type="button"
                      onClick={() => setStage(s.key)}
                      className={`relative flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[11px] font-medium transition ${
                        on ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      {s.needs > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-500" aria-hidden="true" />}
                      <s.Icon className={`h-4 w-4 ${on ? 'text-gray-900' : 'text-gray-400'}`} />
                      <span className="truncate">{s.label}</span>
                      <span className={`text-[10px] tabular-nums ${on ? 'text-gray-500' : 'text-gray-400'}`}>{loaded ? s.count : '\u00a0'}</span>
                    </button>
                  )
                })}
              </div>

              <div className="relative mt-2">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={t('app.pipeline.search', 'Search')}
                  className="w-full rounded-lg border border-transparent bg-transparent py-1.5 pl-8 pr-2 text-sm outline-none transition placeholder:text-gray-400 hover:bg-white focus:border-gray-200 focus:bg-white"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto border-t border-gray-200/70 px-2 pb-4">
              {!loaded ? (
                <div className="space-y-2 p-2">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3 rounded-xl p-2">
                      <div className="h-9 w-9 animate-pulse rounded-full bg-gray-200/70" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200/70" />
                        <div className="h-2.5 w-3/4 animate-pulse rounded bg-gray-200/50" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <p className="p-6 text-center text-sm text-rose-600">{error}</p>
              ) : view === 'active' ? (
                <>
                  {cleanup.length > 1 && (
                    <div className="mx-1 mb-2 mt-1 flex items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 bg-white/60 px-3 py-2.5">
                      <span className="text-xs text-gray-600">
                        {fill(t('app.pipeline.cleanupHint', '{n} have gone quiet'), { n: cleanup.length })}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirm({
                            title: fill(t('app.pipeline.cleanupTitle', 'Archive {n} items?'), { n: cleanup.length }),
                            body: t('app.pipeline.cleanupBody', 'Expired and declined offers, and leads with no news. You can restore them from Archived.'),
                            label: t('app.pipeline.action.archiveAll', 'Archive all'),
                            run: async () => {
                              for (const it of cleanup) {
                                if (it.kind === 'offer') await api(`/offers/${it.offer.id}/archive`, { method: 'POST', body: '{}' })
                                else await api(`/leads/${it.lead.id}`, { method: 'PUT', body: JSON.stringify({ status: 'lost' }) })
                              }
                            },
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-100"
                      >
                        <ArchiveBoxIcon className="h-3.5 w-3.5" />
                        {t('app.pipeline.action.cleanUp', 'Clean up')}
                      </button>
                    </div>
                  )}

                  {nothingActive ? (
                    <AllClear
                      stage={stage}
                      settingsHref={`${base}/settings/leads-form`}
                      onNewOffer={() => setOfferModal({})}
                      hasDone={bucketCounts.done > 0}
                      onShowDone={() => setView('done')}
                    />
                  ) : (
                    <>
                      <GroupLabel label={t('app.pipeline.needsYou', 'Needs you')} count={needs.length} strong />
                      {needs.length === 0 ? (
                        <div className="mx-1 mb-3 flex items-center gap-2 rounded-xl bg-white/70 px-3 py-3 text-xs text-gray-500">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ecfdf3]">
                            <CheckIcon className="h-3 w-3 text-[#1f7a46]" />
                          </span>
                          {t('app.pipeline.nothingNeedsYou', 'Nothing needs you right now')}
                        </div>
                      ) : (
                        <ul className="mb-3 space-y-0.5">{needs.map(renderRow)}</ul>
                      )}
                      {waiting.length > 0 && (
                        <>
                          <GroupLabel label={t('app.pipeline.waitingOnClient', 'Waiting on client')} count={waiting.length} />
                          <ul className="space-y-0.5">{waiting.map(renderRow)}</ul>
                        </>
                      )}
                    </>
                  )}
                </>
              ) : visible.length === 0 ? (
                <p className="px-6 py-16 text-center text-sm text-gray-400">
                  {view === 'done' ? t('app.pipeline.emptyDone', 'Booked work shows up here') : t('app.pipeline.emptyArchived', 'Nothing archived')}
                </p>
              ) : (
                <ul className="mt-1 space-y-0.5">{visible.map(renderRow)}</ul>
              )}
            </div>

            <div className="flex-shrink-0 border-t border-gray-200/70 px-3 py-2.5">
              <div className="grid grid-cols-3 rounded-lg bg-gray-100/80 p-0.5 text-xs font-medium">
                {(['active', 'done', 'archived'] as View[]).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={`rounded-md px-2.5 py-1.5 transition ${view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    {v === 'active'
                      ? t('app.pipeline.view.active', 'Active')
                      : v === 'done'
                        ? t('app.pipeline.view.done', 'Done')
                        : t('app.pipeline.view.archived', 'Archived')}
                    {v !== 'active' && bucketCounts[v] > 0 && <span className="ml-1 text-gray-400">{bucketCounts[v]}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Detail */}
          <div
            className={`min-w-0 flex-1 border-t border-gray-200 bg-white ${
              mobileOpen && selected ? 'fixed inset-0 z-40 flex flex-col border-t-0 pt-safe lg:static lg:z-auto lg:flex lg:border-t' : 'hidden lg:flex'
            } flex-col overflow-hidden`}
          >
            {selected ? (
              <PipelineDetail
                key={selected.key}
                item={selected}
                companySlug={companySlug}
                countryCode={countryCode}
                actions={actions}
                busy={busyKey === selected.key}
                onBack={() => setMobileOpen(false)}
              />
            ) : (
              <FlowIntro onNewOffer={() => setOfferModal({})} onAddLead={() => setAddLeadOpen(true)} />
            )}
          </div>
      </div>

      {flash && (
        <div className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {flash}
        </div>
      )}

      {offerModal && (
        <CreateOfferModal
          isOpen
          onClose={() => {
            setOfferModal(null)
            load()
            refreshNotifications()
          }}
          prefill={offerModal.prefill}
          existing={offerModal.existing || null}
          onCreated={offer => {
            setView('active')
            setSelectedKey(`offer-${offer.id}`)
            load()
          }}
        />
      )}

      {jobModal && (
        <CreateJob
          isOpen
          onClose={() => {
            setJobModal(null)
            load()
          }}
          onJobCreated={async info => {
            const cb = jobModal.onCreated
            setJobModal(null)
            try {
              await cb(info)
            } catch (e: any) {
              showFlash(e?.message || t('app.pipeline.error', 'Something went wrong'))
            }
          }}
          initialClientId={jobModal.clientId}
          initialNewClient={jobModal.newClient || null}
          lockClient={jobModal.lockClient !== false && !!jobModal.clientId}
          mode="job"
        />
      )}

      <ConfirmModal
        isOpen={!!confirm}
        title={confirm?.title || ''}
        description={confirm?.body}
        confirmLabel={confirm?.label}
        enableNotification={false}
        isSubmitting={busyKey === 'confirm'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm
          if (!c) return
          run('confirm', async () => {
            await c.run()
            setConfirm(null)
          })
        }}
      />

      <ConfirmModal
        isOpen={addLeadOpen}
        title={t('app.pipeline.addLeadTitle', 'Add a lead')}
        confirmLabel={t('app.pipeline.addLead', 'Add lead')}
        enableNotification={false}
        isSubmitting={busyKey === 'add-lead'}
        onClose={() => setAddLeadOpen(false)}
        onConfirm={() => {
          if (!newLead.first_name.trim() && !newLead.phone.trim() && !newLead.email.trim()) return
          setBusyKey('add-lead')
          createLead()
            .catch(e => showFlash(e?.message || t('app.pipeline.error', 'Something went wrong')))
            .finally(() => setBusyKey(null))
        }}
      >
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <LeadInput value={newLead.first_name} onChange={v => setNewLead(p => ({ ...p, first_name: v }))} placeholder={t('app.pipeline.field.firstName', 'First name')} autoFocus />
            <LeadInput value={newLead.last_name} onChange={v => setNewLead(p => ({ ...p, last_name: v }))} placeholder={t('app.pipeline.field.lastName', 'Last name')} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <LeadInput value={newLead.phone} onChange={v => setNewLead(p => ({ ...p, phone: v }))} placeholder={t('app.pipeline.field.phone', 'Phone')} type="tel" />
            <LeadInput value={newLead.email} onChange={v => setNewLead(p => ({ ...p, email: v }))} placeholder={t('app.pipeline.field.email', 'Email')} type="email" />
          </div>
          <LeadInput value={newLead.address} onChange={v => setNewLead(p => ({ ...p, address: v }))} placeholder={t('app.pipeline.field.address', 'Address')} />
          <textarea
            value={newLead.message}
            onChange={e => setNewLead(p => ({ ...p, message: e.target.value }))}
            rows={3}
            placeholder={t('app.pipeline.field.message', 'What do they need?')}
            className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-gray-400"
          />
        </div>
      </ConfirmModal>
    </AppLayout>
  )
}

function LeadInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: string
  autoFocus?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      autoFocus={autoFocus}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-gray-400"
    />
  )
}

function GroupLabel({ label, count }: { label: string; count: number; strong?: boolean }) {
  return (
    <p className="flex items-center gap-1.5 px-3 pb-1.5 pt-3 text-[10.5px] font-bold uppercase tracking-wider text-gray-500">
      {label}
      <span className="font-semibold text-gray-400">{count}</span>
    </p>
  )
}

/** Empty detail pane: the three steps this page moves work through. */
function FlowIntro({ onNewOffer, onAddLead }: { onNewOffer: () => void; onAddLead: () => void }) {
  const { t } = useAppI18n()
  const steps: Array<{ Icon: React.ComponentType<{ className?: string }>; badge: string; title: string; body: string }> = [
    {
      Icon: STAGE_META.lead.icon,
      badge: STAGE_META.lead.badge,
      title: t('app.pipeline.intro.leadTitle', 'Leads'),
      body: t('app.pipeline.intro.leadBody', 'Requests from your form, or people you add'),
    },
    {
      Icon: STAGE_META.offer.icon,
      badge: STAGE_META.offer.badge,
      title: t('app.pipeline.intro.offerTitle', 'Offers'),
      body: t('app.pipeline.intro.offerBody', 'Priced visits with days the client can pick'),
    },
    {
      Icon: STAGE_META.booking.icon,
      badge: STAGE_META.booking.badge,
      title: t('app.pipeline.intro.bookingTitle', 'Bookings'),
      body: t('app.pipeline.intro.bookingBody', 'Accepted offers waiting for you to verify'),
    },
  ]
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <div className="w-full max-w-lg">
        <ol className="flex items-stretch gap-2">
          {steps.map((s, i) => (
            <li key={s.title} className="flex flex-1 items-center gap-2">
              <div className="flex-1 rounded-2xl border border-gray-200 bg-white p-4">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full ${s.badge}`}>
                  <s.Icon className="h-4 w-4" />
                </span>
                <p className="mt-3 text-sm font-semibold text-gray-900">{s.title}</p>
                <p className="mt-0.5 text-xs leading-snug text-gray-500">{s.body}</p>
              </div>
              {i < steps.length - 1 && <ArrowRightIcon className="h-4 w-4 flex-shrink-0 text-gray-300" />}
            </li>
          ))}
        </ol>
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onAddLead}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <UserPlusIcon className="h-4 w-4 text-gray-400" />
            {t('app.pipeline.addLead', 'Add lead')}
          </button>
          <button
            type="button"
            onClick={onNewOffer}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-accent-600"
          >
            <PlusIcon className="h-4 w-4" />
            {t('app.pipeline.newOffer', 'New offer')}
          </button>
        </div>
      </div>
    </div>
  )
}

function AllClear({
  stage,
  settingsHref,
  onNewOffer,
  hasDone,
  onShowDone,
}: {
  stage: Stage | null
  settingsHref: string
  onNewOffer: () => void
  hasDone: boolean
  onShowDone: () => void
}) {
  const { t } = useAppI18n()
  const isLeads = stage === 'lead'
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="relative mb-5 flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-[#ecfdf3]" />
        <span className="absolute inset-2 rounded-full bg-[#d6f5e3]" />
        <CheckIcon className="relative h-7 w-7 text-[#1f7a46]" />
      </div>
      <p className="text-base font-semibold text-gray-900">{t('app.pipeline.allClear', "You're all caught up")}</p>
      {isLeads ? (
        <>
          <p className="mt-1 text-sm text-gray-500">{t('app.pipeline.noNewLeads', 'No new leads')}</p>
          <Link
            href={settingsHref}
            className="mt-5 text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline"
          >
            {t('app.pipeline.changeLeadForm', 'Change lead form')}
          </Link>
        </>
      ) : (
        <div className="mt-5 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onNewOffer}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <PlusIcon className="h-4 w-4" />
            {t('app.pipeline.newOffer', 'New offer')}
          </button>
          {hasDone && (
            <button type="button" onClick={onShowDone} className="px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-900">
              {t('app.pipeline.seeDone', 'See what got booked')} →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
