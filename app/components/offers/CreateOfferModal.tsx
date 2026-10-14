'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'next/navigation'
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  ChatBubbleLeftEllipsisIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  MapPinIcon,
  MinusIcon,
  PlusIcon,
  ShareIcon,
  SparklesIcon,
  UserIcon,
  XMarkIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'
import { apiUrl } from '@/app/utils/api'
import { formatMoney, getCountryRule } from '@/app/config/countryRules'
import { useCompanyCountryCode } from '@/app/hooks/useCompanyCountryCode'
import { useAppI18n } from '@/app/components/I18nProvider'
import ConfirmModal from '@/app/components/ConfirmModal'
import DashedPickerTrigger from '@/app/components/DashedPickerTrigger'
import AddClientInlineForm, { initialNewClientData, type NewClientData } from '@/app/components/AddClientInlineForm'
import { fetchNearestRoutes, type NearestRouteRow } from '@/app/components/map/useMapData'
import {
  addDaysYmd,
  daysBetween,
  formatDay,
  offerPublicHref,
  parseOfferList,
  parseYmd,
  todayYmd,
  weekRange,
  type OfferDate,
  type OfferItem,
  type OfferPrefill,
  type OfferRecord,
} from '@/app/lib/offers'

type ClientRow = {
  id: number
  name: string | null
  last_name?: string | null
  client_type?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  zip_code?: string | null
  city?: string | null
  lat?: number | null
  lng?: number | null
}

type ServiceRow = {
  id: number
  title: string
  price?: number | string | null
  duration_minutes?: number | null
  group_name?: string | null
  group_meta_fields?: string[] | null
  default_quantity?: number | string | null
}

type Line = {
  key: string
  service_id: number | null
  title: string
  unit_price: string
  quantity: number
  duration_minutes: number | null
}

type RangeMode = 'this' | 'next' | 'custom'
type SortMode = 'fit' | 'date'

type Props = {
  isOpen: boolean
  onClose: () => void
  prefill?: OfferPrefill
  lockClient?: boolean
  onCreated?: (offer: OfferRecord) => void
  /** Edit an existing (not accepted) offer instead of creating one. */
  existing?: OfferRecord | null
}

const MAX_DAYS = 4
const DROPDOWN_MAX = 260
const DROPDOWN_GAP = 8

function authHeaders(json = false): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const h: Record<string, string> = {}
  if (token) h.Authorization = `Bearer ${token}`
  if (json) h['Content-Type'] = 'application/json'
  return h
}

function clientName(c: Pick<ClientRow, 'name' | 'last_name' | 'client_type'>): string {
  if (c.client_type === 'company') return String(c.name || '').trim()
  return `${c.name || ''}${c.last_name ? ` ${c.last_name}` : ''}`.trim()
}

function placement(rect: DOMRect) {
  const vv = window.visualViewport
  const top = vv?.offsetTop ?? 0
  const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight
  const below = bottom - rect.bottom - DROPDOWN_GAP
  const above = rect.top - top - DROPDOWN_GAP
  if (below >= 140 || below >= above) {
    return { top: rect.bottom + DROPDOWN_GAP, left: rect.left, width: rect.width, maxHeight: Math.max(140, Math.min(DROPDOWN_MAX, below)) }
  }
  const h = Math.max(140, Math.min(DROPDOWN_MAX, above))
  return { top: Math.max(top + DROPDOWN_GAP, rect.top - DROPDOWN_GAP - h), left: rect.left, width: rect.width, maxHeight: h }
}

function useAnchorRect(open: boolean, ref: RefObject<HTMLElement | null>) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!open || !el) { setRect(null); return }
    const update = () => setRect(el.getBoundingClientRect())
    update()
    const vv = window.visualViewport
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
    }
  }, [open, ref])
  return rect
}

function useOutside(open: boolean, refs: RefObject<HTMLElement | null>[], onOutside: () => void) {
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (refs.some(r => r.current?.contains(t))) return
      onOutside()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open, refs, onOutside])
}

function fitTone(mins: number | null | undefined) {
  if (mins == null) return 'bg-gray-100 text-gray-500'
  if (mins <= 10) return 'bg-[#ecfdf3] text-[#1f7a46]'
  if (mins <= 25) return 'bg-[#d6f5e3] text-[#1f7a46]'
  if (mins <= 45) return 'bg-amber-50 text-amber-800'
  return 'bg-gray-100 text-gray-600'
}

function fitLabel(mins: number | null | undefined, onRoute: string) {
  if (mins == null) return ''
  const n = Math.round(mins)
  return n <= 0 ? onRoute : `+${n} min`
}

let lineSeq = 0
const nextKey = () => `l${++lineSeq}`

export default function CreateOfferModal(props: Props) {
  if (!props.isOpen || typeof document === 'undefined') return null
  return createPortal(<OfferModalInner {...props} />, document.body)
}

