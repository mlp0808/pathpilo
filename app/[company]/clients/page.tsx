'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '../../components/AppLayout'
import AddClientModal from '../../components/AddClientModal'
import { useAppI18n } from '../../components/I18nProvider'
import { apiUrl } from '../../utils/api'

interface Client {
  id: number
  client_type: 'person' | 'company'
  name: string
  last_name: string | null
  address: string | null
  zip_code: string | null
  city: string | null
  phone: string | null
  email: string | null
  created_at: string
}

function getInitials(name: string, lastName?: string | null) {
  const first = name?.[0]?.toUpperCase() || ''
  const last = lastName?.[0]?.toUpperCase() || ''
  return first + (last || '')
}

const AVATAR_COLORS = [
  'bg-[#BFD1C5] text-[#193434]',
  'bg-[#d4e8dc] text-[#193434]',
  'bg-[#e8f0ec] text-[#193434]',
  'bg-[#c5d8cc] text-[#193434]',
  'bg-[#dceae2] text-[#193434]',
]

function avatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length]
}

export default function ClientsPage() {
  const { t } = useAppI18n()
  const router = useRouter()
  const params = useParams() as any
  const companySlug = params?.company as string | undefined

  const [clients, setClients] = useState<Client[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [filterType, setFilterType] = useState<'all' | 'person' | 'company'>('all')

  useEffect(() => { fetchClients() }, [])

  const fetchClients = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl('/clients'), {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok) setClients(data.clients)
      else setError(data.error || t('app.clientsList.errFetch'))
    } catch {
      setError(t('app.clientsList.errNetwork'))
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    let list = clients
    if (filterType !== 'all') list = list.filter(c => c.client_type === filterType)
    if (!searchTerm.trim()) return list
    const s = searchTerm.toLowerCase().replace(/\s+/g, '')
    return list.filter(c => {
      const fullName = `${c.name}${c.last_name ? ' ' + c.last_name : ''}`.toLowerCase()
      const phone = (c.phone || '').replace(/\s+/g, '').toLowerCase()
      return (
        fullName.includes(searchTerm.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        phone.includes(s) ||
        (c.city || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    })
  }, [clients, searchTerm, filterType])

  const personCount = clients.filter(c => c.client_type === 'person').length
  const companyCount = clients.filter(c => c.client_type === 'company').length

  const openAddClient = () => setIsAddModalOpen(true)

  const handleClientAdded = () => {
    fetchClients()
    setIsAddModalOpen(false)
  }

  const goToClient = (id: number) => {
    const href = companySlug ? `/${companySlug}/clients/${id}` : `/clients/${id}`
    router.push(href)
  }

  return (
    <AppLayout>
      <div>
        {/* Header. On mobile the button collapses to a compact "+ Add" pill
            so the title and total can use the full line width. */}
        <div className="flex items-center justify-between mb-5 sm:mb-6 gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-primary-500 truncate">{t('app.clientsList.title')}</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              {clients.length === 1
                ? t('app.clientsList.subtitle').replace('{{count}}', String(clients.length))
                : t('app.clientsList.subtitlePlural').replace('{{count}}', String(clients.length))}
            </p>
          </div>
          <button
            onClick={openAddClient}
            className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-xl hover:bg-primary-700 active:bg-primary-700/90 transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden xs:inline">{t('app.clientsList.newClient')}</span>
          </button>
        </div>

        {/* Filters + Search. On phones the filter chips become a horizontally
            scrollable rail so longer translations (e.g. "Companies (8)") never
            wrap or overflow. Search drops below and uses the full width. */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4 sm:mb-5">
          <div className="h-rail no-scrollbar -mx-4 sm:mx-0 px-4 sm:px-0 sm:flex-shrink-0">
            <div className="inline-flex items-center bg-white border border-gray-200 rounded-xl p-1 gap-1">
              {(['all', 'person', 'company'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    filterType === type
                      ? 'bg-primary-500 text-white'
                      : 'text-gray-500 hover:text-primary-500 hover:bg-gray-50'
                  }`}
                >
                  {type === 'all' ? t('app.clientsList.filterAll').replace('{{count}}', String(clients.length)) : type === 'person' ? t('app.clientsList.filterPeople').replace('{{count}}', String(personCount)) : t('app.clientsList.filterCompanies').replace('{{count}}', String(companyCount))}
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex-1 sm:max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t('app.clientsList.searchPlaceholder')}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-3">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
            <button onClick={fetchClients} className="ml-auto underline">{t('app.clientsList.retry')}</button>
          </div>
        )}

        {/* Loading / empty / list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent-400 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 sm:p-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900 mb-1">
              {searchTerm ? t('app.clientsList.noResults') : t('app.clientsList.empty')}
            </p>
            <p className="text-xs text-gray-500">
              {searchTerm ? t('app.clientsList.tryDifferent') : t('app.clientsList.getStarted')}
            </p>
            {!searchTerm && (
              <button
                onClick={openAddClient}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors"
              >
                {t('app.clientsList.addClient')}
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {filtered.map((client, idx) => {
              const fullName = `${client.name}${client.last_name ? ' ' + client.last_name : ''}`
              const initials = getInitials(client.name, client.last_name)
              const location = [client.address, client.city].filter(Boolean).join(', ')
              return (
                <div
                  key={client.id}
                  onClick={() => goToClient(client.id)}
                  className={`flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors ${
                    idx > 0 ? 'border-t border-gray-100' : ''
                  }`}
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${avatarColor(client.id)}`}>
                    {client.client_type === 'company' ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    ) : initials}
                  </div>

                  {/* Name + type */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-primary-500 truncate">{fullName}</span>
                      {client.client_type === 'company' && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full flex-shrink-0">{t('app.clientsList.company')}</span>
                      )}
                    </div>
                    {location && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{location}</p>
                    )}
                  </div>

                  {/* Contact */}
                  <div className="hidden sm:flex flex-col items-end gap-0.5 flex-shrink-0 text-right">
                    {client.phone && (
                      <span className="text-xs text-gray-600">{client.phone}</span>
                    )}
                    {client.email && (
                      <span className="text-xs text-gray-400 truncate max-w-[180px]">{client.email}</span>
                    )}
                  </div>

                  {/* Arrow */}
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )
            })}
          </div>
        )}

        {filtered.length > 0 && searchTerm && (
          <p className="text-xs text-gray-400 mt-3 text-center">
            {filtered.length === 1
              ? t('app.clientsList.resultsLine').replace('{{count}}', String(filtered.length)).replace('{{term}}', searchTerm)
              : t('app.clientsList.resultsLinePlural').replace('{{count}}', String(filtered.length)).replace('{{term}}', searchTerm)}
          </p>
        )}

        <AddClientModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onClientAdded={handleClientAdded}
        />
      </div>
    </AppLayout>
  )
}
