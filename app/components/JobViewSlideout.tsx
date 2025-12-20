'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { XMarkIcon, UserIcon, CalendarIcon, ClockIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import ConfirmModal from './ConfirmModal'
import { getEmailTemplate } from '../utils/emailTemplates'

interface NoteInputProps {
  jobId: number
  onNoteAdded: () => void
}

function NoteInput({ jobId, onNoteAdded }: NoteInputProps) {
  const [noteContent, setNoteContent] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!noteContent.trim()) {
      setError('Note content is required')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/jobs/${jobId}/notes`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: noteContent.trim() })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to add note')
      }

      setNoteContent('')
      onNoteAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add note')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-start gap-2">
        <textarea
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          placeholder="Add a note..."
          rows={3}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
        />
        <button
          type="submit"
          disabled={isSubmitting || !noteContent.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Adding...' : 'Add'}
        </button>
      </div>
      {error && (
        <div className="text-xs text-red-600">{error}</div>
      )}
    </form>
  )
}

interface JobViewSlideoutProps {
  isOpen: boolean
  onClose: () => void
  job: any
  onJobUpdated?: () => void
}

interface JobLog {
  id: number
  action: string
  description: string
  notification_subject?: string | null
  notification_message?: string | null
  notification_email?: string | null
  note_content?: string | null
  created_at: string
  first_name?: string | null
  last_name?: string | null
}

interface MoveJobModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (opts: { newDate: string, notify: boolean, subject?: string, message?: string }) => void
  oldDate: string
  newDate: string
  customerName: string
  customerEmail?: string
}

function MoveJobModal({ isOpen, onClose, onConfirm, oldDate, newDate, customerName, customerEmail }: MoveJobModalProps) {
  const [notifyCustomer, setNotifyCustomer] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [subject, setSubject] = useState('')

  useEffect(() => {
    if (isOpen) {
      // Get current user from localStorage
      const userStr = localStorage.getItem('user')
      let userName = 'Your Team'
      if (userStr) {
        try {
          const user = JSON.parse(userStr)
          if (user.firstName && user.lastName) {
            userName = `${user.firstName} ${user.lastName}`
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      const formatDateDisplay = (dateString: string) => {
        const date = new Date(dateString + 'T00:00:00')
        return date.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })
      }

      const oldDateFormatted = formatDateDisplay(oldDate)
      const initialNew = newDate || oldDate
      const newDateFormatted = formatDateDisplay(initialNew)

      setSelectedDate(initialNew)

      // Default subject
      setSubject(`Appointment date updated (${oldDateFormatted} → ${newDateFormatted})`)

      const defaultMessage = `Dear ${customerName},

I wanted to let you know that your appointment has been rescheduled.

Previously: ${oldDateFormatted}
New date: ${newDateFormatted}

If the new date does not work for you, please let us know and we will find an alternative.

Kind regards,
${userName}`

      setMessage(defaultMessage)
      setNotifyCustomer(false)
    }
  }, [isOpen, oldDate, newDate, customerName])

  if (!isOpen) return null

  const formatDateDisplay = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00')
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900">Move Job</h3>
            <p className="text-sm text-gray-600 mt-1">You are about to move this job to a new date</p>
          </div>

          <div className="p-6 space-y-6">
            {/* Date Selection */}
            <div className="space-y-3 bg-gray-50 rounded-lg p-6">
              <div className="grid grid-cols-2 gap-6 items-end">
                <div className="text-center">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Current</div>
                  <div className="text-2xl font-bold text-gray-900">{formatDateDisplay(oldDate)}</div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">New date</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Notify Customer Option */}
            <div className="space-y-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyCustomer}
                  onChange={(e) => setNotifyCustomer(e.target.checked)}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Notify customer</span>
                  {customerEmail && (
                    <span className="text-xs text-gray-500 ml-2">({customerEmail})</span>
                  )}
                </div>
              </label>

              {notifyCustomer && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Email Subject
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                    placeholder="Subject..."
                  />
                  <label className="block text-sm font-medium text-gray-700">
                    Email Message
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={8}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 resize-none"
                    placeholder="Enter your message..."
                  />
                </div>
              )}
            </div>
          </div>

          <div className="p-6 border-t border-gray-200 bg-gray-50 flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm({ newDate: selectedDate || oldDate, notify: notifyCustomer, subject: notifyCustomer ? subject : undefined, message: notifyCustomer ? message : undefined })}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
            >
              {notifyCustomer ? 'Send and move job' : 'Proceed with move'}
            </button>
          </div>
        </div>

        {/* Footer actions are handled in the main slideout, not in this modal */}
      </div>
    </>
  )
}

export default function JobViewSlideout({ isOpen, onClose, job, onJobUpdated }: JobViewSlideoutProps) {
  const router = useRouter()
  const [jobDetails, setJobDetails] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [jobLogs, setJobLogs] = useState<JobLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [pendingNewDate, setPendingNewDate] = useState<string | null>(null)
  const [moveTemplate, setMoveTemplate] = useState<{ subject: string; message: string }>({ subject: '', message: '' })
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [pendingTimeFrom, setPendingTimeFrom] = useState<string>('')
  const [pendingTimeTo, setPendingTimeTo] = useState<string>('')
  const [isTimeRangeEdit, setIsTimeRangeEdit] = useState<boolean>(false)
  const [timeTemplate, setTimeTemplate] = useState<{ subject: string; message: string }>({ subject: '', message: '' })
  const [showAssigneeModal, setShowAssigneeModal] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [pendingAssignee, setPendingAssignee] = useState<number | ''>('')
  const [assigneeTemplate, setAssigneeTemplate] = useState<{ subject: string; message: string }>({ subject: '', message: '' })
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [cancelTemplate, setCancelTemplate] = useState<{ subject: string; message: string }>({ subject: '', message: '' })

  const currentJob = jobDetails || job
  const isCompleted = currentJob?.status === 'completed'
  const isProjectedJob = !!(currentJob?.is_projected || (typeof currentJob?.id === 'string' && currentJob.id.startsWith('subscription-')))

  const getProjectedMeta = (): { subscriptionId: number; occurrence: number } | null => {
    const subId = typeof currentJob?.recurring_job_id === 'number' ? currentJob.recurring_job_id : null
    const occ = typeof currentJob?.recurring_occurrence === 'number' ? currentJob.recurring_occurrence : null
    if (subId && occ) return { subscriptionId: subId, occurrence: occ }

    // Fallback: parse virtual id format: subscription-<subId>-<occ>
    if (typeof currentJob?.id === 'string' && currentJob.id.startsWith('subscription-')) {
      const parts = currentJob.id.split('-')
      if (parts.length >= 3) {
        const parsedSubId = parseInt(parts[1], 10)
        const parsedOcc = parseInt(parts[2], 10)
        if (Number.isFinite(parsedSubId) && Number.isFinite(parsedOcc)) {
          return { subscriptionId: parsedSubId, occurrence: parsedOcc }
        }
      }
    }
    return null
  }

  const ensureRealJobId = async (): Promise<number | null> => {
    if (typeof currentJob?.id === 'number') return currentJob.id

    if (!isProjectedJob) {
      alert('Invalid job id. Please refresh the page and try again.')
      return null
    }

    const meta = getProjectedMeta()
    if (!meta) {
      alert('Could not resolve this subscription occurrence. Please refresh the page and try again.')
      return null
    }

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(
        apiUrl(`/subscriptions/${meta.subscriptionId}/occurrences/${meta.occurrence}/materialize`),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            // create it on the computed date first; move/cancel/etc can happen after
            scheduled_date: currentJob?.scheduled_date || undefined
          })
        }
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || data.details || 'Failed to create real job')

      const jobId = data.jobId
      if (typeof jobId !== 'number') throw new Error('Invalid jobId returned from server')

      // Update local state so future actions are treated as real.
      if (jobDetails) {
        setJobDetails({
          ...jobDetails,
          id: jobId,
          is_projected: false,
          recurring_job_id: meta.subscriptionId,
          recurring_occurrence: meta.occurrence
        })
      } else {
        setJobDetails({
          ...(currentJob || {}),
          id: jobId,
          is_projected: false,
          recurring_job_id: meta.subscriptionId,
          recurring_occurrence: meta.occurrence
        })
      }

      // Refresh full details/logs now that it exists.
      if ((currentJob as any)?.client_id) {
        fetchJobDetails({ ...(currentJob || {}), id: jobId })
      } else {
        fetchJobLogs(jobId)
      }
      if (onJobUpdated) onJobUpdated()

      return jobId
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      alert('Failed to create real job from subscription: ' + msg)
      return null
    }
  }

  const toggleCompletion = async () => {
    const jobId = await ensureRealJobId()
    if (!jobId) return
    try {
      const token = localStorage.getItem('token')
      const newStatus = isCompleted ? 'scheduled' : 'completed'

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

      // Update local state
      if (jobDetails) {
        setJobDetails({ ...jobDetails, status: newStatus })
      }

      // Refresh logs so completion/uncompletion is visible
      fetchJobLogs(jobId)

      // Notify parent so calendar/list refreshes if needed
      if (onJobUpdated) {
        onJobUpdated()
      }
    } catch (error) {
      console.error('Failed to toggle job completion:', error)
      alert('Failed to update job completion status')
    }
  }

  const handleConfirmDelete = async ({ notify, message, subject }: { notify: boolean, message: string, subject: string }) => {
    const jobId = await ensureRealJobId()
    if (!jobId) return
    setIsDeleting(true)
    try {
      const token = localStorage.getItem('token')

      // Mark job as cancelled instead of deleting
      const response = await fetch(apiUrl(`/jobs/${jobId}/status`), {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'cancelled',
          notify_customer: notify,
          notification_subject: subject,
          notification_message: message
        })
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel job')
      }

      setShowDeleteModal(false)
      // Notify parent so the calendar/list can refresh (cancelled job disappears)
      if (onJobUpdated) {
        onJobUpdated()
      }
      // Close the slideout
      onClose()
    } catch (error) {
      console.error('Failed to cancel job:', error)
      alert('Failed to cancel job')
    } finally {
      setIsDeleting(false)
    }
  }

  // Fetch subscription services for projected jobs
  const fetchProjectedJobDetails = async (jobData: any) => {
    if (!jobData?.recurring_job_id) {
      // No subscription ID, keep existing data
      return
    }

    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      
      // Fetch subscription with services
      const subscriptionResponse = await fetch(apiUrl(`/clients/${jobData.client_id}/subscriptions`), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const subscriptionData = await subscriptionResponse.json()
      
      if (subscriptionResponse.ok && subscriptionData.subscriptions) {
        const subscription = subscriptionData.subscriptions.find((s: any) => s.id === jobData.recurring_job_id)
        
        if (subscription && subscription.services) {
          // Fetch assigned user info if we have assigned_user_id
          let assignedUserFirstName = ''
          let assignedUserLastName = ''
          
          if (jobData.assigned_user_id) {
            try {
              const usersResponse = await fetch(apiUrl('/users'), {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              })
              const usersData = await usersResponse.json()
              if (usersResponse.ok && usersData.users) {
                const assignedUser = usersData.users.find((u: any) => u.id === jobData.assigned_user_id)
                if (assignedUser) {
                  assignedUserFirstName = assignedUser.first_name || ''
                  assignedUserLastName = assignedUser.last_name || ''
                }
              }
            } catch (error) {
              console.error('Error fetching assigned user:', error)
            }
          }
          
          // Combine job data with subscription services
          setJobDetails({
            ...jobData,
            services: subscription.services.map((s: any) => ({
              service_id: s.service_id,
              title: s.title,
              custom_price: s.custom_price,
              custom_duration_minutes: s.custom_duration_minutes
            })),
            assigned_user_first_name: assignedUserFirstName || subscription.assigned_user_first_name || jobData.assigned_user_first_name || '',
            assigned_user_last_name: assignedUserLastName || subscription.assigned_user_last_name || jobData.assigned_user_last_name || ''
          })
        }
        // If subscription not found, keep existing data
      }
      // If fetch fails, keep existing data
    } catch (error) {
      console.error('Error fetching projected job details:', error)
      // On error, keep existing data
    } finally {
      setLoading(false)
    }
  }

  // Fetch users for assignee change
  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl('/users'), {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok) setUsers(data.users || [])
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  // Fetch job logs
  const fetchJobLogs = async (jobId: number) => {
    if (!jobId || typeof jobId !== 'number') {
      return
    }

    try {
      setLogsLoading(true)
      const token = localStorage.getItem('token')
      
      const response = await fetch(apiUrl(`/jobs/${jobId}/logs`), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (response.ok && data.logs) {
        setJobLogs(data.logs)
      }
    } catch (error) {
      console.error('Error fetching job logs:', error)
      setJobLogs([])
    } finally {
      setLogsLoading(false)
    }
  }

  // Helper function to update time template
  const updateTimeTemplate = async (newTimeFrom: string, newTimeTo: string, isRange: boolean) => {
    if (!(jobDetails || job)) return
    
    const jobData = jobDetails || job
    const oldTimeFrom = jobData.scheduled_time_from ? String(jobData.scheduled_time_from).substring(0,5) : ''
    const oldTimeTo = jobData.scheduled_time_to ? String(jobData.scheduled_time_to).substring(0,5) : ''
    const oldTime = oldTimeFrom && oldTimeTo ? `${oldTimeFrom} - ${oldTimeTo}` : (oldTimeFrom || oldTimeTo || 'unspecified')
    
    const newTime = newTimeFrom && newTimeTo ? `${newTimeFrom} - ${newTimeTo}` : (newTimeFrom || newTimeTo || 'unspecified')
    
    let userName = 'Our team'
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      if (u.first_name && u.last_name) {
        userName = `${u.first_name} ${u.last_name}`
      } else if (u.firstName && u.lastName) {
        userName = `${u.firstName} ${u.lastName}`
      }
    } catch {}
    
    const template = await getEmailTemplate('change_time', {
      clientName: `${(jobData as any).first_name || ''} ${(jobData as any).last_name || ''}`.trim() || 'Customer',
      clientFirstName: (jobData as any).first_name || 'Customer',
      clientLastName: (jobData as any).last_name || '',
      jobTime: oldTime,
      jobOldTime: oldTime,
      jobNewTime: newTime,
      jobTimeFrom: oldTimeFrom,
      jobTimeTo: oldTimeTo,
      jobOldTimeFrom: oldTimeFrom,
      jobOldTimeTo: oldTimeTo,
      jobNewTimeFrom: newTimeFrom,
      jobNewTimeTo: newTimeTo,
      userName: userName,
      companyName: (jobData as any).company_name || '',
      employeeName: (jobData as any).assigned_user_first_name && (jobData as any).assigned_user_last_name 
        ? `${(jobData as any).assigned_user_first_name} ${(jobData as any).assigned_user_last_name}` 
        : ''
    })
    
    setTimeTemplate(template)
  }

  // Open time modal
  const openTimeModal = async () => {
    const initialTimeFrom = (jobDetails || job)?.scheduled_time_from ? String((jobDetails || job).scheduled_time_from).substring(0,5) : ''
    const initialTimeTo = (jobDetails || job)?.scheduled_time_to ? String((jobDetails || job).scheduled_time_to).substring(0,5) : ''
    setPendingTimeFrom(initialTimeFrom)
    setPendingTimeTo(initialTimeTo)
    setIsTimeRangeEdit(!!((jobDetails || job)?.scheduled_time_to))
    
    // Fetch email template with initial values
    if (jobDetails || job) {
      await updateTimeTemplate(initialTimeFrom, initialTimeTo, !!initialTimeTo)
    }
    
    setShowTimeModal(true)
  }

  const handleConfirmTime = async ({ notify, message, subject }: { notify: boolean, message: string, subject: string }) => {
    const jobId = await ensureRealJobId()
    if (!jobId) return
    try {
      const token = localStorage.getItem('token')
      let finalMessage = message
      if (notify && (!finalMessage || !finalMessage.trim())) {
        const oldRange = formatTimeRange((jobDetails || job)?.scheduled_time_from, (jobDetails || job)?.scheduled_time_to) || 'unspecified'
        const newRange = ((pendingTimeFrom || pendingTimeTo) ? (pendingTimeFrom && pendingTimeTo ? `${pendingTimeFrom} - ${pendingTimeTo}` : (pendingTimeFrom || pendingTimeTo)) : 'unspecified')
        let userName = 'Our team'
        try {
          const u = JSON.parse(localStorage.getItem('user') || '{}')
          if (u.firstName && u.lastName) userName = `${u.firstName} ${u.lastName}`
        } catch {}
        finalMessage = `Dear ${(jobDetails || job)?.first_name || 'customer'},\n\nI wanted to let you know that the time of your appointment has been updated.\n\nPreviously: ${oldRange}\nNew time: ${newRange}\n\nIf the new time does not suit you, please reply and we will arrange another time.\n\nKind regards,\n${userName}`
      }
      const response = await fetch(apiUrl(`/jobs/${jobId}/time`), {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_time_from: pendingTimeFrom || null,
          scheduled_time_to: pendingTimeTo || null,
          notifyCustomer: notify,
          notification_message: notify ? finalMessage : undefined,
          notification_subject: notify ? (subject || `Appointment time updated`) : undefined
        })
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.details || err.error || 'Failed to update time')
      }
      if (jobDetails) {
        setJobDetails({ ...jobDetails, scheduled_time_from: pendingTimeFrom || null, scheduled_time_to: pendingTimeTo || null })
      }
      fetchJobLogs(jobId)
      setShowTimeModal(false)
      if (onJobUpdated) onJobUpdated()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      alert('Failed to update time: ' + msg)
    }
  }

  // Open assignee modal
  const openAssigneeModal = async () => {
    setPendingAssignee((jobDetails || job)?.assigned_user_id || '')
    
    // Fetch email template
    if (jobDetails || job) {
      const jobData = jobDetails || job
      const oldEmployeeName = (jobData as any).assigned_user_first_name && (jobData as any).assigned_user_last_name
        ? `${(jobData as any).assigned_user_first_name} ${(jobData as any).assigned_user_last_name}`
        : 'our team member'
      
      // New employee will be selected by user, but we can prepare template
      // We'll update it when user selects
      let userName = 'Our team'
      try {
        const u = JSON.parse(localStorage.getItem('user') || '{}')
        if (u.first_name && u.last_name) {
          userName = `${u.first_name} ${u.last_name}`
        } else if (u.firstName && u.lastName) {
          userName = `${u.firstName} ${u.lastName}`
        }
      } catch {}
      
      const template = await getEmailTemplate('change_employee', {
        clientName: `${(jobData as any).first_name || ''} ${(jobData as any).last_name || ''}`.trim() || 'Customer',
        clientFirstName: (jobData as any).first_name || 'Customer',
        clientLastName: (jobData as any).last_name || '',
        employeeName: oldEmployeeName,
        employeeOldName: oldEmployeeName,
        employeeNewName: 'another team member', // Will be updated when user selects
        userName: userName,
        companyName: (jobData as any).company_name || ''
      })
      
      setAssigneeTemplate(template)
    }
    
    setShowAssigneeModal(true)
    if (users.length === 0) fetchUsers()
  }

  const handleConfirmAssignee = async ({ notify, message, subject }: { notify: boolean, message: string, subject: string }) => {
    const jobId = await ensureRealJobId()
    if (!jobId || pendingAssignee === '') return
    try {
      const token = localStorage.getItem('token')
      let finalMessage = message
      if (notify && (!finalMessage || !finalMessage.trim())) {
        const selectedUser = users.find(u => u.id === pendingAssignee)
        const oldPerson = `${(jobDetails || job)?.assigned_user_first_name || ''} ${(jobDetails || job)?.assigned_user_last_name || ''}`.trim() || 'our team member'
        const newPerson = selectedUser ? `${selectedUser.first_name} ${selectedUser.last_name}` : 'another team member'
        let userName = 'Our team'
        try {
          const u = JSON.parse(localStorage.getItem('user') || '{}')
          if (u.firstName && u.lastName) userName = `${u.firstName} ${u.lastName}`
        } catch {}
        finalMessage = `Dear ${(jobDetails || job)?.first_name || 'customer'},\n\nI wanted to inform you that your appointment will be handled by a different team member.\n\nPreviously: ${oldPerson}\nNew: ${newPerson}\n\nIf you have any questions, feel free to reply to this email.\n\nKind regards,\n${userName}`
      }
      const response = await fetch(apiUrl(`/jobs/${jobId}/assignee`), {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigned_user_id: pendingAssignee,
          notifyCustomer: notify,
          notification_message: notify ? finalMessage : undefined,
          notification_subject: notify ? (subject || `Appointment contact updated`) : undefined
        })
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.details || err.error || 'Failed to update assignee')
      }
      const selectedUser = users.find(u => u.id === pendingAssignee)
      if (jobDetails) {
        setJobDetails({
          ...jobDetails,
          assigned_user_id: pendingAssignee,
          assigned_user_first_name: selectedUser?.first_name || jobDetails.assigned_user_first_name,
          assigned_user_last_name: selectedUser?.last_name || jobDetails.assigned_user_last_name
        })
      }
      fetchJobLogs(jobId)
      setShowAssigneeModal(false)
      if (onJobUpdated) onJobUpdated()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      alert('Failed to update assignee: ' + msg)
    }
  }

  // Fetch job details for real jobs
  const fetchJobDetails = async (jobData: any) => {
    if (!jobData?.client_id || !jobData?.id || typeof jobData.id !== 'number') {
      // If we don't have valid client_id or id, keep existing data
      return
    }

    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      
      // Fetch the full job details with services
      const response = await fetch(apiUrl(`/clients/${jobData.client_id}/jobs`), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (response.ok && data.jobs) {
        // Find the specific job with its services
        const fullJob = data.jobs.find((j: any) => j.id === jobData.id)
        if (fullJob) {
          setJobDetails(fullJob)
          // Fetch logs for this job
          fetchJobLogs(fullJob.id)
        }
        // If job not found, keep existing data
      }
      // If fetch fails, keep existing data
    } catch (error) {
      // If there's an error, keep existing data
      console.error('Network error: Failed to fetch job details, using existing data', error)
    } finally {
      setLoading(false)
    }
  }

  // Initialize job details when modal opens
  useEffect(() => {
    if (isOpen && job) {
      // Always initialize with the job prop first, so we have data to display
      const initialJobData = {
        ...job,
        services: job.services || [],
        assigned_user_first_name: job.assigned_user_first_name || '',
        assigned_user_last_name: job.assigned_user_last_name || ''
      }
      setJobDetails(initialJobData)
      
      // Check if this is a projected job (from subscriptions)
      const isProjectedJob = job.is_projected || (typeof job.id === 'string' && job.id.startsWith('subscription-'))
      
      if (isProjectedJob && job.recurring_job_id) {
        // For projected jobs, fetch subscription services and assigned user
        fetchProjectedJobDetails(initialJobData)
      } else if (job.client_id && typeof job.id === 'number') {
        // For real jobs, try to fetch full details with services
        fetchJobDetails(initialJobData)
      } else if (typeof job.id === 'number') {
        // If we have a job ID but no client_id, still try to fetch logs
        fetchJobLogs(job.id)
        setLoading(false)
      } else {
        // If we can't fetch, we already have the data set above
        setLoading(false)
      }
    } else if (!isOpen) {
      // Reset when closed
      setJobDetails(null)
      setJobLogs([])
      setLoading(false)
      setLogsLoading(false)
    }
  }, [isOpen, job])

  const formatDate = (dateString: string) => {
    if (!dateString) return 'No date'
    const date = new Date(dateString + 'T00:00:00')
    return date.toLocaleDateString('en-US', { 
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatTime = (timeString: string) => {
    if (!timeString) return null
    // Remove seconds if present (e.g., "18:00:00" -> "18:00")
    return timeString.substring(0, 5)
  }

  const formatTimeRange = (fromTime: string, toTime: string) => {
    if (!fromTime && !toTime) return null
    if (!fromTime) return formatTime(toTime)
    if (!toTime) return formatTime(fromTime)
    return `${formatTime(fromTime)} - ${formatTime(toTime)}`
  }

  const formatAddress = (job: any) => {
    const parts = []
    if (job.personal_address) parts.push(job.personal_address)
    if (job.personal_zip_code) parts.push(job.personal_zip_code)
    if (job.personal_city) parts.push(job.personal_city)
    return parts.join(', ') || 'No address'
  }

  const formatDuration = (minutes: number) => {
    if (!minutes) return '0m'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
    }
    return `${mins}m`
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'DKK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price || 0)
  }

  const formatLogDateTime = (dateString: string) => {
    const date = new Date(dateString)
    const time = date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
    const dateFormatted = date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
    return `${time} - ${dateFormatted}`
  }

  const getUserDisplayName = (log: JobLog) => {
    if (log.first_name && log.last_name) {
      return `${log.first_name} ${log.last_name}`
    }
    return 'System'
  }

  const handleDateChange = async (newDate: string) => {
    const currentDate = (jobDetails || job)?.scheduled_date
    setPendingNewDate(newDate || currentDate || '')
    
    // Fetch email template
    if (jobDetails || job) {
      const jobData = jobDetails || job
      const oldDate = new Date((jobData as any).scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
      const newDateFormatted = new Date((newDate || currentDate || '') + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
      
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
        clientName: `${(jobData as any).first_name || ''} ${(jobData as any).last_name || ''}`.trim() || 'Customer',
        clientFirstName: (jobData as any).first_name || 'Customer',
        clientLastName: (jobData as any).last_name || '',
        jobDate: oldDate,
        jobOldDate: oldDate,
        jobNewDate: newDateFormatted,
        userName: userName,
        companyName: (jobData as any).company_name || ''
      })
      
      setMoveTemplate(template)
    }
    
    setShowMoveModal(true)
  }

  const handleConfirmMove = async (opts: { notify: boolean, subject: string, message: string }) => {
    const { notify, subject, message } = opts
    // Get newDate from pendingNewDate state (set when date input changes)
    const newDate = pendingNewDate || (jobDetails || job)?.scheduled_date
    const jobId = await ensureRealJobId()
    if (!newDate || !jobId) return

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/jobs/${jobId}/move`), {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          new_date: newDate,
          notify_customer: notify,
          notification_message: notify ? message : null,
          notification_subject: notify ? subject : null
        })
      })

      if (response.ok) {
        // Update local state
        if (jobDetails) {
          setJobDetails({ ...jobDetails, scheduled_date: newDate })
        }
        // Refresh logs to show the move entry
        fetchJobLogs(jobId)
        setShowMoveModal(false)
        setPendingNewDate(null)
        // Notify parent to refresh jobs list
        if (onJobUpdated) {
          onJobUpdated()
        }
        
        if (notify) {
          // TODO: Send email when email functionality is implemented
          console.log('Email notification would be sent:', message)
        }
      } else {
        let errorMessage = 'Unknown error'
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorData.details || errorMessage
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`
        }
        console.error('Failed to move job:', errorMessage)
        alert('Failed to move job: ' + errorMessage)
      }
    } catch (error: unknown) {
      console.error('Error moving job:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Error details:', {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      })
      alert('Network error: Failed to move job - ' + (errorMessage || 'Check console for details'))
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />
      
      {/* Slideout */}
      <div className="fixed right-0 top-0 h-full w-[484px] bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="bg-gray-50 border-b border-gray-200 p-4">
          {isProjectedJob && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <strong>Subscription preview:</strong> This job is generated from a subscription and hasn’t been created yet. If you edit it (move/complete/cancel), Vevago will create a real job for this occurrence and keep it linked to the subscription.
            </div>
          )}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0 pr-2">
              {/* Client Name - Clickable */}
              <div className="mb-1">
                <button 
                  onClick={() => {
                    const clientId = (jobDetails || job)?.client_id
                    if (clientId) {
                      router.push(`/clients/${clientId}`)
                    }
                  }}
                  className="text-xl font-bold text-gray-900 truncate hover:text-blue-600 transition-colors cursor-pointer"
                >
                  {(jobDetails || job)?.first_name || ''} {(jobDetails || job)?.last_name || ''}
                </button>
              </div>
              {/* Address */}
              <div className="text-sm text-gray-600 truncate">
                {formatAddress(jobDetails || job)}
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              {/* Completion Toggle */}
              {currentJob && (
                <button
                  type="button"
                  onClick={toggleCompletion}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors shadow-sm ${
                    isCompleted
                      ? 'bg-green-50 border-green-300 text-green-600 hover:bg-green-100'
                      : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                  }`}
                  title={isCompleted ? 'Mark as not completed' : 'Mark job as completed'}
                >
                  <CheckCircleIcon className="w-4 h-4" />
                </button>
              )}
            
            {/* Close Button */}
            <button
              onClick={onClose}
              className="w-8 h-8 bg-white rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors shadow-sm border"
            >
              <XMarkIcon className="w-4 h-4 text-gray-600" />
            </button>
            </div>
          </div>

          {/* Date, Time, and Employee */}
          <div className="flex items-center space-x-4 text-sm">
            <button
              onClick={() => {
                const currentDate = (jobDetails || job)?.scheduled_date
                handleDateChange(currentDate || '')
              }}
              className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 transition-colors cursor-pointer"
            >
              <CalendarIcon className="w-4 h-4" />
              <span className="font-medium">
                {((jobDetails || job)?.scheduled_date ? formatDate((jobDetails || job)?.scheduled_date) : '--/--/----')}
              </span>
            </button>
            <span className="text-gray-300">|</span>
            <button onClick={openTimeModal} className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 transition-colors cursor-pointer">
              <ClockIcon className="w-4 h-4" />
              <span className="font-medium">
                {formatTimeRange((jobDetails || job)?.scheduled_time_from, (jobDetails || job)?.scheduled_time_to) || '--:--'}
              </span>
            </button>
            <span className="text-gray-300">|</span>
            <button onClick={openAssigneeModal} className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 transition-colors cursor-pointer">
              <UserIcon className="w-4 h-4" />
              <span className="font-medium">
                {((jobDetails || job)?.assigned_user_first_name && (jobDetails || job)?.assigned_user_last_name)
                  ? `${(jobDetails || job).assigned_user_first_name} ${(jobDetails || job).assigned_user_last_name}`
                  : '--'}
              </span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : jobDetails || job ? (
            <>
              {/* Job Services */}
              {((jobDetails || job)?.services && (jobDetails || job).services.length > 0) ? (
                <div className="space-y-2">
                  {(jobDetails || job).services.map((service: any, index: number) => (
                    <div key={service.service_id || service.id || index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="text-sm text-gray-900 font-medium">
                        {service.title || service.service_title || 'Service'}
                      </div>
                      <div className="flex items-center space-x-3 text-xs text-gray-600">
                        <span>{formatPrice(service.custom_price || service.price || 0)}</span>
                        <span className="text-gray-300">•</span>
                        <span>{formatDuration(service.custom_duration_minutes || service.duration_minutes || 0)}</span>
                      </div>
                    </div>
                  ))}
                  
                  {/* Total */}
                  <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-200">
                    <div className="flex items-center space-x-2 text-sm font-semibold text-gray-900">
                      <span>{formatDuration((jobDetails || job)?.total_duration || 0)}</span>
                      <span className="text-gray-300">•</span>
                      <span>{formatPrice((jobDetails || job)?.total_price || 0)}</span>
                    </div>
                    {currentJob && (
                      <button
                        type="button"
                        onClick={toggleCompletion}
                        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors ${
                          isCompleted
                            ? 'bg-green-50 border-green-300 text-green-600 hover:bg-green-100'
                            : 'bg-white border-gray-200 text-gray-300 hover:bg-gray-100 hover:text-gray-500'
                        }`}
                        title={isCompleted ? 'Mark as not completed' : 'Mark job as completed'}
                      >
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ) : ((jobDetails || job)?.service_count > 0 || (jobDetails || job)?.total_duration || (jobDetails || job)?.total_price) ? (
                // If we have totals but no services array, show summary
                <div className="space-y-2">
                  <div className="text-sm text-gray-600 py-2">
                    {(jobDetails || job)?.service_count || 0} service{((jobDetails || job)?.service_count || 0) !== 1 ? 's' : ''}
                  </div>
                  
                  {/* Total */}
                  <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-200">
                    <div className="flex items-center space-x-2 text-sm font-semibold text-gray-900">
                      <span>{formatDuration((jobDetails || job)?.total_duration || 0)}</span>
                      <span className="text-gray-300">•</span>
                      <span>{formatPrice((jobDetails || job)?.total_price || 0)}</span>
                    </div>
                    {currentJob && (
                      <button
                        type="button"
                        onClick={toggleCompletion}
                        className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors ${
                          isCompleted
                            ? 'bg-green-50 border-green-300 text-green-600 hover:bg-green-100'
                            : 'bg-white border-gray-200 text-gray-300 hover:bg-gray-100 hover:text-gray-500'
                        }`}
                        title={isCompleted ? 'Mark as not completed' : 'Mark job as completed'}
                      >
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-400 italic py-2">
                  No services assigned
                </div>
              )}

              {/* Job Log */}
              <div className="pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Activity Log</h3>
                {logsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  </div>
                ) : jobLogs.length > 0 ? (
                  <div className="relative">
                    {/* Vertical Timeline Line - spans from first circle to last circle */}
                    {jobLogs.length > 1 && (
                      <div 
                        className="absolute left-2.5 w-0.5 bg-gray-300"
                        style={{ 
                          top: '0.5rem',
                          bottom: '0.5rem'
                        }}
                      />
                    )}
                    
                    {/* Log Entries */}
                    <div className="space-y-4 pl-10">
                      {jobLogs.map((log, index) => {
                        const isNote = log.action === 'note' || log.note_content
                        const isNotification = log.notification_message || log.notification_email
                        
                        return (
                          <div key={log.id} className="relative">
                            {/* Timeline Circle - different colors for notes vs other actions */}
                            <div 
                              className={`absolute w-3 h-3 rounded-full border-2 border-white shadow-sm z-10 ${
                                isNote ? 'bg-yellow-500' : isNotification ? 'bg-green-500' : 'bg-blue-600'
                              }`}
                              style={{ 
                                left: '-2.25rem',
                                top: '0.375rem'
                              }}
                            />
                            
                            {/* Log Content */}
                            <div className={`text-sm ${isNote ? 'bg-yellow-50 border border-yellow-200 rounded-lg p-3' : ''}`}>
                              <div className="text-gray-500 font-mono text-xs mb-0.5 flex items-center gap-2">
                                {formatLogDateTime(log.created_at)} | {getUserDisplayName(log)}
                              </div>
                              {/* Description - only show if not a note (notes show content directly) */}
                              {!isNote && (
                                <div className="text-gray-900">
                                  {log.description}
                                </div>
                              )}
                              
                              {/* Note Content - displayed for notes */}
                              {log.note_content && (
                                <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                  {log.note_content}
                                </div>
                              )}
                              
                              {/* Notification Email & Subject & Message */}
                              {(log.notification_message || log.notification_subject || log.notification_email) && (
                                <div className="mt-2 p-3 bg-white border border-gray-200 rounded-lg shadow-sm space-y-1">
                                  {log.notification_email && (
                                    <div className="text-xs text-gray-600">
                                      <span className="font-medium">Email:</span> {log.notification_email}
                                    </div>
                                  )}
                                  {log.notification_subject && (
                                    <div className="text-sm text-gray-900">
                                      <span className="font-medium">Subject:</span> {log.notification_subject}
                                    </div>
                                  )}
                                  {log.notification_message && (
                                    <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed pt-1">
                                      {log.notification_message}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    
                    {/* Add Note Input */}
                    <div className="mt-6 pt-4 border-t border-gray-200">
                      {typeof currentJob?.id === 'number' ? (
                        <NoteInput
                          jobId={currentJob.id}
                          onNoteAdded={() => {
                            fetchJobLogs(currentJob.id)
                          }}
                        />
                      ) : (
                        <div className="text-xs text-gray-500">
                          Notes are only available for real jobs (not subscription previews).
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-xs text-gray-400 italic">
                      No activity log available
                    </div>
                    {/* Add Note Input - show even when no logs */}
                    <div className="pt-4 border-t border-gray-200">
                      {typeof currentJob?.id === 'number' ? (
                        <NoteInput
                          jobId={currentJob.id}
                          onNoteAdded={() => {
                            fetchJobLogs(currentJob.id)
                          }}
                        />
                      ) : (
                        <div className="text-xs text-gray-500">
                          Notes are only available for real jobs (not subscription previews).
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Dangerous actions */}
              {currentJob && (
                <div className="pt-6 mt-2 border-t border-red-100">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!currentJob) return

                      const date = currentJob.scheduled_date
                        ? new Date(currentJob.scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })
                        : ''

                      let userName = 'Our team'
                      try {
                        const u = JSON.parse(localStorage.getItem('user') || '{}')
                        if (u.first_name && u.last_name) {
                          userName = `${u.first_name} ${u.last_name}`
                        } else if (u.firstName && u.lastName) {
                          userName = `${u.firstName} ${u.lastName}`
                        }
                      } catch {}

                      const template = await getEmailTemplate('cancel_job', {
                        clientName: `${currentJob.first_name || ''} ${currentJob.last_name || ''}`.trim() || 'Customer',
                        clientFirstName: currentJob.first_name || 'Customer',
                        clientLastName: currentJob.last_name || '',
                        jobDate: date,
                        userName,
                        companyName: currentJob.company_name || '',
                        jobAddress: formatAddress(currentJob),
                        jobCity: currentJob.personal_city || '',
                        jobServices: (currentJob.services || [])
                          .map((s: any) => s.title || s.service_title || '')
                          .filter(Boolean)
                          .join(', ')
                      })

                      setCancelTemplate(template)
                      setShowDeleteModal(true)
                    }}
                    className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline underline-offset-2"
                  >
                    Cancel this job
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-gray-500 py-8">
              Failed to load job details
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-[11px] text-gray-600 flex items-center justify-between">
          <span>
            <span className="font-medium text-gray-700">ID:</span>{' '}
            {typeof currentJob?.id === 'number' ? currentJob.id : '--'}
          </span>
          {isProjectedJob && <span className="text-amber-700">Subscription preview</span>}
        </div>
      </div>

      {/* Move Job Confirmation Modal (Unified) */}
      <ConfirmModal
        isOpen={showMoveModal && !!(jobDetails || job)}
        onClose={() => {
          setShowMoveModal(false)
          setPendingNewDate(null)
        }}
        onConfirm={handleConfirmMove}
        title="Move Job"
        description="Select a new date for this job"
        confirmLabel="Save"
        defaultSubject={moveTemplate.subject || (() => {
          if (!(jobDetails || job)) return 'Appointment Date Changed'
          const oldDate = new Date(((jobDetails || job) as any).scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
          const newDate = new Date((pendingNewDate || ((jobDetails || job) as any).scheduled_date) + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
          return `Appointment date updated (${oldDate} → ${newDate})`
        })()}
        defaultMessage={moveTemplate.message || (() => {
          if (!(jobDetails || job)) return ''
          const oldDate = new Date(((jobDetails || job) as any).scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
          const newDate = new Date((pendingNewDate || ((jobDetails || job) as any).scheduled_date) + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
          let userName = 'Our team'
          try {
            const u = JSON.parse(localStorage.getItem('user') || '{}')
            if (u.firstName && u.lastName) userName = `${u.firstName} ${u.lastName}`
          } catch {}
          const name = `${((jobDetails || job) as any).first_name || ''} ${((jobDetails || job) as any).last_name || ''}`.trim() || 'customer'
          return `Dear ${name},

I wanted to let you know that your appointment has been rescheduled.

Previously: ${oldDate}
New date: ${newDate}

If the new date does not work for you, please let us know and we will find an alternative.

Kind regards,
${userName}`
        })()}
      >
        {(jobDetails || job) && (
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4">
              {/* Old date (read-only) */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Old date</label>
                <input
                  type="date"
                  value={((jobDetails || job) as any).scheduled_date || ''}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
                />
              </div>

              {/* Arrow */}
              <div className="pb-2 flex items-center justify-center text-gray-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>

              {/* New date (editable) */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">New date</label>
                <input
                  type="date"
                  value={pendingNewDate || ((jobDetails || job) as any).scheduled_date || ''}
                  onChange={async (e) => {
                    setPendingNewDate(e.target.value)
                    // Update template with new date
                    if ((jobDetails || job) && e.target.value) {
                      const jobData = jobDetails || job
                      const oldDate = new Date((jobData as any).scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                      const newDate = new Date(e.target.value + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                      
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
                        clientName: `${(jobData as any).first_name || ''} ${(jobData as any).last_name || ''}`.trim() || 'Customer',
                        clientFirstName: (jobData as any).first_name || 'Customer',
                        clientLastName: (jobData as any).last_name || '',
                        jobDate: oldDate,
                        jobOldDate: oldDate,
                        jobNewDate: newDate,
                        userName: userName,
                        companyName: (jobData as any).company_name || ''
                      })
                      
                      setMoveTemplate(template)
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}
      </ConfirmModal>

      {/* Cancel Job Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        title="Cancel Job"
        description="You are about to cancel this job:"
        confirmLabel={isDeleting ? 'Cancelling...' : 'Cancel job'}
        cancelLabel="Cancel"
        enableNotification={true}
        isSubmitting={isDeleting}
        defaultMessage={cancelTemplate.message || (() => {
          if (!currentJob) return ''
          const name = `${currentJob.first_name || ''} ${currentJob.last_name || ''}`.trim() || 'customer'
          const date = currentJob.scheduled_date
            ? new Date(currentJob.scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              })
            : ''
          return `Dear ${name},

We wanted to let you know that your appointment${date ? ` on ${date}` : ''} has been cancelled.

If you have any questions or would like to reschedule, please contact us.

Best regards,
Our team`
        })()}
        defaultSubject={cancelTemplate.subject || (() => {
          if (!currentJob) return 'Appointment cancelled'
          const date = currentJob.scheduled_date
            ? new Date(currentJob.scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              })
            : ''
          return date ? `Your appointment on ${date} has been cancelled` : 'Your appointment has been cancelled'
        })()}
      >
        <div className="space-y-2">
          <p className="text-sm text-gray-700">
            <span className="font-medium">You are about to remove this job:</span>
          </p>
          <p className="text-xs text-gray-500">
            {currentJob && (
              <>
                {currentJob.first_name} {currentJob.last_name} •{' '}
                {currentJob.scheduled_date
                  ? new Date(currentJob.scheduled_date + 'T00:00:00').toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })
                  : 'No date'}
              </>
            )}
          </p>
        </div>
      </ConfirmModal>

      {/* Time Change Modal */}
      <ConfirmModal
        isOpen={showTimeModal}
        onClose={() => {
          setShowTimeModal(false)
          setTimeTemplate({ subject: '', message: '' })
        }}
        onConfirm={handleConfirmTime}
        title="Change Time"
        description="Update the scheduled time for this job"
        confirmLabel="Save"
        defaultSubject={timeTemplate.subject || (() => {
          const oldRange = formatTimeRange((jobDetails || job)?.scheduled_time_from, (jobDetails || job)?.scheduled_time_to) || 'unspecified'
          const newRange = ((pendingTimeFrom || pendingTimeTo) ? (pendingTimeFrom && pendingTimeTo ? `${pendingTimeFrom} - ${pendingTimeTo}` : (pendingTimeFrom || pendingTimeTo)) : 'unspecified')
          return `Appointment time updated (${oldRange} → ${newRange})`
        })()}
        defaultMessage={timeTemplate.message || (() => {
          const oldRange = formatTimeRange((jobDetails || job)?.scheduled_time_from, (jobDetails || job)?.scheduled_time_to) || 'unspecified'
          const newRange = ((pendingTimeFrom || pendingTimeTo) ? (pendingTimeFrom && pendingTimeTo ? `${pendingTimeFrom} - ${pendingTimeTo}` : (pendingTimeFrom || pendingTimeTo)) : 'unspecified')
          let userName = 'Our team'
          try {
            const u = JSON.parse(localStorage.getItem('user') || '{}')
            if (u.firstName && u.lastName) userName = `${u.firstName} ${u.lastName}`
          } catch {}
          return `Dear ${(jobDetails || job)?.first_name || 'customer'},

I wanted to let you know that the time of your appointment has been updated.

Previously: ${oldRange}
New time: ${newRange}

If the new time does not suit you, please reply and we will arrange another time.

Kind regards,
${userName}`
        })()}
      >
        <div className="space-y-3">
          <div className="flex items-center space-x-1 bg-gray-100 rounded p-0.5">
            <button
              type="button"
              onClick={async () => { 
                setIsTimeRangeEdit(false)
                setPendingTimeTo('')
                // Update template when switching to single time
                if (jobDetails || job) {
                  await updateTimeTemplate(pendingTimeFrom, '', false)
                }
              }}
              className={`flex-1 py-1.5 px-3 text-xs font-medium rounded transition-colors duration-150 ease-out ${!isTimeRangeEdit ? 'bg-white text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Single Time
            </button>
            <button
              type="button"
              onClick={async () => { 
                setIsTimeRangeEdit(true)
                if (!pendingTimeTo && pendingTimeFrom) setPendingTimeTo(pendingTimeFrom)
                // Update template when switching to time range
                if (jobDetails || job) {
                  await updateTimeTemplate(pendingTimeFrom, pendingTimeTo || pendingTimeFrom, true)
                }
              }}
              className={`flex-1 py-1.5 px-3 text-xs font-medium rounded transition-colors duration-150 ease-out ${isTimeRangeEdit ? 'bg-white text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Time Range
            </button>
          </div>

          {!isTimeRangeEdit ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Time</label>
              <input
                type="time"
                value={pendingTimeFrom}
                onChange={async (e) => {
                  setPendingTimeFrom(e.target.value)
                  // Update template with new time
                  if (jobDetails || job) {
                    await updateTimeTemplate(e.target.value, pendingTimeTo, false)
                  }
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Between</label>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="time"
                  value={pendingTimeFrom}
                  onChange={async (e) => {
                    setPendingTimeFrom(e.target.value)
                    // Update template with new time
                    if (jobDetails || job) {
                      await updateTimeTemplate(e.target.value, pendingTimeTo, true)
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
                <input
                  type="time"
                  value={pendingTimeTo}
                  onChange={async (e) => {
                    setPendingTimeTo(e.target.value)
                    // Update template with new time
                    if (jobDetails || job) {
                      await updateTimeTemplate(pendingTimeFrom, e.target.value, true)
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          )}
        </div>
      </ConfirmModal>

      {/* Assignee Change Modal */}
      <ConfirmModal
        isOpen={showAssigneeModal}
        onClose={() => {
          setShowAssigneeModal(false)
          setAssigneeTemplate({ subject: '', message: '' })
        }}
        onConfirm={handleConfirmAssignee}
        title="Change Assigned User"
        description="Select another user to assign this job"
        confirmLabel="Save"
        defaultSubject={assigneeTemplate.subject || (() => {
          const oldPerson = `${(jobDetails || job)?.assigned_user_first_name || ''} ${(jobDetails || job)?.assigned_user_last_name || ''}`.trim() || 'our team member'
          const sel = users.find(u => u.id === pendingAssignee)
          const newPerson = sel ? `${sel.first_name} ${sel.last_name}` : 'another team member'
          return `Appointment will be handled by ${newPerson} (was ${oldPerson})`
        })()}
        defaultMessage={assigneeTemplate.message || (() => {
          let currentUserName = 'Our team'
          try {
            const u = JSON.parse(localStorage.getItem('user') || '{}')
            if (u.firstName && u.lastName) currentUserName = `${u.firstName} ${u.lastName}`
          } catch {}
          const oldPerson = `${(jobDetails || job)?.assigned_user_first_name || ''} ${(jobDetails || job)?.assigned_user_last_name || ''}`.trim() || 'our team member'
          const sel = users.find(u => u.id === pendingAssignee)
          const newPerson = sel ? `${sel.first_name} ${sel.last_name}` : 'another team member'
          return `Dear ${(jobDetails || job)?.first_name || 'customer'},

I wanted to inform you that your appointment will be handled by a different team member.

Previously: ${oldPerson}
New: ${newPerson}

If you have any questions, feel free to reply to this email.

Kind regards,
${currentUserName}`
        })()}
      >
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">User</label>
          <select
            value={pendingAssignee}
            onChange={async (e) => {
              const newAssigneeId = e.target.value ? parseInt(e.target.value) : ''
              setPendingAssignee(newAssigneeId)
              
              // Update template with new employee name
              if (newAssigneeId && (jobDetails || job)) {
                const jobData = jobDetails || job
                const oldEmployeeName = (jobData as any).assigned_user_first_name && (jobData as any).assigned_user_last_name
                  ? `${(jobData as any).assigned_user_first_name} ${(jobData as any).assigned_user_last_name}`
                  : 'our team member'
                const sel = users.find(u => u.id === newAssigneeId)
                const newEmployeeName = sel ? `${sel.first_name} ${sel.last_name}` : 'another team member'
                
                let userName = 'Our team'
                try {
                  const u = JSON.parse(localStorage.getItem('user') || '{}')
                  if (u.first_name && u.last_name) {
                    userName = `${u.first_name} ${u.last_name}`
                  } else if (u.firstName && u.lastName) {
                    userName = `${u.firstName} ${u.lastName}`
                  }
                } catch {}
                
                const template = await getEmailTemplate('change_employee', {
                  clientName: `${(jobData as any).first_name || ''} ${(jobData as any).last_name || ''}`.trim() || 'Customer',
                  clientFirstName: (jobData as any).first_name || 'Customer',
                  clientLastName: (jobData as any).last_name || '',
                  employeeName: newEmployeeName,
                  employeeOldName: oldEmployeeName,
                  employeeNewName: newEmployeeName,
                  userName: userName,
                  companyName: (jobData as any).company_name || ''
                })
                
                setAssigneeTemplate(template)
              }
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a user...</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
            ))}
          </select>
        </div>
      </ConfirmModal>
    </>
  )
}
