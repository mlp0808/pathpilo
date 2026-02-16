'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from '@/app/utils/api'
import {
  AdjustmentsHorizontalIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CodeBracketIcon,
  CubeIcon,
  PencilSquareIcon,
  PlusIcon,
  SquaresPlusIcon,
  TagIcon,
  TrashIcon
} from '@heroicons/react/24/outline'

type Service = { id: number; title: string; price?: number; duration_minutes?: number }

type LeadWidget =
  | { id: string; kind: 'customer_field'; field: string; label?: string; required?: boolean }
  | { id: string; kind: 'preferred_date'; label?: string }
  | { id: string; kind: 'preferred_time'; label?: string }
  | { id: string; kind: 'static_text'; text: string; bold?: boolean }
  | { id: string; kind: 'checkbox'; label?: string; required?: boolean; text: string }
  | { id: string; kind: 'custom_input'; inputId: string }
  | { id: string; kind: 'custom_selector'; selectorId: string }
  | { id: string; kind: 'service_selector'; selectorId: string }

type LeadFormSettings = {
  version?: number
  customer: {
    fields: Record<string, boolean>
    required?: Record<string, boolean>
  }
  job: {
    includePreferredDate?: boolean
  includePreferredTime?: boolean
    serviceSelectors: Array<{
      id: string
      label: string
      display: 'buttons' | 'dropdown'
      columns?: 1 | 2 | 3
      multi?: boolean
      service_ids: number[]
      service_options?: Array<{ id: number; title: string }>
    }>
  }
  custom: {
    selectors: Array<{
      id: string
      label: string
      display: 'buttons' | 'dropdown'
      columns?: 1 | 2 | 3
      multi?: boolean
      options: Array<{ value: string; label: string }>
    }>
    inputs: Array<{
      id: string
      label: string
      type: 'text' | 'number' | 'textarea'
      required?: boolean
      placeholder?: string
    }>
  }
  layout?: {
    widgets: LeadWidget[]
  }
  buttonText?: string
  ccEmail?: string
  successMessage?: string
}

const defaultSettings: LeadFormSettings = {
  version: 2,
  customer: {
    fields: {
      first_name: true,
      last_name: true,
      country: false,
      address: false,
      zip_code: false,
      city: false,
      email: true,
      phone: false
    },
    required: { email: true }
  },
  job: {
    includePreferredDate: false,
  includePreferredTime: false,
    serviceSelectors: []
  },
  custom: { selectors: [], inputs: [] },
  layout: { widgets: [] },
  buttonText: 'Send',
  ccEmail: '',
  successMessage: 'Thanks! We received your request and will get back to you soon.'
}

