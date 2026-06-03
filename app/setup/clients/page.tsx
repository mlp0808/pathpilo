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
  email: string
  phone: string
  billing_address: string
  billing_zip_code: string
  billing_city: string
  billing_email: string
  billing_phone: string
}

export default function ClientsSetupPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [showForm, setShowForm] = useState(false)
  const [currentClient, setCurrentClient] = useState<Client>({
    client_type: 'person',
    name: '',
    last_name: '',
    company_number: '',
    contact_name: '',
    country: '',
    address: '',
    zip_code: '',
    city: '',
    email: '',
    phone: '',
    billing_address: '',
    billing_zip_code: '',
    billing_city: '',
    billing_email: '',
    billing_phone: ''
  })
  const [separateBillingAddress, setSeparateBillingAddress] = useState(false)
  const [separateBillingContact, setSeparateBillingContact] = useState(false)
  const [includeContactPerson, setIncludeContactPerson] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  /** Biases Mapbox + labels to the active company country (same as dashboard client modals) */
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
        email: currentClient.email,
        phone: currentClient.phone,
        billing_address: separateBillingAddress ? currentClient.billing_address : null,
        billing_zip_code: separateBillingAddress ? currentClient.billing_zip_code : null,
        billing_city: separateBillingAddress ? currentClient.billing_city : null,
        billing_email: separateBillingContact ? currentClient.billing_email : null,
        billing_phone: separateBillingContact ? currentClient.billing_phone : null
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
        // Add client to local list
        setClients(prev => [...prev, { ...currentClient, id: data.client.id }])
        
        // Reset form
        setCurrentClient({
          client_type: 'person',
          name: '',
          last_name: '',
          company_number: '',
          contact_name: '',
          country: '',
          address: '',
          zip_code: '',
          city: '',
          email: '',
          phone: '',
          billing_address: '',
          billing_zip_code: '',
          billing_city: '',
          billing_email: '',
          billing_phone: ''
        })
        setIncludeContactPerson(false)
        setSeparateBillingAddress(false)
        setSeparateBillingContact(false)
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
    const { advanceOnboardingProgress, patchSessionOnboardingStep } =
      await import('../../utils/onboardingClient')
    await advanceOnboardingProgress('wizard_completed')
    patchSessionOnboardingStep('plan')
    router.push('/setup/plan')
  }

  const handleBack = () => {
    router.push('/setup/services')
  }

  const handleCancel = () => {
    setShowForm(false)
    setCurrentClient({
      client_type: 'person',
      name: '',
      last_name: '',
      company_number: '',
      contact_name: '',
      country: '',
      address: '',
      zip_code: '',
      city: '',
      email: '',
      phone: '',
      billing_address: '',
      billing_zip_code: '',
      billing_city: '',
      billing_email: '',
      billing_phone: ''
    })
    setIncludeContactPerson(false)
    setSeparateBillingAddress(false)
    setSeparateBillingContact(false)
    setIncludeContactPerson(false)
    setError('')
  }

  const inputCls = setupFieldInputClass
  const labelCls = setupFieldLabelClass
  const checkboxLabelCls = "ml-2.5 text-sm text-gray-700 select-none cursor-pointer"
  const checkboxCls = "h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-500/30 focus:ring-offset-0"

  const clientDisplayName = (client: Client) => {
    const name = client.name?.trim() || ''
    const last = client.last_name?.trim() || ''
    if (client.client_type === 'person' && last) return `${name} ${last}`
    return name
  }

  return (
    <SetupWizardLayout
      step={3}
      title="Add your first client"
      description="Create your first client profile. You can add more clients anytime from your dashboard."
      onBack={handleBack}
    >
      <div className="relative z-10">
        {!showForm && (
          <SetupWizardHint showArrow={clients.length === 0}>
            {clients.length === 0
              ? 'Click the button below and add your first client.'
              : 'Add another client using the button below.'}
          </SetupWizardHint>
        )}

        {clients.length > 0 && (
          <div className="relative z-[1] mb-4 space-y-2">
            {clients.map((client, index) => (
              <div key={client.id || index} className="flex items-center bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">{clientDisplayName(client)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {[client.email, client.phone, client.address && client.zip_code ? `${client.address}, ${client.zip_code}` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {showForm ? (
        <form onSubmit={handleSubmitClient} className="space-y-5 animate-in slide-in-from-bottom-2 duration-200">
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
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className={labelCls}>Company name <span className="text-red-500">*</span></label>
                  <input type="text" id="name" name="name" value={currentClient.name} onChange={handleInputChange} required className={inputCls} placeholder="e.g. ABC Corp" />
                </div>
                <div>
                  <label htmlFor="company_number" className={labelCls}>Company number</label>
                  <input type="text" id="company_number" name="company_number" value={currentClient.company_number} onChange={handleInputChange} className={inputCls} placeholder="e.g. 12345678" />
                </div>
              </div>
              <label className="flex items-center cursor-pointer">
                <input type="checkbox" id="includeContactPerson" checked={includeContactPerson} onChange={e => setIncludeContactPerson(e.target.checked)} className={checkboxCls} />
                <span className={checkboxLabelCls}>Add contact person?</span>
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

          {/* Address */}
          <AddressAutocomplete
            label="Address"
            address={currentClient.address}
            zip_code={currentClient.zip_code}
            city={currentClient.city}
            lat={undefined}
            lng={undefined}
            countryCode={companyCountryCode}
            zipLabel={countryRule.postalCodeLabel}
            cityLabel="City"
            placeholder="Start typing an address…"
            onChange={(data: AddressData) => {
              setCurrentClient(prev => ({
                ...prev,
                address: data.address,
                zip_code: data.zip_code,
                city: data.city,
                country: countryRule.countryName,
              }))
            }}
          />

          {/* Billing address toggle */}
          <label className="flex items-center cursor-pointer">
            <input type="checkbox" id="separateBillingAddress" checked={separateBillingAddress} onChange={e => setSeparateBillingAddress(e.target.checked)} className={checkboxCls} />
            <span className={checkboxLabelCls}>Different billing address?</span>
          </label>
          {separateBillingAddress && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <AddressAutocomplete
                label="Billing address"
                address={currentClient.billing_address}
                zip_code={currentClient.billing_zip_code}
                city={currentClient.billing_city}
                lat={undefined}
                lng={undefined}
                countryCode={companyCountryCode}
                zipLabel={`Billing ${countryRule.postalCodeLabel}`}
                cityLabel="Billing city"
                placeholder="Start typing a billing address…"
                onChange={(data: AddressData) => {
                  setCurrentClient(prev => ({
                    ...prev,
                    billing_address: data.address,
                    billing_zip_code: data.zip_code,
                    billing_city: data.city,
                  }))
                }}
              />
            </div>
          )}

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="email" className={labelCls}>Email</label>
              <input type="email" id="email" name="email" value={currentClient.email} onChange={handleInputChange} className={inputCls} placeholder="john@example.com" />
            </div>
            <div>
              <label htmlFor="phone" className={labelCls}>Phone</label>
              <input type="tel" id="phone" name="phone" value={currentClient.phone} onChange={handleInputChange} className={inputCls} placeholder="+45 12 34 56 78" />
            </div>
          </div>

          {/* Billing contact toggle */}
          <label className="flex items-center cursor-pointer">
            <input type="checkbox" id="separateBillingContact" checked={separateBillingContact} onChange={e => setSeparateBillingContact(e.target.checked)} className={checkboxCls} />
            <span className={checkboxLabelCls}>Different billing contact?</span>
          </label>
          {separateBillingContact && (
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div>
                <label htmlFor="billing_email" className={labelCls}>Billing email</label>
                <input type="email" id="billing_email" name="billing_email" value={currentClient.billing_email} onChange={handleInputChange} className={inputCls} placeholder="billing@company.com" />
              </div>
              <div>
                <label htmlFor="billing_phone" className={labelCls}>Billing phone</label>
                <input type="tel" id="billing_phone" name="billing_phone" value={currentClient.billing_phone} onChange={handleInputChange} className={inputCls} placeholder="+45 98 76 54 32" />
              </div>
            </div>
          )}

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
            className="relative z-20 flex w-full items-center justify-center gap-2.5 bg-gray-50 border border-dashed border-gray-200 rounded-xl px-6 py-5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:border-gray-300 hover:bg-white transition-all"
          >
            <PlusIcon className="w-4 h-4" />
            Add a client
          </button>
        )}

        {!showForm && (
          <div className="mt-8 pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={handleContinue}
              disabled={clients.length === 0}
              className={`w-full py-3.5 px-6 rounded-xl text-sm font-semibold transition-all ${
                clients.length === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-accent-500 hover:bg-accent-600 text-white shadow-lg shadow-accent-500/20'
              }`}
            >
              {clients.length === 0 ? 'Add at least one client to continue' : 'Choose your plan →'}
            </button>
          </div>
        )}
      </div>
    </SetupWizardLayout>
  )
}
