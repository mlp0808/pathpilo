'use client'

import { useState, useEffect, useMemo, useCallback, Suspense, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import AppLayout from '@/app/components/AppLayout'
import { apiUrl } from '@/app/utils/api'
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
  PlusIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'

const MAX_TITLE_LEN = 30

const PAYMENT_TERMS_PLACEHOLDERS = [
  '{due_date}',
  '{overdue_days}',
  '{invoice_date}',
  '{invoice_number}',
] as const

function replacePaymentTermsPlaceholders(
  template: string,
  values: { due_date: string; overdue_days: number; invoice_date: string; invoice_number: string }
): string {
  let out = template
  out = out.replace(/\{due_date\}/g, values.due_date)
  out = out.replace(/\{overdue_days\}/g, String(values.overdue_days))
  out = out.replace(/\{invoice_date\}/g, values.invoice_date)
  out = out.replace(/\{invoice_number\}/g, values.invoice_number)
  return out
}

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
  email?: string | null
  phone?: string | null
  job_count?: number
  last_job_date?: string | null
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
  return [c.name, c.last_name].filter(Boolean).join(' ').trim() || '—'
}

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
 * Searchable combobox used inside the "Line items" section to add a completed
 * job to the invoice. Each pick adds one row; the picker stays usable until
 * every available job has been added.
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

  // Close on outside click.
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
  const disabled = loading || noJobsAtAll || allAdded || !!error

  const placeholder = (() => {
    if (loading) return tr('invoice.new.picker.loading', 'Loading completed jobs…')
    if (error) return error
    if (noJobsAtAll) return tr('invoice.new.picker.noJobs', 'No completed jobs for this client yet')
    if (allAdded) return tr('invoice.new.picker.allAdded', 'All completed jobs added to this invoice')
    return tr('invoice.new.picker.search', 'Search and add a completed job…')
  })()

  const handlePick = (jobId: number) => {
    onAdd(jobId)
    setQuery('')
    // Keep focus inside the picker so power users can add several jobs in a
    // row, but close it if they just added the last available job.
    if (availableJobs.length <= 1) {
      setOpen(false)
    } else {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
          disabled
            ? 'border-gray-200 bg-gray-50 text-gray-400'
            : open
              ? 'border-accent-500 bg-white ring-2 ring-accent-500/20'
              : 'border-gray-200 bg-white hover:border-gray-300'
        }`}
      >
        <PlusIcon className={`h-4 w-4 flex-shrink-0 ${disabled ? 'text-gray-300' : 'text-accent-600'}`} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => {
            if (!disabled) setOpen(true)
          }}
          onClick={() => {
            if (!disabled) setOpen(true)
          }}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:placeholder-gray-400"
        />
        {!disabled && (
          <ChevronDownIcon
            className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        )}
      </div>

      {open && !disabled && (
        <div className="absolute left-0 right-0 z-20 mt-2 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-gray-500">
              {tr('invoice.new.picker.noMatch', 'No completed jobs match')} &ldquo;{query}&rdquo;.
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
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent-50/60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {job.title || tr('invoice.new.untitledJob', 'Untitled job')}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                          <span>{tr('invoice.new.picker.completedOn', 'Completed')} {formatDate(completedAt)}</span>
                          {job.service_count != null && (
                            <span>
                              · {job.service_count}{' '}
                              {job.service_count === 1
                                ? tr('invoice.new.picker.taskOne', 'task')
                                : tr('invoice.new.picker.taskMany', 'tasks')}
                            </span>
                          )}
                          {job.status === 'sub_completed' && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                              {tr('invoice.new.picker.partial', 'Partial')}
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
    title: 'Invoice',
    issue_date: new Date().toISOString().split('T')[0],
    due_days: 30,
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
        const savedTerms =
          typeof d.invoiceDefaultPaymentTerms === 'string' ? d.invoiceDefaultPaymentTerms.trim() : ''
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
        }))
      })
      .catch(() => {})
      .finally(() => setDefaultsLoaded(true))
  }, [])

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
        setForm((prev) => ({
          ...prev,
          title: inv.title || prev.title,
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

  // ── Derived data ───────────────────────────────────────────────────────────
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId],
  )

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

  const enabledMethodsForSubmit = useMemo(
    () => paymentOptions.filter((opt) => paymentMethodOn[opt.provider]).map((opt) => opt.provider),
    [paymentOptions, paymentMethodOn],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClientId || selectedJobs.length === 0) return
    if (!numberingConfigured) return
    if (paymentOptions.length === 0 || enabledMethodsForSubmit.length === 0) return
    setSubmitting(true)
    try {
      const token = localStorage.getItem('token')
      const payload = {
        job_ids: selectedJobs.map((j) => j.id),
        title: form.title.slice(0, MAX_TITLE_LEN),
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
      }
      // Edit mode → PUT against the existing draft. Create mode → POST.
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
      if (res.ok && newId) {
        router.push(`/${company}/invoices/${newId}`)
      } else {
        alert(
          data.error ||
            (isEditMode
              ? tr('invoice.new.failedSaveDraft', 'Failed to save draft')
              : tr('invoice.new.failedCreate', 'Failed to create invoice')),
        )
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

        <form onSubmit={handleSubmit} className="mx-auto max-w-[1600px] px-6 py-8">
          {/* Selected-client banner */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent-200 bg-accent-50/60 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-semibold text-accent-700 shadow-sm">
                {(selectedClient?.name || selectedClient?.last_name || '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-accent-700">
                  {tr('invoice.new.invoiceFor', 'Invoice for')}
                </p>
                <p className="truncate text-base font-semibold text-primary-900">
                  {isClientResolving ? tr('invoice.new.loadingClient', 'Loading client…') : clientFullName(selectedClient)}
                </p>
              </div>
            </div>
            {isEditMode ? (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/80 px-3 py-1.5 text-xs font-medium text-accent-700 ring-1 ring-accent-200">
                {tr('invoice.new.editingDraft', 'Editing draft')}
              </span>
            ) : (
              <button
                type="button"
                onClick={changeClient}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50"
              >
                <PencilIcon className="h-4 w-4" />
                {tr('invoice.new.changeClient', 'Change client')}
              </button>
            )}
          </div>

          {/* Hard gate: invoice numbering must be configured before any
              invoice can be issued. We surface this loud and early because
              once a #1 invoice goes out the door, fixing it is messy. */}
          {defaultsLoaded && !numberingConfigured && (
            <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
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
                href={`/${company}/settings/invoice-options`}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700"
              >
                {tr('invoice.new.setNumberStart', 'Set invoice number start')}
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr,420px]">
            {/* Left column */}
            <div className="space-y-6">
              {/* Invoice details */}
              <section className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                  <DocumentTextIcon className="h-4 w-4 text-accent-500" />
                  {tr('invoice.new.invoiceDetails', 'Invoice details')}
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      {tr('invoice.new.titleLabel', 'Title')}
                    </label>
                    <input
                      type="text"
                      maxLength={MAX_TITLE_LEN}
                      value={form.title}
                      onChange={(e) => setForm((p) => ({ ...p, title: e.target.value.slice(0, MAX_TITLE_LEN) }))}
                      className="input-field w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                      placeholder={tr('invoice.new.titlePlaceholder', 'Invoice')}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      {form.title.length}/{MAX_TITLE_LEN}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        {tr('invoice.new.issueDate', 'Issue date')}
                      </label>
                      <input
                        type="date"
                        value={form.issue_date}
                        onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))}
                        className="input-field w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        {tr('invoice.new.daysUntilDue', 'Days until due')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={form.due_days}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            due_days: Math.max(1, parseInt(e.target.value, 10) || 30),
                          }))
                        }
                        className="input-field w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      {tr('invoice.new.descriptionLabel', 'Description (on invoice, above table)')}
                    </label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                      rows={3}
                      className="input-field w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                      placeholder={tr(
                        'invoice.new.descriptionPlaceholder',
                        'Optional description shown on the invoice above the line items...',
                      )}
                    />
                  </div>
                  {/* Reference / PO input intentionally hidden for now. The
                      column and API plumbing are still in place, so we can flip
                      this back on any time without a migration. */}
                </div>
              </section>

              {/* Line items & discounts */}
              <section className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                    {tr('invoice.new.lineItems', 'Line items & discounts')}
                  </h2>
                  <span className="text-xs text-gray-500">
                    {tr('invoice.new.xOfYAdded', '{x} of {y} added')
                      .replace('{x}', String(selectedJobs.length))
                      .replace('{y}', String(clientInvoiceableJobs.length))}
                  </span>
                </div>

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

                {jobsLoading && selectedJobs.length === 0 ? (
                  <div className="mt-4 flex items-center justify-center py-8">
                    <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
                  </div>
                ) : !jobsLoading && clientInvoiceableJobs.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-8 text-center">
                    <p className="text-sm font-medium text-gray-900">
                      {tr('invoice.new.noInvoiceableJobs', 'No completed, un-invoiced jobs for this client.')}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {tr(
                        'invoice.new.noInvoiceableJobsHelp',
                        'Mark a job as completed first, or pick another client.',
                      )}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={changeClient}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <PencilIcon className="h-4 w-4" />
                        {tr('invoice.new.changeClient', 'Change client')}
                      </button>
                      <Link
                        href={`/${company}/jobs/completed`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
                      >
                        <DocumentTextIcon className="h-4 w-4" />
                        {tr('invoice.new.goToCompleted', 'Go to Completed')}
                      </Link>
                    </div>
                  </div>
                ) : selectedJobs.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/40 px-4 py-6 text-center text-xs text-gray-500">
                    {tr(
                      'invoice.new.noJobsAddedYet',
                      'No jobs added yet. Use the dropdown above to add completed jobs to this invoice.',
                    )}
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {selectedJobs.map((job) => {
                      const discount = form.discounts[job.id] ?? 0
                      const lineTotal = Math.max(0, (Number(job.total_price) || 0) - discount)
                      return (
                        <div
                          key={job.id}
                          className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-100 bg-gray-50/50 p-4"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-gray-900">
                              {job.title || tr('invoice.new.untitledJob', 'Untitled job')}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatMoney(Number(job.total_price) || 0, form.currency)}{' '}
                              {tr('invoice.new.beforeDiscount', 'before discount')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-gray-500">
                              {tr('invoice.new.discount', 'Discount')}
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={discount || ''}
                              onChange={(e) => handleDiscountChange(job.id, parseFloat(e.target.value) || 0)}
                              className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                            />
                          </div>
                          <p className="w-28 text-right text-sm font-semibold text-gray-900">
                            {formatMoney(lineTotal, form.currency)}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeJob(job.id)}
                            aria-label={tr('invoice.new.removeJob', 'Remove job from invoice')}
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-transparent text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* Payment */}
              <section className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
                  {tr('invoice.new.paymentSection', 'Payment')}
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      {tr('invoice.new.paymentTerms', 'Payment terms')}
                    </label>

                    {/* Empty-state CTA: only show once we know the company has no
                        saved default AND the user hasn't typed anything yet. */}
                    {defaultsLoaded && !hasCompanyDefaultTerms && !form.payment_terms.trim() && (
                      <div className="mb-3 flex flex-col gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-amber-900">
                          <p className="font-medium">
                            {tr('invoice.new.noStandardTermsTitle', 'No standard payment terms saved yet.')}
                          </p>
                          <p className="mt-0.5 text-xs text-amber-800/90">
                            {tr(
                              'invoice.new.noStandardTermsHelp',
                              'Save a template once and it will be filled in automatically every time you create an invoice.',
                            )}
                          </p>
                        </div>
                        <Link
                          href={`/${company}/settings/invoice-options`}
                          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm hover:bg-amber-100"
                        >
                          {tr('invoice.new.setupStandardTerms', 'Set up standard terms')}
                          <ArrowRightIcon className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    )}

                    <textarea
                      value={form.payment_terms}
                      onChange={(e) => setForm((p) => ({ ...p, payment_terms: e.target.value }))}
                      rows={6}
                      className="input-field w-full rounded-xl border border-gray-200 px-4 py-2.5 font-mono text-sm focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                      placeholder={tr(
                        'invoice.new.paymentTermsPlaceholder',
                        'Type one-off terms here, or set a reusable template under Invoice options.',
                      )}
                    />
                    <p className="mt-1.5 text-xs text-gray-500">
                      {tr('invoice.new.placeholders', 'Placeholders:')} {PAYMENT_TERMS_PLACEHOLDERS.join(', ')}
                    </p>
                  </div>
                </div>
              </section>

              {/* Payment options: snapshot for THIS invoice. Defaults to ON
                  for every method active at company level. */}
              <section className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                      <CreditCardIcon className="h-4 w-4 text-accent-500" />
                      {tr('invoice.new.paymentOptions', 'Payment options')}
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                      {tr(
                        'invoice.new.paymentOptionsHelp',
                        "These show up on the invoice you send. Turn one off here if you don't want to offer it for this specific invoice.",
                      )}
                    </p>
                  </div>
                </div>

                {/* Empty state: company has no active methods at all → CTA
                    to settings, just like the payment-terms one above. */}
                {paymentLoaded && paymentOptions.length === 0 ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-amber-900">
                      <p className="font-medium">
                        {tr('invoice.new.noPaymentOptionsTitle', 'No payment options active yet.')}
                      </p>
                      <p className="mt-0.5 text-xs text-amber-800/90">
                        {tr(
                          'invoice.new.noPaymentOptionsHelp',
                          "Activate at least one (e.g. bank transfer) so clients know how to pay you. You can't create an invoice without one.",
                        )}
                      </p>
                    </div>
                    <Link
                      href={`/${company}/settings/invoice-options`}
                      className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm hover:bg-amber-100"
                    >
                      {tr('invoice.new.setupPaymentOptions', 'Set up payment options')}
                      <ArrowRightIcon className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : !paymentLoaded ? (
                  <div className="flex justify-center py-6">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
                  </div>
                ) : paymentError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {paymentError}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {paymentOptions.map((opt) => {
                      const isOn = paymentMethodOn[opt.provider] !== false
                      const Icon = providerIconFor(opt.provider)
                      return (
                        <div
                          key={opt.provider}
                          className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                            isOn
                              ? 'border-accent-200 bg-accent-50/40'
                              : 'border-gray-200 bg-gray-50/60'
                          }`}
                        >
                          <div
                            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                              isOn ? 'bg-white text-accent-600' : 'bg-white text-gray-400'
                            }`}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-sm font-semibold ${
                                isOn ? 'text-gray-900' : 'text-gray-500'
                              }`}
                            >
                              {opt.title}
                            </p>
                            {opt.description && (
                              <p className="text-xs text-gray-500 line-clamp-1">{opt.description}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setPaymentMethodOn((prev) => ({
                                ...prev,
                                [opt.provider]: !(prev[opt.provider] !== false),
                              }))
                            }
                            aria-pressed={isOn}
                            aria-label={
                              isOn
                                ? `${tr('invoice.new.turnOff', 'Turn off')} ${opt.title}`
                                : `${tr('invoice.new.turnOn', 'Turn on')} ${opt.title}`
                            }
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full p-0.5 transition-colors ${
                              isOn ? 'bg-accent-500' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                isOn ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      )
                    })}

                    {/* Inline guard: if the admin manually turned every
                        method off we surface the consequence right here so
                        they don't get a confusing disabled submit button. */}
                    {allMethodsOff && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <ExclamationTriangleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>
                          {tr(
                            'invoice.new.allMethodsOffWarn',
                            "You've turned off every payment option. Turn at least one back on, or this invoice has no way for the client to pay.",
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <div className="flex flex-wrap items-center justify-end gap-3">
                {(() => {
                  // Order matters: numbering is the loudest blocker, then
                  // missing methods, then no jobs picked. Show the most
                  // important reason only.
                  if (defaultsLoaded && !numberingConfigured) {
                    return (
                      <p className="text-sm text-red-700">
                        {tr(
                          'invoice.new.gateNumberingNotSet',
                          'Set your invoice number start before creating the invoice.',
                        )}
                      </p>
                    )
                  }
                  if (hasNoCompanyMethods) {
                    return (
                      <p className="text-sm text-amber-700">
                        {tr(
                          'invoice.new.gateNoMethods',
                          'Activate a payment option to enable invoice creation.',
                        )}
                      </p>
                    )
                  }
                  if (allMethodsOff) {
                    return (
                      <p className="text-sm text-amber-700">
                        {tr(
                          'invoice.new.gateAllMethodsOff',
                          'Turn at least one payment option on for this invoice.',
                        )}
                      </p>
                    )
                  }
                  if (selectedJobs.length === 0) {
                    return (
                      <p className="text-sm text-gray-500">
                        {tr('invoice.new.gateNoJobs', 'Pick at least one job to enable invoice creation.')}
                      </p>
                    )
                  }
                  return null
                })()}
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="btn-primary inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      {isEditMode
                        ? tr('invoice.new.saving', 'Saving…')
                        : tr('invoice.new.creating', 'Creating…')}
                    </>
                  ) : (
                    <>
                      <DocumentTextIcon className="h-5 w-5" />
                      {isEditMode
                        ? tr('invoice.new.saveDraft', 'Save draft')
                        : tr('invoice.new.createInvoice', 'Create invoice')}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right column: Preview */}
            <div className="lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-lg">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {tr('invoice.new.preview', 'Preview')}
                </p>
                <div className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50/30">
                  <div className="border-b border-gray-200/80 bg-white px-5 py-4">
                    <h3 className="text-lg font-bold tracking-tight text-primary-800">
                      {tr('invoice.new.previewInvoice', 'INVOICE')}
                    </h3>
                    {form.title && <p className="mt-0.5 text-sm text-gray-600">{form.title.slice(0, MAX_TITLE_LEN)}</p>}
                    <div className="mt-3 flex flex-wrap gap-4 text-xs">
                      <div>
                        <span className="text-gray-500">{tr('invoice.new.previewInvoiceDate', 'Invoice date')}</span>
                        <p className="font-medium text-gray-900">{formatDate(form.issue_date)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">{tr('invoice.new.previewDueDate', 'Due date')}</span>
                        <p className="font-medium text-gray-900">{formatDate(due_date)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="border-b border-gray-200/80 bg-white px-5 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {tr('invoice.new.previewBillTo', 'Bill to')}
                    </p>
                    <p className="mt-1 font-medium text-gray-900">{clientFullName(selectedClient)}</p>
                  </div>
                  {form.description.trim() && (
                    <div className="border-b border-gray-200/80 bg-white px-5 py-3">
                      <p className="whitespace-pre-wrap text-sm text-gray-600">{form.description.trim()}</p>
                    </div>
                  )}
                  <div className="border-b border-gray-200/80 bg-white">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/80">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">
                            {tr('invoice.new.previewDescription', 'Description')}
                          </th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">
                            {tr('invoice.new.previewAmount', 'Amount')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedJobs.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="px-4 py-6 text-center text-xs text-gray-400">
                              {tr('invoice.new.previewEmpty', 'Select jobs to see them here.')}
                            </td>
                          </tr>
                        ) : (
                          selectedJobs.map((job) => {
                            const discount = form.discounts[job.id] ?? 0
                            const lineTotal = Math.max(0, (Number(job.total_price) || 0) - discount)
                            return (
                              <tr key={job.id} className="border-b border-gray-100">
                                <td className="px-4 py-2.5 text-gray-900">
                                  <span>{job.title || tr('invoice.new.untitledJob', 'Untitled job')}</span>
                                </td>
                                <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                                  {formatMoney(lineTotal, form.currency)}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-white px-5 py-4">
                    <div className="ml-auto w-48 space-y-1.5 text-sm">
                      <div className="flex justify-between text-gray-600">
                        <span>{tr('invoice.new.previewSubtotal', 'Subtotal')}</span>
                        <span>{formatMoney(subtotal, form.currency)}</span>
                      </div>
                      {form.tax_rate > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span>
                            {countryRule.taxLabel} ({form.tax_rate}%)
                          </span>
                          <span>{formatMoney(taxAmount, form.currency)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold text-gray-900">
                        <span>{tr('invoice.new.previewTotal', 'Total')}</span>
                        <span>{formatMoney(total, form.currency)}</span>
                      </div>
                    </div>
                    {form.payment_terms && (
                      <div className="mt-3 whitespace-pre-wrap text-xs text-gray-600">
                        {replacePaymentTermsPlaceholders(form.payment_terms, {
                          due_date: formatDate(due_date),
                          overdue_days: form.due_days,
                          invoice_date: formatDate(form.issue_date),
                          invoice_number: '[Invoice number]',
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {selectedJobs.length > 0 && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl bg-accent-50 px-3 py-2 text-xs text-accent-800">
                    <CheckCircleSolid className="h-4 w-4" />
                    {selectedJobs.length}{' '}
                    {selectedJobs.length === 1
                      ? tr('invoice.new.jobReadyOne', 'job ready')
                      : tr('invoice.new.jobReadyMany', 'jobs ready')}
                    {' '}
                    · {formatMoney(total, form.currency)} {tr('invoice.new.previewTotal', 'Total').toLowerCase()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
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
