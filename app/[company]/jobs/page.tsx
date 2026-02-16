'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import Link from 'next/link'
import { useUser } from '@/app/hooks/useUser'
import AppLayout from '@/app/components/AppLayout'
import CreateJob from '@/app/components/CreateJob'
import CreateSubscription from '@/app/components/CreateSubscription'
import JobViewSlideout from '@/app/components/JobViewSlideout'
import AddClientModal from '@/app/components/AddClientModal'
import ConfirmModal from '@/app/components/ConfirmModal'
import { apiUrl } from '@/app/utils/api'
import { getEmailTemplate } from '@/app/utils/emailTemplates'
import { useSearchParams } from 'next/navigation'
import { CheckIcon, PlusIcon, UserCircleIcon, DocumentTextIcon, ClockIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

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
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | 'all'>('all')
  const [workHours, setWorkHours] = useState<WorkHours | null>(null)
  const [allUsersWorkHours, setAllUsersWorkHours] = useState<WorkHours | null>(null)
  const [viewMode, setViewMode] = useState<'day'|'week'|'month'|'year'>('week')
  
  // Drag and drop state
  const [draggedJob, setDraggedJob] = useState<any>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [dragOverJobId, setDragOverJobId] = useState<number | 'top' | 'bottom' | null>(null) // Track which job we're hovering over for divider, or 'top'/'bottom' for list edges
  const [dragOverPosition, setDragOverPosition] = useState<'above' | 'below' | null>(null) // Track position relative to hovered job
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [pendingMoveDate, setPendingMoveDate] = useState<string | null>(null)
  const [pendingMoveJob, setPendingMoveJob] = useState<any>(null) // Store job separately for modal
  const [isMovingJob, setIsMovingJob] = useState(false)
  const [moveTemplate, setMoveTemplate] = useState<{ subject: string; message: string }>({ subject: '', message: '' })
  const weekScrollContainerRef = useRef<HTMLDivElement>(null)
  const [weekScrollPosition, setWeekScrollPosition] = useState(0)

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
            weekday: 'long'
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

  // Month navigation functions
  const goToPreviousMonth = () => {
    const newDate = new Date(currentWeek)
    newDate.setMonth(newDate.getMonth() - 1)
    setCurrentWeek(newDate)
    try {
      localStorage.setItem('vevago_jobs_week', newDate.toISOString())
    } catch (e) {}
  }

  const goToNextMonth = () => {
    const newDate = new Date(currentWeek)
    newDate.setMonth(newDate.getMonth() + 1)
    setCurrentWeek(newDate)
    try {
      localStorage.setItem('vevago_jobs_week', newDate.toISOString())
    } catch (e) {}
  }

  const goToCurrentMonth = () => {
    const today = new Date()
    setCurrentWeek(today)
    try {
      localStorage.setItem('vevago_jobs_week', today.toISOString())
    } catch (e) {}
  }

  // Get all days for month view (including padding days from previous/next month)
  const getMonthDays = () => {
    const year = currentWeek.getFullYear()
    const month = currentWeek.getMonth()
    
    // First day of the month
    const firstDay = new Date(year, month, 1)
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0)
    
    // Get the day of week for the first day (0 = Sunday, 1 = Monday, etc.)
    // We want Monday to be the first day of the week, so adjust
    let firstDayOfWeek = firstDay.getDay()
    firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1 // Convert to Monday=0, Sunday=6
    
    // Start from the Monday before (or on) the first day of the month
    const startDate = new Date(firstDay)
    startDate.setDate(firstDay.getDate() - firstDayOfWeek)
    
    // Calculate how many days to show (6 weeks = 42 days)
    const days: Date[] = []
    for (let i = 0; i < 42; i++) {
      const day = new Date(startDate)
      day.setDate(startDate.getDate() + i)
      days.push(day)
    }
    
    return days
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
        const token = localStorage.getItem('token')
        
        if (selectedUserId === 'all') {
            // Fetch work hours for all users and sum them
            try {
                const workHoursPromises = users.map(user => 
                    fetch(apiUrl(`/work-hours/${user.id}`), {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    }).then(res => res.json())
                )
                
                const allWorkHoursData = await Promise.all(workHoursPromises)
                
                // Sum up all work hours
                const aggregatedWorkHours: WorkHours = {
                    monday_hours: 0,
                    tuesday_hours: 0,
                    wednesday_hours: 0,
                    thursday_hours: 0,
                    friday_hours: 0,
                    saturday_hours: 0,
                    sunday_hours: 0
                }
                
                allWorkHoursData.forEach(data => {
                    const rawWorkHours = data.workHours || {
                        monday_hours: 7.5,
                        tuesday_hours: 7.5,
                        wednesday_hours: 7.5,
                        thursday_hours: 7.5,
                        friday_hours: 7.0,
                        saturday_hours: 0,
                        sunday_hours: 0
                    }
                    
                    aggregatedWorkHours.monday_hours += parseFloat(rawWorkHours.monday_hours) || 0
                    aggregatedWorkHours.tuesday_hours += parseFloat(rawWorkHours.tuesday_hours) || 0
                    aggregatedWorkHours.wednesday_hours += parseFloat(rawWorkHours.wednesday_hours) || 0
                    aggregatedWorkHours.thursday_hours += parseFloat(rawWorkHours.thursday_hours) || 0
                    aggregatedWorkHours.friday_hours += parseFloat(rawWorkHours.friday_hours) || 0
                    aggregatedWorkHours.saturday_hours += parseFloat(rawWorkHours.saturday_hours) || 0
                    aggregatedWorkHours.sunday_hours += parseFloat(rawWorkHours.sunday_hours) || 0
                })
                
                setAllUsersWorkHours(aggregatedWorkHours)
                setWorkHours(null) // Clear individual work hours
            } catch (error) {
                console.error('Error fetching work hours for all users:', error)
            }
            return
        }

        try {
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
                setAllUsersWorkHours(null) // Clear aggregated work hours
            }
        } catch (error) {
            console.error('Error fetching work hours:', error)
        }
    }

    // Fetch jobs for the current week or month
    const fetchJobsForWeek = async () => {
        try {
            setLoading(true)
            setApiError('')
            const token = localStorage.getItem('token')

            let startDate: string
            let endDate: string
            
            if (viewMode === 'month') {
                const monthDays = getMonthDays()
                startDate = toLocalDateString(monthDays[0])
                endDate = toLocalDateString(monthDays[monthDays.length - 1])
            } else {
                startDate = toLocalDateString(weekDays[0])
                endDate = toLocalDateString(weekDays[6])
            }
            
            console.log(`📅 Fetching jobs for date range: ${startDate} to ${endDate}`)

            const response = await fetch(apiUrl(`/jobs?start_date=${startDate}&end_date=${endDate}`), {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            const data = await response.json().catch((err) => {
                console.error('❌ JSON parse error:', err)
                return {}
            })

            if (!response.ok) {
                console.error('❌ API Error:', response.status, data)
                setApiError(data?.error || 'Failed to fetch jobs')
                // Don't clear jobs on error - keep existing jobs visible
                // setJobs([])
                return
            }

            if (response.ok) {
                const allJobs = (data.jobs || [])
                console.log(`📋 Frontend received ${allJobs.length} total job(s)`)
                
                // Log projected jobs
                const projectedJobs = allJobs.filter((job: any) => job.is_projected || (typeof job.id === 'string' && job.id.startsWith('subscription-')))
                console.log(`👻 Found ${projectedJobs.length} projected job(s):`, projectedJobs.map(j => ({ 
                  id: j.id, 
                  assigned_user_id: j.assigned_user_id, 
                  scheduled_date: j.scheduled_date,
                  is_projected: j.is_projected 
                })))
                
                // Log status breakdown
                const statusCounts = allJobs.reduce((acc: any, job: any) => {
                  acc[job.status || 'undefined'] = (acc[job.status || 'undefined'] || 0) + 1
                  return acc
                }, {})
                console.log('📊 Jobs by status:', statusCounts)
                
                const cancelledJobs = allJobs.filter((job: any) => job.status === 'cancelled')
                if (cancelledJobs.length > 0) {
                  console.log(`📋 Found ${cancelledJobs.length} cancelled job(s):`, cancelledJobs.map(j => ({ id: j.id, status: j.status, assigned_user_id: j.assigned_user_id, scheduled_date: j.scheduled_date })))
                }
                
                console.log(`🔍 Current selectedUserId: ${selectedUserId} (type: ${typeof selectedUserId})`)
                
                if (selectedUserId === 'all') {
                  setJobs(allJobs)
                  console.log(`✅ Set ${allJobs.length} jobs (all users)`)
                } else {
                  // Convert selectedUserId to number for comparison
                  const userIdNum = typeof selectedUserId === 'string' ? parseInt(selectedUserId, 10) : selectedUserId
                  const filteredJobs = allJobs.filter((job: any) => {
                    // Check if job is assigned to the selected user (both real and projected jobs)
                    const jobUserId = job.assigned_user_id
                    if (jobUserId === null || jobUserId === undefined) return false
                    return Number(jobUserId) === Number(userIdNum)
                  })
                  const projectedCount = filteredJobs.filter((job: any) => job.is_projected).length
                  console.log(`🔍 Filtered to ${filteredJobs.length} jobs for user ${selectedUserId} (${projectedCount} projected)`)
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

    // Fetch work hours when user changes or users list changes
    useEffect(() => {
        if (users.length > 0 || selectedUserId !== 'all') {
            fetchWorkHours()
        }
    }, [selectedUserId, users])

    // Fetch jobs when week or selected user changes
    useEffect(() => {
        if (user && !userLoading && selectedUserId !== null && selectedUserId !== undefined) {
            console.log(`🔄 useEffect triggered: fetching jobs for ${viewMode} ${currentWeek}, user ${selectedUserId}`)
            fetchJobsForWeek()
        } else {
            console.log(`⏸️ useEffect skipped: user=${!!user}, userLoading=${userLoading}, selectedUserId=${selectedUserId}`)
        }
    }, [currentWeek, selectedUserId, user, userLoading, viewMode])

    // Reset scroll position when week changes
    useEffect(() => {
        if (weekScrollContainerRef.current && viewMode === 'week') {
            weekScrollContainerRef.current.scrollLeft = 0
            setWeekScrollPosition(0)
        }
    }, [currentWeek, viewMode])

    // Filter jobs by day and sort by sort_order
    const getJobsForDay = (date: Date) => {
        const dateString = toLocalDateString(date)
        const dayJobs = jobs.filter(job => toDateOnlyString(job.scheduled_date) === dateString)
        // Sort by sort_order (defaulting to 0), then by created_at
        return dayJobs.sort((a, b) => {
            const aOrder = a.sort_order ?? 0
            const bOrder = b.sort_order ?? 0
            if (aOrder !== bOrder) return aOrder - bOrder
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        })
    }

    const openCreateJobForDate = (dateString: string) => {
        setCreateJobPrefillDate(dateString)
        setCreateJobPrefillUserId(selectedUserId === 'all' ? null : selectedUserId)
        setShowCreateMenu(false)
        setIsCreateModalOpen(true)
    }

    // Get work hours for a specific day (dayIndex: 0=Monday, 1=Tuesday, etc.)
    const getWorkHoursForDay = (dayIndex: number) => {
        // Use aggregated work hours if "all teams" is selected, otherwise use individual work hours
        const hoursToUse = selectedUserId === 'all' ? allUsersWorkHours : workHours
        if (!hoursToUse) return 0
        
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
        const hours = hoursToUse[dayMap[dayIndex]]
        // Ensure we return a number, parse if it's a string
        const numHours = typeof hours === 'string' ? parseFloat(hours) : (hours || 0)
        return isNaN(numHours) ? 0 : numHours
    }

    // Calculate occupied time for a day (in hours)
    const getOccupiedTime = (date: Date) => {
        const dayJobs = getJobsForDay(date)
        const totalMinutes = dayJobs.reduce((total, job) => {
            const duration = job.total_duration
            // Ensure we parse as number (handle string values from API)
            const minutes = duration != null && duration !== '' ? parseFloat(String(duration)) : 0
            return total + (isNaN(minutes) ? 0 : minutes)
        }, 0)
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
        setDragOverJobId(null)
        setDragOverPosition(null)
    }
    
    const handleDragOver = (e: React.DragEvent, dateString: string) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        setDragOverDate(dateString)
    }

    const handleDragOverJob = (e: React.DragEvent, job: any, position: 'above' | 'below') => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        setDragOverJobId(job.id)
        setDragOverPosition(position)
        setDragOverDate(job.scheduled_date)
    }

    const handleDragLeaveJob = () => {
        setDragOverJobId(null)
        setDragOverPosition(null)
    }
    
    const handleDragLeave = () => {
        setDragOverDate(null)
        setDragOverJobId(null)
        setDragOverPosition(null)
    }
    
    const handleDrop = async (e: React.DragEvent, dateString: string, targetJobId?: number | 'top' | 'bottom', dropPosition?: 'above' | 'below') => {
        e.preventDefault()
        e.stopPropagation()
        
        if (!draggedJob) return
        
        const isSameDay = draggedJob.scheduled_date === dateString
        
        // If dropping on the same day, handle reordering without popup (targetJobId can be a number, 'top', or 'bottom')
        if (isSameDay && targetJobId !== undefined) {
            // Helper function to get subscription metadata from projected job
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
            
            let realJobId: number | null = (typeof draggedJob.id === 'number') ? draggedJob.id : null
            
            // If this is a projected job, materialize it first
            if (!realJobId && (draggedJob.is_projected || (typeof draggedJob.id === 'string' && draggedJob.id.startsWith('subscription-')))) {
                const meta = getProjectedMeta(draggedJob)
                if (!meta) {
                    alert('Could not materialize this subscription job. Please try again.')
                    setDraggedJob(null)
                    setDragOverDate(null)
                    setDragOverJobId(null)
                    setDragOverPosition(null)
                    return
                }
                
                try {
                    const token = localStorage.getItem('token')
                    // Materialize the job on its current date first
                    const mat = await fetch(apiUrl(`/subscriptions/${meta.subscriptionId}/occurrences/${meta.occurrence}/materialize`), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ scheduled_date: draggedJob.scheduled_date })
                    })
                    const matData = await mat.json().catch(() => ({}))
                    if (!mat.ok) {
                        throw new Error(matData.error || matData.details || 'Failed to create real job from subscription')
                    }
                    realJobId = matData.jobId
                    if (typeof realJobId !== 'number') {
                        throw new Error('Invalid jobId returned from materialize endpoint')
                    }
                    
                    // Update the dragged job object with the real ID for subsequent operations
                    draggedJob.id = realJobId
                    draggedJob.is_projected = false
                } catch (error) {
                    console.error('Error materializing job:', error)
                    alert('Failed to materialize subscription job. Please try again.')
                    setDraggedJob(null)
                    setDragOverDate(null)
                    setDragOverJobId(null)
                    setDragOverPosition(null)
                    return
                }
            }
            
            if (!realJobId) {
                alert('Cannot reorder this job. Please try again.')
                setDraggedJob(null)
                setDragOverDate(null)
                setDragOverJobId(null)
                setDragOverPosition(null)
                return
            }
            
            // Find the target index from current jobs list
            // Filter out projected jobs for index calculation (they'll be materialized if needed)
            const dayJobs = jobs.filter((j: any) => 
                j.scheduled_date === dateString && 
                j.assigned_user_id === draggedJob.assigned_user_id &&
                typeof j.id === 'number' // Only count real jobs for positioning
            )
            
            // Sort by current sort_order or created_at
            dayJobs.sort((a: any, b: any) => {
                const aOrder = a.sort_order ?? 0
                const bOrder = b.sort_order ?? 0
                if (aOrder !== bOrder) return aOrder - bOrder
                return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
            })
            
            // Find target index (for 'top' / 'bottom' or from a specific job)
            let newIndex: number
            if (targetJobId === 'top') {
                newIndex = 0
            } else if (targetJobId === 'bottom') {
                newIndex = dayJobs.length
            } else {
                // Target is a job id
                let targetIndex = typeof targetJobId === 'number' ? dayJobs.findIndex((j: any) => j.id === targetJobId) : -1
                if (targetIndex === -1) {
                    targetIndex = dayJobs.length // projected job or not found -> end of list
                }
                newIndex = dropPosition === 'above' ? targetIndex : targetIndex + 1
            }
            
            // If moving the dragged job, adjust index (exclude it from count)
            const draggedIndex = dayJobs.findIndex((j: any) => j.id === realJobId)
            if (draggedIndex !== -1 && draggedIndex < newIndex) {
                newIndex-- // Adjust because we're removing from before the target
            }
            
            // Ensure newIndex is not negative
            newIndex = Math.max(0, newIndex)
            
            // Call API to reorder
            try {
                const token = localStorage.getItem('token')
                const response = await fetch(apiUrl('/jobs/reorder'), {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        jobId: realJobId, // Use the real job ID (materialized if needed)
                        targetDate: dateString,
                        targetIndex: newIndex,
                        sourceDate: draggedJob.scheduled_date
                    })
                })
                
                if (!response.ok) {
                    const error = await response.json()
                    throw new Error(error.error || 'Failed to reorder job')
                }
                
                // Optimistically update the local jobs state - no refresh needed
                // Use a functional update to ensure we're working with the latest state
                setJobs((prevJobs) => {
                    // Filter out the old job (if it exists) and projected version
                    const filteredJobs = prevJobs.filter((j: any) => 
                        j.id !== realJobId && 
                        j.id !== draggedJob.id &&
                        !(typeof draggedJob.id === 'string' && j.id === draggedJob.id)
                    )
                    
                    // Get the job object to update (find it first)
                    let jobToUpdate = prevJobs.find((j: any) => 
                        j.id === realJobId || 
                        (j.id === draggedJob.id && typeof draggedJob.id === 'number')
                    ) || draggedJob
                    
                    // Update the job with new position
                    const updatedJob = {
                        ...jobToUpdate,
                        id: realJobId,
                        scheduled_date: dateString,
                        sort_order: newIndex,
                        is_projected: false
                    }
                    
                    // Get all jobs for the target day (excluding the moved one)
                    const targetDayJobs = filteredJobs.filter((j: any) => 
                        j.scheduled_date === dateString && 
                        j.assigned_user_id === draggedJob.assigned_user_id &&
                        typeof j.id === 'number'
                    )
                    
                    // Sort them by current sort_order
                    targetDayJobs.sort((a: any, b: any) => {
                        const aOrder = a.sort_order ?? 0
                        const bOrder = b.sort_order ?? 0
                        if (aOrder !== bOrder) return aOrder - bOrder
                        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
                    })
                    
                    // Insert the updated job at the correct position
                    targetDayJobs.splice(newIndex, 0, updatedJob)
                    
                    // Update sort_order for all jobs in the target day to match their array position
                    targetDayJobs.forEach((job: any, idx: number) => {
                        job.sort_order = idx
                    })
                    
                    // Rebuild the jobs array: keep jobs from other days, replace jobs from target day
                    const otherDaysJobs = filteredJobs.filter((j: any) => 
                        !(j.scheduled_date === dateString && j.assigned_user_id === draggedJob.assigned_user_id)
                    )
                    
                    // Combine: other days + updated target day jobs
                    return [...otherDaysJobs, ...targetDayJobs]
                })
                
                // Clear drag state immediately
                setDraggedJob(null)
                setDragOverDate(null)
                setDragOverJobId(null)
                setDragOverPosition(null)
                
                // No refresh - the optimistic update is sufficient
            } catch (error) {
                console.error('Error reordering job:', error)
                alert('Failed to reorder job. Please try again.')
                setDraggedJob(null)
                setDragOverDate(null)
                setDragOverJobId(null)
                setDragOverPosition(null)
            }
            return
        }
        
        // If dropping on a different day, show the move modal
        if (!isSameDay) {
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
            setDragOverJobId(null)
            setDragOverPosition(null)
        } else {
            // Same day but no target job - just clear
            setDraggedJob(null)
            setDragOverDate(null)
            setDragOverJobId(null)
            setDragOverPosition(null)
        }
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

    // Get address string for display (address • zip city) to match design e.g. "Tyttebærvej 2 • 2400 København"
    const getAddressDisplay = (job: any) => {
        const parts: string[] = []
        if (job.address) parts.push(job.address)
        const zipCity = [job.zip_code, job.city].filter(Boolean).join(' ')
        if (zipCity) parts.push(zipCity)
        return parts.join(' • ')
    }

    // Get full address for clipboard (Google Maps format)
    const getFullAddressForClipboard = (job: any) => {
        const parts = []
        if (job.address) parts.push(job.address)
        if (job.zip_code) parts.push(job.zip_code)
        if (job.city) parts.push(job.city)
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
            <div className="flex items-center justify-center min-h-screen bg-page">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accent-500 border-t-transparent"></div>
                    <p className="mt-2 text-primary-500">Loading...</p>
                </div>
            </div>
        )
    }

    return (
        <AppLayout>
            <div className="space-y-4 overflow-x-hidden max-w-full flex-1 flex flex-col min-h-0">
                {apiError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <div className="text-sm text-red-800 font-medium">Jobs page error</div>
                    <div className="text-xs text-red-700 mt-1">{apiError}</div>
                    <div className="text-xs text-red-700 mt-2">
                      If this says “No active company selected”, log out and log back in (or go to <span className="font-mono">/select-company</span>).
                    </div>
                  </div>
                )}
                {/* Top Bar — no background, border, or shadow; no padding so sides align with content */}
                <div className="flex items-center justify-between gap-4">
                    {/* Left: square softly-rounded arrows, Today (underlined), month year */}
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={viewMode === 'month' ? goToPreviousMonth : goToPreviousWeek} 
                            className="w-8 h-8 flex items-center justify-center rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors" 
                            aria-label={viewMode === 'month' ? 'Previous month' : 'Previous week'}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button 
                            onClick={viewMode === 'month' ? goToNextMonth : goToNextWeek} 
                            className="w-8 h-8 flex items-center justify-center rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors" 
                            aria-label={viewMode === 'month' ? 'Next month' : 'Next week'}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                        <button 
                            onClick={viewMode === 'month' ? goToCurrentMonth : goToCurrentWeek} 
                            className="text-sm font-medium text-gray-700 hover:text-primary-600 underline"
                        >
                            Today
                        </button>
                        <span className="text-sm font-medium text-primary-500">
                            {viewMode === 'month' 
                                ? currentWeek.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                                : weekDays[0].toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                            }
                        </span>
                    </div>

                    {/* Right: user pill (thin light green border, green icon+name), then Day|Week|Month|Year */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 min-w-0 max-w-[200px] border border-accent-500/70 rounded-full px-3 py-1.5 bg-white">
                            <UserCircleIcon className="w-5 h-5 text-accent-500 flex-shrink-0" />
                            <div className="relative flex-1 min-w-0">
                                <select
                                    value={selectedUserId === 'all' ? 'all' : String(selectedUserId || '')}
                                    onChange={(e) => {
                                        isUserActionRef.current = true
                                        const raw = e.target.value
                                        if (raw === 'all') { setSelectedUserId('all'); return }
                                        const id = parseInt(raw)
                                        if (!isNaN(id)) setSelectedUserId(id)
                                    }}
                                    className="w-full bg-transparent border-none text-sm font-medium text-accent-500 focus:ring-0 focus:outline-none cursor-pointer appearance-none pr-6 py-1"
                                >
                                    <option value="all">All team</option>
                                    {users.map((u) => (
                                        <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                                    ))}
                                </select>
                                <ChevronDownIcon className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                            </div>
                        </div>
                        <div className="flex rounded-lg bg-gray-100 p-0.5">
                            {(['day','week','month','year'] as const).map((m) => (
                                <button
                                    key={m}
                                    onClick={() => setViewMode(m)}
                                    className={`px-4 py-2 text-sm font-medium rounded-md capitalize transition-colors ${viewMode === m ? 'bg-accent-500 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Wrapper around all job lists — background #fff, padding 10px */}
                <div className="bg-[#fff] rounded-xl p-[10px] flex flex-col overflow-hidden max-w-full flex-1 min-h-0">
                {viewMode === 'month' ? (
                    /* Month Calendar View */
                    <div className="space-y-2">
                        {/* Weekday headers */}
                        <div className="grid grid-cols-7 gap-2 mb-2">
                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                                <div key={day} className="text-center text-xs font-semibold text-gray-600 py-2">
                                    {day}
                                </div>
                            ))}
                        </div>
                        {/* Calendar grid */}
                        <div className="grid grid-cols-7 gap-2">
                            {getMonthDays().map((day, index) => {
                                const dayJobs = getJobsForDay(day)
                                const dateString = toLocalDateString(day)
                                const isDragOver = dragOverDate === dateString
                                const isTodayBanner = isToday(day)
                                const isCurrentMonth = day.getMonth() === currentWeek.getMonth()
                                
                                // Calculate capacity bar for this day
                                const jsDayOfWeek = day.getDay()
                                const dayOfWeekIndex = jsDayOfWeek === 0 ? 6 : jsDayOfWeek - 1
                                const workHoursForDay = getWorkHoursForDay(dayOfWeekIndex)
                                const occupiedHours = getOccupiedTime(day)
                                const workHoursNum = typeof workHoursForDay === 'number' ? workHoursForDay : parseFloat(workHoursForDay) || 0
                                
                                // If there are jobs but 0 hours, show red
                                const hasJobsButNoHours = dayJobs.length > 0 && occupiedHours === 0
                                
                                // Calculate utilization - if jobs exist but no hours, treat as 100%+ (red)
                                const utilizationPercent = hasJobsButNoHours 
                                    ? 100 
                                    : (workHoursNum > 0 ? (occupiedHours / workHoursNum) * 100 : 0)
                                
                                // Cap at 100% - if over 100%, show all red (don't extend beyond container)
                                const barPercent = Math.min(100, utilizationPercent)
                                const barColor = hasJobsButNoHours || utilizationPercent > 100 
                                    ? '#EF4444' // Red if jobs with 0 hours or over capacity
                                    : utilizationPercent > 0 
                                        ? '#3DD57A' // Green if within capacity
                                        : 'transparent' // Transparent if no utilization
                                
                                return (
                                    <div
                                        key={index}
                                        className={`flex flex-col rounded-xl overflow-hidden bg-[#FCFCFC] p-[10px] relative min-h-[120px] ${
                                            !isCurrentMonth ? 'opacity-50' : ''
                                        } ${isDragOver ? 'ring-2 ring-accent-500/50' : ''} ${
                                            isTodayBanner ? 'ring-2 ring-accent-500' : ''
                                        }`}
                                        onDragOver={(e) => handleDragOver(e, dateString)}
                                        onDragLeave={handleDragLeave}
                                        onDrop={(e) => handleDrop(e, dateString)}
                                    >
                                        {/* Date header */}
                                        <div className={`text-xs font-medium mb-2 ${isTodayBanner ? 'text-accent-600 font-bold' : 'text-gray-700'}`}>
                                            {day.getDate()}
                                        </div>
                                        
                                        {/* Capacity bar - always show if current month */}
                                        {isCurrentMonth && (
                                            <div className="mb-2">
                                                <div className="w-full h-1 bg-primary-500/30 rounded-full overflow-hidden relative">
                                                    {/* Bar - capped at 100% width, color depends on utilization */}
                                                    {barPercent > 0 && (
                                                        <div
                                                            className="h-full rounded-full transition-all absolute left-0 top-0 z-10"
                                                            style={{ 
                                                                width: `${barPercent}%`, 
                                                                backgroundColor: barColor
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* Job cards */}
                                        <div className="flex-1 overflow-y-auto space-y-1.5" style={{ maxHeight: '200px' }}>
                                            {loading ? (
                                                <div className="flex items-center justify-center h-16">
                                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-accent-500 border-t-transparent" />
                                                </div>
                                            ) : dayJobs.length > 0 ? (
                                                dayJobs.slice(0, 3).map((job) => {
                                                    const isJobCompleted = job.status === 'completed'
                                                    const isJobCancelled = job.status === 'cancelled'
                                                    
                                                    return (
                                                        <div
                                                            key={job.id}
                                                            draggable={!isJobCancelled}
                                                            onDragStart={(e) => !isJobCancelled && handleDragStart(e, job)}
                                                            onDragEnd={handleDragEnd}
                                                            onClick={() => handleJobClick(job)}
                                                            className={`rounded-lg p-2 text-xs transition-all border ${
                                                                isJobCancelled ? 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed' : 'bg-[#fff] border-[#F1F8F4] hover:border-[#E0EDE4] cursor-pointer'
                                                            } ${draggedJob?.id === job.id ? 'opacity-50' : ''}`}
                                                        >
                                                            <div className="font-semibold text-gray-800 truncate flex items-center gap-1">
                                                                {isJobCompleted && !isJobCancelled && (
                                                                    <CheckIcon className="w-3 h-3 text-accent-500 flex-shrink-0" strokeWidth={3} />
                                                                )}
                                                                <span className="truncate">
                                                                    {[job.name || job.first_name, job.last_name].filter(Boolean).join(' ') || 'Client'}
                                                                </span>
                                                            </div>
                                                            {isJobCancelled && (
                                                                <span className="text-[9px] font-medium text-red-600">Cancelled</span>
                                                            )}
                                                        </div>
                                                    )
                                                })
                                            ) : null}
                                            {dayJobs.length > 3 && (
                                                <div className="text-[10px] text-gray-500 text-center pt-1">
                                                    +{dayJobs.length - 3} more
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Add job button */}
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); openCreateJobForDate(dateString) }}
                                            className="absolute bottom-1 right-1 inline-flex items-center justify-center w-5 h-5 text-accent-600 hover:text-accent-700 hover:bg-accent-50 rounded"
                                            title="Add job"
                                        >
                                            <PlusIcon className="w-3 h-3" />
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ) : (
                    /* Weekly Calendar — horizontal slider showing 5 days by default, scrollable to show all 7 days */
                    <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden">
                        {/* Scrollable columns container */}
                        <div 
                            ref={weekScrollContainerRef}
                            className="flex gap-2 overflow-x-auto week-scrollbar flex-1 min-h-0 w-full"
                            style={{ 
                                scrollbarWidth: 'thin',
                                scrollbarColor: '#9CA3AF #F3F4F6',
                                scrollSnapType: 'x mandatory',
                                WebkitOverflowScrolling: 'touch',
                                overflowY: 'hidden'
                            }}
                            onScroll={(e) => {
                                const target = e.target as HTMLDivElement
                                setWeekScrollPosition(target.scrollLeft)
                            }}
                        >
                            {weekDays.map((day, originalIndex) => {
                                    const dayJobs = getJobsForDay(day)
                                    const jsDayOfWeek = day.getDay()
                                    const dayOfWeekIndex = jsDayOfWeek === 0 ? 6 : jsDayOfWeek - 1
                                    const workHoursForDay = getWorkHoursForDay(dayOfWeekIndex)
                                    const occupiedHours = getOccupiedTime(day)
                                    const workHoursNum = typeof workHoursForDay === 'number' ? workHoursForDay : parseFloat(workHoursForDay) || 0
                                    const utilizationPercent = workHoursNum > 0 ? (occupiedHours / workHoursNum) * 100 : 0
                                    const greenPercent = Math.min(100, utilizationPercent) // Green bar up to 100%
                                    const amberPercent = Math.max(0, utilizationPercent - 100) // Overflow percentage (e.g., 20% for 120%)
                                    const overflowColor = amberPercent > 50 ? '#EF4444' : '#F59E0B' // Red if overflow > 50%, otherwise amber

                                    const dateString = toLocalDateString(day)
                                    const isDragOver = dragOverDate === dateString
                                    const isTodayBanner = isToday(day)

                                    return (
                                        <div
                                            key={originalIndex}
                                            className={`flex flex-col rounded-xl overflow-hidden bg-[#FCFCFC] p-[10px] relative flex-shrink-0 h-full ${isDragOver ? 'ring-2 ring-accent-500/50' : ''}`}
                                            style={{ 
                                                width: 'calc((100% - 32px) / 5)', // 5 columns visible, accounting for gap (8px * 4 gaps = 32px)
                                                minWidth: '200px',
                                                scrollSnapAlign: 'start',
                                                scrollSnapStop: 'always'
                                            }}
                                            onDragOver={(e) => handleDragOver(e, dateString)}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, dateString)}
                                        >
                                            {/* BANNER: month image from app + overlay. Today=#3DD57A, others=#193434. Date top-left, day name large bold white. */}
                                            {(() => {
                                                const MONTH_IMGS = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'] as const
                                                const monthSlug = MONTH_IMGS[day.getMonth()]
                                                return (
                                                    <div
                                                        className="relative h-16 overflow-hidden rounded-xl bg-center"
                                                        style={{
                                                            backgroundImage: `url(/images/${monthSlug}.jpg)`,
                                                            backgroundColor: isTodayBanner ? '#3DD57A' : '#193434',
                                                            backgroundSize: 'cover',
                                                            backgroundRepeat: 'no-repeat',
                                                        }}
                                                    >
                                                        {/* Overlay: today=green tint, others=dark tint so text is readable */}
                                                        <div
                                                            className="absolute inset-0"
                                                            style={{ backgroundColor: isTodayBanner ? 'rgba(61,213,122,0.72)' : 'rgba(25,52,52,0.78)' }}
                                                        />
                                                        {/* Subtle landscape + blossoms on non-today (lighter silhouette, pink/purple blossoms) */}
                                                        {!isTodayBanner && (
                                                            <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 320 96" preserveAspectRatio="xMidYMax slice" aria-hidden>
                                                                <ellipse cx="80" cy="130" rx="180" ry="60" fill="rgba(255,255,255,0.12)" />
                                                                <ellipse cx="200" cy="125" rx="200" ry="65" fill="rgba(255,255,255,0.08)" />
                                                                <path d="M 45 96 L 52 48 Q 59 30 66 48 L 73 96 Z" fill="rgba(255,255,255,0.14)" />
                                                                <path d="M 125 96 L 134 42 Q 143 22 152 42 L 161 96 Z" fill="rgba(255,255,255,0.1)" />
                                                                <circle cx="54" cy="44" r="2.5" fill="rgba(240,210,230,0.5)" />
                                                                <circle cx="136" cy="38" r="2" fill="rgba(230,200,220,0.45)" />
                                                            </svg>
                                                        )}
                                                        {isTodayBanner && (
                                                            <svg className="absolute inset-0 w-full h-full opacity-35" viewBox="0 0 320 96" preserveAspectRatio="xMidYMax slice" aria-hidden>
                                                                <ellipse cx="80" cy="130" rx="180" ry="60" fill="rgba(0,50,40,0.5)" />
                                                                <ellipse cx="200" cy="125" rx="200" ry="65" fill="rgba(0,55,45,0.45)" />
                                                                <path d="M 45 96 L 52 48 Q 59 30 66 48 L 73 96 Z" fill="rgba(0,55,45,0.55)" />
                                                                <path d="M 125 96 L 134 42 Q 143 22 152 42 L 161 96 Z" fill="rgba(0,50,40,0.5)" />
                                                            </svg>
                                                        )}
                                                        <div className="relative z-10 px-3 py-3 h-full flex flex-col justify-between">
                                                            <div className={`text-[11px] ${isTodayBanner ? 'text-white/90' : 'text-white/80'}`}>
                                                                {day.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                            </div>
                                                            <div className="text-lg font-bold text-white">
                                                                {formatWeekday(day)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })()}

                                            {/* Total hour: "Total hour:" above left, "X / Y" above right; bar 100% width below. No bottom border. */}
                                            <div className="pt-2.5 pb-2.5">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-[11px] font-medium text-gray-700">Total hour:</span>
                                                    <span className="text-[11px] font-medium text-gray-700 tabular-nums">{occupiedHours.toFixed(1)} / {workHoursNum.toFixed(1)}</span>
                                                </div>
                                                <div className="w-full h-2 bg-primary-500/30 rounded-full relative" style={{ overflow: 'visible' }}>
                                                    {/* Green bar - shows capacity up to 100% */}
                                                    {greenPercent > 0 && (
                                                        <div
                                                            className="h-full rounded-full transition-all absolute left-0 top-0 z-10"
                                                            style={{ width: `${greenPercent}%`, backgroundColor: '#3DD57A' }}
                                                        />
                                                    )}
                                                    {/* Overflow bar - shows overflow above 100%, overlays green from left */}
                                                    {amberPercent > 0 && (
                                                        <div
                                                            className="h-full rounded-full transition-all absolute left-0 top-0 z-20"
                                                            style={{ 
                                                                width: `${amberPercent}%`, 
                                                                backgroundColor: overflowColor
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            </div>

                                            {/* Job cards — items bg #fff, border #F1F8F4; column has p-[10px] so no extra padding here */}
                                            <div className="flex-1 overflow-y-auto">
                                                {loading ? (
                                                    <div className="flex items-center justify-center h-32">
                                                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent-500 border-t-transparent" />
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {/* Top drop zone — drop at start of list */}
                                                        <div
                                                            className="relative min-h-[12px] -mt-1"
                                                            onDragOver={(e) => {
                                                                e.preventDefault()
                                                                e.stopPropagation()
                                                                e.dataTransfer.dropEffect = 'move'
                                                                if (draggedJob && draggedJob.scheduled_date === dateString) {
                                                                    setDragOverJobId('top')
                                                                    setDragOverPosition('above')
                                                                    setDragOverDate(dateString)
                                                                }
                                                            }}
                                                            onDragLeave={() => { setDragOverJobId(null); setDragOverPosition(null) }}
                                                            onDrop={(e) => {
                                                                e.preventDefault()
                                                                e.stopPropagation()
                                                                if (draggedJob && draggedJob.scheduled_date === dateString) {
                                                                    handleDrop(e, dateString, 'top')
                                                                }
                                                                setDragOverJobId(null)
                                                                setDragOverPosition(null)
                                                            }}
                                                        >
                                                            {draggedJob && dragOverJobId === 'top' && (
                                                                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-accent-500 rounded-full z-30 pointer-events-none" />
                                                            )}
                                                        </div>
                                                        {dayJobs.length > 0 ? (
                                                        <>
                                                        {dayJobs.map((job, jobIndex) => {
                                                            const hasTime = job.scheduled_time_from || job.scheduled_time_to
                                                            const addressDisplay = getAddressDisplay(job)
                                                            const isJobCompleted = job.status === 'completed'
                                                            const isJobCancelled = job.status === 'cancelled'
                                                            const taskCount = (job.job_services || job.services || []).length || 1
                                                            const showDividerAbove = draggedJob && draggedJob.id !== job.id && dragOverJobId === job.id && dragOverPosition === 'above'
                                                            const showDividerBelow = draggedJob && draggedJob.id !== job.id && dragOverJobId === job.id && dragOverPosition === 'below'

                                                            return (
                                                                <div key={job.id} className="relative">
                                                                    {/* Green divider above job - absolutely positioned overlay */}
                                                                    {showDividerAbove && (
                                                                        <div className="absolute -top-1 left-0 right-0 h-0.5 bg-accent-500 rounded-full z-30 pointer-events-none" />
                                                                    )}
                                                                    <div
                                                                        draggable={!isJobCancelled}
                                                                        onDragStart={(e) => !isJobCancelled && handleDragStart(e, job)}
                                                                        onDragEnd={handleDragEnd}
                                                                        onDragOver={(e) => {
                                                                            if (!isJobCancelled && draggedJob && draggedJob.id !== job.id) {
                                                                                const rect = e.currentTarget.getBoundingClientRect()
                                                                                const y = e.clientY - rect.top
                                                                                const position = y < rect.height / 2 ? 'above' : 'below'
                                                                                handleDragOverJob(e, job, position)
                                                                            }
                                                                        }}
                                                                        onDragLeave={handleDragLeaveJob}
                                                                        onDrop={(e) => {
                                                                            if (!isJobCancelled && draggedJob && draggedJob.id !== job.id) {
                                                                                const rect = e.currentTarget.getBoundingClientRect()
                                                                                const y = e.clientY - rect.top
                                                                                const position = y < rect.height / 2 ? 'above' : 'below'
                                                                                handleDrop(e, job.scheduled_date, job.id, position)
                                                                            }
                                                                        }}
                                                                        onClick={() => handleJobClick(job)}
                                                                        className={`rounded-xl p-3 transition-all border ${
                                                                            isJobCancelled ? 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed' : 'bg-[#fff] border-[#F1F8F4] hover:border-[#E0EDE4] cursor-pointer'
                                                                        } ${draggedJob?.id === job.id ? 'opacity-50' : ''}`}
                                                                    >
                                                                    {/* Row 1: Client (left) + orange circle (right) */}
                                                                    <div className="flex items-start justify-between gap-2 mb-1">
                                                                        <Link href={`/clients/${job.client_id}`} className="font-semibold text-sm text-gray-800 truncate hover:text-accent-600 min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
                                                                            {[job.name || job.first_name, job.last_name].filter(Boolean).join(' ') || 'Client'}
                                                                        </Link>
                                                                        {taskCount > 0 && (
                                                                            <span className="flex-shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white bg-orange-500">
                                                                                {taskCount}
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {addressDisplay && (
                                                                        <div onClick={(e) => copyAddressToClipboard(job, e)} className="text-xs text-gray-600 truncate mb-1 cursor-pointer hover:text-accent-600" title="Copy address">
                                                                            {addressDisplay}
                                                                        </div>
                                                                    )}

                                                                    {/* Clock icon + time (e.g. 12:00 - 14:00) */}
                                                                    {hasTime && (
                                                                        <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1.5">
                                                                            <ClockIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                                                            {job.scheduled_time_from && job.scheduled_time_to
                                                                                ? `${(job.scheduled_time_from+'').substring(0,5)} - ${(job.scheduled_time_to+'').substring(0,5)}`
                                                                                : (job.scheduled_time_from+'').substring(0,5) || ''}
                                                                        </div>
                                                                    )}

                                                                    {/* Under border: tasks, time, price (left, same style) | completed button (right) */}
                                                                    <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex items-center justify-between gap-2">
                                                                        <div className="flex items-center gap-3 text-[11px] text-gray-500 min-w-0">
                                                                            <span className="flex items-center gap-1 flex-shrink-0">
                                                                                <DocumentTextIcon className="w-3.5 h-3.5" />
                                                                                {taskCount} task{taskCount !== 1 ? 's' : ''}
                                                                            </span>
                                                                            {job.total_duration != null && (
                                                                                <span className="flex items-center gap-1 flex-shrink-0">
                                                                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/></svg>
                                                                                    {formatDuration(job.total_duration)}
                                                                                </span>
                                                                            )}
                                                                            {job.total_price != null && job.total_price > 0 && (
                                                                                <span className="text-[11px] text-gray-500 flex-shrink-0">{formatPrice(job.total_price)}</span>
                                                                            )}
                                                                        </div>
                                                                        {isJobCancelled ? (
                                                                            <span className="text-[10px] font-medium text-red-600 px-1.5 py-0.5 rounded bg-red-100 flex-shrink-0">Cancelled</span>
                                                                        ) : typeof job.status !== 'undefined' && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => { e.stopPropagation(); handleToggleJobCompletion(job) }}
                                                                                className={`w-5 h-5 rounded-full flex items-center justify-center border-2 flex-shrink-0 ${
                                                                                    isJobCompleted ? 'bg-accent-500 border-accent-500 text-white' : 'border-gray-300 bg-white'
                                                                                }`}
                                                                                title={isJobCompleted ? 'Mark not completed' : 'Mark completed'}
                                                                            >
                                                                                <CheckIcon className={`w-3 h-3 ${!isJobCompleted ? 'text-gray-400' : ''}`} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    </div>
                                                                    {/* Green divider below job - absolutely positioned overlay */}
                                                                    {showDividerBelow && (
                                                                        <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-accent-500 rounded-full z-30 pointer-events-none" />
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                        {/* Bottom drop zone — drop at end of list */}
                                                        <div
                                                            className="relative min-h-[12px] -mb-1"
                                                            onDragOver={(e) => {
                                                                e.preventDefault()
                                                                e.stopPropagation()
                                                                e.dataTransfer.dropEffect = 'move'
                                                                if (draggedJob && draggedJob.scheduled_date === dateString) {
                                                                    setDragOverJobId('bottom')
                                                                    setDragOverPosition('below')
                                                                    setDragOverDate(dateString)
                                                                }
                                                            }}
                                                            onDragLeave={() => { setDragOverJobId(null); setDragOverPosition(null) }}
                                                            onDrop={(e) => {
                                                                e.preventDefault()
                                                                e.stopPropagation()
                                                                if (draggedJob && draggedJob.scheduled_date === dateString) {
                                                                    handleDrop(e, dateString, 'bottom')
                                                                }
                                                                setDragOverJobId(null)
                                                                setDragOverPosition(null)
                                                            }}
                                                        >
                                                            {draggedJob && dragOverJobId === 'bottom' && (
                                                                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-accent-500 rounded-full z-30 pointer-events-none" />
                                                            )}
                                                        </div>
                                                        </>
                                                        ) : (
                                                            <div className="text-center text-gray-400 text-xs mt-8">No jobs</div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); openCreateJobForDate(dateString) }}
                                                className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-xs font-medium text-accent-600 hover:text-accent-700"
                                                title="Add job"
                                            >
                                                <PlusIcon className="w-4 h-4" />
                                                Add job
                                            </button>
                                        </div>
                                    )
                                })}
                        </div>
                    </div>
                )}
                </div>

            </div>

            {/* Floating Create Button with Menu */}
            <div className="fixed bottom-6 right-6 z-40" data-create-menu>
                {/* Dropdown Menu */}
                {showCreateMenu && (
                    <div className="absolute bottom-full right-0 mb-2 bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 min-w-[180px]">
                        <button onClick={() => { setShowCreateMenu(false); setIsCreateModalOpen(true) }} className="w-full text-left px-4 py-2.5 text-sm text-primary-500 hover:bg-gray-50 transition-colors rounded-lg mx-1">
                            Create Job
                        </button>
                        <button onClick={() => { setShowCreateMenu(false); setIsSubscriptionModalOpen(true) }} className="w-full text-left px-4 py-2.5 text-sm text-primary-500 hover:bg-gray-50 transition-colors rounded-lg mx-1">
                            Create Subscription
                        </button>
                        <button onClick={() => { setShowCreateMenu(false); setIsCreateClientModalOpen(true) }} className="w-full text-left px-4 py-2.5 text-sm text-primary-500 hover:bg-gray-50 transition-colors rounded-lg mx-1">
                            Create Client
                        </button>
                    </div>
                )}

                {/* Create Button */}
                <button
                    onClick={() => setShowCreateMenu(!showCreateMenu)}
                    className="bg-accent-500 text-white px-4 py-2.5 rounded-xl shadow-md hover:shadow-lg hover:bg-accent-600 transition-all flex items-center space-x-2 font-medium"
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
                mode="job"
            />

            {/* Create Subscription Modal */}
            <CreateSubscription
                isOpen={isSubscriptionModalOpen}
                onClose={() => {
                    setIsSubscriptionModalOpen(false)
                    setCreateJobPrefillDate(null)
                    setCreateJobPrefillUserId(null)
                }}
                onSubscriptionCreated={() => {
                    setIsSubscriptionModalOpen(false)
                    setShowCreateMenu(false)
                    setCreateJobPrefillDate(null)
                    setCreateJobPrefillUserId(null)
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
            <div className="min-h-screen bg-page flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accent-500 border-t-transparent"></div>
                    <p className="mt-2 text-primary-500">Loading...</p>
                </div>
            </div>
        }>
            <JobsPageContent />
        </Suspense>
    )
}