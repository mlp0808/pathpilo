'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { apiUrl } from '../../utils/api'
import { useUser } from '../../hooks/useUser'
import AddressAutocomplete, { AddressData } from '@/app/components/AddressAutocomplete'
import { getCountryRule } from '../../config/countryRules'
import SetupWizardLayout, {
  setupFieldInputClass,
  setupFieldLabelClass,
} from '@/app/components/setup/SetupWizardLayout'
import IndustrySelect from '@/app/components/setup/IndustrySelect'
import { advanceOnboardingProgress, patchSessionOnboardingStep } from '../../utils/onboardingClient'

export default function CompanySetupPage() {
  const { user } = useUser()
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: '',
    industry: '',
    website: '',
    address: '',
    city: '',
    zipCode: '',
  })
  const [countryCode, setCountryCode] = useState('DK')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  /** Prevents a slow /companies/profile response from overwriting fields the user already edited. */
  const formTouchedRef = useRef(false)

  const markFormTouched = () => {
    formTouchedRef.current = true
  }

  // Prefill from the placeholder company created at signup. The auto-generated
  // "Guest ..." name is intentionally not shown — the owner should name it.
  useEffect(() => {
    if (!user?.companyId) return
    const ac = new AbortController()

    const loadCompany = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(apiUrl('/companies/profile'), {
          headers: { Authorization: `Bearer ${token}` },
          signal: ac.signal,
        })
        if (!res.ok) return
        const data = await res.json()
        const c = data.company
        if (!c) return
        setCountryCode((c.countryCode || 'DK') as string)
        if (formTouchedRef.current) return
        setFormData((prev) => ({
          ...prev,
          name: /^guest[- ]/i.test(c.name || '') ? prev.name : c.name || prev.name,
          industry: c.industry || prev.industry,
          website: c.website || prev.website,
          address: c.address || prev.address,
          city: c.city || prev.city,
          zipCode: c.zipCode || prev.zipCode,
        }))
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return
        /* keep defaults */
      }
    }

    loadCompany()
    return () => ac.abort()
  }, [user])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    markFormTouched()
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const countryRule = getCountryRule(countryCode)
  const nameMissing = !formData.name.trim()
  const industryMissing = !formData.industry

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (nameMissing || industryMissing) {
      setShowErrors(true)
      setError('')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const token = localStorage.getItem('token')
      // No slug sent — the backend derives it from the name and resolves collisions.
      const response = await fetch(apiUrl(`/companies/${user?.companyId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: formData.name.trim(),
          industry: formData.industry,
          website: formData.website.trim(),
          address: formData.address,
          city: formData.city,
          zipCode: formData.zipCode,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'Failed to save your company')
        return
      }

      localStorage.setItem('company', JSON.stringify(data.company))

      // The company now has a real name and slug, so refresh the cached session
      // before navigating — company-scoped URLs are built from the slug.
      const userData = localStorage.getItem('user')
      if (userData) {
        const userObj = JSON.parse(userData)
        userObj.companyId = data.company.id
        userObj.companyName = data.company.name
        const companyEntry = {
          id: data.company.id,
          name: data.company.name,
          slug: data.company.slug || '',
          countryCode: data.company.countryCode || countryCode,
          role: 'owner',
          isOwner: true,
        }
        const existing = Array.isArray(userObj.companies) ? userObj.companies : []
        userObj.companies = [
          companyEntry,
          ...existing.filter((c: { id?: number }) => c?.id !== companyEntry.id),
        ]
        userObj.activeCompany = { ...companyEntry, onboardingCompleted: false, onboardingStep: 'goals' }
        localStorage.setItem('user', JSON.stringify(userObj))
      }

      await advanceOnboardingProgress('goals', data.company.id)
      patchSessionOnboardingStep('goals')
      router.push('/setup/goals')
    } catch {
      setError('Network error: failed to save your company')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <SetupWizardLayout
      step={1}
      title="Tell us about your company"
      description="This names your workspace and tailors PathPilo to the work you do."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-600">{error}</p>
          </div>
        )}

        {/* Company name */}
        <div>
          <label htmlFor="name" className={setupFieldLabelClass}>
            Company name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            className={`${setupFieldInputClass} ${showErrors && nameMissing ? 'border-red-300' : ''}`}
            placeholder="e.g. Clean Windows Co."
          />
          {showErrors && nameMissing && (
            <p className="mt-1.5 text-xs text-red-600">Please enter your company name.</p>
          )}
        </div>

        {/* Industry */}
        <div>
          <label htmlFor="industry" className={setupFieldLabelClass}>
            Industry <span className="text-red-500">*</span>
          </label>
          <IndustrySelect
            value={formData.industry}
            invalid={showErrors && industryMissing}
            onChange={(industry) => {
              markFormTouched()
              setFormData((prev) => ({ ...prev, industry }))
            }}
          />
          {showErrors && industryMissing && (
            <p className="mt-1.5 text-xs text-red-600">Please choose the industry you work in.</p>
          )}
        </div>

        {/* Address */}
        <AddressAutocomplete
          label="Company address"
          address={formData.address}
          zip_code={formData.zipCode}
          city={formData.city}
          lat={undefined}
          lng={undefined}
          countryCode={countryCode}
          zipLabel={countryRule.postalCodeLabel}
          placeholder="Start typing an address…"
          onChange={(data: AddressData) => {
            markFormTouched()
            setFormData((prev) => ({
              ...prev,
              address: data.address,
              zipCode: data.zip_code,
              city: data.city,
            }))
          }}
        />

        {/* Website */}
        <div>
          <label htmlFor="website" className={setupFieldLabelClass}>
            Website{' '}
            <span className="normal-case tracking-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            id="website"
            name="website"
            value={formData.website}
            onChange={handleInputChange}
            className={setupFieldInputClass}
            placeholder="e.g. www.cleanwindows.co"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="mt-2 w-full rounded-xl bg-accent-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 transition-all hover:bg-accent-400 hover:shadow-accent-500/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Saving…
            </span>
          ) : (
            'Continue →'
          )}
        </button>
      </form>
    </SetupWizardLayout>
  )
}
