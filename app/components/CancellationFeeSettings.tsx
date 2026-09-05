'use client'

import { useEffect, useState } from 'react'
import { apiUrl } from '../utils/api'
import { formatMoney } from '../config/countryRules'
import { useCompanyCountryCode } from '../hooks/useCompanyCountryCode'
import { useAppI18n } from './I18nProvider'

type FeeSettings = {
  enabled: boolean
  title: string
  price: number
  service_id: number | null
}

/**
 * Distinct bottom section on the Items page — not an item group.
 * Configures the company cancellation fee charged when a job is cancelled.
 */
export default function CancellationFeeSettings() {
  const { t } = useAppI18n()
  const country = useCompanyCountryCode()
  const [settings, setSettings] = useState<FeeSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draftTitle, setDraftTitle] = useState('Cancellation fee')
  const [draftPrice, setDraftPrice] = useState('0')
  const [draftEnabled, setDraftEnabled] = useState(false)
  const [dirty, setDirty] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/services/cancellation-fee'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      const fee = data.cancellationFee as FeeSettings
      setSettings(fee)
      setDraftEnabled(!!fee.enabled)
      setDraftTitle(fee.title || 'Cancellation fee')
      setDraftPrice(String(fee.price ?? 0))
      setDirty(false)
    } catch (e: any) {
      setError(e?.message || 'Failed to load cancellation fee')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const save = async () => {
    try {
      setSaving(true)
      setError('')
      const token = localStorage.getItem('token')
      const price = parseFloat(draftPrice)
      if (Number.isNaN(price) || price < 0) {
        setError(t('app.items.feeInvalidPrice', 'Enter a valid fee amount'))
        return
      }
      const res = await fetch(apiUrl('/services/cancellation-fee'), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: draftEnabled,
          title: draftTitle.trim() || 'Cancellation fee',
          price,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      const fee = data.cancellationFee as FeeSettings
      setSettings(fee)
      setDraftEnabled(!!fee.enabled)
      setDraftTitle(fee.title || 'Cancellation fee')
      setDraftPrice(String(fee.price ?? 0))
      setDirty(false)
    } catch (e: any) {
      setError(e?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !settings) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 px-5 py-6 text-sm text-gray-500">
        {t('app.items.feeLoading', 'Loading cancellation fee…')}
      </div>
    )
  }

  return (
    <section className="mt-10 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white to-white p-5 sm:p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700/80 bg-amber-100/80 px-2 py-0.5 rounded-full">
              {t('app.items.feeBadge', 'Policy')}
            </span>
            <h2 className="text-base font-semibold text-gray-900">
              {t('app.items.feeTitle', 'Cancellation fee')}
            </h2>
          </div>
          <p className="text-sm text-gray-600 max-w-xl">
            {t(
              'app.items.feeHint',
              'Not a normal item — charged when a job is cancelled. Creates a separate invoiceable fee for that visit date.',
            )}
          </p>
        </div>
        <label className="flex items-center gap-2 flex-shrink-0 cursor-pointer select-none">
          <span className="text-sm font-medium text-gray-700">
            {draftEnabled
              ? t('app.items.feeEnabled', 'Enabled')
              : t('app.items.feeDisabled', 'Disabled')}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={draftEnabled}
            onClick={() => {
              setDraftEnabled((v) => !v)
              setDirty(true)
            }}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              draftEnabled ? 'bg-amber-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                draftEnabled ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </label>
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${draftEnabled ? '' : 'opacity-55'}`}>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">
            {t('app.items.feeName', 'Fee name')}
          </label>
          <input
            type="text"
            value={draftTitle}
            disabled={!draftEnabled}
            onChange={(e) => {
              setDraftTitle(e.target.value)
              setDirty(true)
            }}
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/25 focus:border-amber-400 disabled:bg-gray-50"
            placeholder="Cancellation fee"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">
            {t('app.items.feeAmount', 'Amount')}
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={draftPrice}
            disabled={!draftEnabled}
            onChange={(e) => {
              setDraftPrice(e.target.value)
              setDirty(true)
            }}
            className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/25 focus:border-amber-400 disabled:bg-gray-50"
          />
          {draftEnabled && (
            <p className="mt-1.5 text-[11px] text-gray-500">
              {t('app.items.feePreview', 'Clients will see this on the invoice as')}{' '}
              <span className="font-medium text-gray-700">
                {draftTitle.trim() || 'Cancellation fee'} — {formatMoney(parseFloat(draftPrice) || 0, country)}
              </span>
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="px-4 py-2 text-sm font-semibold rounded-xl text-white bg-[#193434] hover:bg-[#244444] disabled:opacity-40 transition-colors"
        >
          {saving
            ? t('app.common.saving', 'Saving…')
            : t('app.common.save', 'Save')}
        </button>
      </div>
    </section>
  )
}
