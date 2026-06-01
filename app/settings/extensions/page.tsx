'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../utils/api'
import {
  SettingsHeader,
  SettingsSection,
  SettingsLabel,
  SettingsInput,
  SettingsButton,
  SettingsToggle,
  SettingsHint,
  SettingsSavedNote,
  SettingsErrorNote,
} from '../../components/settings/SettingsUI'

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
        // Invoice-payment providers (bank transfer, future Stripe/MobilePay…)
        // are configured under Settings → Invoice options now, not here.
        // Keeping the filter capability-driven means new payment providers
        // automatically end up in the right place without code changes here.
        const visible = loaded.filter(
          (integration) =>
            !(Array.isArray(integration.capabilities) && integration.capabilities.includes('invoice_payment')),
        )
        setIntegrations(visible)

        if (visible.length > 0) {
          const firstProvider = visible[0].provider
          setSelectedProvider(firstProvider)
          const first = visible[0]
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
    <div className="mx-auto max-w-2xl px-6 py-8">
      <SettingsHeader
        title="Extensions"
        description="Manage optional features and provider integrations."
      />

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        </div>
      ) : integrations.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm font-medium text-gray-900">No extensions available yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
            Optional integrations will appear here when they&apos;re ready. Payment options have moved
            to Settings → Invoices.
          </p>
        </div>
      ) : (
        <SettingsSection title="All extensions">
          {integrations.map((integration) => {
            const expanded = integration.provider === selectedProvider
            return (
              <div key={integration.provider} className="border-b border-gray-100 last:border-b-0">
                <div className="flex items-center gap-3 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800">{integration.title}</p>
                    <p className="mt-0.5 text-[13px] text-gray-500">{integration.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedProvider(expanded ? null : integration.provider)}
                    className="flex-shrink-0 text-[13px] font-medium text-gray-500 hover:text-gray-900"
                  >
                    {expanded ? 'Hide' : 'Configure'}
                  </button>
                  {readOnlyToggle(integration.enabled)}
                </div>

                {expanded && selectedIntegration && (
                  <div className="space-y-4 pb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-800">Enabled</span>
                      <SettingsToggle checked={draftEnabled} onChange={setDraftEnabled} label="Enabled" />
                    </div>

                    {isBankTransfer && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <SettingsLabel>Account holder</SettingsLabel>
                            <SettingsInput
                              value={draftConfig.accountHolder || ''}
                              onChange={(e) => setDraftConfig((prev) => ({ ...prev, accountHolder: e.target.value }))}
                            />
                          </div>
                          <div>
                            <SettingsLabel>IBAN</SettingsLabel>
                            <SettingsInput
                              value={draftConfig.iban || ''}
                              onChange={(e) => setDraftConfig((prev) => ({ ...prev, iban: e.target.value }))}
                            />
                          </div>
                          <div>
                            <SettingsLabel>Registration number (optional)</SettingsLabel>
                            <SettingsInput
                              value={draftConfig.registrationNumber || ''}
                              onChange={(e) => setDraftConfig((prev) => ({ ...prev, registrationNumber: e.target.value }))}
                            />
                          </div>
                          <div>
                            <SettingsLabel>Account number (optional)</SettingsLabel>
                            <SettingsInput
                              value={draftConfig.accountNumber || ''}
                              onChange={(e) => setDraftConfig((prev) => ({ ...prev, accountNumber: e.target.value }))}
                            />
                          </div>
                        </div>

                        <SettingsHint>
                          Payment terms and how to reference the transfer are set on each invoice (payment
                          terms and invoice number).
                        </SettingsHint>

                        {draftEnabled && !canEnableBankTransfer && (
                          <SettingsHint>Fill account holder and IBAN to activate this extension.</SettingsHint>
                        )}
                      </div>
                    )}

                    {error && <SettingsErrorNote>{error}</SettingsErrorNote>}
                    {success && <SettingsSavedNote>{success}</SettingsSavedNote>}

                    <div className="flex justify-end">
                      <SettingsButton variant="primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : 'Save extension'}
                      </SettingsButton>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </SettingsSection>
      )}
    </div>
  )
}
