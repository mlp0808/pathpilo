'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { XMarkIcon, UserIcon, CalendarIcon, ClockIcon, CheckIcon, EllipsisVerticalIcon, EnvelopeIcon, PhoneIcon, MapPinIcon, DocumentTextIcon, ChevronDownIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import ConfirmModal from './ConfirmModal'
import { getEmailTemplate } from '../utils/emailTemplates'

interface NoteInputProps {
  jobId: number
  onNoteAdded: () => void
  onCancel?: () => void
}

function NoteInput({ jobId, onNoteAdded, onCancel }: NoteInputProps) {
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
      <textarea
        value={noteContent}
        onChange={(e) => setNoteContent(e.target.value)}
        placeholder="Write your note here..."
        rows={4}
        className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl bg-white text-primary-500 placeholder-gray-400 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 resize-none"
      />
      <div className="flex justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-11 h-11 rounded-full bg-gray-200 text-primary-500 flex items-center justify-center font-bold hover:bg-gray-300 transition-colors"
          >
            ✕
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting || !noteContent.trim()}
          className="w-11 h-11 rounded-full bg-accent-500 text-white flex items-center justify-center font-bold hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          ✓
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
  onConfirm: (opts: { newDate: string, notify: boolean, subject?: string, message?: string, email?: string }) => void
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
  const [email, setEmail] = useState(customerEmail || '')

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
      setEmail(customerEmail || '')
    }
  }, [isOpen, oldDate, newDate, customerName, customerEmail])

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
                </div>
              </label>

              {notifyCustomer && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Send to</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="client@example.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                  />
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
              onClick={() => onConfirm({ newDate: selectedDate || oldDate, notify: notifyCustomer, subject: notifyCustomer ? subject : undefined, message: notifyCustomer ? message : undefined, email: notifyCustomer ? email : undefined })}
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
  const params = useParams()
  const companySlugFromRoute = (params as any)?.company as string | undefined
  const [jobDetails, setJobDetails] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
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
  const [showOptionsMenu, setShowOptionsMenu] = useState(false)
  const [expandedLogIds, setExpandedLogIds] = useState<Set<number>>(new Set())
  const [slideEntered, setSlideEntered] = useState(false)
  const [clientContact, setClientContact] = useState<{ email?: string; phone?: string } | null>(null)
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [updatingServiceId, setUpdatingServiceId] = useState<number | null>(null)
  const [invoiceSummary, setInvoiceSummary] = useState<{ id: number; status: string; invoice_number?: string | null } | null>(null)

  const updateServiceStatus = async (jobId: number, serviceId: number, status: 'scheduled' | 'completed' | 'cancelled') => {
    setUpdatingServiceId(serviceId)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/jobs/${jobId}/services/${serviceId}/status`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to update')
      setJobDetails((prev: any) => {
        if (!prev || prev.id !== jobId) return prev
        const nextStatus = data.job?.status ?? prev.status
        const nextServices = (prev.services || []).map((s: any) =>
          s.id === serviceId
            ? { ...s, status: data.service?.status ?? status, completed_at: data.service?.completed_at ?? (status === 'completed' ? new Date().toISOString() : null), is_completed: (data.service?.status ?? status) === 'completed' }
            : s
        )
        return { ...prev, status: nextStatus, services: nextServices }
      })
      // Refresh logs so the change appears in the activity log
      fetchJobLogs(jobId)
      onJobUpdated?.()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update service status')
    } finally {
      setUpdatingServiceId(null)
    }
  }

  // Slide-in animation: start off-screen, then translate in
  useEffect(() => {
    if (isOpen) {
      setSlideEntered(false)
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setSlideEntered(true))
      })
      return () => cancelAnimationFrame(id)
    }
  }, [isOpen])

  // Fetch client email/phone when job has client_id but no contact on job
  useEffect(() => {
    const cid = (jobDetails || job)?.client_id
    const hasEmail = (jobDetails || job)?.client_email || (jobDetails || job)?.email || (jobDetails || job)?.client?.email
    const hasPhone = (jobDetails || job)?.client_phone || (jobDetails || job)?.phone || (jobDetails || job)?.client?.phone
    if (!cid || (hasEmail && hasPhone)) {
      setClientContact(null)
      return
    }
    let cancelled = false
    const run = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(apiUrl(`/clients/${cid}`), { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        if (cancelled || !res.ok) return
        const c = data.client || data
        setClientContact({ email: c.email || undefined, phone: c.phone || undefined })
      } catch {
        if (!cancelled) setClientContact(null)
      }
    }
    run()
    return () => { cancelled = true }
  }, [(jobDetails || job)?.client_id, (jobDetails || job)?.client_email, (jobDetails || job)?.client_phone, (jobDetails || job)?.email, (jobDetails || job)?.phone])

  const handleCancelJob = () => {
    setShowCancelModal(true)
  }

  const confirmCancelJob = async ({ notify, message, subject }: { notify: boolean, message: string, subject: string }) => {
    if (!currentJob?.id || typeof currentJob.id !== 'number') return

    try {
      setIsDeleting(true)
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/jobs/${currentJob.id}/status`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status: 'cancelled',
          notify_customer: notify,
          notification_subject: notify ? subject : undefined,
          notification_message: notify ? message : undefined
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to cancel job')
      }

      onJobUpdated?.()
      onClose()
    } catch (error) {
      console.error('Error cancelling job:', error)
      alert('Failed to cancel job. Please try again.')
    } finally {
      setIsDeleting(false)
      setShowCancelModal(false)
    }
  }

  const handleDeleteJob = async () => {
    if (!currentJob?.id || typeof currentJob.id !== 'number') return

    const confirmed = confirm('Are you sure you want to permanently delete this job? This action cannot be undone and will remove all job data, notes, and logs.')
    if (!confirmed) return

    try {
      setIsDeleting(true)
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/jobs/${currentJob.id}`), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete job')
      }

      onJobUpdated?.()
      onClose()
    } catch (error) {
      console.error('Error deleting job:', error)
      alert('Failed to delete job. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  const currentJob = jobDetails || job
  const isCompleted = currentJob?.status === 'completed' || currentJob?.status === 'sub_completed'
  const isSubCompleted = currentJob?.status === 'sub_completed'
  const isProjectedJob = !!(currentJob?.is_projected || (typeof currentJob?.id === 'string' && currentJob.id.startsWith('subscription-')))
  const invoiceIdOnJob = typeof currentJob?.invoice_id === 'number' ? (currentJob.invoice_id as number) : null
  const isLocked = !!invoiceIdOnJob

  // Fetch invoice summary when job is linked to an invoice
  useEffect(() => {
    if (!invoiceIdOnJob) {
      setInvoiceSummary(null)
      return
    }
    let cancelled = false
    const run = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(apiUrl(`/invoices/${invoiceIdOnJob}`), {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || cancelled) return
        const inv = data.invoice || data
        if (!inv) return
        setInvoiceSummary({
          id: inv.id,
          status: inv.status,
          invoice_number: inv.invoice_number ?? null,
        })
      } catch {
        if (!cancelled) setInvoiceSummary(null)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [invoiceIdOnJob])

  // Derived job status for display (scheduled, completed, cancelled, sub completed, invoice draft, invoiced)
  const computeStatusMeta = () => {
    if (!currentJob) return null
    const baseStatus = (currentJob.status as string) || 'scheduled'
    const hasInvoice = !!invoiceIdOnJob

    if (hasInvoice) {
      const invStatus = invoiceSummary?.status || 'draft'
      if (invStatus === 'draft') {
        return {
          key: 'invoice-draft',
          label: 'Invoice draft',
          className: 'bg-purple-100 text-purple-800 border border-purple-200',
        }
      }
      return {
        key: 'invoiced',
        label: 'Invoiced',
        className: 'bg-blue-100 text-blue-800 border border-blue-200',
      }
    }

    if (baseStatus === 'cancelled') {
      return {
        key: 'cancelled',
        label: 'Cancelled',
        className: 'bg-red-100 text-red-800 border border-red-200',
      }
    }
    if (isSubCompleted) {
      return {
        key: 'sub_completed',
        label: 'Sub completed',
        className: 'bg-amber-100 text-amber-800 border border-amber-200',
      }
    }
    if (baseStatus === 'completed') {
      return {
        key: 'completed',
        label: 'Completed',
        className: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
      }
    }

    return {
      key: 'scheduled',
      label: 'Scheduled',
      className: 'bg-gray-100 text-gray-700 border border-gray-200',
    }
  }
  const statusMeta = computeStatusMeta()

  // Close options menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showOptionsMenu && !(event.target as Element).closest('.options-menu')) {
        setShowOptionsMenu(false)
      }
    }

    if (showOptionsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showOptionsMenu])

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
    if (isLocked) {
      alert('This job is already part of an invoice and cannot be changed.')
      return
    }
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
      clientName: `${(jobData as any).name || ''}${(jobData as any).last_name ? ` ${(jobData as any).last_name}` : ''}`.trim() || 'Customer',
      clientFirstName: (jobData as any).name || 'Customer',
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

  // Fetch job details for real jobs (use GET /jobs/:id to get full job with service statuses)
  const fetchJobDetails = async (jobData: any) => {
    if (!jobData?.id || typeof jobData.id !== 'number') return

    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/jobs/${jobData.id}`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()

      if (response.ok && data.job) {
        setJobDetails(data.job)
        fetchJobLogs(data.job.id)
      }
    } catch (error) {
      console.error('Failed to fetch job details', error)
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
      } else if (typeof job.id === 'number') {
        // For real jobs, fetch full details with service statuses from GET /jobs/:id
        fetchJobDetails(initialJobData)
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

  // Address: "88 Innovation Blvd" or "88 Innovation Blvd • 2400 København" to match design
  const formatAddress = (job: any) => {
    const addr = job.address || job.personal_address
    const zipCity = [job.zip_code || job.personal_zip_code, job.city || job.personal_city].filter(Boolean).join(' ')
    const parts: string[] = []
    if (addr) parts.push(addr)
    if (zipCity) parts.push(zipCity)
    return parts.join(' • ') || 'No address'
  }

  const formatFullDate = (dateString: string) => {
    if (!dateString) return 'No date'
    const d = new Date(dateString + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
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

  const formatLogTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
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

  const handleConfirmMove = async (opts: { notify: boolean, subject: string, message: string, email?: string }) => {
    const { notify, subject, message, email: notificationEmail } = opts
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
          notification_subject: notify ? subject : null,
          notification_email: notify && notificationEmail ? notificationEmail : null
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
      
      {/* Slideout — slides in from right */}
      <div className={`fixed right-0 top-0 h-full w-full max-w-[min(520px,65vw)] bg-page shadow-xl z-50 flex flex-col overflow-hidden transition-transform duration-300 ease-out ${slideEntered ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Content — scrollable: Header, Schedule & Location, Tasks, Activity Log */}
        <div className="flex-1 overflow-y-auto">
          {/* Header — dark #193434: client name + Person, email, phone (now scrollable) */}
          <div className="bg-primary-500 px-5 pt-5 pb-3">
          {isProjectedJob && (
            <div className="mb-3 rounded-lg border border-amber-300/60 bg-amber-500/20 px-3 py-2 text-xs text-amber-100">
              <strong>Subscription preview:</strong> This job is generated from a subscription and hasn’t been created yet. Edit will create a real job for this occurrence.
            </div>
          )}
          {/* Row 1: Person/Company (left, #BFD1C5) | Status pill + Options + Exit on the right. */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <span className="text-sm font-medium" style={{ color: '#BFD1C5' }}>
              {(jobDetails || job)?.is_company ? 'Company' : 'Person'}
            </span>
            <div className="flex items-center gap-3 flex-shrink-0">
              {statusMeta && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>
                  {statusMeta.label}
                </span>
              )}
              <div className="flex items-center gap-2">
                {/* Options — circular, outline, 3 dots #BFD1C5 */}
                <div className="relative options-menu">
                  <button
                    onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                    className="w-8 h-8 rounded-full flex items-center justify-center border-2 border-[#BFD1C5] bg-transparent hover:bg-white/10 transition-colors flex-shrink-0"
                    title="Options"
                  >
                    <EllipsisVerticalIcon className="w-5 h-5" style={{ color: '#BFD1C5' }} />
                  </button>
                  {showOptionsMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowOptionsMenu(false)} aria-hidden />
                      <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                        {!isLocked && !isProjectedJob && (
                          <>
                            <button
                              onClick={() => {
                                setShowOptionsMenu(false)
                                toggleCompletion()
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              {isCompleted ? 'Mark as scheduled' : 'Mark as completed'}
                            </button>
                            <div className="my-1 border-t border-gray-100" />
                          </>
                        )}
                        <button
                          onClick={() => {
                            setShowOptionsMenu(false)
                            if (!isLocked) handleCancelJob()
                          }}
                          disabled={isDeleting || isLocked}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                        >
                          Cancel job
                        </button>
                        <button
                          onClick={() => {
                            setShowOptionsMenu(false)
                            if (!isLocked) handleDeleteJob()
                          }}
                          disabled={isDeleting || isLocked}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Delete job
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {/* Exit — circular, outline, X #BFD1C5 */}
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center border-2 border-[#BFD1C5] bg-transparent hover:bg-white/10 transition-colors flex-shrink-0"
                  aria-label="Close"
                >
                  <XMarkIcon className="w-5 h-5" style={{ color: '#BFD1C5' }} />
                </button>
              </div>
            </div>
          </div>

          {/* Lock banner when job is on an invoice */}
          {isLocked && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
              <LockClosedIcon className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
              <div className="text-xs">
                <div className="font-semibold text-amber-800">Job is locked</div>
                <div className="text-amber-700">
                  This job is part of an invoice and cannot be changed here.
                  {invoiceSummary && (
                    <>
                      {' '}
                      View it on{' '}
                      <button
                        type="button"
                        onClick={() => {
                          const slug = companySlugFromRoute || ''
                          if (slug) {
                            router.push(`/${slug}/invoices/${invoiceSummary.id}`)
                          } else {
                            router.push(`/invoices/${invoiceSummary.id}`)
                          }
                        }}
                        className="underline font-semibold"
                      >
                        invoice {invoiceSummary.invoice_number || `#${invoiceSummary.id}`}
                      </button>
                      .
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* Client name — large, bold, white */}
          <button onClick={() => { const id = (jobDetails || job)?.client_id; if (id) router.push(`/clients/${id}`) }} className="text-2xl font-bold text-white hover:opacity-90 transition-opacity text-left block w-full">
            {[(jobDetails || job)?.first_name || (jobDetails || job)?.name, (jobDetails || job)?.last_name].filter(Boolean).join(' ') || 'Unknown'}
          </button>
          {/* Email — from job or client fetch. If empty: "add" link to client. */}
          <div className="flex items-center gap-2 mt-2">
            <EnvelopeIcon className="w-4 h-4 flex-shrink-0" style={{ color: '#BFD1C5' }} />
            {((jobDetails || job)?.client_email || (jobDetails || job)?.email || (jobDetails || job)?.client?.email || clientContact?.email) ? (
              <span className="text-sm text-white">{(jobDetails || job)?.client_email || (jobDetails || job)?.email || (jobDetails || job)?.client?.email || clientContact?.email}</span>
            ) : (
              <button type="button" onClick={() => { const id = (jobDetails || job)?.client_id; if (id) router.push(`/clients/${id}`) }} className="text-xs text-white/90 hover:text-white hover:underline">add</button>
            )}
          </div>
          {/* Phone — from job or client fetch. If empty: "add" link to client. */}
          <div className="flex items-center gap-2 mt-1">
            <PhoneIcon className="w-4 h-4 flex-shrink-0" style={{ color: '#BFD1C5' }} />
            {((jobDetails || job)?.client_phone || (jobDetails || job)?.phone || (jobDetails || job)?.client?.phone || clientContact?.phone) ? (
              <span className="text-sm text-white">{(jobDetails || job)?.client_phone || (jobDetails || job)?.phone || (jobDetails || job)?.client?.phone || clientContact?.phone}</span>
            ) : (
              <button type="button" onClick={() => { const id = (jobDetails || job)?.client_id; if (id) router.push(`/clients/${id}`) }} className="text-xs text-white/90 hover:text-white hover:underline">add</button>
            )}
          </div>
          </div>

          {/* Content sections — off-white #F6F9F7: Schedule & Location, Tasks, Activity Log */}
          <div className="px-5 pt-3 pb-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent-500 border-t-transparent"></div>
            </div>
          ) : jobDetails || job ? (
            <>
              {/* Schedule & Location */}
              <div>
                <h3 className="text-base font-semibold text-primary-500 mb-4">Schedule & Location</h3>
                <div className="space-y-3">
                  {formatAddress(jobDetails || job) !== 'No address' && (
                    <div className="flex items-start gap-2">
                      <MapPinIcon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-primary-500">{formatAddress(jobDetails || job)}</span>
                    </div>
                  )}
                  <button
                    onClick={isLocked ? undefined : openTimeModal}
                    className={`flex items-start gap-2 w-full text-left transition-opacity ${
                      isLocked ? 'cursor-default opacity-60' : 'hover:opacity-80'
                    }`}
                  >
                    <ClockIcon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-primary-500">
                      {formatTimeRange((jobDetails || job)?.scheduled_time_from, (jobDetails || job)?.scheduled_time_to) || 'Not set'}
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      if (isLocked) return
                      const d = (jobDetails || job)?.scheduled_date
                      if (d) handleDateChange(d)
                    }}
                    className={`flex items-start gap-2 w-full text-left transition-opacity ${
                      isLocked ? 'cursor-default opacity-60' : 'hover:opacity-80'
                    }`}
                  >
                    <CalendarIcon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-primary-500">
                      {(jobDetails || job)?.scheduled_date ? formatFullDate((jobDetails || job).scheduled_date) : 'No date'}
                    </span>
                  </button>
                  {/* Assigned user moved here, below date/time */}
                  <div className="flex items-start gap-2">
                    <UserIcon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <button
                      type="button"
                      onClick={() => {
                        if (isLocked) return
                        openAssigneeModal()
                      }}
                      className={`flex w-full items-center justify-between text-left transition-opacity ${
                        isLocked ? 'cursor-default opacity-60' : 'hover:opacity-80'
                      }`}
                    >
                      <span className="text-sm text-primary-500 truncate">
                        {((jobDetails || job)?.assigned_user_first_name || (jobDetails || job)?.assigned_user_last_name)
                          ? `${(jobDetails || job).assigned_user_first_name || ''} ${(jobDetails || job).assigned_user_last_name || ''}`.trim() ||
                            'Unassigned'
                          : 'Unassigned'}
                      </span>
                      {!isLocked && <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                    </button>
                  </div>
                </div>
                <div className="border-t border-gray-200 mt-4" />
              </div>

              {/* Tasks — compact rows: [check] title + duration | price | Cancel. Check = complete; Cancel = cancel row (red + cross). */}
              <div>
                {(() => {
                  const svcs = (jobDetails || job)?.services || (jobDetails || job)?.job_services || []
                  const totalTasks = svcs.length
                  const completedCount = svcs.filter((s: any) => s.status === 'completed').length
                  const totalDuration =
                    (jobDetails || job)?.total_duration ??
                    svcs.reduce((sum: number, s: any) => sum + (Number(s.custom_duration_minutes ?? s.duration_minutes) || 0), 0)
                  const totalPrice =
                    (jobDetails || job)?.total_price ?? svcs.reduce((sum: number, s: any) => sum + (Number(s.custom_price ?? s.price) || 0), 0)
                  const canEditServices = typeof currentJob?.id === 'number' && !isProjectedJob && !isLocked
                  const handleCheckClick = (s: any) => {
                    if (!canEditServices || !currentJob?.id || !s.id) return
                    const next = s.status === 'completed' ? 'scheduled' : s.status === 'cancelled' ? 'scheduled' : 'completed'
                    updateServiceStatus(currentJob.id, s.id, next)
                  }
                  const handleCancelClick = (s: any) => {
                    if (!canEditServices || !currentJob?.id || !s.id) return
                    const next = s.status === 'cancelled' ? 'scheduled' : 'cancelled'
                    updateServiceStatus(currentJob.id, s.id, next)
                  }
                  return (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-semibold text-primary-500 flex items-center gap-2">
                          <DocumentTextIcon className="w-5 h-5 text-accent-500" />
                          Tasks
                        </h3>
                        <span className="text-sm text-gray-500">{completedCount} of {totalTasks || 0} complete</span>
                      </div>
                      {svcs.length > 0 ? (
                        <div className="space-y-1">
                          {svcs.map((s: any, i: number) => {
                            const serviceStatus = (s.status || (s.is_completed ? 'completed' : 'scheduled')) as string
                            const isServiceCompleted = serviceStatus === 'completed'
                            const isServiceCancelled = serviceStatus === 'cancelled'
                            const isUpdating = updatingServiceId === s.id
                            return (
                              <div
                                key={s.service_id || s.id || i}
                                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors ${isServiceCancelled ? 'bg-red-50' : 'bg-white'}`}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleCheckClick(s)}
                                  disabled={!canEditServices || isUpdating}
                                  className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors disabled:opacity-50 ${isServiceCancelled ? 'border-red-300 bg-red-100 text-red-500' : isServiceCompleted ? 'border-accent-500 bg-accent-50 text-accent-600' : 'border-gray-300 bg-white hover:border-accent-400'}`}
                                  title={isServiceCancelled ? 'Undo cancel' : isServiceCompleted ? 'Mark not completed' : 'Mark completed'}
                                >
                                  {isServiceCancelled ? (
                                    <XMarkIcon className="w-3 h-3" strokeWidth={2.5} />
                                  ) : (
                                    <CheckIcon className={`w-3 h-3 ${isServiceCompleted ? 'text-accent-600' : 'text-gray-400'}`} />
                                  )}
                                </button>
                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                  <span className={`text-sm font-medium truncate ${isServiceCancelled ? 'text-red-700 line-through' : 'text-primary-500'}`}>
                                    {s.title || s.service_title || s.service_name || 'Task'}
                                  </span>
                                  <span className="text-xs text-gray-500 flex-shrink-0">
                                    {formatDuration(s.custom_duration_minutes ?? s.duration_minutes ?? 0)}
                                  </span>
                                </div>
                                <div className={`text-sm font-medium flex-shrink-0 ${isServiceCancelled ? 'text-red-600' : 'text-primary-500'}`}>
                                  {formatPrice(s.custom_price ?? s.price ?? 0)}
                                </div>
                                {canEditServices && (
                                  <button
                                    type="button"
                                    onClick={() => handleCancelClick(s)}
                                    disabled={isUpdating}
                                    className="flex-shrink-0 text-xs font-medium px-2 py-1 rounded text-red-600 hover:bg-red-100 disabled:opacity-50"
                                  >
                                    {isServiceCancelled ? 'Undo' : 'Cancel'}
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 py-4 text-center">No tasks assigned</p>
                      )}
                      {svcs.length > 0 && (
                        <div className="flex flex-col items-end gap-0.5 mt-2">
                          <div className="text-sm text-gray-500">Time: {formatDuration(totalDuration)}</div>
                          <div className="text-sm text-gray-500">Value: {formatPrice(totalPrice)}</div>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* Activity Log — mobile-style: continuous line through bullets, white box per update, "add note +" button */}
              <div className="pt-4 border-t border-gray-200">
                <h3 className="text-base font-semibold text-primary-500 mb-4">Activity Log</h3>
                {logsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-accent-500 border-t-transparent"></div>
                  </div>
                ) : jobLogs.length > 0 ? (
                  <div className="relative pl-0">
                    {/* Continuous vertical line through all bullets (like mobile) */}
                    <div
                      className="absolute w-0.5 top-5 bottom-4 z-0"
                      style={{ left: '10px', backgroundColor: '#BFD1C5' }}
                    />
                    {jobLogs.map((log) => {
                      const mainText =
                        log.note_content ||
                        log.description ||
                        (log.notification_subject ? 'Notification: ' + log.notification_subject : null) ||
                        (log.notification_email ? 'Notification sent' : null) ||
                        'Update'
                      const isInvoiceLog = log.action === 'invoice-draft' || log.action === 'invoice-sent'
                      let invoiceIdFromDescription: number | null = null
                      if (isInvoiceLog && typeof log.description === 'string') {
                        const match = log.description.match(/\/invoices\/(\d+)/)
                        if (match) {
                          const parsed = parseInt(match[1], 10)
                          if (Number.isFinite(parsed)) invoiceIdFromDescription = parsed
                        }
                      }
                      const baseText = isInvoiceLog
                        ? (log.action === 'invoice-draft' ? 'Invoice draft created' : 'Invoice sent')
                        : mainText
                      return (
                        <div key={log.id} className="flex gap-4 mb-4 relative z-10">
                          {/* Left: dot (centered on the line) */}
                          <div className="w-5 flex flex-col items-center flex-shrink-0">
                            <div
                              className="w-3 h-3 rounded-full border-2 flex-shrink-0"
                              style={{ backgroundColor: '#193434', borderColor: '#F6F9F7' }}
                            />
                          </div>
                          {/* Right: white box (like mobile timelineContent) */}
                          <div className="flex-1 min-w-0 bg-white rounded-xl p-4 -mt-0.5">
                            <div className="text-[11px] text-gray-400 font-mono">
                              {formatLogTime(log.created_at)}
                              {getUserDisplayName(log) && ` · ${getUserDisplayName(log)}`}
                            </div>
                            <div className="mt-1 text-sm text-primary-500 leading-relaxed whitespace-pre-wrap">
                              {baseText}
                              {isInvoiceLog && invoiceIdFromDescription && (
                                <>
                                  {' '}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const slug = companySlugFromRoute || ''
                                      if (slug) {
                                        router.push(`/${slug}/invoices/${invoiceIdFromDescription}`)
                                      } else {
                                        router.push(`/invoices/${invoiceIdFromDescription}`)
                                      }
                                    }}
                                    className="text-accent-600 underline font-semibold"
                                  >
                                    Open invoice
                                  </button>
                                </>
                              )}
                            </div>
                            {!log.description && !log.note_content && (log.notification_message || log.notification_email || log.notification_subject) && (
                              <div
                                className="mt-2 text-xs text-gray-600 space-y-1 cursor-pointer select-none"
                                onClick={() => setExpandedLogIds((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(log.id)) next.delete(log.id)
                                  else next.add(log.id)
                                  return next
                                })}
                              >
                                {log.notification_email && <div><span className="text-gray-400">To:</span> {log.notification_email}</div>}
                                {log.notification_subject && <div><span className="text-gray-400">Subject:</span> {log.notification_subject}</div>}
                                {log.notification_message && (
                                  <div
                                    className={`relative overflow-hidden whitespace-pre-wrap rounded bg-gray-50 p-2 border border-gray-100 ${expandedLogIds.has(log.id) ? '' : 'max-h-[130px]'}`}
                                    style={expandedLogIds.has(log.id) ? {} : { maskImage: 'linear-gradient(to bottom, black 0%, black 75%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 75%, transparent 100%)' }}
                                  >
                                    {log.notification_message}
                                    {!expandedLogIds.has(log.id) && (
                                      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none" />
                                    )}
                                  </div>
                                )}
                                {!expandedLogIds.has(log.id) && (log.notification_message || log.notification_subject) && (
                                  <div className="text-[10px] text-gray-400 mt-0.5">Click to show full message</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {/* add note + button (like mobile) — aligns with white boxes, toggles text field */}
                    {typeof currentJob?.id === 'number' && !showNoteInput && (
                      <button
                        type="button"
                        onClick={() => setShowNoteInput(true)}
                        className="mt-4 ml-[36px] px-6 py-3 rounded-full text-sm font-semibold text-white transition-colors"
                        style={{ backgroundColor: '#3DD57A' }}
                      >
                        add note +
                      </button>
                    )}
                    {typeof currentJob?.id === 'number' && showNoteInput && (
                      <div className="mt-4 ml-[36px]">
                        <NoteInput
                          jobId={currentJob.id}
                          onNoteAdded={() => {
                            fetchJobLogs(currentJob.id)
                            setShowNoteInput(false)
                          }}
                          onCancel={() => setShowNoteInput(false)}
                        />
                      </div>
                    )}
                    {typeof currentJob?.id !== 'number' && (
                      <div className="text-xs text-gray-500 mt-4">Notes are only available for real jobs (not subscription previews).</div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="text-sm text-gray-500">No timeline entries yet</div>
                    {typeof currentJob?.id === 'number' && !showNoteInput && (
                      <button
                        type="button"
                        onClick={() => setShowNoteInput(true)}
                        className="mt-4 ml-[36px] px-6 py-3 rounded-full text-sm font-semibold text-white transition-colors"
                        style={{ backgroundColor: '#3DD57A' }}
                      >
                        add note +
                      </button>
                    )}
                    {typeof currentJob?.id === 'number' && showNoteInput && (
                      <div className="mt-4 ml-[36px]">
                        <NoteInput
                          jobId={currentJob.id}
                          onNoteAdded={() => {
                            fetchJobLogs(currentJob.id)
                            setShowNoteInput(false)
                          }}
                          onCancel={() => setShowNoteInput(false)}
                        />
                      </div>
                    )}
                    {typeof currentJob?.id !== 'number' && (
                      <div className="text-xs text-gray-500 mt-4">Notes are only available for real jobs.</div>
                    )}
                  </div>
                )}
              </div>

            </>
          ) : (
            <div className="text-center text-gray-500 py-8">
              Failed to load job details
            </div>
          )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-page px-5 py-2.5 text-[11px] text-gray-500 flex items-center justify-between">
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
        enableNotification={true}
        defaultEmail={(jobDetails || job) ? ((jobDetails || job) as any).client_billing_email || ((jobDetails || job) as any).client_personal_email || ((jobDetails || job) as any).client_email || '' : ''}
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

      {/* Cancel Job Confirmation Modal */}
      <ConfirmModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={confirmCancelJob}
        title="Cancel Job"
        description="Are you sure you want to cancel this job?"
        confirmLabel="Cancel Job"
        defaultSubject={`Job Cancelled: ${currentJob?.title || 'Job'}`}
        defaultMessage={() => {
          const jobData = jobDetails || currentJob
          let userName = 'Our team'
          try {
            const u = JSON.parse(localStorage.getItem('user') || '{}')
            if (u.firstName && u.lastName) userName = `${u.firstName} ${u.lastName}`
          } catch {}
          return `Dear ${(jobData as any)?.first_name || 'customer'},

We regret to inform you that your job "${jobData?.title || 'scheduled job'}" has been cancelled.

If you would like to reschedule or have any questions, please don't hesitate to contact us.

Kind regards,
${userName}`
        }}
      >
        <div className="text-sm text-gray-600">
          <p>This will mark the job as cancelled. The customer will be notified if you choose to send a notification.</p>
        </div>
      </ConfirmModal>
    </>
  )
}
