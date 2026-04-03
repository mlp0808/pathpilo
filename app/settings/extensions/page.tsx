'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronRightIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'

type ProviderId = 'bank_transfer' | string

interface IntegrationConfig {
  accountHolder?: string
  iban?: string
  accountNumber?: string
  registrationNumber?: string
}

interface Integration {
  provider: ProviderId
  title: string
  description: string
  enabled: boolean
  capabilities: string[]
  config: IntegrationConfig
}

const EMPTY_BANK_CONFIG: IntegrationConfig = {
  accountHolder: '',
  iban: '',
  accountNumber: '',
  registrationNumber: '',
}

function readOnlyToggle(enabled: boolean) {
  return (
    <div
      className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? 'bg-accent-500' : 'bg-gray-300'}`}
      aria-hidden="true"
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </div>
  )
}

export default function ExtensionsSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null)
  const [draftConfig, setDraftConfig] = useState<IntegrationConfig>(EMPTY_BANK_CONFIG)
  const [draftEnabled, setDraftEnabled] = useState(false)

  const selectedIntegration = useMemo(
    () => integrations.find((integration) => integration.provider === selectedProvider) || null,
    [integrations, selectedProvider]
  )

  const isBankTransfer = selectedIntegration?.provider === 'bank_transfer'

  const canEnableBankTransfer = useMemo(() => {
    if (!isBankTransfer) return true
    return Boolean(
      String(draftConfig.accountHolder || '').trim() && String(draftConfig.iban || '').trim()
    )
  }, [isBankTransfer, draftConfig])

  useEffect(() => {
    const loadIntegrations = async () => {
      setLoading(true)
      setError('')
      try {
        const token = localStorage.getItem('token')
        const response = await fetch(apiUrl('/integrations'), {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load extensions')
        }

        const loaded: Integration[] = Array.isArray(data.integrations) ? data.integrations : []
        setIntegrations(loaded)

        if (loaded.length > 0) {
          const firstProvider = loaded[0].provider
          setSelectedProvider(firstProvider)
          const first = loaded[0]
          setDraftEnabled(Boolean(first.enabled))
          setDraftConfig({ ...EMPTY_BANK_CONFIG, ...(first.config || {}) })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load extensions')
      } finally {
        setLoading(false)
      }
    }

    loadIntegrations()
  }, [])

  useEffect(() => {
    if (!selectedIntegration) return
    setDraftEnabled(Boolean(selectedIntegration.enabled))
    setDraftConfig({ ...EMPTY_BANK_CONFIG, ...(selectedIntegration.config || {}) })
    setError('')
    setSuccess('')
  }, [selectedIntegration?.provider])

  const handleSave = async () => {
    if (!selectedIntegration) return
    if (selectedIntegration.provider === 'bank_transfer' && draftEnabled && !canEnableBankTransfer) {
      setError('Please fill account holder and IBAN before enabling.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/integrations/${selectedIntegration.provider}/config`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled: draftEnabled,
          config: draftConfig,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save extension settings')
      }

      setIntegrations((prev) =>
        prev.map((integration) =>
          integration.provider === selectedIntegration.provider
            ? { ...integration, enabled: data.integration.enabled, config: data.integration.config || {} }
            : integration
        )
      )
      setSuccess('Extension settings saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save extension settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Extensions</h1>
        <p className="text-gray-600 mt-1">Manage optional features and provider integrations.</p>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          Loading extensions...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">All extensions</h2>
            </div>
            <div>
              {integrations.map((integration) => {
                const selected = integration.provider === selectedProvider
                return (
                  <button
                    key={integration.provider}
                    onClick={() => setSelectedProvider(integration.provider)}
                    className={`w-full px-4 py-4 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors ${
                      selected ? 'bg-accent-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{integration.title}</p>
                        <p className="text-sm text-gray-500 mt-1">{integration.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {readOnlyToggle(integration.enabled)}
                        <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5">
            {!selectedIntegration ? (
              <p className="text-gray-500">Select an extension to configure it.</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{selectedIntegration.title}</h2>
                    <p className="text-sm text-gray-500 mt-1">{selectedIntegration.description}</p>
                  </div>
                  <label className="inline-flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={draftEnabled}
                      onChange={(e) => setDraftEnabled(e.target.checked)}
                      className="sr-only"
                    />
                    <span className="text-sm text-gray-700">Enabled</span>
                    <div
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        draftEnabled ? 'bg-accent-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          draftEnabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </div>
                  </label>
                </div>

                {isBankTransfer && (
                  <div className="mt-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Account holder</label>
                        <input
                          value={draftConfig.accountHolder || ''}
                          onChange={(e) => setDraftConfig((prev) => ({ ...prev, accountHolder: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
                        <input
                          value={draftConfig.iban || ''}
                          onChange={(e) => setDraftConfig((prev) => ({ ...prev, iban: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Registration number (optional)</label>
                        <input
                          value={draftConfig.registrationNumber || ''}
                          onChange={(e) => setDraftConfig((prev) => ({ ...prev, registrationNumber: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Account number (optional)</label>
                        <input
                          value={draftConfig.accountNumber || ''}
                          onChange={(e) => setDraftConfig((prev) => ({ ...prev, accountNumber: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
                        />
                      </div>
                    </div>

                    <p className="text-sm text-gray-500">
                      Payment terms and how to reference the transfer are set on each invoice (payment terms and invoice number).
                    </p>

                    {draftEnabled && !canEnableBankTransfer && (
                      <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Fill account holder and IBAN to activate this extension.
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <div className="mt-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
                )}
                {success && (
                  <div className="mt-4 text-sm text-accent-800 bg-accent-50 border border-accent-200 rounded-lg px-3 py-2">{success}</div>
                )}

                <div className="mt-5 flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-accent-500 text-white rounded-lg font-medium hover:bg-accent-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save extension'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
