'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
  InformationCircleIcon,
  SparklesIcon,
  ArrowPathIcon,
  ClockIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'
import { clearEmailTemplateCache } from '../../utils/emailTemplates'
import {
  getDefaultTemplates,
  getDefaultTemplate,
  defaultAutomationSettings,
  getCompanyCountryCodeSync,
  type MessageTemplate,
  type AutomationSetting,
} from '../../utils/emailTemplateDefaults'
import { useCompanyCountryCode } from '../../hooks/useCompanyCountryCode'
import { useAppI18n } from '../../components/I18nProvider'
import type { MessageKey } from '../../i18n'

interface MessagesDraft {
  templates: MessageTemplate[]
  automationSettings: AutomationSetting[]
  repliesToEmail: string
}

const STORAGE_KEY = 'vevago_messages_v2'

type TemplateTag = { label: string; tag: string; hint?: string }

/** Per-template contextual tags shown as clickable insert buttons inside the editor modal. */
const TEMPLATE_TAGS: Record<string, TemplateTag[]> = {
  email_date_changed: [
    { label: 'Client first name', tag: '{Client first name}' },
    { label: 'Client last name',  tag: '{Client last name}' },
    { label: 'Previous date',     tag: '{Job old date}' },
    { label: 'New date',          tag: '{Job new date}' },
    { label: 'Time',              tag: '{Job time}', hint: 'The appointment time (e.g. 09:00 – 11:00). The time is unchanged when only the date moves.' },
    { label: 'Job doer',          tag: '{Employee name}' },
    { label: 'Owner name',        tag: '{Owner name}', hint: 'Company owner name — used in sign-offs' },
    { label: 'Company name',      tag: '{Company name}' },
  ],
  email_time_updated: [
    { label: 'Client first name', tag: '{Client first name}' },
    { label: 'Client last name',  tag: '{Client last name}' },
    { label: 'Current date',      tag: '{Job date}' },
    { label: 'Previous time',     tag: '{Job old time}', hint: 'The old appointment time (e.g. 09:00 – 11:00)' },
    { label: 'New time',          tag: '{Job new time}', hint: 'The new appointment time (e.g. 10:00 – 12:00)' },
    { label: 'Job doer',          tag: '{Employee name}' },
    { label: 'Owner name',        tag: '{Owner name}', hint: 'Company owner name — used in sign-offs' },
    { label: 'Company name',      tag: '{Company name}' },
  ],
  email_employee_changed: [
    { label: 'Client first name', tag: '{Client first name}' },
    { label: 'Client last name',  tag: '{Client last name}' },
    { label: 'Previous employee', tag: '{Employee old name}' },
    { label: 'New employee',      tag: '{Employee new name}' },
    { label: 'Job date',          tag: '{Job date}' },
    { label: 'Owner name',        tag: '{Owner name}', hint: 'Company owner name — used in sign-offs' },
    { label: 'Company name',      tag: '{Company name}' },
  ],
  email_job_cancelled: [
    { label: 'Client first name', tag: '{Client first name}' },
    { label: 'Client last name',  tag: '{Client last name}' },
    { label: 'Date/time', tag: '{Job date/time}', hint: 'Shows date + time if a time is set, otherwise just the date' },
    { label: 'Job date',  tag: '{Job date}' },
    { label: 'Time',      tag: '{Job time from}' },
    { label: 'Services',  tag: '{Job services}' },
    { label: 'Job doer',  tag: '{Employee name}' },
    { label: 'Owner name', tag: '{Owner name}', hint: 'Company owner name — used in sign-offs' },
    { label: 'Company name', tag: '{Company name}' },
  ],
  email_invoice_send: [
    { label: 'Client first name', tag: '{Client first name}' },
    { label: 'Invoice number',    tag: '{invoice_number}' },
    { label: 'Total price',       tag: '{Job total price}' },
    { label: 'Owner name',        tag: '{Owner name}', hint: 'Company owner name — used in sign-offs' },
    { label: 'Company name',      tag: '{Company name}' },
  ],
  email_job_created: [
    { label: 'Client first name', tag: '{Client first name}' },
    { label: 'Date/time', tag: '{Job date/time}', hint: 'Shows date + time if a time is set, otherwise just the date' },
    { label: 'Job date',  tag: '{Job date}' },
    { label: 'Address',   tag: '{Job address}' },
    { label: 'Services',  tag: '{Job services}' },
    { label: 'Owner name', tag: '{Owner name}', hint: 'Company owner name — used in sign-offs' },
    { label: 'Company name', tag: '{Company name}' },
  ],
  email_job_reminder: [
    { label: 'Client first name', tag: '{Client first name}' },
    { label: 'Date/time', tag: '{Job date/time}', hint: 'Shows date + time if a time is set, otherwise just the date' },
    { label: 'Job date',  tag: '{Job date}' },
    { label: 'Address',   tag: '{Job address}' },
    { label: 'Services',  tag: '{Job services}' },
    { label: 'Owner name', tag: '{Owner name}', hint: 'Company owner name — used in sign-offs' },
    { label: 'Company name', tag: '{Company name}' },
  ],
  email_invoice_due_reminder: [
    { label: 'Client first name', tag: '{Client first name}' },
    { label: 'Invoice number',    tag: '{invoice_number}' },
    { label: 'Owner name',        tag: '{Owner name}', hint: 'Company owner name — used in sign-offs' },
    { label: 'Company name',      tag: '{Company name}' },
  ],
  email_on_the_way: [
    { label: 'Client first name', tag: '{Client first name}' },
    { label: 'Client name',       tag: '{Client name}' },
    { label: 'Current date',      tag: '{Current date}', hint: 'Today’s date when the message is sent' },
    { label: 'Current time',      tag: '{Current time}', hint: 'Time when the message is sent' },
    { label: 'Selected minutes',  tag: '{Selected minutes}', hint: 'ETA minutes chosen in the app (e.g. 15)' },
    { label: 'Job date',          tag: '{Job date}' },
    { label: 'Job time',          tag: '{Job time}' },
    { label: 'Location',          tag: '{Client location}', hint: 'Client address for this job' },
    { label: 'Employee name',     tag: '{Employee name}' },
    { label: 'Owner name',        tag: '{Owner name}', hint: 'Company owner — used in sign-offs' },
    { label: 'Company name',      tag: '{Company name}' },
  ],
  sms_on_the_way: [
    { label: 'Client first name', tag: '{Client first name}' },
    { label: 'Job doer',    tag: '{Employee name}' },
    { label: 'Address',     tag: '{Job address}' },
    { label: 'Owner name',  tag: '{Owner name}', hint: 'Company owner name — used in sign-offs' },
    { label: 'Company name', tag: '{Company name}' },
  ],
  sms_day_before: [
    { label: 'Client first name', tag: '{Client first name}' },
    { label: 'Date/time', tag: '{Job date/time}', hint: 'Shows date + time if a time is set, otherwise just the date' },
    { label: 'Job date',  tag: '{Job date}' },
    { label: 'Time',      tag: '{Job time from}' },
    { label: 'Owner name', tag: '{Owner name}', hint: 'Company owner name — used in sign-offs' },
    { label: 'Company name', tag: '{Company name}' },
  ],
}

