'use client'

import { useState, useEffect } from 'react'
import { XMarkIcon, UserIcon, CalendarIcon, ClockIcon } from '@heroicons/react/24/outline'

interface JobViewSlideoutProps {
  isOpen: boolean
  onClose: () => void
  job: any
}

export default function JobViewSlideout({ isOpen, onClose, job }: JobViewSlideoutProps) {
  const [jobDetails, setJobDetails] = useState<any>(null)
  const [loading, setLoading] = useState(false)

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
      const subscriptionResponse = await fetch(`/api/api/clients/${jobData.client_id}/subscriptions`, {
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
              const usersResponse = await fetch('/api/api/users', {
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
      const response = await fetch(`/api/api/clients/${jobData.client_id}/jobs`, {
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
      } else {
        // If we can't fetch, we already have the data set above
        setLoading(false)
      }
    } else if (!isOpen) {
      // Reset when closed
      setJobDetails(null)
      setLoading(false)
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

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />
      
      {/* Slideout */}
      <div className="fixed right-0 top-0 h-full w-[484px] bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="bg-gray-50 border-b border-gray-200 p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0 pr-2">
              {/* Client Name and Employee Button */}
              <div className="flex items-center justify-between mb-1">
                <div className="text-xl font-bold text-gray-900 truncate">
                  {(jobDetails || job)?.first_name || ''} {(jobDetails || job)?.last_name || ''}
                </div>
                {((jobDetails || job)?.assigned_user_first_name && (jobDetails || job)?.assigned_user_last_name) && (
                  <button className="flex items-center space-x-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-xs font-medium transition-colors">
                    <UserIcon className="w-3 h-3" />
                    <span>{(jobDetails || job).assigned_user_first_name} {(jobDetails || job).assigned_user_last_name}</span>
                  </button>
                )}
              </div>
              {/* Address */}
              <div className="text-sm text-gray-600 truncate">
                {formatAddress(jobDetails || job)}
              </div>
            </div>
            
            {/* Close Button */}
            <button
              onClick={onClose}
              className="w-8 h-8 bg-white rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors shadow-sm border"
            >
              <XMarkIcon className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          {/* Date and Time */}
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center space-x-1 text-gray-700">
              <CalendarIcon className="w-4 h-4" />
              <span className="font-medium">{formatDate((jobDetails || job)?.scheduled_date)}</span>
            </div>
            {formatTimeRange((jobDetails || job)?.scheduled_time_from, (jobDetails || job)?.scheduled_time_to) && (
              <>
                <span className="text-gray-300">|</span>
                <div className="flex items-center space-x-1 text-gray-700">
                  <ClockIcon className="w-4 h-4" />
                  <span className="font-medium">{formatTimeRange((jobDetails || job)?.scheduled_time_from, (jobDetails || job)?.scheduled_time_to)}</span>
                </div>
              </>
            )}
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
                    <div className="text-sm font-semibold text-gray-900">Total</div>
                    <div className="flex items-center space-x-4 text-sm font-semibold text-gray-900">
                      <span>{formatDuration((jobDetails || job)?.total_duration || 0)}</span>
                      <span>{formatPrice((jobDetails || job)?.total_price || 0)}</span>
                    </div>
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
                    <div className="text-sm font-semibold text-gray-900">Total</div>
                    <div className="flex items-center space-x-4 text-sm font-semibold text-gray-900">
                      <span>{formatDuration((jobDetails || job)?.total_duration || 0)}</span>
                      <span>{formatPrice((jobDetails || job)?.total_price || 0)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-400 italic py-2">
                  No services assigned
                </div>
              )}

              {/* Notes */}
              <div className="pt-2">
                {(jobDetails || job)?.note ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-gray-900 whitespace-pre-wrap">
                    {(jobDetails || job).note}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 italic">
                    There are no notes on this job
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
    </>
  )
}
