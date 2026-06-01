'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from '@/app/utils/api'
import { useAppI18n } from '@/app/components/I18nProvider'
import {
  SettingsHeader,
  SettingsToggle,
  SettingsButton,
} from '@/app/components/settings/SettingsUI'
import LeadFormRenderer from '@/app/components/leads/LeadFormRenderer'
import {
  FIELD_TYPES,
  MAPPING_LABELS,
  cornerClass,
  defaultLeadFormConfig,
  fieldTypeMeta,
  genId,
  makeField,
  normalizeConfig,
  type LeadField,
  type LeadFieldMapping,
  type LeadFieldType,
  type LeadFormConfig,
} from '@/app/config/leadForm'
import {
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardDocumentIcon,
  PlusIcon,
  Square2StackIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'

const ACCENT_SWATCHES = ['#0F766E', '#2563EB', '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#16A34A', '#111827']

// Which mapping targets make sense to offer for a given field type.
const MAPPING_OPTIONS: Record<string, LeadFieldMapping[]> = {
  short_text: ['first_name', 'last_name', 'address', 'zip_code', 'city', 'country'],
  long_text: ['message'],
  email: ['email'],
  phone: ['phone'],
  date: ['preferred_date'],
  time: ['preferred_time'],
}

export default function LeadFormBuilderPage() {
  const { t } = useAppI18n()

  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<LeadFormConfig>(() => defaultLeadFormConfig())
  const [token, setToken] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)

  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const [activationSaving, setActivationSaving] = useState(false)
  const [error, setError] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [copied, setCopied] = useState<'url' | 'embed' | null>(null)

  // Snapshot of last-saved config to detect unsaved changes.
  const savedSnapshot = useRef<string>('')

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        const tk = localStorage.getItem('token')
        const res = await fetch(apiUrl('/lead-form'), { headers: { Authorization: `Bearer ${tk}` } })
        const data = await res.json()
        if (res.ok) {
          const cfg = normalizeConfig(data?.form?.settings)
          setConfig(cfg)
          setToken(data?.form?.token || null)
          setEnabled(Boolean(data?.form?.enabled))
          // If the form was never saved (no token), leave the snapshot empty so
          // the form counts as "dirty" and can be saved to generate a link.
          savedSnapshot.current = data?.form?.token ? JSON.stringify(cfg) : ''
        } else {
          setError(data?.error || 'Failed to load form')
        }
      } catch {
        setError('Network error while loading the form')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  const dirty = useMemo(() => JSON.stringify(config) !== savedSnapshot.current, [config])

  const formUrl = useMemo(() => {
    if (!token || typeof window === 'undefined') return ''
    return `${window.location.origin}/lead-form/${token}`
  }, [token])

  const embedSnippet = useMemo(() => {
    if (!formUrl) return ''
    return `<iframe src="${formUrl}" width="100%" height="720" frameborder="0" style="border:0;max-width:640px"></iframe>`
  }, [formUrl])

  // ── mutators ────────────────────────────────────────────────────────────
  const patch = (p: Partial<LeadFormConfig>) => setConfig((c) => ({ ...c, ...p }))
  const patchTheme = (p: Partial<LeadFormConfig['theme']>) =>
    setConfig((c) => ({ ...c, theme: { ...c.theme, ...p } }))

  const updateField = (id: string, p: Partial<LeadField>) =>
    setConfig((c) => ({ ...c, fields: c.fields.map((f) => (f.id === id ? { ...f, ...p } : f)) }))

  const addField = (type: LeadFieldType) => {
    const field = makeField(type)
    // Auto-map obvious built-ins so conversion works out of the box.
    if (type === 'email') field.mapping = 'email'
    if (type === 'phone') field.mapping = 'phone'
    setConfig((c) => ({ ...c, fields: [...c.fields, field] }))
    setSelectedId(field.id)
    setShowAddMenu(false)
  }

  const removeField = (id: string) => {
    setConfig((c) => ({ ...c, fields: c.fields.filter((f) => f.id !== id) }))
    if (selectedId === id) setSelectedId(null)
  }

  const duplicateField = (id: string) => {
    setConfig((c) => {
      const idx = c.fields.findIndex((f) => f.id === id)
      if (idx < 0) return c
      const copy: LeadField = {
        ...c.fields[idx],
        id: genId(),
        options: c.fields[idx].options?.map((o) => ({ ...o, id: genId('o') })),
        mapping: null, // a duplicate shouldn't double-write to the same column
      }
      const fields = [...c.fields]
      fields.splice(idx + 1, 0, copy)
      return { ...c, fields }
    })
  }

  const moveField = (id: string, dir: -1 | 1) => {
    setConfig((c) => {
      const idx = c.fields.findIndex((f) => f.id === id)
      const next = idx + dir
      if (idx < 0 || next < 0 || next >= c.fields.length) return c
      const fields = [...c.fields]
      ;[fields[idx], fields[next]] = [fields[next], fields[idx]]
      return { ...c, fields }
    })
  }

  // ── save / activate ─────────────────────────────────────────────────────
  const saveForm = async () => {
    try {
      setSaving(true)
      setError('')
      const tk = localStorage.getItem('token')
      const res = await fetch(apiUrl('/lead-form'), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: config }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Failed to save')
        return
      }
      if (data?.form?.token) setToken(data.form.token)
      savedSnapshot.current = JSON.stringify(config)
      setSavedAt(Date.now())
    } catch {
      setError('Network error while saving')
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (next: boolean) => {
    setEnabled(next)
    setActivationSaving(true)
    setError('')
    try {
      const tk = localStorage.getItem('token')
      // Persist the current form alongside activation so turning it on never
      // points at a stale/empty config.
      const res = await fetch(apiUrl('/lead-form'), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next, settings: config }),
      })
      const data = await res.json()
      if (!res.ok) {
        setEnabled(!next)
        setError(data?.error || 'Failed to update')
        return
      }
      if (data?.form?.token) setToken(data.form.token)
      savedSnapshot.current = JSON.stringify(config)
    } catch {
      setEnabled(!next)
      setError('Network error')
    } finally {
      setActivationSaving(false)
    }
  }

  const copy = async (text: string, which: 'url' | 'embed') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    )
  }

  return (
    <div className="px-6 py-8 pb-28"><div className="mx-auto max-w-7xl">
      <SettingsHeader
        title={t('settings.leads.title', 'Lead form')}
        description={
          enabled
            ? t(
                'settings.leads.introActive',
                'Your form is live. Build the fields below, then share the link or embed it on your website. New submissions land in your Leads area.',
              )
            : t(
                'settings.leads.introInactive',
                'Design your lead form below. When you’re happy with it, turn it on to start collecting leads from your website or a direct link.',
              )
        }
        action={
          <>
            {activationSaving && <span className="text-[13px] text-gray-400">{t('settings.leads.saving', 'Saving…')}</span>}
            <SettingsToggle
              checked={enabled}
              onChange={toggleEnabled}
              disabled={activationSaving}
              label={t('settings.leads.activate', 'Lead form')}
            />
          </>
        }
      />

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      )}

      {/* Mobile preview — inline at top; desktop preview sticks in the right column */}
      <div className="mb-8 lg:hidden">
        <div className="mb-2 text-[13px] font-medium text-gray-500">{t('settings.leads.preview', 'Live preview')}</div>
        <div
          className={`overflow-hidden rounded-2xl border border-gray-200 ${
            config.theme.background === 'white' ? 'bg-white' : 'bg-gray-50'
          }`}
        >
          <div className="p-4">
            <div className={`border border-gray-200 bg-white p-4 shadow-sm ${cornerClass(config.theme.corners === 'sharp' ? 'sharp' : 'rounded')}`}>
              <LeadFormRenderer config={config} values={{}} onChange={() => {}} preview />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ── Builder column ─────────────────────────────────────────────── */}
        <div className="min-w-0">
          {/* Form intro */}
          <SectionTitle>{t('settings.leads.section.content', 'Form content')}</SectionTitle>
          <div className="space-y-3">
            <LabeledInput
              label={t('settings.leads.formTitle', 'Title')}
              value={config.title}
              onChange={(v) => patch({ title: v })}
              placeholder="Request a quote"
            />
            <LabeledTextarea
              label={t('settings.leads.formDescription', 'Intro text')}
              value={config.description}
              onChange={(v) => patch({ description: v })}
              placeholder="A short line that sets expectations…"
            />
          </div>

          {/* Fields */}
          <div className="mt-12 flex items-end justify-between border-b border-gray-200 pb-3">
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('settings.leads.section.fields', 'Fields')}</h2>
              <p className="mt-1 text-[13px] text-gray-500">
                {t('settings.leads.fieldsHint', 'Drag-free reordering with the arrows. Click a field to edit it.')}
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {config.fields.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
                {t('settings.leads.noFields', 'No fields yet. Add your first field below.')}
              </div>
            )}

            {config.fields.map((field, idx) => (
              <FieldRow
                key={field.id}
                field={field}
                index={idx}
                count={config.fields.length}
                expanded={selectedId === field.id}
                onToggle={() => setSelectedId(selectedId === field.id ? null : field.id)}
                onMove={(dir) => moveField(field.id, dir)}
                onDuplicate={() => duplicateField(field.id)}
                onRemove={() => removeField(field.id)}
                onUpdate={(p) => updateField(field.id, p)}
                t={t}
              />
            ))}
          </div>

          {/* Add field */}
          <div className="relative mt-4">
            <button
              type="button"
              onClick={() => setShowAddMenu((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <PlusIcon className="h-4 w-4" />
              {t('settings.leads.addField', 'Add field')}
            </button>
            {showAddMenu && (
              <div className="absolute left-0 z-10 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
                <div className="grid grid-cols-1 gap-0.5">
                  {FIELD_TYPES.map((ft) => (
                    <button
                      key={ft.type}
                      type="button"
                      onClick={() => addField(ft.type)}
                      className="flex items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-gray-50"
                    >
                      <span className="mt-0.5 text-sm font-medium text-gray-800">{ft.label}</span>
                      <span className="ml-auto text-[11px] text-gray-400">{ft.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Appearance */}
          <SectionTitle className="mt-14">{t('settings.leads.section.appearance', 'Appearance')}</SectionTitle>
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-medium text-gray-800">{t('settings.leads.accent', 'Accent color')}</div>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENT_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => patchTheme({ accent: c })}
                    className={`h-7 w-7 rounded-full ring-offset-2 transition ${
                      config.theme.accent.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-gray-900' : ''
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
                <label className="ml-1 inline-flex items-center gap-2 text-sm text-gray-500">
                  <input
                    type="color"
                    value={config.theme.accent}
                    onChange={(e) => patchTheme({ accent: e.target.value })}
                    className="h-7 w-9 cursor-pointer rounded border border-gray-200 bg-white p-0.5"
                  />
                  {t('settings.leads.custom', 'Custom')}
                </label>
              </div>
            </div>

            <SegmentedControl
              label={t('settings.leads.corners', 'Corners')}
              value={config.theme.corners}
              onChange={(v) => patchTheme({ corners: v as any })}
              options={[
                { value: 'sharp', label: t('settings.leads.corners.sharp', 'Sharp') },
                { value: 'rounded', label: t('settings.leads.corners.rounded', 'Rounded') },
                { value: 'pill', label: t('settings.leads.corners.pill', 'Pill') },
              ]}
            />
            <SegmentedControl
              label={t('settings.leads.background', 'Background')}
              value={config.theme.background}
              onChange={(v) => patchTheme({ background: v as any })}
              options={[
                { value: 'tint', label: t('settings.leads.background.tint', 'Soft grey') },
                { value: 'white', label: t('settings.leads.background.white', 'White') },
              ]}
            />
          </div>

          {/* Submit + success */}
          <SectionTitle className="mt-14">{t('settings.leads.section.submit', 'Submit & confirmation')}</SectionTitle>
          <div className="space-y-3">
            <LabeledInput
              label={t('settings.leads.submitText', 'Button text')}
              value={config.submitText}
              onChange={(v) => patch({ submitText: v })}
              placeholder="Send request"
            />
            <LabeledInput
              label={t('settings.leads.successTitle', 'Success title')}
              value={config.successTitle}
              onChange={(v) => patch({ successTitle: v })}
              placeholder="Thank you!"
            />
            <LabeledTextarea
              label={t('settings.leads.successMessage', 'Success message')}
              value={config.successMessage}
              onChange={(v) => patch({ successMessage: v })}
              placeholder="We’ve received your request and will be in touch soon."
            />
          </div>

          {/* Notifications */}
          <SectionTitle className="mt-14">{t('settings.leads.section.notify', 'Notifications')}</SectionTitle>
          <div className="space-y-3">
            <LabeledInput
              type="email"
              label={t('settings.leads.notifyEmail', 'Email me at')}
              value={config.notifyEmail}
              onChange={(v) => patch({ notifyEmail: v })}
              placeholder="you@business.com"
              hint={t('settings.leads.notifyHint', 'We’ll send a copy of every new lead to this address. Leave blank to skip.')}
            />
          </div>

          {/* Share */}
          <SectionTitle className="mt-14">{t('settings.leads.section.share', 'Share & embed')}</SectionTitle>
          {token ? (
            <div className="space-y-5">
              <div>
                <div className="mb-1.5 text-sm font-medium text-gray-800">{t('settings.leads.directLink', 'Direct link')}</div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={formUrl}
                    className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <CopyButton copied={copied === 'url'} onClick={() => copy(formUrl, 'url')} />
                  <a
                    href={formUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
                    aria-label="Open"
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  </a>
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-sm font-medium text-gray-800">{t('settings.leads.embed', 'Embed on your website')}</div>
                <div className="flex items-start gap-2">
                  <textarea
                    readOnly
                    value={embedSnippet}
                    rows={3}
                    className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <CopyButton copied={copied === 'embed'} onClick={() => copy(embedSnippet, 'embed')} />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              {t('settings.leads.saveForLink', 'Save the form once to generate your shareable link and embed code.')}
            </p>
          )}
        </div>

        {/* ── Live preview — sticks while you scroll the builder ─────────── */}
        <div className="hidden lg:block">
          <div className="sticky top-6 z-10">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium text-gray-500">{t('settings.leads.preview', 'Live preview')}</span>
            </div>
            <div
              className={`overflow-hidden rounded-2xl border border-gray-200 ${
                config.theme.background === 'white' ? 'bg-white' : 'bg-gray-50'
              }`}
            >
              <div className="max-h-[calc(100vh-7rem)] overflow-y-auto p-5">
                <div className={`border border-gray-200 bg-white p-5 shadow-sm ${cornerClass(config.theme.corners === 'sharp' ? 'sharp' : 'rounded')}`}>
                  <LeadFormRenderer config={config} values={{}} onChange={() => {}} preview />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/90 backdrop-blur lg:left-[200px]">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3 px-6 py-3">
          {savedAt > 0 && !dirty && (
            <span className="inline-flex items-center gap-1 text-[13px] text-gray-500">
              <CheckIcon className="h-4 w-4 text-accent-600" />
              {t('settings.leads.saved', 'Saved')}
            </span>
          )}
          {dirty && <span className="text-[13px] text-gray-400">{t('settings.leads.unsaved', 'Unsaved changes')}</span>}
          <SettingsButton variant="primary" onClick={saveForm} disabled={saving || !dirty}>
            {saving ? t('settings.leads.savingShort', 'Saving…') : t('settings.leads.save', 'Save form')}
          </SettingsButton>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SectionTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-4 border-b border-gray-200 pb-3 ${className}`}>
      <h2 className="text-base font-bold text-gray-900">{children}</h2>
    </div>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  hint?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-800">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-400"
      />
      {hint && <p className="mt-1.5 text-[13px] text-gray-500">{hint}</p>}
    </div>
  )
}

function LabeledTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-800">{label}</label>
      <textarea
        rows={2}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-400"
      />
    </div>
  )
}

function SegmentedControl({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="text-sm font-medium text-gray-800">{label}</span>
      <div className="inline-flex rounded-md border border-gray-200 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded px-3 py-1 text-[13px] font-medium transition-colors ${
              value === o.value ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function CopyButton({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
      aria-label="Copy"
    >
      {copied ? <CheckIcon className="h-4 w-4 text-accent-600" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
    </button>
  )
}

function FieldRow({
  field,
  index,
  count,
  expanded,
  onToggle,
  onMove,
  onDuplicate,
  onRemove,
  onUpdate,
  t,
}: {
  field: LeadField
  index: number
  count: number
  expanded: boolean
  onToggle: () => void
  onMove: (dir: -1 | 1) => void
  onDuplicate: () => void
  onRemove: () => void
  onUpdate: (p: Partial<LeadField>) => void
  t: (k: string, d?: string) => string
}) {
  const meta = fieldTypeMeta(field.type)
  const isDisplay = field.type === 'heading' || field.type === 'paragraph'
  const hasOptions = !!meta.hasOptions
  const mappingChoices = MAPPING_OPTIONS[field.type] || []

  const addOption = () =>
    onUpdate({ options: [...(field.options || []), { id: genId('o'), label: `Option ${(field.options?.length || 0) + 1}` }] })
  const updateOption = (id: string, label: string) =>
    onUpdate({ options: (field.options || []).map((o) => (o.id === id ? { ...o, label } : o)) })
  const removeOption = (id: string) => onUpdate({ options: (field.options || []).filter((o) => o.id !== id) })

  return (
    <div className={`rounded-lg border ${expanded ? 'border-gray-300' : 'border-gray-200'} bg-white`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
            aria-label="Move up"
          >
            <ChevronUpIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            className="text-gray-300 hover:text-gray-600 disabled:opacity-30"
            aria-label="Move down"
          >
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="truncate text-sm font-medium text-gray-800">
            {isDisplay ? field.content || field.label : field.label || meta.label}
          </span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
            {meta.label}
          </span>
          {field.required && !isDisplay && <span className="text-[11px] text-red-400">{t('settings.leads.required', 'Required')}</span>}
        </button>

        <div className="flex items-center gap-1">
          <button type="button" onClick={onDuplicate} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Duplicate">
            <Square2StackIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={onRemove} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500" aria-label="Delete">
            <TrashIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={onToggle} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Edit">
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-gray-100 bg-gray-50 px-4 py-4">
          {isDisplay ? (
            <FieldEditorInput
              label={field.type === 'heading' ? t('settings.leads.headingText', 'Heading') : t('settings.leads.text', 'Text')}
              value={field.content || ''}
              onChange={(v) => onUpdate({ content: v })}
            />
          ) : field.type === 'consent' ? (
            <FieldEditorInput
              label={t('settings.leads.consentText', 'Consent text')}
              value={field.content || ''}
              onChange={(v) => onUpdate({ content: v })}
            />
          ) : (
            <>
              <FieldEditorInput label={t('settings.leads.label', 'Label')} value={field.label} onChange={(v) => onUpdate({ label: v })} />
              {field.type !== 'select' && field.type !== 'radio' && field.type !== 'checkboxes' && (
                <FieldEditorInput
                  label={t('settings.leads.placeholder', 'Placeholder')}
                  value={field.placeholder || ''}
                  onChange={(v) => onUpdate({ placeholder: v })}
                />
              )}
              <FieldEditorInput
                label={t('settings.leads.help', 'Help text')}
                value={field.help || ''}
                onChange={(v) => onUpdate({ help: v })}
              />
            </>
          )}

          {hasOptions && (
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-gray-700">{t('settings.leads.options', 'Options')}</div>
              <div className="space-y-2">
                {(field.options || []).map((o) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <input
                      value={o.label}
                      onChange={(e) => updateOption(o.id, e.target.value)}
                      className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-400"
                    />
                    <button
                      type="button"
                      onClick={() => removeOption(o.id)}
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      aria-label="Remove option"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addOption}
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-700 hover:text-accent-800"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  {t('settings.leads.addOption', 'Add option')}
                </button>
              </div>
            </div>
          )}

          {!isDisplay && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
              <label className="flex items-center gap-2 text-[13px] text-gray-700">
                <input
                  type="checkbox"
                  checked={!!field.required}
                  onChange={(e) => onUpdate({ required: e.target.checked })}
                  className="h-4 w-4 accent-gray-900"
                />
                {t('settings.leads.requiredField', 'Required')}
              </label>

              {field.type !== 'consent' && (
                <div className="flex items-center gap-2 text-[13px] text-gray-700">
                  <span>{t('settings.leads.width', 'Width')}</span>
                  <select
                    value={field.width || 'full'}
                    onChange={(e) => onUpdate({ width: e.target.value as any })}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[13px] outline-none focus:border-gray-400"
                  >
                    <option value="full">{t('settings.leads.full', 'Full')}</option>
                    <option value="half">{t('settings.leads.half', 'Half')}</option>
                  </select>
                </div>
              )}

              {mappingChoices.length > 0 && (
                <div className="flex items-center gap-2 text-[13px] text-gray-700">
                  <span>{t('settings.leads.saveTo', 'Save to')}</span>
                  <select
                    value={field.mapping || ''}
                    onChange={(e) => onUpdate({ mapping: (e.target.value || null) as any })}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[13px] outline-none focus:border-gray-400"
                  >
                    <option value="">{t('settings.leads.saveToNote', 'Note only')}</option>
                    {mappingChoices.map((m) => (
                      <option key={m} value={m}>
                        {MAPPING_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FieldEditorInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-[13px] font-medium text-gray-700">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gray-400"
      />
    </div>
  )
}