const emailTemplateTypeById: Record<
  string,
  'change_date' | 'change_time' | 'change_employee' | 'cancel_job' | 'send_invoice' | 'on_the_way'
> = {
  email_date_changed: 'change_date',
  email_time_updated: 'change_time',
  email_employee_changed: 'change_employee',
  email_job_cancelled: 'cancel_job',
  email_invoice_send: 'send_invoice',
  email_on_the_way: 'on_the_way',
}
const automatedEmailTemplateTypeById: Record<
  string,
  'job_created_confirmation' | 'job_day_reminder' | 'invoice_due_reminder'
> = {
  email_job_created: 'job_created_confirmation',
  email_job_reminder: 'job_day_reminder',
  email_invoice_due_reminder: 'invoice_due_reminder',
}

function AutomationSwitch({
  enabled,
  onChange,
  disabled,
  id,
}: {
  enabled: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  id?: string
}) {
  return (
    <button
      type="button"
      id={id}
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

/** Matches legacy full-body automation text saved before "opening line only" switch. */
function isLegacyAutomatedOpeningMessage(raw: string | undefined): boolean {
  const text = String(raw || '').trim()
  if (!text) return false
  if (
    text.includes('Hi {Client first name}') &&
    (text.includes('{Job services}') || text.includes('Services:')) &&
    (text.includes('{Job total price}') || text.includes('Total:'))
  ) {
    return true
  }
  if (text.includes('Time: {Job time range}') && text.includes('Address: {Job address}')) {
    return true
  }
  if (
    text.includes('Reminder: we are scheduled to visit you') &&
    (text.includes('{Job services}') || text.includes('Services:'))
  ) {
    return true
  }
  return false
}

function normalizeAutomationOpeningMessage(templateId: string, message: string, countryCode?: string): string {
  if (
    templateId !== 'email_job_created' &&
    templateId !== 'email_job_reminder' &&
    templateId !== 'email_invoice_due_reminder'
  )
    return message
  if (!isLegacyAutomatedOpeningMessage(message)) return message
  return getDefaultTemplate(templateId, countryCode).message
}

function mergeTemplatesWithDefaults(incoming: MessageTemplate[] | undefined, countryCode: string): MessageTemplate[] {
  const defaults = getDefaultTemplates(countryCode)
  if (!Array.isArray(incoming) || incoming.length === 0) return defaults
  const incomingMap = new Map(incoming.map((t) => [t.id, t]))
  return defaults.map((base) => {
    const existing = incomingMap.get(base.id)
    if (!existing) return base
    const nextSubject =
      typeof existing.subject === 'string' && existing.subject.trim()
        ? existing.subject
        : base.subject
    const nextMessageRaw =
      typeof existing.message === 'string' && existing.message.trim()
        ? existing.message
        : base.message
    const nextMessage =
      base.kind === 'automated' && base.channel === 'email'
        ? normalizeAutomationOpeningMessage(base.id, nextMessageRaw, countryCode)
        : nextMessageRaw
    return {
      ...base,
      ...existing,
      subject: nextSubject,
      message: nextMessage,
      kind: base.kind,
      channel: base.channel,
      title: base.title,
      description: base.description,
    }
  })
}

function mergeAutomationSettingsWithDefaults(incoming?: AutomationSetting[]): AutomationSetting[] {
  if (!Array.isArray(incoming) || incoming.length === 0) return defaultAutomationSettings
  const incomingMap = new Map(incoming.map((s) => [s.id, s as any]))
  return defaultAutomationSettings.map((base) => {
    const existing = incomingMap.get(base.id)
    if (!existing) return base
    const legacyLeadHours = typeof existing.leadHours === 'number' ? existing.leadHours : undefined
    return {
      ...base,
      ...existing,
      leadValue:
        typeof existing.leadValue === 'number'
          ? existing.leadValue
          : (legacyLeadHours ?? base.leadValue),
      leadUnit:
        existing.leadUnit === 'minutes' || existing.leadUnit === 'hours'
          ? existing.leadUnit
          : base.leadUnit,
      channel: base.channel,
      title: base.title,
      description: base.description,
    }
  })
}

export default function NotificationsPage() {
  const { t } = useAppI18n()
  const tr = (key: string, fallback: string) => t(key as MessageKey, fallback)

  /** Translate a template's title/description by its id (emailTemplateDefaults stores English only). */
  const getTemplateTitle = (tpl: { id: string; title: string }) =>
    tr(`app.messages.tpl.${tpl.id}.title`, tpl.title)
  const getTemplateDescription = (tpl: { id: string; description: string }) =>
    tr(`app.messages.tpl.${tpl.id}.description`, tpl.description)

  // Resolve country code synchronously for useState initialiser, then refine via hook
  const initialCountryCode = getCompanyCountryCodeSync()
  const countryCode = useCompanyCountryCode()

  const [draft, setDraft] = useState<MessagesDraft>(() => {
    const ownerFallbackEmail = (() => {
      if (typeof window === 'undefined') return ''
      try {
        const raw = localStorage.getItem('user')
        if (!raw) return ''
        const parsed = JSON.parse(raw) as { email?: string }
        return parsed?.email || ''
      } catch {
        return ''
      }
    })()

    if (typeof window === 'undefined') {
      return {
        templates: getDefaultTemplates(initialCountryCode),
        automationSettings: defaultAutomationSettings,
        repliesToEmail: '',
      }
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        return {
          templates: getDefaultTemplates(initialCountryCode),
          automationSettings: defaultAutomationSettings,
          repliesToEmail: ownerFallbackEmail,
        }
      }
      const parsed = JSON.parse(raw) as Partial<MessagesDraft>
      return {
        templates: mergeTemplatesWithDefaults(parsed.templates, initialCountryCode),
        automationSettings: mergeAutomationSettingsWithDefaults(parsed.automationSettings),
        repliesToEmail:
          typeof parsed.repliesToEmail === 'string' && parsed.repliesToEmail.trim()
            ? parsed.repliesToEmail
            : ownerFallbackEmail,
      }
    } catch {
      return {
        templates: getDefaultTemplates(initialCountryCode),
        automationSettings: mergeAutomationSettingsWithDefaults(),
        repliesToEmail: ownerFallbackEmail,
      }
    }
  })
  const [savedNotice, setSavedNotice] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingRemote, setIsLoadingRemote] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)

  // Reset field focus tracking whenever a different template modal opens
  useEffect(() => {
    lastFocusedFieldRef.current = 'message'
  }, [editingTemplateId])

  // When opening automation email editor, strip legacy full-body text
  useEffect(() => {
    if (!editingTemplateId) return
    if (
      editingTemplateId !== 'email_job_created' &&
      editingTemplateId !== 'email_job_reminder' &&
      editingTemplateId !== 'email_invoice_due_reminder'
    )
      return
    setDraft((prev) => {
      const t = prev.templates.find((x) => x.id === editingTemplateId)
      if (!t) return prev
      const next = normalizeAutomationOpeningMessage(editingTemplateId, t.message || '', countryCode)
      if (next === t.message) return prev
      return {
        ...prev,
        templates: prev.templates.map((x) => (x.id === editingTemplateId ? { ...x, message: next } : x)),
      }
    })
  }, [editingTemplateId, countryCode])

  useEffect(() => {
    const loadRemoteTemplates = async () => {
      setIsLoadingRemote(true)
      try {
        const token = localStorage.getItem('token')
        const response = await fetch(apiUrl('/email-templates'), {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) return
        const data = await response.json()
        const remote = (data.templates || {}) as Record<string, { subject?: string; message?: string }>
        const remoteAutomations = (data.automationSettings || {}) as Record<
          string,
          { enabled?: boolean; lead_value?: number; lead_unit?: 'minutes' | 'hours' }
        >
        setDraft((prev) => ({
          ...prev,
          repliesToEmail:
            typeof data.repliesToEmail === 'string' ? data.repliesToEmail.trim() : prev.repliesToEmail,
          templates: mergeTemplatesWithDefaults(prev.templates, countryCode).map((template) => {
            const templateType = emailTemplateTypeById[template.id]
            const automatedTemplateType = automatedEmailTemplateTypeById[template.id]
            const resolvedTemplateType = templateType || automatedTemplateType
            if (!resolvedTemplateType) return template
            const remoteTemplate = remote[resolvedTemplateType]
            if (!remoteTemplate) return template
            const remoteSubject =
              typeof remoteTemplate.subject === 'string' && remoteTemplate.subject.trim()
                ? remoteTemplate.subject
                : template.subject
            const remoteMessage =
              typeof remoteTemplate.message === 'string' && remoteTemplate.message.trim()
                ? remoteTemplate.message
                : template.message
            return { ...template, subject: remoteSubject, message: remoteMessage }
          }),
          automationSettings: mergeAutomationSettingsWithDefaults(prev.automationSettings).map((setting) => {
            const remoteSetting = remoteAutomations[setting.id]
            if (!remoteSetting) return setting
            return {
              ...setting,
              enabled: typeof remoteSetting.enabled === 'boolean' ? remoteSetting.enabled : setting.enabled,
              leadValue:
                typeof remoteSetting.lead_value === 'number' ? remoteSetting.lead_value : setting.leadValue,
              leadUnit:
                remoteSetting.lead_unit === 'minutes' || remoteSetting.lead_unit === 'hours'
                  ? remoteSetting.lead_unit
                  : setting.leadUnit,
            }
          }),
        }))
      } catch {
        // Keep local/default draft if API fails
      } finally {
        setIsLoadingRemote(false)
      }
    }
    loadRemoteTemplates()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const manualTemplates = useMemo(
    () => draft.templates.filter((t) => t.kind === 'template'),
    [draft.templates]
  )

  const updateTemplate = (id: string, field: 'subject' | 'message', value: string) => {
    setDraft((prev) => ({
      ...prev,
      templates: prev.templates.map((t) => (t.id === id ? { ...t, [field]: value } : t)),
    }))
  }

  const updateAutomationSetting = (
    id: string,
    patch: Partial<Pick<AutomationSetting, 'enabled' | 'leadValue' | 'leadUnit'>>
  ) => {
    setDraft((prev) => ({
      ...prev,
      automationSettings: prev.automationSettings.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }))
  }

  // ── Insert-at-cursor refs ─────────────────────────────────────────────────
  const editSubjectRef = useRef<HTMLInputElement | null>(null)
  const editMessageRef = useRef<HTMLTextAreaElement | null>(null)
  /** 'subject' | 'message' — which field the user last had focus in */
  const lastFocusedFieldRef = useRef<'subject' | 'message'>('message')

  /** Called onMouseDown (with preventDefault) on tag buttons so focus stays in the textarea. */
  const insertTag = (tag: string, templateId: string) => {
    const field = lastFocusedFieldRef.current
    const el = (field === 'subject' ? editSubjectRef.current : editMessageRef.current) as HTMLInputElement | HTMLTextAreaElement | null
    const tpl = draft.templates.find((x) => x.id === templateId)
    if (!tpl) return
    const current = field === 'subject' ? (tpl.subject || '') : (tpl.message || '')
    const start = el?.selectionStart ?? current.length
    const end   = el?.selectionEnd   ?? start
    const next  = current.slice(0, start) + tag + current.slice(end)
    updateTemplate(templateId, field, next)
    const newPos = start + tag.length
    requestAnimationFrame(() => {
      if (el) {
        el.focus()
        el.setSelectionRange(newPos, newPos)
      }
    })
  }

  /** Contextual tag-insert buttons rendered inside each modal. */
  const renderTagButtons = (templateId: string) => {
    const tags = TEMPLATE_TAGS[templateId] || []
    if (!tags.length) return null
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2 select-none">
          Insert tag — click to add at cursor
        </p>
        <div className="flex flex-wrap gap-1.5">
          {tags.map(({ label, tag, hint }) => (
            <button
              key={tag}
              type="button"
              title={hint ? `${hint}\n\nInserts: ${tag}` : `Inserts: ${tag}`}
              onMouseDown={(e) => {
                // Prevent blur so textarea keeps focus and selectionStart stays valid
                e.preventDefault()
                insertTag(tag, templateId)
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-accent-400 hover:bg-accent-50 hover:text-accent-800 transition-colors select-none"
            >
              <span className="text-gray-400 text-[10px]">＋</span>
              {label}
              {hint && <span className="ml-0.5 text-gray-300">●</span>}
            </button>
          ))}
        </div>
      </div>
    )
  }

  /** Reset a single template (any kind) to the company-language default. */
  const resetTemplateToDefault = (templateId: string) => {
    const defaults = getDefaultTemplate(templateId, countryCode)
    const baseAutomation = defaultAutomationSettings.find((s) => s.id === templateId)
    setDraft((prev) => ({
      ...prev,
      templates: prev.templates.map((t) =>
        t.id === templateId ? { ...t, subject: defaults.subject, message: defaults.message } : t
      ),
      automationSettings: baseAutomation
        ? prev.automationSettings.map((s) =>
            s.id === templateId
              ? { ...s, enabled: baseAutomation.enabled, leadValue: baseAutomation.leadValue, leadUnit: baseAutomation.leadUnit }
              : s
          )
        : prev.automationSettings,
    }))
  }

  const handleSaveDraft = () => {
    if (isSaving) return
    const save = async () => {
      setIsSaving(true)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))

        const templatesPayload: Record<string, { subject: string; message: string }> = {}
        draft.templates.forEach((template) => {
          const templateType = emailTemplateTypeById[template.id]
          const automatedType = automatedEmailTemplateTypeById[template.id]
          const resolvedType = templateType || automatedType
          if (!resolvedType) return
          const message =
            template.kind === 'automated' && template.channel === 'email'
              ? normalizeAutomationOpeningMessage(template.id, template.message || '', countryCode)
              : template.message || ''
          templatesPayload[resolvedType] = { subject: template.subject || '', message }
        })

        const automationPayload = draft.automationSettings.reduce<
          Record<string, { enabled: boolean; lead_value: number; lead_unit: 'minutes' | 'hours' }>
        >((acc, setting) => {
          acc[setting.id] = {
            enabled: setting.enabled,
            lead_value: setting.leadValue,
            lead_unit: setting.leadUnit,
          }
          return acc
        }, {})

        const token = localStorage.getItem('token')
        const response = await fetch(apiUrl('/email-templates'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            templates: templatesPayload,
            automationSettings: automationPayload,
            repliesToEmail: draft.repliesToEmail.trim(),
          }),
        })
        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to save templates')
        }

        clearEmailTemplateCache()
        setDraft((prev) => ({
          ...prev,
          templates: prev.templates.map((t) =>
            t.kind === 'automated' && t.channel === 'email'
              ? { ...t, message: normalizeAutomationOpeningMessage(t.id, t.message || '', countryCode) }
              : t
          ),
        }))
        setSavedNotice(tr('app.messages.savedNotice', 'Messages saved.'))
      } catch {
        setSavedNotice(tr('app.messages.saveError', 'Could not save messages right now.'))
      } finally {
        setIsSaving(false)
        setTimeout(() => setSavedNotice(''), 2200)
      }
    }
    save()
  }

  const handleResetDefaults = () => {
    const ownerFallbackEmail = (() => {
      if (typeof window === 'undefined') return ''
      try {
        const raw = localStorage.getItem('user')
        if (!raw) return ''
        const parsed = JSON.parse(raw) as { email?: string }
        return parsed?.email || ''
      } catch {
        return ''
      }
    })()

    setDraft({
      templates: getDefaultTemplates(countryCode),
      automationSettings: mergeAutomationSettingsWithDefaults(),
      repliesToEmail: ownerFallbackEmail,
    })
    setSavedNotice(tr('app.messages.defaultsRestored', 'Defaults restored.'))
    setTimeout(() => setSavedNotice(''), 2200)
  }

  const renderTemplateCard = (template: MessageTemplate) => (
    <div key={template.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-gray-900">{getTemplateTitle(template)}</h3>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              template.channel === 'email'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-violet-100 text-violet-700'
            }`}
          >
            {template.channel === 'email' ? (
              <EnvelopeIcon className="h-3.5 w-3.5" />
            ) : (
              <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" />
            )}
            {template.channel.toUpperCase()}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-1">{getTemplateDescription(template)}</p>
      </div>

      <div className="space-y-2">
        {template.channel === 'email' && (
          <p className="text-xs text-gray-500 truncate">
            <span className="font-semibold text-gray-600">{tr('app.messages.subjectLabel', 'Subject:')}</span> {template.subject}
          </p>
        )}
        <p className="text-xs text-gray-500 line-clamp-2">{template.message}</p>
        <button
          type="button"
          onClick={() => setEditingTemplateId(template.id)}
          className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {tr('app.messages.editMessage', 'Edit message')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="rounded-3xl border border-gray-200 bg-gradient-to-br from-white via-white to-primary-50/30 shadow-sm">
        <div className="border-b border-gray-200 p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-accent-50 p-2.5">
                <ChatBubbleLeftRightIcon className="w-6 h-6 text-accent-600" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-primary-800">
                  {tr('app.messages.pageTitle', 'Messages')}
                </h1>
                <p className="text-sm md:text-base text-gray-600 mt-1">
                  {tr(
                    'app.messages.pageSubtitle',
                    'Manage automated messages and manual send templates in one place.',
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleResetDefaults}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <ArrowPathIcon className="w-4 h-4" />
                {tr('app.messages.resetAllDefaults', 'Reset all defaults')}
              </button>
              <button
                onClick={handleSaveDraft}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <SparklesIcon className="w-4 h-4" />
                {isSaving ? tr('app.messages.saving', 'Saving...') : tr('app.messages.save', 'Save')}
              </button>
            </div>
          </div>

          {savedNotice && (
            <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
              {savedNotice}
            </div>
          )}
          {isLoadingRemote && (
            <div className="mt-3 rounded-xl bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-700">
              {tr('app.messages.loadingRemote', 'Loading saved templates...')}
            </div>
          )}
        </div>

        <div className="p-6 md:p-8 space-y-8">
          <section>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-primary-800">
                {tr('app.messages.repliesTo', 'Replies go to')}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {tr(
                  'app.messages.repliesToHelp',
                  'Customer replies from email notifications will be routed to this address. Default is company owner email.',
                )}
              </p>
              <div className="mt-4">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                  {tr('app.messages.replyToEmail', 'Reply-to email')}
                </label>
                <input
                  type="email"
                  value={draft.repliesToEmail}
                  onChange={(e) => setDraft((prev) => ({ ...prev, repliesToEmail: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-800 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                  placeholder="owner@company.com"
                />
              </div>
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center gap-2">
              <ClockIcon className="w-5 h-5 text-primary-700" />
              <h2 className="text-lg font-semibold text-primary-800">
                {tr('app.messages.sectionAutomated', 'Automated')}
              </h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 mb-4">
              {draft.automationSettings.map((setting) => {
                const linkedTemplate = draft.templates.find((t) => t.id === setting.id)
                const leadUnitLabel =
                  setting.leadUnit === 'minutes'
                    ? tr('app.messages.unitMinutes', 'minutes')
                    : tr('app.messages.unitHours', 'hours')
                const timingSummary =
                  setting.id === 'email_job_created'
                    ? tr('app.messages.timing.jobCreated', '{n} min after job is created').replace('{n}', String(setting.leadValue))
                    : setting.id === 'email_job_reminder'
                      ? tr('app.messages.timing.jobReminder', '{n} h before midnight (job day)').replace('{n}', String(setting.leadValue))
                      : setting.id === 'email_invoice_due_reminder'
                        ? tr('app.messages.timing.invoiceDue', '{n} h before midnight (due date)').replace('{n}', String(setting.leadValue))
                        : `${setting.leadValue} ${leadUnitLabel}`
                return (
                  <button
                    key={setting.id}
                    type="button"
                    onClick={() => setEditingTemplateId(setting.id)}
                    className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm text-left w-full cursor-pointer hover:border-accent-300 hover:shadow transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-semibold text-gray-900">
                            {tr(`app.messages.auto.${setting.id}.title`, setting.title)}
                          </h3>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              setting.channel === 'email'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-violet-100 text-violet-700'
                            }`}
                          >
                            {setting.channel === 'email' ? (
                              <EnvelopeIcon className="h-3.5 w-3.5" />
                            ) : (
                              <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" />
                            )}
                            {setting.channel.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {tr(`app.messages.auto.${setting.id}.description`, setting.description)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          setting.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {setting.enabled ? tr('app.messages.statusOn', 'On') : tr('app.messages.statusOff', 'Off')}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                      {setting.enabled
                        ? tr('app.messages.statusActive', 'Active')
                        : tr('app.messages.statusInactive', 'Inactive')}{' '}
                      · {timingSummary}
                    </p>
                    {setting.channel === 'email' && linkedTemplate && (
                      <p className="mt-1 text-xs text-gray-400 line-clamp-1">
                        {tr('app.messages.subjectLabel', 'Subject:')} {linkedTemplate.subject}
                      </p>
                    )}
                    <p className="mt-2 text-xs font-medium text-accent-600">
                      {tr('app.messages.openSettings', 'Open settings →')}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center gap-2">
              <EnvelopeIcon className="w-5 h-5 text-primary-700" />
              <h2 className="text-lg font-semibold text-primary-800">
                {tr('app.messages.sectionTemplates', 'Templates')}
              </h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {manualTemplates.map(renderTemplateCard)}
            </div>
          </section>

          <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 md:p-5">
            <div className="flex items-start gap-2">
              <InformationCircleIcon className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-blue-900">
                  {tr('app.messages.personalizationTags', 'Personalisation tags')}
                </h3>
                <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                  {tr(
                    'app.messages.personalizationTagsHelp',
                    'Open any template to see the tags available for that message. Click a tag button to insert it exactly where your cursor is.',
                  )}
                  {' '}
                  <span className="font-medium">
                    {tr('app.messages.personalizationTagsHelpDate', 'Date/time tags show the time only when one is scheduled — otherwise just the date.')}
                  </span>
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ── Template edit modal ─────────────────────────────────────────────── */}
      {editingTemplateId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-2xl max-h-[min(92vh,900px)] flex flex-col rounded-2xl bg-white shadow-2xl border border-gray-200">
            {(() => {
              const template = draft.templates.find((item) => item.id === editingTemplateId)
              const automationSetting = draft.automationSettings.find((s) => s.id === editingTemplateId)
              const isAutomationModal = automationSetting != null
              if (!template && !isAutomationModal) return null
              if (!template) return null

              // ── Automation modal ──────────────────────────────────────────
              if (isAutomationModal && automationSetting) {
                const isEmailAutomation =
                  automationSetting.channel === 'email' &&
                  (automationSetting.id === 'email_job_created' ||
                    automationSetting.id === 'email_job_reminder' ||
                    automationSetting.id === 'email_invoice_due_reminder')
                return (
                  <>
                    <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 shrink-0">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{getTemplateTitle(template)}</h3>
                        <p className="text-sm text-gray-500 mt-1">{getTemplateDescription(template)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingTemplateId(null)}
                        className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="overflow-y-auto px-5 py-4 space-y-5">
                      <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {tr('app.messages.modal.automation', 'Automation')}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {tr(
                              'app.messages.modal.automationHelp',
                              'When off, nothing is sent for this automation.',
                            )}
                          </p>
                        </div>
                        <AutomationSwitch
                          enabled={automationSetting.enabled}
                          onChange={(v) => updateAutomationSetting(automationSetting.id, { enabled: v })}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                          {tr('app.messages.modal.sendTiming', 'Send timing')}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step={
                              automationSetting.id === 'email_job_reminder' ||
                              automationSetting.id === 'email_invoice_due_reminder'
                                ? '0.01'
                                : '1'
                            }
                            min={0}
                            inputMode="decimal"
                            value={Number.isFinite(automationSetting.leadValue) ? automationSetting.leadValue : 0}
                            onChange={(e) => {
                              const raw = e.target.value
                              if (!raw) { updateAutomationSetting(automationSetting.id, { leadValue: 0 }); return }
                              const next = Number(raw)
                              if (!Number.isFinite(next)) return
                              updateAutomationSetting(automationSetting.id, { leadValue: next })
                            }}
                            disabled={!automationSetting.enabled}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-800 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100 disabled:bg-gray-50 disabled:text-gray-400"
                          />
                          <span className="shrink-0 text-xs font-semibold text-gray-500">
                            {automationSetting.leadUnit === 'minutes'
                              ? tr('app.messages.unitMinutes', 'minutes')
                              : tr('app.messages.unitHours', 'hours')}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-gray-500">
                          {automationSetting.id === 'email_job_created'
                            ? tr(
                                'app.messages.modal.help.jobCreated',
                                'Sends after this many minutes. Uses the latest job data at send-time; skipped if the job is cancelled.',
                              )
                            : automationSetting.id === 'email_job_reminder'
                              ? tr(
                                  'app.messages.modal.help.jobReminder',
                                  'Hours before midnight (00:00) of the job day. Skipped if that time has already passed when the job is created. Decimals allowed (e.g. 2.5 → 21:30).',
                                )
                              : automationSetting.id === 'email_invoice_due_reminder'
                                ? tr(
                                    'app.messages.modal.help.invoiceDue',
                                    'Hours before midnight (00:00) of the invoice due date. Only for sent invoices that are still unpaid. Decimals allowed.',
                                  )
                                : tr('app.messages.modal.help.generic', 'Delay before sending.')}
                        </p>
                        {(automationSetting.id === 'email_job_reminder' ||
                          automationSetting.id === 'email_invoice_due_reminder') && (
                          <p className="mt-0.5 text-[11px] text-gray-400">
                            {tr('app.messages.modal.approxMinutes', '≈ {n} min before midnight').replace(
                              '{n}',
                              String(Math.round(automationSetting.leadValue * 60)),
                            )}
                          </p>
                        )}
                      </div>

                      {isEmailAutomation ? (
                        <>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                              {tr('app.messages.modal.subject', 'Subject')}
                            </label>
                            <input
                              ref={editSubjectRef}
                              type="text"
                              value={template.subject}
                              onChange={(e) => updateTemplate(template.id, 'subject', e.target.value)}
                              onFocus={() => { lastFocusedFieldRef.current = 'subject' }}
                              disabled={!automationSetting.enabled}
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-800 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100 disabled:bg-gray-50 disabled:text-gray-400"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                              {tr('app.messages.modal.openingMessage', 'Opening message')}
                            </label>
                            <p className="text-xs text-gray-500 mb-2">
                              {tr(
                                'app.messages.modal.openingMessageHelpA',
                                'Shown under the greeting, before date and location. Tags like',
                              )}{' '}
                              <span className="font-mono text-gray-600">{'{Company name}'}</span>{' '}
                              {tr('app.messages.modal.openingMessageHelpB', 'are replaced when sending.')}
                            </p>
                            <textarea
                              ref={editMessageRef}
                              value={template.message}
                              onChange={(e) => updateTemplate(template.id, 'message', e.target.value)}
                              onFocus={() => { lastFocusedFieldRef.current = 'message' }}
                              disabled={!automationSetting.enabled}
                              rows={3}
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-800 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100 resize-none disabled:bg-gray-50 disabled:text-gray-400"
                            />
                          </div>
                          {automationSetting.enabled && renderTagButtons(automationSetting.id)}
                        </>
                      ) : (
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                            {tr('app.messages.modal.smsText', 'SMS text')}
                          </label>
                          <textarea
                            ref={editMessageRef}
                            value={template.message}
                            onChange={(e) => updateTemplate(template.id, 'message', e.target.value)}
                            onFocus={() => { lastFocusedFieldRef.current = 'message' }}
                            disabled={!automationSetting.enabled}
                            rows={6}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-800 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100 disabled:bg-gray-50 disabled:text-gray-400"
                          />
                          {automationSetting.enabled && renderTagButtons(automationSetting.id)}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-5 py-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => resetTemplateToDefault(automationSetting.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <ArrowPathIcon className="h-4 w-4" />
                        {tr('app.messages.modal.resetToDefault', 'Reset to default')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTemplateId(null)}
                        className="rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600"
                      >
                        {tr('app.messages.modal.done', 'Done')}
                      </button>
                    </div>
                  </>
                )
              }

              // ── Manual template modal ─────────────────────────────────────
              return (
                <>
                  <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 shrink-0">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{getTemplateTitle(template)}</h3>
                      <p className="text-sm text-gray-500 mt-1">{getTemplateDescription(template)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingTemplateId(null)}
                      className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="px-5 py-4 space-y-4 overflow-y-auto">
                    {template.channel === 'email' && (
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                          {tr('app.messages.modal.subject', 'Subject')}
                        </label>
                        <input
                          ref={editSubjectRef}
                          type="text"
                          value={template.subject}
                          onChange={(e) => updateTemplate(template.id, 'subject', e.target.value)}
                          onFocus={() => { lastFocusedFieldRef.current = 'subject' }}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-800 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                        {tr('app.messages.modal.messageBody', 'Message body')}
                      </label>
                      <textarea
                        ref={editMessageRef}
                        value={template.message}
                        onChange={(e) => updateTemplate(template.id, 'message', e.target.value)}
                        onFocus={() => { lastFocusedFieldRef.current = 'message' }}
                        rows={10}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-800 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                      />
                    </div>

                    {renderTagButtons(template.id)}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-5 py-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => resetTemplateToDefault(template.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <ArrowPathIcon className="h-4 w-4" />
                      {tr('app.messages.modal.resetToDefault', 'Reset to default')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTemplateId(null)}
                      className="rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600"
                    >
                      {tr('app.messages.modal.done', 'Done')}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
