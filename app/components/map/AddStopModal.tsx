'use client'

/**
 * Add stop — playground / unplaced round popup.
 *
 * Not "Create job": no date or employee. Existing clients are shown as-is;
 * a searched location (no client yet) opens name fields with address filled.
 * Task picker matches Create Job (dashed trigger, price/duration edits).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MagnifyingGlassIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '@/app/utils/api'
import { formatMoney, getCountryRule } from '@/app/config/countryRules'
import { useCompanyCountryCode } from '@/app/hooks/useCompanyCountryCode'
import { useAppI18n } from '@/app/components/I18nProvider'
import DashedPickerTrigger from '@/app/components/DashedPickerTrigger'
import { generateGuestClientName, isGuestClientName } from '@/app/components/AddClientInlineForm'

type Service = {
  id: number
  title: string
  price: number
  duration_minutes: number
}

type SelectedService = Service & {
  customPrice: string
  customDuration: number
  isCustom?: boolean
  customTitle?: string
}

type Client = {
  id: number
  name: string
  last_name?: string | null
  address?: string | null
  zip_code?: string | null
  city?: string | null
  lat?: number | null
  lng?: number | null
  client_type?: string | null
}

export type AddStopService = {
  service_id?: number
  custom_title?: string
  custom_price?: number
  custom_duration?: number
}

export type AddStopResult = {
  clientId: number
  label: string
  address?: string
  zip_code?: string
  city?: string
  lat?: number | null
  lng?: number | null
  estimated_duration_minutes: number
  services: AddStopService[]
}

export default function AddStopModal({
  isOpen,
  onClose,
  onAdded,
  title = 'Add stop',
  confirmLabel = 'Add to route',
  initialClientId,
  initialNewClient,
}: {
  isOpen: boolean
  onClose: () => void
  onAdded: (stop: AddStopResult) => void | Promise<void>
  title?: string
  confirmLabel?: string
  initialClientId?: number
  initialNewClient?: {
    name?: string
    address?: string
    zip_code?: string
    city?: string
    lat?: number | null
    lng?: number | null
  } | null
}) {
  const { t } = useAppI18n()
  const companyCountryCode = useCompanyCountryCode()
  const companyCurrency = getCountryRule(companyCountryCode).defaultCurrency

  const isNewClientFlow = !initialClientId && !!initialNewClient

  const [clients, setClients] = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')

  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [serviceSearch, setServiceSearch] = useState('')
  const [showServiceDropdown, setShowServiceDropdown] = useState(false)
  const serviceSearchInputRef = useRef<HTMLInputElement>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setClientSearch('')
    setSelectedClient(null)
    setNewFirstName('')
    setNewLastName('')
    setSelectedServices([])
    setServiceSearch('')
    setShowServiceDropdown(false)
    setBusy(false)
    setError(null)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    reset()
    if (!initialClientId && initialNewClient) {
      setNewFirstName(generateGuestClientName())
      setNewLastName('')
    }
    const token = localStorage.getItem('token')
    Promise.all([
      fetch(apiUrl('/clients'), { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({})),
      fetch(apiUrl('/services'), { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({})),
    ]).then(([clientsData, servicesData]) => {
      const list: Client[] = Array.isArray(clientsData?.clients)
        ? clientsData.clients
        : Array.isArray(clientsData) ? clientsData : []
      setClients(list)

      const raw = Array.isArray(servicesData?.services)
        ? servicesData.services
        : Array.isArray(servicesData) ? servicesData : []
      setServices(raw.map((s: any) => ({
        id: Number(s.id),
        title: s.title || s.name || 'Service',
        price: Number(s.price) || 0,
        duration_minutes: Number(s.duration_minutes ?? s.estimated_duration ?? 30) || 30,
      })))

      if (initialClientId) {
        const hit = list.find(c => c.id === initialClientId)
        if (hit) setSelectedClient(hit)
        else {
          // Resolve single client if not in the first list page.
          fetch(apiUrl(`/clients/${initialClientId}`), { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => {
              const c = data.client || data
              if (c?.id) {
                setSelectedClient({
                  id: Number(c.id),
                  name: c.name || '',
                  last_name: c.last_name,
                  address: c.address,
                  zip_code: c.zip_code,
                  city: c.city,
                  lat: c.lat,
                  lng: c.lng,
                  client_type: c.client_type,
                })
              }
            })
            .catch(() => {})
        }
      }
    })
  }, [isOpen, initialClientId, initialNewClient, reset])

  useEffect(() => {
    if (!isOpen) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-add-stop-services]')) setShowServiceDropdown(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [isOpen])

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    if (!q) return clients.slice(0, 40)
    return clients.filter(c => {
      const hay = `${c.name || ''} ${c.last_name || ''} ${c.address || ''} ${c.city || ''}`.toLowerCase()
      return hay.includes(q)
    }).slice(0, 40)
  }, [clients, clientSearch])

  const filteredServices = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase()
    return services.filter(s =>
      s.title.toLowerCase().includes(q) && !selectedServices.find(x => x.id === s.id && !x.isCustom)
    )
  }, [services, serviceSearch, selectedServices])

  const addService = (service: Service) => {
    setSelectedServices(prev => [...prev, {
      ...service,
      customPrice: String(service.price),
      customDuration: service.duration_minutes,
    }])
    setServiceSearch('')
    setShowServiceDropdown(false)
  }

  const addCustomService = () => {
    const tempId = -Date.now()
    setSelectedServices(prev => [...prev, {
      id: tempId,
      title: '(custom task)',
      price: 0,
      duration_minutes: 30,
      customPrice: '0',
      customDuration: 30,
      isCustom: true,
      customTitle: '',
    }])
    setServiceSearch('')
    setShowServiceDropdown(false)
  }

  const removeService = (serviceId: number) => {
    setSelectedServices(prev => prev.filter(s => s.id !== serviceId))
  }

  const updateService = (serviceId: number, field: 'customPrice' | 'customDuration' | 'customTitle', value: string | number) => {
    setSelectedServices(prev => prev.map(s => {
      if (s.id !== serviceId) return s
      if (field === 'customTitle') {
        const title = String(value)
        return { ...s, customTitle: title, title: title.trim() || '(custom task)' }
      }
      return { ...s, [field]: value }
    }))
  }

  const openServicePicker = () => {
    setShowServiceDropdown(true)
    setTimeout(() => serviceSearchInputRef.current?.focus(), 0)
  }

  const totalMinutes = selectedServices.reduce((sum, s) => sum + (Number(s.customDuration) || 0), 0)

  const addressLine = isNewClientFlow
    ? [initialNewClient?.address, initialNewClient?.zip_code, initialNewClient?.city].filter(Boolean).join(', ')
    : selectedClient
      ? [selectedClient.address, selectedClient.zip_code, selectedClient.city].filter(Boolean).join(', ')
      : ''

  const submit = async () => {
    setError(null)

    if (isNewClientFlow && !newFirstName.trim()) {
      setError(t('app.addStop.needName', 'Enter a first name'))
      return
    }
    if (!isNewClientFlow && !selectedClient) {
      setError(t('app.addStop.pickClient', 'Pick a client first'))
      return
    }
    if (selectedServices.length === 0) {
      setError(t('app.addStop.pickServices', 'Pick at least one task'))
      return
    }

    setBusy(true)
    try {
      const token = localStorage.getItem('token')
      let clientId = selectedClient?.id
      let label = selectedClient
        ? `${selectedClient.name}${selectedClient.last_name ? ` ${selectedClient.last_name}` : ''}`.trim()
        : ''
      let address = selectedClient?.address || undefined
      let zip_code = selectedClient?.zip_code || undefined
      let city = selectedClient?.city || undefined
      let lat = selectedClient?.lat ?? null
      let lng = selectedClient?.lng ?? null

      if (isNewClientFlow) {
        const res = await fetch(apiUrl('/clients'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            client_type: 'person',
            name: newFirstName.trim(),
            last_name: newLastName.trim() || null,
            address: initialNewClient?.address || null,
            zip_code: initialNewClient?.zip_code || null,
            city: initialNewClient?.city || null,
            lat: initialNewClient?.lat ?? null,
            lng: initialNewClient?.lng ?? null,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.client?.id) {
          throw new Error(data.error || t('app.addStop.clientCreateFailed', 'Could not create client'))
        }
        clientId = Number(data.client.id)
        label = `${newFirstName.trim()}${newLastName.trim() ? ` ${newLastName.trim()}` : ''}`
        address = initialNewClient?.address || undefined
        zip_code = initialNewClient?.zip_code || undefined
        city = initialNewClient?.city || undefined
        lat = initialNewClient?.lat ?? null
        lng = initialNewClient?.lng ?? null
      }

      if (!clientId) throw new Error(t('app.addStop.pickClient', 'Pick a client first'))

      await onAdded({
        clientId,
        label,
        address,
        zip_code,
        city,
        lat,
        lng,
        estimated_duration_minutes: totalMinutes || 30,
        services: selectedServices.map(s => (
          s.isCustom
            ? {
                custom_title: (s.customTitle && s.customTitle.trim()) || s.title,
                custom_price: parseFloat(String(s.customPrice)) || 0,
                custom_duration: Number(s.customDuration) || 30,
              }
            : {
                service_id: s.id,
                custom_price: parseFloat(String(s.customPrice)) || s.price,
                custom_duration: Number(s.customDuration) || s.duration_minutes,
              }
        )),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('app.addStop.failed', 'Could not add stop'))
    } finally {
      setBusy(false)
    }
  }

  if (!isOpen || typeof document === 'undefined') return null

  const canSubmit = selectedServices.length > 0 && (
    isNewClientFlow ? !!newFirstName.trim() : !!selectedClient
  )

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg max-h-[94vh] sm:min-h-[560px] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <p className="mt-0.5 text-[12px] text-gray-500 leading-snug">
              {t(
                'app.addStop.subtitle',
                'No date or employee yet — just who and what work belongs on this stop.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Client */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              {t('app.addStop.client', 'Client')}
            </h3>

            {isNewClientFlow ? (
              <div className="space-y-2.5 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                <div className="flex items-center gap-2 rounded-lg bg-white border border-gray-100 px-2.5 py-1.5">
                  <p className="min-w-0 truncate text-[12px] font-medium text-gray-700">
                    {addressLine || initialNewClient?.name || '—'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">
                      {t('settings.user.firstName', 'First name')}
                    </label>
                    <input
                      value={newFirstName}
                      onFocus={e => {
                        if (isGuestClientName(newFirstName)) e.currentTarget.select()
                      }}
                      onChange={e => setNewFirstName(e.target.value)}
                      className={`w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 bg-white ${
                        isGuestClientName(newFirstName) ? 'text-gray-400' : ''
                      }`}
                      placeholder={t('app.createJob.guestNamePlaceholder', 'guest#…')}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">
                      {t('settings.user.lastName', 'Last name')}
                    </label>
                    <input
                      value={newLastName}
                      onChange={e => setNewLastName(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 bg-white"
                      placeholder={t('app.createJob.optional', 'Optional')}
                    />
                  </div>
                </div>
              </div>
            ) : selectedClient ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-accent-200 bg-accent-50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {selectedClient.name}{selectedClient.last_name ? ` ${selectedClient.last_name}` : ''}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">{addressLine || '—'}</p>
                </div>
                {!initialClientId && (
                  <button
                    type="button"
                    onClick={() => setSelectedClient(null)}
                    className="text-[11px] font-semibold text-gray-500 hover:text-gray-800"
                  >
                    {t('app.common.change', 'Change')}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    placeholder={t('app.addStop.searchClient', 'Search existing client…')}
                    className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                    autoFocus
                  />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                  {filteredClients.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-gray-400">
                      {t('app.addStop.noClients', 'No clients found')}
                    </p>
                  ) : filteredClients.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedClient(c)}
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {c.name}{c.last_name ? ` ${c.last_name}` : ''}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {[c.address, c.zip_code, c.city].filter(Boolean).join(', ')}
                      </p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Tasks — same pattern as Create Job */}
          <section data-add-stop-services>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              {t('app.addStop.tasks', 'Tasks')}
            </h3>

            {selectedServices.length > 0 && (
              <div className="space-y-2 mb-3">
                {selectedServices.map(service => (
                  <div
                    key={service.id}
                    className="flex items-center justify-between p-4 bg-gradient-to-r from-white to-accent-50/20 rounded-xl border border-accent-200/30 shadow-sm"
                  >
                    <div className="text-sm font-semibold text-primary-800 min-w-0 flex-1 pr-2">
                      {service.isCustom ? (
                        <input
                          type="text"
                          value={service.customTitle || ''}
                          onChange={e => updateService(service.id, 'customTitle', e.target.value)}
                          placeholder={t('app.createJob.customTask', 'Task title')}
                          className="w-full bg-transparent border-b border-accent-300/60 text-sm font-semibold text-accent-700 focus:outline-none"
                        />
                      ) : (
                        service.title
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <input
                        type="number"
                        value={service.customPrice}
                        onChange={e => updateService(service.id, 'customPrice', e.target.value)}
                        className="w-16 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-accent-500/20"
                      />
                      <span className="text-xs text-gray-500 tabular-nums">{companyCurrency}</span>
                      <input
                        type="number"
                        value={service.customDuration}
                        onChange={e => updateService(service.id, 'customDuration', parseInt(e.target.value) || 0)}
                        className="w-14 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-accent-500/20"
                      />
                      <span className="text-xs text-gray-500">{t('app.createJob.minutesUnit', 'min')}</span>
                      <button
                        type="button"
                        onClick={() => removeService(service.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="relative">
              {showServiceDropdown || serviceSearch ? (
                <input
                  ref={serviceSearchInputRef}
                  type="text"
                  value={serviceSearch}
                  onChange={e => { setServiceSearch(e.target.value); setShowServiceDropdown(true) }}
                  onFocus={() => setShowServiceDropdown(true)}
                  placeholder={t('app.createJob.searchServices', 'Search for services...')}
                  className="w-full px-4 py-3.5 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 text-sm bg-white shadow-sm hover:border-gray-300"
                />
              ) : (
                <DashedPickerTrigger onClick={openServicePicker} size={selectedServices.length > 0 ? 'md' : 'lg'}>
                  {t('app.createJob.addServices', 'Add services')}
                </DashedPickerTrigger>
              )}

              {showServiceDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                  {filteredServices.map(service => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => addService(service)}
                      className="w-full px-4 py-3 text-left hover:bg-accent-50/50 border-b border-gray-100"
                    >
                      <div className="text-sm font-semibold text-primary-800">{service.title}</div>
                      <div className="text-xs text-gray-500">
                        {formatMoney(Number(service.price) || 0, companyCountryCode)} · {service.duration_minutes}{' '}
                        {t('app.createJob.minutesUnit', 'min')}
                      </div>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={addCustomService}
                    className="w-full px-4 py-3 text-left hover:bg-accent-50 border-t border-gray-200 bg-gray-50 sticky bottom-0"
                  >
                    <div className="text-sm font-medium text-accent-600 flex items-center gap-2">
                      <PlusIcon className="w-4 h-4" />
                      {t('app.inlineService.createNew', 'Create new service')}
                    </div>
                  </button>
                </div>
              )}
            </div>

            {selectedServices.length > 0 && (
              <p className="mt-2 text-[11px] text-gray-500">
                {selectedServices.length} task{selectedServices.length === 1 ? '' : 's'} · {totalMinutes} min
              </p>
            )}
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex-shrink-0 border-t border-gray-100 px-5 py-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t('app.common.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            disabled={busy || !canSubmit}
            onClick={submit}
            className="flex-1 rounded-xl bg-accent-500 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-40"
          >
            {busy ? t('app.common.saving', 'Saving…') : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
