'use client'

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { XMarkIcon, PlusIcon, ClockIcon, DocumentTextIcon, UserIcon } from '@heroicons/react/24/outline'
import { useUser } from '../hooks/useUser'
import { apiUrl } from '../utils/api'
import ConfirmModal from './ConfirmModal'

interface Service {
  id: number
  title: string
  price: number
  duration_minutes: number
}

interface SelectedService extends Service {
  customPrice?: number
  customDuration?: number
}

interface User {
  id: number
  first_name: string
  last_name: string
  email: string
  role: string
}

interface CreateJobSlideoutProps {
  isOpen: boolean
  onClose: () => void
  onJobCreated?: () => void
  clientId: number
  clientName: string
}

export default function CreateJobSlideout({ isOpen, onClose, onJobCreated, clientId, clientName }: CreateJobSlideoutProps) {
  const { user } = useUser()
  const [createdJobId, setCreatedJobId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [services, setServices] = useState<Service[]>([])
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showServiceDropdown, setShowServiceDropdown] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [pendingTimeFrom, setPendingTimeFrom] = useState('09:00')
  const [pendingTimeTo, setPendingTimeTo] = useState('')
  const [isTimeRangeMode, setIsTimeRangeMode] = useState(false)
  const [jobNote, setJobNote] = useState('')
  const [jobDate, setJobDate] = useState('')
  const [jobTimeFrom, setJobTimeFrom] = useState('09:00')
  const [jobTimeTo, setJobTimeTo] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loadingServices, setLoadingServices] = useState(false)

  // User selection state
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [loadingUsers, setLoadingUsers] = useState(false)

  // Refs and portal positions for dropdowns (escape overflow-hidden)
  const serviceDropdownTriggerRef = useRef<HTMLDivElement>(null)
  const userDropdownTriggerRef = useRef<HTMLDivElement>(null)
  const [serviceDropdownRect, setServiceDropdownRect] = useState<DOMRect | null>(null)
  const [userDropdownRect, setUserDropdownRect] = useState<DOMRect | null>(null)

  // Fetch services and users when slideout opens
  useEffect(() => {
    if (isOpen) {
      fetchServices()
      fetchUsers()
      // Set default date to today
      const today = new Date().toISOString().split('T')[0]
      setJobDate(today)
    } else {
      // Reset form when slideout closes
      setTitle('')
      setSelectedServices([])
      setSearchTerm('')
      setShowServiceDropdown(false)
      setJobDate('')
      setJobTimeFrom('09:00')
      setJobTimeTo('')
      setJobNote('')
      setShowNoteInput(false)
      setShowTimeModal(false)
      setShowUserDropdown(false)
      setError('')
      setCreatedJobId(null)
      setSelectedUserId(null)
    }
  }, [isOpen])

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('.dropdown-container')) {
        setShowServiceDropdown(false)
        setShowUserDropdown(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

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
      setLoadingServices(true)
      const token = localStorage.getItem('token')
      
      const response = await fetch(apiUrl('/services'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setServices(data.services || [])
      } else {
        console.error('Failed to fetch services:', data.error)
      }
    } catch (error) {
      console.error('Network error: Failed to fetch services', error)
    } finally {
      setLoadingServices(false)
    }
  }

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true)
      const token = localStorage.getItem('token')
      
      const response = await fetch(apiUrl('/users'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (response.ok) {
        const fetchedUsers = data.users || []
        setUsers(fetchedUsers)
        
        // If there's only one user, auto-select them
        if (fetchedUsers.length === 1) {
          setSelectedUserId(fetchedUsers[0].id)
        }
      } else {
        console.error('Failed to fetch users:', data.error)
      }
    } catch (error) {
      console.error('Network error: Failed to fetch users', error)
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleServiceSearch = (term: string) => {
    setSearchTerm(term)
    setShowServiceDropdown(true) // Show dropdown immediately when typing
  }

  const handleServiceSelect = (service: Service) => {
    const newSelectedService: SelectedService = {
      ...service,
      customPrice: service.price,
      customDuration: service.duration_minutes
    }
    setSelectedServices([...selectedServices, newSelectedService])
    setSearchTerm('')
    setShowServiceDropdown(false)
  }

  const handleRemoveService = (serviceId: number) => {
    setSelectedServices(selectedServices.filter(s => s.id !== serviceId))
  }

  const handleServicePriceChange = (serviceId: number, price: string) => {
    setSelectedServices(selectedServices.map(s => 
      s.id === serviceId 
        ? { ...s, customPrice: parseFloat(price) || 0 }
        : s
    ))
  }

  const handleServiceDurationChange = (serviceId: number, duration: string) => {
    setSelectedServices(selectedServices.map(s => 
      s.id === serviceId 
        ? { ...s, customDuration: parseInt(duration) || 0 }
        : s
    ))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedUserId) {
      setError('Please select a user for this job')
      return
    }
    
    if (selectedServices.length === 0) {
      setError('At least one service is required')
      return
    }
    
    if (!jobDate) {
      setError('Date is required')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const token = localStorage.getItem('token')
      
      const jobData = {
        title: '',
        client_id: clientId,
        assigned_user_id: selectedUserId,
        services: selectedServices.map(service => ({
          service_id: service.id,
          custom_price: service.customPrice,
          custom_duration: service.customDuration
        })),
        scheduled_date: jobDate ? jobDate.split('T')[0] : null,
        scheduled_time_from: jobTimeFrom && jobTimeFrom.trim() !== '' ? jobTimeFrom : null,
        scheduled_time_to: jobTimeTo && jobTimeTo.trim() !== '' ? jobTimeTo : null
      }
      
      console.log('Creating job with data:', jobData)
      
      const response = await fetch(apiUrl('/jobs'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(jobData)
      })
      
      const data = await response.json()
      
      console.log('Job creation response:', { status: response.status, data })
      
      if (response.ok) {
        console.log('Job created successfully!')
        setCreatedJobId(data.job.id)
        if (onJobCreated) {
          onJobCreated()
        }
        // Don't close slideout yet - let user add notes first
      } else {
        setError(data.error || 'Failed to create job')
      }
    } catch (error) {
      setError('Network error: Failed to create job')
      console.error('Job creation error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredServices = services.filter(service =>
    service.title.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}
      
      {/* Slideout - subscription-style layout with date at bottom */}
      <div className={`fixed top-0 right-0 h-full min-h-[660px] w-full max-w-2xl bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 flex flex-col overflow-visible rounded-l-3xl ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Header - same style as Create Subscription */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gradient-to-r from-white to-primary-50/30">
          <div className="space-y-0.5">
            <h2 className="text-2xl font-bold text-primary-800 tracking-tight">Create Job</h2>
            <p className="text-sm text-gray-500 font-medium">for {clientName}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center hover:bg-gray-50 transition-all duration-200 ease-out shadow-sm border border-gray-200 hover:border-gray-300 hover:shadow-md group">
            <XMarkIcon className="w-5 h-5 text-gray-500 group-hover:text-gray-700 transition-colors" />
          </button>
        </div>

        {/* Content - same structure as subscription step 1, date at bottom */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-white to-gray-50/50">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Client (read-only card) */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-primary-700">Client</label>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="text-sm font-medium text-gray-900">{clientName}</div>
            </div>
          </div>

          {/* Services */}
          <div className="space-y-4">
            <label className="block text-xs font-semibold text-primary-700 mb-2">Services *</label>
            <div className="relative dropdown-container">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handleServiceSearch(e.target.value)}
                onFocus={() => setShowServiceDropdown(true)}
                placeholder="Search for services..."
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 text-sm bg-white shadow-sm hover:border-gray-300"
              />
              {showServiceDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 max-h-60 overflow-y-auto">
                  {filteredServices.length > 0 ? (
                    filteredServices.map((service) => (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => handleServiceSelect(service)}
                        className="w-full px-4 py-3 text-left hover:bg-accent-50/50 border-b border-gray-100"
                      >
                        <div className="text-sm font-semibold text-primary-800">{service.title}</div>
                        <div className="text-xs text-gray-500">{service.price} DKK · {service.duration_minutes} min</div>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-gray-500 text-sm">No services found</div>
                  )}
                </div>
              )}
            </div>
            {selectedServices.length > 0 && (
              <div className="space-y-2">
                {selectedServices.map((service) => (
                  <div key={service.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-white to-accent-50/20 rounded-xl border border-accent-200/30 shadow-sm">
                    <div className="text-sm font-semibold text-primary-800">{service.title}</div>
                    <div className="flex items-center gap-2">
                      <input type="number" value={service.customPrice || service.price} onChange={e => handleServicePriceChange(service.id, e.target.value)} className="w-16 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-accent-500/20" />
                      <span className="text-xs text-gray-500">kr.</span>
                      <input type="number" value={service.customDuration || service.duration_minutes} onChange={e => handleServiceDurationChange(service.id, e.target.value)} className="w-14 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-accent-500/20" />
                      <span className="text-xs text-gray-500">min</span>
                      <button type="button" onClick={() => handleRemoveService(service.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Assign to User, Time, and Note - same place and time as subscription (flex wrap right after services) */}
            {selectedServices.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <div className="relative dropdown-container" ref={userDropdownTriggerRef}>
                  {loadingUsers ? (
                    <span className="text-sm text-gray-500">Loading...</span>
                  ) : selectedUserId ? (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-accent-50 to-accent-50/50 border border-accent-200/60 rounded-full shadow-sm hover:shadow-md transition-all duration-200 group">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm ring-2 ring-white/50">
                        {users.find(u => u.id === selectedUserId)?.first_name?.[0]}{users.find(u => u.id === selectedUserId)?.last_name?.[0]}
                      </div>
                      <span className="text-sm font-semibold text-primary-800">
                        {users.find(u => u.id === selectedUserId)?.first_name} {users.find(u => u.id === selectedUserId)?.last_name}
                      </span>
                      <button type="button" onClick={() => setSelectedUserId(null)} className="ml-1 p-0.5 rounded-full hover:bg-white/80">
                        <XMarkIcon className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowUserDropdown(!showUserDropdown)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600 hover:text-primary-800 hover:border-accent-300 hover:bg-accent-50/30 shadow-sm hover:shadow-md transition-all duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <UserIcon className="w-4 h-4 text-gray-400" />
                      <span>Assign employee</span>
                      <PlusIcon className="w-3 h-3 text-gray-400" />
                    </button>
                  )}
                  {typeof document !== 'undefined' && showUserDropdown && !selectedUserId && users.length > 0 && userDropdownRect && createPortal(
                    <div className="dropdown-container bg-white border border-gray-200 rounded-2xl shadow-2xl min-w-[220px] max-h-60 overflow-y-auto" style={{ position: 'fixed', top: userDropdownRect.bottom + 8, left: userDropdownRect.left, zIndex: 9999 }}>
                      {users.map((u) => (
                        <button key={u.id} type="button" onClick={() => { setSelectedUserId(u.id); setShowUserDropdown(false) }} className="w-full px-4 py-3 text-left hover:bg-accent-50/50 flex items-center gap-3 group first:rounded-t-2xl last:rounded-b-2xl hover:pl-5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white text-xs font-semibold ring-2 ring-white/50">
                            {u.first_name?.[0]}{u.last_name?.[0]}
                          </div>
                          <div className="text-sm font-semibold text-primary-800">{u.first_name} {u.last_name}</div>
                        </button>
                      ))}
                    </div>,
                    document.body
                  )}
                </div>
                <div className="relative">
                  {jobTimeFrom || jobTimeTo ? (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-accent-50 to-accent-50/50 border border-accent-200/60 rounded-full shadow-sm hover:shadow-md transition-all duration-200 group">
                      <ClockIcon className="w-4 h-4 text-accent-600" />
                      <span className="text-sm font-semibold text-primary-800">
                        {jobTimeFrom && jobTimeTo ? `${jobTimeFrom} - ${jobTimeTo}` : jobTimeFrom || jobTimeTo || ''}
                      </span>
                      <button type="button" onClick={() => { setJobTimeFrom(''); setJobTimeTo('') }} className="ml-1 p-0.5 rounded-full hover:bg-white/80">
                        <XMarkIcon className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setPendingTimeFrom(jobTimeFrom); setPendingTimeTo(jobTimeTo); setIsTimeRangeMode(!!jobTimeTo); setShowTimeModal(true) }}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600 hover:text-primary-800 hover:border-accent-300 hover:bg-accent-50/30 shadow-sm hover:shadow-md transition-all duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <ClockIcon className="w-4 h-4 text-gray-400" />
                      <span>Add time</span>
                      <PlusIcon className="w-3 h-3 text-gray-400" />
                    </button>
                  )}
                </div>
                <div className="relative">
                  {jobNote.trim() ? (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-accent-50 to-accent-50/50 border border-accent-200/60 rounded-full shadow-sm hover:shadow-md transition-all duration-200 max-w-xs group">
                      <DocumentTextIcon className="w-4 h-4 text-accent-600 flex-shrink-0" />
                      <span className="text-sm font-semibold text-primary-800 truncate">{jobNote.length > 20 ? `${jobNote.substring(0, 20)}...` : jobNote}</span>
                      <button type="button" onClick={() => { setJobNote(''); setShowNoteInput(false) }} className="ml-1 p-0.5 rounded-full hover:bg-white/80 flex-shrink-0">
                        <XMarkIcon className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowNoteInput(true)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600 hover:text-primary-800 hover:border-accent-300 hover:bg-accent-50/30 shadow-sm hover:shadow-md transition-all duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <DocumentTextIcon className="w-4 h-4 text-gray-400" />
                      <span>Add note</span>
                      <PlusIcon className="w-3 h-3 text-gray-400" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Date selector - only when service picked; full width */}
          {selectedServices.length > 0 && (
            <div className="space-y-2 pt-4">
              <label className="block text-xs font-semibold text-primary-700 mb-2">Date *</label>
              <input type="date" value={jobDate} onChange={e => setJobDate(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 text-sm bg-white shadow-sm hover:border-gray-300" />
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end pt-6 border-t border-gray-100">
            {createdJobId ? (
              <button type="button" onClick={onClose} className="px-8 py-3 bg-accent-500 text-white text-sm font-semibold rounded-xl hover:bg-accent-600">Done</button>
            ) : (
              <button type="submit" disabled={isSubmitting || selectedServices.length === 0 || !selectedUserId || !jobDate} className="px-8 py-3 bg-accent-500 text-white text-sm font-semibold rounded-xl hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-accent-500/20">
                {isSubmitting ? 'Creating...' : 'Create Job'}
              </button>
            )}
          </div>
        </div>
        </form>
      </div>

      {/* Time modal */}
      <ConfirmModal isOpen={showTimeModal} onClose={() => setShowTimeModal(false)} onConfirm={() => { setJobTimeFrom(pendingTimeFrom); setJobTimeTo(isTimeRangeMode ? pendingTimeTo : ''); setShowTimeModal(false) }} title="Set Time" description="Set the scheduled time for this job" confirmLabel="Save Time">
        <div className="space-y-3">
          <div className="flex items-center space-x-1 bg-gray-100 rounded p-0.5">
            <button type="button" onClick={() => { setIsTimeRangeMode(false); setPendingTimeTo('') }} className={`flex-1 py-1.5 px-2 text-xs font-medium rounded ${!isTimeRangeMode ? 'bg-white text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}>Single Time</button>
            <button type="button" onClick={() => { setIsTimeRangeMode(true); if (!pendingTimeTo && pendingTimeFrom) setPendingTimeTo(pendingTimeFrom) }} className={`flex-1 py-1.5 px-2 text-xs font-medium rounded ${isTimeRangeMode ? 'bg-white text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}>Time Range</button>
          </div>
          {!isTimeRangeMode ? (
            <div><label className="block text-xs text-gray-500 mb-1.5">Time</label><input type="time" value={pendingTimeFrom} onChange={e => setPendingTimeFrom(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500 bg-white" /></div>
          ) : (
            <div><label className="block text-xs text-gray-500 mb-1.5">Between</label><div className="flex items-center gap-2"><input type="time" value={pendingTimeFrom} onChange={e => setPendingTimeFrom(e.target.value)} className="flex-1 px-3 py-2 border border-gray-200 rounded text-sm bg-white" /><span className="text-xs text-gray-500">to</span><input type="time" value={pendingTimeTo} onChange={e => setPendingTimeTo(e.target.value)} className="flex-1 px-3 py-2 border border-gray-200 rounded text-sm bg-white" /></div></div>
          )}
          <div className="pt-3 border-t border-gray-100"><button type="button" onClick={() => { setPendingTimeFrom(''); setPendingTimeTo(''); setShowTimeModal(false) }} className="w-full py-2 px-3 text-xs font-medium text-gray-600 hover:text-gray-900 rounded hover:bg-gray-100">Clear</button></div>
        </div>
      </ConfirmModal>

      {/* Note modal */}
      <ConfirmModal isOpen={showNoteInput} onClose={() => setShowNoteInput(false)} onConfirm={() => setShowNoteInput(false)} title="Add Note" description="Add a note to this job" confirmLabel="Save Note" enableNotification={false}>
        <div className="space-y-4"><div><label className="block text-xs font-semibold text-primary-700 mb-2">Note</label><textarea value={jobNote} onChange={e => setJobNote(e.target.value)} placeholder="Enter a note for this job..." rows={5} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 text-sm resize-none bg-white shadow-sm" /></div></div>
      </ConfirmModal>
    </>
  )
}