export default function LeadsFormSettingsPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [initialSettings, setInitialSettings] = useState<LeadFormSettings | null>(null)
  const [showEmbedModal, setShowEmbedModal] = useState(false)
  const [testEmailAddress, setTestEmailAddress] = useState('')
  const [testEmailResult, setTestEmailResult] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [token, setToken] = useState<string>('')
  const [settings, setSettings] = useState<LeadFormSettings>(defaultSettings)
  const [services, setServices] = useState<Service[]>([])
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null)
  const [expandedWidgetId, setExpandedWidgetId] = useState<string | null>(null)
  const [showAddInputMenu, setShowAddInputMenu] = useState(false)
  const [showAddOptionMenu, setShowAddOptionMenu] = useState(false)
  const [showAddServiceMenu, setShowAddServiceMenu] = useState(false)

  const formUrl = useMemo(() => {
    if (!token) return ''
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/lead-form/${token}`
  }, [token])

  const iframeCode = useMemo(() => {
    if (!formUrl) return ''
    return `<iframe src="${formUrl}" style="width:100%;max-width:520px;height:720px;border:0;" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`
  }, [formUrl])

  const fetchForm = async () => {
    try {
      setLoading(true)
      setError('')
      const t = localStorage.getItem('token')
      const res = await fetch(apiUrl('/lead-form'), { headers: { Authorization: `Bearer ${t}` } })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Failed to load lead form settings')
        return
      }
      setToken(data.form.token)
      const incoming = (data.form.settings || defaultSettings) as LeadFormSettings
      const ensured = ensureLayout(incoming)
      setSettings(ensured)
      setInitialSettings(JSON.parse(JSON.stringify(ensured)))
    } catch (e) {
      setError('Network error: Failed to load lead form settings')
    } finally {
      setLoading(false)
    }
  }

  const fetchServices = async () => {
    try {
      const t = localStorage.getItem('token')
      const res = await fetch(apiUrl('/services'), { headers: { Authorization: `Bearer ${t}` } })
      const data = await res.json()
      if (res.ok) setServices(data.services || [])
    } catch {}
  }

  useEffect(() => {
    fetchForm()
    fetchServices()
  }, [])

  // Live preview: push current (unsaved) settings into the iframe so it updates immediately.
  useEffect(() => {
    if (!token) return
    const iframe = previewIframeRef.current
    if (!iframe?.contentWindow) return

    try {
      iframe.contentWindow.postMessage(
        {
          type: 'vevago_lead_form_preview_settings',
          token,
          settings: {
            ...settings,
            job: {
              ...settings.job,
              serviceSelectors: settings.job.serviceSelectors.map((sel) => ({
                ...sel,
                service_options: (sel.service_ids || []).map((id) => ({
                  id,
                  title: services.find((s) => s.id === id)?.title || `Service #${id}`
                }))
              }))
            }
          }
        },
        window.location.origin
      )
    } catch {
      // ignore
    }
  }, [token, settings, services])

  // Track changes for save button state
  useEffect(() => {
    if (!initialSettings) return
    const changed = JSON.stringify(settings) !== JSON.stringify(initialSettings)
    setHasChanges(changed)
  }, [settings, initialSettings])

  const toggleCustomerField = (key: string) => {
    setSettings((prev) => ({
      ...prev,
      customer: {
        ...prev.customer,
        fields: { ...(prev.customer?.fields || {}), [key]: !(prev.customer?.fields || {})[key] }
      }
    }))
  }

  const CUSTOMER_FIELDS: Array<{ key: string; label: string }> = [
    { key: 'first_name', label: 'Name' },
    { key: 'last_name', label: 'Last name' },
    { key: 'country', label: 'Country' },
    { key: 'address', label: 'Address' },
    { key: 'zip_code', label: 'Zip' },
    { key: 'city', label: 'City' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' }
  ]

  function ensureLayout(s: LeadFormSettings): LeadFormSettings {
    const next = { ...s }
    if (!next.layout) next.layout = { widgets: [] }
    if (!Array.isArray(next.layout.widgets)) next.layout.widgets = []

    // If already has widgets, keep as-is.
    if (next.layout.widgets.length > 0) return next

    // Build a sensible default widget order from existing toggles.
    const widgets: LeadWidget[] = []
    for (const f of CUSTOMER_FIELDS) {
      if (next.customer?.fields?.[f.key]) {
        widgets.push({ id: `w_${f.key}`, kind: 'customer_field', field: f.key, label: f.label, required: next.customer?.required?.[f.key] })
      }
    }
    if (next.job?.serviceSelectors?.length) {
      for (const sel of next.job.serviceSelectors) {
        widgets.push({ id: `w_service_${sel.id}`, kind: 'service_selector', selectorId: sel.id })
      }
    }
    if (next.job?.includePreferredDate) {
      widgets.push({ id: 'w_preferred_date', kind: 'preferred_date', label: 'Preferred date' })
    }
    if (next.job?.includePreferredTime) {
      widgets.push({ id: 'w_preferred_time', kind: 'preferred_time', label: 'Preferred time' })
    }
    if (next.custom?.selectors?.length) {
      for (const sel of next.custom.selectors) {
        widgets.push({ id: `w_custom_${sel.id}`, kind: 'custom_selector', selectorId: sel.id })
      }
    }
    if (next.custom?.inputs?.length) {
      for (const inp of next.custom.inputs) {
        widgets.push({ id: `w_input_${inp.id}`, kind: 'custom_input', inputId: inp.id })
      }
    }
    next.layout.widgets = widgets
    return next
  }

  const addWidget = (widget: LeadWidget) => {
    setSettings((prev) => {
      const next = ensureLayout(prev)
      return {
        ...next,
        layout: { widgets: [...(next.layout?.widgets || []), widget] }
      }
    })
    setExpandedWidgetId(widget.id)
  }

  const removeWidget = (widgetId: string) => {
    setSettings((prev) => {
      const next = ensureLayout(prev)
      return { ...next, layout: { widgets: (next.layout?.widgets || []).filter((w) => w.id !== widgetId) } }
    })
    if (expandedWidgetId === widgetId) setExpandedWidgetId(null)
  }

  const moveWidget = (widgetId: string, dir: -1 | 1) => {
    setSettings((prev) => {
      const next = ensureLayout(prev)
      const widgets = [...(next.layout?.widgets || [])]
      const idx = widgets.findIndex((w) => w.id === widgetId)
      if (idx < 0) return next
      const ni = idx + dir
      if (ni < 0 || ni >= widgets.length) return next
      const tmp = widgets[idx]
      widgets[idx] = widgets[ni]
      widgets[ni] = tmp
      return { ...next, layout: { widgets } }
    })
  }

  const addCustomerFieldWidget = (fieldKey: string) => {
    const label = CUSTOMER_FIELDS.find((f) => f.key === fieldKey)?.label || fieldKey
    // Enable field in settings
    setSettings((prev) => ({
      ...prev,
      customer: {
        ...prev.customer,
        fields: { ...prev.customer.fields, [fieldKey]: true }
      }
    }))
    addWidget({ id: `w_${fieldKey}_${Math.random().toString(16).slice(2)}`, kind: 'customer_field', field: fieldKey, label })
  }

  const addPreferredDateWidget = () => {
    setSettings((prev) => ({ ...prev, job: { ...prev.job, includePreferredDate: true } }))
    addWidget({ id: `w_preferred_date_${Math.random().toString(16).slice(2)}`, kind: 'preferred_date', label: 'Preferred date' })
  }

  const addPreferredTimeWidget = () => {
    setSettings((prev) => ({ ...prev, job: { ...prev.job, includePreferredTime: true } }))
    addWidget({ id: `w_preferred_time_${Math.random().toString(16).slice(2)}`, kind: 'preferred_time', label: 'Preferred time' })
  }

  const addCustomInputWidget = (type: 'text' | 'number' | 'textarea') => {
    const id = `input_${Math.random().toString(16).slice(2)}`
    const label = type === 'textarea' ? 'Message' : type === 'number' ? 'Number' : 'Text'
    setSettings((prev) => ({
      ...prev,
      custom: {
        ...prev.custom,
        inputs: [...prev.custom.inputs, { id, label, type, required: false }]
      }
    }))
    addWidget({ id: `w_input_${id}`, kind: 'custom_input', inputId: id })
  }

  const addOptionWidget = (display: 'buttons' | 'dropdown') => {
    const id = `custom_${Math.random().toString(16).slice(2)}`
    setSettings((prev) => ({
      ...prev,
      custom: {
        ...prev.custom,
        selectors: [
          ...prev.custom.selectors,
          {
            id,
            label: 'Choose an option',
            display,
            columns: 2,
            multi: false,
            options: [{ value: 'option-1', label: 'Option 1' }]
          }
        ]
      }
    }))
    addWidget({ id: `w_custom_${id}`, kind: 'custom_selector', selectorId: id })
  }

  const addServiceWidget = (display: 'buttons' | 'dropdown') => {
    const id = `services_${Math.random().toString(16).slice(2)}`
    setSettings((prev) => ({
      ...prev,
      job: {
        ...prev.job,
        serviceSelectors: [
          ...prev.job.serviceSelectors,
          { id, label: 'Select service', display, columns: 2, multi: false, service_ids: [], service_options: [] }
        ]
      }
    }))
    addWidget({ id: `w_service_${id}`, kind: 'service_selector', selectorId: id })
  }

  const addStaticTextWidget = () => {
    addWidget({
      id: `w_text_${Math.random().toString(16).slice(2)}`,
      kind: 'static_text',
      text: 'New section',
      bold: true
    })
  }

  const addCheckboxWidget = () => {
    addWidget({
      id: `w_checkbox_${Math.random().toString(16).slice(2)}`,
      kind: 'checkbox',
      label: 'Terms & Conditions',
      required: true,
      text: 'I agree to the <a href="#" target="_blank">Terms & Conditions</a>'
    })
  }

  const save = async () => {
    try {
      setSaving(true)
      setError('')
      const t = localStorage.getItem('token')
      const res = await fetch(apiUrl('/lead-form'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          settings: {
            ...settings,
            layout: ensureLayout(settings).layout,
            // ensure selector labels are stored for iframe rendering
            job: {
              ...settings.job,
              serviceSelectors: settings.job.serviceSelectors.map((sel) => ({
                ...sel,
                service_options: (sel.service_ids || []).map((id) => ({
                  id,
                  title: services.find((s) => s.id === id)?.title || `Service #${id}`
                }))
              }))
            }
          }
        })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Failed to save lead form settings')
        return
      }
      setToken(data.form.token)
      const updated = (data.form.settings || defaultSettings) as LeadFormSettings
      setSettings(updated)
      setInitialSettings(JSON.parse(JSON.stringify(updated)))
      setHasChanges(false)
    } catch (e) {
      setError('Network error: Failed to save lead form settings')
    } finally {
      setSaving(false)
    }
  }

  const CustomerRow = ({ id, label, help }: { id: string; label: string; help?: string }) => (
    <label className="flex items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={!!settings.customer?.fields?.[id]}
        onChange={() => toggleCustomerField(id)}
        className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {help && <span className="block text-xs text-gray-500">{help}</span>}
      </span>
    </label>
  )

  const addServiceSelector = () => {
    const id = `services_${Math.random().toString(16).slice(2)}`
    setSettings((prev) => ({
      ...prev,
      job: {
        ...prev.job,
        serviceSelectors: [
          ...prev.job.serviceSelectors,
          { id, label: 'Select service', display: 'buttons', columns: 2, multi: false, service_ids: [], service_options: [] }
        ]
      }
    }))
  }

  const updateServiceSelector = (selectorId: string, patch: any) => {
    setSettings((prev) => ({
      ...prev,
      job: {
        ...prev.job,
        serviceSelectors: prev.job.serviceSelectors.map((s) => (s.id === selectorId ? { ...s, ...patch } : s))
      }
    }))
  }

  const removeServiceSelector = (selectorId: string) => {
    setSettings((prev) => ({
      ...prev,
      job: {
        ...prev.job,
        serviceSelectors: prev.job.serviceSelectors.filter((s) => s.id !== selectorId)
      }
    }))
  }

  const addCustomSelector = () => {
    const id = `custom_${Math.random().toString(16).slice(2)}`
    setSettings((prev) => ({
      ...prev,
      custom: {
        ...prev.custom,
        selectors: [
          ...(prev.custom.selectors || []),
          {
            id,
            label: 'Choose an option',
            display: 'buttons',
            columns: 2,
            multi: false,
            options: [{ value: 'option-1', label: 'Option 1' }]
          }
        ]
      }
    }))
  }

  const updateCustomSelector = (selectorId: string, patch: any) => {
    setSettings((prev) => ({
      ...prev,
      custom: {
        ...prev.custom,
        selectors: (prev.custom.selectors || []).map((s) => (s.id === selectorId ? { ...s, ...patch } : s))
      }
    }))
  }

  const removeCustomSelector = (selectorId: string) => {
    setSettings((prev) => ({
      ...prev,
      custom: {
        ...prev.custom,
        selectors: (prev.custom.selectors || []).filter((s) => s.id !== selectorId)
      }
    }))
  }

  const addCustomOption = (selectorId: string) => {
    setSettings((prev) => ({
      ...prev,
      custom: {
        ...prev.custom,
        selectors: (prev.custom.selectors || []).map((s) => {
          if (s.id !== selectorId) return s
          const nextIndex = (s.options?.length || 0) + 1
          return {
            ...s,
            options: [...(s.options || []), { value: `option-${nextIndex}`, label: `Option ${nextIndex}` }]
          }
        })
      }
    }))
  }

  const updateCustomOption = (selectorId: string, optionIndex: number, patch: any) => {
    setSettings((prev) => ({
      ...prev,
      custom: {
        ...prev.custom,
        selectors: (prev.custom.selectors || []).map((s) => {
          if (s.id !== selectorId) return s
          const opts = (s.options || []).map((o, idx) => (idx === optionIndex ? { ...o, ...patch } : o))
          return { ...s, options: opts }
        })
      }
    }))
  }

  const removeCustomOption = (selectorId: string, optionIndex: number) => {
    setSettings((prev) => ({
      ...prev,
      custom: {
        ...prev.custom,
        selectors: (prev.custom.selectors || []).map((s) => {
          if (s.id !== selectorId) return s
          const opts = (s.options || []).filter((_, idx) => idx !== optionIndex)
          return { ...s, options: opts }
        })
      }
    }))
  }

  const widgets = ensureLayout(settings).layout?.widgets || []

  return (
    <div className="w-full max-w-none">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Lead form</h1>
        <p className="text-sm text-gray-600">Embed this form on your website to collect leads.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">Form builder</div>
              <div className="text-xs text-gray-500">Add widgets and arrange the order they show on the form.</div>
            </div>
            <button
              onClick={save}
              disabled={saving || loading || !hasChanges}
              className={`text-sm px-3 py-2 rounded-lg transition-colors ${
                hasChanges && !saving
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              } disabled:opacity-50`}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {/* Add buttons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowAddInputMenu((v) => !v)
                  setShowAddOptionMenu(false)
                  setShowAddServiceMenu(false)
                }}
                className="w-full rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-4 py-3 flex items-center gap-3 shadow-sm"
              >
                <PencilSquareIcon className="w-5 h-5 text-blue-600" />
                <div className="text-left">
                  <div className="text-sm font-semibold text-gray-900">Add field</div>
                  <div className="text-xs text-gray-500">Customer details / custom input</div>
                </div>
                <div className="ml-auto text-gray-400">
                  {showAddInputMenu ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                </div>
              </button>

              {showAddInputMenu && (
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50 border-b border-gray-200">
                    Customer details
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {CUSTOMER_FIELDS.map((f) => (
                      <button
                        type="button"
                        key={f.key}
                        onClick={() => {
                          addCustomerFieldWidget(f.key)
                          setShowAddInputMenu(false)
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        {f.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        addPreferredDateWidget()
                        setShowAddInputMenu(false)
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-t border-gray-100"
                    >
                      Preferred date
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        addPreferredTimeWidget()
                        setShowAddInputMenu(false)
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-t border-gray-100"
                    >
                      Preferred time
                    </button>
                  </div>
                  <div className="px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50 border-y border-gray-200">
                    Custom input
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        addCustomInputWidget('text')
                        setShowAddInputMenu(false)
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      Text input
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        addCustomInputWidget('number')
                        setShowAddInputMenu(false)
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      Number input
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        addCustomInputWidget('textarea')
                        setShowAddInputMenu(false)
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      Textarea
                    </button>
                  </div>
                  <div className="px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50 border-y border-gray-200">
                    Static text
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        addStaticTextWidget()
                        setShowAddInputMenu(false)
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      Static text
                    </button>
                  </div>
                  <div className="px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50 border-y border-gray-200">
                    Checkbox
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        addCheckboxWidget()
                        setShowAddInputMenu(false)
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      Checkbox
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowAddOptionMenu((v) => !v)
                  setShowAddInputMenu(false)
                  setShowAddServiceMenu(false)
                }}
                className="w-full rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-4 py-3 flex items-center gap-3 shadow-sm"
              >
                <TagIcon className="w-5 h-5 text-blue-600" />
                <div className="text-left">
                  <div className="text-sm font-semibold text-gray-900">Add option</div>
                  <div className="text-xs text-gray-500">Dropdown / buttons</div>
                </div>
                <div className="ml-auto text-gray-400">
                  {showAddOptionMenu ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                </div>
              </button>

              {showAddOptionMenu && (
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50 border-y border-gray-200">
                    Selector
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      addOptionWidget('buttons')
                      setShowAddOptionMenu(false)
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    Inline buttons
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addOptionWidget('dropdown')
                      setShowAddOptionMenu(false)
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    Dropdown (single select)
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowAddServiceMenu((v) => !v)
                  setShowAddInputMenu(false)
                  setShowAddOptionMenu(false)
                }}
                className="w-full rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-4 py-3 flex items-center gap-3 shadow-sm"
              >
                <CubeIcon className="w-5 h-5 text-blue-600" />
                <div className="text-left">
                  <div className="text-sm font-semibold text-gray-900">Add service</div>
                  <div className="text-xs text-gray-500">Dropdown / buttons</div>
                </div>
                <div className="ml-auto text-gray-400">
                  {showAddServiceMenu ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                </div>
              </button>

              {showAddServiceMenu && (
                <div className="absolute z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      addServiceWidget('buttons')
                      setShowAddServiceMenu(false)
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    Inline buttons
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addServiceWidget('dropdown')
                      setShowAddServiceMenu(false)
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    Dropdown (single select)
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Widgets list */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">Widgets</div>
              <div className="text-xs text-gray-500">{widgets.length} item(s)</div>
            </div>

            {widgets.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">Add a widget to start building your form.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {widgets.map((w, idx) => {
                  const isOpen = expandedWidgetId === w.id
                  const title =
                    w.kind === 'customer_field'
                      ? (w.label || w.field)
                      : w.kind === 'preferred_date'
                      ? 'Preferred date'
                      : w.kind === 'preferred_time'
                      ? 'Preferred time'
                      : w.kind === 'custom_input'
                      ? (settings.custom.inputs.find((i) => i.id === (w as any).inputId)?.label || 'Input')
                      : w.kind === 'custom_selector'
                      ? (settings.custom.selectors.find((s) => s.id === (w as any).selectorId)?.label || 'Option')
                      : w.kind === 'service_selector'
                      ? (settings.job.serviceSelectors.find((s) => s.id === (w as any).selectorId)?.label || 'Service')
                      : w.kind === 'static_text'
                      ? 'Static text'
                      : w.kind === 'checkbox'
                      ? 'Checkbox'
                      : 'Widget'

                  return (
                    <div key={w.id} className="bg-white">
                      <button
                        type="button"
                        onClick={() => setExpandedWidgetId(isOpen ? null : w.id)}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50"
                      >
                        <div className="text-sm font-semibold text-gray-900 truncate">{title}</div>
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              moveWidget(w.id, -1)
                            }}
                            disabled={idx === 0}
                            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                          >
                            <ChevronUpIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              moveWidget(w.id, 1)
                            }}
                            disabled={idx === widgets.length - 1}
                            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                          >
                            <ChevronDownIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeWidget(w.id)
                            }}
                            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                            title="Remove widget"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                          <div className="text-gray-400">{isOpen ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}</div>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4">
                          {w.kind === 'customer_field' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <div className="text-xs text-gray-500 mb-1">Displayed title</div>
                                <input
                                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                                  value={w.label || ''}
                                  onChange={(e) => {
                                    const label = e.target.value
                                    setSettings((prev) => {
                                      const next = ensureLayout(prev)
                                      return {
                                        ...next,
                                        layout: {
                                          widgets: (next.layout?.widgets || []).map((x) => (x.id === w.id ? { ...(x as any), label } : x))
                                        }
                                      }
                                    })
                                  }}
                                />
                              </div>
                              <div className="flex items-end">
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                  <input
                                    type="checkbox"
                                    checked={!!w.required}
                                    onChange={() => {
                                      const req = !w.required
                                      setSettings((prev) => {
                                        const next = ensureLayout(prev)
                                        // store on widget
                                        const widgets2 = (next.layout?.widgets || []).map((x) => (x.id === w.id ? { ...(x as any), required: req } : x))
                                        // also map known required onto settings.customer.required
                                        const customerReq = { ...(next.customer.required || {}) }
                                        customerReq[w.field] = req
                                        return { ...next, layout: { widgets: widgets2 }, customer: { ...next.customer, required: customerReq } }
                                      })
                                    }}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                  />
                                  Required
                                </label>
                              </div>
                            </div>
                          )}

                          {w.kind === 'preferred_date' && (
                            <div className="text-sm text-gray-600">
                              This widget collects a preferred date from the customer.
                            </div>
                          )}

                          {w.kind === 'preferred_time' && (
                            <div className="text-sm text-gray-600">
                              This widget collects a preferred time from the customer.
                            </div>
                          )}

                          {w.kind === 'static_text' && (
                            <div className="space-y-3">
                              <div>
                                <div className="text-xs text-gray-500 mb-1">Text</div>
                                <textarea
                                  className="w-full min-h-[90px] text-sm border border-gray-200 rounded-lg px-3 py-2"
                                  value={w.text || ''}
                                  onChange={(e) => {
                                    const text = e.target.value
                                    setSettings((prev) => {
                                      const next = ensureLayout(prev)
                                      return {
                                        ...next,
                                        layout: {
                                          widgets: (next.layout?.widgets || []).map((x) => (x.id === w.id ? { ...(x as any), text } : x))
                                        }
                                      }
                                    })
                                  }}
                                />
                              </div>
                              <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={!!w.bold}
                                  onChange={() => {
                                    const bold = !w.bold
                                    setSettings((prev) => {
                                      const next = ensureLayout(prev)
                                      return {
                                        ...next,
                                        layout: {
                                          widgets: (next.layout?.widgets || []).map((x) => (x.id === w.id ? { ...(x as any), bold } : x))
                                        }
                                      }
                                    })
                                  }}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                Bold (2px larger)
                              </label>
                            </div>
                          )}

                          {w.kind === 'checkbox' && (
                            <div className="space-y-3">
                              <div>
                                <div className="text-xs text-gray-500 mb-1">Label</div>
                                <input
                                  type="text"
                                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                                  value={w.label || ''}
                                  onChange={(e) => {
                                    const label = e.target.value
                                    setSettings((prev) => {
                                      const next = ensureLayout(prev)
                                      return {
                                        ...next,
                                        layout: {
                                          widgets: (next.layout?.widgets || []).map((x) => (x.id === w.id ? { ...(x as any), label } : x))
                                        }
                                      }
                                    })
                                  }}
                                />
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 mb-1">Text (supports HTML links)</div>
                                <textarea
                                  className="w-full min-h-[90px] text-sm border border-gray-200 rounded-lg px-3 py-2"
                                  value={w.text || ''}
                                  onChange={(e) => {
                                    const text = e.target.value
                                    setSettings((prev) => {
                                      const next = ensureLayout(prev)
                                      return {
                                        ...next,
                                        layout: {
                                          widgets: (next.layout?.widgets || []).map((x) => (x.id === w.id ? { ...(x as any), text } : x))
                                        }
                                      }
                                    })
                                  }}
                                />
                              </div>
                              <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={!!w.required}
                                  onChange={() => {
                                    const req = !w.required
                                    setSettings((prev) => {
                                      const next = ensureLayout(prev)
                                      return {
                                        ...next,
                                        layout: {
                                          widgets: (next.layout?.widgets || []).map((x) => (x.id === w.id ? { ...(x as any), required: req } : x))
                                        }
                                      }
                                    })
                                  }}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                Required
                              </label>
                            </div>
                          )}

                          {w.kind === 'custom_input' && (() => {
                            const inp = settings.custom.inputs.find((i) => i.id === w.inputId)
                            if (!inp) return null
                            return (
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">Title</div>
                                    <input
                                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                                      value={inp.label}
                                      onChange={(e) => {
                                        const label = e.target.value
                                        setSettings((prev) => ({
                                          ...prev,
                                          custom: {
                                            ...prev.custom,
                                            inputs: prev.custom.inputs.map((x) => (x.id === inp.id ? { ...x, label } : x))
                                          }
                                        }))
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">Type</div>
                                    <select
                                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
                                      value={inp.type}
                                      onChange={(e) => {
                                        const type = e.target.value as any
                                        setSettings((prev) => ({
                                          ...prev,
                                          custom: {
                                            ...prev.custom,
                                            inputs: prev.custom.inputs.map((x) => (x.id === inp.id ? { ...x, type } : x))
                                          }
                                        }))
                                      }}
                                    >
                                      <option value="text">Text</option>
                                      <option value="number">Number</option>
                                      <option value="textarea">Textarea</option>
                                    </select>
                                  </div>
                                </div>
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                  <input
                                    type="checkbox"
                                    checked={!!inp.required}
                                    onChange={() => {
                                      setSettings((prev) => ({
                                        ...prev,
                                        custom: {
                                          ...prev.custom,
                                          inputs: prev.custom.inputs.map((x) => (x.id === inp.id ? { ...x, required: !x.required } : x))
                                        }
                                      }))
                                    }}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                  />
                                  Required
                                </label>
                              </div>
                            )
                          })()}

                          {w.kind === 'custom_selector' && (() => {
                            const sel = settings.custom.selectors.find((s) => s.id === w.selectorId)
                            if (!sel) return null
                            return (
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">Title</div>
                                    <input
                                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                                      value={sel.label}
                                      onChange={(e) => updateCustomSelector(sel.id, { label: e.target.value })}
                                    />
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">Display</div>
                                    <select
                                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
                                      value={sel.display}
                                      onChange={(e) => updateCustomSelector(sel.id, { display: e.target.value })}
                                    >
                                      <option value="buttons">Inline buttons</option>
                                      <option value="dropdown">Dropdown</option>
                                    </select>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">Columns</div>
                                    <select
                                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
                                      value={sel.columns || 2}
                                      onChange={(e) => updateCustomSelector(sel.id, { columns: parseInt(e.target.value, 10) })}
                                      disabled={sel.display !== 'buttons'}
                                    >
                                      <option value={1}>1</option>
                                      <option value={2}>2</option>
                                      <option value={3}>3</option>
                                    </select>
                                  </div>
                                  <div className="flex items-end">
                                    <label className="flex items-center gap-2 text-sm text-gray-700">
                                      <input
                                        type="checkbox"
                                        checked={!!sel.multi}
                                        onChange={() => updateCustomSelector(sel.id, { multi: !sel.multi })}
                                        disabled={sel.display !== 'buttons'}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                      />
                                      Multiselect
                                    </label>
                                  </div>
                                </div>
                                <div className="rounded-lg border border-gray-200 overflow-hidden">
                                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                    <div className="text-xs font-semibold text-gray-700">Options</div>
                                    <button
                                      type="button"
                                      onClick={() => addCustomOption(sel.id)}
                                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                                    >
                                      + Add
                                    </button>
                                  </div>
                                  <div className="p-3 space-y-2">
                                    {(sel.options || []).map((opt, oi) => (
                                      <div key={`${sel.id}-${oi}`} className="grid grid-cols-12 gap-2 items-center">
                                        <input
                                          className="col-span-5 text-sm border border-gray-200 rounded-lg px-3 py-2"
                                          value={opt.label}
                                          onChange={(e) => updateCustomOption(sel.id, oi, { label: e.target.value })}
                                        />
                                        <input
                                          className="col-span-5 text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono"
                                          value={opt.value}
                                          onChange={(e) => updateCustomOption(sel.id, oi, { value: e.target.value })}
                                        />
                                        <button
                                          type="button"
                                          className="col-span-2 text-xs text-gray-500 hover:text-gray-700"
                                          onClick={() => removeCustomOption(sel.id, oi)}
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )
                          })()}

                          {w.kind === 'service_selector' && (() => {
                            const sel = settings.job.serviceSelectors.find((s) => s.id === w.selectorId)
                            if (!sel) return null
                            return (
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">Title</div>
                                    <input
                                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                                      value={sel.label}
                                      onChange={(e) => updateServiceSelector(sel.id, { label: e.target.value })}
                                    />
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">Display</div>
                                    <select
                                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
                                      value={sel.display}
                                      onChange={(e) => updateServiceSelector(sel.id, { display: e.target.value })}
                                    >
                                      <option value="buttons">Inline buttons</option>
                                      <option value="dropdown">Dropdown</option>
                                    </select>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">Columns</div>
                                    <select
                                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
                                      value={sel.columns || 2}
                                      onChange={(e) => updateServiceSelector(sel.id, { columns: parseInt(e.target.value, 10) })}
                                      disabled={sel.display !== 'buttons'}
                                    >
                                      <option value={1}>1</option>
                                      <option value={2}>2</option>
                                      <option value={3}>3</option>
                                    </select>
                                  </div>
                                  <div className="flex items-end">
                                    <label className="flex items-center gap-2 text-sm text-gray-700">
                                      <input
                                        type="checkbox"
                                        checked={!!sel.multi}
                                        onChange={() => updateServiceSelector(sel.id, { multi: !sel.multi })}
                                        disabled={sel.display !== 'buttons'}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                      />
                                      Multiselect
                                    </label>
                                  </div>
                                </div>
                                <div className="rounded-lg border border-gray-200 overflow-hidden">
                                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                    <div className="text-xs font-semibold text-gray-700">Services</div>
                                    <div className="text-xs text-gray-500">{sel.service_ids?.length || 0} selected</div>
                                  </div>
                                  <div className="p-3 max-h-44 overflow-y-auto space-y-1">
                                    {services.length === 0 ? (
                                      <div className="text-xs text-gray-500">No services found.</div>
                                    ) : (
                                      services.map((svc) => {
                                        const active = (sel.service_ids || []).includes(svc.id)
                                        return (
                                          <label key={svc.id} className="flex items-center gap-2 py-1">
                                            <input
                                              type="checkbox"
                                              checked={active}
                                              onChange={() => {
                                                const next = active
                                                  ? (sel.service_ids || []).filter((id) => id !== svc.id)
                                                  : [...(sel.service_ids || []), svc.id]
                                                updateServiceSelector(sel.id, { service_ids: next })
                                              }}
                                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                            />
                                            <span className="text-sm text-gray-800">{svc.title}</span>
                                          </label>
                                        )
                                      })
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Submit button - accordion like other widgets */}
                <div className="bg-white border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setExpandedWidgetId(expandedWidgetId === 'submit' ? null : 'submit')}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50"
                  >
                    <div className="text-sm font-semibold text-gray-900">
                      {settings.buttonText || 'Send'}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <div className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">
                        Submit button
                      </div>
                      <div className="text-gray-400">
                        {expandedWidgetId === 'submit' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                      </div>
                    </div>
                  </button>

                  {expandedWidgetId === 'submit' && (
                    <div className="px-4 pb-4">
                      <div className="text-sm font-semibold text-gray-900 mb-3">Form settings</div>
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Button text</div>
                          <input
                            type="text"
                            value={settings.buttonText || ''}
                            onChange={(e) => setSettings({ ...settings, buttonText: e.target.value })}
                            placeholder="Send"
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">CC email (notifications)</div>
                          <input
                            type="email"
                            value={settings.ccEmail || ''}
                            onChange={(e) => setSettings({ ...settings, ccEmail: e.target.value })}
                            placeholder="your@email.com"
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
                          />
                          <div className="text-xs text-gray-500 mt-1">Email address to notify when form is submitted</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm font-semibold text-gray-900 mb-2">Preview</div>
          <div className="text-xs text-gray-500 mb-3">See how your form looks</div>
          {formUrl ? (
            <iframe
              ref={previewIframeRef}
              src={formUrl}
              style={{ width: '100%', height: 400, border: 0 }}
              title="Lead form preview"
            />
          ) : (
            <div className="text-xs text-gray-500">{loading ? 'Loading…' : 'No form URL'}</div>
          )}

          <div className="mt-4 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setShowEmbedModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <CodeBracketIcon className="w-5 h-5" />
              Deploy to Website
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 xl:col-span-3">
          <div className="text-sm font-semibold text-gray-900 mb-3">Test Email</div>
          <div className="space-y-3">
            <div className="text-xs text-gray-500 mb-1">
              Send a test email to verify your configuration
            </div>
            <div className="flex gap-2 max-w-md">
              <input
                type="email"
                placeholder="your@email.com"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!testEmailAddress) return

                  try {
                    setTestEmailResult('Sending...')
                    const url = apiUrl('/test-email')
                    console.log('Making request to:', url)
                    console.log('Window location:', window.location.href)
                    console.log('NEXT_PUBLIC_API_URL env:', process.env.NEXT_PUBLIC_API_URL)
                    const response = await fetch(url, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ to: testEmailAddress })
                    })

                    const data = await response.json()

                    if (response.ok) {
                      setTestEmailResult('✅ Test email sent successfully!')
                    } else {
                      setTestEmailResult(`❌ Failed: ${data.error}`)
                    }
                  } catch (error) {
                    setTestEmailResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
                  }
                }}
                disabled={!testEmailAddress}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send Test
              </button>
            </div>
            {testEmailResult && (
              <div className={`text-xs p-2 rounded max-w-md ${testEmailResult.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {testEmailResult}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Embed Code Modal */}
      {showEmbedModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Embed Code</h3>
              <button
                type="button"
                onClick={() => setShowEmbedModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Close</span>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Form URL</div>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={formUrl || ''}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (formUrl) {
                        navigator.clipboard.writeText(formUrl)
                      }
                    }}
                    className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Iframe Code</div>
                <div className="flex gap-2">
                  <textarea
                    readOnly
                    value={iframeCode || ''}
                    className="flex-1 min-h-[120px] text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (iframeCode) {
                        navigator.clipboard.writeText(iframeCode)
                      }
                    }}
                    className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 self-start"
                  >
                    Copy
                  </button>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Copy and paste this code into your website's HTML where you want the form to appear.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


