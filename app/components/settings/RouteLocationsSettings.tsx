'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { apiUrl } from '../../utils/api'
import AddressSearchInput from '../AddressSearchInput'
import { useAppI18n } from '../I18nProvider'
import {
  SettingsSection,
  SettingsField,
  SettingsLabel,
  SettingsButton,
  SettingsSavedNote,
  SettingsErrorNote,
  SettingsHint,
} from './SettingsUI'

type TeamMember = {
  id: number
  first_name: string
  last_name: string
}

type EmployeeRouteMode = 'default' | 'none' | 'custom'

const selectClass =
  'w-full max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none'

function deriveEmployeeMode(wh: {
  use_company_default_location?: boolean
  start_address?: string
  end_address?: string
}): EmployeeRouteMode {
  if (wh.use_company_default_location !== false) return 'default'
  const start = (wh.start_address || '').trim()
  const end = (wh.end_address || '').trim()
  if (!start && !end) return 'none'
  return 'custom'
}

export default function RouteLocationsSettings() {
  const { t } = useAppI18n()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState<'default' | string>('default')
  const [members, setMembers] = useState<TeamMember[]>([])

  const [countryCode, setCountryCode] = useState('DK')
  const [defaultStartAddress, setDefaultStartAddress] = useState('')
  const [defaultEndAddress, setDefaultEndAddress] = useState('')

  const [employeeMode, setEmployeeMode] = useState<EmployeeRouteMode>('default')
  const [startAddress, setStartAddress] = useState('')
  const [endAddress, setEndAddress] = useState('')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const loadMemberLocations = useCallback(async (userId: string) => {
    const token = localStorage.getItem('token')
    const res = await fetch(apiUrl(`/work-hours/${userId}`), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const data = await res.json()
    const wh = data.workHours || {}
    setEmployeeMode(deriveEmployeeMode(wh))
    setStartAddress(wh.start_address || '')
    setEndAddress(wh.end_address || '')
  }, [])

  const loadInitial = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      const [profileRes, usersRes] = await Promise.all([
        fetch(apiUrl('/companies/profile'), { headers }),
        fetch(apiUrl('/users'), { headers }),
      ])

      if (profileRes.ok) {
        const data = await profileRes.json()
        const c = data.company || {}
        setCountryCode(c.countryCode || 'DK')
        setDefaultStartAddress(c.defaultStartAddress || '')
        setDefaultEndAddress(c.defaultEndAddress || '')
      }

      if (usersRes.ok) {
        const data = await usersRes.json()
        setMembers(data.users || [])
      }

      const routeFor = searchParams.get('routeFor')
      if (routeFor && routeFor !== 'default') {
        setSelectedKey(routeFor)
        await loadMemberLocations(routeFor)
      } else {
        setSelectedKey('default')
      }
    } catch {
      setError(t('settings.business.routes.loadError', 'Failed to load route location settings.'))
    } finally {
      setLoading(false)
    }
  }, [loadMemberLocations, searchParams, t])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  const handlePersonChange = async (value: string) => {
    setSelectedKey(value)
    setSaved(false)
    setError('')
    if (value === 'default') return
    setLoading(true)
    try {
      await loadMemberLocations(value)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const token = localStorage.getItem('token')
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }

      if (selectedKey === 'default') {
        const hasDefault = defaultStartAddress.trim().length > 0
        const res = await fetch(apiUrl('/companies/profile'), {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            defaultStartAddress,
            defaultEndAddress,
            routeLocationsEnabled: hasDefault,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || t('settings.business.routes.saveError', 'Failed to save'))
        }
      } else {
        const payload =
          employeeMode === 'default'
            ? { use_company_default_location: true }
            : employeeMode === 'none'
              ? { use_company_default_location: false, start_address: '', end_address: '' }
              : {
                  use_company_default_location: false,
                  start_address: startAddress,
                  end_address: endAddress,
                }

        const res = await fetch(apiUrl(`/work-hours/${selectedKey}`), {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || t('settings.business.routes.saveError', 'Failed to save'))
        }
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.business.routes.saveError', 'Failed to save'))
    } finally {
      setSaving(false)
    }
  }

  const selectedMember = members.find(m => String(m.id) === selectedKey)
  const hasCompanyDefault = defaultStartAddress.trim().length > 0

  return (
    <SettingsSection
      title={t('settings.business.routes.title', 'Start & end locations for routes')}
      description={t(
        'settings.business.routes.sectionHelp',
        'Set where routes begin and end. Choose a default for everyone, or customise per person.',
      )}
    >
      {loading && members.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">{t('settings.business.routes.loading', 'Loading…')}</p>
      ) : (
        <div className="space-y-5">
          <SettingsField>
            <SettingsLabel>{t('settings.business.routes.personLabel', 'Applies to')}</SettingsLabel>
            <select
              value={selectedKey}
              onChange={e => handlePersonChange(e.target.value)}
              className={selectClass}
            >
              <option value="default">
                {t('settings.business.routes.defaultOption', 'Default — all employees')}
              </option>
              {members.map(m => (
                <option key={m.id} value={String(m.id)}>
                  {m.first_name} {m.last_name}
                </option>
              ))}
            </select>
            <div className="mt-1.5">
              <SettingsHint>
                {selectedKey === 'default'
                  ? t(
                      'settings.business.routes.defaultHint',
                      'Used by employees set to “Same as company default”. Leave empty to turn off route start/end for them.',
                    )
                  : t('settings.business.routes.personHint', 'Choose how this person’s route start and end are set.')}
              </SettingsHint>
            </div>
          </SettingsField>

          {selectedKey === 'default' ? (
            <SettingsField
              description={t(
                'settings.business.routes.defaultHelp',
                'When set, employees using the company default get these as their route start and end. Clear to disable for them.',
              )}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <AddressSearchInput
                  label={t('settings.business.routes.defaultStart', 'Default start address')}
                  value={defaultStartAddress}
                  onChange={setDefaultStartAddress}
                  placeholder={t('settings.business.routes.searchStartPlaceholder', 'Search for a start address...')}
                  countryCode={countryCode}
                />
                <AddressSearchInput
                  label={t('settings.business.routes.defaultEnd', 'Default end address')}
                  value={defaultEndAddress}
                  onChange={setDefaultEndAddress}
                  placeholder={t('settings.business.routes.endPlaceholder', 'Leave empty to use start address')}
                  countryCode={countryCode}
                />
              </div>
            </SettingsField>
          ) : (
            <>
              <SettingsField>
                <SettingsLabel>{t('settings.business.routes.employeeMode', 'Route start & end')}</SettingsLabel>
                <select
                  value={employeeMode}
                  onChange={e => setEmployeeMode(e.target.value as EmployeeRouteMode)}
                  className={selectClass}
                >
                  <option value="default">
                    {t('settings.business.routes.modeDefault', 'Same as company default')}
                  </option>
                  <option value="none">
                    {t('settings.business.routes.modeNone', 'None')}
                  </option>
                  <option value="custom">
                    {t('settings.business.routes.modeCustom', 'Set for this user')}
                  </option>
                </select>
              </SettingsField>

              {employeeMode === 'default' && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  {hasCompanyDefault ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="w-2 h-2 rounded-full bg-accent-500 flex-shrink-0" />
                        <span className="text-gray-400 w-10">{t('app.teamMember.start', 'Start')}</span>
                        <span>{defaultStartAddress}</span>
                      </div>
                      {(defaultEndAddress || defaultStartAddress) && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                          <span className="text-gray-400 w-10">{t('app.teamMember.end', 'End')}</span>
                          <span>{defaultEndAddress || defaultStartAddress}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      {t(
                        'settings.business.routes.noDefaultYet',
                        'No company default is set yet — this person will have no route start or end until you add one under Default.',
                      )}
                    </p>
                  )}
                </div>
              )}

              {employeeMode === 'none' && (
                <p className="text-sm text-gray-500">
                  {t(
                    'settings.business.routes.modeNoneHelp',
                    'This person’s routes will not include a start or end location.',
                  )}
                </p>
              )}

              {employeeMode === 'custom' && (
                <SettingsField>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <AddressSearchInput
                      label={t('app.teamMember.startLocation', 'Start location')}
                      dotColor="#3DD57A"
                      value={startAddress}
                      onChange={setStartAddress}
                      placeholder={t('app.teamMember.searchStartAddress', 'Search for a start address...')}
                      countryCode={countryCode}
                    />
                    <AddressSearchInput
                      label={t('app.teamMember.endLocation', 'End location')}
                      dotColor="#F87171"
                      value={endAddress}
                      onChange={setEndAddress}
                      placeholder={t('app.teamMember.leaveEmptyUseStart', 'Leave empty to use start location')}
                      countryCode={countryCode}
                    />
                  </div>
                  <SettingsHint>
                    {t('app.teamMember.endLocationHelp', 'If end location is empty, the route ends at the start location.')}
                  </SettingsHint>
                </SettingsField>
              )}

              {selectedMember && (
                <SettingsHint>
                  {t('settings.business.routes.editingPerson', 'Editing route locations for {{name}}.')
                    .replace('{{name}}', `${selectedMember.first_name} ${selectedMember.last_name}`)}
                </SettingsHint>
              )}
            </>
          )}

          {error && <SettingsErrorNote>{error}</SettingsErrorNote>}
          {saved && <SettingsSavedNote>{t('settings.business.routes.saved', 'Route locations saved.')}</SettingsSavedNote>}

          <div className="flex justify-end pt-1">
            <SettingsButton variant="primary" onClick={handleSave} disabled={saving || loading}>
              {saving ? t('settings.business.saving', 'Saving...') : t('settings.business.save', 'Save Changes')}
            </SettingsButton>
          </div>
        </div>
      )}
    </SettingsSection>
  )
}
