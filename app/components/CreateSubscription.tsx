'use client'

import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  XMarkIcon, PlusIcon, UserIcon, ClockIcon, DocumentTextIcon,
  CheckCircleIcon, CalendarDaysIcon, ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import { formatMoney, getCountryRule } from '../config/countryRules'
import {
  ClientStandardNotesPicker,
  type ClientStandardNoteRow,
} from './ClientStandardNotesPicker'
import { useCompanyCountryCode } from '../hooks/useCompanyCountryCode'
import ConfirmModal from './ConfirmModal'
import AddClientInlineForm, { initialNewClientData } from './AddClientInlineForm'
import { SchedulePanel, ForecastPanel } from './SubscriptionPanels'
import {
  buildWeeklyForecast,
  buildMonthlyForecast,
  fmtMoney,
  SelectedService,
  todayYmdLocal,
  firstOccurrenceOnOrAfterAnchor,
} from '../utils/subscriptionHelpers'
import { useAppI18n } from './I18nProvider'
import InlineServiceCreateSheet, { type InlineServiceCreateResult } from './InlineServiceCreateSheet'
import DashedPickerTrigger from './DashedPickerTrigger'
import JobFormAttachmentBar from './JobFormAttachmentBar'

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
  const { t } = useAppI18n()
  const companyCountryCode = useCompanyCountryCode()
  const companyCurrency = getCountryRule(companyCountryCode).defaultCurrency

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
  const [clientStandardNotes, setClientStandardNotes] = useState<ClientStandardNoteRow[]>([])
  const [clientStandardNotesLoading, setClientStandardNotesLoading] = useState(false)
  const [clientStandardNotesError, setClientStandardNotesError] = useState<string | null>(null)
  const [editingPrice, setEditingPrice] = useState<number | null>(null)
  const [editingDuration, setEditingDuration] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState<number | null>(null)
  const [isAddingNewClient, setIsAddingNewClient] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [serviceSearch, setServiceSearch] = useState('')
  const [showServiceDropdown, setShowServiceDropdown] = useState(false)
  const [showServiceCreateSheet, setShowServiceCreateSheet] = useState(false)
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
  const [startAsap, setStartAsap] = useState(true)
  const [customStartingDate, setCustomStartingDate] = useState('')
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
  const clientSearchInputRef = useRef<HTMLInputElement>(null)
  const serviceSearchInputRef = useRef<HTMLInputElement>(null)
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

  const effectiveStartingDate = useMemo(
    () => (startAsap ? todayYmdLocal() : customStartingDate),
    [startAsap, customStartingDate],
  )

  /** First scheduled visit (e.g. next Monday from today). Used for API when ASAP. */
  const firstVisitYmd = useMemo(() => {
    const anchor = startAsap ? todayYmdLocal() : customStartingDate.trim()
    if (!anchor) return ''
    return firstOccurrenceOnOrAfterAnchor(
      anchor,
      recurrenceType,
      dayOfWeek,
      intervalWeeks,
      dayOfMonth,
      intervalMonths,
    )
  }, [
    startAsap,
    customStartingDate,
    recurrenceType,
    dayOfWeek,
    intervalWeeks,
    dayOfMonth,
    intervalMonths,
  ])

  const startingDateForApi = useMemo(
    () => (startAsap ? firstVisitYmd : customStartingDate.trim()),
    [startAsap, firstVisitYmd, customStartingDate],
  )

  const forecastDates = useMemo(
    () => recurrenceType === 'monthly'
      ? buildMonthlyForecast(effectiveStartingDate, dayOfMonth, intervalMonths, 16)
      : buildWeeklyForecast(effectiveStartingDate, dayOfWeek, intervalWeeks, 16),
    [effectiveStartingDate, recurrenceType, dayOfWeek, intervalWeeks, dayOfMonth, intervalMonths],
  )

  const selectedUser = users.find(u => u.id === selectedUserId) ?? null

  // ── reset ─────────────────────────────────────────────────────
  const resetForm = () => {
    setActiveTab('details')
    setSelectedServices([])
    setSelectedClient(null)
    setSelectedUserId(null)
    setSubscriptionTitle('')
    setStartAsap(true)
    setCustomStartingDate('')
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
    if (!showNoteInput || !selectedClient?.id || selectedClient.id < 1) {
      setClientStandardNotes([])
      setClientStandardNotesLoading(false)
      setClientStandardNotesError(null)
      return
    }
    let cancelled = false
    setClientStandardNotesLoading(true)
    setClientStandardNotesError(null)
    const token = localStorage.getItem('token')
    fetch(apiUrl(`/clients/${selectedClient.id}/secure-notes`), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok && Array.isArray(data.notes)) {
          setClientStandardNotes(
            data.notes.map((n: { id: number; note: string }) => ({
              id: n.id,
              note: typeof n.note === 'string' ? n.note : '',
            })),
          )
        } else {
          setClientStandardNotes([])
          setClientStandardNotesError(
            typeof data.error === 'string' ? data.error : 'Could not load client notes',
          )
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClientStandardNotes([])
          setClientStandardNotesError('Network error')
        }
      })
      .finally(() => {
        if (!cancelled) setClientStandardNotesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showNoteInput, selectedClient?.id])

  const applyClientStandardNote = (text: string) => {
    setJobNote((prev) => {
      const p = prev.trim()
      if (!p) return text
      return `${p}\n\n${text}`
    })
  }

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
    if (!showUserDropdown || !userDropdownTriggerRef.current) { setUserDropdownRect(null); return }
    const el = userDropdownTriggerRef.current
    const update = () => setUserDropdownRect(el.getBoundingClientRect())
    update()
    window.addEventListener('resize', update)
    const vv = window.visualViewport
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('resize', update)
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
    }
  }, [showUserDropdown])

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
    if (res.ok) {
      const fetched = data.users || []
      setUsers(fetched)
      // Solo company: auto-assign the only employee so the form is pre-filled.
      if (fetched.length === 1) {
        setSelectedUserId(prev => (prev ? prev : fetched[0].id))
      }
    }
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
    setShowServiceDropdown(false)
    setShowServiceCreateSheet(true)
  }

  const openClientPicker = () => {
    setShowClientDropdown(true)
    requestAnimationFrame(() => clientSearchInputRef.current?.focus())
  }

  const openServicePicker = () => {
    setShowServiceDropdown(true)
    requestAnimationFrame(() => serviceSearchInputRef.current?.focus())
  }

  const handleInlineServiceCreated = (result: InlineServiceCreateResult) => {
    if (result.kind === 'catalog') {
      const svc: Service = {
        id: result.service.id,
        title: result.service.title,
        price: result.service.price,
        duration_minutes: result.service.duration_minutes,
      }
      setServices((prev) => {
        if (prev.some((x) => x.id === svc.id)) {
          return prev.map((x) => (x.id === svc.id ? svc : x))
        }
        return [...prev, svc].sort((a, b) => a.title.localeCompare(b.title))
      })
      addService(svc)
      return
    }
    const tempId = -Date.now()
    setSelectedServices((prev) => [
      ...prev,
      {
        id: tempId,
        title: result.title,
        price: result.price,
        duration_minutes: result.durationMinutes,
        customPrice: String(result.price),
        customDuration: result.durationMinutes,
        isCustom: true,
        customTitle: result.title,
      },
    ])
    setServiceSearch('')
    setShowServiceDropdown(false)
  }

  const removeService = (id: number) => setSelectedServices(prev => prev.filter(s => s.id !== id))

  const updateService = (id: number, field: 'customPrice' | 'customDuration', value: string | number) => {
    setSelectedServices(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  // ── submit ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!subscriptionTitle.trim()) { alert(t('app.subscription.errTitleRequired', 'Please enter a subscription title')); return }
    if (!selectedClient && !isAddingNewClient) { alert(t('app.subscription.errClientRequired', 'Please select or add a client')); return }
    if (selectedServices.length === 0) { alert(t('app.subscription.errServiceRequired', 'Please add at least one service')); return }
    if (!startAsap && !customStartingDate.trim()) {
      alert(t('app.subscription.errStartingDateRequired', 'Please set a starting date in the Schedule tab'))
      return
    }

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
        if (!cRes.ok || !cData.client?.id) { alert(`${t('app.subscription.errCreateClient', 'Error creating client:')} ${cData.error || t('app.subscription.unknownError', 'Unknown error')}`); return }
        clientId = cData.client.id
      }

      if (!clientId || clientId <= 0) { alert(t('app.subscription.errInvalidClient', 'Error: invalid client. Please select or create a valid client.')); return }

      const body = {
        title: subscriptionTitle.trim() || t('app.subscription.fallbackTitle', 'Subscription'),
        client_id: clientId,
        assigned_user_id: selectedUserId || null,
        services: selectedServices.map(s =>
          s.isCustom
            ? { custom_title: s.customTitle?.trim() || t('app.subscription.customTaskTitle', 'Custom task'), custom_price: parseFloat(s.customPrice) || 0, custom_duration: s.customDuration || 0 }
            : { service_id: s.id, custom_price: parseFloat(s.customPrice) || s.price, custom_duration: s.customDuration }
        ),
        starting_date: startingDateForApi || null,
        recurrence_type: recurrenceType,
        day_of_week:
          recurrenceType === 'weekly'
            ? dayOfWeek
            : new Date(`${startingDateForApi}T12:00:00`).getDay(),
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
        alert(`${t('app.subscription.errCreatePrefix', 'Error creating subscription:')} ${data.error || t('app.subscription.unknownError', 'Unknown error')}`)
      }
    } catch (err) {
      alert(t('app.subscription.errCreateGeneric', 'Error creating subscription'))
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

  const canProceedToSchedule =
    subscriptionTitle.trim().length > 0 &&
    (!!selectedClient || isAddingNewClient) &&
    selectedServices.length > 0

  const canSubmit =
    !isSubmitting &&
    canProceedToSchedule &&
    (startAsap ? !!firstVisitYmd : !!customStartingDate.trim())

  const goToSchedule = () => {
    if (!subscriptionTitle.trim()) {
      alert(t('app.subscription.errTitleRequired', 'Please enter a subscription title'))
      return
    }
    if (!selectedClient && !isAddingNewClient) {
      alert(t('app.subscription.errClientRequired', 'Please select or add a client'))
      return
    }
    if (selectedServices.length === 0) {
      alert(t('app.subscription.errServiceRequired', 'Please add at least one service'))
      return
    }
    setActiveTab('schedule')
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-2xl w-full min-h-[520px] max-h-[98vh] flex flex-col overflow-hidden border border-gray-200">

          {/* ── Header ─────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 tracking-tight">{t('app.subscription.titleCreate', 'Create Subscription')}</h2>
              <p className="text-sm text-gray-500 font-medium mt-0.5">
                {selectedClient
                  ? `${clientDisplayName} · ${subscriptionTitle || t('app.subscription.newSubscription', 'nyt abonnement')}`
                  : t('app.subscription.subtitleNew', 'Set up a recurring job schedule')
                }
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label={t('app.subscription.cancel', 'Cancel')}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* ── Tabs ───────────────────────────────────────────── */}
          <div className="flex items-center gap-0.5 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
            {([
              { id: 'details', label: t('app.subscription.tabDetails', 'Details'), icon: DAY_ICON },
              { id: 'schedule', label: t('app.subscription.tabSchedule', 'Schedule'), icon: CalendarDaysIcon },
              { id: 'forecast', label: t('app.subscription.tabForecast', 'Forecast'), icon: ArrowTrendingUpIcon },
            ] as const).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <tab.icon className="w-4 h-4 opacity-70" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Content ────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto bg-white">

            {/* ──────── DETAILS TAB ──────── */}
            {activeTab === 'details' && (
              <div className="p-6 space-y-5">

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-primary-700 mb-2">{t('app.subscription.subscriptionTitleLabel', 'Subscription Title *')}</label>
                  <input
                    type="text"
                    value={subscriptionTitle}
                    onChange={e => setSubscriptionTitle(e.target.value)}
                    placeholder={t('app.subscription.subscriptionTitlePlaceholder', 'e.g., Weekly Window Cleaning…')}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                  />
                </div>

                {/* Client picker */}
                {!lockClient && (
                  <div>
                    {selectedClient ? (
                      <div className="bg-gradient-to-r from-accent-50/50 to-white rounded-xl border border-accent-200/40 px-4 py-3 flex items-center justify-between shadow-sm">
                        <div>
                          <div className="text-sm font-semibold text-primary-800">{clientDisplayName}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {selectedClient.address
                              ? `${selectedClient.address}${selectedClient.city ? `, ${selectedClient.city}` : ''}`
                              : selectedClient.email || t('app.jobView.noAddress', 'No address')}
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
                        {showClientDropdown || clientSearch ? (
                          <input
                            ref={clientSearchInputRef}
                            type="text"
                            value={clientSearch}
                            onChange={e => { setClientSearch(e.target.value); setShowClientDropdown(true) }}
                            onFocus={() => setShowClientDropdown(true)}
                            placeholder={t('app.createJob.searchClient', 'Search for a client...')}
                            className="w-full px-4 py-3.5 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                          />
                        ) : (
                          <DashedPickerTrigger onClick={openClientPicker}>
                            {t('app.createJob.selectAClient', 'Select a Client')}
                          </DashedPickerTrigger>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Services */}
                {(selectedClient || isAddingNewClient || lockClient) && (
                  <div className="space-y-3">
                    {selectedServices.map(service => (
                      <div key={service.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-white to-accent-50/20 rounded-xl border border-accent-200/30 shadow-sm hover:shadow-md transition-all group">
                        <div className="flex-1 min-w-0">
                          {service.isCustom ? (
                            editingTitle === service.id ? (
                              <input
                                autoFocus
                                type="text"
                                placeholder={t('app.subscription.taskTitle', 'Task title')}
                                defaultValue={service.customTitle || ''}
                                onBlur={e => {
                                  const v = e.target.value.trim()
                                  setSelectedServices(prev => prev.map(s => s.id === service.id ? { ...s, customTitle: v, title: v || t('app.subscription.customTask', '(custom task)') } : s))
                                  setEditingTitle(null)
                                }}
                                onKeyPress={e => e.key === 'Enter' && e.currentTarget.blur()}
                                className="text-sm text-accent-600 bg-white border-2 border-accent-400 rounded-lg px-2.5 py-1 w-full max-w-[220px] focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
                              />
                            ) : (
                              <button onClick={() => setEditingTitle(service.id)} className="text-left text-sm font-semibold text-accent-600 hover:text-accent-700 underline decoration-2 underline-offset-2">
                                {service.customTitle?.trim() || t('app.subscription.customTask', '(custom task)')}
                              </button>
                            )
                          ) : (
                            <div className="text-sm font-semibold text-primary-800 truncate">{service.title}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                          <div className="flex items-center gap-1.5 bg-white/60 px-2.5 py-1 rounded-lg border border-gray-200/50">
                            <span className="text-xs text-gray-500">{t('app.subscription.price', 'Price:')}</span>
                            {editingPrice === service.id ? (
                              <>
                                <input autoFocus type="number" defaultValue={service.customPrice}
                                  onBlur={e => { updateService(service.id, 'customPrice', e.target.value); setEditingPrice(null) }}
                                  onKeyPress={e => e.key === 'Enter' && e.currentTarget.blur()}
                                  className="text-xs text-accent-600 bg-white border border-accent-400 rounded px-1.5 py-0.5 w-16 focus:outline-none"
                                />
                                <span className="text-xs text-gray-500">{companyCurrency}</span>
                              </>
                            ) : (
                              <button onClick={() => setEditingPrice(service.id)} className="text-xs font-semibold text-accent-600 hover:text-accent-700 underline decoration-1 underline-offset-2">
                                {formatMoney(parseFloat(service.customPrice) || 0, companyCountryCode)}
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 bg-white/60 px-2.5 py-1 rounded-lg border border-gray-200/50">
                            <span className="text-xs text-gray-500">{t('app.subscription.time', 'Time:')}</span>
                            {editingDuration === service.id ? (
                              <input autoFocus type="number" defaultValue={service.customDuration}
                                onBlur={e => { updateService(service.id, 'customDuration', parseInt(e.target.value) || 0); setEditingDuration(null) }}
                                onKeyPress={e => e.key === 'Enter' && e.currentTarget.blur()}
                                className="text-xs text-accent-600 bg-white border border-accent-400 rounded px-1.5 py-0.5 w-14 focus:outline-none"
                              />
                            ) : (
                              <button onClick={() => setEditingDuration(service.id)} className="text-xs font-semibold text-accent-600 hover:text-accent-700 underline decoration-1 underline-offset-2">
                                {service.customDuration}{t('app.subscription.schedule.minPerVisit', 'min')}
                              </button>
                            )}
                          </div>
                          <button onClick={() => removeService(service.id)} className="text-gray-400 hover:text-red-600 transition-all p-1.5 rounded-lg hover:bg-red-50">
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="relative dropdown-container" ref={serviceDropdownTriggerRef}>
                      {showServiceDropdown || serviceSearch ? (
                        <input
                          ref={serviceSearchInputRef}
                          type="text"
                          value={serviceSearch}
                          onChange={e => { setServiceSearch(e.target.value); setShowServiceDropdown(true) }}
                          onFocus={() => setShowServiceDropdown(true)}
                          placeholder={t('app.subscription.searchServicesPlaceholder', 'Search services to add…')}
                          className="w-full px-4 py-3.5 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                        />
                      ) : (
                        <DashedPickerTrigger onClick={openServicePicker} size={selectedServices.length > 0 ? 'md' : 'lg'}>
                          {t('app.createJob.addServices', 'Add services')}
                        </DashedPickerTrigger>
                      )}
                    </div>

                  </div>
                )}
              </div>
            )}

            {/* ──────── SCHEDULE TAB ──────── */}
            {activeTab === 'schedule' && (
              <div className="p-6">
                <SchedulePanel
                  effectiveStartingDate={effectiveStartingDate}
                  firstVisitYmd={firstVisitYmd}
                  startAsap={startAsap}
                  onStartAsapChange={setStartAsap}
                  customStartingDate={customStartingDate}
                  onCustomStartingDateChange={setCustomStartingDate}
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
                  countryCode={companyCountryCode}
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
                  countryCode={companyCountryCode}
                />
              </div>
            )}
          </div>

          {/* ── Footer ─────────────────────────────────────────── */}
          <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/50 flex flex-wrap items-center gap-3">
            {activeTab === 'details' && (
              <JobFormAttachmentBar
                users={users}
                selectedUserId={selectedUserId}
                onEmployeeClick={() => {
                  if (!selectedUserId || users.length > 1) setShowUserDropdown((v) => !v)
                }}
                onClearEmployee={() => setSelectedUserId(null)}
                userTriggerRef={userDropdownTriggerRef}
                jobTimeFrom={jobTimeFrom}
                jobTimeTo={jobTimeTo}
                onTimeClick={() => {
                  setPendingTimeFrom(jobTimeFrom)
                  setPendingTimeTo(jobTimeTo)
                  setIsTimeRangeMode(!!jobTimeTo)
                  setShowTimeModal(true)
                }}
                onClearTime={() => { setJobTimeFrom(''); setJobTimeTo('') }}
                jobNote={jobNote}
                onNoteClick={() => setShowNoteInput(true)}
                onClearNote={() => { setJobNote(''); setShowNoteInput(false) }}
                assignEmployeeLabel={t('app.subscription.assignEmployee', 'Assign employee')}
                addTimeLabel={t('app.subscription.addTime', 'Add time')}
                addNoteLabel={t('app.subscription.addNote', 'Add note')}
              />
            )}
            <div className="flex-1 min-w-0 text-xs text-gray-500 truncate hidden sm:block">
              {pricePerVisit > 0 && (startAsap ? !!firstVisitYmd : !!customStartingDate)
                ? `${fmtMoney(pricePerVisit, companyCountryCode)} ${t('app.subscription.perVisit', 'per visit')} · ${fmtMoney(revenuePerYear, companyCountryCode)} ${t('app.subscription.perYear', '/ year')}`
                : ''
              }
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              <button onClick={onClose} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                {t('app.subscription.cancel', 'Cancel')}
              </button>
              {activeTab === 'details' ? (
                <button
                  type="button"
                  onClick={goToSchedule}
                  disabled={!canProceedToSchedule}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-primary-600 text-primary-700 bg-white hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {t('app.subscription.setSchedule', 'Set schedule')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-primary-600 text-primary-700 bg-white hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting
                    ? t('app.subscription.saving', 'Saving...')
                    : t('app.subscription.createSubscriptionBtn', 'Create Subscription')}
                </button>
              )}
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
              <div className="text-xs text-gray-400 mt-0.5">{client.address ? `${client.address}, ${client.city}` : t('app.jobView.noAddress', 'No address')}</div>
            </button>
          )) : <div className="px-4 py-3 text-sm text-gray-400">{t('app.createJob.noClientsFound', 'No clients found')}</div>}
          <button onClick={() => { setIsAddingNewClient(true); setShowClientDropdown(false); setClientSearch('') }}
            className="w-full px-4 py-3 text-left hover:bg-accent-50 border-t border-gray-200 bg-gray-50 sticky bottom-0">
            <div className="text-sm font-semibold text-accent-600 flex items-center gap-2">
              <PlusIcon className="w-4 h-4" />{t('app.createJob.addNewClient', 'Add new client')}
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
                <div className="text-xs text-gray-400 mt-0.5">{formatMoney(Number(s.price) || 0, companyCountryCode)} · {s.duration_minutes} min</div>
              </button>
            ))}
          <button onClick={addCustomService} className="w-full px-4 py-3 text-left hover:bg-accent-50 border-t border-gray-200 bg-gray-50 sticky bottom-0">
            <div className="text-sm font-semibold text-accent-600 flex items-center gap-2">
              <PlusIcon className="w-4 h-4" />{t('app.inlineService.createNew', 'Create new service')}
            </div>
          </button>
        </div>,
        document.body
      )}

      {typeof document !== 'undefined' && showUserDropdown && userDropdownRect && createPortal(
        <div
          className="dropdown-container bg-white border border-gray-200 rounded-2xl shadow-2xl min-w-[220px] max-h-60 overflow-y-auto"
          style={{
            position: 'fixed',
            left: userDropdownRect.left,
            bottom: window.innerHeight - userDropdownRect.top + 6,
            zIndex: 9999,
          }}
        >
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
        title={t('app.subscription.setTimeTitle', 'Set Time')}
        description={t('app.subscription.setTimeDesc', 'Set the scheduled time for this subscription')}
        confirmLabel={t('app.subscription.saveTime', 'Save Time')}
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            {[false, true].map(range => (
              <button key={String(range)} type="button"
                onClick={() => { setIsTimeRangeMode(range); if (!range) setPendingTimeTo('') }}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border transition-all ${isTimeRangeMode === range ? 'bg-accent-500 border-accent-500 text-white shadow-md' : 'bg-white border-gray-200 text-gray-700 hover:bg-accent-50/30'}`}>
                {range ? t('app.subscription.timeRange', 'Time range') : t('app.subscription.singleTime', 'Single time')}
              </button>
            ))}
          </div>
          <div className="relative" data-time-from-picker ref={timeFromPickerTriggerRef}>
            <label className="block text-xs font-semibold text-primary-700 mb-2">{isTimeRangeMode ? t('app.subscription.startTime', 'Start Time') : t('app.subscription.selectTime', 'Select Time')}</label>
            <input type="text" value={pendingTimeFrom} onChange={e => setPendingTimeFrom(e.target.value)}
              onFocus={() => setShowTimeFromPicker(true)} onClick={() => setShowTimeFromPicker(true)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-white shadow-sm focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
              placeholder={t('app.subscription.timePlaceholder', '09:00')} autoComplete="off" />
          </div>
          {isTimeRangeMode && (
            <div className="relative" data-time-to-picker ref={timeToPickerTriggerRef}>
              <label className="block text-xs font-semibold text-primary-700 mb-2">{t('app.subscription.endTime', 'End Time')}</label>
              <input type="text" value={pendingTimeTo} onChange={e => setPendingTimeTo(e.target.value)}
                onFocus={() => pendingTimeFrom && setShowTimeToPicker(true)} onClick={() => pendingTimeFrom && setShowTimeToPicker(true)}
                disabled={!pendingTimeFrom}
                className={`w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-white shadow-sm ${!pendingTimeFrom ? 'opacity-50 cursor-not-allowed' : 'focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500'}`}
                placeholder={pendingTimeFrom ? t('app.subscription.endTimePlaceholder', '17:00') : t('app.subscription.selectStartFirst', 'Select start time first')} autoComplete="off" />
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
        title={t('app.subscription.addNoteTitle', 'Add Note')}
        description={t('app.subscription.addNoteDesc', 'Add a note to this subscription')}
        confirmLabel={t('app.subscription.saveNote', 'Save note')}
        enableNotification={false}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-primary-700 mb-2">{t('app.common.note', 'Note')}</label>
            <textarea value={jobNote} onChange={e => setJobNote(e.target.value)}
              placeholder={t('app.subscription.notePlaceholder', 'Add a note for this subscription…')} rows={5}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none bg-white shadow-sm focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500" />
          </div>
          <ClientStandardNotesPicker
            clientId={selectedClient?.id}
            loading={clientStandardNotesLoading}
            error={clientStandardNotesError}
            notes={clientStandardNotes}
            onUse={applyClientStandardNote}
            t={t}
            addLabelKey="app.subscription.useClientStandardNote"
            addLabelFallback="Add to subscription note"
          />
        </div>
      </ConfirmModal>
      <InlineServiceCreateSheet
        isOpen={showServiceCreateSheet}
        scope="subscription"
        onClose={() => setShowServiceCreateSheet(false)}
        onComplete={handleInlineServiceCreated}
      />
    </>
  )
}
