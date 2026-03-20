'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  BuildingOffice2Icon,
  PencilIcon,
  MapPinIcon,
  LinkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'
import AddressSearchInput from '../../components/AddressSearchInput'

interface CompanyProfile {
  id: number
  name: string
  slug: string
  country: string
  cvrNumber: string
  address: string
  city: string
  zipCode: string
  defaultStartAddress: string
  defaultEndAddress: string
  routeLocationsEnabled: boolean
}

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export default function BusinessSettingsPage() {
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [formData, setFormData] = useState<CompanyProfile>({
    id: 0,
    name: '',
    slug: '',
    country: '',
    cvrNumber: '',
    address: '',
    city: '',
    zipCode: '',
    defaultStartAddress: '',
    defaultEndAddress: '',
    routeLocationsEnabled: true,
  })

  // Slug-change state (its own separate section)
  const [slugInput, setSlugInput] = useState('')
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle')
  const [slugError, setSlugError] = useState('')
  const [slugSuccess, setSlugSuccess] = useState('')
  const [slugLoading, setSlugLoading] = useState(false)
  const [showSlugWarning, setShowSlugWarning] = useState(false)
  const slugDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const fetchCompanyProfile = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch(apiUrl('/companies/profile'), {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) throw new Error('Failed to fetch company profile')
        const data = await response.json()
        const c = data.company
        setFormData({
          id: c.id || 0,
          name: c.name || '',
          slug: c.slug || '',
          country: c.country || '',
          cvrNumber: c.cvrNumber || '',
          address: c.address || '',
          city: c.city || '',
          zipCode: c.zipCode || '',
          defaultStartAddress: c.defaultStartAddress || '',
          defaultEndAddress: c.defaultEndAddress || '',
          routeLocationsEnabled: c.routeLocationsEnabled !== false,
        })
        setSlugInput(c.slug || '')
      } catch (err) {
        console.error('Error fetching company profile:', err)
      }
    }
    fetchCompanyProfile()
  }, [])

  // Debounced slug availability check
  const checkSlugAvailability = useCallback(
    (value: string) => {
      if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current)

      const normalized = slugify(value)
      if (!normalized || normalized.length < 2) {
        setSlugStatus(normalized.length === 0 ? 'idle' : 'invalid')
        return
      }
      if (normalized === formData.slug) {
        setSlugStatus('idle')
        return
      }

      setSlugStatus('checking')
      slugDebounceRef.current = setTimeout(async () => {
        try {
          const token = localStorage.getItem('token')
          const res = await fetch(
            apiUrl(`/companies/check-slug?slug=${encodeURIComponent(normalized)}&excludeId=${formData.id}`),
            { headers: { Authorization: `Bearer ${token}` } }
          )
          const data = await res.json()
          setSlugStatus(data.available ? 'available' : 'taken')
        } catch {
          setSlugStatus('idle')
        }
      }, 400)
    },
    [formData.slug, formData.id]
  )

  const handleSlugInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setSlugInput(raw)
    setSlugError('')
    setSlugSuccess('')
    checkSlugAvailability(raw)
  }

  const handleSaveSlug = async () => {
    const normalized = slugify(slugInput)
    if (!normalized || normalized.length < 2) {
      setSlugError('Please enter a valid URL slug (letters, numbers and dashes only, min 2 characters).')
      return
    }
    if (normalized === formData.slug) {
      setSlugError('That is already your current URL.')
      return
    }
    if (slugStatus === 'taken') {
      setSlugError('That URL is already taken. Choose another.')
      return
    }

    setSlugLoading(true)
    setSlugError('')
    setSlugSuccess('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/companies/slug'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slug: normalized }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSlugError(data.error || 'Failed to update URL')
        return
      }

      // Update token + localStorage
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify({
        id: data.user.id,
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        email: data.user.email,
        role: data.user.role,
        companyId: data.user.companyId,
        companyName: data.user.companyName,
        companies: data.user.companies || [],
        activeCompany: data.user.activeCompany || null,
      }))

      setFormData(prev => ({ ...prev, slug: normalized }))
      setSlugStatus('idle')
      setShowSlugWarning(false)
      setSlugSuccess('Company URL updated! Redirecting…')

      // Hard-navigate to the new slug
      setTimeout(() => {
        window.location.href = `/${normalized}/settings/business`
      }, 1200)
    } catch {
      setSlugError('Network error. Please try again.')
    } finally {
      setSlugLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl('/companies/profile'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...formData }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update company profile')
      }

      setSuccess('Company profile updated successfully!')
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update company profile')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setError('')
    setSuccess('')
    window.location.reload()
  }

  const slugChanged = slugify(slugInput) !== formData.slug && slugify(slugInput).length >= 2
  const canSaveSlug = slugChanged && (slugStatus === 'available' || slugStatus === 'idle')

  const appBase = typeof window !== 'undefined' ? window.location.origin : 'https://app.vevago.com'

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">

      {/* ── Company Information ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <BuildingOffice2Icon className="w-6 h-6 text-primary-600" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Business Settings</h1>
              <p className="text-gray-500 text-sm mt-0.5">Manage your company information.</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {success && (
            <div className="mb-6 bg-accent-50 border border-accent-200 rounded-xl p-4">
              <p className="text-accent-800 text-sm">{success}</p>
            </div>
          )}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Company Information</h2>
                <p className="text-sm text-gray-500">Update your company details</p>
              </div>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center px-3 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <PencilIcon className="w-4 h-4 mr-2" />
                  Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { label: 'Company Name', name: 'name' },
                { label: 'CVR Number', name: 'cvrNumber' },
                { label: 'Country', name: 'country' },
                { label: 'City', name: 'city' },
                { label: 'Address', name: 'address' },
                { label: 'ZIP Code', name: 'zipCode' },
              ].map(({ label, name }) => (
                <div key={name}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
                  <input
                    type="text"
                    name={name}
                    value={(formData as any)[name]}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 disabled:bg-gray-100 disabled:text-gray-500 transition-colors"
                  />
                </div>
              ))}
            </div>

            {/* Route locations */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <MapPinIcon className="w-4 h-4 text-primary-600" />
                    <h3 className="text-sm font-semibold text-gray-900">Start & end locations for routes</h3>
                  </div>
                  <p className="text-xs text-gray-500">
                    When on, employees can set a start and end address (e.g. home). Routes in the planner will begin and end at those locations.
                  </p>
                </div>
                {isEditing ? (
                  <label className="flex-shrink-0 flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.routeLocationsEnabled}
                      onChange={e => setFormData(prev => ({ ...prev, routeLocationsEnabled: e.target.checked }))}
                      className="sr-only"
                    />
                    <div className={`w-11 h-6 rounded-full transition-colors ${formData.routeLocationsEnabled ? 'bg-accent-500' : 'bg-gray-300'}`}>
                      <div className={`mt-0.5 ml-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.routeLocationsEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                    <span className="ml-2 text-sm font-medium text-gray-700">{formData.routeLocationsEnabled ? 'On' : 'Off'}</span>
                  </label>
                ) : (
                  <span className={`text-sm font-medium ${formData.routeLocationsEnabled ? 'text-accent-600' : 'text-gray-500'}`}>
                    {formData.routeLocationsEnabled ? 'On' : 'Off'}
                  </span>
                )}
              </div>

              {formData.routeLocationsEnabled && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 mb-3">Default addresses used when an employee has not set their own.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {isEditing ? (
                      <>
                        <AddressSearchInput
                          label="Default start address"
                          value={formData.defaultStartAddress}
                          onChange={v => setFormData(prev => ({ ...prev, defaultStartAddress: v }))}
                          placeholder="Search for a start address…"
                        />
                        <AddressSearchInput
                          label="Default end address"
                          value={formData.defaultEndAddress}
                          onChange={v => setFormData(prev => ({ ...prev, defaultEndAddress: v }))}
                          placeholder="Leave empty to use start address"
                        />
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Default start address</label>
                          <input type="text" readOnly value={formData.defaultStartAddress} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Default end address</label>
                          <input type="text" readOnly value={formData.defaultEndAddress} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500" />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {isEditing && (
              <div className="flex items-center space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button onClick={handleCancel} className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {loading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Company URL ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <LinkIcon className="w-5 h-5 text-primary-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Company URL</h2>
              <p className="text-gray-500 text-sm mt-0.5">
                This is the URL slug for your workspace. It is independent of your company name — you can rename your company without changing it.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Current URL preview */}
          <div className="bg-gray-50 rounded-xl px-4 py-3 font-mono text-sm text-gray-600 select-all break-all">
            <span className="text-gray-400">{appBase}/</span>
            <span className="font-semibold text-primary-700">{formData.slug}</span>
            <span className="text-gray-400">/dashboard</span>
          </div>

          {/* Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">New URL slug</label>
            <div className="relative">
              <input
                type="text"
                value={slugInput}
                onChange={handleSlugInputChange}
                placeholder={formData.slug}
                className={`w-full px-4 py-2.5 border rounded-lg pr-10 font-mono text-sm transition-colors focus:outline-none focus:ring-2 ${
                  slugStatus === 'available'
                    ? 'border-accent-400 focus:ring-accent-500/30'
                    : slugStatus === 'taken' || slugStatus === 'invalid'
                    ? 'border-red-400 focus:ring-red-500/30'
                    : 'border-gray-300 focus:ring-accent-500/30 focus:border-accent-500'
                }`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {slugStatus === 'checking' && (
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-accent-500 rounded-full animate-spin" />
                )}
                {slugStatus === 'available' && <CheckCircleIcon className="w-5 h-5 text-accent-500" />}
                {slugStatus === 'taken' && <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />}
              </div>
            </div>

            {/* Status messages */}
            <div className="mt-1.5 text-xs">
              {slugStatus === 'available' && (
                <span className="text-accent-600 font-medium">That URL is available</span>
              )}
              {slugStatus === 'taken' && (
                <span className="text-red-600 font-medium">That URL is already taken</span>
              )}
              {slugStatus === 'invalid' && (
                <span className="text-red-600">Use only letters, numbers and dashes (min 2 characters)</span>
              )}
              {slugStatus === 'idle' && slugInput && slugify(slugInput) === formData.slug && (
                <span className="text-gray-400">That is already your current URL</span>
              )}
            </div>

            {/* Preview of new URL */}
            {slugChanged && slugify(slugInput).length >= 2 && (
              <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2 font-mono text-xs text-gray-500 break-all">
                New URL: <span className="text-primary-700 font-semibold">{appBase}/{slugify(slugInput)}/dashboard</span>
              </div>
            )}
          </div>

          {/* Warning */}
          {slugChanged && !showSlugWarning && (
            <button
              onClick={() => setShowSlugWarning(true)}
              disabled={slugStatus === 'taken' || slugStatus === 'invalid' || slugStatus === 'checking'}
              className="w-full px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Change company URL
            </button>
          )}

          {showSlugWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">Are you sure?</p>
                  <p className="text-sm text-amber-800 mt-1">
                    Changing your company URL will <strong>break all existing bookmarks and shared links</strong>. There is no redirect — the old URL simply stops working. Make sure to update any links you have shared.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowSlugWarning(false)}
                  className="flex-1 px-4 py-2 border border-amber-300 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSlug}
                  disabled={slugLoading || !canSaveSlug}
                  className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {slugLoading ? 'Saving…' : 'Yes, change it'}
                </button>
              </div>
            </div>
          )}

          {slugError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-red-800 text-sm">{slugError}</p>
            </div>
          )}
          {slugSuccess && (
            <div className="bg-accent-50 border border-accent-200 rounded-xl p-3">
              <p className="text-accent-800 text-sm">{slugSuccess}</p>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
