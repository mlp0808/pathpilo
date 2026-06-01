'use client'

import type { CSSProperties } from 'react'
import { cornerClass, type LeadField, type LeadFormConfig } from '@/app/config/leadForm'

export type LeadFormValues = Record<string, any>

type Props = {
  config: LeadFormConfig
  values: LeadFormValues
  onChange: (fieldId: string, value: any) => void
  onSubmit?: () => void
  submitting?: boolean
  errors?: Record<string, string>
  /** Preview mode: render the form but swallow interactions (used in the builder). */
  preview?: boolean
}

export default function LeadFormRenderer({
  config,
  values,
  onChange,
  onSubmit,
  submitting = false,
  errors = {},
  preview = false,
}: Props) {
  const accent = config.theme.accent
  const radius = cornerClass(config.theme.corners)

  const inputClass =
    `w-full border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-400 ${radius}`

  const accentStyle: CSSProperties = { accentColor: accent }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (preview) return
    onSubmit?.()
  }

  const fieldError = (id: string) => errors[id]

  const renderField = (field: LeadField) => {
    const val = values[field.id]
    const err = fieldError(field.id)
    const labelEl = field.type === 'heading' || field.type === 'paragraph' || field.type === 'consent' ? null : (
      <label className="mb-1.5 block text-sm font-medium text-gray-800">
        {field.label}
        {field.required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
    )

    let control: React.ReactNode = null

    switch (field.type) {
      case 'heading':
        return (
          <div key={field.id} className="pt-2">
            <h3 className="text-base font-semibold text-gray-900">{field.content || field.label}</h3>
          </div>
        )
      case 'paragraph':
        return (
          <div key={field.id}>
            <p className="text-sm leading-relaxed text-gray-500">{field.content || field.label}</p>
          </div>
        )
      case 'long_text':
        control = (
          <textarea
            rows={4}
            className={inputClass}
            placeholder={field.placeholder || ''}
            value={val || ''}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        )
        break
      case 'select':
        control = (
          <select
            className={inputClass}
            style={accentStyle}
            value={val || ''}
            onChange={(e) => onChange(field.id, e.target.value)}
          >
            <option value="">{field.placeholder || 'Select…'}</option>
            {(field.options || []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        )
        break
      case 'radio':
        control = (
          <div className="flex flex-wrap gap-2">
            {(field.options || []).map((o) => {
              const active = val === o.id
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onChange(field.id, o.id)}
                  className={`border px-3.5 py-2 text-sm font-medium transition ${radius} ${
                    active ? 'text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                  style={active ? { backgroundColor: accent, borderColor: accent } : undefined}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        )
        break
      case 'checkboxes': {
        const arr: string[] = Array.isArray(val) ? val : []
        control = (
          <div className="flex flex-col gap-2">
            {(field.options || []).map((o) => {
              const checked = arr.includes(o.id)
              return (
                <label key={o.id} className="flex items-center gap-2.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    style={accentStyle}
                    className="h-4 w-4"
                    checked={checked}
                    onChange={() => {
                      const next = checked ? arr.filter((x) => x !== o.id) : [...arr, o.id]
                      onChange(field.id, next)
                    }}
                  />
                  {o.label}
                </label>
              )
            })}
          </div>
        )
        break
      }
      case 'consent':
        return (
          <div key={field.id} className="md:col-span-2">
            <label className="flex items-start gap-2.5 text-sm text-gray-600">
              <input
                type="checkbox"
                style={accentStyle}
                className="mt-0.5 h-4 w-4 flex-shrink-0"
                checked={val === true}
                onChange={(e) => onChange(field.id, e.target.checked)}
              />
              <span>
                {field.content || field.label}
                {field.required ? <span className="ml-0.5 text-red-500">*</span> : null}
              </span>
            </label>
            {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
          </div>
        )
      case 'date':
        control = (
          <input
            type="date"
            className={inputClass}
            style={accentStyle}
            value={val || ''}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        )
        break
      case 'time':
        control = (
          <input
            type="time"
            className={inputClass}
            style={accentStyle}
            value={val || ''}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        )
        break
      case 'number':
        control = (
          <input
            type="number"
            className={inputClass}
            placeholder={field.placeholder || ''}
            value={val ?? ''}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        )
        break
      case 'email':
        control = (
          <input
            type="email"
            className={inputClass}
            placeholder={field.placeholder || ''}
            value={val || ''}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        )
        break
      case 'phone':
        control = (
          <input
            type="tel"
            className={inputClass}
            placeholder={field.placeholder || ''}
            value={val || ''}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        )
        break
      default:
        control = (
          <input
            type="text"
            className={inputClass}
            placeholder={field.placeholder || ''}
            value={val || ''}
            onChange={(e) => onChange(field.id, e.target.value)}
          />
        )
    }

    return (
      <div key={field.id} className={field.width === 'half' ? 'md:col-span-1' : 'md:col-span-2'}>
        {labelEl}
        {control}
        {field.help && <p className="mt-1 text-xs text-gray-400">{field.help}</p>}
        {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      {(config.title || config.description) && (
        <div className="mb-6">
          {config.title && <h2 className="text-xl font-semibold tracking-tight text-gray-900">{config.title}</h2>}
          {config.description && (
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{config.description}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{config.fields.map(renderField)}</div>

      <button
        type="submit"
        disabled={submitting}
        className={`mt-7 w-full px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-60 ${radius}`}
        style={{ backgroundColor: accent }}
      >
        {submitting ? 'Sending…' : config.submitText || 'Submit'}
      </button>
    </form>
  )
}
