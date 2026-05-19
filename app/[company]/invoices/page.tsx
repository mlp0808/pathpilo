'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import AppLayout from '@/app/components/AppLayout'
import { useAppI18n } from '@/app/components/I18nProvider'
import { apiUrl } from '@/app/utils/api'
import { ChevronDownIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline'

type DatePresetId =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'lastYear'
  | 'custom'

const INVOICE_STATUS_FILTERS: { value: string; labelKey: string; fallback: string }[] = [
  { value: 'draft', labelKey: 'app.invoicesList.status.draft', fallback: 'Draft' },
  { value: 'sent', labelKey: 'app.invoicesList.status.sent', fallback: 'Sent' },
  { value: 'overdue', labelKey: 'app.invoicesList.status.overdue', fallback: 'Overdue' },
  { value: 'paid', labelKey: 'app.invoicesList.status.paid', fallback: 'Paid' },
  { value: 'overpaid', labelKey: 'app.invoicesList.status.overpaid', fallback: 'Overpaid' },
  { value: 'cancelled', labelKey: 'app.invoicesList.status.cancelled', fallback: 'Credited' },
  { value: 'credited', labelKey: 'app.invoicesList.status.credited', fallback: 'Credited' },
]

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function rangeForPreset(preset: DatePresetId): { from: string; to: string } | null {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (preset) {
    case 'all':
      return null
    case 'today':
      return { from: ymd(today), to: ymd(today) }
    case 'yesterday': {
      const y = new Date(today)
      y.setDate(y.getDate() - 1)
      return { from: ymd(y), to: ymd(y) }
    }
    case 'last7': {
      const start = new Date(today)
      start.setDate(start.getDate() - 6)
      return { from: ymd(start), to: ymd(today) }
    }
    case 'last30': {
      const start = new Date(today)
      start.setDate(start.getDate() - 29)
      return { from: ymd(start), to: ymd(today) }
    }
    case 'thisMonth': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from: ymd(start), to: ymd(today) }
    }
    case 'lastMonth': {
      const firstThis = new Date(today.getFullYear(), today.getMonth(), 1)
      const lastPrev = new Date(firstThis)
      lastPrev.setDate(0)
      const firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1)
      return { from: ymd(firstPrev), to: ymd(lastPrev) }
    }
    case 'thisYear': {
      const start = new Date(today.getFullYear(), 0, 1)
      return { from: ymd(start), to: ymd(today) }
    }
    case 'lastYear': {
      const y = today.getFullYear() - 1
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    }
    case 'custom':
      return null
    default:
      return null
  }
}

function formatDate(value: string | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatMoney(amount: number | string | undefined, currency: string | undefined): string {
  if (amount === undefined || amount === null) return '—'
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(n)) return '—'
  const cur = currency || 'DKK'
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(n)
  } catch {
    return `${n.toFixed(2)} ${cur}`
  }
}

function statusLabel(t: (k: string, f: string) => string, status: string): string {
  if (status === 'cancelled' || status === 'credited') return t('app.invoicesList.status.credited', 'Credited')
  const row = INVOICE_STATUS_FILTERS.find((x) => x.value === status)
  return row ? t(row.labelKey, row.fallback) : status
}

function invoiceStatusBadgeClass(status: string): string {
  const s = status || 'draft'
  if (s === 'sent') return 'bg-amber-100 text-amber-900'
  if (s === 'paid') return 'bg-emerald-100 text-emerald-800'
  return 'bg-gray-100 text-gray-800'
}

interface InvoiceRow {
  id: number
  invoice_number: string | null
  invoice_number_display?: string | null
  title: string | null
  client_id: number
  issue_date?: string
  due_date: string | null
  total: string | number
  currency: string
  status: string
  created_at: string
  client_name: string
}

interface ClientOption {
  id: number
  name: string
  last_name: string | null
}

