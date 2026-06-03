'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { apiUrl } from '../../utils/api'
import { useUser } from '../../hooks/useUser'
import AddressAutocomplete, { AddressData } from '@/app/components/AddressAutocomplete'
import { countryRules, getCountryRule } from '../../config/countryRules'
import { getDefaultTimezoneForCountry, getTimezoneSelectOptions } from '../../config/companyTimezones'
import { normalizeLocale, UI_LOCALE_STORAGE_KEY } from '../../i18n'
import SetupWizardLayout, {
  setupFieldInputClass,
  setupFieldLabelClass,
  setupFieldSelectClass,
} from '@/app/components/setup/SetupWizardLayout'

const defaultCountryCodeFromLocale = (): string => {
  if (typeof window === 'undefined') return 'DK'
  const uiLocale = normalizeLocale(localStorage.getItem(UI_LOCALE_STORAGE_KEY))
  return uiLocale === 'da' ? 'DK' : 'DK'
}

export default function CompanySetupPage() {
  const { user } = useUser()
  const initialCountryCode = defaultCountryCodeFromLocale()
  const initialCountryRule = countryRules[initialCountryCode] || countryRules.DK
  const [formData, setFormData] = useState({
    country: initialCountryRule.countryName,
    countryCode: initialCountryCode,
    timezone: getDefaultTimezoneForCountry(initialCountryCode),
    name: '',
    cvrNumber: '',
    address: '',
    city: '',
    zipCode: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const router = useRouter()
  /** Prevents a slow /companies/profile response from overwriting country/address after the user already edited */
  const formTouchedRef = useRef(false)

  const markFormTouched = () => {
    formTouchedRef.current = true
  }

  useEffect(() => {
    if (!user?.companyId) return
    setIsUpdating(true)
    const companyName = user.companyName ?? ''
    if (companyName && !formTouchedRef.current) {
      setFormData(prev => ({ ...prev, name: companyName }))
    }

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
        if (formTouchedRef.current) return
        const code = (c.countryCode || 'DK') as string
        const rule = countryRules[code] || countryRules.DK
        setFormData(prev => ({
          ...prev,
          name: c.name || prev.name || companyName,
          country: c.country || rule.countryName,
          countryCode: code,
          timezone:
            c.timezone ||
            c.effectiveTimezone ||
            getDefaultTimezoneForCountry(code),
          cvrNumber: c.cvrNumber || '',
          address: c.address || '',
          city: c.city || '',
          zipCode: c.zipCode || '',
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
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleCountryCodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    markFormTouched()
    const nextCode = e.target.value
    const rule = countryRules[nextCode] || countryRules.DK
    setFormData(prev => ({
      ...prev,
      countryCode: nextCode,
      country: rule.countryName,
      timezone: getDefaultTimezoneForCountry(nextCode),
    }))
  }

  const countryRule = getCountryRule(formData.countryCode)
  const tzSelect = useMemo(() => getTimezoneSelectOptions(formData.countryCode), [formData.countryCode])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const token = localStorage.getItem('token')

      const method = isUpdating ? 'PUT' : 'POST'
      const endpoint = isUpdating ? `/companies/${user?.companyId}` : '/companies'

      // No slug sent — the backend derives it from the name and auto-resolves collisions
      const payload = {
        name: formData.name,
        country: formData.country,
        countryCode: formData.countryCode,
        timezone: formData.timezone,
        cvrNumber: formData.cvrNumber,
        address: formData.address,
        city: formData.city,
        zipCode: formData.zipCode,
      }
      const response = await fetch(apiUrl(endpoint), {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (response.ok) {
        const countryCodeSaved = data.company.countryCode || formData.countryCode
        const companyForStorage = { ...data.company, countryCode: countryCodeSaved }
        localStorage.setItem('company', JSON.stringify(companyForStorage))

        const userData = localStorage.getItem('user')
        if (userData) {
          const userObj = JSON.parse(userData)
          userObj.companyId = data.company.id
          userObj.companyName = data.company.name
          const companyEntry = {
            id: data.company.id,
            name: data.company.name,
            slug: data.company.slug || '',
            countryCode: countryCodeSaved,
            role: 'owner',
            isOwner: true,
          }
          const existingCompanies = Array.isArray(userObj.companies) ? userObj.companies : []
          userObj.companies = [companyEntry, ...existingCompanies.filter((c: any) => c?.id !== companyEntry.id)]
          userObj.activeCompany = companyEntry
          localStorage.setItem('user', JSON.stringify(userObj))
        }

        const { advanceOnboardingProgress, patchSessionOnboardingStep } =
          await import('../../utils/onboardingClient')
        await advanceOnboardingProgress('services', data.company.id)
        patchSessionOnboardingStep('services')
        router.push('/setup/services')
      } else {
        setError(data.error || `Failed to ${isUpdating ? 'update' : 'create'} company`)
      }
    } catch {
      setError(`Network error: Failed to ${isUpdating ? 'update' : 'create'} company`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <SetupWizardLayout
      step={1}
      title="Create your company"
      description="Add your business details so we can tailor invoicing, addresses, and scheduling to your region."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-red-600 text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Country */}
        <div>
          <label htmlFor="countryCode" className={setupFieldLabelClass}>
            Country <span className="text-red-500">*</span>
          </label>
          <select
            id="countryCode"
            name="countryCode"
            value={formData.countryCode}
            onChange={handleCountryCodeChange}
            required
            className={setupFieldSelectClass}
          >
            {Object.values(countryRules).map((rule) => (
              <option key={rule.countryCode} value={rule.countryCode}>
                {rule.countryName} ({rule.countryCode})
              </option>
            ))}
          </select>
        </div>

        {/* Timezone */}
        <div>
          <label htmlFor="timezone" className={setupFieldLabelClass}>
            Time zone
          </label>
          <select
            id="timezone"
            name="timezone"
            value={formData.timezone}
            onChange={handleInputChange}
            className={setupFieldSelectClass}
          >
            <optgroup label="Suggested for your country">
              {tzSelect.suggested.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
            {tzSelect.otherZones.length > 0 && (
              <optgroup label="All time zones">
                {tzSelect.otherZones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

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
            required
            className={setupFieldInputClass}
            placeholder="e.g. Clean Windows Co."
          />
        </div>

        {/* Registration number */}
        <div>
          <label htmlFor="cvrNumber" className={setupFieldLabelClass}>
            {countryRule.companyNumberLabel}{' '}
            <span className="text-gray-400 normal-case tracking-normal">(optional)</span>
          </label>
          <input
            type="text"
            id="cvrNumber"
            name="cvrNumber"
            value={formData.cvrNumber}
            onChange={handleInputChange}
            className={setupFieldInputClass}
            placeholder="e.g. 12345678"
          />
        </div>

        {/* Address */}
        <AddressAutocomplete
          label="Company address"
          address={formData.address}
          zip_code={formData.zipCode}
          city={formData.city}
          lat={undefined}
          lng={undefined}
          countryCode={formData.countryCode}
          zipLabel={countryRule.postalCodeLabel}
          placeholder="Start typing an address…"
          onChange={(data: AddressData) => {
            markFormTouched()
            setFormData(prev => ({
              ...prev,
              address: data.address,
              zipCode: data.zip_code,
              city: data.city,
            }))
          }}
        />

        <button
          type="submit"
          disabled={isLoading}
          className="mt-2 w-full bg-accent-500 hover:bg-accent-400 text-white py-3.5 px-6 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent-500/25 hover:shadow-accent-500/40"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
