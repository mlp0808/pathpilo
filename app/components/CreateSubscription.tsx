'use client'

import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  XMarkIcon, PlusIcon, UserIcon, ClockIcon, DocumentTextIcon,
  CheckCircleIcon, CalendarDaysIcon, ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import ConfirmModal from './ConfirmModal'
import AddClientInlineForm, { initialNewClientData } from './AddClientInlineForm'
import { SchedulePanel, ForecastPanel } from './SubscriptionPanels'
import {
  buildWeeklyForecast,
  buildMonthlyForecast,
  fmtMoney,
  SelectedService,
} from '../utils/subscriptionHelpers'

interface Service {
  id: number
  title: string
  price: number
  duration_minutes: number
}

interface Client {
  id: number
  name: string
  last_name?: string
  client_type: 'person' | 'company'
  address?: string
  zip_code?: string
  city?: string
  email?: string
  phone?: string
  company_number?: string
}

interface CreateSubscriptionProps {
  isOpen: boolean
  onClose: () => void
  onSubscriptionCreated?: () => void
  initialClientId?: number
  lockClient?: boolean
}

const DAY_ICON = DocumentTextIcon

export default function CreateSubscription({
  isOpen, onClose, onSubscriptionCreated, initialClientId, lockClient = false,
}: CreateSubscriptionProps) {

  // ── tab ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'details' | 'schedule' | 'forecast'>('details')

  // ── data ─────────────────────────────────────────────────────
  const [services, setServices] = useState<Service[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [users, setUsers] = useState<any[]>([])

  // ── details state ─────────────────────────────────────────────
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [subscriptionTitle, setSubscriptionTitle] = useState('')
  const [jobTimeFrom, setJobTimeFrom] = useState('')
  const [jobTimeTo, setJobTimeTo] = useState('')
  const [jobNote, setJobNote] = useState('')
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [editingPrice, setEditingPrice] = useState<number | null>(null)
  const [editingDuration, setEditingDuration] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState<number | null>(null)
  const [isAddingNewClient, setIsAddingNewClient] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [serviceSearch, setServiceSearch] = useState('')
  const [showServiceDropdown, setShowServiceDropdown] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [newClientData, setNewClientData] = useState({ ...initialNewClientData })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdSubscriptionId, setCreatedSubscriptionId] = useState<number | null>(null)

  // ── time modal ────────────────────────────────────────────────
  const [isTimeRangeMode, setIsTimeRangeMode] = useState(false)
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [pendingTimeFrom, setPendingTimeFrom] = useState('')
  const [pendingTimeTo, setPendingTimeTo] = useState('')
  const [showTimeFromPicker, setShowTimeFromPicker] = useState(false)
  const [showTimeToPicker, setShowTimeToPicker] = useState(false)

  // ── schedule state ────────────────────────────────────────────
  const [startingDate, setStartingDate] = useState('')
  const [recurrenceType, setRecurrenceType] = useState<'weekly' | 'monthly'>('weekly')
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [intervalWeeks, setIntervalWeeks] = useState(1)
  const [customInterval, setCustomInterval] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [intervalMonths, setIntervalMonths] = useState(1)

  // ── portal refs ───────────────────────────────────────────────
  const clientDropdownTriggerRef = useRef<HTMLDivElement>(null)
  const serviceDropdownTriggerRef = useRef<HTMLDivElement>(null)
  const userDropdownTriggerRef = useRef<HTMLDivElement>(null)
  const timeFromPickerTriggerRef = useRef<HTMLDivElement>(null)
  const timeToPickerTriggerRef = useRef<HTMLDivElement>(null)
  const [clientDropdownRect, setClientDropdownRect] = useState<DOMRect | null>(null)
  const [serviceDropdownRect, setServiceDropdownRect] = useState<DOMRect | null>(null)
  const [userDropdownRect, setUserDropdownRect] = useState<DOMRect | null>(null)
  const [timeFromPickerRect, setTimeFromPickerRect] = useState<DOMRect | null>(null)
  const [timeToPickerRect, setTimeToPickerRect] = useState<DOMRect | null>(null)

  // ── computed ──────────────────────────────────────────────────
  const pricePerVisit = useMemo(
    () => selectedServices.reduce((s, svc) => s + (parseFloat(svc.customPrice) || 0), 0),
    [selectedServices],
  )
  const durationPerVisit = useMemo(
    () => selectedServices.reduce((s, svc) => s + (svc.customDuration || 0), 0),
    [selectedServices],
  )
  const visitsPerYear = recurrenceType === 'monthly'
    ? Math.round(12 / intervalMonths)
    : Math.round(52 / intervalWeeks)
  const revenuePerYear = pricePerVisit * visitsPerYear

  const forecastDates = useMemo(
    () => recurrenceType === 'monthly'
      ? buildMonthlyForecast(startingDate, dayOfMonth, intervalMonths, 16)
      : buildWeeklyForecast(startingDate, dayOfWeek, intervalWeeks, 16),
    [startingDate, recurrenceType, dayOfWeek, intervalWeeks, dayOfMonth, intervalMonths],
  )

  const selectedUser = users.find(u => u.id === selectedUserId) ?? null

  // ── reset ─────────────────────────────────────────────────────
  const resetForm = () => {
    setActiveTab('details')
    setSelectedServices([])
    setSelectedClient(null)
    setSelectedUserId(null)
    setSubscriptionTitle('')
    setStartingDate('')
    setJobTimeFrom('')
    setJobTimeTo('')
    setJobNote('')
    setShowNoteInput(false)
    setCreatedSubscriptionId(null)
    setEditingPrice(null)
    setEditingDuration(null)
    setEditingTitle(null)
    setIsAddingNewClient(false)
    setNewClientData({ ...initialNewClientData })
    setClientSearch('')
    setShowClientDropdown(false)
    setServiceSearch('')
    setShowServiceDropdown(false)
    setShowTimeFromPicker(false)
    setShowTimeToPicker(false)
    setRecurrenceType('weekly')
    setDayOfWeek(1)
    setIntervalWeeks(1)
    setCustomInterval('')
    setDayOfMonth(1)
    setIntervalMonths(1)
  }

  // ── effects ───────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      fetchServices()
      fetchClients()
      fetchUsers()
      resetForm()
    }
  }, [isOpen])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.dropdown-container') && !t.closest('[data-time-picker]')) {
        setShowClientDropdown(false)
        setShowServiceDropdown(false)
        setShowUserDropdown(false)
      }
    }
    if (showClientDropdown || showServiceDropdown || showUserDropdown) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [showClientDropdown, showServiceDropdown, showUserDropdown])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('[data-time-from-picker]') && !t.closest('[data-time-to-picker]') && !t.closest('[data-time-picker]')) {
        setShowTimeFromPicker(false)
        setShowTimeToPicker(false)
      }
    }
    if (showTimeFromPicker || showTimeToPicker) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [showTimeFromPicker, showTimeToPicker])

  // portal rect hooks
  useLayoutEffect(() => {
    if (!showClientDropdown) { setClientDropdownRect(null); return }
    const el = clientDropdownTriggerRef.current
    const update = () => { if (el) setClientDropdownRect(el.getBoundingClientRect()) }
    update(); window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [showClientDropdown])

  useLayoutEffect(() => {
    if (!showServiceDropdown || !serviceDropdownTriggerRef.current) { setServiceDropdownRect(null); return }
    const el = serviceDropdownTriggerRef.current
    const update = () => setServiceDropdownRect(el.getBoundingClientRect())
    update(); window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [showServiceDropdown])

  useLayoutEffect(() => {
    if (!showUserDropdown || selectedUserId || !userDropdownTriggerRef.current) { setUserDropdownRect(null); return }
    const el = userDropdownTriggerRef.current
    const update = () => setUserDropdownRect(el.getBoundingClientRect())
    update(); window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [showUserDropdown, selectedUserId])

  useLayoutEffect(() => {
    if (!showTimeFromPicker || !timeFromPickerTriggerRef.current) { setTimeFromPickerRect(null); return }
    const el = timeFromPickerTriggerRef.current
    const update = () => setTimeFromPickerRect(el.getBoundingClientRect())
    update(); window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [showTimeFromPicker])

  useLayoutEffect(() => {
    if (!showTimeToPicker || !pendingTimeFrom || !timeToPickerTriggerRef.current) { setTimeToPickerRect(null); return }
    const el = timeToPickerTriggerRef.current
    const update = () => setTimeToPickerRect(el.getBoundingClientRect())
    update(); window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [showTimeToPicker, pendingTimeFrom])

  // ── data fetchers ─────────────────────────────────────────────
  const fetchServices = async () => {
    const token = localStorage.getItem('token')
    const res = await fetch(apiUrl('/services'), { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (res.ok) setServices(data.services || [])
  }

  const fetchClients = async () => {
    const token = localStorage.getItem('token')
    const res = await fetch(apiUrl('/clients'), { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (res.ok) {
      const fetched: Client[] = data.clients || []
      setClients(fetched)
      if (initialClientId) {
        const match = fetched.find(c => c.id === initialClientId)
        if (match) setSelectedClient(match)
      }
    }
  }

  const fetchUsers = async () => {
    const token = localStorage.getItem('token')
    const res = await fetch(apiUrl('/users'), { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (res.ok) setUsers(data.users || [])
  }

  // ── service helpers ───────────────────────────────────────────
  const filteredClients = clients.filter(c => {
    const name = c.client_type === 'company' ? c.name : `${c.name}${c.last_name ? ` ${c.last_name}` : ''}`.trim()
    return name.toLowerCase().includes(clientSearch.toLowerCase())
  })

  const addService = (s: Service) => {
    if (!selectedServices.find(sel => sel.id === s.id)) {
      setSelectedServices(prev => [...prev, { ...s, customPrice: s.price.toString(), customDuration: s.duration_minutes }])
    }
    setServiceSearch('')
    setShowServiceDropdown(false)
  }

  const addCustomService = () => {
    const tempId = -Date.now()
    setSelectedServices(prev => [...prev, {
      id: tempId, title: '(custom task)', price: 0, duration_minutes: 0,
      customPrice: '0', customDuration: 0, isCustom: true, customTitle: '',
    }])
    setEditingTitle(tempId)
    setShowServiceDropdown(false)
    setServiceSearch('')
  }

  const removeService = (id: number) => setSelectedServices(prev => prev.filter(s => s.id !== id))

  const updateService = (id: number, field: 'customPrice' | 'customDuration', value: string | number) => {
    setSelectedServices(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  // ── submit ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!subscriptionTitle.trim()) { alert('Please enter a subscription title'); return }
    if (!selectedClient && !isAddingNewClient) { alert('Please select or add a client'); return }
    if (selectedServices.length === 0) { alert('Please add at least one service'); return }
    if (!startingDate) { alert('Please set a starting date in the Schedule tab'); return }

    try {
      setIsSubmitting(true)
      const token = localStorage.getItem('token')

      let clientId = selectedClient?.id

      // Create new client if needed
      if (isAddingNewClient || (selectedClient && (selectedClient.id === -1 || !selectedClient.id))) {
        const cRes = await fetch(apiUrl('/clients'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            client_type: newClientData.client_type || selectedClient?.client_type || 'person',
            name: newClientData.name || selectedClient?.name,
            last_name: newClientData.last_name || selectedClient?.last_name || null,
            address: newClientData.address || selectedClient?.address || null,
            zip_code: newClientData.zip_code || selectedClient?.zip_code || null,
            city: newClientData.city || selectedClient?.city || null,
            email: newClientData.email || selectedClient?.email || null,
            phone: newClientData.phone || selectedClient?.phone || null,
          }),
        })
        const cData = await cRes.json()
        if (!cRes.ok || !cData.client?.id) { alert(`Error creating client: ${cData.error || 'Unknown error'}`); return }
        clientId = cData.client.id
      }

      if (!clientId || clientId <= 0) { alert('Error: invalid client. Please select or create a valid client.'); return }

      const body = {
        title: subscriptionTitle.trim() || 'Subscription',
        client_id: clientId,
        assigned_user_id: selectedUserId || null,
        services: selectedServices.map(s =>
          s.isCustom
            ? { custom_title: s.customTitle?.trim() || 'Custom task', custom_price: parseFloat(s.customPrice) || 0, custom_duration: s.customDuration || 0 }
            : { service_id: s.id, custom_price: parseFloat(s.customPrice) || s.price, custom_duration: s.customDuration }
        ),
        starting_date: startingDate || null,
        recurrence_type: recurrenceType,
        day_of_week: recurrenceType === 'weekly' ? dayOfWeek : new Date(startingDate).getDay(),
        day_of_month: recurrenceType === 'monthly' ? dayOfMonth : null,
        interval_value: recurrenceType === 'monthly' ? intervalMonths : intervalWeeks,
        scheduled_time_from: jobTimeFrom || null,
        scheduled_time_to: jobTimeTo || null,
        note: jobNote.trim() || null,
      }

      const res = await fetch(apiUrl('/subscriptions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (res.ok) {
        setCreatedSubscriptionId(data.subscription.id)
        onSubscriptionCreated?.()
        setTimeout(() => onClose(), 200)
      } else {
        alert(`Error creating subscription: ${data.error || 'Unknown error'}`)
      }
    } catch (err) {
      alert('Error creating subscription')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  const clientDisplayName = selectedClient
    ? (selectedClient.client_type === 'company'
        ? selectedClient.name
        : `${selectedClient.name}${selectedClient.last_name ? ` ${selectedClient.last_name}` : ''}`.trim())
    : null

  const canSubmit = !isSubmitting && subscriptionTitle.trim().length > 0 &&
    (!!selectedClient || isAddingNewClient) && selectedServices.length > 0 && !!startingDate

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full min-h-[660px] max-h-[98vh] flex flex-col overflow-hidden border border-gray-200">

          {/* ── Header ─────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-white to-primary-50/30">
            <div>
              <h2 className="text-2xl font-bold text-primary-800 tracking-tight">Create Subscription</h2>
              <p className="text-sm text-gray-500 font-medium mt-0.5">
                {selectedClient
                  ? `${clientDisplayName} · ${subscriptionTitle || 'new subscription'}`
                  : 'Set up a recurring job schedule'
                }
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 bg-white rounded-xl flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm border border-gray-200 hover:border-gray-300 hover:shadow-md group"
            >
              <XMarkIcon className="w-5 h-5 text-gray-500 group-hover:text-gray-700 transition-colors" />
            </button>
          </div>

          {/* ── Tabs ───────────────────────────────────────────── */}
          <div className="flex items-center gap-1 px-6 py-3 border-b border-gray-100 bg-white">
            {([
              { id: 'details', label: 'Details', icon: DAY_ICON },
              { id: 'schedule', label: 'Schedule', icon: CalendarDaysIcon },
              { id: 'forecast', label: 'Forecast', icon: ArrowTrendingUpIcon },
            ] as const).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-500 hover:text-primary-500 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Content ────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto bg-gradient-to-b from-white to-gray-50/50">

            {/* ──────── DETAILS TAB ──────── */}
            {activeTab === 'details' && (
              <div className="p-6 space-y-5">

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-primary-700 mb-2">Subscription Title *</label>
                  <input
                    type="text"
                    value={subscriptionTitle}
                    onChange={e => setSubscriptionTitle(e.target.value)}
                    placeholder="e.g., Weekly Window Cleaning…"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                  />
                </div>

                {/* Client picker */}
                {!lockClient && (
                  <div>
                    <label className="block text-xs font-semibold text-primary-700 mb-2">Client *</label>
                    {selectedClient ? (
                      <div className="bg-gradient-to-r from-accent-50/50 to-white rounded-xl border border-accent-200/40 px-4 py-3 flex items-center justify-between shadow-sm">
                        <div>
                          <div className="text-sm font-semibold text-primary-800">{clientDisplayName}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {selectedClient.address
                              ? `${selectedClient.address}${selectedClient.city ? `, ${selectedClient.city}` : ''}`
                              : selectedClient.email || 'No address'}
                          </div>
                        </div>
                        <button
                          onClick={() => { setSelectedClient(null); setClientSearch(''); setIsAddingNewClient(false) }}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ) : isAddingNewClient ? (
                      <AddClientInlineForm
                        data={newClientData}
                        onChange={setNewClientData}
                        onSave={() => {
                          if (newClientData.name.trim()) {
                            setSelectedClient({ id: -1, name: newClientData.name, last_name: newClientData.last_name, client_type: newClientData.client_type })
                            setIsAddingNewClient(false)
                          }
                        }}
                        onCancel={() => { setIsAddingNewClient(false); setNewClientData({ ...initialNewClientData }) }}
                      />
                    ) : (
                      <div className="relative dropdown-container" ref={clientDropdownTriggerRef}>
                        <input
                          type="text"
                          value={clientSearch}
                          onChange={e => { setClientSearch(e.target.value); setShowClientDropdown(true) }}
                          onFocus={() => setShowClientDropdown(true)}
                          placeholder="Search for a client…"
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Services */}
                {(selectedClient || isAddingNewClient || lockClient) && (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-primary-700">Services</label>
                    <div className="relative dropdown-container" ref={serviceDropdownTriggerRef}>
                      <input
                        type="text"
                        value={serviceSearch}
                        onChange={e => { setServiceSearch(e.target.value); setShowServiceDropdown(true) }}
                        onFocus={() => setShowServiceDropdown(true)}
                        placeholder="Search services to add…"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                      />
                    </div>

                    {selectedServices.map(service => (
                      <div key={service.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-white to-accent-50/20 rounded-xl border border-accent-200/30 shadow-sm hover:shadow-md transition-all group">
                        <div className="flex-1 min-w-0">
                          {service.isCustom ? (
                            editingTitle === service.id ? (
                              <input
                                autoFocus
                                type="text"
                                placeholder="Task title"
                                defaultValue={service.customTitle || ''}
                                onBlur={e => {
                                  const v = e.target.value.trim()
                                  setSelectedServices(prev => prev.map(s => s.id === service.id ? { ...s, customTitle: v, title: v || '(custom task)' } : s))
                                  setEditingTitle(null)
                                }}
                                onKeyPress={e => e.key === 'Enter' && e.currentTarget.blur()}
                                className="text-sm text-accent-600 bg-white border-2 border-accent-400 rounded-lg px-2.5 py-1 w-full max-w-[220px] focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
                              />
                            ) : (
                              <button onClick={() => setEditingTitle(service.id)} className="text-left text-sm font-semibold text-accent-600 hover:text-accent-700 underline decoration-2 underline-offset-2">
                                {service.customTitle?.trim() || '(custom task)'}
                              </button>
                            )
                          ) : (
                            <div className="text-sm font-semibold text-primary-800 truncate">{service.title}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                          <div className="flex items-center gap-1.5 bg-white/60 px-2.5 py-1 rounded-lg border border-gray-200/50">
                            <span className="text-xs text-gray-500">Price:</span>
                            {editingPrice === service.id ? (
                              <input autoFocus type="number" defaultValue={service.customPrice}
                                onBlur={e => { updateService(service.id, 'customPrice', e.target.value); setEditingPrice(null) }}
                                onKeyPress={e => e.key === 'Enter' && e.currentTarget.blur()}
                                className="text-xs text-accent-600 bg-white border border-accent-400 rounded px-1.5 py-0.5 w-16 focus:outline-none"
                              />
                            ) : (
                              <button onClick={() => setEditingPrice(service.id)} className="text-xs font-semibold text-accent-600 hover:text-accent-700 underline decoration-1 underline-offset-2">
                                {service.customPrice}kr.
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 bg-white/60 px-2.5 py-1 rounded-lg border border-gray-200/50">
                            <span className="text-xs text-gray-500">Time:</span>
                            {editingDuration === service.id ? (
                              <input autoFocus type="number" defaultValue={service.customDuration}
                                onBlur={e => { updateService(service.id, 'customDuration', parseInt(e.target.value) || 0); setEditingDuration(null) }}
                                onKeyPress={e => e.key === 'Enter' && e.currentTarget.blur()}
                                className="text-xs text-accent-600 bg-white border border-accent-400 rounded px-1.5 py-0.5 w-14 focus:outline-none"
                              />
                            ) : (
                              <button onClick={() => setEditingDuration(service.id)} className="text-xs font-semibold text-accent-600 hover:text-accent-700 underline decoration-1 underline-offset-2">
                                {service.customDuration}min.
                              </button>
                            )}
                          </div>
                          <button onClick={() => removeService(service.id)} className="text-gray-400 hover:text-red-600 transition-all p-1.5 rounded-lg hover:bg-red-50">
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Chips: employee / time / note */}
                    {selectedServices.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {/* Employee */}
                        <div className="relative dropdown-container" ref={userDropdownTriggerRef}>
                          <button
                            type="button"
                            onClick={() => !selectedUserId && setShowUserDropdown(v => !v)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600 hover:text-primary-800 hover:border-accent-300 hover:bg-accent-50/30 shadow-sm hover:shadow-md transition-all hover:scale-[1.02]"
                          >
                            {selectedUser ? (
                              <>
                                <span className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 text-white text-xs font-bold flex items-center justify-center">
                                  {(selectedUser.first_name[0] || '') + (selectedUser.last_name[0] || '')}
                                </span>
                                <span>{selectedUser.first_name} {selectedUser.last_name}</span>
                                <XMarkIcon className="w-3 h-3 text-gray-400" onClick={e => { e.stopPropagation(); setSelectedUserId(null) }} />
                              </>
                            ) : (
                              <>
                                <UserIcon className="w-4 h-4 text-gray-400" />
                                <span>Assign employee</span>
                                <PlusIcon className="w-3 h-3 text-gray-400" />
                              </>
                            )}
                          </button>
                        </div>

                        {/* Time */}
                        {jobTimeFrom ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-accent-50 to-accent-50/50 border border-accent-200/60 rounded-full shadow-sm group">
                            <ClockIcon className="w-4 h-4 text-accent-600" />
                            <span className="text-sm font-semibold text-primary-800">
                              {jobTimeFrom}{jobTimeTo ? ` – ${jobTimeTo}` : ''}
                            </span>
                            <button onClick={() => { setJobTimeFrom(''); setJobTimeTo('') }} className="p-0.5 rounded-full hover:bg-white/80">
                              <XMarkIcon className="w-3.5 h-3.5 text-gray-500" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setPendingTimeFrom(jobTimeFrom); setPendingTimeTo(jobTimeTo); setIsTimeRangeMode(!!jobTimeTo); setShowTimeModal(true) }}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600 hover:text-primary-800 hover:border-accent-300 hover:bg-accent-50/30 shadow-sm hover:shadow-md transition-all hover:scale-[1.02]"
                          >
                            <ClockIcon className="w-4 h-4 text-gray-400" />
                            <span>Add time</span>
                            <PlusIcon className="w-3 h-3 text-gray-400" />
                          </button>
                        )}

                        {/* Note */}
                        {jobNote.trim() ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-accent-50 to-accent-50/50 border border-accent-200/60 rounded-full shadow-sm max-w-xs group">
                            <DocumentTextIcon className="w-4 h-4 text-accent-600 flex-shrink-0" />
                            <span className="text-sm font-semibold text-primary-800 truncate">{jobNote.length > 20 ? `${jobNote.slice(0, 20)}…` : jobNote}</span>
                            <button onClick={() => { setJobNote(''); setShowNoteInput(false) }} className="p-0.5 rounded-full hover:bg-white/80 flex-shrink-0">
                              <XMarkIcon className="w-3.5 h-3.5 text-gray-500" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowNoteInput(true)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600 hover:text-primary-800 hover:border-accent-300 hover:bg-accent-50/30 shadow-sm hover:shadow-md transition-all hover:scale-[1.02]"
                          >
                            <DocumentTextIcon className="w-4 h-4 text-gray-400" />
                            <span>Add note</span>
                            <PlusIcon className="w-3 h-3 text-gray-400" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Hint to next tab */}
                    {selectedServices.length > 0 && (
                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab('schedule')}
                          className="text-xs text-accent-600 hover:text-accent-700 font-semibold flex items-center gap-1 transition-colors"
                        >
                          Set schedule →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ──────── SCHEDULE TAB ──────── */}
            {activeTab === 'schedule' && (
              <div className="p-6">
                <SchedulePanel
                  startingDate={startingDate}
                  onStartingDateChange={setStartingDate}
                  recurrenceType={recurrenceType}
                  onRecurrenceTypeChange={setRecurrenceType}
                  dayOfWeek={dayOfWeek}
                  onDayOfWeekChange={setDayOfWeek}
                  intervalWeeks={intervalWeeks}
                  onIntervalWeeksChange={setIntervalWeeks}
                  customInterval={customInterval}
                  onCustomIntervalChange={setCustomInterval}
                  dayOfMonth={dayOfMonth}
                  onDayOfMonthChange={setDayOfMonth}
                  intervalMonths={intervalMonths}
                  onIntervalMonthsChange={setIntervalMonths}
                  pricePerVisit={pricePerVisit}
                  durationPerVisit={durationPerVisit}
                  visitsPerYear={visitsPerYear}
                  revenuePerYear={revenuePerYear}
                />
              </div>
            )}

            {/* ──────── FORECAST TAB ──────── */}
            {activeTab === 'forecast' && (
              <div className="p-6">
                <ForecastPanel
                  forecastDates={forecastDates}
                  pastJobs={[]}
                  pricePerVisit={pricePerVisit}
                  durationPerVisit={durationPerVisit}
                  visitsPerYear={visitsPerYear}
                  revenuePerYear={revenuePerYear}
                  originalPricePerVisit={0}
                  subscriptionTitle={subscriptionTitle}
                  selectedUser={selectedUser}
                  timeFrom={jobTimeFrom}
                  timeTo={jobTimeTo}
                />
              </div>
            )}
          </div>

          {/* ── Footer ─────────────────────────────────────────── */}
          <div className="border-t border-gray-100 px-6 py-4 bg-white flex items-center justify-between gap-3">
            <div className="text-xs text-gray-400">
              {pricePerVisit > 0 && startingDate
                ? `${fmtMoney(pricePerVisit)} per visit · ${fmtMoney(revenuePerYear)} / year`
                : ''
              }
            </div>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="px-6 py-2.5 bg-accent-500 text-white text-sm font-semibold rounded-xl hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-accent-500/20 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
              >
                {isSubmitting ? 'Creating…' : 'Create Subscription'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Portaled dropdowns ─────────────────────────────────── */}
      {typeof document !== 'undefined' && showClientDropdown && clientDropdownRect && createPortal(
        <div className="dropdown-container bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto" style={{ position: 'fixed', top: clientDropdownRect.bottom + 8, left: clientDropdownRect.left, width: clientDropdownRect.width, zIndex: 9999 }}>
          {filteredClients.length > 0 ? filteredClients.map(client => (
            <button key={client.id} onClick={() => { setSelectedClient(client); setClientSearch(''); setShowClientDropdown(false) }}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors">
              <div className="text-sm font-semibold text-primary-800">
                {client.client_type === 'company' ? client.name : `${client.name}${client.last_name ? ` ${client.last_name}` : ''}`.trim()}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{client.address ? `${client.address}, ${client.city}` : 'No address'}</div>
            </button>
          )) : <div className="px-4 py-3 text-sm text-gray-400">No clients found</div>}
          <button onClick={() => { setIsAddingNewClient(true); setShowClientDropdown(false); setClientSearch('') }}
            className="w-full px-4 py-3 text-left hover:bg-accent-50 border-t border-gray-200 bg-gray-50 sticky bottom-0">
            <div className="text-sm font-semibold text-accent-600 flex items-center gap-2">
              <PlusIcon className="w-4 h-4" />Add new client
            </div>
          </button>
        </div>,
        document.body
      )}

      {typeof document !== 'undefined' && showServiceDropdown && serviceDropdownRect && createPortal(
        <div className="dropdown-container bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto" style={{ position: 'fixed', top: serviceDropdownRect.bottom + 8, left: serviceDropdownRect.left, width: serviceDropdownRect.width, zIndex: 9999 }}>
          {services.filter(s => s.title.toLowerCase().includes(serviceSearch.toLowerCase()) && !selectedServices.find(sel => sel.id === s.id))
            .map(s => (
              <button key={s.id} onClick={() => addService(s)}
                className="w-full px-4 py-3 text-left hover:bg-accent-50/50 border-b border-gray-100 last:border-b-0 transition-all group">
                <div className="text-sm font-semibold text-primary-800 group-hover:text-accent-600">{s.title}</div>
                <div className="text-xs text-gray-400 mt-0.5">{s.price} DKK · {s.duration_minutes} min</div>
              </button>
            ))}
          <button onClick={addCustomService} className="w-full px-4 py-3 text-left hover:bg-accent-50 border-t border-gray-200 bg-gray-50 sticky bottom-0">
            <div className="text-sm font-semibold text-accent-600 flex items-center gap-2">
              <PlusIcon className="w-4 h-4" />Add custom task
            </div>
          </button>
        </div>,
        document.body
      )}

      {typeof document !== 'undefined' && showUserDropdown && !selectedUserId && userDropdownRect && createPortal(
        <div className="dropdown-container bg-white border border-gray-200 rounded-2xl shadow-2xl min-w-[220px] max-h-60 overflow-y-auto" style={{ position: 'fixed', top: userDropdownRect.bottom + 8, left: userDropdownRect.left, zIndex: 9999 }}>
          {users.map(u => (
            <button key={u.id} onClick={() => { setSelectedUserId(u.id); setShowUserDropdown(false) }}
              className="w-full px-4 py-3 text-left hover:bg-accent-50/50 flex items-center gap-3 transition-all border-b border-gray-100 last:border-b-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                {(u.first_name[0] || '') + (u.last_name[0] || '')}
              </div>
              <div>
                <div className="text-sm font-semibold text-primary-800">{u.first_name} {u.last_name}</div>
                <div className="text-xs text-gray-400 capitalize">{u.role}</div>
              </div>
            </button>
          ))}
        </div>,
        document.body
      )}

      {/* Time modal */}
      <ConfirmModal
        isOpen={showTimeModal}
        onClose={() => setShowTimeModal(false)}
        onConfirm={() => { setJobTimeFrom(pendingTimeFrom); setJobTimeTo(isTimeRangeMode ? pendingTimeTo : ''); setShowTimeModal(false) }}
        title="Set Time"
        description="Set the scheduled time for this subscription"
        confirmLabel="Save Time"
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            {[false, true].map(range => (
              <button key={String(range)} type="button"
                onClick={() => { setIsTimeRangeMode(range); if (!range) setPendingTimeTo('') }}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-all ${isTimeRangeMode === range ? 'bg-accent-500 border-accent-500 text-white shadow-md' : 'bg-white border-gray-200 text-gray-700 hover:bg-accent-50/30'}`}>
                {range ? 'Time range' : 'Single time'}
              </button>
            ))}
          </div>
          <div className="relative" data-time-from-picker ref={timeFromPickerTriggerRef}>
            <label className="block text-xs font-semibold text-primary-700 mb-2">{isTimeRangeMode ? 'Start Time' : 'Select Time'}</label>
            <input type="text" value={pendingTimeFrom} onChange={e => setPendingTimeFrom(e.target.value)}
              onFocus={() => setShowTimeFromPicker(true)} onClick={() => setShowTimeFromPicker(true)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-white shadow-sm focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
              placeholder="09:00" autoComplete="off" />
          </div>
          {isTimeRangeMode && (
            <div className="relative" data-time-to-picker ref={timeToPickerTriggerRef}>
              <label className="block text-xs font-semibold text-primary-700 mb-2">End Time</label>
              <input type="text" value={pendingTimeTo} onChange={e => setPendingTimeTo(e.target.value)}
                onFocus={() => pendingTimeFrom && setShowTimeToPicker(true)} onClick={() => pendingTimeFrom && setShowTimeToPicker(true)}
                disabled={!pendingTimeFrom}
                className={`w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-white shadow-sm ${!pendingTimeFrom ? 'opacity-50 cursor-not-allowed' : 'focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500'}`}
                placeholder={pendingTimeFrom ? '17:00' : 'Select start time first'} autoComplete="off" />
            </div>
          )}
        </div>
      </ConfirmModal>

      {/* Time pickers portaled */}
      {typeof document !== 'undefined' && showTimeFromPicker && timeFromPickerRect && createPortal(
        <div className="dropdown-container max-h-64 overflow-y-auto border border-gray-200 rounded-xl p-3 bg-white shadow-2xl" style={{ position: 'fixed', top: timeFromPickerRect.bottom + 8, left: timeFromPickerRect.left, width: timeFromPickerRect.width, zIndex: 9999 }} data-time-picker>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 48 }, (_, i) => {
              const h = Math.floor(i / 2), min = (i % 2) * 30
              const t = `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`
              return <button key={t} type="button" onClick={() => { setPendingTimeFrom(t); setShowTimeFromPicker(false) }}
                className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all ${pendingTimeFrom === t ? 'bg-accent-500 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-accent-50 border border-gray-200'}`}>{t}</button>
            })}
          </div>
        </div>,
        document.body
      )}

      {typeof document !== 'undefined' && showTimeToPicker && pendingTimeFrom && timeToPickerRect && createPortal(
        <div className="dropdown-container max-h-64 overflow-y-auto border border-gray-200 rounded-xl p-3 bg-white shadow-2xl" style={{ position: 'fixed', top: timeToPickerRect.bottom + 8, left: timeToPickerRect.left, width: timeToPickerRect.width, zIndex: 9999 }} data-time-picker>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 48 }, (_, i) => {
              const h = Math.floor(i / 2), min = (i % 2) * 30
              const t = `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`
              const disabled = t <= pendingTimeFrom
              return <button key={t} type="button" disabled={disabled} onClick={() => { if (!disabled) { setPendingTimeTo(t); setShowTimeToPicker(false) } }}
                className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all ${pendingTimeTo === t ? 'bg-accent-500 text-white' : disabled ? 'bg-gray-50 text-gray-300 cursor-not-allowed opacity-40' : 'bg-white text-gray-700 hover:bg-accent-50 border border-gray-200'}`}>{t}</button>
            })}
          </div>
        </div>,
        document.body
      )}

      {/* Note modal */}
      <ConfirmModal
        isOpen={showNoteInput}
        onClose={() => setShowNoteInput(false)}
        onConfirm={() => setShowNoteInput(false)}
        title="Add Note"
        description="Add a note to this subscription"
        confirmLabel="Save Note"
        enableNotification={false}
      >
        <div>
          <label className="block text-xs font-semibold text-primary-700 mb-2">Note</label>
          <textarea value={jobNote} onChange={e => setJobNote(e.target.value)}
            placeholder="Enter a note for this subscription…" rows={5}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none bg-white shadow-sm focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500" />
        </div>
      </ConfirmModal>
    </>
  )
}
