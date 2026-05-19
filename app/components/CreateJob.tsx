'use client'

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { XMarkIcon, PlusIcon, UserIcon, ClockIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import { formatMoney } from '../config/countryRules'
import { useCompanyCountryCode } from '../hooks/useCompanyCountryCode'
import ConfirmModal from './ConfirmModal'
import AddClientInlineForm, { initialNewClientData } from './AddClientInlineForm'
import TimePicker from './TimePicker'
import { useAppI18n } from './I18nProvider'

// Calendar View Component
interface CalendarViewProps {
  selectedDate: string
  onDateSelect: (date: string) => void
  selectedUserId: number | null
  selectedServices: SelectedService[]
  selectedClient: Client | null
  jobType: 'new' | 'redo'
  selectedPastJob: PastJob | null
  locale: 'en' | 'da'
  t: (key: string, fallback?: string) => string
}

function CalendarView({ selectedDate, onDateSelect, selectedUserId, selectedServices, selectedClient, jobType, selectedPastJob, locale, t }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [userWorkHours, setUserWorkHours] = useState<any>(null)
  const [existingJobs, setExistingJobs] = useState<any[]>([])
  
  const today = new Date()
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  
  useEffect(() => {
    if (selectedUserId) {
      fetchUserWorkHours()
      fetchExistingJobs()
    } else {
      setUserWorkHours(null)
      setExistingJobs([])
    }
  }, [selectedUserId, currentMonth])
  
  const fetchUserWorkHours = async () => {
    if (!selectedUserId) return
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/work-hours/${selectedUserId}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok) {
        setUserWorkHours(data.workHours)
      }
    } catch (error) {
      console.error('Error fetching user work hours:', error)
    }
  }
  
  const fetchExistingJobs = async () => {
    if (!selectedUserId) return
    try {
      const token = localStorage.getItem('token')
      const startDate = new Date(year, month, 1).toISOString().split('T')[0]
      const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0]
      
      const response = await fetch(apiUrl(`/jobs?start_date=${startDate}&end_date=${endDate}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok) {
        const userJobs = data.jobs.filter((job: any) => job.assigned_user_id === selectedUserId)
        setExistingJobs(userJobs)
      }
    } catch (error) {
      console.error('Error fetching existing jobs:', error)
    }
  }
  
  const getTotalJobDuration = () => {
    if (jobType === 'redo' && selectedPastJob) {
      return selectedPastJob.total_duration || 0
    }
      return selectedServices.reduce((total, service) => {
        return total + (service.customDuration || service.duration_minutes)
      }, 0)
  }
  
  const getDayOfWeek = (date: Date) => date.getDay()
  
  const getWorkHoursForDay = (dayOfWeek: number) => {
    if (!userWorkHours) return 0
    const dayMap = {
      0: 'sunday_hours', 1: 'monday_hours', 2: 'tuesday_hours', 3: 'wednesday_hours',
      4: 'thursday_hours', 5: 'friday_hours', 6: 'saturday_hours'
    }
    return userWorkHours[dayMap[dayOfWeek as keyof typeof dayMap] || 'monday_hours'] || 0
  }
  
  const getJobsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return existingJobs.filter(job => {
      const jobDate = new Date(job.scheduled_date).toISOString().split('T')[0]
      return jobDate === dateStr
    })
  }
  
  const getExistingJobsDuration = (date: Date) => {
    return getJobsForDate(date).reduce((total, job) => total + (job.total_duration || 0), 0)
  }
  
  const isDateAvailable = (day: number) => {
    if (!selectedUserId) return false
    if (jobType === 'new' && selectedServices.length === 0) return false
    if (jobType === 'redo' && !selectedPastJob) return false
    
    const date = new Date(year, month, day)
    const workHours = getWorkHoursForDay(getDayOfWeek(date))
    const workMinutes = workHours * 60
    const existingJobsMinutes = getExistingJobsDuration(date)
    const newJobMinutes = getTotalJobDuration()
    
    return (workMinutes - existingJobsMinutes) >= newJobMinutes
  }
  
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingDayOfWeek = firstDay.getDay()
  
  const days = []
  for (let i = 0; i < startingDayOfWeek; i++) days.push(null)
  for (let day = 1; day <= daysInMonth; day++) days.push(day)
  
  const dateLocale = locale === 'da' ? 'da-DK' : 'en-US'
  
  const handleDateClick = (day: number) => {
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    onDateSelect(dateString)
  }
  
  const isSelected = (day: number) => {
    if (!selectedDate) return false
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return dateString === selectedDate
  }
  
  const isToday = (day: number) => {
    const date = new Date(year, month, day)
    return date.toDateString() === today.toDateString()
  }
  
  const isPast = (day: number) => {
    const date = new Date(year, month, day)
    return date < today
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="text-lg font-medium text-gray-900">{new Date(year, month, 1).toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' })}</h3>
        <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      
      <div className="grid grid-cols-7 gap-1">
        {[0, 1, 2, 3, 4, 5, 6].map((day) => (
          <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">{new Date(2024, 0, day + 7).toLocaleDateString(dateLocale, { weekday: 'short' })}</div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => (
          <div key={index} className="aspect-square">
            {day ? (
              <button
                onClick={() => handleDateClick(day)}
                className={`w-full h-full text-xs rounded transition-colors ${
                  isSelected(day) ? 'bg-blue-600 text-white font-semibold'
                  : isToday(day) ? 'bg-blue-100 text-blue-600 font-semibold'
                  : isPast(day) ? 'text-gray-300 cursor-not-allowed'
                  : isDateAvailable(day) ? 'bg-green-100 text-green-700 hover:bg-green-200 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                disabled={isPast(day)}
                title={isDateAvailable(day) 
                    ? `Available: ${getWorkHoursForDay(getDayOfWeek(new Date(year, month, day)))}h - ${getExistingJobsDuration(new Date(year, month, day)) / 60}h used = ${(getWorkHoursForDay(getDayOfWeek(new Date(year, month, day))) * 60 - getExistingJobsDuration(new Date(year, month, day))) / 60}h remaining`
                    : selectedUserId && ((jobType === 'new' && selectedServices.length > 0) || (jobType === 'redo' && selectedPastJob))
                    ? `Not enough time: Need ${getTotalJobDuration() / 60}h, have ${(getWorkHoursForDay(getDayOfWeek(new Date(year, month, day))) * 60 - getExistingJobsDuration(new Date(year, month, day))) / 60}h available`
                    : ''
                }
              >
                {day}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      
      {selectedDate && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <div className="flex items-center space-x-2 mb-3">
            <div className="w-4 h-4 bg-blue-100 rounded flex items-center justify-center">
              <span className="text-xs text-blue-600">📋</span>
            </div>
            <h4 className="text-sm font-medium text-gray-700">
              Jobs for {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </h4>
          </div>
          
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {getJobsForDate(new Date(selectedDate)).map((job) => (
              <div key={job.id} className={`flex items-center justify-between p-2 rounded-lg border ${
                job.status === 'cancelled'
                  ? 'bg-gray-100 border-gray-300 opacity-60'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-medium truncate ${
                    job.status === 'cancelled' ? 'text-gray-600' : 'text-gray-900'
                  }`}>
                    {job.name}{job.last_name ? ` ${job.last_name}` : ''}
                    {job.status === 'cancelled' && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                        {t('app.jobsPage.cancelled', 'Cancelled')}
                      </span>
                    )}
                  </div>
                  <div className={`text-xs truncate ${
                    job.status === 'cancelled' ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    {job.personal_address ? `${job.personal_address}, ${job.personal_city}` : t('app.createJob.noAddress', 'No address')}
                  </div>
                </div>
                <div className={`text-xs font-medium ml-2 ${
                  job.status === 'cancelled' ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {Math.round(job.total_duration / 60)}h
                </div>
              </div>
            ))}
            
            {selectedUserId && selectedClient && ((jobType === 'new' && selectedServices.length > 0) || (jobType === 'redo' && selectedPastJob)) && (
              <div className="flex items-center justify-between p-2 bg-blue-50 rounded-lg border-2 border-blue-200 border-dashed">
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-blue-900 truncate">
                      {selectedClient.name}{selectedClient.last_name ? ` ${selectedClient.last_name}` : ''}
                    </div>
                    <div className="text-xs text-blue-600 truncate">
                      {selectedClient.address ? `${selectedClient.address}${selectedClient.city ? `, ${selectedClient.city}` : ''}` : t('app.createJob.noAddress', 'No address')}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-blue-700 font-medium ml-2">{Math.round(getTotalJobDuration() / 60)}h</div>
              </div>
            )}
            
            {getJobsForDate(new Date(selectedDate)).length === 0 && (!selectedUserId || !selectedClient || 
              (jobType === 'new' && selectedServices.length === 0) || (jobType === 'redo' && !selectedPastJob)) && (
              <div className="text-xs text-gray-500 text-center py-2">{t('app.createJob.noJobsThisDate', 'No jobs scheduled for this date')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

type ClientStandardNoteRow = { id: number; note: string }

function ClientStandardNotesPicker({
  clientId,
  loading,
  error,
  notes,
  onUse,
  t,
}: {
  clientId: number | null | undefined
  loading: boolean
  error: string | null
  notes: ClientStandardNoteRow[]
  onUse: (text: string) => void
  t: (key: string, fallback?: string) => string
}) {
  if (clientId == null || clientId < 1) return null
  return (
    <div className="pt-3 mt-3 border-t border-gray-100">
      <div className="text-xs font-semibold text-primary-700 mb-2">
        {t('app.createJob.clientStandardNotesHeading', 'From client standard notes')}
      </div>
      <p className="text-[11px] text-gray-500 mb-2">
        {t(
          'app.createJob.clientStandardNotesHint',
          'Encrypted notes from the client profile. Tap one to add it to this job note.',
        )}
      </p>
      {loading ? (
        <div className="text-xs text-gray-400 py-2">{t('app.createJob.clientStandardNotesLoading', 'Loading…')}</div>
      ) : error ? (
        <div className="text-xs text-red-600 py-1">{error}</div>
      ) : notes.length === 0 ? (
        <div className="text-xs text-gray-400 py-1">
          {t('app.createJob.noClientStandardNotes', 'No standard notes saved for this client yet.')}
        </div>
      ) : (
        <div className="max-h-44 overflow-y-auto space-y-2 pr-0.5">
          {notes.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => onUse(row.note)}
              className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-200 bg-white hover:border-accent-300 hover:bg-accent-50/40 text-sm text-gray-800 transition-colors shadow-sm"
            >
              <span className="line-clamp-3 whitespace-pre-wrap block">{row.note}</span>
              <span className="mt-1.5 block text-xs font-semibold text-accent-600">
                {t('app.createJob.useClientStandardNote', 'Add to job note')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface Service {
  id: number
  title: string
  price: number
  duration_minutes: number
}

interface Client {
  id: number
  client_type?: 'person' | 'company'
  name: string
  last_name?: string | null
  company_number?: string
  address?: string
  zip_code?: string
  city?: string
  email?: string
  phone?: string
  personal_city?: string
  personal_email?: string
  personal_phone?: string
}

interface PastJob {
  id: number
  title: string
  scheduled_date: string
  status: string
  service_count?: number
  total_duration?: number
  total_price?: number
  services?: Array<{
    service_id: number
    custom_price: number
    custom_duration_minutes: number
    title: string
    price: number
    duration_minutes: number
  }>
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
  isCustom?: boolean
  customTitle?: string
}

interface CreateJobProps {
  isOpen: boolean
  onClose: () => void
  onJobCreated?: () => void
  initialDate?: string
  initialAssignedUserId?: number | null
  mode?: 'job' | 'subscription'
  initialClientId?: number
  lockClient?: boolean
}

export default function CreateJob({ isOpen, onClose, onJobCreated, initialDate, initialAssignedUserId, mode = 'job', initialClientId, lockClient = false }: CreateJobProps) {
  const { t, locale } = useAppI18n()
  const companyCountryCode = useCompanyCountryCode()
  const [services, setServices] = useState<Service[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [isEditingClient, setIsEditingClient] = useState(false)
  const [editingClientData, setEditingClientData] = useState({
    client_type: 'person' as 'person' | 'company',
    name: '',
    last_name: '',
    company_number: '',
    address: '',
    zip_code: '',
    city: '',
    email: '',
    phone: ''
  })
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [showServiceDropdown, setShowServiceDropdown] = useState(false)
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [serviceSearch, setServiceSearch] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [pendingTimeFrom, setPendingTimeFrom] = useState('')
  const [pendingTimeTo, setPendingTimeTo] = useState('')
  const [isTimeRangeMode, setIsTimeRangeMode] = useState(false)
  const [jobDate, setJobDate] = useState('')
  const [jobTimeFrom, setJobTimeFrom] = useState('')
  const [jobTimeTo, setJobTimeTo] = useState('')
  const [jobNote, setJobNote] = useState('')
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [clientStandardNotes, setClientStandardNotes] = useState<ClientStandardNoteRow[]>([])
  const [clientStandardNotesLoading, setClientStandardNotesLoading] = useState(false)
  const [clientStandardNotesError, setClientStandardNotesError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdJobId, setCreatedJobId] = useState<number | null>(null)

  // Refs and portal positions for job-only dropdowns (so they escape overflow-hidden)
  const clientDropdownTriggerRef = useRef<HTMLDivElement>(null)
  const serviceDropdownTriggerRef = useRef<HTMLDivElement>(null)
  const userDropdownTriggerRef = useRef<HTMLDivElement>(null)
  const [clientDropdownRect, setClientDropdownRect] = useState<DOMRect | null>(null)
  const [serviceDropdownRect, setServiceDropdownRect] = useState<DOMRect | null>(null)
  const [userDropdownRect, setUserDropdownRect] = useState<DOMRect | null>(null)

  // Subscription state
  const [recurrenceType, setRecurrenceType] = useState<'weekly' | 'monthly'>('weekly')
  const [dayOfWeek, setDayOfWeek] = useState<number>(1) // Monday
  const [dayOfMonth, setDayOfMonth] = useState<number>(1)
  const [intervalValue, setIntervalValue] = useState<number>(1)
  const [expandedSections, setExpandedSections] = useState({ client: true, job: false, schedule: false, recurring: false })
  const [jobType, setJobType] = useState<'new' | 'redo'>('new')
  const [editingPrice, setEditingPrice] = useState<number | null>(null)
  const [editingDuration, setEditingDuration] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState<number | null>(null)
  const [pastJobs, setPastJobs] = useState<PastJob[]>([])
  const [selectedPastJob, setSelectedPastJob] = useState<PastJob | null>(null)
  const [isAddingNewClient, setIsAddingNewClient] = useState(false)
  const [newClientData, setNewClientData] = useState({
    client_type: 'person' as 'person' | 'company',
    name: '',
    last_name: '',
    company_number: '',
    address: '',
    zip_code: '',
    city: '',
    email: '',
    phone: ''
  })
  
  const toggleSection = (section: 'client' | 'job' | 'schedule' | 'recurring') => {
    setExpandedSections(prev => {
      // Only allow one section open at a time
      const newState = { client: false, job: false, schedule: false, recurring: false }
      // If clicking the currently open section, close it. Otherwise, open the clicked section
      newState[section] = !prev[section]
      return newState
    })
  }
  
  // Auto-close client section and open job section only when an existing client is selected (not when adding new)
  useEffect(() => {
    if (selectedClient && !isAddingNewClient && expandedSections.client) {
      setExpandedSections({ client: false, job: true, schedule: false, recurring: false })
    }
  }, [selectedClient])

  // Set initial state based on mode
  useEffect(() => {
    if (mode === 'subscription') {
      setExpandedSections({ client: true, job: false, schedule: false, recurring: false })
    } else {
      setExpandedSections({ client: true, job: false, schedule: false, recurring: false })
    }
  }, [mode])
  
  // Don't auto-close job section when services are added - user may want to add more
  
  useEffect(() => {
    if (isOpen) {
      fetchServices()
      fetchClients()
      fetchUsers()
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      // Prefill date/user when provided (e.g. when opened from the calendar column "Add job")
      setJobDate(initialDate ? String(initialDate).split('T')[0] : (mode === 'job' ? new Date().toISOString().split('T')[0] : ''))
      setJobTimeFrom('')
      setJobTimeTo('')
      setJobNote('')
      setShowNoteInput(false)
      setSelectedServices([])
      setSelectedClient(null) // will be overridden by fetchClients if initialClientId is set
      setSelectedUserId(typeof initialAssignedUserId === 'number' ? initialAssignedUserId : null)
      setServiceSearch('')
      setClientSearch('')
      setCreatedJobId(null)
      setExpandedSections(initialClientId
        ? { client: false, job: true, schedule: false, recurring: false }
        : { client: true, job: false, schedule: false, recurring: false })
      setJobType('new')
      setSelectedPastJob(null)
      setEditingPrice(null)
      setEditingDuration(null)
      setIsAddingNewClient(false)
      setNewClientData({
        client_type: 'person',
        name: '',
        last_name: '',
        company_number: '',
        address: '',
        zip_code: '',
        city: '',
        email: '',
        phone: ''
      })
    }
  }, [isOpen, initialDate, initialAssignedUserId])

  
  useEffect(() => {
    if (selectedClient && jobType === 'redo') {
      fetchPastJobs(selectedClient.id)
    } else {
      setPastJobs([])
      setSelectedPastJob(null)
    }
  }, [selectedClient, jobType])

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('.dropdown-container') && !target.closest('[data-time-picker]')) {
        setShowServiceDropdown(false)
        setShowClientDropdown(false)
        setShowUserDropdown(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Measure dropdown trigger rects for portaling (job-only) so dropdowns escape overflow-hidden
  useLayoutEffect(() => {
    if (!showClientDropdown || !clientDropdownTriggerRef.current) {
      setClientDropdownRect(null)
      return
    }
    const el = clientDropdownTriggerRef.current
    const update = () => setClientDropdownRect(el.getBoundingClientRect())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [showClientDropdown])
  useLayoutEffect(() => {
    if (!showServiceDropdown || !serviceDropdownTriggerRef.current) {
      setServiceDropdownRect(null)
      return
    }
    const el = serviceDropdownTriggerRef.current
    const update = () => setServiceDropdownRect(el.getBoundingClientRect())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [showServiceDropdown])
  useLayoutEffect(() => {
    if (!showUserDropdown || selectedUserId || !userDropdownTriggerRef.current) {
      setUserDropdownRect(null)
      return
    }
    const el = userDropdownTriggerRef.current
    const update = () => setUserDropdownRect(el.getBoundingClientRect())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [showUserDropdown, selectedUserId])

  const fetchServices = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl('/services'), {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok) setServices(data.services || [])
    } catch (error) {
      console.error('Error fetching services:', error)
    }
  }

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl('/clients'), {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok) {
        const fetched: Client[] = data.clients || []
        setClients(fetched)
        if (initialClientId) {
          const match = fetched.find(c => c.id === initialClientId)
          if (match) {
            setSelectedClient(match)
            setExpandedSections({ client: false, job: true, schedule: false, recurring: false })
          }
        }
      }
    } catch (error) {
      console.error('Error fetching clients:', error)
    }
  }

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl('/users'), {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok) {
        const fetchedUsers = data.users || []
        setUsers(fetchedUsers)
        if (fetchedUsers.length === 1) {
          // Only auto-select if we don't already have a prefilled/selected user
          setSelectedUserId((prev) => (prev ? prev : fetchedUsers[0].id))
        }
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const fetchPastJobs = async (clientId: number) => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/clients/${clientId}/jobs`), {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok) setPastJobs(data.jobs || [])
    } catch (error) {
      console.error('Error fetching past jobs:', error)
    }
  }

  const addService = (service: Service) => {
    setSelectedServices([...selectedServices, {
      ...service,
      customPrice: service.price.toString(),
      customDuration: service.duration_minutes
    }])
    setServiceSearch('')
    setShowServiceDropdown(false)
  }

  const removeService = (serviceId: number) => {
    setSelectedServices(selectedServices.filter(s => s.id !== serviceId))
  }

  const updateService = (serviceId: number, field: 'customPrice' | 'customDuration', value: string | number) => {
    setSelectedServices(selectedServices.map(s => 
      s.id === serviceId ? { ...s, [field]: value } : s
    ))
  }

  const applyClientStandardNote = (text: string) => {
    setJobNote((prev) => {
      const p = prev.trim()
      if (!p) return text
      return `${p}\n\n${text}`
    })
  }
  
  const handleSubmitJob = async () => {
    const hasValidServices = jobType === 'new' ? selectedServices.length > 0 : true
    if (!selectedUserId || !hasValidServices || (jobType === 'redo' && !selectedPastJob)) {
      return
    }
    
    // If adding new client, we need to validate the form
    if (isAddingNewClient && !newClientData.name.trim()) {
      return
    }
    
    // If not adding new client, we need a selected client
    if (!isAddingNewClient && !selectedClient) {
      return
    }
    
    try {
      setIsSubmitting(true)
      const token = localStorage.getItem('token')
      
      let clientId = selectedClient?.id
      
      // Create new client if in "add new client" mode OR selectedClient has temp id from "Save & Select Client"
      const needsClientCreation = isAddingNewClient || (selectedClient && (selectedClient.id === -1 || !selectedClient.id))
        if (needsClientCreation) {
        const dataToUse = isAddingNewClient ? newClientData : { ...newClientData, ...selectedClient }
        const clientResponse = await fetch(apiUrl('/clients'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            client_type: dataToUse.client_type,
            name: dataToUse.name,
            last_name: dataToUse.last_name || null,
            company_number: dataToUse.company_number || null,
            address: dataToUse.address || null,
            zip_code: dataToUse.zip_code || null,
            city: dataToUse.city || null,
            email: dataToUse.email || null,
            phone: dataToUse.phone || null
          })
        })
        
        const clientData = await clientResponse.json()
        
        if (!clientResponse.ok) {
          console.error('Error creating client:', clientData.error)
          alert(`Error creating client: ${clientData.error || 'Unknown error'}`)
      return
    }

        clientId = clientData.client.id
      }
      
      if (mode === 'subscription') {
        // Create subscription
        const subscriptionData = {
          title: '',
          client_id: clientId,
          assigned_user_id: selectedUserId,
          services: selectedServices.map(service => (
            service.isCustom
              ? {
                  custom_title: (service.customTitle && service.customTitle.trim().length > 0) ? service.customTitle : 'Custom task',
                  custom_price: parseFloat(service.customPrice) || 0,
                  custom_duration: service.customDuration || 0
                }
              : {
            service_id: service.id,
            custom_price: parseFloat(service.customPrice) || service.price,
            custom_duration: service.customDuration
                }
          )),
          starting_date: jobDate ? jobDate.split('T')[0] : null,
          recurrence_type: recurrenceType,
          day_of_week: recurrenceType === 'weekly' ? dayOfWeek : null,
          day_of_month: recurrenceType === 'monthly' ? dayOfMonth : null,
          interval_value: intervalValue,
          scheduled_time_from: jobTimeFrom && jobTimeFrom.trim() !== '' ? jobTimeFrom : null,
          scheduled_time_to: jobTimeTo && jobTimeTo.trim() !== '' ? jobTimeTo : null,
          note: jobNote.trim() || null
        }

        const response = await fetch(apiUrl('/subscriptions'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(subscriptionData)
        })

        const data = await response.json()

        if (response.ok) {
          onJobCreated?.()
          onClose()
        } else {
          console.error('Error creating subscription:', data.error)
          alert(`Error creating subscription: ${data.error || 'Unknown error'}`)
        }
      } else {
        // Create regular job
        const jobData = {
          title: '',
          client_id: clientId,
          assigned_user_id: selectedUserId,
          services: jobType === 'new' ? selectedServices.map(service => (
            service.isCustom
              ? {
                  custom_title: (service.customTitle && service.customTitle.trim().length > 0) ? service.customTitle : 'Custom task',
                  custom_price: parseFloat(service.customPrice) || 0,
                  custom_duration: service.customDuration || 0
                }
              : {
            service_id: service.id,
            custom_price: parseFloat(service.customPrice) || service.price,
            custom_duration: service.customDuration
                }
          )) : (selectedPastJob?.services?.map(service => ({
            service_id: service.service_id,
            custom_price: service.custom_price,
            custom_duration: service.custom_duration_minutes
          })) || []),
          scheduled_date: jobDate ? jobDate.split('T')[0] : null,
          scheduled_time_from: jobTimeFrom && jobTimeFrom.trim() !== '' ? jobTimeFrom : null,
          scheduled_time_to: jobTimeTo && jobTimeTo.trim() !== '' ? jobTimeTo : null,
          note: jobNote.trim() || null
        }

        const response = await fetch(apiUrl('/jobs'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(jobData)
        })

        const data = await response.json()

        if (response.ok) {
          setCreatedJobId(data.job.id)
          onJobCreated?.()
          onClose()
        } else {
          console.error('Error creating job:', data.error)
          alert(`Error creating job: ${data.error || 'Unknown error'}`)
        }
      }
    } catch (error) {
      console.error('Error creating job:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredServices = services.filter(service =>
    service.title.toLowerCase().includes(serviceSearch.toLowerCase())
  )

  const filteredClients = clients.filter(client => {
    const searchTerm = clientSearch.toLowerCase()
    const name = client.client_type === 'company'
      ? client.name
      : `${client.name}${client.last_name ? ` ${client.last_name}` : ''}`.trim()
    const address = client.address || ''

    return name.toLowerCase().includes(searchTerm) ||
           address.toLowerCase().includes(searchTerm) ||
           (client.email && client.email.toLowerCase().includes(searchTerm))
  })

  if (!isOpen) return null

  // Job-only: subscription-style single slide with date at bottom
  if (mode === 'job') {
    return (
      <>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4 animate-fadeIn" onClick={onClose}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-2xl w-full max-h-[92vh] sm:max-h-[98vh] sm:min-h-[660px] flex flex-col overflow-hidden animate-sheet-in-bottom sm:animate-slideDown pb-safe" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gradient-to-r from-white to-primary-50/30">
              <div className="space-y-0.5">
                <h2 className="text-2xl font-bold text-primary-800 tracking-tight">{t('app.jobs.create.title')}</h2>
                <p className="text-sm text-gray-500 font-medium">{t('app.createJob.subtitle', 'Schedule a one-time job')}</p>
              </div>
              <button onClick={onClose} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center hover:bg-gray-50 transition-all duration-200 ease-out shadow-sm border border-gray-200 hover:border-gray-300 hover:shadow-md group">
                <XMarkIcon className="w-5 h-5 text-gray-500 group-hover:text-gray-700 transition-colors" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-white to-gray-50/50">
              {/* Client */}
              <div className="space-y-4">
                <label className="block text-xs font-semibold text-primary-700 mb-2">{t('app.createJob.clientRequired', 'Client *')}</label>
                {selectedClient ? (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          {selectedClient.client_type === 'company' ? selectedClient.name : `${selectedClient.name}${selectedClient.last_name ? ` ${selectedClient.last_name}` : ''}`.trim()}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {selectedClient.address && selectedClient.city ? `${selectedClient.address}, ${selectedClient.city}` : 'No address'}
                        </div>
                      </div>
                      <button type="button" onClick={() => { setSelectedClient(null); setClientSearch('') }} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : isAddingNewClient ? (
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <AddClientInlineForm
                      data={newClientData}
                      onChange={setNewClientData}
                      onSave={() => {
                        if (newClientData.name.trim()) {
                          setSelectedClient({
                            id: -1,
                            name: newClientData.name,
                            last_name: newClientData.last_name,
                            client_type: newClientData.client_type
                          })
                          setIsAddingNewClient(false)
                        }
                      }}
                      onCancel={() => {
                        setIsAddingNewClient(false)
                        setNewClientData(initialNewClientData)
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <div className="relative dropdown-container" ref={clientDropdownTriggerRef}>
                      <input type="text" value={clientSearch} onChange={e => { setClientSearch(e.target.value); setShowClientDropdown(true) }} onFocus={() => setShowClientDropdown(true)} placeholder="Choose a client" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 text-sm bg-white shadow-sm hover:border-gray-300" />
                    </div>
                    {typeof document !== 'undefined' && showClientDropdown && clientDropdownRect && createPortal(
                      <div className="dropdown-container bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto" style={{ position: 'fixed', top: clientDropdownRect.bottom + 8, left: clientDropdownRect.left, width: clientDropdownRect.width, zIndex: 9999 }}>
                        {filteredClients.length > 0 ? filteredClients.map((client) => (
                          <button key={client.id} type="button" onClick={() => { setSelectedClient(client); setClientSearch(''); setShowClientDropdown(false) }} className="w-full px-4 py-3 text-left hover:bg-accent-50/50 border-b border-gray-100">
                            <div className="text-sm font-medium text-gray-900">{client.client_type === 'company' ? client.name : `${client.name}${client.last_name ? ` ${client.last_name}` : ''}`.trim()}</div>
                            <div className="text-xs text-gray-500">{client.address ? `${client.address}, ${client.city}` : 'No address'}</div>
                          </button>
                        )) : null}
                        <button type="button" onClick={() => { setIsAddingNewClient(true); setShowClientDropdown(false); setClientSearch('') }} className="w-full px-4 py-3 text-left hover:bg-accent-50 border-t border-gray-200 bg-gray-50 text-sm font-medium text-accent-600 flex items-center gap-2">
                          <PlusIcon className="w-4 h-4" /> Add new client
                        </button>
                      </div>,
                      document.body
                    )}
                  </>
                )}
              </div>
              {/* Services */}
              <div className="space-y-4">
                {!selectedClient && !isAddingNewClient ? <div className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg">{t('app.createJob.selectClientFirst', 'Select a client first')}</div> : (
                  <>
                    <label className="block text-xs font-semibold text-primary-700 mb-2">{t('app.createJob.servicesRequired', 'Services *')}</label>
                    <div className="relative dropdown-container" ref={serviceDropdownTriggerRef}>
                      <input type="text" value={serviceSearch} onChange={e => { setServiceSearch(e.target.value); setShowServiceDropdown(true) }} onFocus={() => setShowServiceDropdown(true)} placeholder={t('app.createJob.searchServices', 'Search for services...')} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 text-sm bg-white shadow-sm hover:border-gray-300" />
                    </div>
                    {typeof document !== 'undefined' && showServiceDropdown && serviceDropdownRect && createPortal(
                      <div className="dropdown-container bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto" style={{ position: 'fixed', top: serviceDropdownRect.bottom + 8, left: serviceDropdownRect.left, width: serviceDropdownRect.width, zIndex: 9999 }}>
                        {services.filter(s => s.title.toLowerCase().includes(serviceSearch.toLowerCase()) && !selectedServices.find(x => x.id === s.id)).map((service) => (
                          <button key={service.id} type="button" onClick={() => addService(service)} className="w-full px-4 py-3 text-left hover:bg-accent-50/50 border-b border-gray-100">
                            <div className="text-sm font-semibold text-primary-800">{service.title}</div>
                            <div className="text-xs text-gray-500">{formatMoney(Number(service.price) || 0, companyCountryCode)} · {service.duration_minutes} {t('app.createJob.minutesUnit', 'min')}</div>
                          </button>
                        ))}
                      </div>,
                      document.body
                    )}
                    {selectedServices.length > 0 && (
                      <div className="space-y-2">
                        {selectedServices.map((service) => (
                          <div key={service.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-white to-accent-50/20 rounded-xl border border-accent-200/30 shadow-sm">
                            <div className="text-sm font-semibold text-primary-800">{service.title}</div>
                            <div className="flex items-center gap-2">
                              <input type="number" value={typeof service.customPrice === 'string' ? service.customPrice : service.price} onChange={e => updateService(service.id, 'customPrice', e.target.value)} className="w-16 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-accent-500/20" />
                              <span className="text-xs text-gray-500">{t('app.createJob.currencyUnit', 'kr.')}</span>
                              <input type="number" value={service.customDuration ?? service.duration_minutes} onChange={e => updateService(service.id, 'customDuration', parseInt(e.target.value) || 0)} className="w-14 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-accent-500/20" />
                              <span className="text-xs text-gray-500">{t('app.createJob.minutesUnit', 'min')}</span>
                              <button type="button" onClick={() => removeService(service.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><XMarkIcon className="w-4 h-4" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  {/* Assign to User, Time, and Note - same place and time as subscription (flex wrap right after services) */}
                  {selectedServices.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <div className="relative dropdown-container" ref={userDropdownTriggerRef}>
                        {selectedUserId ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-accent-50 to-accent-50/50 border border-accent-200/60 rounded-full shadow-sm hover:shadow-md transition-all duration-200 group">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm ring-2 ring-white/50">
                                {users.find(u => u.id === selectedUserId)?.first_name?.[0]}{users.find(u => u.id === selectedUserId)?.last_name?.[0]}
                              </div>
                              <span className="text-sm font-semibold text-primary-800">
                                {users.find(u => u.id === selectedUserId)?.first_name} {users.find(u => u.id === selectedUserId)?.last_name}
                              </span>
                            </div>
                            {users.length > 1 && (
                              <button type="button" onClick={() => setSelectedUserId(null)} className="ml-1 p-0.5 rounded-full hover:bg-white/80 transition-all duration-150 group-hover:bg-white/60">
                                <XMarkIcon className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700 transition-colors" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowUserDropdown(!showUserDropdown)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600 hover:text-primary-800 hover:border-accent-300 hover:bg-accent-50/30 shadow-sm hover:shadow-md transition-all duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
                          >
                            <UserIcon className="w-4 h-4 text-gray-400 group-hover:text-accent-500" />
                            <span>{t('app.createJob.assignEmployee', 'Assign employee')}</span>
                            <PlusIcon className="w-3 h-3 text-gray-400 group-hover:text-accent-500" />
                          </button>
                        )}
                        {typeof document !== 'undefined' && showUserDropdown && !selectedUserId && userDropdownRect && createPortal(
                          <div className="dropdown-container bg-white border border-gray-200 rounded-2xl shadow-2xl min-w-[220px] max-h-60 overflow-y-auto animate-slideDown backdrop-blur-sm" style={{ position: 'fixed', top: userDropdownRect.bottom + 8, left: userDropdownRect.left, zIndex: 9999 }}>
                            {users.map((u) => (
                              <button key={u.id} type="button" onClick={() => { setSelectedUserId(u.id); setShowUserDropdown(false) }} className="w-full px-4 py-3 text-left hover:bg-accent-50/50 transition-all duration-150 ease-out flex items-center gap-3 group first:rounded-t-2xl last:rounded-b-2xl hover:pl-5">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm group-hover:shadow-md group-hover:scale-110 transition-all ring-2 ring-white/50">
                                  {u.first_name?.[0]}{u.last_name?.[0]}
                                </div>
                                <div className="text-sm font-semibold text-primary-800 group-hover:text-accent-600 transition-colors">{u.first_name} {u.last_name}</div>
                              </button>
                            ))}
                          </div>,
                          document.body
                        )}
                      </div>
                      <div className="relative">
                        {jobTimeFrom || jobTimeTo ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-accent-50 to-accent-50/50 border border-accent-200/60 rounded-full shadow-sm hover:shadow-md transition-all duration-200 group">
                            <div className="flex items-center gap-2">
                              <ClockIcon className="w-4 h-4 text-accent-600" />
                              <span className="text-sm font-semibold text-primary-800">
                                {jobTimeFrom && jobTimeTo ? `${jobTimeFrom} - ${jobTimeTo}` : jobTimeFrom ? jobTimeFrom : jobTimeTo ? jobTimeTo : ''}
                              </span>
                            </div>
                            <button type="button" onClick={() => { setJobTimeFrom(''); setJobTimeTo('') }} className="ml-1 p-0.5 rounded-full hover:bg-white/80 transition-all duration-150 group-hover:bg-white/60">
                              <XMarkIcon className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700 transition-colors" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setPendingTimeFrom(jobTimeFrom); setPendingTimeTo(jobTimeTo); setIsTimeRangeMode(!!jobTimeTo); setShowTimeModal(true) }}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600 hover:text-primary-800 hover:border-accent-300 hover:bg-accent-50/30 shadow-sm hover:shadow-md transition-all duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
                          >
                            <ClockIcon className="w-4 h-4 text-gray-400 group-hover:text-accent-500" />
                            <span>{t('app.createJob.addTime', 'Add time')}</span>
                            <PlusIcon className="w-3 h-3 text-gray-400 group-hover:text-accent-500" />
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        {jobNote.trim() ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-accent-50 to-accent-50/50 border border-accent-200/60 rounded-full shadow-sm hover:shadow-md transition-all duration-200 max-w-xs group">
                            <div className="flex items-center gap-2 min-w-0">
                              <DocumentTextIcon className="w-4 h-4 text-accent-600 flex-shrink-0" />
                              <span className="text-sm font-semibold text-primary-800 truncate">{jobNote.length > 20 ? `${jobNote.substring(0, 20)}...` : jobNote}</span>
                            </div>
                            <button type="button" onClick={() => { setJobNote(''); setShowNoteInput(false) }} className="ml-1 p-0.5 rounded-full hover:bg-white/80 transition-all duration-150 group-hover:bg-white/60 flex-shrink-0">
                              <XMarkIcon className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700 transition-colors" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowNoteInput(true)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600 hover:text-primary-800 hover:border-accent-300 hover:bg-accent-50/30 shadow-sm hover:shadow-md transition-all duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
                          >
                            <DocumentTextIcon className="w-4 h-4 text-gray-400 group-hover:text-accent-500" />
                            <span>{t('app.createJob.addNote', 'Add note')}</span>
                            <PlusIcon className="w-3 h-3 text-gray-400 group-hover:text-accent-500" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  </>
                )}
              </div>

              {/* Date selector - only difference from subscription: last step right after employee/time/note buttons; only when service picked */}
              {selectedServices.length > 0 && (
                <div className="space-y-2 pt-4">
                  <label className="block text-xs font-semibold text-primary-700 mb-2">{t('app.createJob.dateRequired', 'Date *')}</label>
                  <input type="date" value={jobDate ? String(jobDate).split('T')[0] : ''} onChange={e => setJobDate(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 text-sm bg-white shadow-sm hover:border-gray-300" />
                </div>
              )}

              <div className="flex justify-end pt-6 border-t border-gray-100">
                <button type="button" onClick={() => handleSubmitJob()} disabled={(!selectedClient && !isAddingNewClient) || selectedServices.length === 0 || !selectedUserId || !jobDate || isSubmitting} className="px-8 py-3 bg-accent-500 text-white text-sm font-semibold rounded-xl hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-accent-500/20">
                  {isSubmitting ? t('app.jobs.create.creating') : t('app.jobs.create.createJob')}
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* Time modal — portal so it escapes the backdrop's onClick and the card's CSS transform stacking context */}
        {typeof document !== 'undefined' && createPortal(
          <ConfirmModal isOpen={showTimeModal} onClose={() => setShowTimeModal(false)} onConfirm={() => { setJobTimeFrom(pendingTimeFrom); setJobTimeTo(isTimeRangeMode ? pendingTimeTo : ''); setShowTimeModal(false) }} title={t('app.createJob.setTime', 'Set Time')} description={t('app.createJob.setTimeDesc', 'Set the scheduled time for this job')} confirmLabel={t('app.createJob.saveTime', 'Save Time')}>
            <div className="space-y-3">
              <div className="flex items-center space-x-1 bg-gray-100 rounded p-0.5">
                <button type="button" onClick={() => { setIsTimeRangeMode(false); setPendingTimeTo('') }} className={`flex-1 py-1.5 px-2 text-xs font-medium rounded ${!isTimeRangeMode ? 'bg-white text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}>{t('app.createJob.singleTime', 'Single Time')}</button>
                <button type="button" onClick={() => { setIsTimeRangeMode(true); if (!pendingTimeTo && pendingTimeFrom) setPendingTimeTo(pendingTimeFrom) }} className={`flex-1 py-1.5 px-2 text-xs font-medium rounded ${isTimeRangeMode ? 'bg-white text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}>{t('app.createJob.timeRange', 'Time Range')}</button>
              </div>
            {!isTimeRangeMode ? (
              <TimePicker label={t('app.createJob.timeLabel', 'Time')} value={pendingTimeFrom} onChange={setPendingTimeFrom} placeholder={t('app.createJob.timeExample', 'e.g. 09:00')} />
            ) : (
              <div className="space-y-3">
                <TimePicker label={t('app.createJob.fromLabel', 'From')} value={pendingTimeFrom} onChange={setPendingTimeFrom} placeholder={t('app.createJob.timeExample', 'e.g. 09:00')} />
                <TimePicker label={t('app.createJob.toLabel', 'To')} value={pendingTimeTo} onChange={setPendingTimeTo} disabled={!pendingTimeFrom} minTime={pendingTimeFrom} placeholder={t('app.createJob.timeExampleEnd', 'e.g. 17:00')} />
              </div>
            )}
              <div className="pt-3 border-t border-gray-100"><button type="button" onClick={() => { setPendingTimeFrom(''); setPendingTimeTo(''); setShowTimeModal(false) }} className="w-full py-2 px-3 text-xs font-medium text-gray-600 hover:text-gray-900 rounded hover:bg-gray-100">{t('app.createJob.clear', 'Clear')}</button></div>
            </div>
          </ConfirmModal>
        , document.body)}
        {/* Note modal — also via portal for the same reason */}
        {typeof document !== 'undefined' && createPortal(
          <ConfirmModal isOpen={showNoteInput} onClose={() => setShowNoteInput(false)} onConfirm={() => setShowNoteInput(false)} title={t('app.createJob.addNote', 'Add Note')} description={t('app.createJob.addNoteDesc', 'Add a note to this job')} confirmLabel={t('app.createJob.saveNote', 'Save Note')} enableNotification={false}>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-primary-700 mb-2">{t('app.createJob.note', 'Note')}</label>
                <textarea value={jobNote} onChange={e => setJobNote(e.target.value)} placeholder={t('app.createJob.notePlaceholder', 'Enter a note for this job...')} rows={5} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 text-sm resize-none bg-white shadow-sm" />
              </div>
              <ClientStandardNotesPicker
                clientId={selectedClient?.id}
                loading={clientStandardNotesLoading}
                error={clientStandardNotesError}
                notes={clientStandardNotes}
                onUse={applyClientStandardNote}
                t={t}
              />
            </div>
          </ConfirmModal>
        , document.body)}
      </>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fadeIn" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[520px] bg-white shadow-2xl z-50 flex flex-col animate-slideInRight">
        <div className="relative bg-gradient-to-r from-gray-50 to-white border-b border-gray-200 px-6 py-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">{t('app.createJob.title', 'Create New Job')}</h2>
          <button
            onClick={onClose}
              className="w-9 h-9 bg-white rounded-lg flex items-center justify-center hover:bg-gray-100 transition-all duration-200 ease-out shadow-sm border border-gray-200 hover:shadow-md"
          >
              <XMarkIcon className="w-5 h-5 text-gray-600" />
          </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-1">
          {/* Client Section */}
          <div>
            {/* Summary view when client is selected or new client is being added */}
            {(selectedClient || (isAddingNewClient && newClientData.name.trim())) && !expandedSections.client && (
                <button
                type="button"
                onClick={() => !lockClient && toggleSection('client')}
                className={`w-full flex items-center justify-between py-3 px-2 transition-colors duration-150 ease-out rounded ${lockClient ? 'cursor-default' : 'hover:bg-gray-50'}`}
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {selectedClient
                      ? (selectedClient.client_type === 'company'
                          ? selectedClient.name
                          : `${selectedClient.name}${selectedClient.last_name ? ` ${selectedClient.last_name}` : ''}`.trim()
                        )
                      : (newClientData.client_type === 'company'
                          ? newClientData.name
                          : `${newClientData.name}${newClientData.last_name ? ` ${newClientData.last_name}` : ''}`.trim()
                        )
                    }
                  </div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">
                    {selectedClient
                      ? (selectedClient.address ? `${selectedClient.address}, ${selectedClient.city}` : t('app.createJob.noAddress', 'No address'))
                      : (newClientData.address ? `${newClientData.address}, ${newClientData.city}` : t('app.createJob.noAddress', 'No address'))
                    }
                  </div>
                </div>
                {!lockClient && (
                  <svg className="w-4 h-4 text-gray-400 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
                </button>
              )}
              
            {/* Expanded view — hidden when client is locked */}
            {expandedSections.client && !lockClient && (
              <div>
                <div className="py-3 space-y-4 animate-slideDown">
                  {selectedClient ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                      <h3 className="text-sm font-medium text-gray-900">{t('app.createJob.clientInformation', 'Client Information')}</h3>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              if (!isEditingClient) {
                                // Entering edit mode - populate with current client data
                                setEditingClientData({
                                  client_type: selectedClient.client_type || 'person',
                                  name: selectedClient.name || '',
                                  last_name: selectedClient.last_name || '',
                                  company_number: selectedClient.company_number || '',
                                  address: selectedClient.address || '',
                                  zip_code: selectedClient.zip_code || '',
                                  city: selectedClient.city || '',
                                  email: selectedClient.email || '',
                                  phone: selectedClient.phone || ''
                                });
                              }
                              setIsEditingClient(!isEditingClient);
                            }}
                            className="text-xs text-blue-600 hover:text-blue-700 transition-colors duration-150 ease-out"
                          >
                            {isEditingClient ? t('app.common.cancel') : t('settings.user.edit', 'Edit')}
                          </button>
                          <button
                            onClick={() => { setSelectedClient(null); setClientSearch(''); setIsEditingClient(false) }}
                            className="text-gray-400 hover:text-gray-600 transition-colors duration-150 ease-out p-1 rounded hover:bg-gray-100"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>
            </div>
                      {/* Client Type Selector (only in edit mode) */}
                      {isEditingClient && (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">{t('app.createJob.clientType', 'Client Type')}</label>
                          <div className="flex bg-gray-100 rounded p-0.5">
                            <button
                              type="button"
                              onClick={() => setEditingClientData({ ...editingClientData, client_type: 'person' })}
                              className={`flex-1 py-1.5 px-3 text-xs font-medium rounded transition-colors duration-150 ease-out ${
                                editingClientData.client_type === 'person' ? 'bg-white text-gray-900' : 'text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              {t('app.createJob.privatePerson', 'Private Person')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingClientData({ ...editingClientData, client_type: 'company' })}
                              className={`flex-1 py-1.5 px-3 text-xs font-medium rounded transition-colors duration-150 ease-out ${
                                editingClientData.client_type === 'company' ? 'bg-white text-gray-900' : 'text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              {t('app.createJob.company', 'Company')}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Company fields (only show when editing and it's a company) */}
                      {isEditingClient && editingClientData.client_type === 'company' && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1.5">{t('app.createJob.companyName', 'Company Name')}</label>
                            <input
                              type="text"
                              value={editingClientData.name}
                              onChange={(e) => setEditingClientData({ ...editingClientData, name: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1.5">{t('app.createJob.companyNumber', 'Company Number')}</label>
                            <input
                              type="text"
                              value={editingClientData.company_number}
                              onChange={(e) => setEditingClientData({ ...editingClientData, company_number: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                            />
                          </div>
                        </div>
                      )}

                      {/* Person fields (only show when editing and it's a person) */}
                      {isEditingClient && editingClientData.client_type === 'person' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1.5">{t('settings.user.firstName')}</label>
                            <input
                              type="text"
                              value={editingClientData.name}
                              onChange={(e) => setEditingClientData({ ...editingClientData, name: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1.5">{t('settings.user.lastName')}</label>
                            <input
                              type="text"
                              value={editingClientData.last_name}
                              onChange={(e) => setEditingClientData({ ...editingClientData, last_name: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                            />
                          </div>
                        </div>
                      )}

                      {/* Display fields (non-editable view) */}
                      {!isEditingClient && (
                        <>
                          {selectedClient.client_type === 'company' ? (
                            <div className="space-y-2">
                              <div className="text-sm font-medium text-gray-900">{selectedClient.name}</div>
                              {selectedClient.company_number && (
                                <div className="text-xs text-gray-500">CVR: {selectedClient.company_number}</div>
                              )}
                            </div>
                          ) : (
                            <div className="text-sm font-medium text-gray-900">
                              {selectedClient.name}{selectedClient.last_name ? ` ${selectedClient.last_name}` : ''}
                            </div>
                          )}
                        </>
                      )}

                      {/* Address fields (show in both view and edit modes) */}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">{t('app.createJob.address', 'Address')}</label>
                        <input
                          type="text"
                          value={isEditingClient ? editingClientData.address : (selectedClient.address || '')}
                          onChange={(e) => isEditingClient && setEditingClientData({ ...editingClientData, address: e.target.value })}
                          disabled={!isEditingClient}
                          className={`w-full px-3 py-2 border border-gray-200 rounded text-sm transition-all duration-150 ease-out ${
                            isEditingClient
                              ? 'focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white'
                              : 'bg-gray-50 text-gray-700 cursor-not-allowed'
                          }`}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">{t('app.createJob.zipCode', 'Zip Code')}</label>
                          <input
                            type="text"
                            value={isEditingClient ? editingClientData.zip_code : (selectedClient.zip_code || '')}
                            onChange={(e) => isEditingClient && setEditingClientData({ ...editingClientData, zip_code: e.target.value })}
                            disabled={!isEditingClient}
                            className={`w-full px-3 py-2 border border-gray-200 rounded text-sm transition-all duration-150 ease-out ${
                              isEditingClient
                                ? 'focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white'
                                : 'bg-gray-50 text-gray-700 cursor-not-allowed'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">{t('app.createJob.city', 'City')}</label>
                          <input
                            type="text"
                            value={isEditingClient ? editingClientData.city : (selectedClient.city || '')}
                            onChange={(e) => isEditingClient && setEditingClientData({ ...editingClientData, city: e.target.value })}
                            disabled={!isEditingClient}
                            className={`w-full px-3 py-2 border border-gray-200 rounded text-sm transition-all duration-150 ease-out ${
                              isEditingClient
                                ? 'focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white'
                                : 'bg-gray-50 text-gray-700 cursor-not-allowed'
                            }`}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">{t('settings.user.email')}</label>
                          <input
                            type="email"
                            value={isEditingClient ? editingClientData.email : (selectedClient.email || '')}
                            onChange={(e) => isEditingClient && setEditingClientData({ ...editingClientData, email: e.target.value })}
                            disabled={!isEditingClient}
                            className={`w-full px-3 py-2 border border-gray-200 rounded text-sm transition-all duration-150 ease-out ${
                              isEditingClient
                                ? 'focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white'
                                : 'bg-gray-50 text-gray-700 cursor-not-allowed'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">{t('app.createJob.phone', 'Phone')}</label>
                          <input
                            type="tel"
                            value={isEditingClient ? editingClientData.phone : (selectedClient.phone || '')}
                            onChange={(e) => isEditingClient && setEditingClientData({ ...editingClientData, phone: e.target.value })}
                            disabled={!isEditingClient}
                            className={`w-full px-3 py-2 border border-gray-200 rounded text-sm transition-all duration-150 ease-out ${
                              isEditingClient
                                ? 'focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white'
                                : 'bg-gray-50 text-gray-700 cursor-not-allowed'
                            }`}
                          />
                        </div>
                      </div>

                      {isEditingClient && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={async () => {
                              // Save the edited client
                              try {
                                const token = localStorage.getItem('token')
                                const response = await fetch(apiUrl(`/clients/${selectedClient.id}`), {
                                  method: 'PUT',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                  },
                                  body: JSON.stringify({
                                    client_type: editingClientData.client_type,
                                    name: editingClientData.name,
                                    last_name: editingClientData.last_name,
                                    company_number: editingClientData.company_number || null,
                                    address: editingClientData.address || null,
                                    zip_code: editingClientData.zip_code || null,
                                    city: editingClientData.city || null,
                                    email: editingClientData.email || null,
                                    phone: editingClientData.phone || null,
                                  })
                                })

                                const data = await response.json()

                                if (response.ok) {
                                  // Update the selected client with new data
                                  setSelectedClient(data.client)
                                  setIsEditingClient(false)
                                  // Move to next step (services)
                                  setExpandedSections({ client: false, job: true, schedule: false, recurring: false })
                                } else {
                                  console.error('Failed to update client:', data.error)
                                }
                              } catch (error) {
                                console.error('Error updating client:', error)
                              }
                            }}
                            disabled={
                              !editingClientData.name.trim()
                            }
                            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 ease-out"
                          >
                            {t('app.createJob.saveChangesContinue', 'Save Changes & Continue')}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : isAddingNewClient ? (
                    <div className="space-y-4">
                      <AddClientInlineForm
                        data={newClientData}
                        onChange={setNewClientData}
                        onSave={() => {
                          if (newClientData.name.trim()) {
                            setSelectedClient({
                              id: -1,
                              name: newClientData.name,
                              last_name: newClientData.last_name,
                              client_type: newClientData.client_type
                            })
                            setIsAddingNewClient(false)
                            setExpandedSections({ client: false, job: true, schedule: false, recurring: false })
                          }
                        }}
                        onCancel={() => {
                          setIsAddingNewClient(false)
                          setNewClientData(initialNewClientData)
                        }}
                        saveLabel={t('app.createJob.saveSelectClient', 'Save & Select Client')}
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-gray-900 pb-2 border-b border-gray-100">{t('app.createJob.selectClient', 'Select Client')}</h3>
                  <div className="relative dropdown-container">
                    <input
                      type="text"
                      value={clientSearch}
                          onChange={(e) => { setClientSearch(e.target.value); setShowClientDropdown(true) }}
                      onFocus={() => setShowClientDropdown(true)}
                      placeholder={t('app.createJob.searchClient', 'Search for a client...')}
                          className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                    />
                    {showClientDropdown && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 max-h-60 overflow-y-auto animate-fadeIn">
                        {filteredClients.length > 0 ? (
                              <>
                                {filteredClients.map((client) => (
                            <button
                              key={client.id}
                                    onClick={() => { setSelectedClient(client); setClientSearch(''); setShowClientDropdown(false) }}
                                    className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 transition-colors duration-150 ease-out"
                                  >
                                    <div className="text-sm font-medium text-gray-900">
                                      {client.client_type === 'company'
                                        ? client.name
                                        : `${client.name}${client.last_name ? ` ${client.last_name}` : ''}`.trim()
                                      }
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                {client.address ? `${client.address}, ${client.city}` : t('app.createJob.noAddress', 'No address')}
                              </div>
                            </button>
                                ))}
                                <button
                                  onClick={() => { setIsAddingNewClient(true); setShowClientDropdown(false); setClientSearch('') }}
                                  className="w-full px-3 py-2 text-left hover:bg-accent-50 border-t border-gray-200 bg-gray-50 transition-colors duration-150 ease-out sticky bottom-0"
                                >
                                  <div className="text-sm font-medium text-accent-600 flex items-center">
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add new client
                                  </div>
                                </button>
                              </>
                            ) : (
                              <>
                                <div className="px-3 py-2 text-sm text-gray-500">No clients found</div>
                                <button
                                  onClick={() => { setIsAddingNewClient(true); setShowClientDropdown(false); setClientSearch('') }}
                                  className="w-full px-3 py-2 text-left hover:bg-accent-50 border-t border-gray-200 bg-gray-50 transition-colors duration-150 ease-out"
                                >
                                  <div className="text-sm font-medium text-accent-600 flex items-center">
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add new client
                          </div>
                                </button>
                              </>
                        )}
                      </div>
                    )}
                      </div>
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
          
          {/* Job Section */}
          <div>
            {/* Summary view when job is complete */}
            {((selectedClient || isAddingNewClient) && ((jobType === 'new' && selectedServices.length > 0) || (jobType === 'redo' && selectedPastJob))) && !expandedSections.job && (
              <button
                type="button"
                onClick={() => toggleSection('job')}
                className="w-full flex items-center justify-between py-3 px-2 transition-colors duration-150 ease-out hover:bg-gray-50 rounded"
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium text-gray-900">
                    {jobType === 'new' 
                      ? `${selectedServices.length} service${selectedServices.length > 1 ? 's' : ''} selected`
                      : 'Re-do job selected'
                    }
                  </div>
                  {jobType === 'new' && (
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      {selectedServices.map(s => s.title).join(', ')}
                    </div>
                  )}
                </div>
                <svg className="w-4 h-4 text-gray-400 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            
            {/* Collapsed view when client is selected but no services yet */}
            {(selectedClient || isAddingNewClient) && !((jobType === 'new' && selectedServices.length > 0) || (jobType === 'redo' && selectedPastJob)) && !expandedSections.job && (
              <button
                type="button"
                onClick={() => toggleSection('job')}
                className="w-full flex items-center justify-between py-3 px-2 transition-colors duration-150 ease-out hover:bg-gray-50 rounded"
              >
                <div className="text-sm font-medium text-gray-500">Job</div>
                <svg className="w-4 h-4 text-gray-400 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            
            {/* Placeholder when no client selected */}
            {!selectedClient && !isAddingNewClient && !expandedSections.job && (
              <button
                type="button"
                disabled
                className="w-full flex items-center justify-between py-3 px-2 opacity-50 cursor-not-allowed rounded"
              >
                <div className="text-sm font-medium text-gray-400">Job (select client first)</div>
                <svg className="w-4 h-4 text-gray-400 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            
            {/* Expanded view */}
            {expandedSections.job && (
              <div>
                <div className="py-3 space-y-4 animate-slideDown">
                  <h3 className="text-sm font-medium text-gray-900 pb-2 border-b border-gray-100">Job Details</h3>
                  {!selectedClient && !isAddingNewClient ? (
                    <div className="text-sm text-gray-500 text-center py-4">
                      Please select or add a client first
                    </div>
                  ) : (
                    <>
                  <div className="flex items-center space-x-1 bg-gray-100 rounded p-0.5">
                <button
                  type="button"
                  onClick={() => setJobType('new')}
                      className={`flex-1 py-1.5 px-3 text-xs font-medium rounded transition-colors duration-150 ease-out ${
                    jobType === 'new' 
                          ? 'bg-white text-gray-900' 
                          : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  New Job
                </button>
                <button
                  type="button"
                  onClick={() => setJobType('redo')}
                      className={`flex-1 py-1.5 px-3 text-xs font-medium rounded transition-colors duration-150 ease-out ${
                    jobType === 'redo' 
                          ? 'bg-white text-gray-900' 
                          : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Re-do Job
                </button>
              </div>

              {jobType === 'redo' && (
                <div className="space-y-2">
                  {pastJobs.length > 0 ? (
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                      {pastJobs.map((job) => (
                        <button
                          key={job.id}
                          type="button"
                          onClick={() => setSelectedPastJob(job)}
                              className={`w-full text-left p-2.5 rounded border transition-colors duration-150 ease-out ${
                            selectedPastJob?.id === job.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 bg-white hover:bg-gray-50'
                          }`}
                        >
                          <div className="text-sm font-medium text-gray-900">
                            {job.service_count || 0} service{(job.service_count || 0) !== 1 ? 's' : ''} • {job.total_duration || 0}min • {job.total_price || 0}kr
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                          <div className="text-sm">No past jobs found</div>
                          <div className="text-xs mt-1 text-gray-400">Past jobs for this client will appear here</div>
                    </div>
                  )}
                </div>
              )}

              {jobType === 'new' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Services</label>
                <div className="relative dropdown-container">
                  <input
                    type="text"
                    value={serviceSearch}
                            onChange={(e) => { setServiceSearch(e.target.value); setShowServiceDropdown(true) }}
                    onFocus={() => setShowServiceDropdown(true)}
                    placeholder="Search for services..."
                            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                  />
                  {showServiceDropdown && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 max-h-60 overflow-y-auto animate-fadeIn">
                      {filteredServices.length > 0 ? (
                              <>
                                {filteredServices.map((service) => (
                          <button
                            key={service.id}
                            onClick={() => addService(service)}
                                    className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 transition-colors duration-150 ease-out"
                                  >
                                    <div className="text-sm font-medium text-gray-900">{service.title}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">{formatMoney(Number(service.price) || 0, companyCountryCode)} • {service.duration_minutes}min</div>
                                  </button>
                                ))}
                                <button
                                  onClick={() => {
                                    const tempId = -Date.now()
                                    setSelectedServices(prev => [
                                      ...prev,
                                      {
                                        id: tempId,
                                        title: '(custom task)',
                                        price: 0,
                                        duration_minutes: 0,
                                        customPrice: '0',
                                        customDuration: 0,
                                        isCustom: true,
                                        customTitle: ''
                                      }
                                    ])
                                    setEditingTitle(tempId)
                                    setShowServiceDropdown(false)
                                    setServiceSearch('')
                                  }}
                                  className="w-full px-3 py-2 text-left hover:bg-blue-50 border-t border-gray-200 bg-gray-50 transition-colors duration-150 ease-out sticky bottom-0"
                                >
                                  <div className="text-sm font-medium text-blue-600 flex items-center">
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add custom task
                            </div>
                          </button>
                              </>
                              ) : (
                              <>
                                <div className="px-3 py-2 text-sm text-gray-500">No services found</div>
                                <button
                                  onClick={() => {
                                    const tempId = -Date.now()
                                    setSelectedServices(prev => [
                                      ...prev,
                                      {
                                        id: tempId,
                                        title: '(custom task)',
                                        price: 0,
                                        duration_minutes: 0,
                                        customPrice: '0',
                                        customDuration: 0,
                                        isCustom: true,
                                        customTitle: ''
                                      }
                                    ])
                                    setEditingTitle(tempId)
                                    setShowServiceDropdown(false)
                                    setServiceSearch('')
                                  }}
                                  className="w-full px-3 py-2 text-left hover:bg-blue-50 border-t border-gray-200 bg-gray-50 transition-colors duration-150 ease-out"
                                >
                                  <div className="text-sm font-medium text-blue-600 flex items-center">
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add custom task
                        </div>
                                </button>
                              </>
                      )}
                    </div>
                  )}
                        </div>
                </div>

                {selectedServices.length > 0 && (
                        <div className="space-y-1.5">
                    {selectedServices.map((service) => (
                            <div key={service.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded border border-gray-200">
                        <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900">
                                  {service.isCustom ? (
                                    editingTitle === service.id ? (
                                      <input
                                        type="text"
                                        placeholder="Task title"
                                        defaultValue={service.customTitle || ''}
                                        onBlur={(e) => {
                                          const value = e.target.value.trim()
                                          setSelectedServices(prev =>
                                            prev.map(s => s.id === service.id ? { ...s, customTitle: value, title: value || '(custom task)' } : s)
                                          )
                                          setEditingTitle(null)
                                        }}
                                        onKeyPress={(e) => e.key === 'Enter' && (e.currentTarget.blur())}
                                        className="text-sm text-blue-600 bg-white border border-blue-300 rounded px-1.5 py-0.5 w-full max-w-[220px]"
                                        autoFocus
                                      />
                                    ) : (
                                      <button onClick={() => setEditingTitle(service.id)} className="text-left text-sm text-blue-600 underline cursor-pointer bg-transparent border-none hover:text-blue-700 transition-colors">
                                        {service.customTitle && service.customTitle.trim().length > 0 ? service.customTitle : '(custom task)'}
                                      </button>
                                    )
                                  ) : (
                                    service.title
                                  )}
                          </div>
                        </div>
                              <div className="flex items-center space-x-3 ml-3">
                                <div className="flex items-center space-x-1.5">
                            <span className="text-xs text-gray-500">Price:</span>
                            {editingPrice === service.id ? (
                              <input
                                type="number"
                                defaultValue={service.customPrice}
                                      onBlur={(e) => { updateService(service.id, 'customPrice', e.target.value); setEditingPrice(null) }}
                                      onKeyPress={(e) => e.key === 'Enter' && (e.currentTarget.blur())}
                                      className="text-xs text-blue-600 bg-white border border-blue-300 rounded px-1.5 py-0.5 w-16"
                                autoFocus
                              />
                            ) : (
                                    <button onClick={() => setEditingPrice(service.id)} className="text-xs text-blue-600 underline cursor-pointer bg-transparent border-none hover:text-blue-700 transition-colors">
                                {service.customPrice}kr.
                              </button>
                            )}
                          </div>
                                <div className="flex items-center space-x-1.5">
                            <span className="text-xs text-gray-500">Time:</span>
                            {editingDuration === service.id ? (
                              <input
                                type="number"
                                defaultValue={service.customDuration}
                                      onBlur={(e) => { updateService(service.id, 'customDuration', parseInt(e.target.value) || 0); setEditingDuration(null) }}
                                      onKeyPress={(e) => e.key === 'Enter' && (e.currentTarget.blur())}
                                      className="text-xs text-blue-600 bg-white border border-blue-300 rounded px-1.5 py-0.5 w-14"
                                autoFocus
                              />
                            ) : (
                                    <button onClick={() => setEditingDuration(service.id)} className="text-xs text-blue-600 underline cursor-pointer bg-transparent border-none hover:text-blue-700 transition-colors">
                                {service.customDuration}min.
                              </button>
                            )}
                          </div>
                                <button onClick={() => removeService(service.id)} className="text-gray-400 hover:text-red-600 transition-colors duration-150 ease-out p-1 rounded hover:bg-red-50 ml-1">
                                  <XMarkIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}

              {selectedServices.length > 0 && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      // Move to next step (schedule)
                      setExpandedSections({ client: false, job: false, schedule: true, recurring: false })
                    }}
                    className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors duration-150 ease-out"
                  >
                    Continue to Schedule
                  </button>
                </div>
              )}
                    </>
                  )}
                </div>
            </div>
          )}
          </div>
          
          {/* Schedule Section */}
          <div>
            {/* Summary view when schedule is complete */}
            {!expandedSections.schedule && (
              <button
                type="button"
                onClick={() => toggleSection('schedule')}
                disabled={!selectedClient && !isAddingNewClient}
                className={`w-full flex items-center justify-between py-3 px-2 transition-colors duration-150 ease-out rounded ${
                  !selectedClient && !isAddingNewClient 
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex-1 min-w-0 text-left">
                  {jobDate ? (
                    <>
                      <div className="text-sm font-medium text-gray-900">
                        {new Date(jobDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                      {selectedUserId && (
                        <div className="text-xs text-gray-500 truncate mt-0.5">
                          {users.find(u => u.id === selectedUserId)?.first_name} {users.find(u => u.id === selectedUserId)?.last_name}
                          {jobTimeFrom && ` • ${jobTimeFrom}${jobTimeTo ? ` - ${jobTimeTo}` : ''}`}
                </div>
                      )}
                    </>
                  ) : (
                    <div className={`text-sm font-medium ${!selectedClient && !isAddingNewClient ? 'text-gray-400' : 'text-gray-500'}`}>
                      {!selectedClient && !isAddingNewClient ? 'Schedule (select client first)' : 'Schedule'}
                    </div>
                  )}
                </div>
                <svg className="w-4 h-4 text-gray-400 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
              
            {/* Expanded view */}
            {expandedSections.schedule && (
              <div>
                <div className="py-3 space-y-4 animate-slideDown">
                  <h3 className="text-sm font-medium text-gray-900 pb-2 border-b border-gray-100">Schedule</h3>
                  {!selectedClient && !isAddingNewClient ? (
                    <div className="text-sm text-gray-500 text-center py-4">
                      Please select or add a client first
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Assign to User</label>
                {users.length === 1 ? (
                          <div className="w-full px-3 py-2 border border-gray-200 rounded bg-gray-50 text-gray-700 text-sm">
                    {users[0].first_name} {users[0].last_name} ({users[0].role})
                  </div>
                ) : (
                  <select
                    value={selectedUserId || ''}
                    onChange={(e) => setSelectedUserId(parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                  >
                    <option value="">Select a user...</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.first_name} {user.last_name} ({user.role})
                      </option>
                    ))}
                  </select>
                )}
              </div>

                    <div className="space-y-3">
                </div>
                
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">
                  {mode === 'subscription' ? 'Starting Date *' : 'Date *'}
                </label>
                <input
                  type="date"
                  value={jobDate}
                  onChange={(e) => setJobDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                  required
                />
              </div>

              {(jobTimeFrom || jobTimeTo) && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm text-gray-700">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{jobTimeFrom && jobTimeTo ? `${jobTimeFrom} – ${jobTimeTo}` : jobTimeFrom || jobTimeTo}</span>
                </div>
              )}

                  <div className="space-y-2 pt-2">
                {!showNoteInput ? (
                  jobNote.trim() ? (
                    <div className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded">
                      <div className="flex items-center space-x-2">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span className="text-sm text-blue-700 font-medium">Note added</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowNoteInput(true)}
                        className="text-xs text-blue-600 hover:text-blue-700 transition-colors duration-150 ease-out"
                      >
                        Edit
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowNoteInput(true)}
                          className="w-full flex items-center justify-center px-3 py-2 bg-gray-50 text-gray-700 border border-gray-200 rounded hover:bg-gray-100 transition-colors duration-150 ease-out text-sm"
                    >
                          Add Note
                    </button>
                  )
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={jobNote}
                      onChange={(e) => setJobNote(e.target.value)}
                      placeholder="Add a note for this job..."
                          className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm resize-none bg-white"
                      rows={3}
                          style={{ minHeight: '70px', maxHeight: '100px' }}
                    />
                    <ClientStandardNotesPicker
                      clientId={selectedClient?.id}
                      loading={clientStandardNotesLoading}
                      error={clientStandardNotesError}
                      notes={clientStandardNotes}
                      onUse={applyClientStandardNote}
                      t={t}
                    />
                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                            onClick={() => { setJobNote(''); setShowNoteInput(false) }}
                            className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors duration-150 ease-out rounded hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNoteInput(false)}
                            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-150 ease-out"
                      >
                        Save Note
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Show create button after all required steps are complete */}
          {(() => {
            const hasBasicRequirements = jobDate && selectedUserId && selectedClient && (jobType === 'new' ? selectedServices.length > 0 : selectedPastJob);
            const hasRecurringSettings = mode !== 'subscription' || (recurrenceType && intervalValue > 0 && ((recurrenceType === 'weekly' && dayOfWeek !== null) || (recurrenceType === 'monthly' && dayOfMonth !== null)));

            return hasBasicRequirements && hasRecurringSettings && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSubmitJob}
                  disabled={isSubmitting}
                  className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 ease-out"
                >
                  {isSubmitting ? (mode === 'subscription' ? 'Creating Subscription...' : 'Creating Job...') : (mode === 'subscription' ? 'Create Subscription' : 'Create Job')}
                </button>
              </div>
            );
          })()}
                </div>
              </div>
          )}

          {/* Recurring Step - Only for subscriptions */}
          {mode === 'subscription' && (
            <div className="border-t border-gray-100">
              <button
                type="button"
                onClick={() => toggleSection('recurring')}
                className={`w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors duration-150 ease-out ${
                  expandedSections.recurring ? 'bg-blue-50' : ''
                }`}
                disabled={!selectedClient && !isAddingNewClient}
              >
                <div className="flex items-center">
                  <div>
                    <div className="text-sm font-medium text-gray-900">Recurring Settings</div>
                    <div className="text-xs text-gray-500">
                      {recurrenceType === 'weekly'
                        ? `Every ${intervalValue} week${intervalValue > 1 ? 's' : ''} on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]}`
                        : `Every ${intervalValue} month${intervalValue > 1 ? 's' : ''} on the ${dayOfMonth}${dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th'}`
                      }
                    </div>
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-400 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded view */}
              {expandedSections.recurring && (
                <div>
                  <div className="py-3 space-y-4 animate-slideDown px-3">
                    <h3 className="text-sm font-medium text-gray-900 pb-2 border-b border-gray-100">Recurring Settings</h3>

                    {!selectedClient && !isAddingNewClient ? (
                      <div className="text-sm text-gray-500 text-center py-4">
                        Please select or add a client first
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Recurrence Type */}
                        <div>
                          <label className="block text-xs text-gray-500 mb-2">Recurrence Type</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setRecurrenceType('weekly')}
                              className={`px-3 py-2 text-sm font-medium rounded border transition-colors ${
                                recurrenceType === 'weekly'
                                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              Weekly
                            </button>
                            <button
                              type="button"
                              onClick={() => setRecurrenceType('monthly')}
                              className={`px-3 py-2 text-sm font-medium rounded border transition-colors ${
                                recurrenceType === 'monthly'
                                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              Monthly
                            </button>
                          </div>
                        </div>

                        {/* Weekly Settings */}
                        {recurrenceType === 'weekly' && (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-2">Day of Week</label>
                              <select
                                value={dayOfWeek}
                                onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                              >
                                <option value={0}>Sunday</option>
                                <option value={1}>Monday</option>
                                <option value={2}>Tuesday</option>
                                <option value={3}>Wednesday</option>
                                <option value={4}>Thursday</option>
                                <option value={5}>Friday</option>
                                <option value={6}>Saturday</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-2">Every X Weeks</label>
                              <input
                                type="number"
                                min="1"
                                max="52"
                                value={intervalValue}
                                onChange={(e) => setIntervalValue(parseInt(e.target.value) || 1)}
                                className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm"
                                placeholder="1"
                              />
                            </div>
                          </div>
                        )}

                        {/* Monthly Settings */}
                        {recurrenceType === 'monthly' && (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-2">Day of Month</label>
                              <select
                                value={dayOfMonth}
                                onChange={(e) => setDayOfMonth(parseInt(e.target.value))}
                                className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                              >
                                {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                                  <option key={day} value={day}>
                                    {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-2">Every X Months</label>
                              <input
                                type="number"
                                min="1"
                                max="12"
                                value={intervalValue}
                                onChange={(e) => setIntervalValue(parseInt(e.target.value) || 1)}
                                className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm"
                                placeholder="1"
                              />
                            </div>
                          </div>
                        )}

                        {/* Preview */}
                        <div className="bg-gray-50 rounded p-3">
                          <div className="text-xs text-gray-500 mb-1">Preview</div>
                          <div className="text-sm text-gray-700">
                            {recurrenceType === 'weekly'
                              ? `Every ${intervalValue} week${intervalValue > 1 ? 's' : ''} on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]}`
                              : `Every ${intervalValue} month${intervalValue > 1 ? 's' : ''} on the ${dayOfMonth}${dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th'}`
                            }
                          </div>
                          {jobDate && (
                            <div className="text-xs text-gray-500 mt-1">
                              Starts: {new Date(jobDate).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {createdJobId && (
            <div className="text-center space-y-3 py-6 animate-fadeIn">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Job Created Successfully!</h3>
                <p className="text-sm text-gray-600">The job has been scheduled and assigned.</p>
              </div>
            </div>
          )}
        </div>

        {/* Time Modal — rendered via portal so it escapes the slideout's CSS transform stacking context */}
        {typeof document !== 'undefined' && createPortal(
        <ConfirmModal
          isOpen={showTimeModal}
          onClose={() => setShowTimeModal(false)}
          onConfirm={(data) => {
            setJobTimeFrom(pendingTimeFrom)
            setJobTimeTo(isTimeRangeMode ? pendingTimeTo : '')
            setShowTimeModal(false)
          }}
          title="Set Time"
          description="Set the scheduled time for this job"
          confirmLabel="Save Time"
        >
          <div className="space-y-3">
            <div className="flex items-center space-x-1 bg-gray-100 rounded p-0.5">
              <button
                type="button"
                onClick={() => {
                  setIsTimeRangeMode(false)
                  setPendingTimeTo('')
                }}
                className={`flex-1 py-1.5 px-2 text-xs font-medium rounded transition-colors duration-150 ease-out ${
                  !isTimeRangeMode ? 'bg-white text-gray-900' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Single Time
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsTimeRangeMode(true)
                  if (!pendingTimeTo && pendingTimeFrom) setPendingTimeTo(pendingTimeFrom)
                }}
                className={`flex-1 py-1.5 px-2 text-xs font-medium rounded transition-colors duration-150 ease-out ${
                  isTimeRangeMode ? 'bg-white text-gray-900' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Time Range
              </button>
            </div>

            <div className="space-y-3">
              {!isTimeRangeMode ? (
                <TimePicker label="Time" value={pendingTimeFrom} onChange={setPendingTimeFrom} placeholder="e.g. 09:00" />
              ) : (
                <>
                  <TimePicker label="From" value={pendingTimeFrom} onChange={setPendingTimeFrom} placeholder="e.g. 09:00" />
                  <TimePicker label="To" value={pendingTimeTo} onChange={setPendingTimeTo} disabled={!pendingTimeFrom} minTime={pendingTimeFrom} placeholder="e.g. 17:00" />
                </>
              )}
            </div>

            <div className="pt-3 border-t border-gray-100">
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingTimeFrom('')
                    setPendingTimeTo('')
                    setShowTimeModal(false)
                  }}
                  className="flex-1 py-2 px-3 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors duration-150 ease-out rounded hover:bg-gray-100"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </ConfirmModal>
        , document.body)}

      </div>
    </>
  )
}
