'use client'

import { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'

// Calendar View Component
interface CalendarViewProps {
  selectedDate: string
  onDateSelect: (date: string) => void
  selectedUserId: number | null
  selectedServices: SelectedService[]
  selectedClient: Client | null
  jobType: 'new' | 'redo'
  selectedPastJob: PastJob | null
}

function CalendarView({ selectedDate, onDateSelect, selectedUserId, selectedServices, selectedClient, jobType, selectedPastJob }: CalendarViewProps) {
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
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  
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
        <h3 className="text-lg font-medium text-gray-900">{monthNames[month]} {year}</h3>
        <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      
      <div className="grid grid-cols-7 gap-1">
        {dayNames.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">{day}</div>
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
              <div key={job.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-900 truncate">{job.first_name} {job.last_name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {job.personal_address ? `${job.personal_address}, ${job.personal_city}` : 'No address'}
                  </div>
                </div>
                <div className="text-xs text-gray-600 font-medium ml-2">{Math.round(job.total_duration / 60)}h</div>
              </div>
            ))}
            
            {selectedUserId && selectedClient && ((jobType === 'new' && selectedServices.length > 0) || (jobType === 'redo' && selectedPastJob)) && (
              <div className="flex items-center justify-between p-2 bg-blue-50 rounded-lg border-2 border-blue-200 border-dashed">
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-blue-900 truncate">
                      {selectedClient.first_name} {selectedClient.last_name}
                    </div>
                    <div className="text-xs text-blue-600 truncate">
                      {selectedClient.personal_address ? `${selectedClient.personal_address}, ${selectedClient.personal_city}` : 'No address'}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-blue-700 font-medium ml-2">{Math.round(getTotalJobDuration() / 60)}h</div>
              </div>
            )}
            
            {getJobsForDate(new Date(selectedDate)).length === 0 && (!selectedUserId || !selectedClient || 
              (jobType === 'new' && selectedServices.length === 0) || (jobType === 'redo' && !selectedPastJob)) && (
              <div className="text-xs text-gray-500 text-center py-2">No jobs scheduled for this date</div>
            )}
          </div>
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
  first_name: string
  last_name: string
  personal_address: string
  personal_zip_code: string
  personal_city: string
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
}

