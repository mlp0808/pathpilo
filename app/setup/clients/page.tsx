'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon } from '@heroicons/react/24/outline'

interface Client {
  id?: number
  first_name: string
  last_name: string
  country: string
  personal_address: string
  personal_zip_code: string
  personal_email: string
  personal_phone: string
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
    first_name: '',
    last_name: '',
    country: '',
    personal_address: '',
    personal_zip_code: '',
    personal_email: '',
    personal_phone: '',
    billing_address: '',
    billing_zip_code: '',
    billing_city: '',
    billing_email: '',
    billing_phone: ''
  })
  const [separateBillingAddress, setSeparateBillingAddress] = useState(false)
  const [separateBillingContact, setSeparateBillingContact] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

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
      
      const clientData = {
        first_name: currentClient.first_name,
        last_name: currentClient.last_name,
        country: currentClient.country,
        personal_address: currentClient.personal_address,
        personal_zip_code: currentClient.personal_zip_code,
        personal_email: currentClient.personal_email,
        personal_phone: currentClient.personal_phone,
        billing_address: separateBillingAddress ? currentClient.billing_address : null,
        billing_zip_code: separateBillingAddress ? currentClient.billing_zip_code : null,
        billing_email: separateBillingContact ? currentClient.billing_email : null,
        billing_phone: separateBillingContact ? currentClient.billing_phone : null
      }
      
      const response = await fetch('http://localhost:3002/api/clients', {
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
          first_name: '',
          last_name: '',
          country: '',
          personal_address: '',
          personal_zip_code: '',
          personal_email: '',
          personal_phone: '',
          billing_address: '',
          billing_zip_code: '',
          billing_city: '',
          billing_email: '',
          billing_phone: ''
        })
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
    router.push('/dashboard')
  }

  const handleCancel = () => {
    setShowForm(false)
    setCurrentClient({
      first_name: '',
      last_name: '',
      country: '',
      personal_address: '',
      personal_zip_code: '',
      personal_email: '',
      personal_phone: '',
      billing_address: '',
      billing_zip_code: '',
      billing_city: '',
      billing_email: '',
      billing_phone: ''
    })
    setSeparateBillingAddress(false)
    setSeparateBillingContact(false)
    setError('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="grid grid-cols-5 gap-16 items-start">
          {/* Left Column - Text (40%) */}
          <div className="col-span-2 pt-4">
            <div className="space-y-6">
              <div>
                <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 mb-4">
                  Step 3 of 3
                </div>
                <h1 className="text-3xl font-semibold text-gray-900 mb-4 tracking-tight">
                  Add your first client
                </h1>
                <p className="text-base text-gray-600 leading-relaxed">
                  Create your first client profile. You can add more clients later from your dashboard.
                </p>
              </div>
              
              <div className="space-y-3 pt-4">
                <div className="flex items-center space-x-3 text-sm text-gray-500">
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
                  <span>Company Information</span>
                </div>
                <div className="flex items-center space-x-3 text-sm text-gray-500">
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
                  <span>Services</span>
                </div>
                <div className="flex items-center space-x-3 text-sm text-gray-500">
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                  <span>First Client</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Form (60%) */}
          <div className="col-span-3">
            <div className="bg-white/70 backdrop-blur-sm border border-gray-200/60 rounded-2xl p-8 shadow-xl shadow-gray-900/5">
              
              {/* Clients List */}
              {clients.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Your Clients</h3>
                  <div className="space-y-2">
                    {clients.map((client, index) => (
                      <div key={client.id || index} className="flex items-center justify-between bg-gray-50/80 rounded-lg p-3">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {client.first_name} {client.last_name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {client.personal_email && `${client.personal_email} • `}
                            {client.personal_phone && `${client.personal_phone} • `}
                            {client.personal_address && client.personal_zip_code && 
                              `${client.personal_address}, ${client.personal_zip_code}`}
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
                    <h3 className="text-sm font-medium text-gray-900">Add Client</h3>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="text-gray-400 hover:text-gray-600 text-sm"
                    >
                      Cancel
                    </button>
                  </div>

                  {error && (
                    <div className="bg-red-50/80 border border-red-200/60 rounded-xl p-4 backdrop-blur-sm">
                      <p className="text-red-600 text-sm font-medium">{error}</p>
                    </div>
                  )}

                  {/* Name and Last Name */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label htmlFor="first_name" className="block text-sm font-medium text-gray-900 mb-2">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="first_name"
                        name="first_name"
                        value={currentClient.first_name}
                        onChange={handleInputChange}
                        required
                        className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
                        placeholder="e.g. John"
                      />
                    </div>
                    <div className="group">
                      <label htmlFor="last_name" className="block text-sm font-medium text-gray-900 mb-2">
                        Last name
                      </label>
                      <input
                        type="text"
                        id="last_name"
                        name="last_name"
                        value={currentClient.last_name}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
                        placeholder="e.g. Smith"
                      />
                    </div>
                  </div>

                  {/* Address, Zip, City */}
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-6 group">
                      <label htmlFor="personal_address" className="block text-sm font-medium text-gray-900 mb-2">
                        Address
                      </label>
                      <input
                        type="text"
                        id="personal_address"
                        name="personal_address"
                        value={currentClient.personal_address}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
                        placeholder="e.g. Main Street 123"
                      />
                    </div>
                    <div className="col-span-3 group">
                      <label htmlFor="personal_zip_code" className="block text-sm font-medium text-gray-900 mb-2">
                        Zip
                      </label>
                      <input
                        type="text"
                        id="personal_zip_code"
                        name="personal_zip_code"
                        value={currentClient.personal_zip_code}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
                        placeholder="e.g. 2100"
                      />
                    </div>
                    <div className="col-span-3 group">
                      <label htmlFor="country" className="block text-sm font-medium text-gray-900 mb-2">
                        City
                      </label>
                      <input
                        type="text"
                        id="country"
                        name="country"
                        value={currentClient.country}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
                        placeholder="e.g. Copenhagen"
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
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="separateBillingAddress" className="ml-2 block text-sm text-gray-900">
                      Separate billing address?
                    </label>
                  </div>

                  {/* Billing Address Fields */}
                  {separateBillingAddress && (
                    <div className="grid grid-cols-12 gap-4 p-4 bg-blue-50/80 rounded-xl border border-blue-200/60">
                      <div className="col-span-6 group">
                        <label htmlFor="billing_address" className="block text-sm font-medium text-blue-900 mb-2">
                          Billing Address
                        </label>
                        <input
                          type="text"
                          id="billing_address"
                          name="billing_address"
                          value={currentClient.billing_address}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 text-sm bg-white/80 border border-blue-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                          placeholder="e.g. Business Street 456"
                        />
                      </div>
                      <div className="col-span-3 group">
                        <label htmlFor="billing_zip_code" className="block text-sm font-medium text-blue-900 mb-2">
                          Billing Zip
                        </label>
                        <input
                          type="text"
                          id="billing_zip_code"
                          name="billing_zip_code"
                          value={currentClient.billing_zip_code}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 text-sm bg-white/80 border border-blue-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                          placeholder="e.g. 2200"
                        />
                      </div>
                      <div className="col-span-3 group">
                        <label htmlFor="billing_city" className="block text-sm font-medium text-blue-900 mb-2">
                          Billing City
                        </label>
                        <input
                          type="text"
                          id="billing_city"
                          name="billing_city"
                          value={currentClient.billing_city}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 text-sm bg-white/80 border border-blue-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                          placeholder="e.g. Aarhus"
                        />
                      </div>
                    </div>
                  )}

                  {/* Email and Phone */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label htmlFor="personal_email" className="block text-sm font-medium text-gray-900 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        id="personal_email"
                        name="personal_email"
                        value={currentClient.personal_email}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
                        placeholder="e.g. john@example.com"
                      />
                    </div>
                    <div className="group">
                      <label htmlFor="personal_phone" className="block text-sm font-medium text-gray-900 mb-2">
                        Phone
                      </label>
                      <input
                        type="tel"
                        id="personal_phone"
                        name="personal_phone"
                        value={currentClient.personal_phone}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
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
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="separateBillingContact" className="ml-2 block text-sm text-gray-900">
                      Separate billing contact info?
                    </label>
                  </div>

                  {/* Billing Contact Fields */}
                  {separateBillingContact && (
                    <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50/80 rounded-xl border border-blue-200/60">
                      <div className="group">
                        <label htmlFor="billing_email" className="block text-sm font-medium text-blue-900 mb-2">
                          Billing Email
                        </label>
                        <input
                          type="email"
                          id="billing_email"
                          name="billing_email"
                          value={currentClient.billing_email}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 text-sm bg-white/80 border border-blue-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                          placeholder="e.g. billing@company.com"
                        />
                      </div>
                      <div className="group">
                        <label htmlFor="billing_phone" className="block text-sm font-medium text-blue-900 mb-2">
                          Billing Phone
                        </label>
                        <input
                          type="tel"
                          id="billing_phone"
                          name="billing_phone"
                          value={currentClient.billing_phone}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 text-sm bg-white/80 border border-blue-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                          placeholder="e.g. +45 98 76 54 32"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:shadow-blue-500/25"
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
                    className="inline-flex items-center space-x-2 bg-white/80 border border-gray-200/80 rounded-xl px-6 py-4 text-sm font-medium text-gray-900 hover:bg-white hover:border-gray-300 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    <PlusIcon className="w-5 h-5" />
                    <span>Add client</span>
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-8 pt-6 border-t border-gray-200/60">
                <div className="flex flex-col sm:flex-row gap-3">
                  {clients.length > 0 && !showForm ? (
                    <button
                      onClick={handleContinue}
                      className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 transition-all duration-200 shadow-lg hover:shadow-xl hover:shadow-blue-500/25"
                    >
                      Continue to Dashboard
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleContinue}
                        className="flex-1 bg-gray-100 text-gray-700 py-3 px-6 rounded-xl text-sm font-semibold hover:bg-gray-200 focus:ring-2 focus:ring-gray-500/20 focus:ring-offset-2 transition-all duration-200"
                      >
                        Skip Clients
                      </button>
                      <button
                        onClick={handleContinue}
                        className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 transition-all duration-200 shadow-lg hover:shadow-xl hover:shadow-blue-500/25"
                      >
                        Continue to Dashboard
                      </button>
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  You can add clients later from your dashboard
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
