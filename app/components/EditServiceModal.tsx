'use client'

import { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import { getCountryRule } from '../config/countryRules'
import { useCompanyCountryCode } from '../hooks/useCompanyCountryCode'
import { useAppI18n } from './I18nProvider'

interface Service {
  id: number
  title: string
  price: number | string
  duration_minutes: number
  default_quantity?: number | string
  bookkeeping_account?: string | null
}

interface EditServiceModalProps {
  isOpen: boolean
  onClose: () => void
  onServiceUpdated: () => void
  service: Service | null
  metaFields?: string[]
}

export default function EditServiceModal({
  isOpen,
  onClose,
  onServiceUpdated,
  service,
  metaFields = ['price', 'duration'],
}: EditServiceModalProps) {
  const { t } = useAppI18n()
  const hasDuration = metaFields.includes('duration')
  const hasQuantity = metaFields.includes('quantity')
  const [currentService, setCurrentService] = useState({
    title: '',
    price: '',
    duration_hours: '',
    duration_minutes: '',
    quantity: '1',
    bookkeeping_account: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const companyCountryCode = useCompanyCountryCode()
  const priceCurrency = getCountryRule(companyCountryCode).defaultCurrency

  useEffect(() => {
    if (service) {
      const totalMinutes = Number(service.duration_minutes) || 0
      const hours = Math.floor(totalMinutes / 60)
      const minutes = totalMinutes % 60
      setCurrentService({
        title: service.title,
        price: String(service.price),
        duration_hours: hours.toString(),
        duration_minutes: minutes.toString(),
        quantity: String(service.default_quantity ?? 1),
        bookkeeping_account: service.bookkeeping_account || '',
      })
    }
  }, [service])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setCurrentService((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmitService = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!service) return

    setIsSubmitting(true)
    setError('')

    try {
      const token = localStorage.getItem('token')
      const totalMinutes = hasDuration
        ? (parseInt(currentService.duration_hours) || 0) * 60 + (parseInt(currentService.duration_minutes) || 0)
        : 0
      const qty = hasQuantity ? parseFloat(currentService.quantity) : 1
      if (hasQuantity && (!Number.isFinite(qty) || qty <= 0)) {
        setError(t('app.items.invalidQty', 'Quantity must be a positive number'))
        setIsSubmitting(false)
        return
      }

      const serviceData: Record<string, unknown> = {
        title: currentService.title,
        price: parseFloat(currentService.price),
        duration_minutes: totalMinutes,
        bookkeeping_account: currentService.bookkeeping_account.trim() || null,
      }
      if (hasQuantity) {
        serviceData.default_quantity = qty
      }

      const response = await fetch(apiUrl(`/services/${service.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(serviceData),
      })

      const data = await response.json()

      if (response.ok) {
        setError('')
        onServiceUpdated()
        onClose()
      } else {
        setError(data.error || t('app.services.errUpdate', 'Failed to update service'))
      }
    } catch (err) {
      setError(t('app.services.errNetworkUpdate', 'Network error: Failed to update service'))
      console.error('Service update error:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    setError('')
    onClose()
  }

  if (!isOpen || !service) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4 animate-backdrop-in">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-md w-full max-h-[92vh] sm:max-h-[90vh] overflow-y-auto pb-safe animate-sheet-in-bottom sm:animate-pop">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {t('app.items.editItem', 'Edit item')}
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmitService} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-600 text-sm font-medium">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-900 mb-2">
              {t('app.items.itemTitle', 'Title')} <span className="text-red-500">*</span>
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

          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-900 mb-2">
              {hasQuantity
                ? t('app.items.unitPrice', 'Unit price')
                : t('app.services.priceLabel', 'Price')}{' '}
              ({priceCurrency}) <span className="text-red-500">*</span>
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
              placeholder={t('app.services.placeholderPrice', 'e.g. 150')}
            />
          </div>

          {hasQuantity && (
            <div>
              <label htmlFor="quantity" className="block text-sm font-medium text-gray-900 mb-2">
                {t('app.items.defaultQty', 'Default quantity')} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="quantity"
                name="quantity"
                value={currentService.quantity}
                onChange={handleInputChange}
                required
                min="0.001"
                step="any"
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200"
              />
            </div>
          )}

          {hasDuration && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="duration_hours" className="block text-sm font-medium text-gray-900 mb-2">
                  {t('app.services.hours', 'Hours')}
                </label>
                <input
                  type="number"
                  id="duration_hours"
                  name="duration_hours"
                  value={currentService.duration_hours}
                  onChange={handleInputChange}
                  min="0"
                  className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400"
                  placeholder={t('app.services.placeholderHours', 'e.g. 1')}
                />
              </div>
              <div>
                <label htmlFor="duration_minutes" className="block text-sm font-medium text-gray-900 mb-2">
                  {t('app.services.minutes', 'Minutes')}
                </label>
                <input
                  type="number"
                  id="duration_minutes"
                  name="duration_minutes"
                  value={currentService.duration_minutes}
                  onChange={handleInputChange}
                  min="0"
                  max="59"
                  className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400"
                  placeholder={t('app.services.placeholderMinutes', 'e.g. 30')}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="bookkeeping_account" className="block text-sm font-medium text-gray-900 mb-2">
              {t('app.services.bookkeepingAccount', 'Bookkeeping account')}
            </label>
            <input
              type="text"
              id="bookkeeping_account"
              name="bookkeeping_account"
              value={currentService.bookkeeping_account}
              onChange={handleInputChange}
              className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400"
              placeholder={t('app.services.placeholderAccount', 'Optional')}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {t('app.common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-accent-500 rounded-lg hover:bg-accent-600 disabled:opacity-50 transition-colors"
            >
              {isSubmitting
                ? t('app.common.saving', 'Saving…')
                : t('app.common.save', 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
