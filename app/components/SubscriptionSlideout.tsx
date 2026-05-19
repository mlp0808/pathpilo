'use client'

import { useState, useEffect, useMemo } from 'react'
import { XMarkIcon, PlusIcon, UserIcon, ClockIcon, DocumentTextIcon, CalendarDaysIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import { formatMoney } from '../config/countryRules'
import { useCompanyCountryCode } from '../hooks/useCompanyCountryCode'
import TimePicker from './TimePicker'
import { SchedulePanel, ForecastPanel } from './SubscriptionPanels'
import {
  DAY_NAMES,
  buildWeeklyForecast,
  buildMonthlyForecast,
  fmtMoney,
} from '../utils/subscriptionHelpers'
import { useAppI18n } from './I18nProvider'

interface Service {
  id: number
  title: string
  price: number
  duration_minutes: number
}

interface User {
  id: number
  first_name: string
  last_name: string
  email: string
  role: string
}

interface SelectedService {
  id: number
  title: string
  price: number
  duration_minutes: number
  customPrice: string
  customDuration: number
}

interface SubscriptionSlideoutProps {
  isOpen: boolean
  onClose: () => void
  onSubscriptionCreated?: () => void
  onPauseToggle?: (subscription: any, paused: boolean) => void
  clientId: number
  subscription?: any
}


export default function SubscriptionSlideout({
  isOpen, onClose, onSubscriptionCreated, onPauseToggle, clientId, subscription
}: SubscriptionSlideoutProps) {
  const { t } = useAppI18n()
  const companyCountryCode = useCompanyCountryCode()

  const [activeTab, setActiveTab] = useState<'details' | 'schedule' | 'forecast'>('details')
  const [services, setServices] = useState<Service[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [existingJobs, setExistingJobs] = useState<any[]>([])
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [showServiceDropdown, setShowServiceDropdown] = useState(false)
  const [serviceSearch, setServiceSearch] = useState('')
  const [subscriptionTitle, setSubscriptionTitle] = useState('')
  const [startingDate, setStartingDate] = useState('')
  const [recurrenceType, setRecurrenceType] = useState<'weekly' | 'monthly'>('weekly')
  const [dayOfWeek, setDayOfWeek] = useState<number>(1)
  const [intervalWeeks, setIntervalWeeks] = useState<number>(1)
  const [customInterval, setCustomInterval] = useState<string>('')   // for custom week/month input
  const [dayOfMonth, setDayOfMonth] = useState<number>(1)
  const [intervalMonths, setIntervalMonths] = useState<number>(1)
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')
  const [note, setNote] = useState('')
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTimeRangeMode, setIsTimeRangeMode] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [editingPrice, setEditingPrice] = useState<number | null>(null)
  const [editingDuration, setEditingDuration] = useState<number | null>(null)

  // ── computed values ──────────────────────────────────────────────────────────
  const pricePerVisit = useMemo(
    () => selectedServices.reduce((sum, s) => sum + (parseFloat(s.customPrice) || 0), 0),
    [selectedServices]
  )
  const durationPerVisit = useMemo(
    () => selectedServices.reduce((sum, s) => sum + (s.customDuration || 0), 0),
    [selectedServices]
  )
  const visitsPerYear = recurrenceType === 'monthly'
    ? Math.round(12 / intervalMonths)
    : Math.round(52 / intervalWeeks)
  const revenuePerYear = pricePerVisit * visitsPerYear

  // forecast: next 16 upcoming dates
  const forecastDates = useMemo(
    () => recurrenceType === 'monthly'
      ? buildMonthlyForecast(startingDate, dayOfMonth, intervalMonths, 16)
      : buildWeeklyForecast(startingDate, dayOfWeek, intervalWeeks, 16),
    [startingDate, recurrenceType, dayOfWeek, intervalWeeks, dayOfMonth, intervalMonths]
  )

  // original price per visit (from when modal opened) for change indicator
  const [originalPricePerVisit, setOriginalPricePerVisit] = useState(0)

  // ── effects ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      fetchServices()
      fetchUsers()
      setActiveTab('details')
      if (subscription) {
        setSubscriptionTitle(subscription.title || '')
        setStartingDate(subscription.starting_date?.split('T')[0] || subscription.next_occurrence_date?.split('T')[0] || '')
        const rt = subscription.recurrence_type === 'monthly' ? 'monthly' : 'weekly'
        setRecurrenceType(rt)
        setDayOfWeek(subscription.day_of_week ?? 1)
        setIntervalWeeks(subscription.interval_weeks || subscription.interval_value || 1)
        setDayOfMonth(subscription.day_of_month || 1)
        setIntervalMonths(subscription.recurrence_type === 'monthly' ? (subscription.interval_value || 1) : 1)
        setCustomInterval('')
        setTimeFrom(subscription.scheduled_time_from || '')
        setTimeTo(subscription.scheduled_time_to || '')
        setNote(subscription.note || '')
        setSelectedUserId(subscription.assigned_user_id ? Number(subscription.assigned_user_id) : null)
        setIsTimeRangeMode(!!(subscription.scheduled_time_from && subscription.scheduled_time_to))
        if (subscription.services) {
          const mapped = subscription.services.map((s: any) => ({
            id: s.service_id,
            title: s.title || '',
            price: s.custom_price || 0,
            duration_minutes: s.custom_duration_minutes || 0,
            customPrice: (s.custom_price || 0).toString(),
            customDuration: s.custom_duration_minutes || 0,
          }))
          setSelectedServices(mapped)
          setOriginalPricePerVisit(mapped.reduce((sum: number, s: SelectedService) => sum + (parseFloat(s.customPrice) || 0), 0))
        }
        // fetch past jobs for this subscription
        if (subscription.id) fetchExistingJobs(subscription.id)
      } else {
        resetForm()
      }
    }
  }, [isOpen, subscription])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Element
      if (!t.closest('.dropdown-container') && !t.closest('[data-time-picker]')) {
        setShowServiceDropdown(false)
        setShowTimePicker(false)
        setShowUserDropdown(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [isOpen])

  const resetForm = () => {
    setSubscriptionTitle('')
    setStartingDate('')
    setRecurrenceType('weekly')
    setDayOfWeek(1)
    setIntervalWeeks(1)
    setCustomInterval('')
    setDayOfMonth(1)
    setIntervalMonths(1)
    setTimeFrom('')
    setTimeTo('')
    setIsTimeRangeMode(false)
    setNote('')
    setShowNoteInput(false)
    setSelectedServices([])
    setSelectedUserId(null)
    setServiceSearch('')
    setExistingJobs([])
    setOriginalPricePerVisit(0)
  }

  const fetchServices = async () => {
    const token = localStorage.getItem('token')
    const res = await fetch(apiUrl('/services'), { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (res.ok) setServices(data.services || [])
  }

  const fetchUsers = async () => {
    const token = localStorage.getItem('token')
    const res = await fetch(apiUrl('/users'), { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (res.ok) setUsers(data.users || [])
  }

  const fetchExistingJobs = async (subscriptionId: number) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/subscriptions/${subscriptionId}/jobs`), { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (res.ok) setExistingJobs(data.jobs || [])
    } catch {}
  }

  // ── service helpers ──────────────────────────────────────────────────────────
  const filteredServices = services.filter(s =>
    s.title.toLowerCase().includes(serviceSearch.toLowerCase()) &&
    !selectedServices.find(sel => sel.id === s.id)
  )

  const addService = (service: Service) => {
    setSelectedServices(prev => [...prev, { ...service, customPrice: service.price.toString(), customDuration: service.duration_minutes }])
    setServiceSearch('')
    setShowServiceDropdown(false)
  }

  const removeService = (id: number) => setSelectedServices(prev => prev.filter(s => s.id !== id))

  const finishEditingPrice = (id: number, val: string) => {
    setSelectedServices(prev => prev.map(s => s.id === id ? { ...s, customPrice: val } : s))
    setEditingPrice(null)
  }

  const finishEditingDuration = (id: number, val: string) => {
    setSelectedServices(prev => prev.map(s => s.id === id ? { ...s, customDuration: parseInt(val) || 0 } : s))
    setEditingDuration(null)
  }

  // ── submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!subscriptionTitle.trim() || !startingDate || selectedServices.length === 0) return
    try {
      setIsSubmitting(true)
      const token = localStorage.getItem('token')
      const body = {
        title: subscriptionTitle.trim(),
        client_id: clientId,
        assigned_user_id: selectedUserId || null,
        services: selectedServices.map(s => ({
          service_id: s.id,
          custom_price: parseFloat(s.customPrice) || s.price,
          custom_duration: s.customDuration,
        })),
        starting_date: startingDate || null,
        recurrence_type: recurrenceType,
        day_of_week: recurrenceType === 'weekly' ? dayOfWeek : new Date(startingDate).getDay(),
        day_of_month: recurrenceType === 'monthly' ? dayOfMonth : null,
        interval_value: recurrenceType === 'monthly' ? intervalMonths : intervalWeeks,
        // also send interval_weeks for backwards compat with PUT handler
        interval_weeks: recurrenceType === 'weekly' ? intervalWeeks : null,
        scheduled_time_from: timeFrom || null,
        scheduled_time_to: timeTo || null,
        note: note.trim() || null,
      }
      const url = subscription ? apiUrl(`/subscriptions/${subscription.id}`) : apiUrl('/subscriptions')
      const method = subscription ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) { onSubscriptionCreated?.(); onClose() }
      else alert(data.error || t('app.subscription.errSave'))
    } catch { alert(t('app.subscription.errSave')) }
    finally { setIsSubmitting(false) }
  }

  if (!isOpen) return null

  const selectedUser = users.find(u => u.id === selectedUserId) ?? null
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const weekSubtitlePhrase =
    intervalWeeks === 1
      ? t('app.subscription.subtitleEveryWeek')
      : t('app.subscription.subtitleEveryNWeeks').replace('{{n}}', String(intervalWeeks))
  const headerSubtitle = subscription
    ? `${subscriptionTitle || subscription.title} · ${DAY_NAMES[dayOfWeek]} ${weekSubtitlePhrase}`
    : t('app.subscription.subtitleNew')

  // categorise existing jobs as past/completed vs upcoming
  const pastJobs = existingJobs
    .filter(j => j.status === 'completed' || (j.scheduled_date && new Date(j.scheduled_date) < today))
    .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime())
    .slice(0, 5) // last 5

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-backdrop-in" onClick={onClose} />

      {/* Bottom sheet on mobile, centered card on tablet/desktop. Animations
          differ per breakpoint so the surface always slides from the side that
          makes sense for the form factor. */}
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-2xl w-full max-h-[92vh] sm:max-h-[98vh] sm:min-h-[660px] flex flex-col overflow-hidden border border-gray-200 transform transition-all duration-300 ease-out animate-sheet-in-bottom sm:animate-slideDown pb-safe">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-white to-primary-50/30">
          <div>
            <h2 className="text-2xl font-bold text-primary-800 tracking-tight">
              {subscription ? t('app.subscription.titleEdit') : t('app.subscription.titleCreate')}
            </h2>
            <p className="text-sm text-gray-500 font-medium mt-0.5">
              {headerSubtitle}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="w-10 h-10 bg-white rounded-xl flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm border border-gray-200 hover:border-gray-300 hover:shadow-md group"
            >
              <XMarkIcon className="w-5 h-5 text-gray-500 group-hover:text-gray-700 transition-colors" />
            </button>
          </div>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-gray-100 bg-white">
          {([
            { id: 'details' as const, label: t('app.subscription.tabDetails'), icon: DocumentTextIcon },
            { id: 'schedule' as const, label: t('app.subscription.tabSchedule'), icon: CalendarDaysIcon },
            { id: 'forecast' as const, label: t('app.subscription.tabForecast'), icon: ArrowTrendingUpIcon },
          ]).map(tab => (
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

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-white to-gray-50/50">

          {/* ──────────── DETAILS TAB ──────────── */}
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
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                />
              </div>

              {/* Services */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-primary-700">{t('app.subscription.servicesLabel')}</label>
                <div className="relative dropdown-container">
                  <input
                    type="text"
                    value={serviceSearch}
                    onChange={e => { setServiceSearch(e.target.value); setShowServiceDropdown(true) }}
                    onFocus={() => setShowServiceDropdown(true)}
                    placeholder="Search services to add…"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                  />
                  {showServiceDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 max-h-56 overflow-y-auto">
                      {filteredServices.length > 0 ? filteredServices.map(s => (
                        <button key={s.id} onClick={() => addService(s)}
                          className="w-full px-4 py-3 text-left hover:bg-accent-50/50 border-b border-gray-100 last:border-b-0 transition-colors">
                          <div className="text-sm font-semibold text-primary-800">{s.title}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{formatMoney(Number(s.price) || 0, companyCountryCode)} · {s.duration_minutes} min</div>
                        </button>
                      )) : (
                        <div className="px-4 py-3 text-sm text-gray-400">{t('app.subscription.noServicesFound')}</div>
                      )}
                    </div>
                  )}
                </div>

                {selectedServices.map(service => (
                  <div key={service.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-white to-accent-50/20 rounded-xl border border-accent-200/30 shadow-sm hover:shadow-md transition-all duration-200 group">
                    <div className="text-sm font-semibold text-primary-800 flex-1 min-w-0 truncate">{service.title}</div>
                    <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                      <div className="flex items-center gap-1.5 bg-white/60 px-2.5 py-1 rounded-lg border border-gray-200/50">
                        <span className="text-xs text-gray-500">Price:</span>
                        {editingPrice === service.id ? (
                          <input autoFocus type="number" defaultValue={service.customPrice}
                            onBlur={e => finishEditingPrice(service.id, e.target.value)}
                            onKeyPress={e => e.key === 'Enter' && finishEditingPrice(service.id, e.currentTarget.value)}
                            className="text-xs text-accent-600 bg-white border border-accent-400 rounded px-1.5 py-0.5 w-16 focus:outline-none"
                          />
                        ) : (
                          <button onClick={() => setEditingPrice(service.id)}
                            className="text-xs font-semibold text-accent-600 hover:text-accent-700 underline decoration-1 underline-offset-2">
                            {service.customPrice}kr.
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 bg-white/60 px-2.5 py-1 rounded-lg border border-gray-200/50">
                        <span className="text-xs text-gray-500">{t('app.subscription.time')}</span>
                        {editingDuration === service.id ? (
                          <input autoFocus type="number" defaultValue={service.customDuration}
                            onBlur={e => finishEditingDuration(service.id, e.target.value)}
                            onKeyPress={e => e.key === 'Enter' && finishEditingDuration(service.id, e.currentTarget.value)}
                            className="text-xs text-accent-600 bg-white border border-accent-400 rounded px-1.5 py-0.5 w-14 focus:outline-none"
                          />
                        ) : (
                          <button onClick={() => setEditingDuration(service.id)}
                            className="text-xs font-semibold text-accent-600 hover:text-accent-700 underline decoration-1 underline-offset-2">
                            {service.customDuration}min.
                          </button>
                        )}
                      </div>
                      <button onClick={() => removeService(service.id)}
                        className="text-gray-400 hover:text-red-600 transition-all p-1.5 rounded-lg hover:bg-red-50">
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Chips: employee / time / note */}
              {selectedServices.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {/* Employee */}
                  <div className="relative dropdown-container">
                    <button type="button"
                      onClick={() => setShowUserDropdown(v => !v)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600 hover:text-primary-800 hover:border-accent-300 hover:bg-accent-50/30 shadow-sm hover:shadow-md transition-all duration-200 hover:scale-[1.02]">
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
                          <span>{t('app.subscription.assignEmployee')}</span>
                          <PlusIcon className="w-3 h-3 text-gray-400" />
                        </>
                      )}
                    </button>
                    {showUserDropdown && !selectedUserId && (
                      <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 max-h-48 overflow-y-auto">
                        {users.map(u => (
                          <button key={u.id} onClick={() => { setSelectedUserId(u.id); setShowUserDropdown(false) }}
                            className="w-full px-4 py-3 text-left hover:bg-accent-50/50 border-b border-gray-100 last:border-b-0 flex items-center gap-3 transition-colors">
                            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                              {(u.first_name[0] || '') + (u.last_name[0] || '')}
                            </span>
                            <div>
                              <div className="text-sm font-semibold text-primary-800">{u.first_name} {u.last_name}</div>
                              <div className="text-xs text-gray-400 capitalize">{u.role}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Time */}
                  <div className="relative">
                    <button type="button" onClick={() => setShowTimePicker(v => !v)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600 hover:text-primary-800 hover:border-accent-300 hover:bg-accent-50/30 shadow-sm hover:shadow-md transition-all duration-200 hover:scale-[1.02]">
                      <ClockIcon className="w-4 h-4 text-gray-400" />
                      {timeFrom
                        ? <span>{timeFrom}{timeTo ? ` – ${timeTo}` : ''}</span>
                        : <><span>Add time</span><PlusIcon className="w-3 h-3 text-gray-400" /></>
                      }
                    </button>
                    {showTimePicker && (
                      <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 p-4 w-72" data-time-picker>
                        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
                          {[false, true].map(range => (
                            <button key={String(range)} type="button"
                              onClick={() => { setIsTimeRangeMode(range); if (!range) setTimeTo('') }}
                              className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${isTimeRangeMode === range ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                              {range ? t('app.subscription.timeRange') : t('app.subscription.singleTime')}
                            </button>
                          ))}
                        </div>
                        <div className="space-y-3">
                          <TimePicker label={isTimeRangeMode ? 'From' : 'Time'} value={timeFrom} onChange={setTimeFrom} placeholder="09:00" />
                          {isTimeRangeMode && <TimePicker label="To" value={timeTo} onChange={setTimeTo} disabled={!timeFrom} placeholder="17:00" />}
                        </div>
                        <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                          <button type="button" onClick={() => { setTimeFrom(''); setTimeTo(''); setShowTimePicker(false) }}
                            className="flex-1 py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors">{t('app.subscription.clear')}</button>
                          <button type="button" onClick={() => setShowTimePicker(false)}
                            className="flex-1 py-2 bg-primary-500 text-white text-xs font-medium rounded-lg hover:bg-primary-600 transition-colors">{t('app.subscription.done')}</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Note */}
                  <button type="button" onClick={() => setShowNoteInput(v => !v)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600 hover:text-primary-800 hover:border-accent-300 hover:bg-accent-50/30 shadow-sm hover:shadow-md transition-all duration-200 hover:scale-[1.02]">
                    <DocumentTextIcon className="w-4 h-4 text-gray-400" />
                    {note.trim() ? <span className="max-w-[120px] truncate">{note}</span> : <><span>{t('app.subscription.addNote')}</span><PlusIcon className="w-3 h-3 text-gray-400" /></>}
                  </button>
                </div>
              )}

              {showNoteInput && (
                <div className="space-y-2">
                  <textarea value={note} onChange={e => setNote(e.target.value)}
                    placeholder={t('app.subscription.notePlaceholder')}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all text-sm resize-none bg-white shadow-sm"
                    rows={3}
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setNote(''); setShowNoteInput(false) }}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">{t('app.subscription.clearNote')}</button>
                    <button type="button" onClick={() => setShowNoteInput(false)}
                      className="px-4 py-1.5 bg-primary-500 text-white text-xs font-medium rounded-lg hover:bg-primary-600 transition-colors">{t('app.subscription.saveNote')}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ──────────── SCHEDULE TAB ──────────── */}
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
                countryCode={companyCountryCode}
              />
            </div>
          )}

          {/* ──────────── FORECAST TAB ──────────── */}
          {activeTab === 'forecast' && (
            <div className="p-6">
              <ForecastPanel
                forecastDates={forecastDates}
                pastJobs={pastJobs}
                pricePerVisit={pricePerVisit}
                durationPerVisit={durationPerVisit}
                visitsPerYear={visitsPerYear}
                revenuePerYear={revenuePerYear}
                originalPricePerVisit={originalPricePerVisit}
                subscriptionTitle={subscriptionTitle}
                selectedUser={selectedUser}
                timeFrom={timeFrom}
                timeTo={timeTo}
                countryCode={companyCountryCode}
              />
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="border-t border-gray-100 px-6 py-4 bg-white flex items-center justify-between gap-3">
          <div className="text-xs text-gray-400">
            {selectedServices.length > 0 && startingDate
              ? `${fmtMoney(pricePerVisit, companyCountryCode)} ${t('app.subscription.perVisit')} · ${fmtMoney(revenuePerYear, companyCountryCode)} ${t('app.subscription.perYear')}`
              : ''
            }
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              {t('app.subscription.cancel')}
            </button>
            <button onClick={handleSubmit}
              disabled={isSubmitting || !subscriptionTitle.trim() || !startingDate || selectedServices.length === 0}
              className="px-6 py-2.5 bg-accent-500 text-white text-sm font-semibold rounded-xl hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-accent-500/20 hover:shadow-lg hover:shadow-accent-500/30 hover:scale-[1.02] active:scale-[0.98]">
              {isSubmitting ? t('app.subscription.saving') : subscription ? t('app.subscription.saveChanges') : t('app.subscription.createSubscriptionBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
