'use client'

import { useState, useEffect, useLayoutEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'
import AddressAutocomplete, { AddressData } from '@/app/components/AddressAutocomplete'
import { getCountryRule } from '../../config/countryRules'
import SetupWizardLayout, {
  setupFieldInputClass,
  setupFieldLabelClass,
} from '@/app/components/setup/SetupWizardLayout'
import SetupWizardHint from '@/app/components/setup/SetupWizardHint'

interface Client {
  id?: number
  client_type: 'person' | 'company'
  name: string
  last_name?: string
  company_number?: string
  contact_name?: string
  country: string
  address: string
  zip_code: string
  city: string
  lat?: number | null
  lng?: number | null
}

const emptyClient = (): Client => ({
  client_type: 'person',
  name: '',
  last_name: '',
  company_number: '',
  contact_name: '',
  country: '',
  address: '',
  zip_code: '',
  city: '',
  lat: null,
  lng: null,
})

export default function ClientsSetupPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [showForm, setShowForm] = useState(false)
  const [currentClient, setCurrentClient] = useState<Client>(emptyClient())
  const [includeContactPerson, setIncludeContactPerson] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isContinuing, setIsContinuing] = useState(false)
  const [continueError, setContinueError] = useState('')
  const [companyCountryCode, setCompanyCountryCode] = useState('DK')
  const router = useRouter()

  const countryRule = useMemo(() => getCountryRule(companyCountryCode), [companyCountryCode])

  useLayoutEffect(() => {
    try {
      const rawCompany = localStorage.getItem('company')
      if (rawCompany) {
        const c = JSON.parse(rawCompany)
        if (c?.countryCode) {
          setCompanyCountryCode(String(c.countryCode))
          return
        }
      }
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      const code =
        u.activeCompany?.countryCode ||
        (Array.isArray(u.companies)
          ? u.companies.find((co: { id?: number }) => co?.id === u.companyId)?.countryCode
          : undefined)
      if (code) setCompanyCountryCode(String(code))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(apiUrl('/companies/profile'), {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        const code = data.company?.countryCode || 'DK'
        setCompanyCountryCode(String(code))
      } catch {
        /* keep localStorage value */
      }
    }
    load()
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setCurrentClient(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleAddClient = () => {
    setShowForm(true)
    setError('')
  }

  const handleSubmitClient = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    try {
      const token = localStorage.getItem('token')

      const resolvedCountry =
        (currentClient.country && String(currentClient.country).trim()) ||
        countryRule.countryName

      const clientData = {
        client_type: currentClient.client_type,
        name: currentClient.name,
        last_name: currentClient.last_name,
        company_number: currentClient.company_number,
        contact_name: includeContactPerson ? currentClient.contact_name : null,
        country: resolvedCountry,
        address: currentClient.address,
        zip_code: currentClient.zip_code,
        city: currentClient.city,
        lat: currentClient.lat,
        lng: currentClient.lng,
        email: null,
        phone: null,
        billing_address: null,
        billing_zip_code: null,
        billing_city: null,
        billing_email: null,
        billing_phone: null,
      }

      const response = await fetch(apiUrl('/clients'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(clientData)
      })

      const data = await response.json()

      if (response.ok) {
        setClients(prev => [...prev, { ...currentClient, id: data.client.id }])
        setCurrentClient(emptyClient())
        setIncludeContactPerson(false)
        setShowForm(false)
      } else {
        setError(data.error || 'Failed to create client')
      }
    } catch (error) {
      setError('Network error: Failed to create client')
      console.error('Client creation error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleContinue = async () => {
    setContinueError('')
    setIsContinuing(true)
    try {
      const { advanceOnboardingProgress, getCompanySlug, onboardingStepRank, patchSessionOnboardingStep } =
        await import('../../utils/onboardingClient')
      const result = await advanceOnboardingProgress('jobs')
      if (!result?.onboardingStep || onboardingStepRank(result.onboardingStep) < onboardingStepRank('jobs')) {
        setContinueError(result?.error || 'Could not save your progress. Please try again.')
        return
      }
      patchSessionOnboardingStep(result.onboardingStep as 'jobs' | 'route' | 'done')
      const raw = localStorage.getItem('user')
      const user = raw ? (JSON.parse(raw) as Record<string, unknown>) : null
      const slug = getCompanySlug(user)
      router.push(slug ? `/${slug}/jobs` : '/select-company')
    } catch {
      setContinueError('Could not save your progress. Please try again.')
    } finally {
      setIsContinuing(false)
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setCurrentClient(emptyClient())
    setIncludeContactPerson(false)
    setError('')
  }

  const inputCls = setupFieldInputClass
  const labelCls = setupFieldLabelClass
  const checkboxLabelCls = 'ml-2.5 text-sm text-gray-700 select-none cursor-pointer'
  const checkboxCls = 'h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-500/30 focus:ring-offset-0'

  const clientDisplayName = (client: Client) => {
    const name = client.name?.trim() || ''
    const last = client.last_name?.trim() || ''
    if (client.client_type === 'person' && last) return `${name} ${last}`
    return name
  }

  const clientSubtitle = (client: Client) => {
    const street = client.address?.trim()
    const locality = [client.zip_code, client.city].filter(Boolean).join(' ')
    if (street && locality) return `${street}, ${locality}`
    return street || locality
  }

  return (
    <SetupWizardLayout
      step={1}
      title="Add your first client"
      description="Just a name and address to get started — you can add more details later."
    >
      <div className="flex flex-col gap-5">

        {/* ── Hint / instruction ── */}
        {!showForm && (
          <SetupWizardHint showArrow={clients.length === 0}>
            {clients.length === 0
              ? 'Click the button below and add your first client.'
              : 'Great! Add another client, or continue to the next step.'}
          </SetupWizardHint>
        )}

        {/* ── Form or add-client button ── */}
        {showForm ? (
          <form onSubmit={handleSubmitClient} className="flex flex-col gap-5 animate-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">New client</p>
              <button type="button" onClick={handleCancel} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                Cancel
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {/* Client type toggle */}
            <div>
              <label className={labelCls}>Client type</label>
              <div className="flex bg-gray-100 border border-gray-200 rounded-xl p-1 gap-1">
                {(['person', 'company'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setCurrentClient({ ...currentClient, client_type: type })}
                    className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                      currentClient.client_type === type
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {type === 'person' ? 'Private person' : 'Company'}
                  </button>
                ))}
              </div>
            </div>

            {/* Company fields */}
            {currentClient.client_type === 'company' && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="name" className={labelCls}>Company name <span className="text-red-500">*</span></label>
                    <input type="text" id="name" name="name" value={currentClient.name} onChange={handleInputChange} required className={inputCls} placeholder="e.g. ABC Corp" />
                  </div>
                  <div>
                    <label htmlFor="company_number" className={labelCls}>Company number</label>
                    <input type="text" id="company_number" name="company_number" value={currentClient.company_number} onChange={handleInputChange} className={inputCls} placeholder="e.g. 12345678" />
                  </div>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" id="includeContactPerson" checked={includeContactPerson} onChange={e => setIncludeContactPerson(e.target.checked)} className={checkboxCls} />
                  <span className="text-sm text-gray-700 select-none">Add contact person?</span>
                </label>
                {includeContactPerson && (
                  <div>
                    <label htmlFor="contact_name" className={labelCls}>Contact person</label>
                    <input type="text" id="contact_name" name="contact_name" value={currentClient.contact_name} onChange={handleInputChange} className={inputCls} placeholder="e.g. John Smith" />
                  </div>
                )}
              </div>
            )}

            {/* Person fields */}
            {currentClient.client_type === 'person' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className={labelCls}>First name <span className="text-red-500">*</span></label>
                  <input type="text" id="name" name="name" value={currentClient.name} onChange={handleInputChange} required className={inputCls} placeholder="e.g. John" />
                </div>
                <div>
                  <label htmlFor="last_name" className={labelCls}>Last name</label>
                  <input type="text" id="last_name" name="last_name" value={currentClient.last_name} onChange={handleInputChange} className={inputCls} placeholder="e.g. Smith" />
                </div>
              </div>
            )}

            <AddressAutocomplete
              label="Address"
              address={currentClient.address}
              zip_code={currentClient.zip_code}
              city={currentClient.city}
              lat={currentClient.lat}
              lng={currentClient.lng}
              countryCode={companyCountryCode}
              hidePostalFields
              placeholder="Start typing an address…"
              onChange={(data: AddressData) => {
                setCurrentClient(prev => ({
                  ...prev,
                  address: data.address,
                  zip_code: data.zip_code,
                  city: data.city,
                  lat: data.lat ?? null,
                  lng: data.lng ?? null,
                  country: countryRule.countryName,
                }))
              }}
            />

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-accent-500 hover:bg-accent-400 text-white py-3.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 shadow-lg shadow-accent-500/25"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Adding…
                </span>
              ) : 'Save client'}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={handleAddClient}
            className="flex w-full items-center justify-center gap-2 border border-dashed border-gray-200 rounded-xl px-6 py-4 text-sm font-medium text-gray-500 hover:text-accent-600 hover:border-accent-400 hover:bg-accent-50/40 transition-all"
          >
            <PlusIcon className="w-4 h-4 flex-shrink-0" />
            Add a client
          </button>
        )}

        {/* ── Added clients list ── */}
        {clients.length > 0 && (
          <div className="space-y-2">
            {clients.map((client, index) => (
              <div
                key={client.id || index}
                className="flex items-center gap-3 bg-accent-50/60 border border-accent-100 rounded-xl px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{clientDisplayName(client)}</p>
                  {clientSubtitle(client) && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{clientSubtitle(client)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Continue footer ── */}
        {!showForm && (
          <div className="pt-5 border-t border-gray-100">
            {continueError && (
              <p className="mb-3 text-sm text-red-600 text-center">{continueError}</p>
            )}
            <button
              type="button"
              onClick={handleContinue}
              disabled={clients.length === 0 || isContinuing}
              className={`w-full py-3.5 px-6 rounded-xl text-sm font-semibold transition-all ${
                clients.length === 0 || isContinuing
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-accent-500 hover:bg-accent-600 text-white shadow-lg shadow-accent-500/20'
              }`}
            >
              {isContinuing
                ? 'Saving…'
                : clients.length === 0
                  ? 'Add at least one client to continue'
                  : 'Continue to jobs →'}
            </button>
          </div>
        )}

      </div>
    </SetupWizardLayout>
  )
}
