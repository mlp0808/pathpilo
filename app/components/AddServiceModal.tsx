'use client'

import { useState } from 'react'
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import { getCountryRule } from '../config/countryRules'
import { useCompanyCountryCode } from '../hooks/useCompanyCountryCode'
import { useAppI18n } from './I18nProvider'

interface Service {
  title: string
  price: string
  duration_hours: string
  duration_minutes: string
  // Optional chart-of-accounts code, used when exporting to bookkeeping
  // systems (e-conomic, Dinero, Billy, Fortnox…). Most users leave blank.
  bookkeeping_account: string
}

interface AddServiceModalProps {
  isOpen: boolean
  onClose: () => void
  onServiceAdded: () => void
}

export default function AddServiceModal({ isOpen, onClose, onServiceAdded }: AddServiceModalProps) {
  const { t } = useAppI18n()
  const companyCountryCode = useCompanyCountryCode()
  const priceCurrency = getCountryRule(companyCountryCode).defaultCurrency
  const [currentService, setCurrentService] = useState<Service>({
    title: '',
    price: '',
    duration_hours: '',
    duration_minutes: '',
    bookkeeping_account: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setCurrentService(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmitService = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')
    
    try {
      const token = localStorage.getItem('token')
      
      // Convert hours and minutes to total minutes
      const totalMinutes = (parseInt(currentService.duration_hours) || 0) * 60 + (parseInt(currentService.duration_minutes) || 0)
      
      const serviceData = {
        title: currentService.title,
        price: currentService.price,
        duration_minutes: totalMinutes,
        bookkeeping_account: currentService.bookkeeping_account.trim() || null
      }
      
      const response = await fetch(apiUrl('/services'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(serviceData)
      })
      
      const data = await response.json()
      
      if (response.ok) {
        // Reset form
        setCurrentService({
          title: '',
          price: '',
          duration_hours: '',
          duration_minutes: '',
          bookkeeping_account: ''
        })
        setError('')
        onServiceAdded()
        onClose()
      } else {
        setError(data.error || t('app.services.errCreate', 'Failed to create service'))
      }
    } catch (error) {
      setError(t('app.services.errNetworkCreate', 'Network error: Failed to create service'))
      console.error('Service creation error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    setCurrentService({
      title: '',
      price: '',
      duration_hours: '',
      duration_minutes: '',
      bookkeeping_account: ''
    })
    setError('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4 animate-backdrop-in">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-md w-full max-h-[92vh] sm:max-h-[90vh] overflow-y-auto pb-safe animate-sheet-in-bottom sm:animate-pop">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{t('app.services.addTitle', 'Add Service')}</h2>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmitService} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-600 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Service Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-900 mb-2">
              {t('app.services.serviceTitle', 'Service title')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={currentService.title}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400"
              placeholder={t('app.services.placeholderTitle', 'e.g. Window Cleaning')}
            />
          </div>

          {/* Price */}
          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-900 mb-2">
              Price ({priceCurrency}) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="price"
              name="price"
              value={currentService.price}
              onChange={handleInputChange}
              required
              min="0"
              step="0.01"
              className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400"
              placeholder="e.g. 150"
            />
          </div>

          {/* Duration - Hours and Minutes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="duration_hours" className="block text-sm font-medium text-gray-900 mb-2">
                {t('app.services.hours', 'Hours')} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="duration_hours"
                name="duration_hours"
                value={currentService.duration_hours}
                onChange={handleInputChange}
                required
                min="0"
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400"
                placeholder={t('app.services.placeholderHours', 'e.g. 1')}
              />
            </div>
            <div>
              <label htmlFor="duration_minutes" className="block text-sm font-medium text-gray-900 mb-2">
                {t('app.services.minutes', 'Minutes')} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="duration_minutes"
                name="duration_minutes"
                value={currentService.duration_minutes}
                onChange={handleInputChange}
                required
                min="0"
                max="59"
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400"
                placeholder={t('app.services.placeholderMinutes', 'e.g. 30')}
              />
            </div>
          </div>

          {/* Bookkeeping account (optional) */}
          <div>
            <label htmlFor="bookkeeping_account" className="block text-sm font-medium text-gray-900 mb-2">
              Bookkeeping account <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              id="bookkeeping_account"
              name="bookkeeping_account"
              value={currentService.bookkeeping_account}
              onChange={handleInputChange}
              maxLength={32}
              className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400"
              placeholder="e.g. 1010"
            />
            <p className="mt-1 text-xs text-gray-500">
              Account code from your chart of accounts (e-conomic, Dinero, Billy…). Only used when exporting to bookkeeping.
            </p>
          </div>

          {/* Note about customization */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-700 text-xs">
              <span className="font-medium">Note:</span> These are standard values that can be customized for each client later.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 bg-gray-100 text-gray-700 py-3 px-6 rounded-lg text-sm font-semibold hover:bg-gray-200 focus:ring-2 focus:ring-gray-500/20 focus:ring-offset-2 transition-all duration-200"
            >
              {t('app.services.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-gradient-to-r from-accent-500 to-accent-600 text-white py-3 px-6 rounded-lg text-sm font-semibold hover:from-accent-600 hover:to-accent-700 focus:ring-2 focus:ring-accent-500/20 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:shadow-accent-500/25"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>{t('app.services.adding', 'Adding...')}</span>
                </span>
              ) : (
                t('app.services.add', 'Add Service')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}




