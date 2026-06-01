'use client'

import { useState, useEffect } from 'react'
import { useUser } from '../../hooks/useUser'
import { PencilIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'
import { useAppI18n } from '../../components/I18nProvider'
import {
  SettingsHeader,
  SettingsSection,
  SettingsRow,
  SettingsInput,
  SettingsSelect,
  SettingsButton,
  SettingsSavedNote,
  SettingsErrorNote,
} from '../../components/settings/SettingsUI'

interface UserProfile {
  firstName: string
  lastName: string
  email: string
  role: string
  companyName: string
  languageCode: 'en' | 'da'
}

export default function UserSettingsPage() {
  const { user } = useUser()
  const { t, locale, setLocale } = useAppI18n()
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [formData, setFormData] = useState<UserProfile>({
    firstName: '',
    lastName: '',
    email: '',
    role: '',
    companyName: '',
    languageCode: 'en'
  })

  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        role: user.role || '',
        companyName: user.companyName || '',
        languageCode: (user as any).languageCode === 'da' ? 'da' : 'en',
      })
    }
  }, [user])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl('/user/profile'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          languageCode: formData.languageCode,
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile')
      }

      // Merge profile fields into stored user — API returns only id/name/email/language/role,
      // not companies/activeCompany; replacing the whole object would trigger setup redirect.
      try {
        const existingRaw = localStorage.getItem('user')
        const existing = existingRaw ? JSON.parse(existingRaw) : {}
        localStorage.setItem('user', JSON.stringify({ ...existing, ...data.user }))
      } catch {
        localStorage.setItem('user', JSON.stringify(data.user))
      }
      setLocale(formData.languageCode)
      
      setSuccess(t('settings.user.updateSuccess', 'Profile updated successfully!'))
      setIsEditing(false)
      
      // Refresh the page after a short delay to update the user context
      setTimeout(() => {
        window.location.reload()
      }, 1000)

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        role: user.role || '',
        companyName: user.companyName || '',
        languageCode: (user as any).languageCode === 'da' ? 'da' : 'en',
      })
    }
    setIsEditing(false)
    setError('')
    setSuccess('')
  }

  if (!user) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-2xl">
          <div className="flex justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
          </div>
        </div>
      </div>
    )
  }

  const rightInput = 'w-56 text-right'

  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <SettingsHeader
          title={t('settings.user.title', 'User Settings')}
          description={t('settings.user.subtitle', 'Manage your personal information and preferences.')}
        />

        {success && (
          <div className="mb-4">
            <SettingsSavedNote>{success}</SettingsSavedNote>
          </div>
        )}
        {error && (
          <div className="mb-4">
            <SettingsErrorNote>{error}</SettingsErrorNote>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <SettingsSection
            title={t('settings.user.personalInformation', 'Personal Information')}
            action={
              !isEditing ? (
                <SettingsButton variant="edit" onClick={() => setIsEditing(true)}>
                  <PencilIcon className="h-4 w-4" />
                  {t('settings.user.edit', 'Edit')}
                </SettingsButton>
              ) : undefined
            }
          >
            <SettingsRow
              htmlFor="firstName"
              title={t('settings.user.firstName', 'First name')}
              control={
                isEditing ? (
                  <SettingsInput
                    type="text"
                    id="firstName"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className={rightInput}
                    required
                  />
                ) : (
                  <ReadValue value={formData.firstName} />
                )
              }
            />
            <SettingsRow
              htmlFor="lastName"
              title={t('settings.user.lastName', 'Last name')}
              control={
                isEditing ? (
                  <SettingsInput
                    type="text"
                    id="lastName"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className={rightInput}
                    required
                  />
                ) : (
                  <ReadValue value={formData.lastName} />
                )
              }
            />
            <SettingsRow
              htmlFor="email"
              title={t('settings.user.email', 'Email address')}
              control={
                isEditing ? (
                  <SettingsInput
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className={rightInput}
                    required
                  />
                ) : (
                  <ReadValue value={formData.email} />
                )
              }
            />
            <SettingsRow
              title={t('settings.user.role', 'Role')}
              description={t('settings.user.roleHelp', 'Set by your company admin.')}
              control={<ReadValue value={formData.role} />}
            />
            <SettingsRow
              title={t('settings.user.company', 'Company')}
              control={<ReadValue value={formData.companyName} />}
            />
            <SettingsRow
              htmlFor="languageCode"
              title={t('settings.user.language', 'Language')}
              description={t('settings.user.languageHelp', 'Choose the language for your own interface.')}
              control={
                <SettingsSelect
                  id="languageCode"
                  name="languageCode"
                  value={formData.languageCode}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setFormData((prev) => ({ ...prev, languageCode: e.target.value === 'da' ? 'da' : 'en' }))
                  }
                  disabled={!isEditing}
                  className="w-40"
                >
                  <option value="en">{t('settings.user.language.en', 'English')}</option>
                  <option value="da">{t('settings.user.language.da', 'Danish')}</option>
                </SettingsSelect>
              }
            />
          </SettingsSection>

          {isEditing && (
            <div className="mt-2 flex items-center justify-end gap-3">
              <SettingsButton variant="secondary" onClick={handleCancel}>
                {t('settings.user.cancel', 'Cancel')}
              </SettingsButton>
              <SettingsButton type="submit" variant="primary" disabled={loading}>
                {loading ? t('settings.user.saving', 'Saving...') : t('settings.user.save', 'Save Changes')}
              </SettingsButton>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

function ReadValue({ value }: { value: string }) {
  return <span className="text-sm text-gray-600">{value || '—'}</span>
}
