'use client'

import { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import AddressAutocomplete from './AddressAutocomplete'
import { getCountryRule } from '../config/countryRules'
import { useAppI18n } from './I18nProvider'

interface Client {
  id: number
  client_type: 'person' | 'company'
  name: string
  last_name: string | null
  country: string
  address: string | null
  zip_code: string | null
  city: string | null
  lat?: number | null
  lng?: number | null
  email: string | null
  phone: string | null
  billing_address: string | null
  billing_zip_code: string | null
  billing_city: string | null
  billing_email: string | null
  billing_phone: string | null
  ean_number?: string | null
}

interface EditClientModalProps {
  isOpen: boolean
  onClose: () => void
  onClientUpdated: () => void
  client: Client | null
}

export default function EditClientModal({ isOpen, onClose, onClientUpdated, client }: EditClientModalProps) {
  const { t } = useAppI18n()
  const userCountryCode = (() => {
    if (typeof window === 'undefined') return 'DK'
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      return user?.activeCompany?.countryCode || 'DK'
    } catch {
      return 'DK'
    }
  })()
  const countryRule = getCountryRule(userCountryCode)
  const [currentClient, setCurrentClient] = useState({
    client_type: 'person' as 'person' | 'company',
    name: '',
    last_name: '',
    country: '',
    address: '',
    zip_code: '',
    city: '',
    lat: null as number | null,
    lng: null as number | null,
    email: '',
    phone: '',
    billing_address: '',
    billing_zip_code: '',
    billing_city: '',
    billing_email: '',
    billing_phone: '',
    ean_number: ''
  })
  const [separateBillingAddress, setSeparateBillingAddress] = useState(false)
  const [separateBillingContact, setSeparateBillingContact] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Initialize form when client changes
  useEffect(() => {
    if (client) {
      setCurrentClient({
        client_type: client.client_type || 'person',
        name: client.name || '',
        last_name: client.last_name || '',
        country: client.country || '',
        address: client.address || '',
        zip_code: client.zip_code || '',
        city: client.city || '',
        lat: client.lat ?? null,
        lng: client.lng ?? null,
        email: client.email || '',
        phone: client.phone || '',
        billing_address: client.billing_address || '',
        billing_zip_code: client.billing_zip_code || '',
        billing_city: client.billing_city || '',
        billing_email: client.billing_email || '',
        billing_phone: client.billing_phone || '',
        ean_number: client.ean_number || ''
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
        client_type: currentClient.client_type,
        name: currentClient.name,
        last_name: currentClient.last_name,
        country: currentClient.country,
        address: currentClient.address,
        zip_code: currentClient.zip_code,
        city: currentClient.city,
        lat: currentClient.lat || null,
        lng: currentClient.lng || null,
        email: currentClient.email,
        phone: currentClient.phone,
        billing_address: separateBillingAddress ? currentClient.billing_address : null,
        billing_zip_code: separateBillingAddress ? currentClient.billing_zip_code : null,
        billing_city: separateBillingAddress ? currentClient.billing_city : null,
        billing_email: separateBillingContact ? currentClient.billing_email : null,
        billing_phone: separateBillingContact ? currentClient.billing_phone : null,
        // EAN/GLN only applies to companies (Danish public-sector e-invoicing).
        ean_number: currentClient.client_type === 'company'
          ? (currentClient.ean_number?.trim() || null)
          : null
      }
      
      const response = await fetch(apiUrl(`/clients/${client.id}`), {
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4 animate-backdrop-in">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-2xl w-full max-h-[92vh] sm:max-h-[90vh] overflow-y-auto pb-safe animate-sheet-in-bottom sm:animate-pop">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{t('app.clients.edit.title')}</h2>
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
                {t('app.clients.edit.name')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={currentClient.name}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                placeholder={t('app.clients.edit.firstNamePlaceholder')}
              />
            </div>
            <div>
              <label htmlFor="last_name" className="block text-sm font-medium text-gray-900 mb-2">
                {t('app.clients.edit.lastName')}
              </label>
              <input
                type="text"
                id="last_name"
                name="last_name"
                value={currentClient.last_name}
                onChange={handleInputChange}
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                placeholder={t('app.clients.edit.lastNamePlaceholder')}
              />
            </div>
          </div>

          {/* Country */}
          <div>
            <label htmlFor="country" className="block text-sm font-medium text-gray-900 mb-2">
              {t('app.clients.edit.country')}
            </label>
            <input
              type="text"
              id="country"
              name="country"
              value={currentClient.country}
              onChange={handleInputChange}
              className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
              placeholder={t('app.clients.edit.countryPlaceholder')}
            />
          </div>

          {/* Address with autocomplete */}
          <AddressAutocomplete
            address={currentClient.address}
            zip_code={currentClient.zip_code}
            city={currentClient.city}
            lat={currentClient.lat}
            lng={currentClient.lng}
            onChange={(data) =>
              setCurrentClient(prev => ({
                ...prev,
                address: data.address,
                zip_code: data.zip_code,
                city: data.city,
                lat: data.lat ?? null,
                lng: data.lng ?? null,
              }))
            }
            placeholder={t('app.clients.edit.streetPlaceholder')}
            countryCode={userCountryCode}
            zipLabel={countryRule.postalCodeLabel}
          />

          {/* Contact Information */}
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-900 mb-2">
                {t('app.clients.edit.email')}
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={currentClient.email}
                onChange={handleInputChange}
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                placeholder={t('app.clients.edit.emailPlaceholder')}
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-900 mb-2">
                {t('app.clients.edit.phone')}
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={currentClient.phone}
                onChange={handleInputChange}
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                placeholder={t('app.clients.edit.phonePlaceholder')}
              />
            </div>
            {currentClient.client_type === 'company' && (
              <div>
                <label htmlFor="ean_number" className="block text-sm font-medium text-gray-900 mb-2">
                  EAN / GLN <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  id="ean_number"
                  name="ean_number"
                  value={currentClient.ean_number}
                  onChange={handleInputChange}
                  inputMode="numeric"
                  maxLength={20}
                  className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                  placeholder="e.g. 5798000418806"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Required for sending invoices to Danish public-sector buyers (NemHandel/PEPPOL).
                  Hidden on the invoice if left blank.
                </p>
              </div>
            )}
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
              {t('app.clients.edit.separateBillingAddress')}
            </label>
          </div>

          {/* Billing Address Fields */}
          {separateBillingAddress && (
            <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-900">{t('app.clients.edit.billingAddressHeading')}</h3>
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-6">
                  <label htmlFor="billing_address" className="block text-sm font-medium text-gray-900 mb-2">
                    {t('app.clients.edit.address')}
                  </label>
                  <input
                    type="text"
                    id="billing_address"
                    name="billing_address"
                    value={currentClient.billing_address}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                    placeholder={t('app.clients.edit.billingStreetPlaceholder')}
                  />
                </div>
                <div className="col-span-3">
                  <label htmlFor="billing_zip_code" className="block text-sm font-medium text-gray-900 mb-2">
                    {countryRule.postalCodeLabel}
                  </label>
                  <input
                    type="text"
                    id="billing_zip_code"
                    name="billing_zip_code"
                    value={currentClient.billing_zip_code}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                    placeholder={t('app.clients.edit.billingPostalPlaceholder')}
                  />
                </div>
                <div className="col-span-3">
                  <label htmlFor="billing_city" className="block text-sm font-medium text-gray-900 mb-2">
                    {t('app.clients.edit.city')}
                  </label>
                  <input
                    type="text"
                    id="billing_city"
                    name="billing_city"
                    value={currentClient.billing_city}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                    placeholder={t('app.clients.edit.cityPlaceholder')}
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
              {t('app.clients.edit.separateBillingContact')}
            </label>
          </div>

          {/* Billing Contact Fields */}
          {separateBillingContact && (
            <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-900">{t('app.clients.edit.billingContactHeading')}</h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="billing_email" className="block text-sm font-medium text-gray-900 mb-2">
                    {t('app.clients.edit.email')}
                  </label>
                  <input
                    type="email"
                    id="billing_email"
                    name="billing_email"
                    value={currentClient.billing_email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                    placeholder={t('app.clients.edit.billingEmailPlaceholder')}
                  />
                </div>
                <div>
                  <label htmlFor="billing_phone" className="block text-sm font-medium text-gray-900 mb-2">
                    {t('app.clients.edit.phone')}
                  </label>
                  <input
                    type="tel"
                    id="billing_phone"
                    name="billing_phone"
                    value={currentClient.billing_phone}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                    placeholder={t('app.clients.edit.phonePlaceholder')}
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
              {t('app.clients.edit.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-lg text-sm font-semibold hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:shadow-blue-500/25"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>{t('app.clients.edit.updating')}</span>
                </span>
              ) : (
                t('app.clients.edit.updateClient')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}




