'use client'

import { useState, useEffect, useMemo, useCallback, Suspense, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import AppLayout from '@/app/components/AppLayout'
import { apiUrl, resolveAssetUrl } from '@/app/utils/api'
import { getCountryRule } from '@/app/config/countryRules'
import { useUser } from '@/app/hooks/useUser'
// Admin form labels follow the *user's* language preference (the admin's UI
// locale), NOT the company invoice locale. The user explicitly called this
// out: "The users language should basically work just like if I did a google
// translate on the page — it doesn't change what fields are available."
import { t as translate, type MessageKey } from '@/app/i18n'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BuildingLibraryIcon,
  CheckIcon,
  ChevronDownIcon,
  CreditCardIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PhotoIcon,
  PlusIcon,
  UserIcon,
  XMarkIcon,
  EyeIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'

const MAX_TITLE_LEN = 30

function formatDate(value: string): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatMoney(amount: number, currency: string): string {
  return `${Number(amount).toFixed(2)} ${currency}`
}

interface Client {
  id: number
  name: string | null
  last_name: string | null
  client_type?: 'person' | 'company' | string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  zip_code?: string | null
  city?: string | null
  country?: string | null
  ean_number?: string | null
  company_number?: string | null
  billing_email?: string | null
  job_count?: number
  last_job_date?: string | null
}

type CompanyProfile = {
  name?: string
  address?: string
  city?: string
  zipCode?: string
  cvrNumber?: string
  vatNumber?: string
  email?: string
  phone?: string
  website?: string
  logoUrl?: string
  country?: string
}

interface CompletedJob {
  id: number
  title: string | null
  client_id: number | null
  name?: string | null
  last_name?: string | null
  status?: string
  invoice_id?: number | null
  total_price?: number | string | null
  service_count?: number
  updated_at?: string | null
  created_at?: string | null
  scheduled_date?: string | null
}

function clientFullName(c: Client | null | undefined): string {
  if (!c) return '—'
  if (String(c.client_type || '').toLowerCase() === 'company') {
    return String(c.name || '').trim() || '—'
  }
  return [c.name, c.last_name].filter(Boolean).join(' ').trim() || '—'
}

const INVOICE_CURRENCIES = ['DKK', 'SEK', 'NOK', 'EUR', 'GBP', 'USD'] as const

interface JobPickerProps {
  availableJobs: CompletedJob[]
  selectedCount: number
  totalCount: number
  loading: boolean
  error: string | null
  currency: string
  onAdd: (jobId: number) => void
  tr: (key: MessageKey, fallback?: string) => string
}

/**
 * Searchable combobox used inside the line-items area to add a completed,
 * uninvoiced job. The field stays openable so users always get feedback —
 * including when there are no more jobs left to add.
 */
function JobPicker({
  availableJobs,
  selectedCount,
  totalCount,
  loading,
  error,
  currency,
  onAdd,
  tr,
}: JobPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      const node = wrapperRef.current
      if (node && e.target instanceof Node && !node.contains(e.target)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return availableJobs
    return availableJobs.filter((j) => (j.title || '').toLowerCase().includes(q))
  }, [availableJobs, query])

  const allAdded = totalCount > 0 && selectedCount >= totalCount
  const noJobsAtAll = !loading && totalCount === 0
  const canPick = !loading && !error && availableJobs.length > 0

  const emptyMessage = (() => {
    if (loading) return tr('invoice.new.picker.loading', 'Loading jobs…')
    if (error) return error
    if (noJobsAtAll) {
      return tr(
        'invoice.new.picker.noJobsDetail',
        'No completed, uninvoiced jobs for this client. Complete a job first, then add it here.',
      )
    }
    if (allAdded || availableJobs.length === 0) {
      return tr(
        'invoice.new.picker.allAddedDetail',
        'Every completed, uninvoiced job for this client is already on this invoice.',
      )
    }
    return tr('invoice.new.picker.noMatch', 'No completed jobs match') + ` “${query}”.`
  })()

  const handlePick = (jobId: number) => {
    onAdd(jobId)
    setQuery('')
    if (availableJobs.length <= 1) {
      setOpen(false)
    } else {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          requestAnimationFrame(() => inputRef.current?.focus())
        }}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-4 py-3.5 text-sm font-medium text-gray-500 transition-colors hover:border-accent-400/80 hover:bg-accent-50/40 hover:text-accent-600"
      >
        <PlusIcon className="h-4 w-4 opacity-70" />
        <span>{tr('invoice.new.picker.addJobs', 'Add jobs')}</span>
        <ChevronDownIcon
          className={`h-3.5 w-3.5 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-3 py-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loading}
              placeholder={
                loading
                  ? tr('invoice.new.picker.loading', 'Loading jobs…')
                  : tr('invoice.new.picker.filterJobs', 'Search jobs…')
              }
              className="w-full border-0 bg-transparent p-1 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {!canPick || filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm leading-relaxed text-gray-500">
                {emptyMessage}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filtered.map((job) => {
                  const total = Number(job.total_price) || 0
                  const completedAt = job.updated_at || job.created_at || ''
                  return (
                    <li key={job.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handlePick(job.id)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {job.title || tr('invoice.new.untitledJob', 'Untitled job')}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                            <span>
                              {tr('invoice.new.picker.completedOn', 'Completed')} {formatDate(completedAt)}
                            </span>
                            {job.service_count != null && (
                              <span>
                                · {job.service_count}{' '}
                                {job.service_count === 1
                                  ? tr('invoice.new.picker.taskOne', 'task')
                                  : tr('invoice.new.picker.taskMany', 'tasks')}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="flex-shrink-0 text-sm font-semibold text-gray-900">
                          {formatMoney(total, currency)}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NewInvoicePageContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const company = (params?.company as string) || ''

  // Admin UI locale — tracks the user's language preference. Used for the
  // labels on this form only. The actual invoice content sent to customers
  // follows the COMPANY country locale (see DigitalInvoiceView + buildInvoicePdf).
  const { user } = useUser()
  const tr = useCallback(
    (key: MessageKey, fallback?: string) => translate(user?.languageCode, key, fallback),
    [user?.languageCode],
  )

  // ── URL hydration (legacy ?jobIds=, ?clientId=, and edit ?draft=) ────────
  const jobIdsParam = searchParams.get('jobIds') || ''
  const clientIdParam = searchParams.get('clientId') || ''
  const draftIdParam = searchParams.get('draft') || ''
  const initialJobIds = useMemo(() => {
    if (!jobIdsParam.trim()) return [] as number[]
    return jobIdsParam.split(',').map((id) => parseInt(id.trim(), 10)).filter((id) => !isNaN(id))
  }, [jobIdsParam])
  const initialClientId = useMemo(() => {
    const n = parseInt(clientIdParam, 10)
    return !isNaN(n) ? n : null
  }, [clientIdParam])
  // ── Draft-edit mode ───────────────────────────────────────────────────────
  // When ?draft=<id> is present, this whole page becomes the editor for an
  // existing draft invoice instead of a fresh one. We reuse the entire
  // creation UI and just swap POST → PUT on submit. The draft is hydrated
  // by `hydrateDraft` below once both clients and completed jobs have
  // loaded.
  const editDraftId = useMemo(() => {
    const n = parseInt(draftIdParam, 10)
    return !isNaN(n) && n > 0 ? n : null
  }, [draftIdParam])
  const isEditMode = editDraftId != null
  const [draftHydrated, setDraftHydrated] = useState(!isEditMode)
  const [draftError, setDraftError] = useState<string | null>(null)

  // ── Step state ─────────────────────────────────────────────────────────────
  // 'client' = pick a client first; 'build' = pick jobs + fill details
  const [step, setStep] = useState<'client' | 'build'>(
    initialClientId != null || initialJobIds.length > 0 || isEditMode ? 'build' : 'client',
  )

  // ── Client picker state ────────────────────────────────────────────────────
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [clientsError, setClientsError] = useState<string | null>(null)
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<number | null>(initialClientId)
  const clientSearchRef = useRef<HTMLInputElement>(null)

  // ── Completed jobs state (for the picked client) ───────────────────────────
  const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [selectedJobIds, setSelectedJobIds] = useState<Set<number>>(
    () => new Set(initialJobIds),
  )

  // ── Invoice form ───────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    title: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_days: 14,
    tax_rate: 25,
    currency: 'DKK',
    // Intentionally left blank — there is no hardcoded fallback. If the
    // company has saved a default under Settings → Invoice options it will
    // be hydrated below. Otherwise the field stays empty and the UI
    // prompts the user to set up a template once.
    payment_terms: '',
      description: '',
      // Combined "Reference / PO" field for B2B invoices. Optional. Hidden on
      // the rendered invoice when blank.
      reference_text: '',
      discounts: {} as Record<string, number>,
  })

  // True once the /companies/invoice-defaults call has completed (regardless
  // of outcome). Used to avoid flashing the "Set up standard terms" CTA
  // before we know whether one exists.
  const [defaultsLoaded, setDefaultsLoaded] = useState(false)
  // True if the company has saved its own non-empty payment terms template.
  const [hasCompanyDefaultTerms, setHasCompanyDefaultTerms] = useState(false)
  // True only after the admin has explicitly chosen a starting invoice
  // number under Settings → Invoice options. Until that happens we won't
  // let them create an invoice — otherwise we'd silently start them at #1
  // even if they're migrating from a system already at #847.
  const [numberingConfigured, setNumberingConfigured] = useState(false)
  // Master invoicing gate. null = unknown; false = feature off → bounce the
  // admin to settings (mirrors the server-side create gate).
  const [invoicingEnabled, setInvoicingEnabled] = useState<boolean | null>(null)

  // ── Payment options (snapshot for THIS invoice) ────────────────────────────
  // We fetch the company-level enabled methods once, then the admin can
  // toggle individual ones off for this specific invoice.
  type PaymentOption = {
    provider: string
    title: string
    description: string
  }
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([])
  const [paymentLoaded, setPaymentLoaded] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  // provider → enabled-for-this-invoice. Defaults to ON when first loaded.
  const [paymentMethodOn, setPaymentMethodOn] = useState<Record<string, boolean>>({})
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null)
  const [invoiceNextNumber, setInvoiceNextNumber] = useState<number | null>(null)
  const [draftInvoiceNumber, setDraftInvoiceNumber] = useState<string | null>(null)
  const [clientSavingField, setClientSavingField] = useState<string | null>(null)
  const [invoiceEmail, setInvoiceEmail] = useState('')
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [sendConfirmStep, setSendConfirmStep] = useState<'form' | 'confirm'>('form')
  const [sendTo, setSendTo] = useState('')
  const [sendCc, setSendCc] = useState('')
  const [sendSubject, setSendSubject] = useState('')
  const [sendBody, setSendBody] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [draftSavedFlash, setDraftSavedFlash] = useState(false)
  const draftSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const currencyMenuRef = useRef<HTMLDivElement>(null)
  const countryCode = useMemo(() => {
    if (typeof window === 'undefined') return 'DK'
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      return user?.activeCompany?.countryCode || 'DK'
    } catch {
      return 'DK'
    }
  }, [])
  const countryRule = useMemo(() => getCountryRule(countryCode), [countryCode])
  const businessSettingsHref = company ? `/${company}/settings/business` : '/settings/business'
  const invoiceSettingsHref = company ? `/${company}/settings/invoice-options` : '/settings/invoice-options'

  // Apply country defaults once.
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      tax_rate: countryRule.defaultTaxRate,
      currency: countryRule.defaultCurrency || prev.currency,
    }))
  }, [countryRule.defaultCurrency, countryRule.defaultTaxRate])

  // Fetch company-level invoice defaults (due days, payment terms).
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setDefaultsLoaded(true)
      return
    }
    fetch(apiUrl('/companies/invoice-defaults'), { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        const d = data?.defaults
        if (!d) return
        setInvoicingEnabled(Boolean(d.invoicingEnabled))
        const savedTerms =
          typeof d.invoiceDefaultPaymentTerms === 'string' ? d.invoiceDefaultPaymentTerms.trim() : ''
        // Treat non-empty terms (including the API starter template) as available
        // so the composer is prefilled and the "set up" CTA stays hidden.
        setHasCompanyDefaultTerms(savedTerms.length > 0)
        // Multi-signal "is numbering configured" check, in this order:
        //   1. Explicit flag from the API (most authoritative).
        //   2. The saved next-number is anything other than the schema
        //      default of 1 → somebody actively chose it.
        //   3. The company has already issued at least one invoice.
        // Falls back to "yes" if none of these are present, so an
        // out-of-date api-server response doesn't show a stale red banner.
        // The server still enforces the real gate on POST.
        const nextNumber = Number(d.invoiceNextNumber) || 0
        const maxIssued = Number(d.maxNumericInvoice) || 0
        if (nextNumber > 0) setInvoiceNextNumber(nextNumber)
        // Multi-signal "is numbering configured" check.
        //   • Reality wins: if a starting number above the schema default
        //     of 1 is saved, OR an invoice has actually been issued, then
        //     numbering IS configured — even if the api-server hasn't yet
        //     written the boolean flag column (legacy data).
        //   • Otherwise trust the explicit boolean from the API.
        //   • Last resort: an unknown nextNumber === 0 means we don't know,
        //     so don't block.
        const realityConfigured = nextNumber > 1 || maxIssued > 0
        const configured =
          realityConfigured
            ? true
            : typeof d.invoiceNumberingConfigured === 'boolean'
              ? d.invoiceNumberingConfigured
              : nextNumber === 0
        setNumberingConfigured(configured)
        setForm((prev) => ({
          ...prev,
          due_days: Number.isFinite(d.invoiceDefaultDueDays) ? d.invoiceDefaultDueDays : prev.due_days,
          // Hydrate from the company default only if the user hasn't already typed
          // something into the per-invoice override.
          payment_terms: prev.payment_terms.trim() ? prev.payment_terms : savedTerms,
          // Company-level VAT settings override the country-default tax rate.
          // invoiceVatEnabled === false means VAT-exempt → set rate to 0.
          // invoiceDefaultTaxRate != null → use the configured rate.
          tax_rate:
            d.invoiceVatEnabled === false
              ? 0
              : d.invoiceDefaultTaxRate != null
                ? Number(d.invoiceDefaultTaxRate)
                : prev.tax_rate,
        }))
      })
      .catch(() => {})
      .finally(() => setDefaultsLoaded(true))
  }, [])

  // If invoicing is switched off for this company, this page must not be
  // usable — send the admin to the invoice settings to turn it on.
  useEffect(() => {
    if (invoicingEnabled === false) {
      const settingsHref = company ? `/${company}/settings/invoice-options` : '/settings/invoice-options'
      router.replace(settingsHref)
    }
  }, [invoicingEnabled, company, router])

  // Fetch active payment options (only those that can pay an invoice and
  // are enabled at company level). The admin can still turn each one off
  // for this specific invoice via the toggles below.
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setPaymentLoaded(true)
      return
    }
    fetch(apiUrl('/integrations'), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        const all = Array.isArray(data?.integrations) ? data.integrations : []
        const active: PaymentOption[] = all
          .filter(
            (opt: { enabled?: boolean; capabilities?: string[] }) =>
              opt?.enabled === true &&
              Array.isArray(opt?.capabilities) &&
              opt.capabilities.includes('invoice_payment'),
          )
          .map((opt: { provider: string; title?: string; description?: string }) => ({
            provider: opt.provider,
            title: opt.title || opt.provider,
            description: opt.description || '',
          }))
        setPaymentOptions(active)
        setPaymentMethodOn(
          active.reduce<Record<string, boolean>>((acc, opt) => {
            acc[opt.provider] = true
            return acc
          }, {}),
        )
        setPaymentError(null)
      })
      .catch(() => setPaymentError('Failed to load payment options'))
      .finally(() => setPaymentLoaded(true))
  }, [])

  // Fetch company profile (logo + business details shown on the document).
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(apiUrl('/companies/profile'), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data?.company) setCompanyProfile(data.company)
      })
      .catch(() => {})
  }, [])

  // Fetch clients on first render.
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setClientsError('Not authenticated')
      setClientsLoading(false)
      return
    }
    setClientsLoading(true)
    fetch(apiUrl('/clients'), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        setClients(Array.isArray(data?.clients) ? data.clients : [])
        setClientsError(null)
      })
      .catch(() => setClientsError('Failed to load clients'))
      .finally(() => setClientsLoading(false))
  }, [])

  // Load full client record (address etc.) when building an invoice for them.
  useEffect(() => {
    if (selectedClientId == null || step !== 'build') return
    const token = localStorage.getItem('token')
    if (!token) return
    let cancelled = false
    fetch(apiUrl(`/clients/${selectedClientId}`), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.client) return
        const full = data.client as Client
        setClients((prev) => {
          const idx = prev.findIndex((c) => c.id === full.id)
          if (idx < 0) return [...prev, full]
          const next = [...prev]
          next[idx] = { ...next[idx], ...full }
          return next
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [selectedClientId, step])

  // Fetch completed jobs once (used for both job picker and legacy auto-derive of client).
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    setJobsLoading(true)
    fetch(apiUrl('/jobs?status=completed'), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        setCompletedJobs(Array.isArray(data?.jobs) ? data.jobs : [])
        setJobsError(null)
      })
      .catch(() => setJobsError('Failed to load completed jobs'))
      .finally(() => setJobsLoading(false))
  }, [])

  // Legacy compat: when arriving with ?jobIds= but no ?clientId=, derive the
  // client from the first matching job once jobs have loaded.
  useEffect(() => {
    if (selectedClientId != null) return
    if (initialJobIds.length === 0) return
    if (completedJobs.length === 0) return
    const firstMatch = completedJobs.find((j) => initialJobIds.includes(j.id))
    if (firstMatch?.client_id) setSelectedClientId(firstMatch.client_id)
  }, [completedJobs, initialJobIds, selectedClientId])

  // ── Draft hydration (edit mode) ────────────────────────────────────────
  // Pull the existing draft so we can prefill every field in the form just
  // like the user left it, then submit via PUT instead of POST.
  useEffect(() => {
    if (!isEditMode || !editDraftId) return
    const token = localStorage.getItem('token')
    if (!token) {
      setDraftError('Not authenticated')
      setDraftHydrated(true)
      return
    }
    fetch(apiUrl(`/invoices/${editDraftId}`), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        const inv = data?.invoice
        if (!ok || !inv) {
          setDraftError(data?.error || 'Failed to load draft')
          return
        }
        if (inv.status !== 'draft') {
          setDraftError('Only draft invoices can be edited.')
          return
        }
        // Reconstruct due_days from the saved issue/due dates so the
        // existing UI keeps working. If the dates are missing we fall back
        // to whatever's already in form (the company default).
        const issueDate = inv.issue_date ? String(inv.issue_date).slice(0, 10) : ''
        const dueDate = inv.due_date ? String(inv.due_date).slice(0, 10) : ''
        let dueDays = 0
        if (issueDate && dueDate) {
          const a = new Date(issueDate)
          const b = new Date(dueDate)
          if (!isNaN(a.getTime()) && !isNaN(b.getTime())) {
            dueDays = Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000))
          }
        }

        // Items carry the per-job line totals. We rebuild the per-job
        // discount map by comparing the sum of original_price - line_total
        // for each job_id. The API doesn't store the discount as a
        // first-class field on the invoice; it's distributed across the
        // line items.
        const jobIds = new Set<number>()
        const discountByJob: Record<string, number> = {}
        if (Array.isArray(inv.items)) {
          for (const it of inv.items) {
            if (it?.job_id != null) {
              jobIds.add(it.job_id)
              const original = Number(it.original_price ?? it.unit_price ?? 0)
              const line = Number(it.line_total ?? it.unit_price ?? 0)
              const diff = (original - line) * (Number(it.quantity) || 1)
              if (diff > 0.0001) {
                discountByJob[String(it.job_id)] =
                  (discountByJob[String(it.job_id)] || 0) + diff
              }
            }
          }
        }

        const enabledMethods: string[] = Array.isArray(inv.enabled_payment_methods)
          ? inv.enabled_payment_methods
          : []

        setSelectedClientId(inv.client_id ?? null)
        setSelectedJobIds(jobIds)
        setDraftInvoiceNumber(inv.invoice_number ? String(inv.invoice_number) : null)
        setForm((prev) => ({
          ...prev,
          title: inv.title || '',
          issue_date: issueDate || prev.issue_date,
          due_days: dueDays || prev.due_days,
          tax_rate: inv.tax_rate != null ? Number(inv.tax_rate) : prev.tax_rate,
          currency: inv.currency || prev.currency,
          payment_terms: inv.payment_terms || '',
          description: inv.description || '',
          reference_text: inv.reference_text || '',
          discounts: Object.fromEntries(
            Object.entries(discountByJob).map(([k, v]) => [k, Math.round(v * 100) / 100]),
          ),
        }))
        // Pin the per-invoice payment-method toggles to whatever the
        // draft has saved. We'll reconcile this with the company-level
        // available list once it loads (any newly-added providers default
        // to ON, anything no longer offered is dropped).
        if (enabledMethods.length > 0) {
          setPaymentMethodOn((prev) => {
            const next = { ...prev }
            for (const p of enabledMethods) next[p] = true
            return next
          })
        }
      })
      .catch(() => setDraftError('Network error loading draft'))
      .finally(() => setDraftHydrated(true))
  }, [editDraftId, isEditMode])

  // After the company-level payment options finish loading in edit mode,
  // re-snap each toggle so it reflects what the draft had saved (anything
  // not in the saved list defaults to OFF; anything new defaults to ON).
  useEffect(() => {
    if (!isEditMode || !editDraftId || !paymentLoaded || paymentOptions.length === 0) return
    // Read the saved methods one more time (we may have raced the draft
    // hydration).
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(apiUrl(`/invoices/${editDraftId}`), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const saved = Array.isArray(data?.invoice?.enabled_payment_methods)
          ? new Set(data.invoice.enabled_payment_methods as string[])
          : null
        if (!saved) return
        setPaymentMethodOn(() => {
          const next: Record<string, boolean> = {}
          for (const opt of paymentOptions) {
            next[opt.provider] = saved.has(opt.provider)
          }
          return next
        })
      })
      .catch(() => {})
    // Only run this reconciliation once per options-load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentLoaded, paymentOptions.length])

  // Auto-focus the search field when entering the client step.
  useEffect(() => {
    if (step === 'client') {
      const id = window.setTimeout(() => clientSearchRef.current?.focus(), 60)
      return () => window.clearTimeout(id)
    }
  }, [step])

  useEffect(() => {
    if (editingTitle) {
      requestAnimationFrame(() => titleInputRef.current?.focus())
    }
  }, [editingTitle])

  useEffect(() => {
    if (!currencyMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (currencyMenuRef.current && e.target instanceof Node && !currencyMenuRef.current.contains(e.target)) {
        setCurrencyMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [currencyMenuOpen])

  // ── Derived data ───────────────────────────────────────────────────────────
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId],
  )

  useEffect(() => {
    if (!selectedClient) {
      setInvoiceEmail('')
      return
    }
    const billing = String(selectedClient.billing_email || '').trim()
    const contact = String(selectedClient.email || '').trim()
    setInvoiceEmail(billing || contact || '')
  }, [selectedClient?.id, selectedClient?.billing_email, selectedClient?.email])

  // Completed-but-not-invoiced jobs for the chosen client.
  // In edit mode we also include jobs already attached to THIS draft, so
  // they show up as already-selected line items rather than disappearing.
  const clientInvoiceableJobs = useMemo(() => {
    if (selectedClientId == null) return []
    return completedJobs
      .filter((j) => j.client_id === selectedClientId)
      .filter((j) => !j.invoice_id || (isEditMode && editDraftId != null && j.invoice_id === editDraftId))
      .filter((j) => j.status === 'completed' || j.status === 'sub_completed')
  }, [completedJobs, selectedClientId, isEditMode, editDraftId])

  const selectedJobs = useMemo(
    () => clientInvoiceableJobs.filter((j) => selectedJobIds.has(j.id)),
    [clientInvoiceableJobs, selectedJobIds],
  )

  // Jobs that are still pickable in the line-items dropdown — i.e. completed
  // and uninvoiced for the chosen client and not already added.
  const availableForPicker = useMemo(
    () => clientInvoiceableJobs.filter((j) => !selectedJobIds.has(j.id)),
    [clientInvoiceableJobs, selectedJobIds],
  )

  // Filtered clients for the picker.
  const filteredClients = useMemo(() => {
    const s = clientSearch.trim().toLowerCase()
    if (!s) return clients
    return clients.filter((c) => {
      const name = clientFullName(c).toLowerCase()
      const email = (c.email || '').toLowerCase()
      const phone = (c.phone || '').toLowerCase()
      return name.includes(s) || email.includes(s) || phone.includes(s)
    })
  }, [clients, clientSearch])

  // Counts of invoiceable jobs per client (drives the picker badge).
  const invoiceableCountByClient = useMemo(() => {
    const map = new Map<number, number>()
    for (const j of completedJobs) {
      if (j.invoice_id) continue
      if (j.status !== 'completed' && j.status !== 'sub_completed') continue
      if (j.client_id == null) continue
      map.set(j.client_id, (map.get(j.client_id) || 0) + 1)
    }
    return map
  }, [completedJobs])

  const due_date = useMemo(() => {
    const d = new Date(form.issue_date)
    if (isNaN(d.getTime())) return form.issue_date
    d.setDate(d.getDate() + form.due_days)
    return d.toISOString().split('T')[0]
  }, [form.issue_date, form.due_days])

  const subtotal = useMemo(() => {
    return selectedJobs.reduce((sum, job) => {
      const discount = form.discounts[job.id] ?? 0
      const total = Number(job.total_price) || 0
      return sum + Math.max(0, total - discount)
    }, 0)
  }, [selectedJobs, form.discounts])

  const taxAmount = useMemo(() => subtotal * (form.tax_rate / 100), [subtotal, form.tax_rate])
  const total = useMemo(() => subtotal + taxAmount, [subtotal, taxAmount])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const updateUrl = useCallback(
    (next: { clientId?: number | null; jobIds?: number[] | null }) => {
      const sp = new URLSearchParams(searchParams.toString())
      if (next.clientId !== undefined) {
        if (next.clientId == null) sp.delete('clientId')
        else sp.set('clientId', String(next.clientId))
      }
      if (next.jobIds !== undefined) {
        if (!next.jobIds || next.jobIds.length === 0) sp.delete('jobIds')
        else sp.set('jobIds', next.jobIds.join(','))
      }
      const qs = sp.toString()
      router.replace(qs ? `?${qs}` : '?', { scroll: false })
    },
    [router, searchParams],
  )

  const pickClient = (id: number) => {
    setSelectedClientId(id)
    setSelectedJobIds(new Set())
    setForm((p) => ({ ...p, discounts: {} }))
    setStep('build')
    updateUrl({ clientId: id, jobIds: null })
  }

  const changeClient = () => {
    // In edit mode the client is locked: a draft belongs to one client and
    // changing that mid-edit would mean recreating the invoice.
    if (isEditMode) return
    setSelectedClientId(null)
    setSelectedJobIds(new Set())
    setForm((p) => ({ ...p, discounts: {} }))
    setStep('client')
    setClientSearch('')
    updateUrl({ clientId: null, jobIds: null })
  }

  const addJob = (id: number) => {
    setSelectedJobIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  const removeJob = useCallback((id: number) => {
    setSelectedJobIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    // Also drop any per-job discount so removing then re-adding starts clean.
    setForm((p) => {
      const key = String(id)
      if (!(key in p.discounts)) return p
      const nextDiscounts = { ...p.discounts }
      delete nextDiscounts[key]
      return { ...p, discounts: nextDiscounts }
    })
  }, [])

  const handleDiscountChange = useCallback((jobId: number, value: number) => {
    setForm((prev) => ({
      ...prev,
      discounts: { ...prev.discounts, [jobId]: Math.max(0, value) },
    }))
  }, [])

  const patchClientField = useCallback(
    async (field: keyof Client, value: string) => {
      if (!selectedClientId) return
      const trimmed = value.trim()
      const current = clients.find((c) => c.id === selectedClientId)
      const prevVal = String((current as any)?.[field] ?? '').trim()
      if (prevVal === trimmed) return

      setClientSavingField(String(field))
      // Optimistic local update
      setClients((prev) =>
        prev.map((c) => (c.id === selectedClientId ? { ...c, [field]: trimmed || null } : c)),
      )
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(apiUrl(`/clients/${selectedClientId}`), {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ [field]: trimmed || null }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          // Revert on failure
          setClients((prev) =>
            prev.map((c) => (c.id === selectedClientId ? { ...c, [field]: prevVal || null } : c)),
          )
          alert(data.error || tr('invoice.new.clientSaveFailed', 'Could not save client details'))
        } else if (data.client) {
          setClients((prev) =>
            prev.map((c) => (c.id === selectedClientId ? { ...c, ...data.client } : c)),
          )
        }
      } catch {
        setClients((prev) =>
          prev.map((c) => (c.id === selectedClientId ? { ...c, [field]: prevVal || null } : c)),
        )
        alert(tr('invoice.new.clientSaveFailed', 'Could not save client details'))
      } finally {
        setClientSavingField(null)
      }
    },
    [clients, selectedClientId, tr],
  )

  const enabledMethodsForSubmit = useMemo(
    () => paymentOptions.filter((opt) => paymentMethodOn[opt.provider]).map((opt) => opt.provider),
    [paymentOptions, paymentMethodOn],
  )

  const commitInvoiceEmail = useCallback(
    async (raw: string) => {
      if (!selectedClientId || !selectedClient) return
      const next = raw.trim()
      const billing = String(selectedClient.billing_email || '').trim()
      const contact = String(selectedClient.email || '').trim()

      if (!next) {
        setInvoiceEmail(billing || contact || '')
        return
      }

      if (billing && next !== billing) {
        const ok = window.confirm(
          tr(
            'invoice.new.updateInvoiceEmailConfirm',
            'Update the client’s invoice email to this address?',
          ),
        )
        if (!ok) {
          setInvoiceEmail(billing || contact || '')
          return
        }
        await patchClientField('billing_email', next)
        setInvoiceEmail(next)
        return
      }

      // Contact email used as default — don't create billing_email until changed.
      if (!billing && contact && next === contact) {
        setInvoiceEmail(next)
        return
      }

      if (!billing && next) {
        await patchClientField('billing_email', next)
        setInvoiceEmail(next)
      }
    },
    [selectedClient, selectedClientId, patchClientField, tr],
  )

  const buildInvoicePayload = () => ({
    job_ids: selectedJobs.map((j) => j.id),
    title: form.title.trim().slice(0, MAX_TITLE_LEN),
    issue_date: form.issue_date,
    due_date,
    due_days: form.due_days,
    tax_rate: form.tax_rate,
    currency: form.currency,
    payment_terms: form.payment_terms,
    notes: '',
    description: form.description.trim() || '',
    reference_text: form.reference_text.trim() || '',
    discounts: form.discounts,
    enabled_payment_methods: enabledMethodsForSubmit,
  })

  const persistInvoice = async (): Promise<number | null> => {
    await commitInvoiceEmail(invoiceEmail)
    const token = localStorage.getItem('token')
    const payload = buildInvoicePayload()
    const res = isEditMode
      ? await fetch(apiUrl(`/invoices/${editDraftId}`), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        })
      : await fetch(apiUrl(`/clients/${selectedClientId}/invoices`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        })
    const data = await res.json()
    const newId = data?.invoice?.id ?? editDraftId
    if (!res.ok || !newId) {
      alert(
        data.error ||
          (isEditMode
            ? tr('invoice.new.failedSaveDraft', 'Failed to save draft')
            : tr('invoice.new.failedCreate', 'Failed to create invoice')),
      )
      return null
    }
    return Number(newId)
  }

  const SEND_INVOICE_FALLBACK = {
    subject: 'Invoice {invoice_number} from {Company name}',
    message:
      'Hi {Client first name},\n\nYour invoice is ready. Open the e-invoice using the button in the email to view details and payment options.\n\nBest regards,\n{Company name}',
  }

  const applySendPlaceholders = (
    template: string,
    ctx: { invoiceNumber: string; companyName: string; clientFirstName: string },
  ) =>
    String(template || '')
      .replace(/\{invoice_number\}/g, ctx.invoiceNumber)
      .replace(/\{Company name\}/g, ctx.companyName)
      .replace(/\{Client first name\}/g, ctx.clientFirstName)

  const openSendModal = () => {
    if (!selectedClientId || selectedJobs.length === 0) return
    if (!numberingConfigured) return
    if (paymentOptions.length === 0 || enabledMethodsForSubmit.length === 0) return
    setSendConfirmStep('form')
    setSendTo(invoiceEmail.trim())
    setSendCc('')
    setSendSubject('')
    setSendBody('')
    setSendError(null)
    setSendModalOpen(true)

    const invNo = String(draftInvoiceNumber || (invoiceNextNumber != null ? invoiceNextNumber : ''))
    const companyName = String(companyProfile?.name || '')
    const first = String(selectedClient?.name || '').trim()
    const ctx = { invoiceNumber: invNo, companyName, clientFirstName: first }

    const applyTpl = (subject: string, message: string) => {
      const subj = subject.trim() || SEND_INVOICE_FALLBACK.subject
      const msg = message.trim() || SEND_INVOICE_FALLBACK.message
      setSendSubject(applySendPlaceholders(subj, ctx))
      setSendBody(applySendPlaceholders(msg, ctx))
    }

    const token = localStorage.getItem('token')
    if (!token) {
      applyTpl('', '')
      return
    }
    fetch(apiUrl('/email-templates'), { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        const si = data.templates?.send_invoice
        applyTpl(String(si?.subject || ''), String(si?.message || ''))
      })
      .catch(() => applyTpl('', ''))
  }

  const flashDraftSaved = () => {
    if (draftSavedTimerRef.current) clearTimeout(draftSavedTimerRef.current)
    setDraftSavedFlash(true)
    draftSavedTimerRef.current = setTimeout(() => setDraftSavedFlash(false), 1800)
  }

  const markSentWithoutEmail = async () => {
    setSending(true)
    setSendError(null)
    setSubmitting(true)
    try {
      const newId = await persistInvoice()
      if (!newId) return
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/invoices/${newId}/status`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'sent' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSendError(
          data.error ||
            tr('invoice.new.failedMarkSent', 'Could not mark the invoice as sent.'),
        )
        router.replace(`/${company}/invoices/new?draft=${newId}`)
        return
      }
      setSendModalOpen(false)
      router.push(`/${company}/invoices/${newId}`)
    } catch (err) {
      console.error(err)
      setSendError(tr('invoice.new.failedMarkSent', 'Could not mark the invoice as sent.'))
    } finally {
      setSending(false)
      setSubmitting(false)
    }
  }

  const confirmCreateAndSend = async () => {
    const to = sendTo.trim()
    if (!to) {
      setSendError(tr('invoice.detail.enterEmail', 'Please enter a recipient email.'))
      return
    }
    setSending(true)
    setSendError(null)
    setSubmitting(true)
    try {
      const newId = await persistInvoice()
      if (!newId) return

      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/invoices/${newId}/send`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to,
          cc: sendCc.trim() || undefined,
        }),
      })
      const text = await res.text()
      let data: { success?: boolean; error?: string } = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        setSendError(
          tr(
            'invoice.detail.failedSendEmail',
            'Failed to send email. The invoice may have been saved as a draft.',
          ),
        )
        return
      }
      if (!res.ok || !data.success) {
        setSendError(data.error || tr('invoice.detail.failedSendEmail', 'Failed to send email'))
        router.replace(`/${company}/invoices/new?draft=${newId}`)
        return
      }
      setSendModalOpen(false)
      router.push(`/${company}/invoices/${newId}`)
    } catch (err) {
      console.error(err)
      setSendError(tr('invoice.detail.failedSendEmail', 'Failed to send email'))
    } finally {
      setSending(false)
      setSubmitting(false)
    }
  }

  const saveInvoice = async (mode: 'draft' | 'preview') => {
    if (!selectedClientId || selectedJobs.length === 0) return
    if (!numberingConfigured) return
    if (paymentOptions.length === 0 || enabledMethodsForSubmit.length === 0) return
    if (mode === 'preview' && !invoiceEmail.trim()) {
      alert(tr('invoice.new.invoiceEmailRequired', 'Add an invoice email before continuing.'))
      return
    }
    setSubmitting(true)
    try {
      const newId = await persistInvoice()
      if (!newId) return
      if (mode === 'preview') {
        window.open(`/${company}/invoices/${newId}/preview`, '_blank', 'noopener,noreferrer')
        if (!isEditMode || Number(editDraftId) !== Number(newId)) {
          router.replace(`/${company}/invoices/new?draft=${newId}`)
        }
        return
      }
      flashDraftSaved()
      if (!isEditMode || Number(editDraftId) !== Number(newId)) {
        router.replace(`/${company}/invoices/new?draft=${newId}`)
      }
    } catch (err) {
      console.error(err)
      alert(
        isEditMode
          ? tr('invoice.new.failedSaveDraft', 'Failed to save draft')
          : tr('invoice.new.failedCreate', 'Failed to create invoice'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await saveInvoice('draft')
  }

  // ── Renders ────────────────────────────────────────────────────────────────
  const Stepper = () => (
    <div className="flex items-center gap-3 text-sm">
      <span
        className={`inline-flex items-center gap-2 ${
          step === 'client' ? 'text-primary-800' : 'text-gray-500'
        }`}
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
            step === 'client' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {step === 'client' ? '1' : <CheckIcon className="h-3.5 w-3.5" />}
        </span>
        <span className="font-medium">{tr('invoice.new.stepClient', 'Choose client')}</span>
      </span>
      <span className="h-px w-10 bg-gray-200" />
      <span
        className={`inline-flex items-center gap-2 ${
          step === 'build' ? 'text-primary-800' : 'text-gray-400'
        }`}
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
            step === 'build' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-400'
          }`}
        >
          2
        </span>
        <span className="font-medium">{tr('invoice.new.stepBuild', 'Build invoice')}</span>
      </span>
    </div>
  )

  // ── STEP 1: CLIENT PICKER ──────────────────────────────────────────────────
  if (step === 'client') {
    return (
      <AppLayout>
        <div className="min-h-screen bg-page">
          <div className="border-b border-gray-200/80 bg-white/80 backdrop-blur-sm">
            <div className="mx-auto max-w-[1600px] px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <Link
                  href={`/${company}/invoices`}
                  className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-primary-800"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  {tr('invoice.new.backToInvoices', 'Back to invoices')}
                </Link>
                <Stepper />
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-3xl px-6 py-10">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50">
                <UserIcon className="h-6 w-6 text-accent-600" />
              </div>
              <h1 className="text-2xl font-semibold text-primary-900">
                {tr('invoice.new.clientPickerTitle', 'Who is this invoice for?')}
              </h1>
              <p className="mt-2 text-sm text-gray-500">
                {tr(
                  'invoice.new.clientPickerHelp',
                  "Pick a client to start. You'll then choose which completed jobs to include and finish the details.",
                )}
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  ref={clientSearchRef}
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder={tr('invoice.new.searchClientPlaceholder', 'Search by name, email or phone…')}
                  className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-10 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                />
                {clientSearch && (
                  <button
                    type="button"
                    onClick={() => setClientSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="mt-4">
                {clientsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
                  </div>
                ) : clientsError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {clientsError}
                  </div>
                ) : clients.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
                    <p className="text-sm font-medium text-gray-900">
                      {tr('invoice.new.noClientsTitle', "You don't have any clients yet.")}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {tr('invoice.new.noClientsHelp', 'Add a client first, then come back here to invoice them.')}
                    </p>
                    <Link
                      href={`/${company}/clients`}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                    >
                      <PlusIcon className="h-4 w-4" />
                      {tr('invoice.new.addClient', 'Add a client')}
                    </Link>
                  </div>
                ) : filteredClients.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
                    <p className="text-sm font-medium text-gray-900">
                      {tr('invoice.new.noMatchingClients', 'No matching clients.')}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {tr('invoice.new.trySearch', 'Try a different search.')}
                    </p>
                  </div>
                ) : (
                  <ul className="max-h-[420px] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100">
                    {filteredClients.map((c) => {
                      const count = invoiceableCountByClient.get(c.id) || 0
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => pickClient(c.id)}
                            className="group flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-accent-50/60"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600 group-hover:bg-accent-100 group-hover:text-accent-700">
                                {(c.name || c.last_name || '?').slice(0, 1).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-gray-900">{clientFullName(c)}</p>
                                <p className="truncate text-xs text-gray-500">
                                  {c.email || c.phone || tr('invoice.new.noContactInfo', 'No contact info')}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {count > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-medium text-accent-800">
                                  {count}{' '}
                                  {count === 1
                                    ? tr('invoice.new.jobReadyOne', 'job ready')
                                    : tr('invoice.new.jobReadyMany', 'jobs ready')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">
                                  {tr('invoice.new.noCompletedJobs', 'No completed jobs')}
                                </span>
                              )}
                              <ArrowRightIcon className="h-4 w-4 text-gray-400 group-hover:text-accent-600" />
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  // ── STEP 2: BUILD INVOICE ──────────────────────────────────────────────────
  const isClientResolving = selectedClient == null && (clientsLoading || jobsLoading)
  const hasNoCompanyMethods = paymentLoaded && paymentOptions.length === 0
  const allMethodsOff = paymentOptions.length > 0 && enabledMethodsForSubmit.length === 0
  const canSubmit =
    !!selectedClientId &&
    selectedJobs.length > 0 &&
    !submitting &&
    defaultsLoaded &&
    paymentLoaded &&
    numberingConfigured &&
    !hasNoCompanyMethods &&
    !allMethodsOff &&
    (!isEditMode || draftHydrated)

  if (isEditMode && draftError) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <ExclamationTriangleIcon className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold text-primary-900">
            {tr('invoice.new.cannotEditTitle', "Can't edit this invoice")}
          </h1>
          <p className="mt-2 text-sm text-gray-500">{draftError}</p>
          <Link
            href={`/${company}/invoices`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            {tr('invoice.new.backToInvoices', 'Back to invoices')}
          </Link>
        </div>
      </AppLayout>
    )
  }

  if (isEditMode && !draftHydrated) {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-page">
        <div className="border-b border-gray-200/80 bg-white/80 backdrop-blur-sm">
          <div className="mx-auto max-w-5xl px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Link
                href={`/${company}/invoices`}
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-primary-800"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                {tr('invoice.new.backToInvoices', 'Back to invoices')}
              </Link>
              <Stepper />
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mx-auto max-w-6xl px-6 py-8">
          {/* Toolbar */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                {isEditMode
                  ? tr('invoice.new.editingDraft', 'Editing draft')
                  : tr('invoice.new.invoiceFor', 'Invoice for')}
              </p>
              <p className="truncate text-lg font-semibold text-primary-900">
                {isClientResolving
                  ? tr('invoice.new.loadingClient', 'Loading client…')
                  : clientFullName(selectedClient)}
              </p>
            </div>
            {!isEditMode && (
              <button
                type="button"
                onClick={changeClient}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-white hover:text-gray-900"
              >
                <PencilIcon className="h-4 w-4" />
                {tr('invoice.new.changeClient', 'Change client')}
              </button>
            )}
          </div>

          {defaultsLoaded && !numberingConfigured && (
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white text-red-600 shadow-sm">
                  <ExclamationTriangleIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-red-900">
                    {tr('invoice.new.numberingTitle', 'Choose your invoice number start first')}
                  </p>
                  <p className="mt-0.5 text-xs text-red-800/90">
                    {tr(
                      'invoice.new.numberingHelp',
                      "We won't create an invoice until you've told us where the numbering should begin. This avoids invoices accidentally starting at #1 when your previous system was already further along.",
                    )}
                  </p>
                </div>
              </div>
              <Link
                href={invoiceSettingsHref}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700"
              >
                {tr('invoice.new.setNumberStart', 'Set invoice number start')}
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr),260px]">
          {/* Single invoice document */}
          <div className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-sm">
            {/* Header: logo + date/number on top; company & client names share the same top */}
            <div className="border-b border-gray-100 px-6 py-8 sm:px-10">
              <div className="mb-6 flex items-start justify-between gap-6">
                <Link
                  href={businessSettingsHref}
                  className="group inline-flex max-w-full items-center gap-3 rounded-lg p-0.5 transition hover:bg-gray-50"
                  title={tr('invoice.new.editCompanyHint', 'Edit company details in settings')}
                >
                  {companyProfile?.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveAssetUrl(companyProfile.logoUrl) ?? companyProfile.logoUrl}
                      alt=""
                      className="h-12 w-auto max-w-[150px] object-contain"
                    />
                  ) : (
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-400 group-hover:border-accent-400 group-hover:text-accent-600">
                      <PhotoIcon className="h-5 w-5" />
                    </div>
                  )}
                </Link>

                <div className="space-y-1 text-right">
                  <input
                    type="date"
                    value={form.issue_date}
                    onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))}
                    className="ml-auto block w-full max-w-[11rem] rounded-md border-0 bg-transparent py-0.5 text-right text-sm font-medium text-gray-900 focus:outline-none focus:ring-1 focus:ring-accent-400/40"
                  />
                  <p className="text-2xl font-bold tabular-nums tracking-tight text-primary-900">
                    #{draftInvoiceNumber || (invoiceNextNumber != null ? String(invoiceNextNumber) : '—')}
                  </p>
                </div>
              </div>

              <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
                <Link
                  href={businessSettingsHref}
                  className="group block min-w-0 space-y-0.5 rounded-lg py-0 transition hover:bg-gray-50/80"
                >
                  <p className="text-base font-semibold leading-snug text-primary-900">
                    {companyProfile?.name || tr('invoice.new.yourCompany', 'Your company')}
                  </p>
                  <p className={`text-sm ${companyProfile?.address ? 'text-gray-600' : 'text-gray-300'}`}>
                    {companyProfile?.address || tr('invoice.new.missingAddress', 'Address')}
                  </p>
                  <p
                    className={`text-sm ${
                      companyProfile?.zipCode || companyProfile?.city ? 'text-gray-600' : 'text-gray-300'
                    }`}
                  >
                    {[companyProfile?.zipCode, companyProfile?.city].filter(Boolean).join(' ') ||
                      tr('invoice.new.missingCity', 'Postal code & city')}
                  </p>
                  {companyProfile?.cvrNumber ? (
                    <p className="text-sm text-gray-600">
                      {countryRule.taxLabel === 'VAT' ? 'CVR' : 'Reg. no.'} {companyProfile.cvrNumber}
                    </p>
                  ) : null}
                  {companyProfile?.vatNumber ? (
                    <p className="text-sm text-gray-600">VAT {companyProfile.vatNumber}</p>
                  ) : null}
                  <p className={`text-sm ${companyProfile?.email ? 'text-gray-600' : 'text-gray-300'}`}>
                    {companyProfile?.email || tr('invoice.new.missingEmail', 'Email')}
                  </p>
                  <p className={`text-sm ${companyProfile?.phone ? 'text-gray-600' : 'text-gray-300'}`}>
                    {companyProfile?.phone || tr('invoice.new.missingPhone', 'Phone')}
                  </p>
                </Link>

                <div className="min-w-0 text-left sm:text-right lg:ml-auto lg:max-w-xs">
                  {(() => {
                    const isCompany = String(selectedClient?.client_type || '').toLowerCase() === 'company'
                    const zipCityUsStyle = countryCode === 'US'
                    const name = isCompany
                      ? String(selectedClient?.name || '').trim()
                      : clientFullName(selectedClient)
                    const street = String(selectedClient?.address || '').trim()
                    const zip = String(selectedClient?.zip_code || '').trim()
                    const city = String(selectedClient?.city || '').trim()
                    const country = String(selectedClient?.country || '').trim()
                    const companyNo = String(selectedClient?.company_number || '').trim()
                    const ean = String(selectedClient?.ean_number || '').trim()
                    const zipCity = zipCityUsStyle
                      ? [city, zip].filter(Boolean).join(', ')
                      : [zip, city].filter(Boolean).join(', ')

                    return (
                      <div className="space-y-0.5 text-sm text-gray-600">
                        <p className="text-base font-semibold leading-snug text-gray-900">
                          {name || tr('invoice.new.unknownClient', 'Client')}
                        </p>
                        {isCompany && companyNo ? (
                          <p>
                            {countryRule.companyNumberLabel} {companyNo}
                          </p>
                        ) : null}
                        {street ? <p>{street}</p> : null}
                        {zipCity ? <p>{zipCity}</p> : null}
                        {country ? <p>{country}</p> : null}
                        {isCompany && ean ? <p>EAN {ean}</p> : null}
                        {selectedClientId != null && (
                          <Link
                            href={company ? `/${company}/clients/${selectedClientId}` : `/clients/${selectedClientId}`}
                            className="mt-2 inline-block text-[11px] font-medium text-gray-400 hover:text-gray-700"
                          >
                            {tr('invoice.new.editClientDetails', 'Edit client details')}
                          </Link>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>

            {/* Description + title */}
            <div className="space-y-5 border-b border-gray-100 px-6 py-8 sm:px-10">
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                placeholder={tr('invoice.new.descriptionPlaceholder', 'Add a short description…')}
                className="w-full resize-none rounded-md border-0 bg-transparent px-0 py-1 text-sm leading-relaxed text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-0"
              />
              {editingTitle || form.title.trim() ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  maxLength={MAX_TITLE_LEN}
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value.slice(0, MAX_TITLE_LEN) }))}
                  onBlur={() => setEditingTitle(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      e.preventDefault()
                      setEditingTitle(false)
                    }
                  }}
                  placeholder={tr('invoice.new.untitled', 'Untitled')}
                  className="w-full border-0 bg-transparent px-0 py-1 text-lg font-semibold text-gray-900 placeholder:font-normal placeholder:text-gray-300 focus:outline-none focus:ring-0"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingTitle(true)}
                  className="block text-left text-lg font-normal text-gray-300 transition hover:text-gray-400"
                >
                  {tr('invoice.new.untitled', 'Untitled')}
                </button>
              )}
            </div>

            {/* Line items */}
            <div className="px-6 py-8 sm:px-10">
              <div className="mb-6">
                <JobPicker
                  availableJobs={availableForPicker}
                  selectedCount={selectedJobs.length}
                  totalCount={clientInvoiceableJobs.length}
                  loading={jobsLoading}
                  error={jobsError}
                  currency={form.currency}
                  onAdd={addJob}
                  tr={tr}
                />
              </div>

              {jobsLoading && selectedJobs.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
                </div>
              ) : selectedJobs.length === 0 ? (
                <p className="border-t border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
                  {tr(
                    'invoice.new.noJobsAddedYet',
                    'No jobs added yet. Use the search field above to add completed jobs.',
                  )}
                </p>
              ) : (
                <div className="border-t border-gray-100">
                  <div className="hidden grid-cols-[1fr,7rem,7rem,2rem] gap-3 border-b border-gray-100 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 sm:grid">
                    <span>{tr('invoice.new.previewDescription', 'Description')}</span>
                    <span className="text-right">{tr('invoice.new.discount', 'Discount')}</span>
                    <span className="text-right">{tr('invoice.new.previewAmount', 'Amount')}</span>
                    <span />
                  </div>
                  {selectedJobs.map((job) => {
                    const discount = form.discounts[job.id] ?? 0
                    const lineTotal = Math.max(0, (Number(job.total_price) || 0) - discount)
                    return (
                      <div
                        key={job.id}
                        className="grid grid-cols-1 items-center gap-2 border-b border-gray-100 py-4 sm:grid-cols-[1fr,7rem,7rem,2rem] sm:gap-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {job.title || tr('invoice.new.untitledJob', 'Untitled job')}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {formatMoney(Number(job.total_price) || 0, form.currency)}
                            {discount > 0 ? ` − ${formatMoney(discount, form.currency)}` : ''}
                          </p>
                        </div>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={discount || ''}
                          onChange={(e) => handleDiscountChange(job.id, parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full rounded-md bg-gray-50 px-2 py-1.5 text-right text-sm tabular-nums text-gray-900 ring-1 ring-inset ring-gray-200 focus:bg-white focus:ring-2 focus:ring-accent-500/30"
                        />
                        <p className="text-right text-sm font-semibold tabular-nums text-gray-900">
                          {formatMoney(lineTotal, form.currency)}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeJob(job.id)}
                          aria-label={tr('invoice.new.removeJob', 'Remove job from invoice')}
                          className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-gray-300 hover:bg-red-50 hover:text-red-600 sm:ml-0"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Terms + payment + totals */}
            <div className="grid gap-10 px-6 py-8 sm:px-10 lg:grid-cols-[1.2fr,0.8fr] lg:gap-16">
              <div className="space-y-6">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      {tr('invoice.new.paymentTerms', 'Payment terms')}
                    </label>
                    {defaultsLoaded && !hasCompanyDefaultTerms && !form.payment_terms.trim() && (
                      <Link
                        href={invoiceSettingsHref}
                        className="text-[11px] text-gray-400 hover:text-gray-600 hover:underline"
                      >
                        {tr('invoice.new.setupStandardTerms', 'Set up standard terms')}
                      </Link>
                    )}
                  </div>
                  <textarea
                    value={form.payment_terms}
                    onChange={(e) => setForm((p) => ({ ...p, payment_terms: e.target.value }))}
                    rows={4}
                    placeholder={tr(
                      'invoice.new.paymentTermsPlaceholder',
                      'Type one-off terms here, or set a reusable template under Invoice options.',
                    )}
                    className="w-full resize-none rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-800 ring-1 ring-inset ring-gray-200 focus:bg-white focus:ring-2 focus:ring-accent-500/30"
                  />
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      {tr('invoice.new.daysUntilDue', 'Due in (days)')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={form.due_days}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          due_days: Math.max(1, parseInt(e.target.value, 10) || 14),
                        }))
                      }
                      className="w-full max-w-[8rem] rounded-md bg-gray-50 px-3 py-2 text-sm font-medium tabular-nums ring-1 ring-inset ring-gray-200 focus:bg-white focus:ring-2 focus:ring-accent-500/30"
                    />
                    <p className="mt-1.5 text-[11px] text-gray-400">
                      {tr('invoice.new.dueDateResult', 'Due date')}: {formatDate(due_date)}
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      {tr('invoice.new.paymentOptions', 'Payment option')}
                    </p>
                    {paymentLoaded && paymentOptions.length === 0 ? (
                      <Link
                        href={invoiceSettingsHref}
                        className="inline-flex text-xs font-semibold text-amber-800 underline"
                      >
                        {tr('invoice.new.setupPaymentOptions', 'Set up payment options')}
                      </Link>
                    ) : (
                      <div className="space-y-1.5">
                        {paymentOptions.map((opt) => {
                          const isOn = paymentMethodOn[opt.provider] !== false
                          const Icon = providerIconFor(opt.provider)
                          return (
                            <button
                              key={opt.provider}
                              type="button"
                              onClick={() =>
                                setPaymentMethodOn((prev) => ({
                                  ...prev,
                                  [opt.provider]: !(prev[opt.provider] !== false),
                                }))
                              }
                              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ring-1 ring-inset transition ${
                                isOn
                                  ? 'bg-accent-50 text-primary-900 ring-accent-200'
                                  : 'bg-gray-50 text-gray-500 ring-gray-200'
                              }`}
                            >
                              <Icon className="h-4 w-4 flex-shrink-0" />
                              <span className="min-w-0 flex-1 truncate font-medium">{opt.title}</span>
                              {isOn && <CheckIcon className="h-4 w-4 text-accent-600" />}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-3 pt-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>{tr('invoice.new.previewSubtotal', 'Subtotal')}</span>
                  <span className="tabular-nums">{formatMoney(subtotal, form.currency)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-gray-600">
                  <span className="flex items-center gap-2">
                    {countryRule.taxLabel}
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={form.tax_rate}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          tax_rate: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      className="w-14 rounded-md bg-transparent px-1 py-0.5 text-right text-xs tabular-nums ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-accent-500/30"
                    />
                    <span className="text-xs">%</span>
                  </span>
                  <span className="tabular-nums">{formatMoney(taxAmount, form.currency)}</span>
                </div>
                <div className="flex items-baseline justify-between border-t border-gray-200 pt-3 text-base font-semibold text-primary-900">
                  <span>{tr('invoice.new.previewTotal', 'Total')}</span>
                  <div ref={currencyMenuRef} className="relative flex items-center gap-1">
                    <span className="tabular-nums">{formatMoney(total, form.currency)}</span>
                    <button
                      type="button"
                      onClick={() => setCurrencyMenuOpen((v) => !v)}
                      className="rounded p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                      aria-label={tr('invoice.new.currency', 'Currency')}
                    >
                      <ChevronDownIcon className={`h-4 w-4 transition ${currencyMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {currencyMenuOpen && (
                      <div className="absolute right-0 top-full z-20 mt-1 min-w-[5.5rem] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                        {INVOICE_CURRENCIES.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              setForm((p) => ({ ...p, currency: c }))
                              setCurrencyMenuOpen(false)
                            }}
                            className={`block w-full px-3 py-1.5 text-left text-sm tabular-nums ${
                              form.currency === c
                                ? 'bg-accent-50 font-semibold text-primary-900'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right control / confirmation panel */}
          <aside className="lg:sticky lg:top-6 space-y-6 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-sm">
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {tr('invoice.new.actions', 'Actions')}
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={!canSubmit || submitting || sending}
                  onClick={() => void saveInvoice('draft')}
                  className={`relative flex w-full items-center gap-2 overflow-hidden rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    draftSavedFlash
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-gray-200 text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  {draftSavedFlash ? (
                    <CheckCircleSolid className="h-4 w-4 animate-pulse text-emerald-600" />
                  ) : (
                    <DocumentTextIcon className="h-4 w-4 text-gray-500" />
                  )}
                  <span
                    key={draftSavedFlash ? 'saved' : 'idle'}
                    className={draftSavedFlash ? 'animate-[fadeIn_0.25s_ease-out]' : undefined}
                  >
                    {draftSavedFlash
                      ? tr('invoice.new.draftSaved', 'Draft saved')
                      : tr('invoice.new.saveDraft', 'Save as draft')}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!canSubmit || submitting || sending}
                  onClick={openSendModal}
                  className="flex w-full items-center gap-2 rounded-lg bg-primary-500 px-3 py-2.5 text-left text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PaperAirplaneIcon className="h-4 w-4" />
                  {tr('invoice.new.send', 'Send')}
                </button>
                <button
                  type="button"
                  disabled={!canSubmit || submitting}
                  onClick={() => void saveInvoice('preview')}
                  className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-left text-sm font-medium text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <EyeIcon className="h-4 w-4 text-gray-500" />
                  {tr('invoice.new.previewAction', 'Preview')}
                </button>
              </div>
              {(() => {
                if (defaultsLoaded && !numberingConfigured) {
                  return (
                    <p className="mt-3 text-xs text-red-700">
                      {tr('invoice.new.gateNumberingNotSet', 'Set your invoice number start first.')}
                    </p>
                  )
                }
                if (hasNoCompanyMethods || allMethodsOff) {
                  return (
                    <p className="mt-3 text-xs text-amber-700">
                      {tr('invoice.new.gateNoMethods', 'Activate a payment option first.')}
                    </p>
                  )
                }
                if (selectedJobs.length === 0) {
                  return (
                    <p className="mt-3 text-xs text-gray-500">
                      {tr('invoice.new.gateNoJobs', 'Add at least one job.')}
                    </p>
                  )
                }
                return null
              })()}
            </div>

            <div className="border-t border-gray-100 pt-5">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {tr('invoice.new.information', 'Information')}
              </p>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-[11px] text-gray-400">{tr('invoice.new.infoClient', 'Client')}</dt>
                  <dd className="mt-0.5 font-medium text-gray-900">{clientFullName(selectedClient)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-gray-400">
                    {tr('invoice.new.infoInvoiceEmail', 'Invoice email')}
                  </dt>
                  <dd className="mt-1">
                    <input
                      type="email"
                      value={invoiceEmail}
                      onChange={(e) => setInvoiceEmail(e.target.value)}
                      onBlur={() => void commitInvoiceEmail(invoiceEmail)}
                      placeholder={tr('invoice.new.infoInvoiceEmailPh', 'client@email.com')}
                      className={`w-full rounded-md px-2 py-1.5 text-sm ring-1 ring-inset focus:ring-2 focus:ring-accent-500/30 ${
                        invoiceEmail.trim()
                          ? 'bg-gray-50 text-gray-900 ring-gray-200'
                          : 'bg-amber-50 text-gray-900 ring-amber-200'
                      }`}
                    />
                    {!invoiceEmail.trim() && (
                      <p className="mt-1 text-[11px] text-amber-800">
                        {tr(
                          'invoice.new.infoInvoiceEmailRequired',
                          'Required to send. Saved as the client’s invoice email.',
                        )}
                      </p>
                    )}
                    {!!selectedClient?.email &&
                      !selectedClient?.billing_email &&
                      invoiceEmail.trim() === String(selectedClient.email).trim() && (
                        <p className="mt-1 text-[11px] text-gray-400">
                          {tr(
                            'invoice.new.infoUsingContactEmail',
                            'Using contact email. Change it to set a dedicated invoice email.',
                          )}
                        </p>
                      )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-gray-400">
                    {tr('invoice.new.issueDate', 'Invoice date')}
                  </dt>
                  <dd className="mt-1">
                    <input
                      type="date"
                      value={form.issue_date}
                      onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))}
                      className="w-full rounded-md bg-gray-50 px-2 py-1.5 text-sm ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-accent-500/30"
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-gray-400">{tr('invoice.new.previewTotal', 'Total')}</dt>
                  <dd className="mt-0.5 text-base font-semibold tabular-nums text-primary-900">
                    {formatMoney(total, form.currency)}
                  </dd>
                </div>
              </dl>
            </div>
          </aside>
          </div>
        </form>
      </div>

      {sendModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            {sendConfirmStep === 'confirm' ? (
              <>
                <h2 className="text-lg font-semibold text-gray-900">
                  {tr('invoice.detail.areYouSure', 'Are you sure?')}
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  {tr(
                    'invoice.detail.sendConfirm',
                    'Once you send this invoice, there is no going back. The invoice will be marked as sent and cannot be edited. The invoice is final as is.',
                  )}
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSendConfirmStep('form')}
                    disabled={sending}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {tr('invoice.detail.goBack', 'Go back')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmCreateAndSend()}
                    disabled={sending}
                    className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                  >
                    {sending ? (
                      <>
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        {tr('invoice.detail.sending', 'Sending…')}
                      </>
                    ) : (
                      <>
                        <PaperAirplaneIcon className="h-4 w-4" />
                        {tr('invoice.detail.yesSend', 'Yes, send')}
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-gray-900">
                  {tr('invoice.detail.sendTitle', 'Send invoice to client')}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {tr(
                    'invoice.new.sendAfterCreateHelp',
                    'Creates the invoice and emails the client a link to the e-invoice. After sending you will land on the invoice page.',
                  )}
                </p>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {tr('invoice.detail.sendToLabel', 'To (email)')}
                    </label>
                    <input
                      type="email"
                      value={sendTo}
                      onChange={(e) => setSendTo(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {tr('invoice.detail.sendSubjectLabel', 'Subject (preview)')}
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={sendSubject}
                      className="mt-1 w-full cursor-default rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {tr('invoice.detail.sendBodyLabel', 'Message (preview)')}
                    </label>
                    <textarea
                      readOnly
                      value={sendBody}
                      rows={4}
                      className="mt-1 w-full cursor-default resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {tr('invoice.detail.sendCcLabel', 'CC (optional)')}
                    </label>
                    <input
                      type="email"
                      value={sendCc}
                      onChange={(e) => setSendCc(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                    />
                  </div>
                </div>
                {sendError && <p className="mt-3 text-sm text-red-600">{sendError}</p>}
                <div className="mt-6 flex flex-col gap-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSendModalOpen(false)
                        setSendConfirmStep('form')
                      }}
                      disabled={sending}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {tr('invoice.detail.cancel', 'Cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!sendTo.trim()) {
                          setSendError(tr('invoice.detail.enterEmail', 'Please enter a recipient email.'))
                          return
                        }
                        setSendError(null)
                        setSendConfirmStep('confirm')
                      }}
                      disabled={sending}
                      className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                    >
                      <PaperAirplaneIcon className="h-4 w-4" />
                      {tr('invoice.detail.continueToSend', 'Continue')}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void markSentWithoutEmail()}
                    disabled={sending}
                    className="text-center text-xs font-medium text-gray-400 transition hover:text-gray-700 disabled:opacity-50"
                  >
                    {sending
                      ? tr('invoice.detail.sending', 'Sending…')
                      : tr('invoice.new.sendMyself', 'I’ll send it myself')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  )
}

// Map provider id → icon. Falls back to a generic credit-card icon for any
// future provider we haven't added a custom icon for yet.
function providerIconFor(provider: string) {
  if (provider === 'bank_transfer') return BuildingLibraryIcon
  return CreditCardIcon
}

export default function NewInvoicePage() {
  return (
    <Suspense
      fallback={
        <AppLayout>
          <div className="flex min-h-[60vh] items-center justify-center p-6">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
          </div>
        </AppLayout>
      }
    >
      <NewInvoicePageContent />
    </Suspense>
  )
}