function clientDisplayName(c: ClientOption): string {
  return [c.name, c.last_name].filter(Boolean).join(' ').trim() || '—'
}

export default function InvoicesListPage() {
  const { t } = useAppI18n()
  const params = useParams() as { company?: string }
  const companySlug = params.company || ''
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [datePreset, setDatePreset] = useState<DatePresetId>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusOpen, setStatusOpen] = useState(false)
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set())
  const [clientId, setClientId] = useState<number | null>(null)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const statusRef = useRef<HTMLDivElement>(null)
  const clientRef = useRef<HTMLDivElement>(null)
  const [filtersReady, setFiltersReady] = useState(false)
  const skipUrlWrite = useRef(true)
  const firstSearchHydration = useRef(true)

  const presetOptions: { id: DatePresetId; labelKey: string; fallback: string }[] = useMemo(
    () => [
      { id: 'all', labelKey: 'app.invoicesList.preset.all', fallback: 'All time' },
      { id: 'today', labelKey: 'app.invoicesList.preset.today', fallback: 'Today' },
      { id: 'yesterday', labelKey: 'app.invoicesList.preset.yesterday', fallback: 'Yesterday' },
      { id: 'last7', labelKey: 'app.invoicesList.preset.last7', fallback: 'Last 7 days' },
      { id: 'last30', labelKey: 'app.invoicesList.preset.last30', fallback: 'Last 30 days' },
      { id: 'thisMonth', labelKey: 'app.invoicesList.preset.thisMonth', fallback: 'This month' },
      { id: 'lastMonth', labelKey: 'app.invoicesList.preset.lastMonth', fallback: 'Last month' },
      { id: 'thisYear', labelKey: 'app.invoicesList.preset.thisYear', fallback: 'This year' },
      { id: 'lastYear', labelKey: 'app.invoicesList.preset.lastYear', fallback: 'Last year' },
      { id: 'custom', labelKey: 'app.invoicesList.preset.custom', fallback: 'Custom range' },
    ],
    [],
  )

  useEffect(() => {
    const df = searchParams.get('dateFrom') || ''
    const dt = searchParams.get('dateTo') || ''
    const st = searchParams.get('status')
    const cid = searchParams.get('clientId')
    setDateFrom(df)
    setDateTo(dt)
    setSelectedStatuses(
      st ? new Set(st.split(',').map((s) => s.trim()).filter(Boolean)) : new Set(),
    )
    if (cid) {
      const n = parseInt(cid, 10)
      setClientId(!isNaN(n) ? n : null)
    } else {
      setClientId(null)
    }
    if (firstSearchHydration.current) {
      if (df || dt) setDatePreset('custom')
      firstSearchHydration.current = false
    }
    setFiltersReady(true)
  }, [searchParams])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false)
      if (clientRef.current && !clientRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false)
        setClientSearch('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(apiUrl('/clients'), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data.clients) setClients(data.clients)
      })
      .catch(() => {})
  }, [])

  const buildQuery = useCallback(() => {
    const q = new URLSearchParams()
    if (dateFrom) q.set('dateFrom', dateFrom)
    if (dateTo) q.set('dateTo', dateTo)
    if (selectedStatuses.size > 0) q.set('status', [...selectedStatuses].sort().join(','))
    if (clientId != null) q.set('clientId', String(clientId))
    return q.toString()
  }, [dateFrom, dateTo, selectedStatuses, clientId])

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const token = localStorage.getItem('token')
      const qs = buildQuery()
      const response = await fetch(apiUrl(`/invoices${qs ? `?${qs}` : ''}`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || t('app.invoicesList.errFetch', 'Failed to load invoices'))
        setInvoices([])
        return
      }
      setInvoices(data.invoices || [])
    } catch {
      setError(t('app.invoicesList.errNetwork', 'Network error'))
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [buildQuery, t])

  useEffect(() => {
    if (!filtersReady) return
    fetchInvoices()
  }, [filtersReady, fetchInvoices])

  useEffect(() => {
    if (!filtersReady) return
    if (skipUrlWrite.current) {
      skipUrlWrite.current = false
      return
    }
    const qs = buildQuery()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [filtersReady, buildQuery, pathname, router])

  const onPresetChange = (preset: DatePresetId) => {
    setDatePreset(preset)
    if (preset === 'custom') return
    const r = rangeForPreset(preset)
    if (!r) {
      setDateFrom('')
      setDateTo('')
      return
    }
    setDateFrom(r.from)
    setDateTo(r.to)
  }

  const toggleStatus = (value: string) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const selectedClientName = useMemo(() => {
    if (clientId == null) return t('app.invoicesList.clientAll', 'All clients')
    const c = clients.find((x) => x.id === clientId)
    return c ? clientDisplayName(c) : t('app.invoicesList.clientAll', 'All clients')
  }, [clientId, clients, t])

  const filteredClients = useMemo(() => {
    const s = clientSearch.trim().toLowerCase()
    if (!s) return clients
    return clients.filter((c) => clientDisplayName(c).toLowerCase().includes(s))
  }, [clients, clientSearch])

  const statusSummary = useMemo(() => {
    if (selectedStatuses.size === 0) return t('app.invoicesList.statusAll', 'All statuses')
    return [...selectedStatuses]
      .sort()
      .map((v) => statusLabel(t, v))
      .join(', ')
  }, [selectedStatuses, t])

  const base = companySlug ? `/${companySlug}/invoices` : '/invoices'

  return (
    <AppLayout>
      <div>
        <div className="flex items-center justify-between gap-3 mb-5 sm:mb-6">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-primary-500 truncate">{t('app.invoicesList.title', 'Invoices')}</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{t('app.invoicesList.subtitle', 'View and filter all invoices for your company.')}</p>
          </div>
          <Link
            href={`${base}/new`}
            className="inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-xl hover:bg-primary-700 active:bg-primary-700/90 transition-colors flex-shrink-0"
          >
            <PlusIcon className="w-4 h-4" />
            <span className="hidden xs:inline">{t('app.invoicesList.newInvoice', 'New invoice')}</span>
          </Link>
        </div>

        {/* Filters. On mobile each control becomes full-width; on tablet they
            wrap and align by their labels; on desktop they fit on a row. */}
        <div className="flex flex-col xl:flex-row flex-wrap gap-3 mb-5 sm:mb-6">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('app.invoicesList.period', 'Period')}</label>
              <select
                value={datePreset}
                onChange={(e) => onPresetChange(e.target.value as DatePresetId)}
                className="w-full sm:w-[200px] px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent"
              >
                {presetOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {t(o.labelKey, o.fallback)}
                  </option>
                ))}
              </select>
            </div>
            {datePreset === 'custom' && (
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('app.invoicesList.from', 'From')}</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('app.invoicesList.to', 'To')}</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="relative w-full sm:w-auto" ref={statusRef}>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('app.invoicesList.status', 'Status')}</label>
            <button
              type="button"
              onClick={() => setStatusOpen((o) => !o)}
              className="flex items-center justify-between gap-2 w-full sm:w-[240px] px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-left hover:border-gray-300"
            >
              <span className="truncate text-gray-800">{statusSummary}</span>
              <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </button>
            {statusOpen && (
              <div className="absolute z-30 mt-1 w-full sm:w-[280px] max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg py-2">
                {INVOICE_STATUS_FILTERS.map((row) => (
                  <label
                    key={row.value}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStatuses.has(row.value)}
                      onChange={() => toggleStatus(row.value)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-accent-400"
                    />
                    <span>{t(row.labelKey, row.fallback)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-md" ref={clientRef}>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('app.invoicesList.client', 'Client')}</label>
            <button
              type="button"
              onClick={() => {
                setClientDropdownOpen((o) => !o)
                if (!clientDropdownOpen) setClientSearch('')
              }}
              className="flex items-center justify-between gap-2 w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-left hover:border-gray-300"
            >
              <span className="truncate text-gray-800">{selectedClientName}</span>
              <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </button>
            {clientDropdownOpen && (
              <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg py-2">
                <div className="px-2 pb-2 border-b border-gray-100">
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder={t('app.invoicesList.clientSearch', 'Search clients…')}
                      className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400"
                      autoFocus
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setClientId(null)
                    setClientDropdownOpen(false)
                    setClientSearch('')
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                >
                  {t('app.invoicesList.clientAll', 'All clients')}
                </button>
                <div className="max-h-48 overflow-y-auto">
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setClientId(c.id)
                        setClientDropdownOpen(false)
                        setClientSearch('')
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                        clientId === c.id ? 'bg-accent-50 text-primary-700' : ''
                      }`}
                    >
                      {clientDisplayName(c)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-3">
            {error}
            <button type="button" onClick={() => fetchInvoices()} className="ml-auto underline">
              {t('app.clientsList.retry', 'Retry')}
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent-400 border-t-transparent" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 sm:p-12 text-center">
            <p className="text-sm font-medium text-gray-900 mb-1">{t('app.invoicesList.empty', 'No invoices match your filters.')}</p>
            <p className="text-xs text-gray-500">{t('app.invoicesList.emptyHint', 'Try widening the date range or clearing filters.')}</p>
          </div>
        ) : (
          <>
            {/* Desktop / wide tablet: full table. */}
            <div className="hidden md:block bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="px-4 py-3">{t('app.invoicesList.col.number', 'Number')}</th>
                      <th className="px-4 py-3">{t('app.invoicesList.col.title', 'Title')}</th>
                      <th className="px-4 py-3">{t('app.invoicesList.col.client', 'Client')}</th>
                      <th className="px-4 py-3">{t('app.invoicesList.col.issueDate', 'Issue date')}</th>
                      <th className="px-4 py-3">{t('app.invoicesList.col.due', 'Due')}</th>
                      <th className="px-4 py-3">{t('app.invoicesList.col.status', 'Status')}</th>
                      <th className="px-4 py-3 text-right">{t('app.invoicesList.col.total', 'Total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                        <td className="px-4 py-3">
                          <Link href={`${base}/${inv.id}`} className="font-medium text-primary-600 hover:underline">
                            {inv.invoice_number_display || inv.invoice_number || `#${inv.id}`}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-800 max-w-[200px] truncate">{inv.title || '—'}</td>
                        <td className="px-4 py-3 text-gray-700">{inv.client_name}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(inv.issue_date)}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(inv.due_date || undefined)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium ${invoiceStatusBadgeClass(inv.status || 'draft')}`}
                          >
                            {statusLabel(t, inv.status || 'draft')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                          {formatMoney(inv.total, inv.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile / small tablet: card list. Same data, designed to be
                fully tappable. Number + total form the header row, status
                pill aligns right, secondary info wraps below. */}
            <ul className="md:hidden bg-white border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100">
              {invoices.map((inv) => (
                <li key={inv.id} className="tap-press">
                  <Link
                    href={`${base}/${inv.id}`}
                    className="block px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-primary-600">
                            {inv.invoice_number_display || inv.invoice_number || `#${inv.id}`}
                          </span>
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-medium ${invoiceStatusBadgeClass(inv.status || 'draft')}`}
                          >
                            {statusLabel(t, inv.status || 'draft')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-700 mt-1 truncate">{inv.title || '—'}</p>
                        <p className="text-xs text-gray-500 truncate">{inv.client_name}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-semibold text-sm text-gray-900 whitespace-nowrap">
                          {formatMoney(inv.total, inv.currency)}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-1 whitespace-nowrap">
                          {formatDate(inv.due_date || undefined)}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </AppLayout>
  )
}
