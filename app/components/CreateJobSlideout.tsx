'use client'

import { useState, useEffect } from 'react'
import { XMarkIcon, PlusIcon, CalendarIcon, ClockIcon, UserIcon } from '@heroicons/react/24/outline'
import { useUser } from '../hooks/useUser'
import { apiUrl } from '../utils/api'

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
  const [jobDate, setJobDate] = useState('')
  const [jobTime, setJobTime] = useState('09:00')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loadingServices, setLoadingServices] = useState(false)

  // User selection state
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [loadingUsers, setLoadingUsers] = useState(false)

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
      setJobTime('09:00')
      setShowDatePicker(false)
      setShowTimePicker(false)
      setError('')
      setCreatedJobId(null)
      setSelectedUserId(null)
    }
  }, [isOpen])

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDatePicker || showTimePicker) {
        const target = event.target as Element
        if (!target.closest('.date-time-picker-container')) {
          setShowDatePicker(false)
          setShowTimePicker(false)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDatePicker, showTimePicker])

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
    
    if (!title.trim()) {
      setError('Job title is required')
      return
    }
    
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
        title: title.trim(),
        client_id: clientId,
        assigned_user_id: selectedUserId,
        services: selectedServices.map(service => ({
          service_id: service.id,
          custom_price: service.customPrice,
          custom_duration: service.customDuration
        })),
        scheduled_date: `${jobDate}T${jobTime}:00.000Z`
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
      
      {/* Slideout */}
      <div className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <PlusIcon className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Create Job</h2>
              <p className="text-sm text-gray-500">for {clientName}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {/* Date Button with Dropdown */}
            <div className="date-time-picker-container relative">
              <button
                type="button"
                onClick={() => {
                  console.log('CreateJob Date button clicked!', { jobDate });
                  setShowDatePicker(!showDatePicker)
                  setShowTimePicker(false)
                }}
                className="px-3 py-1.5 bg-green-100 rounded-lg flex items-center space-x-1 hover:bg-green-200 transition-colors text-sm"
                title="Click to change date"
              >
                <CalendarIcon className="w-3 h-3 text-green-600" />
                <span className="text-green-700 font-medium">
                  {jobDate ? new Date(jobDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Set Date'}
                </span>
              </button>
              
              {/* Date Picker Dropdown */}
              {showDatePicker && (
                <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3 min-w-[200px]">
                  <input
                    type="date"
                    value={jobDate}
                    onChange={(e) => {
                      console.log('CreateJob Date changed to:', e.target.value);
                      setJobDate(e.target.value)
                      setShowDatePicker(false)
                    }}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    autoFocus
                  />
                </div>
              )}
            </div>
            
            {/* Time Button with Dropdown */}
            <div className="date-time-picker-container relative">
              <button
                type="button"
                onClick={() => {
                  console.log('CreateJob Time button clicked!', { jobTime });
                  setShowTimePicker(!showTimePicker)
                  setShowDatePicker(false)
                }}
                className="px-3 py-1.5 bg-purple-100 rounded-lg flex items-center space-x-1 hover:bg-purple-200 transition-colors text-sm"
                title="Click to change time"
              >
                <ClockIcon className="w-3 h-3 text-purple-600" />
                <span className="text-purple-700 font-medium">
                  {jobTime || '--:--'}
                </span>
              </button>
              
              {/* Time Picker Dropdown */}
              {showTimePicker && (
                <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3 min-w-[150px]">
                  <input
                    type="time"
                    value={jobTime}
                    onChange={(e) => {
                      console.log('CreateJob Time changed to:', e.target.value);
                      setJobTime(e.target.value)
                      setShowTimePicker(false)
                    }}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    autoFocus
                  />
                </div>
              )}
            </div>
            {/* Close Button */}
            <button
              onClick={onClose}
              className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <XMarkIcon className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto max-h-[calc(100vh-120px)] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {/* Title */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Job Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                placeholder="Enter job title..."
              />
            </div>

            {/* User Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Assign to User
              </label>
              {loadingUsers ? (
                <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm">
                  Loading users...
                </div>
              ) : users.length === 1 ? (
                <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 text-sm">
                  {users[0].first_name} {users[0].last_name} ({users[0].role})
                </div>
              ) : (
                <select
                  value={selectedUserId || ''}
                  onChange={(e) => setSelectedUserId(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
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

            {/* Services */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Services
              </label>
              
              {/* Service Search */}
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => handleServiceSearch(e.target.value)}
                  onFocus={() => setShowServiceDropdown(true)}
                  placeholder="Search services..."
                  className="w-full px-3 py-2 pl-9 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                />
                <PlusIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              </div>

              {/* Service Dropdown */}
              {showServiceDropdown && (
                <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredServices.length > 0 ? (
                    filteredServices.map((service) => (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => handleServiceSelect(service)}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between text-sm"
                      >
                        <div>
                          <div className="font-medium">{service.title}</div>
                          <div className="text-gray-500">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'DKK' }).format(service.price)} • {Math.floor(service.duration_minutes / 60)}h {service.duration_minutes % 60}m
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-gray-500 text-sm">No services found</div>
                  )}
                </div>
              )}

              {/* Selected Services */}
              {selectedServices.length > 0 && (
                <div className="space-y-2">
                  {selectedServices.map((service) => (
                    <div key={service.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-4">
                        {/* Title on the left */}
                        <div className="text-sm font-medium text-gray-900 flex-1">
                          {service.title}
                        </div>
                        
                        {/* Price and Duration fields inline on the right */}
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <label className="text-xs text-gray-600">Price:</label>
                            <input
                              type="number"
                              value={service.customPrice || service.price}
                              onChange={(e) => handleServicePriceChange(service.id, e.target.value)}
                              className="w-16 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <label className="text-xs text-gray-600">Time:</label>
                            <input
                              type="number"
                              value={service.customDuration || service.duration_minutes}
                              onChange={(e) => handleServiceDurationChange(service.id, e.target.value)}
                              className="w-16 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveService(service.id)}
                            className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center hover:bg-red-200 transition-colors"
                          >
                            <XMarkIcon className="w-3 h-3 text-red-600" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>




            {/* Submit Button */}
            <div className="pt-4 border-t border-gray-100">
              {createdJobId ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full bg-green-600 text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <span>Done</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting || selectedServices.length === 0}
                  className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Job</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
