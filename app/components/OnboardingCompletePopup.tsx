'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiUrl } from '../utils/api'
import { SESSION_UPDATED_EVENT } from '../hooks/useUser'
import { completeOnboardingWizard } from '../utils/onboardingClient'

const FLAG_KEY = 'vevago_pending_celebration'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function OnboardingCompletePopup({ forceShow = false }: { forceShow?: boolean }) {
  const [show, setShow] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prefilled, setPrefilled] = useState(false)

  useEffect(() => {
    if (forceShow) {
      try {
        const raw = localStorage.getItem('user')
        if (raw) {
          const user = JSON.parse(raw)
          const name = user?.activeCompany?.name || user?.companyName || ''
          if (name) { setCompanyName(name); setPrefilled(true) }
        }
      } catch { /* ignore */ }
      setShow(true)
      return
    }
    try {
      const flag = localStorage.getItem(FLAG_KEY)
      if (flag !== 'true') return

      // Pre-fill with existing company name from session
      const raw = localStorage.getItem('user')
      if (raw) {
        const user = JSON.parse(raw)
        const name = user?.activeCompany?.name || user?.companyName || ''
        if (name) { setCompanyName(name); setPrefilled(true) }
      }
      setShow(true)
    } catch { /* ignore */ }
  }, [forceShow])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = companyName.trim()
    if (!trimmed) { setError('Please enter your company name.'); return }
    setSaving(true)
    setError(null)

    try {
      const token = localStorage.getItem('token')
      const newSlug = slugify(trimmed)

      // Read the current slug from the session so we can fall back to it if the update fails.
      let currentSlug = ''
      try {
        const raw = localStorage.getItem('user')
        if (raw) {
          const u = JSON.parse(raw)
          currentSlug = u?.activeCompany?.slug || ''
        }
      } catch { /* ignore */ }

      // 1. Update company name
      const nameRes = await fetch(apiUrl('/companies/profile'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!nameRes.ok) {
        const d = await nameRes.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to update company name')
      }

      // 2. Update slug (derived from name, best-effort — may be taken).
      // The endpoint is PATCH /api/companies/slug.
      let finalSlug = currentSlug || newSlug
      if (newSlug.length >= 2) {
        const slugRes = await fetch(apiUrl('/companies/slug'), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ slug: newSlug }),
        })
        if (slugRes.ok) {
          const slugData = await slugRes.json().catch(() => ({}))
          finalSlug = slugData.slug || newSlug
        }
        // If slug is taken or fails, keep the old slug so the redirect still works.
      }

      // 3. Patch session so the new name + slug are reflected immediately
      try {
        const raw = localStorage.getItem('user')
        if (raw) {
          const user = JSON.parse(raw)
          if (user.activeCompany) {
            user.activeCompany.name = trimmed
            user.activeCompany.slug = finalSlug
          }
          user.companyName = trimmed
          if (Array.isArray(user.companies)) {
            for (const c of user.companies) {
              if (c && (c.id === user.activeCompany?.id || user.companies.length === 1)) {
                c.name = trimmed
                c.slug = finalSlug
              }
            }
          }
          localStorage.setItem('user', JSON.stringify(user))
          window.dispatchEvent(new Event(SESSION_UPDATED_EVENT))
        }
      } catch { /* ignore */ }

      // 4. Mark onboarding as complete in DB (if not already done)
      await completeOnboardingWizard()

      // 5. Clear flag + navigate to completion page under the new slug
      localStorage.removeItem(FLAG_KEY)
      window.location.href = `/${finalSlug}/onboarding-complete`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setSaving(false)
    }
  }, [companyName])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden">
        {/* Green top bar */}
        <div className="bg-gradient-to-r from-[#1a3a2a] to-[#193434] px-8 py-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#3DD57A]/20">
            <svg className="h-7 w-7 text-[#3DD57A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white">You created your first route!</h2>
          <p className="mt-1.5 text-sm text-white/60 leading-snug">
            Almost done — just one last thing before we take you to your account.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-6">
          <label className="block text-sm font-semibold text-gray-800 mb-1.5" htmlFor="ob-company-name">
            What is your company called?
          </label>
          <p className="text-sm text-gray-500 mb-4 leading-snug">
            This appears on your invoices and in the app. You can change it later in Settings.
          </p>
          <input
            id="ob-company-name"
            type="text"
            value={companyName}
            onChange={(e) => { setCompanyName(e.target.value); setError(null) }}
            placeholder="e.g. Smith Cleaning Services"
            maxLength={80}
            autoFocus
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-[#3DD57A] focus:ring-2 focus:ring-[#3DD57A]/20 focus:outline-none"
          />
          {prefilled && (
            <p className="mt-1.5 text-xs text-gray-400">
              We pre-filled your current name — feel free to update it.
            </p>
          )}
          {error && (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          )}
          <button
            type="submit"
            disabled={saving || !companyName.trim()}
            className="mt-5 w-full rounded-xl bg-[#3DD57A] py-3 text-sm font-semibold text-white shadow-lg shadow-[#3DD57A]/25 transition hover:bg-[#2ec46a] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Finish & see your account →'}
          </button>
        </form>
      </div>
    </div>
  )
}
