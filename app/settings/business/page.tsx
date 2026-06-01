'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  PencilIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'
import AddressSearchInput from '../../components/AddressSearchInput'
import { useAppI18n } from '../../components/I18nProvider'
import { countryRules, getCountryRule } from '../../config/countryRules'
import { getDefaultTimezoneForCountry, getTimezoneSelectOptions } from '../../config/companyTimezones'
import {
  SettingsHeader,
  SettingsSection,
  SettingsRow,
  SettingsField,
  SettingsLabel,
  SettingsInput,
  SettingsButton,
  SettingsToggle,
  SettingsHint,
  SettingsSavedNote,
  SettingsErrorNote,
} from '../../components/settings/SettingsUI'

const selectClass =
  'w-56 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500'
const rightInput = 'w-56 text-right'

interface CompanyProfile {
  id: number
  name: string
  slug: string
  country: string
  countryCode: string
  /** IANA timezone; persisted choice for the company */
  timezone: string
  cvrNumber: string
  address: string
  city: string
  zipCode: string
  /** Contact details rendered on every invoice. Hidden if empty. */
  email: string
  phone: string
  website: string
  /** Public URL path to the company logo (set via the upload endpoint). */
  logoUrl: string
  defaultStartAddress: string
  defaultEndAddress: string
  routeLocationsEnabled: boolean
}

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const COUNTRY_NAME_BY_CODE: Record<string, string> = {
  DK: 'Denmark',
  SE: 'Sweden',
  NO: 'Norway',
  DE: 'Germany',
  GB: 'United Kingdom',
  US: 'United States',
}

