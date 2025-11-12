'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@/app/hooks/useUser'
import AppLayout from '@/app/components/AppLayout'
import CreateJob from '@/app/components/CreateJob'
import JobViewSlideout from '@/app/components/JobViewSlideout'
import AddClientModal from '@/app/components/AddClientModal'

interface User {
  id: number
  first_name: string
  last_name: string
  email: string
  role: string
}

interface WorkHours {
  monday_hours: number
  tuesday_hours: number
  wednesday_hours: number
  thursday_hours: number
  friday_hours: number
  saturday_hours: number
  sunday_hours: number
}

export default function JobsPage() {
  const { user, loading: userLoading } = useUser()
  const [currentWeek, setCurrentWeek] = useState(new Date())
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [viewingJob, setViewingJob] = useState<any>(null)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isCreateClientModalOpen, setIsCreateClientModalOpen] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [showWeekend, setShowWeekend] = useState(false)
  const [workHours, setWorkHours] = useState<WorkHours | null>(null)

  // Get the start of the week (Monday)
  const getWeekStart = (date: Date) => {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(d.setDate(diff))
  }

  // Get weekdays (Monday to Sunday - all 7 days)
  const getWeekDays = () => {
    const start = getWeekStart(currentWeek)
    const days = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(start)
      day.setDate(start.getDate() + i)
      days.push(day)
    }
    return days
  }

  const weekDays = getWeekDays()

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    })
  }

  const formatWeekday = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short' 
    })
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  // Navigation functions
  const goToPreviousWeek = () => {
    const newWeek = new Date(currentWeek)
    newWeek.setDate(currentWeek.getDate() - 7)
    setCurrentWeek(newWeek)
  }

  const goToNextWeek = () => {
    const newWeek = new Date(currentWeek)
    newWeek.setDate(currentWeek.getDate() + 7)
    setCurrentWeek(newWeek)
  }

  const goToCurrentWeek = () => {
    setCurrentWeek(new Date())
  }

  // Fetch users for employee selector
  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:3002/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setUsers(data.users || [])
        if (data.users && data.users.length > 0 && !selectedUserId) {
          setSelectedUserId(data.users[0].id)
        }
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  // Fetch work hours for selected user
  const fetchWorkHours = async () => {
    if (!selectedUserId) return
    
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:3002/api/work-hours/${selectedUserId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (response.ok) {
        const rawWorkHours = data.workHours || {
          monday_hours: 7.5,
          tuesday_hours: 7.5,
          wednesday_hours: 7.5,
          thursday_hours: 7.5,
          friday_hours: 7.0,
          saturday_hours: 0,
          sunday_hours: 0
        }
        
        // Ensure all values are numbers (parse strings if needed)
        const parsedWorkHours: WorkHours = {
          monday_hours: parseFloat(rawWorkHours.monday_hours) || 0,
          tuesday_hours: parseFloat(rawWorkHours.tuesday_hours) || 0,
          wednesday_hours: parseFloat(rawWorkHours.wednesday_hours) || 0,
          thursday_hours: parseFloat(rawWorkHours.thursday_hours) || 0,
          friday_hours: parseFloat(rawWorkHours.friday_hours) || 0,
          saturday_hours: parseFloat(rawWorkHours.saturday_hours) || 0,
          sunday_hours: parseFloat(rawWorkHours.sunday_hours) || 0
        }
        
        setWorkHours(parsedWorkHours)
      }
    } catch (error) {
      console.error('Error fetching work hours:', error)
    }
  }

  // Fetch jobs for the current week
  const fetchJobsForWeek = async () => {
    if (!selectedUserId) return
    
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      
      const startDate = weekDays[0].toISOString().split('T')[0]
      const endDate = weekDays[6].toISOString().split('T')[0]
      
      const response = await fetch(`http://localhost:3002/api/jobs?start_date=${startDate}&end_date=${endDate}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (response.ok) {
        const filteredJobs = (data.jobs || []).filter((job: any) => 
          job.assigned_user_id === selectedUserId
        )
        setJobs(filteredJobs)
      } else {
        setJobs([])
      }
    } catch (error) {
      console.error('Network error: Failed to fetch jobs', error)
      setJobs([])
    } finally {
      setLoading(false)
    }
  }

  // Fetch users on mount
  useEffect(() => {
    if (user && !userLoading) {
      fetchUsers()
    }
  }, [user, userLoading])

  // Fetch work hours when user changes
  useEffect(() => {
    if (selectedUserId) {
      fetchWorkHours()
    }
  }, [selectedUserId])

  // Fetch jobs when week or selected user changes
  useEffect(() => {
    if (user && !userLoading && selectedUserId) {
      fetchJobsForWeek()
    }
  }, [currentWeek, selectedUserId, user, userLoading])

  // Filter jobs by day
  const getJobsForDay = (date: Date) => {
    const dateString = date.toISOString().split('T')[0]
    return jobs.filter(job => job.scheduled_date === dateString)
  }

  // Get work hours for a specific day (dayIndex: 0=Monday, 1=Tuesday, etc.)
  const getWorkHoursForDay = (dayIndex: number) => {
    if (!workHours) return 0
    // Convert day index (0=Monday) to work hours day mapping (1=Monday)
    // workHours uses: monday_hours, tuesday_hours, etc. (1=Monday, 0=Sunday)
    const dayMap: (keyof WorkHours)[] = [
      'monday_hours',    // 0 = Monday
      'tuesday_hours',   // 1 = Tuesday
      'wednesday_hours', // 2 = Wednesday
      'thursday_hours',  // 3 = Thursday
      'friday_hours',    // 4 = Friday
      'saturday_hours',  // 5 = Saturday
      'sunday_hours'     // 6 = Sunday
    ]
    const hours = workHours[dayMap[dayIndex]]
    // Ensure we return a number, parse if it's a string
    const numHours = typeof hours === 'string' ? parseFloat(hours) : (hours || 0)
    return isNaN(numHours) ? 0 : numHours
  }

  // Calculate occupied time for a day (in hours)
  const getOccupiedTime = (date: Date) => {
    const dayJobs = getJobsForDay(date)
    const totalMinutes = dayJobs.reduce((total, job) => total + (job.total_duration || 0), 0)
    return totalMinutes / 60 // Convert minutes to hours
  }

  // Format time duration (compact)
  const formatDuration = (minutes: number) => {
    if (!minutes) return '0m'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h${mins > 0 ? ` ${mins}m` : ''}`
    }
    return `${mins}m`
  }

  // Format price (compact)
  const formatPrice = (price: number) => {
    if (!price) return ''
    return new Intl.NumberFormat('da-DK', { 
      style: 'currency', 
      currency: 'DKK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price).replace('kr', 'kr.')
  }

  // Get city from job
  const getCity = (job: any) => {
    return job.personal_city || ''
  }

  // Get address string for display (city • address)
  const getAddressDisplay = (job: any) => {
    const city = job.personal_city || ''
    const address = job.personal_address || ''
    
    if (!city && !address) return ''
    if (!city) return address
    if (!address) return city
    
    return `${city} • ${address}`
  }

  // Get full address for clipboard (Google Maps format)
  const getFullAddressForClipboard = (job: any) => {
    const parts = []
    if (job.personal_address) parts.push(job.personal_address)
    if (job.personal_zip_code) parts.push(job.personal_zip_code)
    if (job.personal_city) parts.push(job.personal_city)
    return parts.join(', ')
  }

  // Copy address to clipboard
  const copyAddressToClipboard = async (job: any, e: React.MouseEvent) => {
    e.stopPropagation()
    const address = getFullAddressForClipboard(job)
    if (address) {
      try {
        await navigator.clipboard.writeText(address)
        // You could add a toast notification here if needed
      } catch (error) {
        console.error('Failed to copy address:', error)
      }
    }
  }

  // Handle job click
  const handleJobClick = (job: any) => {
    setViewingJob(job)
    setIsViewModalOpen(true)
  }

  // Close create menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      // Check if click is outside the create button and menu
      const createButtonArea = target.closest('[data-create-menu]')
      if (showCreateMenu && !createButtonArea) {
        setShowCreateMenu(false)
      }
    }

    if (showCreateMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showCreateMenu])

  if (userLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Filter/Navigation Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {/* Today Button */}
              <button
                onClick={goToCurrentWeek}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
              >
                Today
              </button>

              {/* Employee Selector */}
              <div className="flex items-center space-x-2">
                <label className="text-xs font-medium text-gray-600">Employee:</label>
                <select
                  value={selectedUserId || ''}
                  onChange={(e) => setSelectedUserId(parseInt(e.target.value))}
                  className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white"
                >
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.first_name} {user.last_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Week Navigation */}
            <div className="flex items-center space-x-2">
              <button
                onClick={goToPreviousWeek}
                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <span className="text-xs font-medium text-gray-700 min-w-[120px] text-center">
                {weekDays[0].toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
              
              <button
                onClick={goToNextWeek}
                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Show Weekend Toggle */}
            <button
              onClick={() => setShowWeekend(!showWeekend)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                showWeekend
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {showWeekend ? 'Hide Weekend' : 'Show Weekend'}
            </button>
          </div>
        </div>

        {/* Weekly Calendar Body */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Week Days Grid Container */}
          <div className="relative overflow-hidden">
            <div 
              className={`grid divide-x divide-gray-200 transition-all duration-300 ease-in-out ${
                showWeekend ? 'grid-cols-7' : 'grid-cols-5'
              }`}
            >
              {weekDays
                .map((day, originalIndex) => ({ day, originalIndex }))
                .filter(({ originalIndex }) => showWeekend || originalIndex < 5)
                .map(({ day, originalIndex }) => {
                const dayJobs = getJobsForDay(day)
                // Convert JavaScript day (0=Sunday) to our day index (0=Monday)
                const jsDayOfWeek = day.getDay() // 0=Sunday, 1=Monday, etc.
                const dayOfWeekIndex = jsDayOfWeek === 0 ? 6 : jsDayOfWeek - 1 // Convert to 0=Monday
                const workHoursForDay = getWorkHoursForDay(dayOfWeekIndex)
                const occupiedHours = getOccupiedTime(day)
                // Ensure workHoursForDay is a number
                const workHoursNum = typeof workHoursForDay === 'number' ? workHoursForDay : parseFloat(workHoursForDay) || 0
                const availableHours = workHoursNum - occupiedHours
                const utilizationPercent = workHoursNum > 0 ? (occupiedHours / workHoursNum) * 100 : 0

                return (
                  <div key={originalIndex} className="flex flex-col" style={{ minHeight: '600px' }}>
                    {/* Day Header */}
                    <div className={`px-3 py-2.5 border-b border-gray-200 ${
                      isToday(day) ? 'bg-blue-50' : 'bg-gray-50'
                    }`}>
                      <div className={`text-xs font-semibold mb-0.5 ${
                        isToday(day) ? 'text-blue-600' : 'text-gray-600'
                      }`}>
                        {formatWeekday(day)}
                      </div>
                      <div className={`text-sm font-bold ${
                        isToday(day) ? 'text-blue-900' : 'text-gray-900'
                      }`}>
                        {formatDate(day)}
                      </div>
                      
                      {/* Time Availability Bar */}
                      {workHoursNum > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] text-gray-500">
                              {occupiedHours.toFixed(1)}h / {workHoursNum.toFixed(1)}h
                            </span>
                            <span className={`text-[11px] font-medium ${
                              availableHours >= 0 ? 'text-gray-600' : 'text-red-600'
                            }`}>
                              {availableHours >= 0 ? `${availableHours.toFixed(1)}h free` : `${Math.abs(availableHours).toFixed(1)}h over`}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden relative">
                            {/* Occupied time bar */}
                            <div 
                              className={`absolute top-0 left-0 h-full transition-all rounded-full ${
                                utilizationPercent > 100 
                                  ? 'bg-red-500' 
                                  : utilizationPercent > 80 
                                    ? 'bg-orange-500' 
                                    : 'bg-blue-500'
                              }`}
                              style={{ 
                                width: utilizationPercent > 100 
                                  ? '100%' 
                                  : `${utilizationPercent}%` 
                              }}
                            />
                            {/* Warning stripe pattern if over capacity */}
                            {utilizationPercent > 100 && (
                              <div 
                                className="absolute top-0 left-0 w-full h-full bg-red-600 opacity-20"
                                style={{
                                  backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)'
                                }}
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Day Content */}
                    <div className="flex-1 p-2 overflow-y-auto" style={{ maxHeight: 'calc(600px - 100px)' }}>
                      {loading ? (
                        <div className="flex items-center justify-center h-32">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                        </div>
                      ) : dayJobs.length > 0 ? (
                        <div className="space-y-1.5">
                          {dayJobs.map((job) => {
                            const hasTime = job.scheduled_time_from || job.scheduled_time_to
                            const hasNote = job.note && job.note.trim() !== ''
                            const addressDisplay = getAddressDisplay(job)

                            return (
                              <div
                                key={job.id}
                                onClick={() => handleJobClick(job)}
                                className="bg-white border border-gray-200 rounded-md p-2 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer group"
                              >
                                {/* Client Name - Prominent */}
                                <div className="font-semibold text-gray-900 text-[13px] mb-0.5 leading-tight">
                                  {job.first_name} {job.last_name}
                                </div>
                                
                                {/* Address - City • Address (clickable to copy) */}
                                {addressDisplay && (
                                  <div 
                                    onClick={(e) => copyAddressToClipboard(job, e)}
                                    className="text-[11px] text-gray-600 mb-1 font-medium truncate hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                                    title="Click to copy address"
                                  >
                                    {addressDisplay}
                                  </div>
                                )}
                                
                                {/* Time - Only if exists */}
                                {hasTime && (
                                  <div className="flex items-center mb-1">
                                    <svg className="w-3 h-3 text-gray-400 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="text-[11px] text-gray-600">
                                      {job.scheduled_time_from && job.scheduled_time_to 
                                        ? `${job.scheduled_time_from.substring(0, 5)} - ${job.scheduled_time_to.substring(0, 5)}`
                                        : job.scheduled_time_from 
                                          ? `${job.scheduled_time_from.substring(0, 5)}`
                                          : ''
                                      }
                                    </span>
                                  </div>
                                )}
                                
                                {/* Note Indicator - Only if exists */}
                                {hasNote && (
                                  <div className="flex items-center mb-1">
                                    <svg className="w-3 h-3 text-yellow-500 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                    </svg>
                                    <span className="text-[11px] text-gray-500 italic">Has note</span>
                                  </div>
                                )}
                                
                                {/* Time and Value - Subtle */}
                                {(job.total_duration || job.total_price) && (
                                  <div className="flex items-center justify-between mt-1.5 pt-1 border-t border-gray-100">
                                    {job.total_duration && (
                                      <span className="text-[11px] text-gray-500">
                                        {formatDuration(job.total_duration)}
                                      </span>
                                    )}
                                    {job.total_price && (
                                      <span className="text-[11px] font-medium text-green-600">
                                        {formatPrice(job.total_price)}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-center text-gray-400 text-[11px] mt-8">
                          No jobs
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Create Button with Menu */}
      <div className="fixed bottom-6 right-6 z-40" data-create-menu>
        {/* Dropdown Menu */}
        {showCreateMenu && (
          <div className="absolute bottom-full right-0 mb-2 bg-white rounded-lg shadow-lg border border-gray-200 py-2 min-w-[160px]">
            <button
              onClick={() => {
                setShowCreateMenu(false)
                setIsCreateModalOpen(true)
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Create Job
            </button>
            <button
              onClick={() => {
                setShowCreateMenu(false)
                setIsCreateClientModalOpen(true)
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Create Client
            </button>
          </div>
        )}
        
        {/* Create Button */}
        <button
          onClick={() => setShowCreateMenu(!showCreateMenu)}
          className="bg-white text-blue-600 px-4 py-2 rounded-lg shadow-md border border-gray-200 hover:shadow-lg transition-shadow flex items-center space-x-2 font-medium"
          title="Create"
        >
          <span>create +</span>
        </button>
      </div>

      {/* Create Job Modal */}
      <CreateJob
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onJobCreated={() => {
          setIsCreateModalOpen(false)
          setShowCreateMenu(false)
          fetchJobsForWeek()
        }}
      />

      {/* Create Client Modal */}
      <AddClientModal
        isOpen={isCreateClientModalOpen}
        onClose={() => {
          setIsCreateClientModalOpen(false)
          setShowCreateMenu(false)
        }}
        onClientAdded={() => {
          setIsCreateClientModalOpen(false)
          setShowCreateMenu(false)
          // Optionally refresh any client-related data
        }}
      />

      {/* View Job Slideout */}
      <JobViewSlideout
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false)
          setViewingJob(null)
        }}
        job={viewingJob}
      />
    </AppLayout>
  )
}
