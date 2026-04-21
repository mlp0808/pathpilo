'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppI18n } from '../../components/I18nProvider'
import { apiUrl } from '../../utils/api'
import {
  HashtagIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
  CreditCardIcon,
  BuildingLibraryIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type InvoiceDefaults = {
  invoiceDefaultDueDays: number
  invoiceDefaultPaymentTerms: string
  invoiceNextNumber: number
  maxNumericInvoice: number
  invoiceNumberingConfigured: boolean
}

interface PaymentConfig {
  accountHolder?: string
  iban?: string
  accountNumber?: string
  registrationNumber?: string
  // Future providers can add their own fields freely.
  [key: string]: unknown
}

interface PaymentOption {
  provider: string
  title: string
  description: string
  enabled: boolean
  capabilities: string[]
  config: PaymentConfig
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function InvoiceOptionsPage() {
  const { t } = useAppI18n()

  // ── Invoice defaults (numbering + due days + payment terms) ───────────────
  const [defaultsLoading, setDefaultsLoading] = useState(true)
  const [defaultsSaving, setDefaultsSaving] = useState(false)
  const [defaultsError, setDefaultsError] = useState('')
  const [defaultsSaved, setDefaultsSaved] = useState(false)
  const [form, setForm] = useState<InvoiceDefaults>({
    invoiceDefaultDueDays: 30,
    invoiceDefaultPaymentTerms: '',
    invoiceNextNumber: 1,
    maxNumericInvoice: 0,
    invoiceNumberingConfigured: false,
  })

  // ── Payment options ───────────────────────────────────────────────────────
  const [paymentLoading, setPaymentLoading] = useState(true)
  const [paymentError, setPaymentError] = useState('')
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([])

  const loadDefaults = useCallback(async () => {
    setDefaultsError('')
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setDefaultsError('Not signed in')
        setDefaultsLoading(false)
        return
      }
      const res = await fetch(apiUrl('/companies/invoice-defaults'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        setDefaultsError(data.error || 'Failed to load invoice defaults')
        setDefaultsLoading(false)
        return
      }
      if (data.defaults) {
        const nextNumber = data.defaults.invoiceNextNumber ?? 1
        const maxIssued = data.defaults.maxNumericInvoice ?? 0
        // Treat numbering as configured if reality says so, regardless of
        // what the boolean flag column claims. A saved next-number > 1 or
        // any already-issued invoice both mean somebody has clearly set
        // this up — even if a legacy save never wrote the flag column.
        // Only fall back to the explicit boolean when reality is silent.
        const realityConfigured = Number(nextNumber) > 1 || Number(maxIssued) > 0
        const configured =
          realityConfigured
            ? true
            : typeof data.defaults.invoiceNumberingConfigured === 'boolean'
              ? data.defaults.invoiceNumberingConfigured
              : false
        setForm({
          invoiceDefaultDueDays: data.defaults.invoiceDefaultDueDays ?? 30,
          invoiceDefaultPaymentTerms: data.defaults.invoiceDefaultPaymentTerms ?? '',
          invoiceNextNumber: nextNumber,
          maxNumericInvoice: maxIssued,
          invoiceNumberingConfigured: configured,
        })
      }
    } catch {
      setDefaultsError('Network error')
    } finally {
      setDefaultsLoading(false)
    }
  }, [])

  const loadPaymentOptions = useCallback(async () => {
    setPaymentError('')
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setPaymentLoading(false)
        return
      }
      const res = await fetch(apiUrl('/integrations'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        setPaymentError(data.error || 'Failed to load payment options')
        setPaymentLoading(false)
        return
      }
      const all: PaymentOption[] = Array.isArray(data.integrations) ? data.integrations : []
      // Only invoice-payment providers belong on this page. Anything else
      // (zapier, accounting integrations, etc.) stays in Extensions.
      const filtered = all.filter((opt) =>
        Array.isArray(opt.capabilities) && opt.capabilities.includes('invoice_payment')
      )
      setPaymentOptions(filtered)
    } catch {
      setPaymentError('Network error')
    } finally {
      setPaymentLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDefaults()
    loadPaymentOptions()
  }, [loadDefaults, loadPaymentOptions])

  // ── Save invoice defaults (numbering + due days + payment terms) ──────────
  const handleSaveDefaults = async (e: React.FormEvent) => {
    e.preventDefault()
    setDefaultsSaving(true)
    setDefaultsError('')
    setDefaultsSaved(false)
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const res = await fetch(apiUrl('/companies/invoice-defaults'), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoiceDefaultDueDays: form.invoiceDefaultDueDays,
          invoiceDefaultPaymentTerms: form.invoiceDefaultPaymentTerms,
          invoiceNextNumber: form.invoiceNextNumber,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDefaultsError(data.error || 'Failed to save')
        return
      }
      if (data.defaults) {
        setForm((prev) => ({
          ...prev,
          ...data.defaults,
          // Defensive: a successful PUT that included a starting number
          // means the server has now locked it in. Force the local flag to
          // true even if the API response doesn't echo it back (older API
          // builds returned the old shape and this UI would then keep
          // showing the red "Action needed" callout indefinitely).
          invoiceNumberingConfigured: true,
        }))
      } else {
        setForm((prev) => ({ ...prev, invoiceNumberingConfigured: true }))
      }
      setDefaultsSaved(true)
      setTimeout(() => setDefaultsSaved(false), 3500)
    } catch {
      setDefaultsError('Network error')
    } finally {
      setDefaultsSaving(false)
    }
  }

  // ── Update a single payment option ────────────────────────────────────────
  const updatePaymentOption = (provider: string, patch: Partial<PaymentOption>) => {
    setPaymentOptions((prev) =>
      prev.map((opt) => (opt.provider === provider ? { ...opt, ...patch } : opt)),
    )
  }

  if (defaultsLoading) {
    return (
      <div className="p-6 flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {t('settings.invoiceOptions.title', 'Invoice options')}
          </h1>
          <p className="text-gray-600 mt-2 text-sm">
            {t(
              'settings.invoiceOptions.intro',
              'Everything that controls the invoices you send to clients — numbering, defaults, and how they pay you.',
            )}
          </p>
        </header>

        {defaultsError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {defaultsError}
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────────── */}
        {/* Section 1 + 2: Invoice numbering + defaults — share one Save     */}
        {/* button because they all hit /companies/invoice-defaults.         */}
        {/* ───────────────────────────────────────────────────────────────── */}
        <form onSubmit={handleSaveDefaults} className="space-y-6">
          <SectionCard
            icon={<HashtagIcon className="h-5 w-5" />}
            title={t('settings.invoiceOptions.numbering.title', 'Invoice number start')}
            subtitle={t(
              'settings.invoiceOptions.numbering.subtitle',
              'Set the first invoice number. Following invoices keep counting up from there.',
            )}
            badge={
              form.invoiceNumberingConfigured
                ? null
                : {
                    label: t('settings.invoiceOptions.numbering.actionNeeded', 'Action needed'),
                    tone: 'warn' as const,
                  }
            }
          >
            {!form.invoiceNumberingConfigured && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                <ExclamationTriangleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  {t(
                    'settings.invoiceOptions.numbering.required',
                    'You must save a starting invoice number before any invoice can be created. If you\u2019re moving from another system, set it just above your current highest invoice number.',
                  )}
                </span>
              </div>
            )}
            {form.maxNumericInvoice > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <ExclamationTriangleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  {t(
                    'settings.invoiceOptions.numbering.warn',
                    `Highest invoice number already in use: ${form.maxNumericInvoice}. The next number must not collide with an existing one.`,
                  )}
                </span>
              </div>
            )}
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500 mb-1">
              {t('settings.invoiceOptions.numbering.next', 'Next invoice number')}
            </label>
            <input
              type="number"
              min={1}
              value={form.invoiceNextNumber}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  invoiceNextNumber: Math.max(1, parseInt(e.target.value, 10) || 1),
                }))
              }
              className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
            />
          </SectionCard>

          <SectionCard
            icon={<CalendarDaysIcon className="h-5 w-5" />}
            title={t('settings.invoiceOptions.due.title', 'Default due day')}
            subtitle={t(
              'settings.invoiceOptions.due.subtitle',
              'How many days clients have to pay, counted from the invoice date.',
            )}
          >
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500 mb-1">
              {t('settings.invoiceOptions.due.label', 'Days after invoice date')}
            </label>
            <input
              type="number"
              min={1}
              max={3650}
              value={form.invoiceDefaultDueDays}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  invoiceDefaultDueDays: parseInt(e.target.value, 10) || 30,
                }))
              }
              className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
            />
          </SectionCard>

          <SectionCard
            icon={<DocumentTextIcon className="h-5 w-5" />}
            title={t('settings.invoiceOptions.terms.title', 'Default payment terms')}
            subtitle={t(
              'settings.invoiceOptions.terms.subtitle',
              'Reusable text shown on every invoice. You can still override it per invoice.',
            )}
          >
            <p className="text-xs text-gray-500 mb-2">
              {t('settings.invoiceOptions.terms.placeholdersHint', 'You can use the placeholders')}{' '}
              <code className="bg-gray-100 px-1 rounded">{'{due_date}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{invoice_date}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{invoice_number}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{overdue_days}'}</code>.
            </p>
            <textarea
              value={form.invoiceDefaultPaymentTerms}
              onChange={(e) =>
                setForm((f) => ({ ...f, invoiceDefaultPaymentTerms: e.target.value }))
              }
              rows={7}
              placeholder={t(
                'settings.invoiceOptions.terms.placeholder',
                'e.g. Payment due within {due_date}. After the due date, interest of 1% per month will be charged.',
              )}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
            />
          </SectionCard>

          {/* ─────────────────────────────────────────────────────────────── */}
          {/* Section 4: Payment options — kept inside the form so the Save  */}
          {/* button visually anchors the whole page. The per-card buttons   */}
          {/* are type="button" and hit /integrations/:provider/config       */}
          {/* directly, so they're independent of this submit.               */}
          {/* ─────────────────────────────────────────────────────────────── */}
          <SectionCard
            icon={<CreditCardIcon className="h-5 w-5" />}
            title={t('settings.invoiceOptions.payment.title', 'Payment options')}
            subtitle={t(
              'settings.invoiceOptions.payment.subtitle',
              'Choose how clients can pay. Active options show on every invoice.',
            )}
          >
            {paymentError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {paymentError}
              </div>
            )}
            {paymentLoading ? (
              <div className="flex justify-center py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
              </div>
            ) : paymentOptions.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                {t(
                  'settings.invoiceOptions.payment.empty',
                  'No payment options available yet.',
                )}
              </p>
            ) : (
              <div className="space-y-3">
                {paymentOptions.map((opt) => (
                  <PaymentOptionCard
                    key={opt.provider}
                    option={opt}
                    onChange={(patch) => updatePaymentOption(opt.provider, patch)}
                    t={t}
                  />
                ))}
              </div>
            )}
          </SectionCard>

          <div className="flex items-center justify-end gap-3 pt-1">
            {defaultsSaved && (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
                <CheckCircleIcon className="h-4 w-4" />
                {t('settings.invoiceOptions.saved', 'Saved')}
              </span>
            )}
            <button
              type="submit"
              disabled={defaultsSaving}
              className="inline-flex items-center rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-accent-700 disabled:opacity-50"
            >
              {defaultsSaving
                ? t('app.common.saving', 'Saving…')
                : t('settings.invoiceOptions.save', 'Save invoice settings')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionCard — shared chrome for each numbered section
// ─────────────────────────────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  subtitle,
  badge,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  badge?: { label: string; tone: 'warn' | 'info' } | null
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      <header className="flex items-start gap-3 px-6 pt-5 pb-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-600">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900 leading-tight">{title}</h2>
            {badge && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  badge.tone === 'warn'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-accent-100 text-accent-800'
                }`}
              >
                {badge.tone === 'warn' && <ExclamationTriangleIcon className="h-3 w-3" />}
                {badge.label}
              </span>
            )}
          </div>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </header>
      <div className="px-6 pb-6 pt-1">{children}</div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PaymentOptionCard — a single payment provider, with toggle + inline config
// ─────────────────────────────────────────────────────────────────────────────

function PaymentOptionCard({
  option,
  onChange,
  t,
}: {
  option: PaymentOption
  onChange: (patch: Partial<PaymentOption>) => void
  t: (key: string, fallback: string) => string
}) {
  const [draftEnabled, setDraftEnabled] = useState<boolean>(option.enabled)
  const [draftConfig, setDraftConfig] = useState<PaymentConfig>(option.config || {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [expanded, setExpanded] = useState<boolean>(option.enabled)

  // Re-sync if the parent reloads the option from the server.
  useEffect(() => {
    setDraftEnabled(option.enabled)
    setDraftConfig(option.config || {})
  }, [option.provider, option.enabled, option.config])

  const isBankTransfer = option.provider === 'bank_transfer'

  const canEnable = useMemo(() => {
    if (!isBankTransfer) return true
    return Boolean(
      String(draftConfig.accountHolder || '').trim() && String(draftConfig.iban || '').trim(),
    )
  }, [isBankTransfer, draftConfig])

  const dirty = useMemo(() => {
    if (draftEnabled !== option.enabled) return true
    const a = JSON.stringify(option.config || {})
    const b = JSON.stringify(draftConfig || {})
    return a !== b
  }, [draftEnabled, option.enabled, option.config, draftConfig])

  const handleToggle = (next: boolean) => {
    setDraftEnabled(next)
    if (next && !expanded) setExpanded(true)
  }

  const handleSave = async () => {
    if (draftEnabled && !canEnable) {
      setError(t('settings.invoiceOptions.payment.fillToActivateError', 'Fill account holder and IBAN before activating.'))
      return
    }
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/integrations/${option.provider}/config`), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: draftEnabled,
          config: draftConfig,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('settings.invoiceOptions.payment.failedSave', 'Failed to save'))
        return
      }
      onChange({
        enabled: data.integration.enabled,
        config: data.integration.config || {},
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError(t('settings.invoiceOptions.payment.networkError', 'Network error'))
    } finally {
      setSaving(false)
    }
  }

  const ProviderIcon = providerIconFor(option.provider)

  return (
    <div
      className={`rounded-xl border transition-colors ${
        draftEnabled
          ? 'border-accent-200 bg-accent-50/30'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
            draftEnabled ? 'bg-white text-accent-600' : 'bg-gray-100 text-gray-500'
          }`}
        >
          <ProviderIcon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{option.title}</p>
          <p className="text-xs text-gray-500 line-clamp-1">{option.description}</p>
        </div>

        {/* Toggle */}
        <button
          type="button"
          onClick={() => handleToggle(!draftEnabled)}
          aria-pressed={draftEnabled}
          aria-label={draftEnabled ? t('settings.invoiceOptions.payment.disable', 'Disable') : t('settings.invoiceOptions.payment.enable', 'Enable')}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full p-0.5 transition-colors ${
            draftEnabled ? 'bg-accent-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              draftEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>

        {/* Configure / collapse button */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          <Cog6ToothIcon className="h-3.5 w-3.5" />
          {expanded ? t('settings.invoiceOptions.payment.hide', 'Hide') : t('settings.invoiceOptions.payment.setup', 'Setup')}
        </button>
      </div>

      {/* Expanded config */}
      {expanded && (
        <div className="border-t border-gray-200/70 px-4 py-4 space-y-4">
          {isBankTransfer && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label={t('settings.invoiceOptions.payment.accountHolder', 'Account holder')}
                required
                value={String(draftConfig.accountHolder || '')}
                onChange={(v) => setDraftConfig((prev) => ({ ...prev, accountHolder: v }))}
              />
              <Field
                label={t('settings.invoiceOptions.payment.iban', 'IBAN')}
                required
                value={String(draftConfig.iban || '')}
                onChange={(v) => setDraftConfig((prev) => ({ ...prev, iban: v }))}
              />
              <Field
                label={t('settings.invoiceOptions.payment.regNumber', 'Registration number')}
                value={String(draftConfig.registrationNumber || '')}
                onChange={(v) =>
                  setDraftConfig((prev) => ({ ...prev, registrationNumber: v }))
                }
              />
              <Field
                label={t('settings.invoiceOptions.payment.accountNumber', 'Account number')}
                value={String(draftConfig.accountNumber || '')}
                onChange={(v) => setDraftConfig((prev) => ({ ...prev, accountNumber: v }))}
              />
            </div>
          )}

          {draftEnabled && !canEnable && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t('settings.invoiceOptions.payment.fillToActivate', 'Fill account holder and IBAN to activate.')}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                <CheckCircleIcon className="h-4 w-4" />
                {t('settings.invoiceOptions.payment.saved', 'Saved')}
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="inline-flex items-center rounded-lg bg-accent-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? t('settings.invoiceOptions.payment.saving', 'Saving…') : dirty ? t('settings.invoiceOptions.payment.saveChanges', 'Save changes') : t('settings.invoiceOptions.payment.upToDate', 'Up to date')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
      />
    </label>
  )
}

// Map providers to icons. Defaults to a generic credit-card icon.
function providerIconFor(provider: string) {
  if (provider === 'bank_transfer') return BuildingLibraryIcon
  return CreditCardIcon
}
