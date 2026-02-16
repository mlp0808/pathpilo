'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiUrl } from '@/app/utils/api'

type LeadFormSettings = {
  version?: number
  layout?: {
    widgets?: Array<any>
  }
  customer?: {
    fields: Record<string, boolean>
    required?: Record<string, boolean>
  }
  job?: {
    includePreferredDate?: boolean
    includePreferredTime?: boolean
    serviceSelectors?: Array<{
      id: string
      label: string
      display: 'buttons' | 'dropdown'
      columns?: 1 | 2 | 3
      multi?: boolean
      service_ids?: number[]
      service_options?: Array<{ id: number; title: string }>
    }>
  }
  custom?: {
    selectors?: Array<{
      id: string
      label: string
      display: 'buttons' | 'dropdown'
      columns?: 1 | 2 | 3
      multi?: boolean
      options?: Array<{ id: string; label: string }>
    }>
    inputs?: Array<{
      id: string
      label: string
      type: 'text' | 'number' | 'textarea'
      placeholder?: string
    }>
  }
  buttonText?: string
  ccEmail?: string
  successMessage?: string
}

export default function PublicLeadFormPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token as string

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [settings, setSettings] = useState<LeadFormSettings | null>(null)

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    country: '',
    address: '',
    zip_code: '',
    city: '',
    email: '',
    phone: '',
    preferred_date: '',
    preferred_time: '',
    message: '',
    website: '' // honeypot
  })

  const [serviceSelections, setServiceSelections] = useState<Record<string, number[]>>({})
  const [customSelections, setCustomSelections] = useState<Record<string, string[]>>({})
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({})

  const buttonText = settings?.buttonText || 'Send'
  const successMessage = settings?.successMessage || 'Thanks! We received your request and will get back to you soon.'

  const showCustomer = (key: string) => !!settings?.customer?.fields?.[key]
  const requiredCustomer = (key: string) => !!settings?.customer?.required?.[key]
  const showPreferredDate = !!settings?.job?.includePreferredDate
  const showPreferredTime = !!settings?.job?.includePreferredTime

  const canSubmit = useMemo(() => {
    if (!settings) return false
    if (requiredCustomer('email') && !form.email.trim()) return false

    // Check required checkboxes
    if (settings.layout?.widgets) {
      for (const w of settings.layout.widgets) {
        if (w.kind === 'checkbox' && w.required && !(form as any)[`checkbox_${w.id}`]) {
          return false
        }
      }
    }

    return true
  }, [settings, form])

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        setError('')
        const res = await fetch(apiUrl(`/public/lead-forms/${token}`))
        const data = await res.json()
        if (!res.ok) {
          setError(data?.error || 'Form not found')
          setSettings(null)
          return
        }
        setSettings((data.form.settings || {}) as LeadFormSettings)
      } catch (e) {
        setError('Network error: failed to load form')
      } finally {
        setLoading(false)
      }
    }
    if (token) run()
  }, [token])

  // Live preview support: Settings page can postMessage the draft settings to this iframe.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      try {
        if (event.origin !== window.location.origin) return
        const data: any = event.data
        if (!data || data.type !== 'vevago_lead_form_preview_settings') return
        if (data.token && String(data.token) !== String(token)) return
        if (!data.settings || typeof data.settings !== 'object') return

        setSettings(data.settings as LeadFormSettings)
        setError('')
        setSuccess(false)
      } catch {
        // ignore
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    try {
      setSubmitting(true)
      setError('')
      const res = await fetch(apiUrl(`/public/lead-forms/${token}/submit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          meta: {
            serviceSelections,
            customSelections,
            customInputs
          }
        })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Failed to submit')
        return
      }
      setSuccess(true)
    } catch (e) {
      setError('Network error: failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  const customerLabel = (key: string) => {
    const map: Record<string, string> = {
      first_name: 'Name',
      last_name: 'Last name',
      country: 'Country',
      address: 'Address',
      zip_code: 'Zip',
      city: 'City',
      email: 'Email',
      phone: 'Phone'
    }
    return map[key] || key
  }

  const widgets = (settings as any)?.layout?.widgets as any[] | undefined
  const hasWidgetLayout = Array.isArray(widgets) && widgets.length > 0

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-md mx-auto p-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-3 text-sm text-gray-600">Loading…</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        ) : success ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <h2 className="text-sm font-semibold text-green-900">Submitted</h2>
            <p className="mt-1 text-sm text-green-800">{successMessage}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 shadow-sm bg-white p-6">

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              {/* Honeypot */}
              <input
                type="text"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className="hidden"
                tabIndex={-1}
                autoComplete="off"
              />

              {/* Widget layout renderer (preferred). Falls back to old grouped rendering if no widgets exist. */}
              {hasWidgetLayout ? (
                (widgets || []).map((w: any) => {
                  if (w.kind === 'customer_field') {
                    const key = String(w.field)
                    if (!showCustomer(key)) return null
                    const label = w.label || customerLabel(key)
                    const req = typeof w.required === 'boolean' ? w.required : requiredCustomer(key)
                    const value = (form as any)[key] ?? ''
                    return (
                      <div key={w.id}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {label} {req ? <span className="text-red-500">*</span> : null}
                        </label>
                        <input
                          type={key === 'email' ? 'email' : 'text'}
                          required={req}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          value={value}
                          onChange={(e) => setForm({ ...form, [key]: e.target.value } as any)}
                        />
                      </div>
                    )
                  }

                  if (w.kind === 'static_text') {
                    const text = String(w.text || '').trim()
                    if (!text) return null
                    const isBold = !!w.bold
                    return (
                      <div
                        key={w.id}
                        className={`${isBold ? 'font-semibold text-[16px]' : 'font-normal text-[14px]'} text-gray-900`}
                      >
                        {text}
                      </div>
                    )
                  }

                  if (w.kind === 'preferred_date' && showPreferredDate) {
                    return (
                      <div key={w.id}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {w.label || 'Preferred date'}
                        </label>
                        <input
                          type="date"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          value={form.preferred_date}
                          onChange={(e) => setForm({ ...form, preferred_date: e.target.value })}
                        />
                      </div>
                    )
                  }

                  if (w.kind === 'preferred_time' && showPreferredTime) {
                    return (
                      <div key={w.id}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {w.label || 'Preferred time'}
                        </label>
                        <input
                          type="time"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          value={form.preferred_time}
                          onChange={(e) => setForm({ ...form, preferred_time: e.target.value })}
                        />
                      </div>
                    )
                  }

                  if (w.kind === 'checkbox') {
                    return (
                      <div key={w.id}>
                        <label className="flex items-start gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            required={!!w.required}
                            checked={!!(form as any)[`checkbox_${w.id}`]}
                            onChange={(e) => setForm({ ...form, [`checkbox_${w.id}`]: e.target.checked } as any)}
                            className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <span
                            className="text-sm"
                            dangerouslySetInnerHTML={{ __html: w.text || 'Checkbox' }}
                          />
                          {w.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                      </div>
                    )
                  }

                  if (w.kind === 'service_selector') {
                    const selector = (settings?.job?.serviceSelectors || []).find((s: any) => s.id === w.selectorId)
                    if (!selector) return null
                    const selected = serviceSelections[selector.id] || []
                    const isMulti = !!selector.multi
                    const columns = selector.columns || 2
                    const options = Array.isArray((selector as any).service_options) ? (selector as any).service_options as Array<{ id: number; title: string }> : []
                    const labelFor = (sid: number) => options.find(o => o.id === sid)?.title || `Service #${sid}`

                    const toggle = (id: number) => {
                      setServiceSelections((prev) => {
                        const curr = prev[selector.id] || []
                        if (isMulti) {
                          return { ...prev, [selector.id]: curr.includes(id) ? curr.filter(x => x !== id) : [...curr, id] }
                        }
                        return { ...prev, [selector.id]: [id] }
                      })
                    }

                    return (
                      <div key={w.id}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{selector.label || 'Select service'}</label>
                        {selector.display === 'dropdown' ? (
                          <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            value={selected[0] ?? ''}
                            onChange={(e) => toggle(parseInt(e.target.value))}
                          >
                            <option value="" disabled>Select…</option>
                            {(selector.service_ids || []).map((sid: number) => (
                              <option key={sid} value={sid}>{labelFor(sid)}</option>
                            ))}
                          </select>
                        ) : (
                          <div className={`grid gap-2 ${columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                            {(selector.service_ids || []).map((sid: number) => {
                              const active = selected.includes(sid)
                              return (
                                <button
                                  type="button"
                                  key={sid}
                                  onClick={() => toggle(sid)}
                                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                                    active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                  }`}
                                >
                                  {labelFor(sid)}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  }

                  if (w.kind === 'custom_selector') {
                    const selector = (settings?.custom?.selectors || []).find((s: any) => s.id === w.selectorId)
                    if (!selector) return null
                    const selected = customSelections[selector.id] || []
                    const isMulti = !!selector.multi
                    const columns = selector.columns || 2

                    const toggle = (val: string) => {
                      setCustomSelections((prev) => {
                        const curr = prev[selector.id] || []
                        if (isMulti) {
                          return { ...prev, [selector.id]: curr.includes(val) ? curr.filter(x => x !== val) : [...curr, val] }
                        }
                        return { ...prev, [selector.id]: [val] }
                      })
                    }

                    return (
                      <div key={w.id}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{selector.label || 'Choose an option'}</label>
                        {selector.display === 'dropdown' ? (
                          <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            value={selected[0] ?? ''}
                            onChange={(e) => toggle(e.target.value)}
                          >
                            <option value="" disabled>Select…</option>
                            {(selector.options || []).map((opt: any) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : (
                          <div className={`grid gap-2 ${columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                            {(selector.options || []).map((opt: any) => {
                              const active = selected.includes(opt.value)
                              return (
                                <button
                                  type="button"
                                  key={opt.value}
                                  onClick={() => toggle(opt.value)}
                                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                                    active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  }

                  if (w.kind === 'custom_input') {
                    const inp = (settings?.custom?.inputs || []).find((i: any) => i.id === w.inputId)
                    if (!inp) return null
                    return (
                      <div key={w.id}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {inp.label}
                        </label>
                        {inp.type === 'textarea' ? (
                          <textarea
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            value={customInputs[inp.id] || ''}
                            onChange={(e) => setCustomInputs((p) => ({ ...p, [inp.id]: e.target.value }))}
                            placeholder={inp.placeholder || ''}
                          />
                        ) : (
                          <input
                            type={inp.type === 'number' ? 'number' : 'text'}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            value={customInputs[inp.id] || ''}
                            onChange={(e) => setCustomInputs((p) => ({ ...p, [inp.id]: e.target.value }))}
                            placeholder={inp.placeholder || ''}
                          />
                        )}
                      </div>
                    )
                  }

                  return null
                })
              ) : (
                <>
                  {/* fallback: old grouped rendering */}
                  {showCustomer('first_name') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                      <input className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                    </div>
                  )}
                </>
              )}

              {/* end form fields */}

              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Sending…' : buttonText}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}


