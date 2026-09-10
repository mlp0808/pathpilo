'use client'

import { useEffect, useState } from 'react'
import { apiUrl } from '../utils/api'
import { formatMoney } from '../config/countryRules'
import { useCompanyCountryCode } from '../hooks/useCompanyCountryCode'
import { useAppI18n } from './I18nProvider'
import { requestMissionsRefresh } from '../config/missions'

type FeeSettings = {
  enabled: boolean
  title: string
  price: number
  service_id: number | null
}

/**
 * Cancellation fee as a normal-looking catalog row on the Items page,
 * with an enable/disable switch instead of archive/edit actions.
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load cancellation fee')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const persist = async (next: { enabled: boolean; title: string; price: number }) => {
    try {
      setSaving(true)
      setError('')
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/services/cancellation-fee'), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: next.enabled,
          title: next.title.trim() || 'Cancellation fee',
          price: next.price,
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
      requestMissionsRefresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
      // Revert toggle if the enable flip failed.
      if (settings) setDraftEnabled(!!settings.enabled)
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = () => {
    const enabled = !draftEnabled
    setDraftEnabled(enabled)
    const price = parseFloat(draftPrice)
    void persist({
      enabled,
      title: draftTitle,
      price: Number.isFinite(price) && price >= 0 ? price : 0,
    })
  }

  const saveEdits = () => {
    const price = parseFloat(draftPrice)
    if (Number.isNaN(price) || price < 0) {
      setError(t('app.items.feeInvalidPrice', 'Enter a valid fee amount'))
      return
    }
    void persist({ enabled: draftEnabled, title: draftTitle, price })
  }

  if (loading && !settings) {
    return (
      <div className="mt-8 overflow-hidden rounded-lg border border-gray-200 bg-white px-6 py-4 text-sm text-gray-500 shadow-sm">
        {t('app.items.feeLoading', 'Loading cancellation fee…')}
      </div>
    )
  }

  return (
    <section className="mt-8">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-900">
          {t('app.items.feeTitle', 'Cancellation fee')}
        </h2>
        <p className="mt-0.5 text-xs text-gray-500 max-w-xl">
          {t(
            'app.items.feeHint',
            'Allow a cancellation fee to be charged when a client cancels too late.',
          )}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm ring-1 ring-black/5">
        <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => {
                setDraftTitle(e.target.value)
                setDirty(true)
              }}
              className="w-full bg-transparent text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none"
              placeholder={t('app.items.feeName', 'Fee name')}
            />
          </div>

          <div className="flex items-center gap-1.5 sm:w-36">
            <input
              type="number"
              min="0"
              step="0.01"
              value={draftPrice}
              onChange={(e) => {
                setDraftPrice(e.target.value)
                setDirty(true)
              }}
              className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
          </div>

          <div className="hidden text-xs text-gray-400 sm:block sm:w-28">
            {formatMoney(parseFloat(draftPrice) || 0, country)}
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end sm:gap-4">
            {dirty && (
              <button
                type="button"
                onClick={saveEdits}
                disabled={saving}
                className="text-xs font-semibold text-accent-600 hover:text-accent-700 disabled:opacity-50"
              >
                {saving ? t('app.common.saving', 'Saving…') : t('app.common.save', 'Save')}
              </button>
            )}

            <label className="flex cursor-pointer select-none items-center gap-2">
              <span className="text-xs font-medium text-gray-500">
                {draftEnabled
                  ? t('app.items.feeEnabled', 'Enabled')
                  : t('app.items.feeDisabled', 'Disabled')}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={draftEnabled}
                disabled={saving}
                onClick={toggleEnabled}
                className={[
                  'relative h-6 w-11 rounded-full transition-colors disabled:opacity-50',
                  draftEnabled ? 'bg-accent-500' : 'bg-gray-300',
                ].join(' ')}
              >
                <span
                  className={[
                    'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    draftEnabled ? 'translate-x-5' : '',
                  ].join(' ')}
                />
              </button>
            </label>
          </div>
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  )
}
