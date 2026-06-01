'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { EnvelopeIcon, ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useAppI18n } from '../I18nProvider'
import { apiUrl } from '../../utils/api'
import { clearEmailTemplateCache } from '../../utils/emailTemplates'
import {
  getDefaultTemplate,
  defaultAutomationSettings,
} from '../../utils/emailTemplateDefaults'
import { useCompanyCountryCode } from '../../hooks/useCompanyCountryCode'
import { SettingsErrorNote } from './SettingsUI'

type TemplateTag = { label: string; tag: string; hint?: string }

const SEND_TAGS: TemplateTag[] = [
  { label: 'Client first name', tag: '{Client first name}' },
  { label: 'Invoice number', tag: '{invoice_number}' },
  { label: 'Total price', tag: '{Job total price}' },
  { label: 'Owner name', tag: '{Owner name}', hint: 'Company owner name — used in sign-offs' },
  { label: 'Company name', tag: '{Company name}' },
]

const REMINDER_TAGS: TemplateTag[] = [
  { label: 'Client first name', tag: '{Client first name}' },
  { label: 'Invoice number', tag: '{invoice_number}' },
  { label: 'Owner name', tag: '{Owner name}', hint: 'Company owner name — used in sign-offs' },
  { label: 'Company name', tag: '{Company name}' },
]

const REMINDER_AUTOMATION_ID = 'email_invoice_due_reminder'

function normalizeReminderMessage(message: string, countryCode?: string): string {
  const text = String(message || '').trim()
  if (!text) return getDefaultTemplate(REMINDER_AUTOMATION_ID, countryCode).message
  return text
}

function AutomationSwitch({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`
        relative h-7 w-[52px] shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2
        ${enabled ? 'bg-accent-500' : 'bg-gray-300'}
        ${disabled ? 'cursor-not-allowed opacity-50' : ''}
      `}
    >
      <span
        aria-hidden
        className={`
          pointer-events-none absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out
          ${enabled ? 'translate-x-[26px]' : 'translate-x-0'}
        `}
      />
    </button>
  )
}

