'use client'

import { useEffect, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import { useAppI18n } from './I18nProvider'

export type InlineServiceCatalogService = {
  id: number
  title: string
  price: number
  duration_minutes: number
}

export type InlineServiceCreateResult =
  | { kind: 'adhoc'; title: string; price: number; durationMinutes: number }
  | { kind: 'catalog'; service: InlineServiceCatalogService }

export type ServiceCreateScope = 'job' | 'subscription'

type Props = {
  isOpen: boolean
  scope: ServiceCreateScope
  onClose: () => void
  onComplete: (result: InlineServiceCreateResult) => void
}

export default function InlineServiceCreateSheet({ isOpen, scope, onClose, onComplete }: Props) {
  const { t } = useAppI18n()
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [duration, setDuration] = useState('60')
  const [saveToAccount, setSaveToAccount] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) return
    setTitle('')
    setPrice('')
    setDuration('60')
    setSaveToAccount(false)
    setBusy(false)
    setError('')
  }, [isOpen])

  if (!isOpen) return null

  const introSub =
    scope === 'subscription'
      ? t('app.inlineService.introSubscription', 'Use for this subscription only, or save to your catalog for reuse on any client.')
      : t('app.inlineService.introJob', 'Use for this job only, or save to your catalog for reuse on any client.')

  const switchOffSub =
    scope === 'subscription'
      ? t('app.inlineService.onlySubscription', 'Only on this subscription (not saved to catalog).')
      : t('app.inlineService.onlyJob', 'Only on this job (not saved to catalog).')

  const submit = async () => {
    const trimmed = title.trim()
    if (!trimmed) {
      setError(t('app.inlineService.errName', 'Enter a service name.'))
      return
    }
    const p = parseFloat(String(price).replace(',', '.'))
    const d = parseInt(String(duration).replace(/\D/g, ''), 10)
    if (!Number.isFinite(p) || p < 0) {
      setError(t('app.inlineService.errPrice', 'Enter a valid price.'))
      return
    }
    if (!Number.isFinite(d) || d < 1) {
      setError(t('app.inlineService.errDuration', 'Enter duration in minutes (at least 1).'))
      return
    }

    setError('')
    if (saveToAccount) {
      setBusy(true)
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(apiUrl('/services'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: trimmed, price: p, duration_minutes: d }),
        })
        const data = await res.json()
        if (!res.ok || !data.service?.id) {
          setError(data.error || t('app.services.errCreate', 'Failed to create service'))
          return
        }
        onComplete({
          kind: 'catalog',
          service: {
            id: data.service.id,
            title: data.service.title || trimmed,
            price: Number(data.service.price) || p,
            duration_minutes: Number(data.service.duration_minutes) || d,
          },
        })
        onClose()
      } catch {
        setError(t('app.services.errNetworkCreate', 'Network error: Failed to create service'))
      } finally {
        setBusy(false)
      }
    } else {
      onComplete({ kind: 'adhoc', title: trimmed, price: p, durationMinutes: d })
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-sheet-in-bottom sm:animate-pop pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>

        <div className="flex items-start justify-between px-5 pt-4 sm:pt-5 pb-2">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {t('app.inlineService.title', 'New service')}
            </h2>
            <p className="text-sm text-gray-500 mt-1">{introSub}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label={t('app.services.cancel', 'Cancel')}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              {t('app.inlineService.name', 'Name')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('app.services.placeholderTitle', 'e.g. Window Cleaning')}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                {t('app.subscription.price', 'Price')}
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                {t('app.inlineService.durationMin', 'Duration (min)')}
              </label>
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))}
                placeholder="60"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
              />
            </div>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50/80 cursor-pointer">
            <input
              type="checkbox"
              checked={saveToAccount}
              onChange={(e) => setSaveToAccount(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-500"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-900">
                {t('app.inlineService.saveToAccount', 'Save to account')}
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">
                {saveToAccount
                  ? t('app.inlineService.saveToAccountOn', 'Added to your standard service list.')
                  : switchOffSub}
              </span>
            </span>
          </label>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {t('app.services.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-accent-600 hover:bg-accent-700 transition-colors disabled:opacity-50"
            >
              {busy ? t('app.services.adding', 'Adding...') : t('app.inlineService.addService', 'Add service')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