export default function BusinessSettingsPage() {
  const { t } = useAppI18n()
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [formData, setFormData] = useState<CompanyProfile>({
    id: 0,
    name: '',
    slug: '',
    country: '',
    countryCode: 'DK',
    timezone: getDefaultTimezoneForCountry('DK'),
    cvrNumber: '',
    address: '',
    city: '',
    zipCode: '',
    email: '',
    phone: '',
    website: '',
    logoUrl: '',
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
          countryCode: c.countryCode || 'DK',
          timezone:
            c.timezone ||
            c.effectiveTimezone ||
            getDefaultTimezoneForCountry(c.countryCode || 'DK'),
          cvrNumber: c.cvrNumber || '',
          address: c.address || '',
          city: c.city || '',
          zipCode: c.zipCode || '',
          email: c.email || '',
          phone: c.phone || '',
          website: c.website || '',
          logoUrl: c.logoUrl || '',
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
      setSlugError(t('settings.business.slug.invalidInput', 'Please enter a valid URL slug (letters, numbers and dashes only, min 2 characters).'))
      return
    }
    if (normalized === formData.slug) {
      setSlugError(t('settings.business.slug.alreadyCurrent', 'That is already your current URL.'))
      return
    }
    if (slugStatus === 'taken') {
      setSlugError(t('settings.business.slug.takenChooseAnother', 'That URL is already taken. Choose another.'))
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
        setSlugError(data.error || t('settings.business.slug.errUpdateUrl', 'Failed to update URL'))
        return
      }

      // Update token + localStorage
      localStorage.setItem('token', data.token)
      const existingUser = JSON.parse(localStorage.getItem('user') || '{}')
      localStorage.setItem('user', JSON.stringify({
        ...existingUser,
        id: data.user.id,
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        email: data.user.email,
        languageCode: data.user.languageCode || existingUser.languageCode || 'en',
        role: data.user.role,
        companyId: data.user.companyId,
        companyName: data.user.companyName,
        companies: data.user.companies || [],
        activeCompany: data.user.activeCompany || null,
      }))

      setFormData(prev => ({ ...prev, slug: normalized }))
      setSlugStatus('idle')
      setShowSlugWarning(false)
      setSlugSuccess(t('settings.business.slug.updatedRedirecting', 'Company URL updated! Redirecting...'))

      // Hard-navigate to the new slug
      setTimeout(() => {
        window.location.href = `/${normalized}/settings/business`
      }, 1200)
    } catch {
      setSlugError(t('settings.business.slug.errNetwork', 'Network error. Please try again.'))
    } finally {
      setSlugLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleCountryCodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextCode = e.target.value
    setFormData(prev => ({
      ...prev,
      countryCode: nextCode,
      country: COUNTRY_NAME_BY_CODE[nextCode] || prev.country || '',
      timezone: getDefaultTimezoneForCountry(nextCode),
    }))
  }

  // Logo upload state. The upload endpoint persists immediately, independent
  // of the main "Save" flow, because it's a multipart upload with its own
  // server-side validation.
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState('')

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoError('')
    if (file.size > 4 * 1024 * 1024) {
      setLogoError(t('settings.business.logo.tooLarge', 'Logo must be 4 MB or smaller.'))
      e.target.value = ''
      return
    }
    setLogoUploading(true)
    try {
      const token = localStorage.getItem('token')
      const fd = new FormData()
      fd.append('logo', file)
      const res = await fetch(apiUrl('/companies/profile/logo'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setFormData((prev) => ({ ...prev, logoUrl: data.logoUrl || '' }))
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Failed to upload logo')
    } finally {
      setLogoUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  const handleLogoDelete = async () => {
    if (!formData.logoUrl) return
    setLogoError('')
    setLogoUploading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/companies/profile/logo'), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Delete failed')
      }
      setFormData((prev) => ({ ...prev, logoUrl: '' }))
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Failed to delete logo')
    } finally {
      setLogoUploading(false)
    }
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

      setSuccess(t('settings.business.updateSuccess', 'Company profile updated successfully!'))
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
  const countryRule = getCountryRule(formData.countryCode)
  const tzSelect = useMemo(() => getTimezoneSelectOptions(formData.countryCode), [formData.countryCode])

  const readOrInput = (name: string, type = 'text', placeholder?: string) =>
    isEditing ? (
      <SettingsInput
        type={type}
        name={name}
        value={(formData as any)[name]}
        onChange={handleInputChange}
        className={rightInput}
        placeholder={placeholder}
      />
    ) : (
      <span className="text-sm text-gray-600">{(formData as any)[name] || '—'}</span>
    )

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <SettingsHeader
        title={t('settings.business.title', 'Business Settings')}
        description={t('settings.business.subtitle', 'Manage your company information.')}
      />

      {success && <div className="mb-4"><SettingsSavedNote>{success}</SettingsSavedNote></div>}
      {error && <div className="mb-4"><SettingsErrorNote>{error}</SettingsErrorNote></div>}

      {/* ── Company Information ── */}
      <SettingsSection
        title={t('settings.business.companyInformation', 'Company Information')}
        action={
          !isEditing ? (
            <SettingsButton variant="edit" onClick={() => setIsEditing(true)}>
              <PencilIcon className="h-4 w-4" />
              {t('settings.user.edit', 'Edit')}
            </SettingsButton>
          ) : undefined
        }
      >
        <SettingsRow title={t('settings.business.companyName', 'Company Name')} control={readOrInput('name')} />
        <SettingsRow
          title={countryRule.companyNumberLabel || t('settings.business.companyNumber', 'Company Number')}
          control={readOrInput('cvrNumber')}
        />
        <SettingsRow
          title={t('settings.business.countryCode', 'Country code')}
          control={
            isEditing ? (
              <select name="countryCode" value={formData.countryCode} onChange={handleCountryCodeChange} className={selectClass}>
                {Object.values(countryRules).map((rule) => (
                  <option key={rule.countryCode} value={rule.countryCode}>
                    {rule.countryName} ({rule.countryCode})
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-gray-600">{formData.countryCode || '—'}</span>
            )
          }
        />
        <SettingsRow
          title={t('settings.business.timezone', 'Time zone')}
          description={t(
            'settings.business.timezoneHelp',
            'Used for automated emails and “start of day” scheduling. Defaults from your country; change if your business operates in a different zone.'
          )}
          control={
            isEditing ? (
              <select name="timezone" value={formData.timezone} onChange={handleInputChange} className={selectClass}>
                <optgroup label={t('settings.business.timezoneSuggested', 'Suggested for your country')}>
                  {tzSelect.suggested.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </optgroup>
                {tzSelect.otherZones.length > 0 && (
                  <optgroup label={t('settings.business.timezoneAll', 'All time zones')}>
                    {tzSelect.otherZones.map((z) => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            ) : (
              <span className="text-sm text-gray-600">{formData.timezone || '—'}</span>
            )
          }
        />
        <SettingsRow title={t('settings.business.country', 'Country')} control={readOrInput('country')} />
        <SettingsRow title={t('settings.business.city', 'City')} control={readOrInput('city')} />
        <SettingsRow title={t('settings.business.address', 'Address')} control={readOrInput('address')} />
        <SettingsRow title={countryRule.postalCodeLabel} control={readOrInput('zipCode')} />
      </SettingsSection>

      {/* ── Contact details on invoices ── */}
      <SettingsSection
        title={t('settings.business.invoiceContact.title', 'Contact details on invoices')}
        description={t(
          'settings.business.invoiceContact.help',
          'Shown on every invoice you send. Empty fields are hidden \u2014 only fill in what you want clients to see.',
        )}
      >
        <SettingsRow
          title={t('settings.business.invoiceContact.email', 'Contact email')}
          control={readOrInput('email', 'email', isEditing ? 'hello@yourcompany.com' : '')}
        />
        <SettingsRow
          title={t('settings.business.invoiceContact.phone', 'Contact phone')}
          control={readOrInput('phone', 'tel', isEditing ? '+45 12 34 56 78' : '')}
        />
        <SettingsRow
          title={t('settings.business.invoiceContact.website', 'Website')}
          control={readOrInput('website', 'url', isEditing ? 'https://yourcompany.com' : '')}
        />
      </SettingsSection>

      {/* ── Route locations ── */}
      <SettingsSection title={t('settings.business.routes.title', 'Start & end locations for routes')}>
        <SettingsRow
          title={t('settings.business.routes.enable', 'Enable route locations')}
          description={t('settings.business.routes.help', 'When on, employees can set a start and end address (e.g. home). Routes in the planner will begin and end at those locations.')}
          control={
            isEditing ? (
              <SettingsToggle
                checked={formData.routeLocationsEnabled}
                onChange={(v) => setFormData(prev => ({ ...prev, routeLocationsEnabled: v }))}
                label={t('settings.business.routes.title', 'Start & end locations for routes')}
              />
            ) : (
              <span className="text-sm font-medium text-gray-500">
                {formData.routeLocationsEnabled ? t('settings.business.routes.on', 'On') : t('settings.business.routes.off', 'Off')}
              </span>
            )
          }
        />
        {formData.routeLocationsEnabled && (
          <SettingsField description={t('settings.business.routes.defaultHelp', 'Default addresses used when an employee has not set their own.')}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {isEditing ? (
                <>
                  <AddressSearchInput
                    label={t('settings.business.routes.defaultStart', 'Default start address')}
                    value={formData.defaultStartAddress}
                    onChange={v => setFormData(prev => ({ ...prev, defaultStartAddress: v }))}
                    placeholder={t('settings.business.routes.searchStartPlaceholder', 'Search for a start address...')}
                    countryCode={formData.countryCode}
                  />
                  <AddressSearchInput
                    label={t('settings.business.routes.defaultEnd', 'Default end address')}
                    value={formData.defaultEndAddress}
                    onChange={v => setFormData(prev => ({ ...prev, defaultEndAddress: v }))}
                    placeholder={t('settings.business.routes.endPlaceholder', 'Leave empty to use start address')}
                    countryCode={formData.countryCode}
                  />
                </>
              ) : (
                <>
                  <div>
                    <SettingsLabel>{t('settings.business.routes.defaultStart', 'Default start address')}</SettingsLabel>
                    <SettingsInput type="text" readOnly value={formData.defaultStartAddress} className="bg-gray-50 text-gray-500" />
                  </div>
                  <div>
                    <SettingsLabel>{t('settings.business.routes.defaultEnd', 'Default end address')}</SettingsLabel>
                    <SettingsInput type="text" readOnly value={formData.defaultEndAddress} className="bg-gray-50 text-gray-500" />
                  </div>
                </>
              )}
            </div>
          </SettingsField>
        )}

        {isEditing && (
          <div className="mt-4 flex items-center gap-3">
            <SettingsButton variant="secondary" onClick={handleCancel}>
              {t('settings.business.cancel', 'Cancel')}
            </SettingsButton>
            <SettingsButton variant="primary" onClick={handleSave} disabled={loading}>
              {loading ? t('settings.business.saving', 'Saving...') : t('settings.business.save', 'Save Changes')}
            </SettingsButton>
          </div>
        )}
      </SettingsSection>

      {/* ── Company Logo ── */}
      <SettingsSection
        title={t('settings.business.logo.title', 'Company logo')}
        description={t(
          'settings.business.logo.help',
          'Shown at the top of every invoice. PNG, JPG, WEBP or SVG \u2014 max 4 MB. Transparent backgrounds look best.',
        )}
      >
        <div className="flex flex-col items-start gap-6 sm:flex-row">
          <div className="flex-shrink-0">
            <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50">
              {formData.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={formData.logoUrl}
                  alt={t('settings.business.logo.preview', 'Company logo preview')}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="px-3 text-center">
                  <PhotoIcon className="mx-auto h-10 w-10 text-gray-300" />
                  <p className="mt-1 text-xs text-gray-400">
                    {t('settings.business.logo.empty', 'No logo yet')}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap gap-2">
              <SettingsButton
                variant="primary"
                onClick={() => logoInputRef.current?.click()}
                disabled={logoUploading}
              >
                <PhotoIcon className="h-4 w-4" />
                {logoUploading
                  ? t('settings.business.logo.uploading', 'Uploading...')
                  : formData.logoUrl
                    ? t('settings.business.logo.replace', 'Replace logo')
                    : t('settings.business.logo.upload', 'Upload logo')}
              </SettingsButton>
              {formData.logoUrl && (
                <button
                  type="button"
                  onClick={handleLogoDelete}
                  disabled={logoUploading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <TrashIcon className="h-4 w-4" />
                  {t('settings.business.logo.delete', 'Remove')}
                </button>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleLogoSelect}
                className="hidden"
              />
            </div>
            {logoError && <SettingsErrorNote>{logoError}</SettingsErrorNote>}
            <SettingsHint>
              {t(
                'settings.business.logo.tip',
                'Tip: a wide rectangular logo (around 400 \u00d7 100 px) works best on invoices. Tall square logos still work but appear smaller.',
              )}
            </SettingsHint>
          </div>
        </div>
      </SettingsSection>

      {/* ── Company URL ── */}
      <SettingsSection
        title={t('settings.business.slug.title', 'Company URL')}
        description={t('settings.business.slug.help', 'This is the URL slug for your workspace. It is independent of your company name - you can rename your company without changing it.')}
      >
        <div className="space-y-5">
          {/* Current URL preview */}
          <div className="select-all break-all rounded-lg bg-gray-50 px-4 py-3 font-mono text-sm text-gray-600">
            <span className="text-gray-400">{appBase}/</span>
            <span className="font-semibold text-gray-900">{formData.slug}</span>
            <span className="text-gray-400">/dashboard</span>
          </div>

          {/* Input */}
          <div>
            <SettingsLabel>{t('settings.business.slug.newLabel', 'New URL slug')}</SettingsLabel>
            <div className="relative">
              <input
                type="text"
                value={slugInput}
                onChange={handleSlugInputChange}
                placeholder={formData.slug}
                className={`w-full rounded-lg border px-4 py-2.5 pr-10 font-mono text-sm transition-colors focus:outline-none focus:ring-2 ${
                  slugStatus === 'available'
                    ? 'border-accent-400 focus:ring-accent-500/20'
                    : slugStatus === 'taken' || slugStatus === 'invalid'
                    ? 'border-red-400 focus:ring-red-500/20'
                    : 'border-gray-300 focus:border-gray-900 focus:ring-gray-900/10'
                }`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {slugStatus === 'checking' && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
                )}
                {slugStatus === 'available' && <CheckCircleIcon className="h-5 w-5 text-accent-500" />}
                {slugStatus === 'taken' && <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />}
              </div>
            </div>

            {/* Status messages */}
            <div className="mt-1.5 text-xs">
              {slugStatus === 'available' && (
                <span className="font-medium text-accent-600">{t('settings.business.slug.available', 'That URL is available')}</span>
              )}
              {slugStatus === 'taken' && (
                <span className="font-medium text-red-600">{t('settings.business.slug.taken', 'That URL is already taken')}</span>
              )}
              {slugStatus === 'invalid' && (
                <span className="text-red-600">{t('settings.business.slug.validation', 'Use only letters, numbers and dashes (min 2 characters)')}</span>
              )}
              {slugStatus === 'idle' && slugInput && slugify(slugInput) === formData.slug && (
                <span className="text-gray-400">{t('settings.business.slug.alreadyCurrent', 'That is already your current URL')}</span>
              )}
            </div>

            {/* Preview of new URL */}
            {slugChanged && slugify(slugInput).length >= 2 && (
              <div className="mt-2 break-all rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-500">
                {t('settings.business.slug.preview', 'New URL:')} <span className="font-semibold text-gray-900">{appBase}/{slugify(slugInput)}/dashboard</span>
              </div>
            )}
          </div>

          {/* Change button */}
          {slugChanged && !showSlugWarning && (
            <SettingsButton
              variant="primary"
              className="w-full"
              onClick={() => setShowSlugWarning(true)}
              disabled={slugStatus === 'taken' || slugStatus === 'invalid' || slugStatus === 'checking'}
            >
              {t('settings.business.slug.changeBtn', 'Change company URL')}
            </SettingsButton>
          )}

          {showSlugWarning && (
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t('settings.business.slug.confirmTitle', 'Are you sure?')}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {t('settings.business.slug.confirmBody', 'Changing your company URL will break all existing bookmarks and shared links. There is no redirect - the old URL simply stops working. Make sure to update any links you have shared.')}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <SettingsButton variant="secondary" className="flex-1" onClick={() => setShowSlugWarning(false)}>
                  {t('settings.business.cancel', 'Cancel')}
                </SettingsButton>
                <SettingsButton
                  variant="primary"
                  className="flex-1"
                  onClick={handleSaveSlug}
                  disabled={slugLoading || !canSaveSlug}
                >
                  {slugLoading ? t('settings.business.saving', 'Saving...') : t('settings.business.slug.confirmBtn', 'Yes, change it')}
                </SettingsButton>
              </div>
            </div>
          )}

          {slugError && <SettingsErrorNote>{slugError}</SettingsErrorNote>}
          {slugSuccess && <SettingsSavedNote>{slugSuccess}</SettingsSavedNote>}
        </div>
      </SettingsSection>
    </div>
  )
}
