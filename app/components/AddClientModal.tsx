'use client'

import { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'

interface Client {
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

interface AddClientModalProps {
  isOpen: boolean
  onClose: () => void
  onClientAdded: () => void
}

export default function AddClientModal({ isOpen, onClose, onClientAdded }: AddClientModalProps) {
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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setCurrentClient(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')
    
    try {
      const token = localStorage.getItem('token')
      
      const clientData = {
        client_type: currentClient.client_type,
        name: currentClient.name,
        last_name: currentClient.last_name,
        company_number: currentClient.company_number,
        contact_name: includeContactPerson ? currentClient.contact_name : null,
        country: currentClient.country,
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
        setSeparateBillingAddress(false)
        setSeparateBillingContact(false)
        setIncludeContactPerson(false)
        setError('')
        
        // Close modal and refresh client list
        onClose()
        onClientAdded()
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

  const handleClose = () => {
    // Reset form when closing
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
    setSeparateBillingAddress(false)
    setSeparateBillingContact(false)
    setIncludeContactPerson(false)
    setError('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={handleClose}
        />
        
        {/* Modal */}
        <div className="relative bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Add New Client</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
          
          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-red-600 text-sm font-medium">{error}</p>
              </div>
            )}

            {/* Client Type Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">
                Client Type
              </label>
              <div className="flex bg-gray-100 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setCurrentClient({ ...currentClient, client_type: 'person' })}
                  className={`flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-colors duration-200 ${
                    currentClient.client_type === 'person'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Private Person
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentClient({ ...currentClient, client_type: 'company' })}
                  className={`flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-colors duration-200 ${
                    currentClient.client_type === 'company'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
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
                    <label htmlFor="name" className="block text-sm font-medium text-gray-900 mb-2">
                      Company Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={currentClient.name}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
                      placeholder="e.g. ABC Corp"
                    />
                  </div>
                  <div className="group">
                    <label htmlFor="company_number" className="block text-sm font-medium text-gray-900 mb-2">
                      Company Number
                    </label>
                    <input
                      type="text"
                      id="company_number"
                      name="company_number"
                      value={currentClient.company_number}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
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
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="includeContactPerson" className="ml-2 block text-sm text-gray-900">
                    Add contact person?
                  </label>
                </div>

                {/* Contact Person fields (only show if checkbox is checked) */}
                {includeContactPerson && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label htmlFor="contact_name" className="block text-sm font-medium text-gray-900 mb-2">
                        Contact Person Name
                      </label>
                      <input
                        type="text"
                        id="contact_name"
                        name="contact_name"
                        value={currentClient.contact_name}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
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
                          <label htmlFor="name" className="block text-sm font-medium text-gray-900 mb-2">
                            First Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            id="name"
                            name="name"
                            value={currentClient.name}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
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
                            className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
                            placeholder="e.g. Smith"
                          />
                        </div>
                      </div>
              </div>
            )}

            {/* Address fields (common for both) */}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-6 group">
                <label htmlFor="address" className="block text-sm font-medium text-gray-900 mb-2">
                  Address
                </label>
                <input
                  type="text"
                  id="address"
                  name="address"
                  value={currentClient.address}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
                  placeholder="e.g. Main Street 123"
                />
              </div>
              <div className="col-span-3 group">
                <label htmlFor="zip_code" className="block text-sm font-medium text-gray-900 mb-2">
                  Zip
                </label>
                <input
                  type="text"
                  id="zip_code"
                  name="zip_code"
                  value={currentClient.zip_code}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
                  placeholder="e.g. 2100"
                />
              </div>
              <div className="col-span-3 group">
                <label htmlFor="city" className="block text-sm font-medium text-gray-900 mb-2">
                  City
                </label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  value={currentClient.city}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
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
              <div className="grid grid-cols-12 gap-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
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
                    className="w-full px-4 py-3 text-sm bg-white border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
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
                    className="w-full px-4 py-3 text-sm bg-white border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
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
                    className="w-full px-4 py-3 text-sm bg-white border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                    placeholder="e.g. Aarhus"
                  />
                </div>
              </div>
            )}

            {/* Email and Phone */}
            <div className="grid grid-cols-2 gap-4">
              <div className="group">
                <label htmlFor="email" className="block text-sm font-medium text-gray-900 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={currentClient.email}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
                  placeholder="e.g. john@example.com"
                />
              </div>
              <div className="group">
                <label htmlFor="phone" className="block text-sm font-medium text-gray-900 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={currentClient.phone}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
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
              <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
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
                    className="w-full px-4 py-3 text-sm bg-white border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
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
                    className="w-full px-4 py-3 text-sm bg-white border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                    placeholder="e.g. +45 98 76 54 32"
                  />
                </div>
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                    Adding Client...
                  </span>
                ) : (
                  'Add Client'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}




