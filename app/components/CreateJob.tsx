'use client'

import { useState, useEffect } from 'react'
import { useUser } from '../hooks/useUser'
import { XMarkIcon, PlusIcon, UserIcon, ClockIcon, CalendarIcon } from '@heroicons/react/24/outline'

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
  
  // Fetch user work hours and existing jobs when selected user changes
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
      const response = await fetch(`/api/api/work-hours/${selectedUserId}`, {
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
      // Get start and end of current month
      const startDate = new Date(year, month, 1).toISOString().split('T')[0]
      const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0]
      
      const response = await fetch(`/api/api/jobs?start_date=${startDate}&end_date=${endDate}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok) {
        // Filter jobs for the selected user
        const userJobs = data.jobs.filter((job: any) => job.assigned_user_id === selectedUserId)
        setExistingJobs(userJobs)
      }
    } catch (error) {
      console.error('Error fetching existing jobs:', error)
    }
  }
  
  // Calculate total duration of selected services
  const getTotalJobDuration = () => {
    if (jobType === 'redo' && selectedPastJob) {
      // For re-do jobs, use the duration from the past job
      return selectedPastJob.total_duration || 0
    } else {
      // For new jobs, calculate from selected services
      return selectedServices.reduce((total, service) => {
        return total + (service.customDuration || service.duration_minutes)
      }, 0)
    }
  }
  
  // Get day of week for a given date
  const getDayOfWeek = (date: Date) => {
    return date.getDay() // 0 = Sunday, 1 = Monday, etc.
  }
  
  // Get work hours for a specific day of week
  const getWorkHoursForDay = (dayOfWeek: number) => {
    if (!userWorkHours) return 0
    
    const dayMap = {
      0: 'sunday_hours',    // Sunday
      1: 'monday_hours',    // Monday
      2: 'tuesday_hours',   // Tuesday
      3: 'wednesday_hours', // Wednesday
      4: 'thursday_hours',  // Thursday
      5: 'friday_hours',    // Friday
      6: 'saturday_hours'   // Saturday
    }
    
    const dayKey = dayMap[dayOfWeek as keyof typeof dayMap]
    return userWorkHours[dayKey] || 0
  }
  
  // Get existing jobs for a specific date
  const getJobsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return existingJobs.filter(job => {
      const jobDate = new Date(job.scheduled_date).toISOString().split('T')[0]
      return jobDate === dateStr
    })
  }
  
  // Calculate total duration of existing jobs for a date
  const getExistingJobsDuration = (date: Date) => {
    const jobsForDate = getJobsForDate(date)
    return jobsForDate.reduce((total, job) => {
      // Sum up all service durations for this job (total_duration is in minutes)
      return total + (job.total_duration || 0)
    }, 0)
  }
  
  // Check if a date has enough available time
  const isDateAvailable = (day: number) => {
    if (!selectedUserId) return false
    
    // For new jobs, need selected services
    if (jobType === 'new' && selectedServices.length === 0) return false
    
    // For re-do jobs, need selected past job
    if (jobType === 'redo' && !selectedPastJob) return false
    
    const date = new Date(year, month, day)
    const dayOfWeek = getDayOfWeek(date)
    const workHours = getWorkHoursForDay(dayOfWeek)
    const workMinutes = workHours * 60 // Convert hours to minutes
    const existingJobsMinutes = getExistingJobsDuration(date)
    const newJobMinutes = getTotalJobDuration()
    
    return (workMinutes - existingJobsMinutes) >= newJobMinutes
  }
  
  // Get first day of month and number of days
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingDayOfWeek = firstDay.getDay()
  
  // Create array of days
  const days = []
  
  // Add empty cells for days before the first day of the month
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null)
  }
  
  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day)
  }
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  
  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1))
  }
  
  const goToNextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1))
  }
  
  const handleDateClick = (day: number) => {
    // Create date string directly without timezone conversion
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    console.log('🗓️ CALENDAR DEBUG: handleDateClick', {
      clickedDay: day,
      year,
      month,
      monthName: new Date(year, month).toLocaleString('default', { month: 'long' }),
      constructedDateString: dateString,
      currentDate: new Date().toISOString().split('T')[0]
    })
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
      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={goToPreviousMonth}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="text-lg font-medium text-gray-900">
          {monthNames[month]} {year}
        </h3>
        <button
          onClick={goToNextMonth}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      
      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-1">
        {dayNames.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
            {day}
          </div>
        ))}
      </div>
      
      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => (
          <div key={index} className="aspect-square">
            {day ? (
              <button
                onClick={() => handleDateClick(day)}
                className={`w-full h-full text-xs rounded transition-colors relative ${
                  isSelected(day)
                    ? 'bg-blue-600 text-white font-semibold'
                    : isToday(day)
                    ? 'bg-blue-100 text-blue-600 font-semibold'
                    : isPast(day)
                    ? 'text-gray-300 cursor-not-allowed'
                    : isDateAvailable(day)
                    ? 'bg-green-100 text-green-700 hover:bg-green-200 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                disabled={isPast(day)}
                title={
                  isDateAvailable(day) 
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
      
      {/* Daily Jobs Section */}
      {selectedDate && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          <div className="flex items-center space-x-2 mb-3">
            <div className="w-4 h-4 bg-blue-100 rounded flex items-center justify-center">
              <span className="text-xs text-blue-600">📋</span>
            </div>
            <h4 className="text-sm font-medium text-gray-700">
              Jobs for {new Date(selectedDate).toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
              })}
            </h4>
          </div>
          
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {/* Existing Jobs */}
            {getJobsForDate(new Date(selectedDate)).map((job, index) => (
              <div key={job.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-900 truncate">
                    {job.first_name} {job.last_name}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {job.personal_address ? `${job.personal_address}, ${job.personal_city}` : 'No address'}
                  </div>
                </div>
                <div className="text-xs text-gray-600 font-medium ml-2">
                  {Math.round(job.total_duration / 60)}h
                </div>
              </div>
            ))}
            
            {/* New Job Preview */}
            {selectedUserId && selectedClient && (
              (jobType === 'new' && selectedServices.length > 0) || 
              (jobType === 'redo' && selectedPastJob)
            ) && (
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
                <div className="text-xs text-blue-700 font-medium ml-2">
                  {Math.round(getTotalJobDuration() / 60)}h
                </div>
              </div>
            )}
            
            {/* No jobs message */}
            {getJobsForDate(new Date(selectedDate)).length === 0 && (!selectedUserId || !selectedClient || 
              (jobType === 'new' && selectedServices.length === 0) || 
              (jobType === 'redo' && !selectedPastJob)
            ) && (
              <div className="text-xs text-gray-500 text-center py-2">
                No jobs scheduled for this date
              </div>
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
}

interface CreateJobProps {
  isOpen: boolean
  onClose: () => void
  onJobCreated?: () => void
}

export default function CreateJob({ isOpen, onClose, onJobCreated }: CreateJobProps) {
  const { user } = useUser()
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
  const [showTimeToPicker, setShowTimeToPicker] = useState(false)
  const [isTimeRangeMode, setIsTimeRangeMode] = useState(false)
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdJobId, setCreatedJobId] = useState<number | null>(null)
  
  // Wizard steps
  const [currentStep, setCurrentStep] = useState(1)
  const [jobType, setJobType] = useState<'new' | 'redo'>('new')
  
  // Editing states for service values
  const [editingPrice, setEditingPrice] = useState<number | null>(null)
  const [editingDuration, setEditingDuration] = useState<number | null>(null)
  const [pastJobs, setPastJobs] = useState<PastJob[]>([])
  const [selectedPastJob, setSelectedPastJob] = useState<PastJob | null>(null)

  // Fetch services, clients, and users
  useEffect(() => {
    if (isOpen) {
      fetchServices()
      fetchClients()
      fetchUsers()
    }
  }, [isOpen])

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setJobDate('')
      setJobTimeFrom('')
      setJobTimeTo('')
      setIsTimeRangeMode(false)
      setJobNote('')
      setShowNoteInput(false)
      setSelectedServices([])
      setSelectedClient(null)
      setSelectedUserId(null)
      setServiceSearch('')
      setClientSearch('')
      setCreatedJobId(null)
      setCurrentStep(1)
      setJobType('new')
      setSelectedPastJob(null)
      setEditingPrice(null)
      setEditingDuration(null)
    }
  }, [isOpen])

  // Auto-advance to step 2 when client is selected
  useEffect(() => {
    if (selectedClient && currentStep === 1) {
      setCurrentStep(2)
    }
  }, [selectedClient, currentStep])

  // Fetch past jobs when client is selected and job type is 'redo'
  useEffect(() => {
    if (selectedClient && jobType === 'redo') {
      fetchPastJobs(selectedClient.id)
    } else {
      setPastJobs([])
      setSelectedPastJob(null)
    }
  }, [selectedClient, jobType])

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      // Don't close if clicking inside dropdown containers or time picker popup
      if (!target.closest('.dropdown-container') && !target.closest('[data-time-picker]')) {
        setShowServiceDropdown(false)
        setShowClientDropdown(false)
        setShowDatePicker(false)
        setShowTimeFromPicker(false)
        setShowTimeToPicker(false)
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
      const response = await fetch('/api/api/services', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok) {
        setServices(data.services || [])
      }
    } catch (error) {
      console.error('Error fetching services:', error)
    }
  }

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/api/clients', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok) {
        setClients(data.clients || [])
      }
    } catch (error) {
      console.error('Error fetching clients:', error)
    }
  }

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok) {
        const fetchedUsers = data.users || []
        setUsers(fetchedUsers)
        
        // If there's only one user, auto-select them
        if (fetchedUsers.length === 1) {
          setSelectedUserId(fetchedUsers[0].id)
        }
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const fetchPastJobs = async (clientId: number) => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/api/clients/${clientId}/jobs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok) {
        setPastJobs(data.jobs || [])
      }
    } catch (error) {
      console.error('Error fetching past jobs:', error)
    }
  }

  const handleServiceSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setServiceSearch(e.target.value)
    setShowServiceDropdown(true)
  }

  const handleClientSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setClientSearch(e.target.value)
    setShowClientDropdown(true)
  }

  const addService = (service: Service) => {
    const newSelectedService: SelectedService = {
      ...service,
      customPrice: service.price.toString(),
      customDuration: service.duration_minutes
    }
    setSelectedServices([...selectedServices, newSelectedService])
    setServiceSearch('')
    setShowServiceDropdown(false)
  }

  const selectClient = (client: Client) => {
    setSelectedClient(client)
    setClientSearch('')
    setShowClientDropdown(false)
  }

  const removeService = (serviceId: number) => {
    setSelectedServices(selectedServices.filter(s => s.id !== serviceId))
  }

  const removeClient = () => {
    setSelectedClient(null)
    setClientSearch('')
  }

  const updateServicePrice = (serviceId: number, price: string) => {
    setSelectedServices(selectedServices.map(s => 
      s.id === serviceId ? { ...s, customPrice: price } : s
    ))
  }

  const updateServiceDuration = (serviceId: number, duration: number) => {
    setSelectedServices(selectedServices.map(s => 
      s.id === serviceId ? { ...s, customDuration: duration } : s
    ))
  }

  const handlePriceKeyPress = (e: React.KeyboardEvent<HTMLInputElement>, serviceId: number) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
  }

  const handleDurationKeyPress = (e: React.KeyboardEvent<HTMLInputElement>, serviceId: number) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
  }

  const startEditingPrice = (serviceId: number) => {
    setEditingPrice(serviceId)
  }

  const startEditingDuration = (serviceId: number) => {
    setEditingDuration(serviceId)
  }

  const finishEditingPrice = (serviceId: number, value: string) => {
    updateServicePrice(serviceId, value)
    setEditingPrice(null)
  }

  const finishEditingDuration = (serviceId: number, value: string) => {
    updateServiceDuration(serviceId, parseInt(value) || 0)
    setEditingDuration(null)
  }

  const handleSubmitJob = async () => {
    // For re-do jobs, we need a selected past job
    const hasValidServices = jobType === 'new' ? selectedServices.length > 0 : true
    if (!selectedClient || !selectedUserId || !hasValidServices || (jobType === 'redo' && !selectedPastJob)) {
      return
    }

    try {
      setIsSubmitting(true)
      const token = localStorage.getItem('token')
      
      const jobData = {
        title: '', // No title needed
        client_id: selectedClient.id,
        assigned_user_id: selectedUserId,
        services: jobType === 'new' ? selectedServices.map(service => ({
          service_id: service.id,
          custom_price: parseFloat(service.customPrice) || service.price,
          custom_duration: service.customDuration
        })) : (selectedPastJob?.services?.map(service => ({
          service_id: service.service_id,
          custom_price: service.custom_price,
          custom_duration: service.custom_duration_minutes
        })) || []), // For re-do jobs, use services from the original job
        scheduled_date: jobDate ? jobDate.split('T')[0] : null, // Ensure only date part is sent
        scheduled_time_from: jobTimeFrom && jobTimeFrom.trim() !== '' ? jobTimeFrom : null, // Send from time separately, only if not empty
        scheduled_time_to: jobTimeTo && jobTimeTo.trim() !== '' ? jobTimeTo : null, // Send to time separately, only if not empty
        note: jobNote.trim() || null // Include the note if provided
      }

      console.log('🚀 JOB SUBMISSION DEBUG:', {
        jobDate,
        jobTimeFrom,
        jobTimeTo,
        finalDate: jobData.scheduled_date,
        jobDateType: typeof jobDate,
        jobTimeFromType: typeof jobTimeFrom,
        jobTimeToType: typeof jobTimeTo,
        rawJobData: jobData
      })
      
      console.log('📅 DATE CONSTRUCTION DEBUG:', {
        originalJobDate: jobDate,
        hasTimeFrom: !!(jobTimeFrom && jobTimeFrom.trim() !== ''),
        hasTimeTo: !!(jobTimeTo && jobTimeTo.trim() !== ''),
        timeFromValue: jobTimeFrom,
        timeToValue: jobTimeTo,
        constructedDate: jobData.scheduled_date,
        expectedFormat: 'YYYY-MM-DDTHH:MM:SS.sssZ'
      })

      const response = await fetch('/api/api/jobs', {
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
        console.log('✅ JOB CREATED SUCCESSFULLY - Calling onJobCreated callback')
        // Call the callback with a slight delay to ensure the job is fully processed
        setTimeout(() => {
          onJobCreated?.()
        }, 100)
      } else {
        console.error('Error creating job:', data.error)
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
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />
      
      {/* Slideout */}
      <div className="fixed right-0 top-0 h-full w-[484px] bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="relative bg-gray-50 border-b border-gray-200 p-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 bg-white rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors shadow-sm border"
          >
            <XMarkIcon className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Breadcrumb Navigation */}
        {(currentStep > 1) && (
          <div className="bg-gray-50 border-b border-gray-200 p-3">
            <div className="flex items-center space-x-2">
              {/* Client Breadcrumb */}
              {selectedClient && (
                <button
                  onClick={() => setCurrentStep(1)}
                  className="flex items-center space-x-2 px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-200 transition-colors"
                >
                  <span>👤</span>
                  <span>{selectedClient.first_name} {selectedClient.last_name}</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              
              {/* Services Breadcrumb */}
              {currentStep > 2 && selectedServices.length > 0 && (
                <button
                  onClick={() => setCurrentStep(2)}
                  className="flex items-center space-x-2 px-3 py-1 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium hover:bg-orange-200 transition-colors"
                >
                  <span>🛠️</span>
                  <span>{selectedServices.length} service{selectedServices.length > 1 ? 's' : ''}</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Step 1: Client Selection */}
          {currentStep === 1 && (
            <div className="space-y-4">
              {/* Client Selection */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 bg-purple-100 rounded flex items-center justify-center">
                    <span className="text-xs text-purple-600">👤</span>
                  </div>
                  <label className="text-sm font-medium text-gray-700">Client</label>
                </div>
                
                {selectedClient ? (
                  <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900">
                        {selectedClient.first_name} {selectedClient.last_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {selectedClient.personal_address ? `${selectedClient.personal_address}, ${selectedClient.personal_city}` : 'No address'}
                      </div>
                    </div>
                    <button
                      onClick={removeClient}
                      className="ml-3 text-red-600 hover:text-red-800 transition-colors"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative dropdown-container">
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={handleClientSearch}
                      onFocus={() => setShowClientDropdown(true)}
                      placeholder="Search for a client..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors text-sm"
                    />
                    
                    {showClientDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                        {filteredClients.length > 0 ? (
                          filteredClients.map((client) => (
                            <button
                              key={client.id}
                              onClick={() => selectClient(client)}
                              className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                            >
                              <div className="text-sm font-medium text-gray-900">
                                {client.first_name} {client.last_name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {client.personal_address ? `${client.personal_address}, ${client.personal_city}` : 'No address'}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-gray-500">
                            No clients found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Job Type and Details */}
          {currentStep === 2 && (
            <div className="space-y-4">
              {/* Job Type Selection */}
              <div className="flex items-center space-x-4">
                <button
                  type="button"
                  onClick={() => setJobType('new')}
                  className={`text-xs transition-colors ${
                    jobType === 'new' 
                      ? 'text-blue-600 border-b border-blue-600 pb-1' 
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  New Job
                </button>
                <button
                  type="button"
                  onClick={() => setJobType('redo')}
                  className={`text-xs transition-colors ${
                    jobType === 'redo' 
                      ? 'text-blue-600 border-b border-blue-600 pb-1' 
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  Re-do Job
                </button>
              </div>

              {/* Past Jobs (only for re-do jobs) */}
              {jobType === 'redo' && (
                <div className="space-y-2">
                  {pastJobs.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {pastJobs.map((job) => (
                        <button
                          key={job.id}
                          type="button"
                          onClick={() => setSelectedPastJob(job)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
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
                      <div className="text-sm">There are no jobs...</div>
                      <div className="text-xs mt-1">Here you can find past jobs for this client</div>
                    </div>
                  )}
                </div>
              )}

              {/* Services - Only show for new jobs */}
              {jobType === 'new' && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 bg-orange-100 rounded flex items-center justify-center">
                      <span className="text-xs text-orange-600">🛠️</span>
                    </div>
                    <label className="text-sm font-medium text-gray-700">Services</label>
                  </div>
                
                {/* Service Search */}
                <div className="relative dropdown-container">
                  <input
                    type="text"
                    value={serviceSearch}
                    onChange={handleServiceSearch}
                    onFocus={() => setShowServiceDropdown(true)}
                    placeholder="Search for services..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors text-sm"
                  />
                  
                  {showServiceDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                      {filteredServices.length > 0 ? (
                        filteredServices.map((service) => (
                          <button
                            key={service.id}
                            onClick={() => addService(service)}
                            className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                          >
                            <div className="text-sm font-medium text-gray-900">
                              {service.title}
                            </div>
                            <div className="text-xs text-gray-500">
                              {service.price} DKK • {service.duration_minutes}min
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-gray-500">
                          No services found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Selected Services */}
                {selectedServices.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {selectedServices.map((service) => (
                      <div key={service.id} className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm border border-gray-200">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-900">
                            {service.title}
                          </div>
                        </div>
                        <div className="flex items-center space-x-4 ml-3">
                          <div className="flex items-center space-x-1">
                            <span className="text-xs text-gray-500">Price:</span>
                            {editingPrice === service.id ? (
                              <input
                                type="number"
                                defaultValue={service.customPrice}
                                onBlur={(e) => finishEditingPrice(service.id, e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && finishEditingPrice(service.id, e.currentTarget.value)}
                                className="text-xs text-blue-600 bg-white border border-blue-300 rounded px-1 py-0.5 w-16"
                                autoFocus
                              />
                            ) : (
                              <button
                                onClick={() => startEditingPrice(service.id)}
                                className="text-xs text-blue-600 underline cursor-pointer bg-transparent border-none hover:text-blue-700"
                              >
                                {service.customPrice}kr.
                              </button>
                            )}
                          </div>
                          <div className="flex items-center space-x-1">
                            <span className="text-xs text-gray-500">Time:</span>
                            {editingDuration === service.id ? (
                              <input
                                type="number"
                                defaultValue={service.customDuration}
                                onBlur={(e) => finishEditingDuration(service.id, e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && finishEditingDuration(service.id, e.currentTarget.value)}
                                className="text-xs text-blue-600 bg-white border border-blue-300 rounded px-1 py-0.5 w-12"
                                autoFocus
                              />
                            ) : (
                              <button
                                onClick={() => startEditingDuration(service.id)}
                                className="text-xs text-blue-600 underline cursor-pointer bg-transparent border-none hover:text-blue-700"
                              >
                                {service.customDuration}min.
                              </button>
                            )}
                          </div>
                          <button
                            onClick={() => removeService(service.id)}
                            className="text-red-600 hover:text-red-800 transition-colors ml-2"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>
          )}

          {/* Step 3: User Assignment and Scheduling */}
          {currentStep === 3 && (
            <div className="space-y-4">
              {/* User Selection */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 bg-purple-100 rounded flex items-center justify-center">
                    <UserIcon className="w-3 h-3 text-purple-600" />
                  </div>
                  <label className="text-sm font-medium text-gray-700">Assign to User</label>
                </div>
                {users.length === 1 ? (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 text-sm">
                    {users[0].first_name} {users[0].last_name} ({users[0].role})
                  </div>
                ) : (
                  <select
                    value={selectedUserId || ''}
                    onChange={(e) => setSelectedUserId(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors text-sm"
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

              {/* Date and Time Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-5 h-5 bg-green-100 rounded flex items-center justify-center">
                      <CalendarIcon className="w-3 h-3 text-green-600" />
                    </div>
                    <label className="text-sm font-medium text-gray-700">Schedule</label>
                  </div>
                  
                  {/* Time Picker Button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowTimeFromPicker(!showTimeFromPicker)
                        setShowDatePicker(false)
                        setShowTimeToPicker(false)
                      }}
                      className="text-sm text-gray-600 hover:text-gray-800 transition-colors"
                      title="Click to set time (optional)"
                    >
                      Time: <span className="underline">
                        {jobTimeFrom && jobTimeTo 
                          ? `${jobTimeFrom} - ${jobTimeTo}`
                          : jobTimeFrom 
                            ? jobTimeFrom
                            : jobTimeTo
                              ? jobTimeTo
                              : '--:--'
                        }
                      </span>
                    </button>
                    
                    {showTimeFromPicker && (
                      <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 min-w-[320px]" data-time-picker>
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold text-gray-900">Set Time</h3>
                          <button
                            type="button"
                            onClick={() => setShowTimeFromPicker(false)}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>

                        {/* Time Type Selection */}
                        <div className="mb-4">
                          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
                            <button
                              type="button"
                              onClick={() => {
                                // Single Time mode: clear the "to" time and disable range mode
                                setJobTimeTo('')
                                setIsTimeRangeMode(false)
                              }}
                              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors ${
                                !isTimeRangeMode
                                  ? 'bg-white text-gray-900 shadow-sm'
                                  : 'text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              Single Time
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                // Time Range mode: enable range mode and set "to" time if it's empty
                                setIsTimeRangeMode(true)
                                if (!jobTimeTo && jobTimeFrom) {
                                  setJobTimeTo(jobTimeFrom)
                                }
                              }}
                              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors ${
                                isTimeRangeMode
                                  ? 'bg-white text-gray-900 shadow-sm'
                                  : 'text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              Time Range
                            </button>
                          </div>
                        </div>

                        {/* Time Inputs */}
                        <div className="space-y-3">
                          {!isTimeRangeMode ? (
                            /* Single Time */
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-2">Time</label>
                              <input
                                type="time"
                                value={jobTimeFrom}
                                onChange={(e) => setJobTimeFrom(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                              />
                            </div>
                          ) : (
                            /* Time Range - Inline */
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-2">Between</label>
                              <div className="flex items-center space-x-3">
                                <input
                                  type="time"
                                  value={jobTimeFrom}
                                  onChange={(e) => setJobTimeFrom(e.target.value)}
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                />
                                <span className="text-sm text-gray-500 font-medium">to</span>
                                <input
                                  type="time"
                                  value={jobTimeTo}
                                  onChange={(e) => setJobTimeTo(e.target.value)}
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Quick Actions */}
                        <div className="mt-4 pt-3 border-t border-gray-100">
                          <div className="flex space-x-2">
                            <button
                              type="button"
                              onClick={() => {
                                setJobTimeFrom('')
                                setJobTimeTo('')
                                setShowTimeFromPicker(false)
                              }}
                              className="flex-1 py-2 px-3 text-xs text-gray-600 hover:text-gray-800 transition-colors"
                            >
                              Clear
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowTimeFromPicker(false)}
                              className="flex-1 py-2 px-3 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Calendar View */}
                <div className="relative dropdown-container">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDatePicker(!showDatePicker)
                      setShowTimeFromPicker(false)
                      setShowTimeToPicker(false)
                    }}
                    className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-colors text-sm ${
                      jobDate 
                        ? 'bg-green-100 hover:bg-green-200 text-green-700 border border-green-200' 
                        : 'bg-red-100 hover:bg-red-200 text-red-700 border border-red-200'
                    }`}
                    title="Click to select date (required)"
                  >
                    <div className="flex items-center space-x-2">
                      <CalendarIcon className="w-3 h-3" />
                      <span className="font-medium">
                        {jobDate ? new Date(jobDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select Date (Required)'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">📅</span>
                  </button>
                  
                  {showDatePicker && (
                    <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-4 min-w-[280px]">
                      <CalendarView 
                        selectedDate={jobDate}
                        onDateSelect={(date) => {
                          setJobDate(date)
                          setShowDatePicker(false)
                        }}
                        selectedUserId={selectedUserId}
                        selectedServices={selectedServices}
                        selectedClient={selectedClient}
                        jobType={jobType}
                        selectedPastJob={selectedPastJob}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Notes Section */}
              <div className="space-y-2">
                {!showNoteInput ? (
                  <button
                    type="button"
                    onClick={() => setShowNoteInput(true)}
                    className="flex items-center space-x-2 px-3 py-2 bg-gray-50 text-black border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors text-sm"
                  >
                    <span>📝</span>
                    <span>add note +</span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={jobNote}
                      onChange={(e) => setJobNote(e.target.value)}
                      placeholder="Add a note for this job..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-colors text-sm resize-none"
                      rows={3}
                      style={{ minHeight: '80px', maxHeight: '120px' }}
                    />
                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setJobNote('')
                          setShowNoteInput(false)
                        }}
                        className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNoteInput(false)}
                        className="px-3 py-1 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
                      >
                        Save Note
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Success State */}
          {createdJobId && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <span className="text-2xl">✅</span>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Job Created Successfully!</h3>
                <p className="text-sm text-gray-600">The job has been scheduled and assigned.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 p-6">
          {!createdJobId ? (
            <div className="flex justify-between items-center">
              <button
                onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
                disabled={currentStep === 1}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                ← Back
              </button>
              <div className="flex space-x-2">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`w-2 h-2 rounded-full ${
                      step === currentStep ? 'bg-blue-600' : step < currentStep ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={() => {
                  if (currentStep === 3) {
                    // Create the job
                    handleSubmitJob()
                  } else {
                    setCurrentStep(Math.min(3, currentStep + 1))
                  }
                }}
                disabled={
                  isSubmitting || 
                  (currentStep === 1 && !selectedClient) ||
                  (currentStep === 2 && (jobType === 'new' ? selectedServices.length === 0 : !selectedPastJob)) ||
                  (currentStep === 3 && (!selectedUserId || !jobDate))
                }
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {currentStep === 3 ? (isSubmitting ? 'Creating...' : 'Create Job') : 'Next →'}
              </button>
            </div>
          ) : (
            <button
              onClick={onClose}
              className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </>
  )
}