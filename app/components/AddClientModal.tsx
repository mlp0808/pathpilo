'use client'

import { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import AddressAutocomplete from './AddressAutocomplete'
import { getCountryRule } from '../config/countryRules'
import { useAppI18n } from './I18nProvider'

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
  lat?: number | null
  lng?: number | null
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
    lat: null,
    lng: null,
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
        lat: currentClient.lat || null,
        lng: currentClient.lng || null,
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
          lat: null,
          lng: null,
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
        setError(data.error || t('app.clients.add.errCreate'))
      }
    } catch (error) {
      setError(t('app.clients.add.errNetwork'))
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
      <div className="flex min-h-screen items-end sm:items-center justify-center sm:p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity animate-backdrop-in"
          onClick={handleClose}
        />

        {/* Modal — bottom sheet on mobile so the form is reachable from the
            keyboard, popped card on tablet/desktop. */}
        <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] sm:max-h-[90vh] overflow-y-auto border border-slate-200 pb-safe animate-sheet-in-bottom sm:animate-pop">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-primary-500 to-accent-500 text-white">
            <div>
              <h2 className="text-base font-semibold">Add client</h2>
              <p className="text-xs text-white/80 mt-0.5">
                Create a new client that you can schedule jobs and send invoices to.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
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
              <label className="block text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">
                {t('app.clients.add.clientType')}
              </label>
              <div className="flex bg-slate-50 rounded-xl p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setCurrentClient({ ...currentClient, client_type: 'person' })}
                  className={`flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-colors duration-200 ${
                    currentClient.client_type === 'person'
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-slate-500 hover:text-primary-600'
                  }`}
                >
                  {t('app.clients.add.privatePerson')}
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentClient({ ...currentClient, client_type: 'company' })}
                  className={`flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-colors duration-200 ${
                    currentClient.client_type === 'company'
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-slate-500 hover:text-primary-600'
                  }`}
                >
                  {t('app.clients.add.company')}
                </button>
              </div>
            </div>

            {/* Company fields (only show for companies) */}
            {currentClient.client_type === 'company' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="group">
                    <label htmlFor="name" className="block text-sm font-medium text-slate-900 mb-2">
                      {t('app.clients.add.companyName')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={currentClient.name}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-slate-400 hover:border-slate-300"
                      placeholder={t('app.clients.add.companyNamePlaceholder')}
                    />
                  </div>
                  <div className="group">
                    <label htmlFor="company_number" className="block text-sm font-medium text-slate-900 mb-2">
                      {countryRule.companyNumberLabel}
                    </label>
                    <input
                      type="text"
                      id="company_number"
                      name="company_number"
                      value={currentClient.company_number}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-slate-400 hover:border-slate-300"
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
                    className="h-4 w-4 text-accent-600 focus:ring-accent-500 border-slate-300 rounded"
                  />
                  <label htmlFor="includeContactPerson" className="ml-2 block text-sm text-slate-900">
                    {t('app.clients.add.addContactPerson')}
                  </label>
                </div>

                {/* Contact Person fields (only show if checkbox is checked) */}
                {includeContactPerson && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label htmlFor="contact_name" className="block text-sm font-medium text-slate-900 mb-2">
                        {t('app.clients.add.contactPersonName')}
                      </label>
                      <input
                        type="text"
                        id="contact_name"
                        name="contact_name"
                        value={currentClient.contact_name}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-slate-400 hover:border-slate-300"
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
                          <label htmlFor="name" className="block text-sm font-medium text-slate-900 mb-2">
                            {t('app.clients.add.firstName')} <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            id="name"
                            name="name"
                            value={currentClient.name}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-slate-400 hover:border-slate-300"
                            placeholder={t('app.clients.add.firstNamePlaceholder')}
                          />
                        </div>
                        <div className="group">
                          <label htmlFor="last_name" className="block text-sm font-medium text-slate-900 mb-2">
                            {t('app.clients.add.lastName')}
                          </label>
                          <input
                            type="text"
                            id="last_name"
                            name="last_name"
                            value={currentClient.last_name}
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-slate-400 hover:border-slate-300"
                            placeholder={t('app.clients.add.lastNamePlaceholder')}
                          />
                        </div>
                      </div>
              </div>
            )}

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
              placeholder="e.g. Main Street 123"
              countryCode={userCountryCode}
              zipLabel={countryRule.postalCodeLabel}
            />

            {/* Separate Billing Address Checkbox */}
            <div className="space-y-1">
              <div className="flex items-center">
              <input
                type="checkbox"
                id="separateBillingAddress"
                checked={separateBillingAddress}
                onChange={(e) => setSeparateBillingAddress(e.target.checked)}
                className="h-4 w-4 text-accent-600 focus:ring-accent-500 border-slate-300 rounded"
              />
              <label htmlFor="separateBillingAddress" className="ml-2 block text-sm text-slate-900">
                {t('app.clients.add.separateBillingAddress')}
              </label>
              </div>
              <p className="ml-6 text-xs text-slate-500">
                {t('app.clients.add.separateBillingAddressHelp')}
              </p>
            </div>

            {/* Billing Address Fields */}
            {separateBillingAddress && (
              <div className="grid grid-cols-12 gap-4 p-4 bg-accent-50 rounded-xl border border-accent-200">
                <div className="col-span-6 group">
                  <label htmlFor="billing_address" className="block text-sm font-medium text-primary-900 mb-2">
                    {t('app.clients.add.billingAddress')}
                  </label>
                  <input
                    type="text"
                    id="billing_address"
                    name="billing_address"
                    value={currentClient.billing_address}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm bg-white border border-accent-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-slate-400"
                    placeholder="e.g. Business Street 456"
                  />
                </div>
                <div className="col-span-3 group">
                  <label htmlFor="billing_zip_code" className="block text-sm font-medium text-primary-900 mb-2">
                    {countryRule.postalCodeLabel}
                  </label>
                  <input
                    type="text"
                    id="billing_zip_code"
                    name="billing_zip_code"
                    value={currentClient.billing_zip_code}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm bg-white border border-accent-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-slate-400"
                    placeholder={t('app.clients.add.billingPostalPlaceholder')}
                  />
                </div>
                <div className="col-span-3 group">
                  <label htmlFor="billing_city" className="block text-sm font-medium text-primary-900 mb-2">
                    {t('app.clients.add.billingCity')}
                  </label>
                  <input
                    type="text"
                    id="billing_city"
                    name="billing_city"
                    value={currentClient.billing_city}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm bg-white border border-accent-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-slate-400"
                    placeholder={t('app.clients.add.billingCityPlaceholder')}
                  />
                </div>
              </div>
            )}

            {/* Email and Phone */}
            <div className="grid grid-cols-2 gap-4">
              <div className="group">
                <label htmlFor="email" className="block text-sm font-medium text-slate-900 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={currentClient.email}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-slate-400 hover:border-slate-300"
                  placeholder={t('app.clients.add.emailPlaceholder')}
                />
              </div>
              <div className="group">
                <label htmlFor="phone" className="block text-sm font-medium text-slate-900 mb-2">
                  {t('app.clients.add.phone')}
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={currentClient.phone}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-slate-400 hover:border-slate-300"
                  placeholder={t('app.clients.add.phonePlaceholder')}
                />
              </div>
            </div>

            {/* Separate Billing Contact Checkbox */}
            <div className="space-y-1">
              <div className="flex items-center">
              <input
                type="checkbox"
                id="separateBillingContact"
                checked={separateBillingContact}
                onChange={(e) => setSeparateBillingContact(e.target.checked)}
                className="h-4 w-4 text-accent-600 focus:ring-accent-500 border-slate-300 rounded"
              />
              <label htmlFor="separateBillingContact" className="ml-2 block text-sm text-slate-900">
                {t('app.clients.add.separateBillingContact')}
              </label>
              </div>
              <p className="ml-6 text-xs text-slate-500">
                {t('app.clients.add.separateBillingContactHelp')}
              </p>
            </div>

            {/* Billing Contact Fields */}
            {separateBillingContact && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-accent-50 rounded-xl border border-accent-200">
                <div className="group">
                  <label htmlFor="billing_email" className="block text-sm font-medium text-primary-900 mb-2">
                    {t('app.clients.add.billingEmail')}
                  </label>
                  <input
                    type="email"
                    id="billing_email"
                    name="billing_email"
                    value={currentClient.billing_email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm bg-white border border-accent-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-slate-400"
                    placeholder={t('app.clients.add.billingEmailPlaceholder')}
                  />
                </div>
                <div className="group">
                  <label htmlFor="billing_phone" className="block text-sm font-medium text-primary-900 mb-2">
                    {t('app.clients.add.billingPhone')}
                  </label>
                  <input
                    type="tel"
                    id="billing_phone"
                    name="billing_phone"
                    value={currentClient.billing_phone}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 text-sm bg-white border border-accent-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-slate-400"
                    placeholder="e.g. +45 98 76 54 32"
                  />
                </div>
              </div>
            )}

            {/* Submit Buttons */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-slate-200">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 transition-colors"
              >
                {t('app.clients.add.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-xl shadow-md shadow-primary-500/20 hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                    {t('app.clients.add.addingClient')}
                  </span>
                ) : (
                  t('app.clients.add.addClient')
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}




