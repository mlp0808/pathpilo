'use client'

import { useEffect, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import { getCountryRule } from '../config/countryRules'
import { useCompanyCountryCode } from '../hooks/useCompanyCountryCode'
import { useAppI18n } from './I18nProvider'

interface AddServiceModalProps {
  isOpen: boolean
  onClose: () => void
  onServiceAdded: () => void
  /** Target item group (defaults to Services on the server if omitted). */
  groupId?: number | null
  /** Which catalog fields this group uses. */
  metaFields?: string[]
  groupName?: string
}

export default function AddServiceModal({
  isOpen,
  onClose,
  onServiceAdded,
  groupId = null,
  metaFields = ['price', 'duration'],
  groupName,
}: AddServiceModalProps) {
  const { t } = useAppI18n()
  const companyCountryCode = useCompanyCountryCode()
  const priceCurrency = getCountryRule(companyCountryCode).defaultCurrency
  const hasDuration = metaFields.includes('duration')
  const hasQuantity = metaFields.includes('quantity')

  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [durationHours, setDurationHours] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [bookkeepingAccount, setBookkeepingAccount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setPrice('')
      setDurationHours('')
      setDurationMinutes('')
      setQuantity('1')
      setBookkeepingAccount('')
      setError('')
    }
  }, [isOpen, groupId])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')
    try {
      const token = localStorage.getItem('token')
      const totalMinutes = hasDuration
        ? (parseInt(durationHours) || 0) * 60 + (parseInt(durationMinutes) || 0)
        : 0
      const qty = hasQuantity ? parseFloat(quantity) : 1
      if (hasQuantity && (!Number.isFinite(qty) || qty <= 0)) {
        setError(t('app.items.invalidQty', 'Quantity must be a positive number'))
        setIsSubmitting(false)
        return
      }

      const body: Record<string, unknown> = {
        title,
        price,
        duration_minutes: totalMinutes,
        default_quantity: hasQuantity ? qty : 1,
        bookkeeping_account: bookkeepingAccount.trim() || null,
      }
      if (groupId != null) body.group_id = groupId

      const response = await fetch(apiUrl('/services'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || t('app.services.errCreate', 'Failed to create service'))
        return
      }
      onServiceAdded()
      onClose()
    } catch {
      setError(t('app.services.errNetworkCreate', 'Network error: Failed to create service'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl max-w-md w-full max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {t('app.items.addItem', 'Add item')}
            </h2>
            {groupName && (
              <p className="text-xs text-gray-500 mt-0.5">{groupName}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">
              {t('app.items.itemName', 'Name')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
              placeholder={hasQuantity ? 'e.g. Soap water 300ml' : 'e.g. Window Cleaning'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">
              {hasQuantity
                ? t('app.items.unitPrice', 'Unit price')
                : t('app.items.price', 'Price')}{' '}
              ({priceCurrency}) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              min="0"
              step="0.01"
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
            />
          </div>

          {hasQuantity && (
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1.5">
                {t('app.items.defaultQty', 'Default quantity')}
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="0.001"
                step="any"
                className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
              />
            </div>
          )}

          {hasDuration && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  {t('app.services.hours', 'Hours')}
                </label>
                <input
                  type="number"
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value)}
                  min="0"
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  {t('app.services.minutes', 'Minutes')}
                </label>
                <input
                  type="number"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  min="0"
                  max="59"
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">
              Bookkeeping account <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={bookkeepingAccount}
              onChange={(e) => setBookkeepingAccount(e.target.value)}
              maxLength={32}
              className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
              placeholder="e.g. 1010"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              {t('app.common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-accent-500 hover:bg-accent-600 disabled:opacity-50"
            >
              {isSubmitting ? t('app.services.adding', 'Adding...') : t('app.items.addItem', 'Add item')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
