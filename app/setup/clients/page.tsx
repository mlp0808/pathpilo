'use client'

import { useState, useEffect, useLayoutEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'
import AddressAutocomplete, { AddressData } from '@/app/components/AddressAutocomplete'
import { getCountryRule } from '../../config/countryRules'
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

  const handleContinue = () => {
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-primary-50/30 to-primary-50/50">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="grid grid-cols-5 gap-16 items-start">
          {/* Left Column - Text (40%) */}
          <div className="col-span-2 pt-4">
            <div className="space-y-6">
              <div>
                <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-accent-50 text-accent-700 border border-accent-200 mb-4">
                  Step 3 of 3
                </div>
                <h1 className="text-3xl font-bold text-primary-800 mb-4 tracking-tight">
                  Add your first client
                </h1>
                <p className="text-base text-gray-600 leading-relaxed">
                  Create your first client profile. You can add more clients later from your dashboard.
                </p>
              </div>
              
              <div className="space-y-3 pt-4">
                <div className="flex items-center space-x-3 text-sm text-gray-400">
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
                  <span>Create Company</span>
                </div>
                <div className="flex items-center space-x-3 text-sm text-gray-400">
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
                  <span>Setup Services</span>
                </div>
                <div className="flex items-center space-x-3 text-sm font-medium text-primary-700">
                  <div className="w-1.5 h-1.5 bg-accent-500 rounded-full"></div>
                  <span>Add Clients</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Form (60%) */}
          <div className="col-span-3">
            <div className="mb-3">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-primary-800 transition-colors"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                <span>go back</span>
              </button>
            </div>
            <div className="bg-white border border-primary-100 rounded-3xl p-8 shadow-xl shadow-primary-500/5">
              
              {/* Clients List */}
              {clients.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs font-semibold text-primary-700 mb-3">Your Clients</h3>
                  <div className="space-y-2">
                    {clients.map((client, index) => (
                      <div key={client.id || index} className="flex items-center justify-between bg-primary-50/50 rounded-xl p-3 border border-primary-100/60">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {client.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {client.email && `${client.email} • `}
                            {client.phone && `${client.phone} • `}
                            {client.address && client.zip_code &&
                              `${client.address}, ${client.zip_code}`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Client Form */}
              {showForm ? (
                <form onSubmit={handleSubmitClient} className="space-y-5 animate-in slide-in-from-bottom-4 duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-primary-800">Add Client</h3>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="text-primary-500 hover:text-primary-700 text-sm font-medium"
                    >
                      Cancel
                    </button>
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <p className="text-red-600 text-sm font-medium">{error}</p>
                    </div>
                  )}

                  {/* Client Type Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-primary-700 mb-3">
                      Client Type
                    </label>
                    <div className="flex bg-primary-100/80 rounded-xl p-1 border border-primary-200/60">
                      <button
                        type="button"
                        onClick={() => setCurrentClient({ ...currentClient, client_type: 'person' })}
                        className={`flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-colors duration-200 ${
                          currentClient.client_type === 'person'
                            ? 'bg-white text-primary-800 shadow-sm border border-primary-200/80'
                            : 'text-primary-600 hover:text-primary-800'
                        }`}
                      >
                        Private Person
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentClient({ ...currentClient, client_type: 'company' })}
                        className={`flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-colors duration-200 ${
                          currentClient.client_type === 'company'
                            ? 'bg-white text-primary-800 shadow-sm border border-primary-200/80'
                            : 'text-primary-600 hover:text-primary-800'
                        }`}
                      >
                        Company
                      </button>
                    </div>
                  </div>

                  {/* Company fields (only show for companies) */}
                  {currentClient.client_type === 'company' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="group">
                          <label htmlFor="company_name" className="block text-xs font-semibold text-primary-700 mb-2">
                            Company Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            id="name"
                            name="name"
                            value={currentClient.name}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300 shadow-sm"
                            placeholder="e.g. ABC Corp"
                          />
                        </div>
                        <div className="group">
                          <label htmlFor="company_number" className="block text-xs font-semibold text-primary-700 mb-2">
                            Company Number
                          </label>
                          <input
                            type="text"
                            id="company_number"
                            name="company_number"
                            value={currentClient.company_number}
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300 shadow-sm"
                            placeholder="e.g. CVR 12345678"
                          />
                        </div>
                      </div>

                      {/* Contact Person Checkbox */}
                      <div className="flex items-center">
                        <input
                          id="includeContactPerson"
                          type="checkbox"
                          checked={includeContactPerson}
                          onChange={(e) => setIncludeContactPerson(e.target.checked)}
                          className="h-4 w-4 text-accent-600 focus:ring-accent-500 border-primary-200 rounded"
                        />
                        <label htmlFor="includeContactPerson" className="ml-2 block text-sm text-gray-900">
                          Add contact person?
                        </label>
                      </div>

                      {/* Contact Person fields (only show if checkbox is checked) */}
                      {includeContactPerson && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="group">
                            <label htmlFor="contact_name" className="block text-xs font-semibold text-primary-700 mb-2">
                              Contact Person Name
                            </label>
                            <input
                              type="text"
                              id="contact_name"
                              name="contact_name"
                              value={currentClient.contact_name}
                              onChange={handleInputChange}
                              className="w-full px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300 shadow-sm"
                              placeholder="e.g. John Smith"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Person fields (only show for persons) */}
                  {currentClient.client_type === 'person' && (
                    <div>
                      {/* Name and Last Name */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="group">
                          <label htmlFor="first_name" className="block text-xs font-semibold text-primary-700 mb-2">
                            First Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            id="name"
                            name="name"
                            value={currentClient.name}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300 shadow-sm"
                            placeholder="e.g. John"
                          />
                        </div>
                        <div className="group">
                          <label htmlFor="last_name" className="block text-xs font-semibold text-primary-700 mb-2">
                            Last name
                          </label>
                          <input
                            type="text"
                            id="last_name"
                            name="last_name"
                            value={currentClient.last_name}
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300 shadow-sm"
                            placeholder="e.g. Smith"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Address fields (common for both) — with Maps autocomplete */}
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12">
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
                    </div>
                  </div>

                  {/* Separate Billing Address Checkbox */}
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="separateBillingAddress"
                      checked={separateBillingAddress}
                      onChange={(e) => setSeparateBillingAddress(e.target.checked)}
                      className="h-4 w-4 text-accent-600 focus:ring-accent-500 border-primary-200 rounded"
                    />
                    <label htmlFor="separateBillingAddress" className="ml-2 block text-sm text-primary-800">
                      Separate billing address?
                    </label>
                  </div>

                  {/* Billing Address Fields */}
                  {separateBillingAddress && (
                    <div className="p-4 bg-accent-50 rounded-xl border border-accent-200/60">
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

                  {/* Email and Phone */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label htmlFor="email" className="block text-xs font-semibold text-primary-700 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={currentClient.email}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300 shadow-sm"
                        placeholder="e.g. john@example.com"
                      />
                    </div>
                    <div className="group">
                      <label htmlFor="phone" className="block text-xs font-semibold text-primary-700 mb-2">
                        Phone
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        name="phone"
                        value={currentClient.phone}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300 shadow-sm"
                        placeholder="e.g. +45 12 34 56 78"
                      />
                    </div>
                  </div>

                  {/* Separate Billing Contact Checkbox */}
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="separateBillingContact"
                      checked={separateBillingContact}
                      onChange={(e) => setSeparateBillingContact(e.target.checked)}
                      className="h-4 w-4 text-accent-600 focus:ring-accent-500 border-primary-200 rounded"
                    />
                    <label htmlFor="separateBillingContact" className="ml-2 block text-sm text-primary-800">
                      Separate billing contact info?
                    </label>
                  </div>

                  {/* Billing Contact Fields */}
                  {separateBillingContact && (
                    <div className="grid grid-cols-2 gap-4 p-4 bg-accent-50/80 rounded-xl border border-accent-200/60">
                      <div className="group">
                        <label htmlFor="billing_email" className="block text-xs font-semibold text-primary-700 mb-2">
                          Billing Email
                        </label>
                        <input
                          type="email"
                          id="billing_email"
                          name="billing_email"
                          value={currentClient.billing_email}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 text-sm bg-white/80 border border-accent-200/80 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400"
                          placeholder="e.g. billing@company.com"
                        />
                      </div>
                      <div className="group">
                        <label htmlFor="billing_phone" className="block text-xs font-semibold text-primary-700 mb-2">
                          Billing Phone
                        </label>
                        <input
                          type="tel"
                          id="billing_phone"
                          name="billing_phone"
                          value={currentClient.billing_phone}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 text-sm bg-white/80 border border-accent-200/80 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400"
                          placeholder="e.g. +45 98 76 54 32"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-accent-500 hover:bg-accent-600 text-white py-3 px-6 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-accent-500/20 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent-500/20 hover:shadow-xl hover:shadow-accent-500/25"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Adding Client...</span>
                      </span>
                    ) : (
                      'Add Client'
                    )}
                  </button>
                </form>
              ) : (
                <div className="text-center">
                  <button
                    onClick={handleAddClient}
                    className="inline-flex items-center space-x-2 bg-white/80 border border-primary-200/80 rounded-xl px-6 py-4 text-sm font-medium text-primary-800 hover:bg-white hover:border-primary-300 focus:ring-2 focus:ring-accent-500/20 focus:ring-offset-2 transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    <PlusIcon className="w-5 h-5" />
                    <span>Add client</span>
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-8 pt-6 border-t border-primary-100">
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={clients.length === 0 || showForm}
                  className={`w-full py-3 px-6 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-offset-2 transition-all duration-200 shadow-lg ${
                    clients.length === 0 || showForm
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                      : 'bg-accent-500 hover:bg-accent-600 text-white focus:ring-accent-500/20 shadow-accent-500/20 hover:shadow-xl hover:shadow-accent-500/25'
                  }`}
                >
                  Choose your plan →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
