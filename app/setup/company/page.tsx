'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { apiUrl } from '../../utils/api'
import { useUser } from '../../hooks/useUser'
import AddressAutocomplete, { AddressData } from '@/app/components/AddressAutocomplete'
import { countryRules, getCountryRule } from '../../config/countryRules'
import { getDefaultTimezoneForCountry, getTimezoneSelectOptions } from '../../config/companyTimezones'

export default function CompanySetupPage() {
  const { user } = useUser()
  const [formData, setFormData] = useState({
    country: countryRules.DK.countryName,
    countryCode: 'DK',
    timezone: getDefaultTimezoneForCountry('DK'),
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
    <div className="min-h-screen bg-gradient-to-b from-white via-primary-50/30 to-primary-50/50">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="grid grid-cols-5 gap-16 items-start">
          {/* Left Column */}
          <div className="col-span-2 pt-4">
            <div className="space-y-6">
              <div>
                <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-accent-50 text-accent-700 border border-accent-200 mb-4">
                  Step 1 of 3
                </div>
                <h1 className="text-3xl font-bold text-primary-800 mb-4 tracking-tight">
                  Create your company
                </h1>
                <p className="text-base text-gray-600 leading-relaxed">
                  Let's get started by adding all your company details.
                </p>
              </div>

              <div className="space-y-3 pt-4">
                <div className="flex items-center space-x-3 text-sm font-medium text-primary-700">
                  <div className="w-1.5 h-1.5 bg-accent-500 rounded-full" />
                  <span>Create Company</span>
                </div>
                <div className="flex items-center space-x-3 text-sm text-gray-400">
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
                  <span>Setup Services</span>
                </div>
                <div className="flex items-center space-x-3 text-sm text-gray-400">
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
                  <span>Add Clients</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Form */}
          <div className="col-span-3">
            <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-xl shadow-primary-500/5">
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-red-600 text-sm font-medium">{error}</p>
                  </div>
                )}

                <div className="space-y-5">
                  {/* Country (ISO + display name — same pattern as Business settings) */}
                  <div>
                    <label htmlFor="countryCode" className="block text-sm font-medium text-gray-900 mb-2">
                      Country <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="countryCode"
                      name="countryCode"
                      value={formData.countryCode}
                      onChange={handleCountryCodeChange}
                      required
                      className="w-full px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all hover:border-gray-300 shadow-sm"
                    >
                      {Object.values(countryRules).map((rule) => (
                        <option key={rule.countryCode} value={rule.countryCode}>
                          {rule.countryName} ({rule.countryCode})
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-gray-500">
                      Used for tax defaults, address labels, and map search in your region.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="timezone" className="block text-sm font-medium text-gray-900 mb-2">
                      Time zone
                    </label>
                    <select
                      id="timezone"
                      name="timezone"
                      value={formData.timezone}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all hover:border-gray-300 shadow-sm"
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
                    <p className="mt-1.5 text-xs text-gray-500">
                      Defaults from your country (e.g. US → Eastern). Change if your business uses a different zone.
                    </p>
                  </div>

                  {/* Company Name */}
                  <div>
                    <label htmlFor="name" className="block text-xs font-semibold text-primary-700 mb-2">
                      Company name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all placeholder-gray-400 hover:border-gray-300 shadow-sm"
                      placeholder="e.g. Clean Windows Co."
                    />
                  </div>

                  {/* Company registration number (label varies by country) */}
                  <div>
                    <label htmlFor="cvrNumber" className="block text-sm font-medium text-gray-900 mb-2">
                      {countryRule.companyNumberLabel}{' '}
                      <span className="text-gray-400 text-xs">(optional)</span>
                    </label>
                    <input
                      type="text"
                      id="cvrNumber"
                      name="cvrNumber"
                      value={formData.cvrNumber}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all placeholder-gray-400 hover:border-gray-300 shadow-sm"
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
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-accent-500 hover:bg-accent-600 text-white py-3 px-6 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-accent-500/20 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent-500/20 hover:shadow-xl hover:shadow-accent-500/25"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving…</span>
                    </span>
                  ) : (
                    'Next step'
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