function TagButtons({
  tags,
  onInsert,
  disabled,
}: {
  tags: TemplateTag[]
  onInsert: (tag: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map(({ label, tag, hint }) => (
        <button
          key={tag}
          type="button"
          disabled={disabled}
          title={hint ? `${hint}\n\nInserts: ${tag}` : `Inserts: ${tag}`}
          onMouseDown={(e) => {
            e.preventDefault()
            onInsert(tag)
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-gray-400 hover:bg-gray-100 hover:text-gray-800 transition-colors disabled:opacity-40"
        >
          <span className="text-gray-400 text-[10px]">＋</span>
          {label}
        </button>
      ))}
    </div>
  )
}

function EmailEditModal({
  title,
  description,
  open,
  saving,
  onClose,
  onDone,
  onReset,
  children,
}: {
  title: string
  description: string
  open: boolean
  saving: boolean
  onClose: () => void
  onDone: () => void
  onReset: () => void
  children: ReactNode
}) {
  const { t } = useAppI18n()
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-2xl max-h-[min(92vh,900px)] flex flex-col rounded-2xl bg-white shadow-2xl border border-gray-200">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500 mt-1">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">{children}</div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-5 py-3 shrink-0">
          <button
            type="button"
            onClick={onReset}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <ArrowPathIcon className="h-4 w-4" />
            {t('app.messages.modal.resetToDefault', 'Reset to default')}
          </button>
          <button
            type="button"
            onClick={onDone}
            disabled={saving}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-40"
          >
            {saving ? t('settings.invoices.saving', 'Saving…') : t('app.messages.modal.done', 'Done')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** First invoice email — belongs with invoicing (numbering, terms). */
export function InvoiceSendEmailCard({ disabled = false }: { disabled?: boolean }) {
  const { t } = useAppI18n()
  const countryCode = useCompanyCountryCode()
  const defaults = getDefaultTemplate('email_invoice_send', countryCode)

  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalSaving, setModalSaving] = useState(false)
  const [error, setError] = useState('')

  const [subject, setSubject] = useState(defaults.subject)
  const [message, setMessage] = useState(defaults.message)
  const [modalSubject, setModalSubject] = useState(defaults.subject)
  const [modalMessage, setModalMessage] = useState(defaults.message)

  const editSubjectRef = useRef<HTMLInputElement>(null)
  const editMessageRef = useRef<HTMLTextAreaElement>(null)
  const lastFocusedField = useRef<'subject' | 'message'>('message')

  const loadRemote = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const res = await fetch(apiUrl('/email-templates'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      const remote = (data.templates || {}) as Record<string, { subject?: string; message?: string }>
      const sendRemote = remote.send_invoice
      if (sendRemote?.subject?.trim()) setSubject(sendRemote.subject)
      if (sendRemote?.message?.trim()) setMessage(sendRemote.message)
    } catch {
      // Keep defaults
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRemote()
  }, [loadRemote])

  const openModal = () => {
    if (disabled) return
    setModalSubject(subject)
    setModalMessage(message)
    lastFocusedField.current = 'message'
    setModalOpen(true)
  }

  const insertTag = (tag: string) => {
    const field = lastFocusedField.current
    const el = field === 'subject' ? editSubjectRef.current : editMessageRef.current
    const apply = (current: string) => {
      const start = el?.selectionStart ?? current.length
      const end = el?.selectionEnd ?? current.length
      return current.slice(0, start) + tag + current.slice(end)
    }
    if (field === 'subject') setModalSubject(apply)
    else setModalMessage(apply)
  }

  const handleDone = async () => {
    setModalSaving(true)
    setError('')
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const res = await fetch(apiUrl('/email-templates'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          templates: {
            send_invoice: { subject: modalSubject.trim(), message: modalMessage.trim() },
          },
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || t('settings.invoices.email.errSave', 'Failed to save email settings'))
        return
      }
      clearEmailTemplateCache()
      setSubject(modalSubject.trim())
      setMessage(modalMessage.trim())
      setModalOpen(false)
    } catch {
      setError(t('settings.invoices.errNetwork', 'Network error'))
    } finally {
      setModalSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="mb-3">
          <SettingsErrorNote>{error}</SettingsErrorNote>
        </div>
      )}

      <button
        type="button"
        onClick={openModal}
        disabled={disabled}
        className="rounded-xl border border-gray-200 bg-white p-5 text-left w-full cursor-pointer hover:border-gray-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-gray-900">
                {t('settings.invoices.email.send.section', 'First invoice email')}
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                <EnvelopeIcon className="h-3.5 w-3.5" />
                EMAIL
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {t(
                'settings.invoices.email.send.sectionHelp',
                'Default subject and message when you send an invoice to a client. They receive a link to view and pay the e-invoice.',
              )}
            </p>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-500">
            {t('settings.invoices.email.send.manual', 'Manual')}
          </span>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          {t('app.messages.statusActive', 'Active')} ·{' '}
          {t('settings.invoices.email.send.whenSent', 'Sent when you complete an invoice')}
        </p>
        <p className="mt-1 text-xs text-gray-400 line-clamp-1">
          {t('app.messages.subjectLabel', 'Subject:')} {subject}
        </p>
        <p className="mt-2 text-xs font-medium text-accent-600">
          {t('app.messages.editMessage', 'Edit message')} →
        </p>
      </button>

      <EmailEditModal
        title={t('settings.invoices.email.send.section', 'First invoice email')}
        description={t(
          'settings.invoices.email.send.sectionHelp',
          'Default subject and message when you send an invoice to a client. They receive a link to view and pay the e-invoice.',
        )}
        open={modalOpen}
        saving={modalSaving}
        onClose={() => !modalSaving && setModalOpen(false)}
        onDone={handleDone}
        onReset={() => {
          const d = getDefaultTemplate('email_invoice_send', countryCode)
          setModalSubject(d.subject)
          setModalMessage(d.message)
        }}
      >
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            {t('app.messages.modal.subject', 'Subject')}
          </label>
          <input
            ref={editSubjectRef}
            type="text"
            value={modalSubject}
            onChange={(e) => setModalSubject(e.target.value)}
            onFocus={() => {
              lastFocusedField.current = 'subject'
            }}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-800 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            {t('app.messages.modal.messageBody', 'Message body')}
          </label>
          <textarea
            ref={editMessageRef}
            value={modalMessage}
            onChange={(e) => setModalMessage(e.target.value)}
            onFocus={() => {
              lastFocusedField.current = 'message'
            }}
            rows={10}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-800 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 resize-none"
          />
        </div>
        <TagButtons tags={SEND_TAGS} onInsert={insertTag} />
      </EmailEditModal>
    </>
  )
}

/** Due-date reminder — belongs with getting paid (payment options). */
export function InvoiceDueReminderCard({ disabled = false }: { disabled?: boolean }) {
  const { t } = useAppI18n()
  const countryCode = useCompanyCountryCode()
  const templateDefaults = getDefaultTemplate(REMINDER_AUTOMATION_ID, countryCode)
  const automationDefault =
    defaultAutomationSettings.find((s) => s.id === REMINDER_AUTOMATION_ID) ?? {
      enabled: false,
      leadValue: 48,
      leadUnit: 'hours' as const,
    }

  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalSaving, setModalSaving] = useState(false)
  const [error, setError] = useState('')

  const [enabled, setEnabled] = useState(automationDefault.enabled)
  const [leadHours, setLeadHours] = useState(automationDefault.leadValue)
  const [subject, setSubject] = useState(templateDefaults.subject)
  const [message, setMessage] = useState(templateDefaults.message)

  const [modalEnabled, setModalEnabled] = useState(automationDefault.enabled)
  const [modalLeadHours, setModalLeadHours] = useState(automationDefault.leadValue)
  const [modalSubject, setModalSubject] = useState(templateDefaults.subject)
  const [modalMessage, setModalMessage] = useState(templateDefaults.message)

  const editSubjectRef = useRef<HTMLInputElement>(null)
  const editMessageRef = useRef<HTMLTextAreaElement>(null)
  const lastFocusedField = useRef<'subject' | 'message'>('message')

  const timingSummary = t('app.messages.timing.invoiceDue', '{n} h before midnight (due date)').replace(
    '{n}',
    String(leadHours),
  )

  const loadRemote = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const res = await fetch(apiUrl('/email-templates'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      const remote = (data.templates || {}) as Record<string, { subject?: string; message?: string }>
      const remoteAutomations = (data.automationSettings || {}) as Record<
        string,
        { enabled?: boolean; lead_value?: number }
      >

      const reminderRemote = remote.invoice_due_reminder
      if (reminderRemote?.subject?.trim()) setSubject(reminderRemote.subject)
      if (reminderRemote?.message?.trim()) {
        setMessage(normalizeReminderMessage(reminderRemote.message, countryCode))
      }

      const autoRemote = remoteAutomations[REMINDER_AUTOMATION_ID]
      if (autoRemote) {
        if (typeof autoRemote.enabled === 'boolean') setEnabled(autoRemote.enabled)
        if (typeof autoRemote.lead_value === 'number') setLeadHours(autoRemote.lead_value)
      }
    } catch {
      // Keep defaults
    } finally {
      setLoading(false)
    }
  }, [countryCode])

  useEffect(() => {
    loadRemote()
  }, [loadRemote])

  const openModal = () => {
    if (disabled) return
    setModalEnabled(enabled)
    setModalLeadHours(leadHours)
    setModalSubject(subject)
    setModalMessage(message)
    lastFocusedField.current = 'message'
    setModalOpen(true)
  }

  const insertTag = (tag: string) => {
    const field = lastFocusedField.current
    const el = field === 'subject' ? editSubjectRef.current : editMessageRef.current
    const apply = (current: string) => {
      const start = el?.selectionStart ?? current.length
      const end = el?.selectionEnd ?? current.length
      return current.slice(0, start) + tag + current.slice(end)
    }
    if (field === 'subject') setModalSubject(apply)
    else setModalMessage(apply)
  }

  const handleDone = async () => {
    setModalSaving(true)
    setError('')
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const res = await fetch(apiUrl('/email-templates'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          templates: {
            invoice_due_reminder: {
              subject: modalSubject.trim(),
              message: normalizeReminderMessage(modalMessage, countryCode),
            },
          },
          automationSettings: {
            [REMINDER_AUTOMATION_ID]: {
              enabled: modalEnabled,
              lead_value: modalLeadHours,
              lead_unit: 'hours',
            },
          },
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || t('settings.invoices.email.errSave', 'Failed to save email settings'))
        return
      }
      clearEmailTemplateCache()
      setEnabled(modalEnabled)
      setLeadHours(modalLeadHours)
      setSubject(modalSubject.trim())
      setMessage(normalizeReminderMessage(modalMessage, countryCode))
      setModalOpen(false)
    } catch {
      setError(t('settings.invoices.errNetwork', 'Network error'))
    } finally {
      setModalSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="mb-3">
          <SettingsErrorNote>{error}</SettingsErrorNote>
        </div>
      )}

      <button
        type="button"
        onClick={openModal}
        disabled={disabled}
        className="rounded-xl border border-gray-200 bg-white p-5 text-left w-full cursor-pointer hover:border-gray-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-gray-900">
                {t('settings.invoices.email.reminder.section', 'Due-date reminders')}
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                <EnvelopeIcon className="h-3.5 w-3.5" />
                EMAIL
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {t(
                'settings.invoices.email.reminder.sectionHelp',
                'Automatically email clients before an invoice is due if it is still unpaid. Only applies to invoices that have already been sent.',
              )}
            </p>
          </div>
          <span
            className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              enabled ? 'border-accent-500/40 text-accent-700' : 'border-gray-200 text-gray-500'
            }`}
          >
            {enabled && <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />}
            {enabled
              ? t('settings.invoices.email.reminder.statusOn', 'On')
              : t('settings.invoices.email.reminder.statusOff', 'Off')}
          </span>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          {enabled ? t('app.messages.statusActive', 'Active') : t('app.messages.statusInactive', 'Inactive')} ·{' '}
          {timingSummary}
        </p>
        <p className="mt-1 text-xs text-gray-400 line-clamp-1">
          {t('app.messages.subjectLabel', 'Subject:')} {subject}
        </p>
        <p className="mt-2 text-xs font-medium text-accent-600">
          {t('app.messages.openSettings', 'Open settings →')}
        </p>
      </button>

      <EmailEditModal
        title={t('settings.invoices.email.reminder.section', 'Due-date reminders')}
        description={t(
          'settings.invoices.email.reminder.sectionHelp',
          'Automatically email clients before an invoice is due if it is still unpaid. Only applies to invoices that have already been sent.',
        )}
        open={modalOpen}
        saving={modalSaving}
        onClose={() => !modalSaving && setModalOpen(false)}
        onDone={handleDone}
        onReset={() => {
          const d = getDefaultTemplate(REMINDER_AUTOMATION_ID, countryCode)
          const a = defaultAutomationSettings.find((s) => s.id === REMINDER_AUTOMATION_ID)
          setModalSubject(d.subject)
          setModalMessage(d.message)
          if (a) {
            setModalEnabled(a.enabled)
            setModalLeadHours(a.leadValue)
          }
        }}
      >
        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">
              {t('app.messages.modal.automation', 'Automation')}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {t(
                'settings.invoices.email.reminder.enableHelp',
                'When off, no reminder emails are sent for unpaid invoices.',
              )}
            </p>
          </div>
          <AutomationSwitch enabled={modalEnabled} onChange={setModalEnabled} />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            {t('app.messages.modal.sendTiming', 'Send timing')}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min={0}
              inputMode="decimal"
              value={Number.isFinite(modalLeadHours) ? modalLeadHours : 0}
              onChange={(e) => {
                const raw = e.target.value
                if (!raw) {
                  setModalLeadHours(0)
                  return
                }
                const next = Number(raw)
                if (Number.isFinite(next)) setModalLeadHours(next)
              }}
              disabled={!modalEnabled}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-800 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 disabled:bg-gray-50 disabled:text-gray-400"
            />
            <span className="shrink-0 text-xs font-semibold text-gray-500">
              {t('app.messages.unitHours', 'hours')}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            {t(
              'app.messages.modal.help.invoiceDue',
              'Hours before midnight (00:00) of the invoice due date. Only for sent invoices that are still unpaid. Decimals allowed.',
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {t('settings.invoices.email.reminder.approxMinutes', '≈ {n} min before midnight').replace(
              '{n}',
              String(Math.round(modalLeadHours * 60)),
            )}
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            {t('app.messages.modal.subject', 'Subject')}
          </label>
          <input
            ref={editSubjectRef}
            type="text"
            value={modalSubject}
            onChange={(e) => setModalSubject(e.target.value)}
            onFocus={() => {
              lastFocusedField.current = 'subject'
            }}
            disabled={!modalEnabled}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-800 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            {t('settings.invoices.email.reminder.openingMessage', 'Opening message')}
          </label>
          <p className="text-xs text-gray-500 mb-2">
            {t(
              'settings.invoices.email.reminder.openingHelp',
              'Shown under the greeting, before invoice details. Tags like {Company name} are replaced when sending.',
            )}
          </p>
          <textarea
            ref={editMessageRef}
            value={modalMessage}
            onChange={(e) => setModalMessage(e.target.value)}
            onFocus={() => {
              lastFocusedField.current = 'message'
            }}
            disabled={!modalEnabled}
            rows={3}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-800 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 resize-none disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>

        {modalEnabled && <TagButtons tags={REMINDER_TAGS} onInsert={insertTag} />}
      </EmailEditModal>
    </>
  )
}
