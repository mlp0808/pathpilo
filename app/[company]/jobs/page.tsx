'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import { useUser } from '@/app/hooks/useUser'
import AppLayout from '@/app/components/AppLayout'
import CreateJob from '@/app/components/CreateJob'
import JobViewSlideout from '@/app/components/JobViewSlideout'
import AddClientModal from '@/app/components/AddClientModal'
import ConfirmModal from '@/app/components/ConfirmModal'
import { apiUrl } from '@/app/utils/api'
import { getEmailTemplate } from '@/app/utils/emailTemplates'
import { useSearchParams } from 'next/navigation'
import { CheckCircleIcon, PlusIcon } from '@heroicons/react/24/outline'

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

function JobsPageContent() {
  const searchParams = useSearchParams()
  const { user, loading: userLoading } = useUser()
  
  // Format a Date as YYYY-MM-DD in local time (avoids timezone shifting from toISOString)
  const toLocalDateString = (d: Date) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Normalize any date-ish value (YYYY-MM-DD, ISO string, Date) to YYYY-MM-DD
  const toDateOnlyString = (v: any) => {
    if (!v) return ''
    if (v instanceof Date) return toLocalDateString(v)
    const s = String(v)
    // If it looks like an ISO timestamp, take the date part
    if (s.includes('T')) return s.split('T')[0]
    return s
  }
  
  // Load saved state from localStorage
  const getSavedWeek = () => {
    try {
      const saved = localStorage.getItem('vevago_jobs_week')
      if (saved) {
        const date = new Date(saved)
        if (!isNaN(date.getTime())) {
          return date
        }
      }
    } catch (e) {}
    return new Date()
  }
  
  const [currentWeek, setCurrentWeek] = useState(getSavedWeek)
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string>('')
  const [viewingJob, setViewingJob] = useState<any>(null)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isCreateClientModalOpen, setIsCreateClientModalOpen] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [createJobPrefillDate, setCreateJobPrefillDate] = useState<string | null>(null)
  const [createJobPrefillUserId, setCreateJobPrefillUserId] = useState<number | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | 'all'>('all')
  const [showWeekend, setShowWeekend] = useState(false)
  const [workHours, setWorkHours] = useState<WorkHours | null>(null)
  
  // Drag and drop state
  const [draggedJob, setDraggedJob] = useState<any>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [pendingMoveDate, setPendingMoveDate] = useState<string | null>(null)
  const [pendingMoveJob, setPendingMoveJob] = useState<any>(null) // Store job separately for modal
  const [isMovingJob, setIsMovingJob] = useState(false)
  const [moveTemplate, setMoveTemplate] = useState<{ subject: string; message: string }>({ subject: '', message: '' })

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
    // Save to localStorage
    try {
      localStorage.setItem('vevago_jobs_week', newWeek.toISOString())
    } catch (e) {}
  }

  const goToNextWeek = () => {
    const newWeek = new Date(currentWeek)
    newWeek.setDate(currentWeek.getDate() + 7)
    setCurrentWeek(newWeek)
    // Save to localStorage
    try {
      localStorage.setItem('vevago_jobs_week', newWeek.toISOString())
    } catch (e) {}
  }

  const goToCurrentWeek = () => {
    const today = new Date()
    setCurrentWeek(today)
    // Save to localStorage
    try {
      localStorage.setItem('vevago_jobs_week', today.toISOString())
    } catch (e) {}
  }
  
  // Save week when it changes (e.g., from date picker or other interactions)
  useEffect(() => {
    if (currentWeek) {
      try {
        localStorage.setItem('vevago_jobs_week', currentWeek.toISOString())
      } catch (e) {}
    }
  }, [currentWeek])

  // Fetch users for employee selector
  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl('/users'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setUsers(data.users || [])
        // Don't auto-select first user here - let the URL initialization handle it
        setApiError('')
      } else {
        // Keep UI visible, but show why nothing loads
        setApiError(data?.error || 'Failed to fetch users')
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      setApiError('Network error: Failed to fetch users')
    }
  }

    // Fetch work hours for selected user
    const fetchWorkHours = async () => {
        if (selectedUserId === 'all') return

        try {
            const token = localStorage.getItem('token')
            const response = await fetch(apiUrl(`/work-hours/${selectedUserId}`), {
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
        try {
            setLoading(true)
            setApiError('')
            const token = localStorage.getItem('token')

            const startDate = toLocalDateString(weekDays[0])
            const endDate = toLocalDateString(weekDays[6])

            const response = await fetch(apiUrl(`/jobs?start_date=${startDate}&end_date=${endDate}`), {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            const data = await response.json().catch(() => ({}))

            if (response.ok) {
                const allJobs = (data.jobs || [])
                if (selectedUserId === 'all') {
                  setJobs(allJobs)
                } else {
                  const filteredJobs = allJobs.filter((job: any) => job.assigned_user_id === selectedUserId)
                  setJobs(filteredJobs)
                }
            } else {
                setJobs([])
                setApiError(data?.error || 'Failed to fetch jobs')
            }
        } catch (error) {
            console.error('Network error: Failed to fetch jobs', error)
            setJobs([])
            setApiError('Network error: Failed to fetch jobs')
        } finally {
            setLoading(false)
        }
    }

  // Track if we've initialized from URL to prevent loops
  const [initializedFromUrl, setInitializedFromUrl] = useState(false)
  // Track if the change is from user action (not URL initialization)
  const isUserActionRef = useRef(false)

  // Fetch users on mount
  useEffect(() => {
    if (user && !userLoading) {
      fetchUsers()
    }
  }, [user, userLoading])

  // Initialize selected user - priority: URL param > localStorage > first user
  useEffect(() => {
    if (!users || users.length === 0 || initializedFromUrl) return
    
    // First, try URL parameter
    const u = searchParams?.get('user')
    if (u) {
      if (u.toLowerCase() === 'all') {
        setSelectedUserId('all')
        setInitializedFromUrl(true)
        // Save to localStorage
        try {
          localStorage.setItem('vevago_jobs_selected_user', 'all')
        } catch (e) {}
        return
      }
      // Accept either numeric id or "First Last" (case-insensitive)
      const byId = users.find(x => String(x.id) === u)
      if (byId) {
        setSelectedUserId(byId.id)
        setInitializedFromUrl(true)
        // Save to localStorage
        try {
          localStorage.setItem('vevago_jobs_selected_user', String(byId.id))
        } catch (e) {}
        return
      }
      const normalized = u.toLowerCase()
      const byName = users.find(x => `${x.first_name} ${x.last_name}`.trim().toLowerCase() === normalized)
      if (byName) {
        setSelectedUserId(byName.id)
        setInitializedFromUrl(true)
        // Save to localStorage
        try {
          localStorage.setItem('vevago_jobs_selected_user', String(byName.id))
        } catch (e) {}
        return
      }
    }
    
    // If no URL param, try localStorage
    try {
      const savedUserId = localStorage.getItem('vevago_jobs_selected_user')
      if (savedUserId) {
        if (savedUserId === 'all') {
          setSelectedUserId('all')
          setInitializedFromUrl(true)
          return
        }
        const userId = parseInt(savedUserId)
        if (!isNaN(userId)) {
          const foundUser = users.find(x => x.id === userId)
          if (foundUser) {
            setSelectedUserId(userId)
            setInitializedFromUrl(true)
            return
          }
        }
      }
    } catch (e) {}
    
    // Default: show all jobs
    setSelectedUserId('all')
    setInitializedFromUrl(true)
    try {
      localStorage.setItem('vevago_jobs_selected_user', 'all')
    } catch (e) {}
  }, [users, searchParams, initializedFromUrl])

  // Persist selected user in URL and localStorage - only after initialization and only on manual changes
  useEffect(() => {
    // Don't run if not initialized yet, or if we don't have the required data
    if (!initializedFromUrl || !users || users.length === 0) return
    
    // Only update URL/localStorage if this change came from a user action (not from URL initialization)
    if (!isUserActionRef.current) return

    const display =
      selectedUserId === 'all'
        ? 'all'
        : (() => {
            const u = users.find(x => x.id === selectedUserId)
            return u ? `${u.first_name} ${u.last_name}`.trim() : null
          })()
    if (!display) return
    const currentUser = searchParams?.get('user')
    
    // Save to localStorage
    try {
      localStorage.setItem('vevago_jobs_selected_user', String(selectedUserId))
    } catch (e) {}
    
    // Only update URL if it's different
    if (currentUser !== display) {
      const params = new URLSearchParams(window.location.search)
      params.set('user', display)
      const newUrl = `${window.location.pathname}?${params.toString()}`
      window.history.replaceState({}, '', newUrl)
    }
    
    // Reset the flag after updating
    isUserActionRef.current = false
  }, [selectedUserId, users, searchParams, initializedFromUrl])

    // Fetch work hours when user changes
    useEffect(() => {
        if (selectedUserId !== 'all') fetchWorkHours()
    }, [selectedUserId])

    // Fetch jobs when week or selected user changes
    useEffect(() => {
        if (user && !userLoading) {
            fetchJobsForWeek()
        }
    }, [currentWeek, selectedUserId, user, userLoading])

    // Filter jobs by day
    const getJobsForDay = (date: Date) => {
        const dateString = toLocalDateString(date)
        return jobs.filter(job => toDateOnlyString(job.scheduled_date) === dateString)
    }

    const openCreateJobForDate = (dateString: string) => {
        setCreateJobPrefillDate(dateString)
        setCreateJobPrefillUserId(selectedUserId === 'all' ? null : selectedUserId)
        setShowCreateMenu(false)
        setIsCreateModalOpen(true)
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
    
    // Drag and drop handlers
    const handleDragStart = (e: React.DragEvent, job: any) => {
        e.stopPropagation()
        setDraggedJob(job)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(job.id))
    }
    
    const handleDragEnd = () => {
        // Only clear draggedJob if we're not showing the move modal
        // (if modal is showing, we need to keep the job for the confirmation)
        if (!showMoveModal) {
            setDraggedJob(null)
        }
        setDragOverDate(null)
    }
    
    const handleDragOver = (e: React.DragEvent, dateString: string) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        setDragOverDate(dateString)
    }
    
    const handleDragLeave = () => {
        setDragOverDate(null)
    }
    
    const handleDrop = async (e: React.DragEvent, dateString: string) => {
        e.preventDefault()
        e.stopPropagation()
        
        if (!draggedJob) return
        
        // Check if dropping on the same date
        if (draggedJob.scheduled_date === dateString) {
            setDraggedJob(null)
            setDragOverDate(null)
            return
        }
        
        // Store the job and date for the modal (before handleDragEnd clears draggedJob)
        setPendingMoveJob(draggedJob)
        setPendingMoveDate(dateString)
        
        // Fetch email template
        const oldDate = new Date(draggedJob.scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
        const newDate = new Date(dateString + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
        
        let userName = 'Our team'
        try {
            const u = JSON.parse(localStorage.getItem('user') || '{}')
            if (u.first_name && u.last_name) {
                userName = `${u.first_name} ${u.last_name}`
            } else if (u.firstName && u.lastName) {
                userName = `${u.firstName} ${u.lastName}`
            }
        } catch {}
        
        const template = await getEmailTemplate('change_date', {
            clientName: `${draggedJob.first_name || ''} ${draggedJob.last_name || ''}`.trim() || 'Customer',
            clientFirstName: draggedJob.first_name || 'Customer',
            clientLastName: draggedJob.last_name || '',
            jobDate: oldDate,
            jobOldDate: oldDate,
            jobNewDate: newDate,
            userName: userName,
            companyName: draggedJob.company_name || ''
        })
        
        setMoveTemplate(template)
        setShowMoveModal(true)
        setDragOverDate(null)
    }
    
    // Handle move job confirmation
    const handleMoveJob = async ({ notify, message, subject }: { notify: boolean, message: string, subject: string }) => {
        // Use the pendingMoveJob (stored at drop time) instead of draggedJob
        const jobToMove = pendingMoveJob
        const targetDate = pendingMoveDate
        
        if (!jobToMove || !targetDate) return
        
        setIsMovingJob(true)
        try {
            const token = localStorage.getItem('token')

            const getProjectedMeta = (j: any): { subscriptionId: number; occurrence: number } | null => {
                const subId = typeof j?.recurring_job_id === 'number' ? j.recurring_job_id : null
                const occ = typeof j?.recurring_occurrence === 'number' ? j.recurring_occurrence : null
                if (subId && occ) return { subscriptionId: subId, occurrence: occ }

                if (typeof j?.id === 'string' && String(j.id).startsWith('subscription-')) {
                    const parts = String(j.id).split('-')
                    if (parts.length >= 3) {
                        const ps = parseInt(parts[1], 10)
                        const po = parseInt(parts[2], 10)
                        if (Number.isFinite(ps) && Number.isFinite(po)) return { subscriptionId: ps, occurrence: po }
                    }
                }
                return null
            }

            let realJobId: number | null = (typeof jobToMove.id === 'number') ? jobToMove.id : null

            // If this is a subscription preview job, materialize it first.
            if (!realJobId && (jobToMove.is_projected || (typeof jobToMove.id === 'string' && String(jobToMove.id).startsWith('subscription-')))) {
                const meta = getProjectedMeta(jobToMove)
                if (!meta) {
                    throw new Error('Could not resolve subscription occurrence to materialize')
                }

                // Create real job for this occurrence on its original date (so move endpoint can log/notify correctly)
                const mat = await fetch(apiUrl(`/subscriptions/${meta.subscriptionId}/occurrences/${meta.occurrence}/materialize`), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ scheduled_date: jobToMove.scheduled_date })
                })
                const matData = await mat.json().catch(() => ({}))
                if (!mat.ok) {
                    throw new Error(matData.error || matData.details || 'Failed to create real job from subscription')
                }
                realJobId = matData.jobId
                if (typeof realJobId !== 'number') {
                    throw new Error('Invalid jobId returned from materialize endpoint')
                }
            }

            if (!realJobId) {
                throw new Error('Invalid job id')
            }

            const response = await fetch(apiUrl(`/jobs/${realJobId}/move`), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    new_date: targetDate,
                    notify_customer: notify,
                    notification_message: notify ? message : null,
                    notification_subject: notify ? subject : null
                })
            })
            
            const data = await response.json()
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to move job')
            }
            
            // Refresh jobs
            await fetchJobsForWeek()
            
            // Close modal and clear all drag state
            setShowMoveModal(false)
            setPendingMoveDate(null)
            setPendingMoveJob(null)
            setDraggedJob(null)
        } catch (error: any) {
            console.error('Failed to move job:', error)
            alert('Failed to move job: ' + (error.message || 'Unknown error'))
        } finally {
            setIsMovingJob(false)
        }
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

  const handleToggleJobCompletion = async (job: any) => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const jobId = job.id
      const newStatus = job.status === 'completed' ? 'scheduled' : 'completed'

      const response = await fetch(apiUrl(`/jobs/${jobId}/status`), {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update job status')
      }

      // Update local jobs state so the card reflects the new status
      setJobs(prev =>
        prev.map((j: any) => (j.id === jobId ? { ...j, status: newStatus } : j))
      )
    } catch (error) {
      console.error('Failed to update job status from calendar:', error)
    }
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
                {apiError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <div className="text-sm text-red-800 font-medium">Jobs page error</div>
                    <div className="text-xs text-red-700 mt-1">{apiError}</div>
                    <div className="text-xs text-red-700 mt-2">
                      If this says “No active company selected”, log out and log back in (or go to <span className="font-mono">/select-company</span>).
                    </div>
                  </div>
                )}
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
                  value={selectedUserId === 'all' ? 'all' : String(selectedUserId || '')}
                  onChange={(e) => {
                    // Mark this as a user action so the persistence effect knows to update URL
                    isUserActionRef.current = true
                    const raw = e.target.value
                    if (raw === 'all') {
                      setSelectedUserId('all')
                      return
                    }
                    const newUserId = parseInt(raw)
                    if (!isNaN(newUserId)) setSelectedUserId(newUserId)
                  }}
                                    className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white"
                                >
                                    <option value="all">All team</option>
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
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${showWeekend
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
                            className={`grid divide-x divide-gray-200 transition-all duration-300 ease-in-out ${showWeekend ? 'grid-cols-7' : 'grid-cols-5'
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

                                    const dateString = toLocalDateString(day)
                                    const isDragOver = dragOverDate === dateString
                                    
                                    return (
                                        <div
                                            key={originalIndex}
                                            className={`flex flex-col transition-colors relative ${isDragOver ? 'bg-blue-50' : ''}`}
                                            style={{ minHeight: '600px' }}
                                            onDragOver={(e) => handleDragOver(e, dateString)}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, dateString)}
                                        >
                                            {/* Day Header */}
                                            <div className={`px-3 py-2.5 border-b border-gray-200 ${isToday(day) ? 'bg-blue-50' : 'bg-gray-50'
                                                }`}>
                                                <div className={`text-xs font-semibold mb-0.5 ${isToday(day) ? 'text-blue-600' : 'text-gray-600'
                                                    }`}>
                                                    {formatWeekday(day)}
                                                </div>
                                                <div className={`text-sm font-bold ${isToday(day) ? 'text-blue-900' : 'text-gray-900'
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
                                                            <span className={`text-[11px] font-medium ${availableHours >= 0 ? 'text-gray-600' : 'text-red-600'
                                                                }`}>
                                                                {availableHours >= 0 ? `${availableHours.toFixed(1)}h free` : `${Math.abs(availableHours).toFixed(1)}h over`}
                                                            </span>
                                                        </div>
                                                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden relative">
                                                            {/* Occupied time bar */}
                                                            <div
                                                                className={`absolute top-0 left-0 h-full transition-all rounded-full ${utilizationPercent > 100
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

                                                            const isJobCompleted = job.status === 'completed'
                                                            return (
                                                                <div
                                                                    key={job.id}
                                                                    draggable
                                                                    onDragStart={(e) => handleDragStart(e, job)}
                                                                    onDragEnd={handleDragEnd}
                                                                    onClick={() => handleJobClick(job)}
                                                                    className={`bg-white border border-gray-200 rounded-md p-2 hover:border-blue-300 hover:shadow-sm transition-all cursor-move group ${draggedJob?.id === job.id ? 'opacity-50' : ''}`}
                                                                >
                                                                    {/* Top row: Client Name + completion icon */}
                                                                    <div className="flex items-start justify-between mb-0.5">
                                                                        <div className="font-semibold text-gray-900 text-[13px] leading-tight">
                                                                            {job.first_name} {job.last_name}
                                                                        </div>
                                                                        {typeof job.status !== 'undefined' && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation()
                                                                                    handleToggleJobCompletion(job)
                                                                                }}
                                                                                className={`w-5 h-5 rounded-full flex items-center justify-center border text-[0] ${
                                                                                  isJobCompleted
                                                                                    ? 'bg-green-50 border-green-300 text-green-600 hover:bg-green-100'
                                                                                    : 'bg-white border-gray-200 text-gray-300 hover:bg-gray-100 hover:text-gray-500'
                                                                                }`}
                                                                                title={isJobCompleted ? 'Mark job as not completed' : 'Mark job as completed'}
                                                                            >
                                                                                <CheckCircleIcon className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        )}
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

                                            {/* Add job quick action */}
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    openCreateJobForDate(dateString)
                                                }}
                                                className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                                                title="Add job"
                                            >
                                                <PlusIcon className="w-3.5 h-3.5" />
                                                <span>Add job</span>
                                            </button>
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
                onClose={() => {
                    setIsCreateModalOpen(false)
                    setCreateJobPrefillDate(null)
                    setCreateJobPrefillUserId(null)
                }}
                onJobCreated={() => {
                    setIsCreateModalOpen(false)
                    setShowCreateMenu(false)
                    setCreateJobPrefillDate(null)
                    setCreateJobPrefillUserId(null)
                    fetchJobsForWeek()
                }}
                initialDate={createJobPrefillDate || undefined}
                initialAssignedUserId={createJobPrefillUserId}
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
                onJobUpdated={() => {
                    // Ensure the calendar updates immediately after edits/materialization (no manual refresh)
                    fetchJobsForWeek()
                }}
            />
            
            {/* Move Job Confirmation Modal */}
            <ConfirmModal
                isOpen={showMoveModal && !!pendingMoveJob && !!pendingMoveDate}
                title="Move Job"
                description={`Move this job to a new date?`}
                confirmLabel={isMovingJob ? 'Moving...' : 'Move Job'}
                cancelLabel="Cancel"
                enableNotification={true}
                isSubmitting={isMovingJob}
                defaultMessage={moveTemplate.message || (() => {
                    if (!pendingMoveJob || !pendingMoveDate) return ''
                    const oldDate = new Date(pendingMoveJob.scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    const newDate = new Date(pendingMoveDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    const customerName = `${pendingMoveJob.first_name || ''} ${pendingMoveJob.last_name || ''}`.trim() || 'Customer'
                    const userName = (user as any)?.first_name && (user as any)?.last_name ? `${(user as any).first_name} ${(user as any).last_name}` : 'We'
                    return `Hi ${customerName},\n\nWe need to reschedule your appointment.\n\nOld date: ${oldDate}\nNew date: ${newDate}\n\nIf this new date doesn't work for you, please let us know.\n\nBest regards,\n${userName}`
                })()}
                defaultSubject={moveTemplate.subject || (() => {
                    if (!pendingMoveJob) return 'Appointment Date Changed'
                    const customerName = `${pendingMoveJob.first_name || ''} ${pendingMoveJob.last_name || ''}`.trim() || 'Customer'
                    return `Appointment Rescheduled - ${customerName}`
                })()}
                onClose={() => {
                    setShowMoveModal(false)
                    setPendingMoveDate(null)
                    setPendingMoveJob(null)
                    setDraggedJob(null)
                    setMoveTemplate({ subject: '', message: '' })
                }}
                onConfirm={handleMoveJob}
            >
                {pendingMoveJob && pendingMoveDate && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                                <p className="text-sm font-medium text-gray-700">Old Date</p>
                                <p className="text-sm text-gray-500">
                                    {new Date(pendingMoveJob.scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', { 
                                        weekday: 'long',
                                        day: '2-digit', 
                                        month: '2-digit', 
                                        year: 'numeric' 
                                    })}
                                </p>
                            </div>
                            <div className="text-gray-400 mx-4">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-700">New Date</p>
                                <p className="text-sm text-gray-500">
                                    {new Date(pendingMoveDate + 'T00:00:00').toLocaleDateString('en-GB', { 
                                        weekday: 'long',
                                        day: '2-digit', 
                                        month: '2-digit', 
                                        year: 'numeric' 
                                    })}
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500">
                            Client: <span className="font-medium">{pendingMoveJob.first_name} {pendingMoveJob.last_name}</span>
                        </p>
                    </div>
                )}
            </ConfirmModal>
        </AppLayout>
    )
}

export default function JobsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-gray-600">Loading...</p>
                </div>
            </div>
        }>
            <JobsPageContent />
        </Suspense>
    )
}