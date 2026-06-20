'use client'

import AddressAutocomplete from './AddressAutocomplete'

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
  phone: ''
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
 * Shared inline form for adding a new client.
 * Used in CreateJob and CreateSubscription for a consistent "add new client" experience.
 * Uses green (accent) styling. Does NOT create via API - parent creates on form submit.
 */
export default function AddClientInlineForm({
  data,
  onChange,
  onSave,
  onCancel,
  saveLabel = 'Save & Select Client',
  countryCode,
}: AddClientInlineFormProps) {
  const inputBase = 'w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400'

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <label className="flex items-center">
          <input
            type="radio"
            checked={data.client_type === 'person'}
            onChange={() => onChange({ ...data, client_type: 'person' })}
            className="mr-2"
          />
          <span className="text-sm">Private Person</span>
        </label>
        <label className="flex items-center">
          <input
            type="radio"
            checked={data.client_type === 'company'}
            onChange={() => onChange({ ...data, client_type: 'company' })}
            className="mr-2"
          />
          <span className="text-sm">Company</span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="group">
          <label className="block text-sm font-medium text-gray-900 mb-2">
            {data.client_type === 'company' ? 'Company Name *' : 'First Name *'}
          </label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            className={inputBase}
            placeholder={data.client_type === 'company' ? 'Company name' : 'John'}
          />
        </div>
        {data.client_type === 'person' ? (
          <div className="group">
            <label className="block text-sm font-medium text-gray-900 mb-2">Last Name</label>
            <input
              type="text"
              value={data.last_name}
              onChange={(e) => onChange({ ...data, last_name: e.target.value })}
              className={inputBase}
              placeholder="Smith"
            />
          </div>
        ) : (
          <div className="group">
            <label className="block text-sm font-medium text-gray-900 mb-2">Company Number</label>
            <input
              type="text"
              value={data.company_number}
              onChange={(e) => onChange({ ...data, company_number: e.target.value })}
              className={inputBase}
              placeholder="CVR number"
            />
          </div>
        )}
      </div>

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
        placeholder="Street address"
      />

      <div className="grid grid-cols-2 gap-4">
        <div className="group">
          <label className="block text-sm font-medium text-gray-900 mb-2">Email</label>
          <input
            type="email"
            value={data.email}
            onChange={(e) => onChange({ ...data, email: e.target.value })}
            className={inputBase}
            placeholder="client@example.com"
          />
        </div>
        <div className="group">
          <label className="block text-sm font-medium text-gray-900 mb-2">Phone</label>
          <input
            type="tel"
            value={data.phone}
            onChange={(e) => onChange({ ...data, phone: e.target.value })}
            className={inputBase}
            placeholder="+45 12 34 56 78"
          />
        </div>
      </div>

      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => data.name.trim() && onSave()}
          disabled={!data.name.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-accent-500 border border-transparent rounded-lg hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  )
}
