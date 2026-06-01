'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiUrl } from '@/app/utils/api'
import {
  cornerClass,
  normalizeConfig,
  type LeadField,
  type LeadFormConfig,
} from '@/app/config/leadForm'
import LeadFormRenderer, { type LeadFormValues } from '@/app/components/leads/LeadFormRenderer'

function collectsValue(field: LeadField) {
  return field.type !== 'heading' && field.type !== 'paragraph'
}

function isEmptyValue(field: LeadField, value: any): boolean {
  if (field.type === 'checkboxes') return !Array.isArray(value) || value.length === 0
  if (field.type === 'consent') return value !== true
  return value == null || String(value).trim() === ''
}

export default function PublicLeadFormPage() {
  const params = useParams<{ token: string }>()
  const token = params?.token as string

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState(false)
  const [inactive, setInactive] = useState(false)
  const [preview, setPreview] = useState(false)

  const [config, setConfig] = useState<LeadFormConfig | null>(null)
  const [values, setValues] = useState<LeadFormValues>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [honeypot, setHoneypot] = useState('')

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        setLoadError('')
        const res = await fetch(apiUrl(`/public/lead-forms/${token}`))
        const data = await res.json()
        if (!res.ok) {
          setLoadError(data?.error || 'This form could not be found.')
          return
        }
        if (data.enabled === false) {
          setInactive(true)
        }
        setConfig(normalizeConfig(data.settings))
      } catch {
        setLoadError('Something went wrong loading this form.')
      } finally {
        setLoading(false)
      }
    }
    if (token) run()
  }, [token])

  // Live preview: the builder posts draft config into this iframe.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      try {
        if (event.origin !== window.location.origin) return
        const data: any = event.data
        if (!data || data.type !== 'vevago_lead_form_preview') return
        if (!data.config || typeof data.config !== 'object') return
        setPreview(true)
        setInactive(false)
        setLoadError('')
        setSuccess(false)
        setConfig(normalizeConfig(data.config))
        setLoading(false)
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const handleChange = (fieldId: string, value: any) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }))
    setErrors((prev) => {
      if (!prev[fieldId]) return prev
      const next = { ...prev }
      delete next[fieldId]
      return next
    })
  }

  const validate = (cfg: LeadFormConfig): Record<string, string> => {
    const next: Record<string, string> = {}
    for (const field of cfg.fields) {
      if (!collectsValue(field)) continue
      if (field.required && isEmptyValue(field, values[field.id])) {
        next[field.id] = field.type === 'consent' ? 'Required' : 'This field is required'
      }
      if (field.type === 'email' && !isEmptyValue(field, values[field.id])) {
        const v = String(values[field.id])
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) next[field.id] = 'Enter a valid email'
      }
    }
    return next
  }

  const handleSubmit = async () => {
    if (!config || preview) return
    const v = validate(config)
    setErrors(v)
    if (Object.keys(v).length > 0) return

    try {
      setSubmitting(true)
      setSubmitError('')
      const res = await fetch(apiUrl(`/public/lead-forms/${token}/submit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values, website: honeypot }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data?.error || 'Failed to submit. Please try again.')
        return
      }
      setSuccess(true)
    } catch {
      setSubmitError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const bgClass = config?.theme.background === 'white' ? 'bg-white' : 'bg-gray-50'
  const cardRadius = config ? cornerClass(config.theme.corners === 'sharp' ? 'sharp' : 'rounded') : 'rounded-2xl'

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-gray-900">Form unavailable</h1>
          <p className="mt-2 text-sm text-gray-500">{loadError}</p>
        </div>
      </div>
    )
  }

  if (inactive && !preview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-gray-900">This form isn’t active</h1>
          <p className="mt-2 text-sm text-gray-500">
            It’s not currently accepting submissions. Please check back later.
          </p>
        </div>
      </div>
    )
  }

  if (!config) return null

  return (
    <div className={`min-h-screen ${bgClass} px-4 py-10`}>
      <div className="mx-auto w-full max-w-xl">
        {success ? (
          <div className={`border border-gray-200 bg-white p-8 text-center shadow-sm ${cardRadius}`}>
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: `${config.theme.accent}1A`, color: config.theme.accent }}
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{config.successTitle || 'Thank you!'}</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">{config.successMessage}</p>
          </div>
        ) : (
          <div className={`border border-gray-200 bg-white p-6 shadow-sm sm:p-8 ${cardRadius}`}>
            {submitError && (
              <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-700">{submitError}</p>
              </div>
            )}
            {/* Honeypot — hidden from humans, tempting to bots. */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              className="absolute left-[-9999px] h-0 w-0 opacity-0"
            />
            <LeadFormRenderer
              config={config}
              values={values}
              onChange={handleChange}
              onSubmit={handleSubmit}
              submitting={submitting}
              errors={errors}
              preview={preview}
            />
          </div>
        )}

        <p className="mt-6 text-center text-xs text-gray-400">Powered by PathPilot</p>
      </div>
    </div>
  )
}
