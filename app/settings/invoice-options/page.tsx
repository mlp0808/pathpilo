'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAppI18n } from '../../components/I18nProvider'
import { apiUrl } from '../../utils/api'
import { useCompanyCountryCode } from '../../hooks/useCompanyCountryCode'
import {
  isBankTransferConfigComplete,
  usesUkBankFields,
  validateBankTransferForEnable,
  type BankTransferConfig,
} from '../../utils/bankTransfer'
import { BuildingLibraryIcon, CreditCardIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import {
  InvoiceSendEmailCard,
  InvoiceDueReminderCard,
} from '../../components/settings/InvoiceEmailSettings'
import {
  SettingsHeader,
  SettingsSection,
  SettingsRow,
  SettingsField,
  SettingsToggle,
  SettingsInput,
  SettingsTextarea,
  SettingsButton,
  SettingsHint,
  SettingsErrorNote,
} from '../../components/settings/SettingsUI'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type InvoiceDefaults = {
  invoiceDefaultDueDays: number | ''
  invoiceDefaultPaymentTerms: string
  invoiceNextNumber: number | ''
  maxNumericInvoice: number
  invoiceNumberingConfigured: boolean
  invoicingEnabled: boolean
}

type PaymentConfig = BankTransferConfig & {
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

type PaymentDraft = {
  enabled: boolean
  config: PaymentConfig
}

type SavableInvoiceDefaults = Pick<
  InvoiceDefaults,
  'invoiceDefaultDueDays' | 'invoiceDefaultPaymentTerms' | 'invoiceNextNumber'
>

type ActivationFieldErrors = {
  nextNumber: boolean
  dueDays: boolean
  bankTransfer: boolean
}

const INPUT_ERROR_CLASS = 'border-red-400 ring-1 ring-red-400'
const ROW_ERROR_CLASS = 'rounded-lg ring-2 ring-red-400/80 ring-inset'

function isPositiveInt(value: number | ''): value is number {
  return value !== '' && Number.isFinite(value) && value >= 1
}

function validateActivationRequirements(
  form: Pick<InvoiceDefaults, 'invoiceNextNumber' | 'invoiceDefaultDueDays'>,
  paymentDrafts: Record<string, PaymentDraft>,
  countryCode: string,
): ActivationFieldErrors {
  const bank = paymentDrafts.bank_transfer
  const bankOk =
    Boolean(bank?.enabled) &&
    isBankTransferConfigComplete(bank?.config || {}, countryCode)

  return {
    nextNumber: !isPositiveInt(form.invoiceNextNumber),
    dueDays: !isPositiveInt(form.invoiceDefaultDueDays),
    bankTransfer: !bankOk,
  }
}

function hasActivationErrors(errors: ActivationFieldErrors) {
  return errors.nextNumber || errors.dueDays || errors.bankTransfer
}

export default function InvoiceOptionsPage() {
  const { t } = useAppI18n()
  const countryCode = useCompanyCountryCode()

  const [defaultsLoading, setDefaultsLoading] = useState(true)
  const [defaultsSaving, setDefaultsSaving] = useState(false)
  const [defaultsError, setDefaultsError] = useState('')
  const [activationSaving, setActivationSaving] = useState(false)
  const savedDefaultsRef = useRef<SavableInvoiceDefaults>({
    invoiceDefaultDueDays: '',
    invoiceDefaultPaymentTerms: '',
    invoiceNextNumber: '',
  })
  const [form, setForm] = useState<InvoiceDefaults>({
    invoiceDefaultDueDays: '',
    invoiceDefaultPaymentTerms: '',
    invoiceNextNumber: '',
    maxNumericInvoice: 0,
    invoiceNumberingConfigured: false,
    invoicingEnabled: false,
  })
  const [activationFieldErrors, setActivationFieldErrors] = useState<ActivationFieldErrors>({
    nextNumber: false,
    dueDays: false,
    bankTransfer: false,
  })
  const [expandBankTransfer, setExpandBankTransfer] = useState(false)

  const [paymentLoading, setPaymentLoading] = useState(true)
  const [paymentError, setPaymentError] = useState('')
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([])
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, PaymentDraft>>({})

  const enabled = form.invoicingEnabled

  const defaultsDirty = useMemo(() => {
    const saved = savedDefaultsRef.current
    return (
      form.invoiceDefaultDueDays !== saved.invoiceDefaultDueDays ||
      form.invoiceDefaultPaymentTerms !== saved.invoiceDefaultPaymentTerms ||
      form.invoiceNextNumber !== saved.invoiceNextNumber
    )
  }, [form.invoiceDefaultDueDays, form.invoiceDefaultPaymentTerms, form.invoiceNextNumber])

  const paymentDirty = useMemo(() => {
    return paymentOptions.some((opt) => {
      const draft = paymentDrafts[opt.provider]
      if (!draft) return false
      return (
        draft.enabled !== opt.enabled ||
        JSON.stringify(draft.config || {}) !== JSON.stringify(opt.config || {})
      )
    })
  }, [paymentOptions, paymentDrafts])

  const hasUnsavedChanges = defaultsDirty || paymentDirty

  const loadDefaults = useCallback(async () => {
    setDefaultsError('')
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setDefaultsError(t('settings.invoices.notSignedIn', 'Not signed in'))
        setDefaultsLoading(false)
        return
      }
      const res = await fetch(apiUrl('/companies/invoice-defaults'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        setDefaultsError(data.error || t('settings.invoices.errLoad', 'Failed to load invoice settings'))
        setDefaultsLoading(false)
        return
      }
      if (data.defaults) {
        const nextNumberRaw = data.defaults.invoiceNextNumber
        const dueDaysRaw = data.defaults.invoiceDefaultDueDays
        const maxIssued = data.defaults.maxNumericInvoice ?? 0
        const realityConfigured = Number(nextNumberRaw) > 1 || Number(maxIssued) > 0
        const configured = realityConfigured
          ? true
          : typeof data.defaults.invoiceNumberingConfigured === 'boolean'
            ? data.defaults.invoiceNumberingConfigured
            : false
        const nextNumber = nextNumberRaw != null ? Number(nextNumberRaw) : ''
        const dueDays = dueDaysRaw != null ? Number(dueDaysRaw) : ''
        setForm({
          invoiceDefaultDueDays: dueDays,
          invoiceDefaultPaymentTerms: data.defaults.invoiceDefaultPaymentTerms ?? '',
          invoiceNextNumber: nextNumber,
          maxNumericInvoice: maxIssued,
          invoiceNumberingConfigured: configured,
          invoicingEnabled: Boolean(data.defaults.invoicingEnabled),
        })
        savedDefaultsRef.current = {
          invoiceDefaultDueDays: dueDays,
          invoiceDefaultPaymentTerms: data.defaults.invoiceDefaultPaymentTerms ?? '',
          invoiceNextNumber: nextNumber,
        }
      }
    } catch {
      setDefaultsError(t('settings.invoices.errNetwork', 'Network error'))
    } finally {
      setDefaultsLoading(false)
    }
  }, [t])

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
        setPaymentError(data.error || t('settings.invoices.payment.errLoad', 'Failed to load payment options'))
        setPaymentLoading(false)
        return
      }
      const all: PaymentOption[] = Array.isArray(data.integrations) ? data.integrations : []
      const filtered = all.filter(
        (opt) => Array.isArray(opt.capabilities) && opt.capabilities.includes('invoice_payment'),
      )
      setPaymentOptions(filtered)
      setPaymentDrafts(
        Object.fromEntries(
          filtered.map((opt) => [opt.provider, { enabled: opt.enabled, config: { ...(opt.config || {}) } }]),
        ),
      )
    } catch {
      setPaymentError(t('settings.invoices.errNetwork', 'Network error'))
    } finally {
      setPaymentLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadDefaults()
    loadPaymentOptions()
  }, [loadDefaults, loadPaymentOptions])

  const handleToggleInvoicing = async (next: boolean) => {
    if (!next) {
      setActivationFieldErrors({ nextNumber: false, dueDays: false, bankTransfer: false })
      setForm((f) => ({ ...f, invoicingEnabled: false }))
      setActivationSaving(true)
      setDefaultsError('')
      try {
        const token = localStorage.getItem('token')
        if (!token) return
        const res = await fetch(apiUrl('/companies/invoice-defaults'), {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoicingEnabled: false }),
        })
        const data = await res.json()
        if (!res.ok) {
          setForm((f) => ({ ...f, invoicingEnabled: true }))
          setDefaultsError(data.error || t('settings.invoices.errSave', 'Failed to save'))
        }
      } catch {
        setForm((f) => ({ ...f, invoicingEnabled: true }))
        setDefaultsError(t('settings.invoices.errNetwork', 'Network error'))
      } finally {
        setActivationSaving(false)
      }
      return
    }

    const errors = validateActivationRequirements(form, paymentDrafts, countryCode)
    if (hasActivationErrors(errors)) {
      setActivationFieldErrors(errors)
      if (errors.bankTransfer) setExpandBankTransfer(true)
      setDefaultsError(
        t(
          'settings.invoices.activate.missingRequired',
          'Fill in the required settings highlighted below before turning invoicing on.',
        ),
      )
      return
    }

    setActivationFieldErrors({ nextNumber: false, dueDays: false, bankTransfer: false })
    setDefaultsError('')
    setActivationSaving(true)

    try {
      const saved = await handleSaveAll()
      if (!saved) return

      const token = localStorage.getItem('token')
      if (!token) return
      const res = await fetch(apiUrl('/companies/invoice-defaults'), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoicingEnabled: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDefaultsError(data.error || t('settings.invoices.errSave', 'Failed to save'))
        return
      }
      setForm((f) => ({ ...f, invoicingEnabled: true }))
    } catch {
      setDefaultsError(t('settings.invoices.errNetwork', 'Network error'))
    } finally {
      setActivationSaving(false)
    }
  }

  const handleSaveAll = async (): Promise<boolean> => {
    setDefaultsSaving(true)
    setDefaultsError('')
    setPaymentError('')
    try {
      const token = localStorage.getItem('token')
      if (!token) return false

      if (defaultsDirty) {
        const payload: Record<string, unknown> = {
          invoiceDefaultPaymentTerms: form.invoiceDefaultPaymentTerms,
        }
        if (form.invoiceDefaultDueDays !== '') {
          payload.invoiceDefaultDueDays = form.invoiceDefaultDueDays
        }
        if (form.invoiceNextNumber !== '') {
          payload.invoiceNextNumber = form.invoiceNextNumber
        }

        const res = await fetch(apiUrl('/companies/invoice-defaults'), {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) {
          setDefaultsError(data.error || t('settings.invoices.errSave', 'Failed to save'))
          return false
        }
        const nextSaved: SavableInvoiceDefaults = {
          invoiceDefaultDueDays: form.invoiceDefaultDueDays,
          invoiceDefaultPaymentTerms: form.invoiceDefaultPaymentTerms,
          invoiceNextNumber: form.invoiceNextNumber,
        }
        savedDefaultsRef.current = nextSaved
        if (data.defaults) {
          const savedNext =
            data.defaults.invoiceNextNumber != null ? Number(data.defaults.invoiceNextNumber) : nextSaved.invoiceNextNumber
          const savedDue =
            data.defaults.invoiceDefaultDueDays != null
              ? Number(data.defaults.invoiceDefaultDueDays)
              : nextSaved.invoiceDefaultDueDays
          setForm((prev) => ({
            ...prev,
            ...data.defaults,
            invoiceNextNumber: savedNext,
            invoiceDefaultDueDays: savedDue,
            invoiceNumberingConfigured: true,
          }))
          savedDefaultsRef.current = {
            invoiceDefaultDueDays: savedDue,
            invoiceDefaultPaymentTerms:
              data.defaults.invoiceDefaultPaymentTerms ?? nextSaved.invoiceDefaultPaymentTerms,
            invoiceNextNumber: savedNext,
          }
        } else {
          setForm((prev) => ({ ...prev, invoiceNumberingConfigured: true }))
        }
      }

      for (const opt of paymentOptions) {
        const draft = paymentDrafts[opt.provider]
        if (!draft) continue
        const isDirty =
          draft.enabled !== opt.enabled ||
          JSON.stringify(draft.config || {}) !== JSON.stringify(opt.config || {})
        if (!isDirty) continue

        if (opt.provider === 'bank_transfer' && draft.enabled) {
          const bankErr = validateBankTransferForEnable(draft.config || {}, countryCode)
          if (bankErr) {
            setPaymentError(
              usesUkBankFields(countryCode)
                ? t(
                    'settings.invoices.payment.fillToActivateErrorUk',
                    'Fill account holder, sort code, and account number before activating.',
                  )
                : t(
                    'settings.invoices.payment.fillToActivateError',
                    'Fill account holder and IBAN before activating.',
                  ),
            )
            return false
          }
        }

        const res = await fetch(apiUrl(`/integrations/${opt.provider}/config`), {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: draft.enabled, config: draft.config }),
        })
        const data = await res.json()
        if (!res.ok) {
          setPaymentError(data.error || t('settings.invoices.payment.failedSave', 'Failed to save'))
          return false
        }
        setPaymentOptions((prev) =>
          prev.map((row) =>
            row.provider === opt.provider
              ? { ...row, enabled: data.integration.enabled, config: data.integration.config || {} }
              : row,
          ),
        )
      }
    } catch {
      setDefaultsError(t('settings.invoices.errNetwork', 'Network error'))
      return false
    } finally {
      setDefaultsSaving(false)
    }
    return true
  }

  const handleDiscardAll = () => {
    setForm((prev) => ({ ...prev, ...savedDefaultsRef.current }))
    setPaymentDrafts(
      Object.fromEntries(
        paymentOptions.map((opt) => [
          opt.provider,
          { enabled: opt.enabled, config: { ...(opt.config || {}) } },
        ]),
      ),
    )
    setDefaultsError('')
    setPaymentError('')
    setActivationFieldErrors({ nextNumber: false, dueDays: false, bankTransfer: false })
  }

  const updatePaymentDraft = (provider: string, patch: Partial<PaymentDraft>) => {
    if (provider === 'bank_transfer') {
      setActivationFieldErrors((prev) => ({ ...prev, bankTransfer: false }))
    }
    setPaymentDrafts((prev) => {
      const current = prev[provider] ?? { enabled: false, config: {} }
      return {
        ...prev,
        [provider]: {
          enabled: patch.enabled ?? current.enabled,
          config: patch.config ? { ...current.config, ...patch.config } : current.config,
        },
      }
    })
  }

  if (defaultsLoading) {
    return (
      <div className="p-6 flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    )
  }

  return (
    <div className={`px-6 py-8 ${hasUnsavedChanges ? 'pb-24' : ''}`}>
      <div className="mx-auto max-w-2xl">
        <SettingsHeader
          title={t('settings.invoices.title', 'Invoices')}
          description={
            enabled
              ? t(
                  'settings.invoices.introActive',
                  'Configure how invoices are numbered and sent, then set up how clients pay you and get reminded.',
                )
              : t(
                  'settings.invoices.introInactive',
                  'Set up your invoice defaults below, then turn invoicing on when you are ready.',
                )
          }
          action={
            <>
              {activationSaving && (
                <span className="text-[13px] text-gray-400">
                  {t('settings.invoices.saving', 'Saving…')}
                </span>
              )}
              <SettingsToggle
                checked={enabled}
                onChange={handleToggleInvoicing}
                disabled={activationSaving}
                label={t('settings.invoices.activate.title', 'Invoicing')}
              />
            </>
          }
        />

        {defaultsError && (
          <div className="mb-4">
            <SettingsErrorNote>{defaultsError}</SettingsErrorNote>
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); handleSaveAll() }}>
          <SettingsSection
            title={t('settings.invoices.numbering.section', 'Invoice numbering')}
            description={t(
              'settings.invoices.numbering.sectionHelp',
              'Choose the first invoice number your account will use. Every new invoice after that counts up automatically, so you never have to assign numbers by hand.',
            )}
          >
            <div className={activationFieldErrors.nextNumber ? ROW_ERROR_CLASS : undefined}>
              <SettingsRow
                htmlFor="next-invoice-number"
                title={t('settings.invoices.numbering.next', 'Next invoice number')}
                description={t(
                  'settings.invoices.numbering.subtitle',
                  'The number on your very next invoice. If you are moving from another system, set this one step above your highest existing number.',
                )}
                control={
                  <SettingsInput
                    id="next-invoice-number"
                    type="number"
                    min={1}
                    className={`w-28 text-right ${activationFieldErrors.nextNumber ? INPUT_ERROR_CLASS : ''}`}
                    value={form.invoiceNextNumber}
                    placeholder="—"
                    onChange={(e) => {
                      setActivationFieldErrors((prev) => ({ ...prev, nextNumber: false }))
                      const raw = e.target.value
                      if (!raw) {
                        setForm((f) => ({ ...f, invoiceNextNumber: '' }))
                        return
                      }
                      const parsed = parseInt(raw, 10)
                      setForm((f) => ({
                        ...f,
                        invoiceNextNumber: Number.isFinite(parsed) && parsed >= 1 ? parsed : '',
                      }))
                    }}
                  />
                }
              />
            </div>
            {!form.invoiceNumberingConfigured && (
              <SettingsHint>
                {t(
                  'settings.invoices.numbering.required',
                  'You must save a starting number before anyone can create an invoice. If you already have invoices elsewhere, pick a number that does not overlap.',
                )}
              </SettingsHint>
            )}
            {form.maxNumericInvoice > 0 && (
              <SettingsHint>
                {t('settings.invoices.numbering.warnPrefix', 'Highest number already in use:')}{' '}
                {form.maxNumericInvoice}.{' '}
                {t('settings.invoices.numbering.warnSuffix', 'Choose a next number that is not already taken.')}
              </SettingsHint>
            )}
          </SettingsSection>

          <SettingsSection
            title={t('settings.invoices.terms.section', 'Payment terms & due date')}
            description={t(
              'settings.invoices.terms.sectionHelp',
              'Set how long clients have to pay and the standard wording that appears on every invoice. You can still override the text on individual invoices when needed.',
            )}
          >
            <div className={activationFieldErrors.dueDays ? ROW_ERROR_CLASS : undefined}>
              <SettingsRow
                htmlFor="due-days"
                title={t('settings.invoices.due.title', 'Default due day')}
                description={t(
                  'settings.invoices.due.subtitle',
                  'How many days after the invoice date the client has to pay. This date is used in your payment terms and on the invoice itself.',
                )}
                control={
                  <SettingsInput
                    id="due-days"
                    type="number"
                    min={1}
                    max={3650}
                    className={`w-24 text-right ${activationFieldErrors.dueDays ? INPUT_ERROR_CLASS : ''}`}
                    value={form.invoiceDefaultDueDays}
                    placeholder="—"
                    onChange={(e) => {
                      setActivationFieldErrors((prev) => ({ ...prev, dueDays: false }))
                      const raw = e.target.value
                      if (!raw) {
                        setForm((f) => ({ ...f, invoiceDefaultDueDays: '' }))
                        return
                      }
                      const parsed = parseInt(raw, 10)
                      setForm((f) => ({
                        ...f,
                        invoiceDefaultDueDays: Number.isFinite(parsed) && parsed >= 1 ? parsed : '',
                      }))
                    }}
                  />
                }
              />
            </div>
            <SettingsField
              title={t('settings.invoices.terms.title', 'Default payment terms')}
              description={t(
                'settings.invoices.terms.subtitle',
                'The legal or practical text printed on every invoice — for example late fees, bank details in prose, or how to reference the payment.',
              )}
            >
              <SettingsTextarea
                rows={5}
                value={form.invoiceDefaultPaymentTerms}
                onChange={(e) => setForm((f) => ({ ...f, invoiceDefaultPaymentTerms: e.target.value }))}
                placeholder={t(
                  'settings.invoices.terms.placeholder',
                  'e.g. Payment due within {due_date}. After the due date, interest of 1% per month is charged.',
                )}
              />
              <SettingsHint>
                {t('settings.invoices.terms.placeholdersHint', 'Available placeholders:')}{' '}
                <code className="rounded bg-gray-100 px-1">{'{due_date}'}</code>,{' '}
                <code className="rounded bg-gray-100 px-1">{'{invoice_date}'}</code>,{' '}
                <code className="rounded bg-gray-100 px-1">{'{invoice_number}'}</code>,{' '}
                <code className="rounded bg-gray-100 px-1">{'{overdue_days}'}</code>.
              </SettingsHint>
            </SettingsField>
          </SettingsSection>

          <div className="mt-16">
            <InvoiceSendEmailCard />
          </div>
        </form>

        <SettingsSection
          title={t('settings.invoices.gettingPaid.section', 'Getting paid')}
          description={t(
            'settings.invoices.gettingPaid.sectionHelp',
            'How clients pay you and automatic reminders when payment is coming due.',
          )}
        >
          {paymentError && (
            <div className="mb-3">
              <SettingsErrorNote>{paymentError}</SettingsErrorNote>
            </div>
          )}
          {paymentLoading ? (
            <div className="flex justify-center py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            </div>
          ) : paymentOptions.length === 0 ? (
            <p className="py-4 text-sm text-gray-500">
              {t('settings.invoices.payment.empty', 'No payment options available yet.')}
            </p>
          ) : (
            <div>
              {paymentOptions.map((opt) => (
                <PaymentOptionRow
                  key={opt.provider}
                  option={opt}
                  draft={
                    paymentDrafts[opt.provider] ?? {
                      enabled: opt.enabled,
                      config: opt.config || {},
                    }
                  }
                  onDraftChange={(patch) => updatePaymentDraft(opt.provider, patch)}
                  invalid={opt.provider === 'bank_transfer' && activationFieldErrors.bankTransfer}
                  expandRequested={opt.provider === 'bank_transfer' && expandBankTransfer}
                  countryCode={countryCode}
                  t={t}
                />
              ))}
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-gray-100">
            <InvoiceDueReminderCard />
          </div>
        </SettingsSection>
      </div>

      {hasUnsavedChanges && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur lg:left-[200px]">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-6 py-3">
            <p className="text-sm text-gray-600">
              {t('settings.invoices.unsaved', 'You have unsaved changes')}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDiscardAll}
                disabled={defaultsSaving}
                className="text-[13px] font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40"
              >
                {t('settings.invoices.discard', 'Discard')}
              </button>
              <SettingsButton
                variant="primary"
                onClick={handleSaveAll}
                disabled={defaultsSaving}
              >
                {defaultsSaving
                  ? t('settings.invoices.saving', 'Saving…')
                  : t('settings.invoices.saveChanges', 'Save changes')}
              </SettingsButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PaymentOptionRow — a single payment provider, with toggle + inline config.
// No box: label on the left, toggle/setup on the right, config below a divider.
// ─────────────────────────────────────────────────────────────────────────────

function PaymentOptionRow({
  option,
  draft,
  onDraftChange,
  invalid = false,
  expandRequested = false,
  countryCode,
  t,
}: {
  option: PaymentOption
  draft: PaymentDraft
  onDraftChange: (patch: Partial<PaymentDraft>) => void
  invalid?: boolean
  expandRequested?: boolean
  countryCode: string
  t: (key: string, fallback: string) => string
}) {
  const [expanded, setExpanded] = useState(false)
  const isUkBank = usesUkBankFields(countryCode)

  useEffect(() => {
    if (expandRequested) setExpanded(true)
  }, [expandRequested])

  const isBankTransfer = option.provider === 'bank_transfer'

  const canEnable = useMemo(() => {
    if (!isBankTransfer) return true
    return isBankTransferConfigComplete(draft.config || {}, countryCode)
  }, [isBankTransfer, draft.config, countryCode])

  const ProviderIcon = providerIconFor(option.provider)

  return (
    <div
      className={`border-b border-gray-100 last:border-b-0 ${invalid ? 'rounded-lg ring-2 ring-red-400/80 ring-inset -mx-1 px-1' : ''}`}
    >
      <div className="flex items-center justify-between gap-6 py-3.5">
        <div className="flex max-w-[60%] min-w-0 items-start gap-3">
          <ProviderIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800">{option.title}</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-gray-500">{option.description}</p>
          </div>
        </div>

        <div className="ml-8 flex flex-shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-700 hover:text-accent-800"
          >
            {expanded
              ? t('settings.invoices.payment.close', 'Close')
              : t('settings.invoices.payment.edit', 'Edit')}
            <ChevronDownIcon
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
          <SettingsToggle
            checked={draft.enabled}
            onChange={(v) => onDraftChange({ enabled: v })}
            label={
              draft.enabled
                ? t('settings.invoices.payment.disable', 'Disable')
                : t('settings.invoices.payment.enable', 'Enable')
            }
          />
        </div>
      </div>

      {expanded && (
        <div className="-mx-3 mb-3 space-y-4 rounded-md bg-gray-50 px-4 py-4">
          {isBankTransfer && (
            <>
              <SettingsHint>
                {isUkBank
                  ? t(
                      'settings.invoices.payment.ukHelp',
                      'UK bank transfers use sort code and account number. IBAN is optional.',
                    )
                  : t(
                      'settings.invoices.payment.euHelp',
                      'Clients will see these details on your invoices when they pay by bank transfer.',
                    )}
              </SettingsHint>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  label={t('settings.invoices.payment.accountHolder', 'Account holder')}
                  required
                  value={String(draft.config.accountHolder || '')}
                  onChange={(v) => onDraftChange({ config: { accountHolder: v } })}
                />
                {isUkBank ? (
                  <>
                    <Field
                      label={t('settings.invoices.payment.sortCode', 'Sort code')}
                      required
                      placeholder="12-34-56"
                      value={String(draft.config.registrationNumber || '')}
                      onChange={(v) => onDraftChange({ config: { registrationNumber: v } })}
                    />
                    <Field
                      label={t('settings.invoices.payment.accountNumber', 'Account number')}
                      required
                      placeholder="12345678"
                      value={String(draft.config.accountNumber || '')}
                      onChange={(v) => onDraftChange({ config: { accountNumber: v } })}
                    />
                    <Field
                      label={t('settings.invoices.payment.ibanOptional', 'IBAN (optional)')}
                      value={String(draft.config.iban || '')}
                      onChange={(v) => onDraftChange({ config: { iban: v } })}
                    />
                  </>
                ) : (
                  <>
                    <Field
                      label={t('settings.invoices.payment.iban', 'IBAN')}
                      required
                      value={String(draft.config.iban || '')}
                      onChange={(v) => onDraftChange({ config: { iban: v } })}
                    />
                    <Field
                      label={t('settings.invoices.payment.regNumber', 'Registration number')}
                      value={String(draft.config.registrationNumber || '')}
                      onChange={(v) => onDraftChange({ config: { registrationNumber: v } })}
                    />
                    <Field
                      label={t('settings.invoices.payment.accountNumber', 'Account number')}
                      value={String(draft.config.accountNumber || '')}
                      onChange={(v) => onDraftChange({ config: { accountNumber: v } })}
                    />
                  </>
                )}
              </div>
            </>
          )}

          {draft.enabled && !canEnable && (
            <SettingsHint>
              {isUkBank
                ? t(
                    'settings.invoices.payment.fillToActivateUk',
                    'Fill account holder, sort code, and account number to activate.',
                  )
                : t(
                    'settings.invoices.payment.fillToActivate',
                    'Fill account holder and IBAN to activate.',
                  )}
            </SettingsHint>
          )}
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
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-gray-400">*</span>}
      </span>
      <SettingsInput
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function providerIconFor(provider: string) {
  if (provider === 'bank_transfer') return BuildingLibraryIcon
  return CreditCardIcon
}
