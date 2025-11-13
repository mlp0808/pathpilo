'use client'

import { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'

interface Client {
  id: number
  first_name: string
  last_name: string
  country: string
  personal_address: string
  personal_zip_code: string
  personal_city: string
  personal_email: string
  personal_phone: string
  billing_address: string | null
  billing_zip_code: string | null
  billing_city: string | null
  billing_email: string | null
  billing_phone: string | null
}

interface EditClientModalProps {
  isOpen: boolean
  onClose: () => void
  onClientUpdated: () => void
  client: Client | null
}

export default function EditClientModal({ isOpen, onClose, onClientUpdated, client }: EditClientModalProps) {
  const [currentClient, setCurrentClient] = useState({
    first_name: '',
    last_name: '',
    country: '',
    personal_address: '',
    personal_zip_code: '',
    personal_city: '',
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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Initialize form when client changes
  useEffect(() => {
    if (client) {
      setCurrentClient({
        first_name: client.first_name || '',
        last_name: client.last_name || '',
        country: client.country || '',
        personal_address: client.personal_address || '',
        personal_zip_code: client.personal_zip_code || '',
        personal_city: client.personal_city || '',
        personal_email: client.personal_email || '',
        personal_phone: client.personal_phone || '',
        billing_address: client.billing_address || '',
        billing_zip_code: client.billing_zip_code || '',
        billing_city: client.billing_city || '',
        billing_email: client.billing_email || '',
        billing_phone: client.billing_phone || ''
      })
      
      // Set billing checkboxes based on existing data
      setSeparateBillingAddress(!!(client.billing_address || client.billing_zip_code || client.billing_city))
      setSeparateBillingContact(!!(client.billing_email || client.billing_phone))
    }
  }, [client])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setCurrentClient(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmitClient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!client) return
    
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
        personal_city: currentClient.personal_city,
        personal_email: currentClient.personal_email,
        personal_phone: currentClient.personal_phone,
        billing_address: separateBillingAddress ? currentClient.billing_address : null,
        billing_zip_code: separateBillingAddress ? currentClient.billing_zip_code : null,
        billing_city: separateBillingAddress ? currentClient.billing_city : null,
        billing_email: separateBillingContact ? currentClient.billing_email : null,
        billing_phone: separateBillingContact ? currentClient.billing_phone : null
      }
      
      const response = await fetch(`apiUrl('/clients/${client.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(clientData)
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setError('')
        onClientUpdated()
        onClose()
      } else {
        setError(data.error || 'Failed to update client')
      }
    } catch (error) {
      setError('Network error: Failed to update client')
      console.error('Client update error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    setError('')
    onClose()
  }

  if (!isOpen || !client) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Edit Client</h2>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmitClient} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-600 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Name Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
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
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                placeholder="First name"
              />
            </div>
            <div>
              <label htmlFor="last_name" className="block text-sm font-medium text-gray-900 mb-2">
                Last name
              </label>
              <input
                type="text"
                id="last_name"
                name="last_name"
                value={currentClient.last_name}
                onChange={handleInputChange}
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                placeholder="Last name"
              />
            </div>
          </div>

          {/* Country */}
          <div>
            <label htmlFor="country" className="block text-sm font-medium text-gray-900 mb-2">
              Country
            </label>
            <input
              type="text"
              id="country"
              name="country"
              value={currentClient.country}
              onChange={handleInputChange}
              className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
              placeholder="e.g. Denmark"
            />
          </div>

          {/* Address Fields */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6">
              <label htmlFor="personal_address" className="block text-sm font-medium text-gray-900 mb-2">
                Address
              </label>
              <input
                type="text"
                id="personal_address"
                name="personal_address"
                value={currentClient.personal_address}
                onChange={handleInputChange}
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                placeholder="Street address"
              />
            </div>
            <div className="col-span-3">
              <label htmlFor="personal_zip_code" className="block text-sm font-medium text-gray-900 mb-2">
                Zip
              </label>
              <input
                type="text"
                id="personal_zip_code"
                name="personal_zip_code"
                value={currentClient.personal_zip_code}
                onChange={handleInputChange}
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                placeholder="1234"
              />
            </div>
            <div className="col-span-3">
              <label htmlFor="personal_city" className="block text-sm font-medium text-gray-900 mb-2">
                City
              </label>
              <input
                type="text"
                id="personal_city"
                name="personal_city"
                value={currentClient.personal_city}
                onChange={handleInputChange}
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                placeholder="Copenhagen"
              />
            </div>
          </div>

          {/* Contact Information */}
          <div className="space-y-4">
            <div>
              <label htmlFor="personal_email" className="block text-sm font-medium text-gray-900 mb-2">
                Email
              </label>
              <input
                type="email"
                id="personal_email"
                name="personal_email"
                value={currentClient.personal_email}
                onChange={handleInputChange}
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                placeholder="client@example.com"
              />
            </div>
            <div>
              <label htmlFor="personal_phone" className="block text-sm font-medium text-gray-900 mb-2">
                Phone
              </label>
              <input
                type="tel"
                id="personal_phone"
                name="personal_phone"
                value={currentClient.personal_phone}
                onChange={handleInputChange}
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                placeholder="+45 1234 5678"
              />
            </div>
          </div>

          {/* Billing Address Checkbox */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="separate_billing_address"
              checked={separateBillingAddress}
              onChange={(e) => setSeparateBillingAddress(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="separate_billing_address" className="ml-2 block text-sm text-gray-900">
              Separate billing address?
            </label>
          </div>

          {/* Billing Address Fields */}
          {separateBillingAddress && (
            <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-900">Billing Address</h3>
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-6">
                  <label htmlFor="billing_address" className="block text-sm font-medium text-gray-900 mb-2">
                    Address
                  </label>
                  <input
                    type="text"
                    id="billing_address"
                    name="billing_address"
                    value={currentClient.billing_address}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                    placeholder="Billing street address"
                  />
                </div>
                <div className="col-span-3">
                  <label htmlFor="billing_zip_code" className="block text-sm font-medium text-gray-900 mb-2">
                    Zip
                  </label>
                  <input
                    type="text"
                    id="billing_zip_code"
                    name="billing_zip_code"
                    value={currentClient.billing_zip_code}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                    placeholder="1234"
                  />
                </div>
                <div className="col-span-3">
                  <label htmlFor="billing_city" className="block text-sm font-medium text-gray-900 mb-2">
                    City
                  </label>
                  <input
                    type="text"
                    id="billing_city"
                    name="billing_city"
                    value={currentClient.billing_city}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                    placeholder="Copenhagen"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Billing Contact Checkbox */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="separate_billing_contact"
              checked={separateBillingContact}
              onChange={(e) => setSeparateBillingContact(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="separate_billing_contact" className="ml-2 block text-sm text-gray-900">
              Separate billing contact info?
            </label>
          </div>

          {/* Billing Contact Fields */}
          {separateBillingContact && (
            <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-900">Billing Contact</h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="billing_email" className="block text-sm font-medium text-gray-900 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    id="billing_email"
                    name="billing_email"
                    value={currentClient.billing_email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                    placeholder="billing@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="billing_phone" className="block text-sm font-medium text-gray-900 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    id="billing_phone"
                    name="billing_phone"
                    value={currentClient.billing_phone}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                    placeholder="+45 1234 5678"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 bg-gray-100 text-gray-700 py-3 px-6 rounded-lg text-sm font-semibold hover:bg-gray-200 focus:ring-2 focus:ring-gray-500/20 focus:ring-offset-2 transition-all duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-lg text-sm font-semibold hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:shadow-blue-500/25"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Updating...</span>
                </span>
              ) : (
                'Update Client'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}