function OfferModalInner({ onClose, prefill, lockClient = false, onCreated, existing }: Props) {
  const { t, locale } = useAppI18n()
  const params = useParams()
  const companySlug = typeof params?.company === 'string'
    ? params.company
    : (typeof window !== 'undefined' ? window.location.pathname.split('/')[1] || '' : '')
  const countryCode = useCompanyCountryCode()
  const rule = getCountryRule(countryCode)
  const money = (n: number) => formatMoney(n, countryCode)
  const dayLocale = locale === 'da' ? 'da' : 'en'
  const today = todayYmd()
  const isEdit = !!existing

  // ── Recipient ──
  const [clients, setClients] = useState<ClientRow[]>([])
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(() => {
    if (existing) {
      return {
        id: existing.client_id || -1,
        name: existing.client_id ? (existing.client_name ?? existing.contact_name) : existing.contact_name,
        last_name: existing.client_id ? existing.client_last_name : null,
        email: existing.contact_email || existing.client_email,
        phone: existing.contact_phone || existing.client_phone,
        address: existing.address,
        zip_code: existing.zip_code,
        city: existing.city,
        lat: existing.lat ?? null,
        lng: existing.lng ?? null,
      }
    }
    if (prefill?.clientId) {
      return {
        id: prefill.clientId,
        name: prefill.clientName || '',
        email: prefill.email,
        phone: prefill.phone,
        address: prefill.address,
        zip_code: prefill.zip_code,
        city: prefill.city,
        lat: prefill.lat ?? null,
        lng: prefill.lng ?? null,
      }
    }
    return null
  })
  const [isAddingClient, setIsAddingClient] = useState(
    () => !existing && !prefill?.clientId && (!!prefill?.address || !!prefill?.firstName || !!prefill?.leadId),
  )
  const [newClient, setNewClient] = useState<NewClientData>(() => ({
    ...initialNewClientData,
    name: prefill?.clientId ? '' : prefill?.firstName || '',
    last_name: prefill?.clientId ? '' : prefill?.lastName || '',
    email: prefill?.clientId ? '' : prefill?.email || '',
    phone: prefill?.clientId ? '' : prefill?.phone || '',
    address: prefill?.address || '',
    zip_code: prefill?.zip_code || '',
    city: prefill?.city || '',
    lat: prefill?.lat ?? null,
    lng: prefill?.lng ?? null,
  }))
  const [clientSearch, setClientSearch] = useState('')
  const [clientOpen, setClientOpen] = useState(false)
  const clientTriggerRef = useRef<HTMLDivElement>(null)
  const clientDropRef = useRef<HTMLDivElement>(null)
  const clientInputRef = useRef<HTMLInputElement>(null)
  const clientRect = useAnchorRect(clientOpen, clientTriggerRef)

  // ── Items ──
  const [services, setServices] = useState<ServiceRow[]>([])
  const [lines, setLines] = useState<Line[]>(() =>
    parseOfferList<OfferItem>(existing?.items).map(it => ({
      key: nextKey(),
      service_id: it.service_id ?? null,
      title: it.title,
      unit_price: String(it.unit_price ?? ''),
      quantity: Number(it.quantity) || 1,
      duration_minutes: it.duration_minutes ?? null,
    })),
  )
  const [serviceSearch, setServiceSearch] = useState('')
  const [serviceOpen, setServiceOpen] = useState(false)
  const serviceTriggerRef = useRef<HTMLDivElement>(null)
  const serviceDropRef = useRef<HTMLDivElement>(null)
  const serviceInputRef = useRef<HTMLInputElement>(null)
  const serviceRect = useAnchorRect(serviceOpen, serviceTriggerRef)
  const [taxOn, setTaxOn] = useState(() =>
    existing ? Number(existing.tax_rate) > 0 : rule.defaultTaxRate > 0,
  )
  const taxRate = taxOn ? (existing && Number(existing.tax_rate) > 0 ? Number(existing.tax_rate) : rule.defaultTaxRate) : 0

  // ── Days ──
  const [dates, setDates] = useState<OfferDate[]>(() => parseOfferList<OfferDate>(existing?.proposed_dates))
  const [slide, setSlide] = useState<'details' | 'days'>('details')
  const [rangeMode, setRangeMode] = useState<RangeMode>(() =>
    daysBetween(today, weekRange(today).to).length < 3 ? 'next' : 'this',
  )
  const [customFrom, setCustomFrom] = useState(today)
  const [customTo, setCustomTo] = useState(addDaysYmd(today, 13))
  const [sortMode, setSortMode] = useState<SortMode>('fit')
  const [routes, setRoutes] = useState<NearestRouteRow[] | null>(null)
  const [routesLoading, setRoutesLoading] = useState(false)

  // ── Extras / submit ──
  const [title, setTitle] = useState(existing?.title || '')
  const [message, setMessage] = useState(existing?.message || '')
  const [validUntil, setValidUntil] = useState<string | null>(
    existing
      ? (existing.valid_until ? String(existing.valid_until).slice(0, 10) : null)
      : addDaysYmd(today, 14),
  )
  const [draftValid, setDraftValid] = useState<string | null>(validUntil)
  const [showValid, setShowValid] = useState(false)
  const [busy, setBusy] = useState<'draft' | 'send' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ offer: OfferRecord; action: 'draft' | 'send'; emailed: string | null; emailError: string | null } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(apiUrl('/clients'), { headers: authHeaders() }).then(r => r.json()).catch(() => ({})),
      fetch(apiUrl('/services'), { headers: authHeaders() }).then(r => r.json()).catch(() => ({})),
    ]).then(([c, s]) => {
      const list: ClientRow[] = Array.isArray(c?.clients) ? c.clients : Array.isArray(c) ? c : []
      setClients(list)
      setServices(Array.isArray(s?.services) ? s.services : [])
      setSelectedClient(prev => {
        if (!prev || prev.id <= 0) return prev
        const full = list.find(x => x.id === prev.id)
        if (!full) return prev
        return {
          ...full,
          email: prev.email || full.email,
          phone: prev.phone || full.phone,
          address: prev.address || full.address,
          zip_code: prev.zip_code || full.zip_code,
          city: prev.city || full.city,
          lat: prev.lat ?? full.lat ?? null,
          lng: prev.lng ?? full.lng ?? null,
        }
      })
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (clientOpen) setClientOpen(false)
      else if (serviceOpen) setServiceOpen(false)
      else if (slide === 'days') setSlide('details')
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [clientOpen, serviceOpen, slide, onClose])

  const clientRefs = useMemo(() => [clientTriggerRef, clientDropRef], [])
  const serviceRefs = useMemo(() => [serviceTriggerRef, serviceDropRef], [])
  const closeClient = useMemo(() => () => { setClientOpen(false); setClientSearch('') }, [])
  const closeService = useMemo(() => () => { setServiceOpen(false); setServiceSearch('') }, [])
  useOutside(clientOpen, clientRefs, closeClient)
  useOutside(serviceOpen, serviceRefs, closeService)

  // ── Derived ──
  const recipient = useMemo(() => {
    if (selectedClient) {
      return {
        client_id: selectedClient.id > 0 ? selectedClient.id : null,
        name: clientName(selectedClient),
        email: selectedClient.email || '',
        phone: selectedClient.phone || '',
        address: selectedClient.address || '',
        zip_code: selectedClient.zip_code || '',
        city: selectedClient.city || '',
        lat: selectedClient.lat ?? null,
        lng: selectedClient.lng ?? null,
      }
    }
    if (isAddingClient && newClient.name.trim()) {
      return {
        client_id: null,
        name: clientName(newClient),
        email: newClient.email,
        phone: newClient.phone,
        address: newClient.address,
        zip_code: newClient.zip_code,
        city: newClient.city,
        lat: newClient.lat ?? null,
        lng: newClient.lng ?? null,
      }
    }
    return null
  }, [selectedClient, isAddingClient, newClient])

  const coords = useMemo(() => {
    const lat = recipient?.lat ?? (isAddingClient ? newClient.lat : null) ?? prefill?.lat ?? null
    const lng = recipient?.lng ?? (isAddingClient ? newClient.lng : null) ?? prefill?.lng ?? null
    return lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
      ? { lat: Number(lat), lng: Number(lng) }
      : null
  }, [recipient, isAddingClient, newClient.lat, newClient.lng, prefill?.lat, prefill?.lng])

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + (parseFloat(l.unit_price) || 0) * (l.quantity || 0), 0)
    const tax = Math.round(subtotal * taxRate) / 100
    const minutes = lines.reduce((s, l) => s + (l.duration_minutes || 0) * (l.quantity || 0), 0)
    return { subtotal, tax, total: subtotal + tax, minutes }
  }, [lines, taxRate])

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    const base = q
      ? clients.filter(c => `${clientName(c)} ${c.address || ''} ${c.city || ''} ${c.email || ''} ${c.phone || ''}`.toLowerCase().includes(q))
      : clients
    return base.slice(0, 30)
  }, [clients, clientSearch])

  const filteredServices = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase()
    return services.filter(s => !lines.some(l => l.service_id === s.id) && (!q || s.title.toLowerCase().includes(q)))
  }, [services, lines, serviceSearch])

  const range = useMemo(() => {
    if (rangeMode === 'this') {
      const w = weekRange(today)
      return { from: w.from < today ? today : w.from, to: w.to }
    }
    if (rangeMode === 'next') return weekRange(today, 1)
    const from = customFrom && customFrom >= today ? customFrom : today
    let to = customTo && customTo >= from ? customTo : from
    if (daysBetween(from, to).length > 31) to = addDaysYmd(from, 30)
    return { from, to }
  }, [rangeMode, today, customFrom, customTo])

  useEffect(() => {
    if (slide !== 'days' || !coords) return
    let alive = true
    setRoutesLoading(true)
    fetchNearestRoutes({ lat: coords.lat, lng: coords.lng, from: range.from, to: range.to, radius: 40, sort: 'closest' })
      .then(rows => { if (alive) setRoutes(rows) })
      .catch(() => { if (alive) setRoutes([]) })
      .finally(() => { if (alive) setRoutesLoading(false) })
    return () => { alive = false }
  }, [slide, coords, range.from, range.to])

  const dayRows = useMemo(() => {
    const best = new Map<string, NearestRouteRow>()
    for (const r of routes || []) {
      const key = String(r.date).slice(0, 10)
      const cur = best.get(key)
      const rm = r.added_minutes ?? Infinity
      const cm = cur?.added_minutes ?? Infinity
      if (!cur || rm < cm) best.set(key, r)
    }
    const rows = daysBetween(range.from, range.to).map(date => ({ date, route: coords ? best.get(date) || null : null }))
    if (sortMode === 'fit' && coords) {
      return [...rows].sort((a, b) => {
        const am = a.route?.added_minutes ?? (a.route ? 999 : Infinity)
        const bm = b.route?.added_minutes ?? (b.route ? 999 : Infinity)
        return am === bm ? a.date.localeCompare(b.date) : am - bm
      })
    }
    return rows
  }, [routes, range.from, range.to, sortMode, coords])

  const bestDates = useMemo(() => {
    const withRoute = dayRows.filter(r => r.route && r.route.added_minutes != null)
    return [...withRoute]
      .sort((a, b) => (a.route!.added_minutes! - b.route!.added_minutes!) || a.date.localeCompare(b.date))
      .slice(0, 3)
  }, [dayRows])

  // ── Actions ──
  const pickClient = (c: ClientRow) => {
    setSelectedClient(c)
    setClientOpen(false)
    setClientSearch('')
  }

  const openClientPicker = () => {
    setClientOpen(true)
    requestAnimationFrame(() => clientInputRef.current?.focus())
  }

  const openServicePicker = () => {
    setServiceOpen(true)
    requestAnimationFrame(() => serviceInputRef.current?.focus())
  }

  const addService = (s: ServiceRow) => {
    const meta = Array.isArray(s.group_meta_fields) ? s.group_meta_fields : []
    const hasQuantity = meta.includes('quantity')
    const qty = hasQuantity
      ? (Number(s.default_quantity) > 0 ? Number(s.default_quantity) : 1)
      : 1
    setLines(prev => [...prev, {
      key: nextKey(),
      service_id: s.id,
      title: s.title,
      unit_price: s.price != null ? String(Number(s.price)) : '',
      quantity: qty,
      duration_minutes: s.duration_minutes ?? null,
    }])
    setServiceSearch('')
    setServiceOpen(false)
  }

  const addCustomLine = (title = '') => {
    setLines(prev => [...prev, { key: nextKey(), service_id: null, title, unit_price: '', quantity: 1, duration_minutes: null }])
    setServiceSearch('')
    setServiceOpen(false)
  }

  const updateLine = (key: string, patch: Partial<Line>) => {
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)))
  }

  const toggleDate = (date: string, route: NearestRouteRow | null) => {
    setDates(prev => {
      if (prev.some(d => d.date === date)) return prev.filter(d => d.date !== date)
      if (prev.length >= MAX_DAYS) return prev
      const row: OfferDate = {
        date,
        user_id: route?.user_id ?? null,
        user_name: route?.user_name ?? null,
        extra_minutes: route?.added_minutes ?? null,
      }
      return [...prev, row].sort((a, b) => a.date.localeCompare(b.date))
    })
  }

  const pickBest = () => {
    setDates(
      bestDates
        .map(r => ({ date: r.date, user_id: r.route!.user_id, user_name: r.route!.user_name, extra_minutes: r.route!.added_minutes }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    )
  }

  const canSubmit = !!recipient && lines.length > 0 && lines.every(l => l.title.trim()) && !busy

  const submit = async (action: 'draft' | 'send') => {
    if (!recipient || !canSubmit) return
    setBusy(action)
    setError(null)
    const email = recipient.email.trim()
    const payload: Record<string, unknown> = {
      client_id: recipient.client_id,
      contact_name: recipient.name,
      contact_email: email || null,
      contact_phone: recipient.phone.trim() || null,
      address: recipient.address || null,
      zip_code: recipient.zip_code || null,
      city: recipient.city || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      items: lines.map(l => ({
        service_id: l.service_id,
        title: l.title.trim(),
        unit_price: parseFloat(l.unit_price) || 0,
        quantity: l.quantity || 1,
        duration_minutes: l.duration_minutes,
      })),
      proposed_dates: dates,
      title: title.trim() || undefined,
      message: message.trim() || null,
      valid_until: validUntil,
      tax_rate: taxRate,
    }
    if (!isEdit && prefill?.leadId) payload.lead_id = prefill.leadId
    if (action === 'send' && !email) payload.status = 'sent'
    else if (!isEdit) payload.status = 'draft'

    try {
      const res = await fetch(apiUrl(isEdit ? `/offers/${existing!.id}` : '/offers'), {
        method: isEdit ? 'PATCH' : 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.offer) throw new Error(data?.error || 'Could not save the offer')
      let offer: OfferRecord = data.offer
      let emailed: string | null = null
      let emailError: string | null = null
      if (action === 'send' && email) {
        const sendRes = await fetch(apiUrl(`/offers/${offer.id}/send`), {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify({ to: email }),
        })
        const sendData = await sendRes.json().catch(() => ({}))
        if (sendRes.ok && sendData?.offer) {
          offer = sendData.offer
          emailed = sendData.emailed || email
        } else {
          emailError = sendData?.error || 'Email could not be sent'
        }
      }
      setDone({ offer, action, emailed, emailError })
      onCreated?.(offer)
    } catch (e: any) {
      setError(e?.message || 'Could not save the offer')
    } finally {
      setBusy(null)
    }
  }

  const link = done ? offerPublicHref(done.offer) : ''
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked */ }
  }
  const shareLink = async () => {
    if (!done) return
    try {
      await navigator.share({ title: `${t('app.offers.offer', 'Offer')} #${done.offer.number}`, url: link })
    } catch { /* dismissed */ }
  }
  const canShare = typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function'

  const onDaysSlide = slide === 'days' && !done
  const onRouteLabel = t('app.offers.onRoute', 'On route')
  const isForever = validUntil == null
  const validDays = isForever
    ? null
    : Math.round((parseYmd(validUntil).getTime() - parseYmd(today).getTime()) / 86400000)

  // ── Render ──
  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fadeIn sm:items-center sm:p-4" onClick={onClose}>
        <div
          className="flex h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl animate-sheet-in-bottom pb-safe sm:h-auto sm:max-h-[96vh] sm:min-h-[720px] sm:rounded-3xl sm:animate-slideDown"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 bg-white p-5 sm:p-6">
            <div className="flex min-w-0 items-start gap-3">
              {onDaysSlide && (
                <button
                  type="button"
                  onClick={() => setSlide('details')}
                  className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow-md"
                  aria-label={t('app.createJob.back', 'Back')}
                >
                  <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
                </button>
              )}
              <div className="min-w-0 space-y-0.5">
                <h2 className="truncate text-2xl font-bold tracking-tight text-primary-800">
                  {done
                    ? `${t('app.offers.offer', 'Offer')} #${done.offer.number}`
                    : onDaysSlide
                      ? t('app.offers.suggestDays', 'Suggest days')
                      : isEdit
                        ? `${t('app.offers.editOffer', 'Edit offer')} #${existing!.number}`
                        : t('app.offers.newOffer', 'New offer')}
                </h2>
                <p className="text-sm font-medium text-gray-500">
                  {done
                    ? recipient?.name
                    : onDaysSlide
                      ? t('app.offers.suggestDaysSub', 'The client picks the one that suits them')
                      : t('app.offers.newOfferSub', 'Quote a price and send a link')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="group flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow-md"
              aria-label="Close"
            >
              <XMarkIcon className="h-5 w-5 text-gray-500 group-hover:text-gray-700" />
            </button>
          </div>

          {done ? (
            <DoneView
              done={done}
              link={link}
              copied={copied}
              canShare={canShare}
              phone={recipient?.phone || ''}
              companySlug={companySlug}
              total={money(Number(done.offer.total) || totals.total)}
              onCopy={copyLink}
              onShare={shareLink}
              onClose={onClose}
              t={t}
            />
          ) : (
            <>
              <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
                <div
                  className="absolute inset-0 flex transition-transform duration-300 ease-out will-change-transform"
                  style={{ width: '200%', transform: onDaysSlide ? 'translateX(-50%)' : 'translateX(0)' }}
                >
                  {/* ── Slide 1: details ── */}
                  <div className="flex h-full min-h-0 w-1/2 flex-col overflow-hidden">
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-4 sm:px-6 sm:pt-5">
                      {/* Title + note — ghost writing area */}
                      <div className="mb-4 space-y-0.5">
                        <input
                          type="text"
                          value={title}
                          onChange={e => setTitle(e.target.value)}
                          placeholder={t('app.offers.titlePlaceholder', 'Title')}
                          className="w-full border-0 bg-transparent p-0 text-[15px] font-semibold leading-snug text-gray-900 placeholder:font-medium placeholder:text-gray-400 focus:outline-none focus:ring-0"
                        />
                        <textarea
                          value={message}
                          onChange={e => setMessage(e.target.value)}
                          rows={message ? Math.min(3, Math.max(1, message.split('\n').length)) : 1}
                          placeholder={t('app.offers.descriptionPlaceholder', 'Add a short note…')}
                          className="w-full resize-none border-0 bg-transparent p-0 text-sm leading-relaxed text-gray-600 placeholder:text-gray-400 focus:outline-none focus:ring-0"
                        />
                      </div>

                      {/* Client */}
                      <div className="space-y-4 pb-2">
                        {selectedClient ? (
                          <div className="flex items-center gap-3 rounded-xl border border-gray-200/80 bg-white p-3.5">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-50">
                              <UserIcon className="h-5 w-5 text-gray-500" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-gray-900">{clientName(selectedClient) || '—'}</div>
                              <div className="mt-0.5 truncate text-xs text-gray-500">
                                {[selectedClient.address && [selectedClient.address, selectedClient.city].filter(Boolean).join(', '), selectedClient.email].filter(Boolean).join(' · ') || t('app.offers.noContact', 'No address or email')}
                              </div>
                            </div>
                            {!lockClient && (
                              <button
                                type="button"
                                onClick={() => setSelectedClient(null)}
                                className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                aria-label="Change client"
                              >
                                <XMarkIcon className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ) : isAddingClient ? (
                          <AddClientInlineForm
                            data={newClient}
                            onChange={setNewClient}
                            countryCode={countryCode}
                            onSave={() => {
                              if (!newClient.name.trim()) return
                              setSelectedClient({ id: -1, ...newClient })
                              setIsAddingClient(false)
                            }}
                            onCancel={() => {
                              setIsAddingClient(false)
                              setNewClient({ ...initialNewClientData })
                            }}
                            saveLabel={t('app.createJob.saveSelectClient', 'Continue')}
                          />
                        ) : (
                          <>
                            <div ref={clientTriggerRef} className="relative">
                              {clientOpen ? (
                                <input
                                  ref={clientInputRef}
                                  type="text"
                                  value={clientSearch}
                                  onChange={e => setClientSearch(e.target.value)}
                                  placeholder={t('app.createJob.searchClient', 'Search for a client...')}
                                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-sm shadow-sm hover:border-gray-300 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                                />
                              ) : (
                                <DashedPickerTrigger onClick={openClientPicker}>
                                  {t('app.createJob.selectAClient', 'Select a client')}
                                </DashedPickerTrigger>
                              )}
                            </div>
                            {clientOpen && clientRect && createPortal(
                              <div
                                ref={clientDropRef}
                                className="overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl"
                                style={{ position: 'fixed', zIndex: 9999, ...placement(clientRect) }}
                              >
                                {filteredClients.map(c => (
                                  <button key={c.id} type="button" onClick={() => pickClient(c)} className="w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-accent-50/50">
                                    <div className="text-sm font-medium text-gray-900">{clientName(c)}</div>
                                    <div className="text-xs text-gray-500">{c.address ? `${c.address}${c.city ? `, ${c.city}` : ''}` : c.email || '—'}</div>
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const q = clientSearch.trim()
                                    setNewClient(prev => ({ ...prev, name: q && !/\d{3,}/.test(q) ? q : prev.name }))
                                    setIsAddingClient(true)
                                    setClientOpen(false)
                                    setClientSearch('')
                                  }}
                                  className="sticky bottom-0 flex w-full items-center gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-accent-600 hover:bg-accent-50"
                                >
                                  <PlusIcon className="h-4 w-4" /> {t('app.offers.newClient', 'New client')}
                                </button>
                              </div>,
                              document.body,
                            )}
                          </>
                        )}
                      </div>

                      {/* Items */}
                      <div className="space-y-3 border-t border-gray-100/60 pt-4">
                        {lines.map(line => {
                          const lineTotal = (parseFloat(line.unit_price) || 0) * (line.quantity || 0)
                          return (
                            <div key={line.key} className="rounded-xl border border-gray-200 bg-white p-3.5">
                              <div className="flex items-start gap-2">
                                {line.service_id ? (
                                  <p className="min-w-0 flex-1 truncate pt-1 text-sm font-semibold text-primary-800">{line.title}</p>
                                ) : (
                                  <input
                                    value={line.title}
                                    onChange={e => updateLine(line.key, { title: e.target.value })}
                                    placeholder={t('app.offers.lineTitle', 'What are you offering?')}
                                    autoFocus={!line.title}
                                    className="min-w-0 flex-1 rounded-lg border-0 bg-transparent px-0 py-1 text-sm font-semibold text-primary-800 placeholder:font-medium placeholder:text-gray-400 focus:ring-0"
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => setLines(prev => prev.filter(l => l.key !== line.key))}
                                  className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                  aria-label="Remove"
                                >
                                  <XMarkIcon className="h-4 w-4" />
                                </button>
                              </div>
                              <div className="mt-2.5 flex items-center gap-2">
                                <div className="flex items-center rounded-lg border border-gray-200 bg-white">
                                  <button
                                    type="button"
                                    onClick={() => updateLine(line.key, { quantity: Math.max(1, (line.quantity || 1) - 1) })}
                                    className="flex h-8 w-8 items-center justify-center text-gray-500 hover:text-gray-800 disabled:opacity-30"
                                    disabled={line.quantity <= 1}
                                    aria-label="Less"
                                  >
                                    <MinusIcon className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="w-6 text-center text-sm font-semibold tabular-nums text-gray-900">{line.quantity}</span>
                                  <button
                                    type="button"
                                    onClick={() => updateLine(line.key, { quantity: (line.quantity || 1) + 1 })}
                                    className="flex h-8 w-8 items-center justify-center text-gray-500 hover:text-gray-800"
                                    aria-label="More"
                                  >
                                    <PlusIcon className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <span className="text-xs text-gray-400">×</span>
                                <div className="relative">
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    step="any"
                                    value={line.unit_price}
                                    onChange={e => updateLine(line.key, { unit_price: e.target.value })}
                                    placeholder="0"
                                    className="h-8 w-28 rounded-lg border border-gray-200 bg-white pl-2.5 pr-11 text-sm tabular-nums focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                                  />
                                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-gray-400">{rule.defaultCurrency}</span>
                                </div>
                                <span className="ml-auto text-sm font-bold tabular-nums text-primary-800">{money(lineTotal)}</span>
                              </div>
                            </div>
                          )
                        })}

                        <div ref={serviceTriggerRef} className="relative">
                          {serviceOpen ? (
                            <input
                              ref={serviceInputRef}
                              type="text"
                              value={serviceSearch}
                              onChange={e => setServiceSearch(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && serviceSearch.trim()) {
                                  e.preventDefault()
                                  if (filteredServices[0]) addService(filteredServices[0])
                                  else addCustomLine(serviceSearch.trim())
                                }
                              }}
                              placeholder={t('app.createJob.searchServices', 'Search for services...')}
                              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-sm shadow-sm hover:border-gray-300 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                            />
                          ) : (
                            <DashedPickerTrigger onClick={openServicePicker} size={lines.length > 0 ? 'md' : 'lg'}>
                              {lines.length > 0 ? t('app.offers.addMore', 'Add more') : t('app.createJob.addServices', 'Add services')}
                            </DashedPickerTrigger>
                          )}
                        </div>
                        {serviceOpen && serviceRect && createPortal(
                          <div
                            ref={serviceDropRef}
                            className="overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl"
                            style={{ position: 'fixed', zIndex: 9999, ...placement(serviceRect) }}
                          >
                            {filteredServices.map(s => (
                              <button key={s.id} type="button" onClick={() => addService(s)} className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-accent-50/50">
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-primary-800">{s.title}</span>
                                  {(s.group_name || Number(s.duration_minutes) > 0) && (
                                    <span className="block truncate text-xs text-gray-500">
                                      {[s.group_name, Number(s.duration_minutes) > 0 ? `${s.duration_minutes} min` : null].filter(Boolean).join(' · ')}
                                    </span>
                                  )}
                                </span>
                                <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-gray-700">{money(Number(s.price) || 0)}</span>
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => addCustomLine(serviceSearch.trim())}
                              className="sticky bottom-0 flex w-full items-center gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-semibold text-accent-600 hover:bg-accent-50"
                            >
                              <PlusIcon className="h-4 w-4" />
                              {serviceSearch.trim()
                                ? <span className="truncate">{t('app.offers.addCustom', 'Add')} “{serviceSearch.trim()}”</span>
                                : t('app.offers.customLine', 'Custom line')}
                            </button>
                          </div>,
                          document.body,
                        )}

                        {lines.length > 0 && (
                          <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
                            <div className="space-y-1.5 text-sm">
                              <div className="flex justify-between text-gray-500">
                                <span>{t('app.offers.subtotal', 'Subtotal')}</span>
                                <span className="tabular-nums text-gray-700">{money(totals.subtotal)}</span>
                              </div>
                              {rule.defaultTaxRate > 0 && (
                                <div className="flex items-center justify-between text-gray-500">
                                  <button
                                    type="button"
                                    onClick={() => setTaxOn(v => !v)}
                                    className="group inline-flex items-center gap-2"
                                    aria-pressed={taxOn}
                                  >
                                    <span className={`relative h-4 w-7 rounded-full transition-colors ${taxOn ? 'bg-accent-500' : 'bg-gray-300'}`}>
                                      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${taxOn ? 'left-3.5' : 'left-0.5'}`} />
                                    </span>
                                    <span className="group-hover:text-gray-800">{rule.taxLabel} {taxOn ? `${taxRate}%` : ''}</span>
                                  </button>
                                  <span className="tabular-nums text-gray-700">{money(totals.tax)}</span>
                                </div>
                              )}
                            </div>
                            <div className="mt-3 flex items-end justify-between border-t border-gray-200/80 pt-3">
                              <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t('app.offers.total', 'Total')}</p>
                                {totals.minutes > 0 && (
                                  <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                                    <ClockIcon className="h-3.5 w-3.5" />
                                    {totals.minutes >= 60 ? `${Math.floor(totals.minutes / 60)} h ${totals.minutes % 60 ? `${totals.minutes % 60} min` : ''}` : `${totals.minutes} min`}
                                  </p>
                                )}
                              </div>
                              <p className="text-2xl font-bold tabular-nums text-gray-900">{money(totals.total)}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Days strip */}
                    <div className="flex-shrink-0 border-t border-gray-100 bg-white px-5 py-4 sm:px-6">
                      {dates.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setSlide('days')}
                          className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition-colors hover:border-gray-300"
                        >
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-50">
                            <CalendarDaysIcon className="h-5 w-5 text-gray-500" />
                          </div>
                          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                            {dates.map(d => (
                              <span key={d.date} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-800">
                                {formatDay(d.date, dayLocale)}
                                {d.extra_minutes != null && (
                                  <span className={`rounded px-1 text-[10px] font-bold ${fitTone(d.extra_minutes)}`}>{fitLabel(d.extra_minutes, onRouteLabel)}</span>
                                )}
                              </span>
                            ))}
                          </div>
                          <span className="flex-shrink-0 text-xs font-semibold text-gray-500">{t('app.offers.edit', 'Edit')}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSlide('days')}
                          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-3 text-left transition-colors hover:border-gray-400"
                        >
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-50">
                            <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-800">{t('app.offers.suggestDays', 'Suggest days')}</p>
                            <p className="text-xs text-gray-500">
                              {coords
                                ? t('app.offers.suggestDaysFit', 'See which days fit your routes best')
                                : t('app.offers.optional', 'Optional')}
                            </p>
                          </div>
                          {coords && <SparklesIcon className="h-5 w-5 flex-shrink-0 text-gray-400" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Slide 2: suggest days ── */}
                  <div className="flex h-full min-h-0 w-1/2 flex-col overflow-hidden">
                    <div className="flex-shrink-0 space-y-3 px-5 pb-3 pt-5 sm:px-6">
                      <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1">
                        {([
                          ['this', t('app.offers.thisWeek', 'This week')],
                          ['next', t('app.offers.nextWeek', 'Next week')],
                          ['custom', t('app.offers.custom', 'Custom')],
                        ] as [RangeMode, string][]).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setRangeMode(key)}
                            className={`rounded-lg py-2 text-sm font-semibold transition-all ${
                              rangeMode === key ? 'bg-white text-primary-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {rangeMode === 'custom' && (
                        <div className="grid grid-cols-2 gap-2">
                          <label className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
                            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('app.offers.from', 'From')}</span>
                            <input
                              type="date"
                              value={customFrom}
                              min={today}
                              onChange={e => setCustomFrom(e.target.value)}
                              className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-gray-900 focus:ring-0"
                            />
                          </label>
                          <label className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
                            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t('app.offers.to', 'To')}</span>
                            <input
                              type="date"
                              value={customTo}
                              min={customFrom || today}
                              max={addDaysYmd(customFrom || today, 30)}
                              onChange={e => setCustomTo(e.target.value)}
                              className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-gray-900 focus:ring-0"
                            />
                          </label>
                        </div>
                      )}

                      {coords ? (
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={pickBest}
                            disabled={bestDates.length === 0 || routesLoading}
                            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-40"
                          >
                            <SparklesIcon className="h-4 w-4 text-accent-600" />
                            {t('app.offers.pickBest', 'Pick best')} {bestDates.length > 0 ? bestDates.length : ''}
                          </button>
                          <div className="flex rounded-full bg-gray-100 p-0.5 text-xs font-semibold">
                            {([['fit', t('app.offers.bestFit', 'Best fit')], ['date', t('app.offers.byDate', 'Date')]] as [SortMode, string][]).map(([key, label]) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setSortMode(key)}
                                className={`rounded-full px-3 py-1 transition ${sortMode === key ? 'bg-white text-primary-800 shadow-sm' : 'text-gray-500'}`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                          <MapPinIcon className="h-4 w-4 flex-shrink-0" />
                          {t('app.offers.addAddressForFit', 'Add an address to rank days by route fit')}
                        </div>
                      )}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">
                      <div className="space-y-2">
                        {routesLoading && coords && !routes
                          ? Array.from({ length: 5 }).map((_, i) => (
                              <div key={i} className="h-[62px] animate-pulse rounded-2xl bg-gray-100" />
                            ))
                          : dayRows.map((row, idx) => {
                              const on = dates.some(d => d.date === row.date)
                              const full = !on && dates.length >= MAX_DAYS
                              const dt = parseYmd(row.date)
                              const weekend = dt.getDay() === 0 || dt.getDay() === 6
                              const mins = row.route?.added_minutes ?? null
                              const isTop = sortMode === 'fit' && coords && idx === 0 && mins != null
                              return (
                                <button
                                  key={row.date}
                                  type="button"
                                  onClick={() => toggleDate(row.date, row.route)}
                                  disabled={full}
                                  className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 pr-3 text-left transition-all ${
                                    on
                                      ? 'border-gray-300 bg-gray-50 shadow-sm'
                                      : full
                                        ? 'border-gray-100 bg-white opacity-45'
                                        : 'border-gray-200/80 bg-white hover:border-gray-300'
                                  } ${routesLoading ? 'opacity-60' : ''}`}
                                >
                                  <div className={`flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-xl ${on ? 'bg-white text-gray-900 ring-1 ring-gray-200' : weekend ? 'bg-gray-50 text-gray-400' : 'bg-gray-100 text-gray-800'}`}>
                                    <span className="text-[9px] font-bold uppercase leading-none tracking-wider opacity-80">
                                      {dt.toLocaleDateString(dayLocale === 'da' ? 'da-DK' : 'en-GB', { weekday: 'short' })}
                                    </span>
                                    <span className="mt-0.5 text-base font-bold leading-none tabular-nums">{dt.getDate()}</span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-gray-900">
                                      {dt.toLocaleDateString(dayLocale === 'da' ? 'da-DK' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
                                      {isTop && (
                                        <span className="ml-2 rounded-full bg-[#ecfdf3] px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-accent-700">
                                          {t('app.offers.best', 'Best')}
                                        </span>
                                      )}
                                    </p>
                                    <p className="truncate text-xs text-gray-500">
                                      {row.route
                                        ? `${row.route.user_name} · ${row.route.stop_count} ${row.route.stop_count === 1 ? t('app.offers.stop', 'stop') : t('app.offers.stops', 'stops')}`
                                        : coords
                                          ? t('app.offers.noRouteNearby', 'No route nearby')
                                          : ''}
                                    </p>
                                  </div>
                                  {mins != null && (
                                    <span className={`flex-shrink-0 rounded-lg px-2 py-1 text-xs font-bold tabular-nums ${fitTone(mins)}`}>
                                      {fitLabel(mins, onRouteLabel)}
                                    </span>
                                  )}
                                  <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition ${on ? 'border-accent-500 bg-accent-500' : 'border-gray-200'}`}>
                                    {on && <CheckIcon className="h-3.5 w-3.5 text-white" />}
                                  </span>
                                </button>
                              )
                            })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 border-t border-gray-100 bg-white">
                {error && <p className="px-5 pt-3 text-sm font-medium text-red-600 sm:px-6">{error}</p>}
                {onDaysSlide ? (
                    <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {Array.from({ length: MAX_DAYS }).map((_, i) => (
                        <span key={i} className={`h-2 w-6 rounded-full transition-colors ${i < dates.length ? 'bg-gray-800' : 'bg-gray-200'}`} />
                      ))}
                      {dates.length > 0 && (
                        <button type="button" onClick={() => setDates([])} className="ml-2 text-xs font-semibold text-gray-500 hover:text-gray-800">
                          {t('app.offers.clear', 'Clear')}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSlide('details')}
                      className="flex-shrink-0 rounded-xl border border-gray-200 bg-white px-8 py-3 text-sm font-semibold text-gray-800 transition-all hover:bg-gray-50"
                    >
                      {t('app.offers.done', 'Done')}{dates.length > 0 ? ` · ${dates.length}` : ''}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <button
                      type="button"
                      onClick={() => { setDraftValid(validUntil); setShowValid(true) }}
                      className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-gray-500 transition hover:text-gray-800"
                    >
                      <ClockIcon className="h-4 w-4 text-gray-400" />
                      {isForever
                        ? t('app.offers.forever', 'Forever')
                        : validDays != null && validDays > 0
                          ? `${t('app.offers.valid', 'Valid')} ${validDays} ${t('app.offers.days', 'days')}`
                          : `${t('app.offers.validUntil', 'Valid until')} ${formatDay(validUntil!, dayLocale)}`}
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void submit('draft')}
                        disabled={!canSubmit}
                        className="flex-1 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                      >
                        {busy === 'draft' ? '…' : isEdit ? t('app.offers.save', 'Save') : t('app.offers.saveDraft', 'Save draft')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void submit('send')}
                        disabled={!canSubmit}
                        className="flex-[2] rounded-xl bg-accent-500 px-7 py-3 text-sm font-semibold text-white transition-all hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
                      >
                        {busy === 'send'
                          ? t('app.offers.sending', 'Sending…')
                          : recipient?.email
                            ? t('app.offers.send', 'Send offer')
                            : t('app.offers.createLink', 'Create link')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showValid}
        onClose={() => setShowValid(false)}
        onConfirm={() => { setValidUntil(draftValid); setShowValid(false) }}
        title={t('app.offers.validUntil', 'Valid until')}
        confirmLabel={t('app.offers.save', 'Save')}
        enableNotification={false}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => setDraftValid(null)}
              className={`rounded-xl border py-2.5 text-sm font-semibold transition ${
                draftValid == null ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-300'
              }`}
            >
              {t('app.offers.forever', 'Forever')}
            </button>
            {[7, 14, 30].map(n => {
              const v = addDaysYmd(today, n)
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDraftValid(v)}
                  className={`rounded-xl border py-2.5 text-sm font-semibold transition ${
                    draftValid === v ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {n} {t('app.offers.days', 'days')}
                </button>
              )
            })}
          </div>
          {draftValid != null && (
            <input
              type="date"
              value={draftValid}
              min={today}
              onChange={e => setDraftValid(e.target.value || null)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-gray-400 focus:outline-none focus:ring-0"
            />
          )}
        </div>
      </ConfirmModal>
    </>
  )
}

function DoneView({
  done,
  link,
  copied,
  canShare,
  phone,
  companySlug,
  total,
  onCopy,
  onShare,
  onClose,
  t,
}: {
  done: { offer: OfferRecord; action: 'draft' | 'send'; emailed: string | null; emailError: string | null }
  link: string
  copied: boolean
  canShare: boolean
  phone: string
  companySlug: string
  total: string
  onCopy: () => void
  onShare: () => void
  onClose: () => void
  t: ReturnType<typeof useAppI18n>['t']
}) {
  const title = done.emailed
    ? t('app.offers.sentTitle', 'Offer sent')
    : done.action === 'draft'
      ? t('app.offers.savedTitle', 'Draft saved')
      : t('app.offers.readyTitle', 'Offer ready')
  const sub = done.emailed
    ? `${t('app.offers.emailedTo', 'Emailed to')} ${done.emailed}`
    : done.action === 'draft'
      ? t('app.offers.draftSub', 'Send it whenever you are ready')
      : t('app.offers.shareSub', 'Share the link with your client')
  const smsHref = phone ? `sms:${phone.replace(/\s+/g, '')}?&body=${encodeURIComponent(link)}` : null
  const tile = 'flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-gray-200 bg-white py-3.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-gray-300 hover:shadow-md'

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-white to-gray-50/50 px-5 py-8 sm:px-6">
        <div className="mx-auto max-w-sm text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#ecfdf3] ring-1 ring-[#d6f5e3]">
            <CheckIcon className="h-7 w-7 text-accent-600" />
          </div>
          <h3 className="mt-5 text-xl font-bold text-gray-900">{title}</h3>
          <p className="mt-1 text-sm text-gray-500">{sub}</p>
          <p className="mt-4 text-3xl font-bold tabular-nums text-gray-900">{total}</p>

          {done.emailError && (
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
              {done.emailError}. {t('app.offers.shareInstead', 'Share the link instead.')}
            </p>
          )}

          <div className="mt-6 flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-1.5 pl-4">
            <span className="min-w-0 flex-1 truncate text-left text-sm text-gray-600">{link.replace(/^https?:\/\//, '')}</span>
            <button
              type="button"
              onClick={onCopy}
              className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${copied ? 'bg-accent-500 text-white' : 'border border-gray-200 bg-white text-gray-800 hover:bg-gray-50'}`}
            >
              {copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
              {copied ? t('app.offers.copied', 'Copied') : t('app.offers.copy', 'Copy')}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {canShare ? (
              <button type="button" onClick={onShare} className={tile}>
                <ShareIcon className="h-5 w-5 text-accent-600" />
                {t('app.offers.share', 'Share')}
              </button>
            ) : smsHref ? (
              <a href={smsHref} className={tile}>
                <ChatBubbleLeftEllipsisIcon className="h-5 w-5 text-accent-600" />
                {t('app.offers.text', 'Text')}
              </a>
            ) : (
              <button type="button" onClick={onCopy} className={tile}>
                <ShareIcon className="h-5 w-5 text-accent-600" />
                {t('app.offers.share', 'Share')}
              </button>
            )}
            <a href={`/o/${done.offer.token}?preview=1`} target="_blank" rel="noreferrer" className={tile}>
              <EyeIcon className="h-5 w-5 text-accent-600" />
              {t('app.offers.preview', 'Preview')}
            </a>
            <a href={companySlug ? `/${companySlug}/offers/${done.offer.id}` : `/offers/${done.offer.id}`} className={tile}>
              <ArrowTopRightOnSquareIcon className="h-5 w-5 text-accent-600" />
              {t('app.offers.open', 'Open')}
            </a>
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 border-t border-gray-100 bg-white px-5 py-4 sm:px-6">
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
        >
          {t('app.offers.done', 'Done')}
        </button>
      </div>
    </>
  )
}