export default function CreateJob({ isOpen, onClose, onJobCreated, initialDate, initialAssignedUserId }: CreateJobProps) {
  const [services, setServices] = useState<Service[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [showServiceDropdown, setShowServiceDropdown] = useState(false)
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [serviceSearch, setServiceSearch] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [jobDate, setJobDate] = useState('')
  const [jobTimeFrom, setJobTimeFrom] = useState('')
  const [jobTimeTo, setJobTimeTo] = useState('')
  const [jobNote, setJobNote] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimeFromPicker, setShowTimeFromPicker] = useState(false)
  const [isTimeRangeMode, setIsTimeRangeMode] = useState(false)
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdJobId, setCreatedJobId] = useState<number | null>(null)
  const [expandedSections, setExpandedSections] = useState({ client: true, job: false, schedule: false })
  const [jobType, setJobType] = useState<'new' | 'redo'>('new')
  const [editingPrice, setEditingPrice] = useState<number | null>(null)
  const [editingDuration, setEditingDuration] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState<number | null>(null)
  const [pastJobs, setPastJobs] = useState<PastJob[]>([])
  const [selectedPastJob, setSelectedPastJob] = useState<PastJob | null>(null)
  const [isAddingNewClient, setIsAddingNewClient] = useState(false)
  const [newClientData, setNewClientData] = useState({
    first_name: '',
    last_name: '',
    personal_address: '',
    personal_zip_code: '',
    personal_city: '',
    personal_email: '',
    personal_phone: ''
  })
  
  const toggleSection = (section: 'client' | 'job' | 'schedule') => {
    setExpandedSections(prev => {
      // Only allow one section open at a time
      const newState = { client: false, job: false, schedule: false }
      // If clicking the currently open section, close it. Otherwise, open the clicked section
      newState[section] = !prev[section]
      return newState
    })
  }
  
  // Auto-close client section and open job section only when an existing client is selected (not when adding new)
  useEffect(() => {
    if (selectedClient && !isAddingNewClient && expandedSections.client) {
      setExpandedSections({ client: false, job: true, schedule: false })
    }
  }, [selectedClient])
  
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
      setJobDate(initialDate ? String(initialDate).split('T')[0] : '')
      setJobTimeFrom('')
      setJobTimeTo('')
      setIsTimeRangeMode(false)
      setJobNote('')
      setShowNoteInput(false)
      setSelectedServices([])
      setSelectedClient(null)
      setSelectedUserId(typeof initialAssignedUserId === 'number' ? initialAssignedUserId : null)
      setServiceSearch('')
      setClientSearch('')
      setCreatedJobId(null)
      setExpandedSections({ client: true, job: false, schedule: false })
      setJobType('new')
      setSelectedPastJob(null)
      setEditingPrice(null)
      setEditingDuration(null)
      setIsAddingNewClient(false)
      setNewClientData({
        first_name: '',
        last_name: '',
        personal_address: '',
        personal_zip_code: '',
        personal_city: '',
        personal_email: '',
        personal_phone: ''
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
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('.dropdown-container') && !target.closest('[data-time-picker]')) {
        setShowServiceDropdown(false)
        setShowClientDropdown(false)
        setShowDatePicker(false)
        setShowTimeFromPicker(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

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
      if (response.ok) setClients(data.clients || [])
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
  
  const handleSubmitJob = async () => {
    const hasValidServices = jobType === 'new' ? selectedServices.length > 0 : true
    if (!selectedUserId || !hasValidServices || (jobType === 'redo' && !selectedPastJob)) {
      return
    }
    
    // If adding new client, we need to validate the form
    if (isAddingNewClient && !newClientData.first_name.trim()) {
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
      
      // Create new client if in "add new client" mode
      if (isAddingNewClient) {
        const clientResponse = await fetch(apiUrl('/clients'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            first_name: newClientData.first_name,
            last_name: newClientData.last_name,
            personal_address: newClientData.personal_address || null,
            personal_zip_code: newClientData.personal_zip_code || null,
            personal_city: newClientData.personal_city || null,
            personal_email: newClientData.personal_email || null,
            personal_phone: newClientData.personal_phone || null
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
        setTimeout(() => onJobCreated?.(), 100)
      } else {
        console.error('Error creating job:', data.error, data.details || '')
        alert(`Failed to create job: ${data.details || data.error || 'Unknown error'}`)
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

  const filteredClients = clients.filter(client =>
    `${client.first_name} ${client.last_name}`.toLowerCase().includes(clientSearch.toLowerCase()) ||
    (client.personal_address && client.personal_address.toLowerCase().includes(clientSearch.toLowerCase()))
  )

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fadeIn" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[520px] bg-white shadow-2xl z-50 flex flex-col animate-slideInRight">
        <div className="relative bg-gradient-to-r from-gray-50 to-white border-b border-gray-200 px-6 py-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Create New Job</h2>
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
            {(selectedClient || (isAddingNewClient && newClientData.first_name.trim())) && !expandedSections.client && (
                <button
                type="button"
                onClick={() => toggleSection('client')}
                className="w-full flex items-center justify-between py-3 px-2 transition-colors duration-150 ease-out hover:bg-gray-50 rounded"
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {selectedClient 
                      ? `${selectedClient.first_name} ${selectedClient.last_name}`
                      : `${newClientData.first_name} ${newClientData.last_name}`.trim()
                    }
                  </div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">
                    {selectedClient
                      ? (selectedClient.personal_address ? `${selectedClient.personal_address}, ${selectedClient.personal_city}` : 'No address')
                      : (newClientData.personal_address ? `${newClientData.personal_address}, ${newClientData.personal_city}` : 'No address')
                    }
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-400 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
              
            {/* Expanded view */}
            {expandedSections.client && (
              <div>
                <div className="py-3 space-y-4 animate-slideDown">
                  {selectedClient ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                        <h3 className="text-sm font-medium text-gray-900">Client Information</h3>
                <button
                          onClick={() => { setSelectedClient(null); setClientSearch('') }} 
                          className="text-gray-400 hover:text-gray-600 transition-colors duration-150 ease-out p-1 rounded hover:bg-gray-100"
                        >
                          <XMarkIcon className="w-4 h-4" />
                </button>
            </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">First Name</label>
                          <input
                            type="text"
                            value={selectedClient.first_name}
                            disabled
                            className="w-full px-3 py-2 border border-gray-200 rounded bg-gray-50 text-gray-700 text-sm cursor-not-allowed"
                          />
          </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Last Name</label>
                          <input
                            type="text"
                            value={selectedClient.last_name}
                            disabled
                            className="w-full px-3 py-2 border border-gray-200 rounded bg-gray-50 text-gray-700 text-sm cursor-not-allowed"
                          />
                  </div>
                </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Address</label>
                        <input
                          type="text"
                          value={selectedClient.personal_address || ''}
                          disabled
                          className="w-full px-3 py-2 border border-gray-200 rounded bg-gray-50 text-gray-700 text-sm cursor-not-allowed"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Zip Code</label>
                          <input
                            type="text"
                            value={selectedClient.personal_zip_code || ''}
                            disabled
                            className="w-full px-3 py-2 border border-gray-200 rounded bg-gray-50 text-gray-700 text-sm cursor-not-allowed"
                          />
                      </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">City</label>
                          <input
                            type="text"
                            value={selectedClient.personal_city || ''}
                            disabled
                            className="w-full px-3 py-2 border border-gray-200 rounded bg-gray-50 text-gray-700 text-sm cursor-not-allowed"
                          />
                    </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Email</label>
                          <input
                            type="email"
                            value={selectedClient.personal_email || ''}
                            disabled
                            className="w-full px-3 py-2 border border-gray-200 rounded bg-gray-50 text-gray-700 text-sm cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Phone</label>
                          <input
                            type="tel"
                            value={selectedClient.personal_phone || ''}
                            disabled
                            className="w-full px-3 py-2 border border-gray-200 rounded bg-gray-50 text-gray-700 text-sm cursor-not-allowed"
                          />
                        </div>
                      </div>
                    </div>
                  ) : isAddingNewClient ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                        <h3 className="text-sm font-medium text-gray-900">New Client Information</h3>
                    <button
                          onClick={() => { setIsAddingNewClient(false); setNewClientData({ first_name: '', last_name: '', personal_address: '', personal_zip_code: '', personal_city: '', personal_email: '', personal_phone: '' }) }} 
                          className="text-gray-400 hover:text-gray-600 transition-colors duration-150 ease-out p-1 rounded hover:bg-gray-100"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">First Name *</label>
                          <input
                            type="text"
                            value={newClientData.first_name}
                            onChange={(e) => setNewClientData({ ...newClientData, first_name: e.target.value })}
                            placeholder="First name"
                            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Last Name</label>
                          <input
                            type="text"
                            value={newClientData.last_name}
                            onChange={(e) => setNewClientData({ ...newClientData, last_name: e.target.value })}
                            placeholder="Last name"
                            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Address</label>
                        <input
                          type="text"
                          value={newClientData.personal_address}
                          onChange={(e) => setNewClientData({ ...newClientData, personal_address: e.target.value })}
                          placeholder="Street address"
                          className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Zip Code</label>
                          <input
                            type="text"
                            value={newClientData.personal_zip_code}
                            onChange={(e) => setNewClientData({ ...newClientData, personal_zip_code: e.target.value })}
                            placeholder="Zip code"
                            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">City</label>
                          <input
                            type="text"
                            value={newClientData.personal_city}
                            onChange={(e) => setNewClientData({ ...newClientData, personal_city: e.target.value })}
                            placeholder="City"
                            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Email</label>
                          <input
                            type="email"
                            value={newClientData.personal_email}
                            onChange={(e) => setNewClientData({ ...newClientData, personal_email: e.target.value })}
                            placeholder="Email"
                            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Phone</label>
                          <input
                            type="tel"
                            value={newClientData.personal_phone}
                            onChange={(e) => setNewClientData({ ...newClientData, personal_phone: e.target.value })}
                            placeholder="Phone"
                            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                          />
                        </div>
                      </div>
                  </div>
                ) : (
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-gray-900 pb-2 border-b border-gray-100">Select Client</h3>
                  <div className="relative dropdown-container">
                    <input
                      type="text"
                      value={clientSearch}
                          onChange={(e) => { setClientSearch(e.target.value); setShowClientDropdown(true) }}
                      onFocus={() => setShowClientDropdown(true)}
                      placeholder="Search for a client..."
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
                                    <div className="text-sm font-medium text-gray-900">{client.first_name} {client.last_name}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                {client.personal_address ? `${client.personal_address}, ${client.personal_city}` : 'No address'}
                              </div>
                            </button>
                                ))}
                                <button
                                  onClick={() => { setIsAddingNewClient(true); setShowClientDropdown(false); setClientSearch('') }}
                                  className="w-full px-3 py-2 text-left hover:bg-blue-50 border-t border-gray-200 bg-gray-50 transition-colors duration-150 ease-out sticky bottom-0"
                                >
                                  <div className="text-sm font-medium text-blue-600 flex items-center">
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
                                  className="w-full px-3 py-2 text-left hover:bg-blue-50 border-t border-gray-200 bg-gray-50 transition-colors duration-150 ease-out"
                                >
                                  <div className="text-sm font-medium text-blue-600 flex items-center">
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
                                    <div className="text-xs text-gray-500 mt-0.5">{service.price} DKK • {service.duration_minutes}min</div>
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

                    <div className="space-y-2">
                <div className="flex items-center justify-between">
                        <label className="block text-xs text-gray-500">Date & Time</label>
                  <div className="relative">
                    <button
                      type="button"
                            onClick={() => { setShowTimeFromPicker(!showTimeFromPicker); setShowDatePicker(false) }}
                            className="text-xs text-gray-500 hover:text-gray-700 transition-colors duration-150 ease-out"
                      title="Click to set time (optional)"
                    >
                            {jobTimeFrom && jobTimeTo ? `${jobTimeFrom} - ${jobTimeTo}`
                            : jobTimeFrom ? jobTimeFrom
                            : jobTimeTo ? jobTimeTo
                            : 'Set time'}
                    </button>
                    
                    {showTimeFromPicker && (
                            <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 p-4 min-w-[280px] animate-fadeIn" data-time-picker>
                              <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                                <h3 className="text-sm font-medium text-gray-900">Set Time</h3>
                                <button type="button" onClick={() => setShowTimeFromPicker(false)} className="text-gray-400 hover:text-gray-600 transition-colors duration-150 ease-out p-1 rounded hover:bg-gray-100">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>

                              <div className="mb-3">
                                <div className="flex space-x-1 bg-gray-100 rounded p-0.5">
                            <button
                              type="button"
                                    onClick={() => { setJobTimeTo(''); setIsTimeRangeMode(false) }}
                                    className={`flex-1 py-1.5 px-2 text-xs font-medium rounded transition-colors duration-150 ease-out ${
                                      !isTimeRangeMode ? 'bg-white text-gray-900' : 'text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              Single Time
                            </button>
                            <button
                              type="button"
                                    onClick={() => { setIsTimeRangeMode(true); if (!jobTimeTo && jobTimeFrom) setJobTimeTo(jobTimeFrom) }}
                                    className={`flex-1 py-1.5 px-2 text-xs font-medium rounded transition-colors duration-150 ease-out ${
                                      isTimeRangeMode ? 'bg-white text-gray-900' : 'text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              Time Range
                            </button>
                          </div>
                        </div>

                              <div className="space-y-2">
                          {!isTimeRangeMode ? (
                            <div>
                                    <label className="block text-xs text-gray-500 mb-1.5">Time</label>
                              <input
                                type="time"
                                value={jobTimeFrom}
                                onChange={(e) => setJobTimeFrom(e.target.value)}
                                      className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out bg-white"
                              />
                            </div>
                          ) : (
                            <div>
                                    <label className="block text-xs text-gray-500 mb-1.5">Between</label>
                                    <div className="flex items-center space-x-2">
                                <input
                                  type="time"
                                  value={jobTimeFrom}
                                  onChange={(e) => setJobTimeFrom(e.target.value)}
                                        className="flex-1 px-3 py-2 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out bg-white"
                                />
                                      <span className="text-xs text-gray-500">to</span>
                                <input
                                  type="time"
                                  value={jobTimeTo}
                                  onChange={(e) => setJobTimeTo(e.target.value)}
                                        className="flex-1 px-3 py-2 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out bg-white"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-gray-100">
                          <div className="flex space-x-2">
                            <button
                              type="button"
                                    onClick={() => { setJobTimeFrom(''); setJobTimeTo(''); setShowTimeFromPicker(false) }}
                                    className="flex-1 py-2 px-3 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors duration-150 ease-out rounded hover:bg-gray-100"
                            >
                              Clear
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowTimeFromPicker(false)}
                                    className="flex-1 py-2 px-3 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-150 ease-out"
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                        </div>
                  </div>
                </div>
                
                <div className="relative dropdown-container">
                  <button
                    type="button"
                        onClick={() => { setShowDatePicker(!showDatePicker); setShowTimeFromPicker(false) }}
                        className={`w-full px-3 py-2 rounded flex items-center justify-between transition-colors duration-150 ease-out text-sm ${
                      jobDate 
                            ? 'bg-blue-600 text-white hover:bg-blue-700' 
                            : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                    }`}
                    title="Click to select date (required)"
                  >
                        <span>
                        {jobDate ? new Date(jobDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select Date (Required)'}
                      </span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                  </button>
                  
                  {showDatePicker && (
                        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 p-3 min-w-[280px] animate-fadeIn">
                      <CalendarView 
                        selectedDate={jobDate}
                            onDateSelect={(date) => { setJobDate(date); setShowDatePicker(false) }}
                        selectedUserId={selectedUserId}
                        selectedServices={selectedServices}
                        selectedClient={selectedClient}
                        jobType={jobType}
                        selectedPastJob={selectedPastJob}
                      />
                    </div>
                  )}
              </div>

                  <div className="space-y-2 pt-2">
                {!showNoteInput ? (
                  <button
                    type="button"
                    onClick={() => setShowNoteInput(true)}
                        className="w-full flex items-center justify-center px-3 py-2 bg-gray-50 text-gray-700 border border-gray-200 rounded hover:bg-gray-100 transition-colors duration-150 ease-out text-sm"
                  >
                        Add Note
                  </button>
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
                </div>
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

        <div className="border-t border-gray-200 bg-white p-4">
          {!createdJobId ? (
              <button
              onClick={handleSubmitJob}
              disabled={isSubmitting || (!selectedClient && !isAddingNewClient) || (isAddingNewClient && !newClientData.first_name.trim()) || (jobType === 'new' ? selectedServices.length === 0 : !selectedPastJob) || !selectedUserId || !jobDate}
              className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 ease-out"
            >
              {isSubmitting ? 'Creating...' : 'Create Job'}
              </button>
          ) : (
            <button
              onClick={onClose}
              className="w-full bg-green-600 text-white py-2.5 px-4 rounded font-medium hover:bg-green-700 transition-colors duration-150 ease-out"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </>
  )
}
