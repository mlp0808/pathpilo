'use client'

import { MapPinIcon } from '@heroicons/react/24/outline'
import AddressAutocomplete from './AddressAutocomplete'
import { useAppI18n } from './I18nProvider'

export interface NewClientData {
  client_type: 'person' | 'company'
  name: string
  last_name: string
  company_number: string
  address: string
  zip_code: string
  city: string
  lat?: number | null
  lng?: number | null
  email: string
  phone: string
}

/** e.g. guest#159123 — used so a job can be created without naming the client yet. */
export function generateGuestClientName(): string {
  return `guest#${Math.floor(100000 + Math.random() * 900000)}`
}

export function isGuestClientName(name: string | null | undefined): boolean {
  return /^guest#\d+$/i.test(String(name || '').trim())
}

export const initialNewClientData: NewClientData = {
  client_type: 'person',
  name: '',
  last_name: '',
  company_number: '',
  address: '',
  zip_code: '',
  city: '',
  lat: null,
  lng: null,
  email: '',
  phone: '',
}

/** Prefill for a map location that is not a client yet — guest name + address. */
export function guestClientFromLocation(loc?: {
  address?: string
  zip_code?: string
  city?: string
  lat?: number | null
  lng?: number | null
} | null): NewClientData {
  return {
    ...initialNewClientData,
    client_type: 'person',
    name: generateGuestClientName(),
    last_name: '',
    address: loc?.address || '',
    zip_code: loc?.zip_code || '',
    city: loc?.city || '',
    lat: loc?.lat ?? null,
    lng: loc?.lng ?? null,
  }
}

interface AddClientInlineFormProps {
  data: NewClientData
  onChange: (data: NewClientData) => void
  onSave: () => void
  onCancel: () => void
  saveLabel?: string
  /** ISO-3166-1 alpha-2 country code (e.g. 'GB', 'DK') used to filter address autocomplete suggestions. */
  countryCode?: string
}

/**
 * Shared inline form for adding a new client (or guest).
 * Used in CreateJob and CreateSubscription. Parent creates the client on submit.
 */
export default function AddClientInlineForm({
  data,
  onChange,
  onSave,
  onCancel,
  saveLabel = 'Continue',
  countryCode,
}: AddClientInlineFormProps) {
  const { t } = useAppI18n()
  const hasLocation = !!(data.address || data.city || data.zip_code)
  const locationLine = [data.address, [data.zip_code, data.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
  const nameIsGuest = isGuestClientName(data.name)

  const inputBase =
    'w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#193434]/15 focus:border-[#193434]/40 transition-shadow'

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-semibold text-gray-800">
          {nameIsGuest
            ? t('app.createJob.guestClient', 'Guest')
            : t('app.createJob.newClient', 'New client')}
        </h3>
        <div className="flex flex-shrink-0 rounded-full bg-gray-200/70 p-0.5">
          <button
            type="button"
            onClick={() => onChange({ ...data, client_type: 'person' })}
            className={`px-2.5 py-0.5 text-[10px] font-semibold rounded-full transition-colors ${
              data.client_type === 'person'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {t('app.createJob.privatePerson', 'Person')}
          </button>
          <button
            type="button"
            onClick={() =>
              onChange({
                ...data,
                client_type: 'company',
                name: nameIsGuest ? '' : data.name,
                last_name: '',
              })
            }
            className={`px-2.5 py-0.5 text-[10px] font-semibold rounded-full transition-colors ${
              data.client_type === 'company'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {t('app.createJob.company', 'Company')}
          </button>
        </div>
      </div>

      {hasLocation && (
        <div className="flex items-center gap-2 rounded-lg bg-white border border-gray-100 px-2.5 py-1.5">
          <MapPinIcon className="h-3.5 w-3.5 flex-shrink-0 text-[#193434]/70" />
          <p className="min-w-0 truncate text-[12px] font-medium text-gray-700">
            {locationLine || t('app.createJob.noAddress', 'No address')}
          </p>
        </div>
      )}

      <div className={`grid gap-2 ${data.client_type === 'person' ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className={data.client_type === 'company' ? undefined : undefined}>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1">
            {data.client_type === 'company'
              ? t('app.createJob.companyName', 'Company name')
              : t('app.createJob.firstName', 'First name')}
          </label>
          <input
            type="text"
            value={data.name}
            onFocus={(e) => {
              // Guest name acts like a placeholder: first keystroke replaces it.
              if (isGuestClientName(data.name)) e.currentTarget.select()
            }}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            className={`${inputBase} ${nameIsGuest ? 'text-gray-400' : ''}`}
            placeholder={
              data.client_type === 'company'
                ? 'Acme Ltd'
                : t('app.createJob.guestNamePlaceholder', 'guest#…')
            }
            autoFocus={!hasLocation}
          />
        </div>
        {data.client_type === 'person' ? (
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1">
              {t('app.createJob.lastName', 'Last name')}
            </label>
            <input
              type="text"
              value={data.last_name}
              onChange={(e) => onChange({ ...data, last_name: e.target.value })}
              className={inputBase}
              placeholder={t('app.createJob.optional', 'Optional')}
            />
          </div>
        ) : (
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 mb-1">
              {t('app.createJob.companyNumber', 'Company number')}
            </label>
            <input
              type="text"
              value={data.company_number}
              onChange={(e) => onChange({ ...data, company_number: e.target.value })}
              className={inputBase}
              placeholder="CVR / org. no."
            />
          </div>
        )}
      </div>

      {!hasLocation && (
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1">
            {t('app.createJob.address', 'Address')}
          </label>
          <AddressAutocomplete
            address={data.address}
            zip_code={data.zip_code}
            city={data.city}
            lat={data.lat}
            lng={data.lng}
            countryCode={countryCode}
            onChange={(addr) =>
              onChange({
                ...data,
                address: addr.address,
                zip_code: addr.zip_code,
                city: addr.city,
                lat: addr.lat ?? null,
                lng: addr.lng ?? null,
              })
            }
            inputClassName={inputBase}
            placeholder={t('app.createJob.streetAddress', 'Street address')}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1">
            {t('app.createJob.email', 'Email')}
          </label>
          <input
            type="email"
            value={data.email}
            onChange={(e) => onChange({ ...data, email: e.target.value })}
            className={inputBase}
            placeholder={t('app.createJob.optional', 'Optional')}
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1">
            {t('app.createJob.phone', 'Phone')}
          </label>
          <input
            type="tel"
            value={data.phone}
            onChange={(e) => onChange({ ...data, phone: e.target.value })}
            className={inputBase}
            placeholder={t('app.createJob.optional', 'Optional')}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 text-[12px] font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
        >
          {t('app.common.cancel', 'Cancel')}
        </button>
        <button
          type="button"
          onClick={() => data.name.trim() && onSave()}
          disabled={!data.name.trim()}
          className="flex-1 px-3 py-2 text-[12px] font-semibold text-white bg-[#193434] rounded-lg hover:bg-[#244444] focus:outline-none focus:ring-2 focus:ring-[#193434]/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  )
}
