'use client'

import { useState, useEffect } from 'react'
import { XMarkIcon, PlusIcon, UserIcon, ClockIcon, CalendarIcon } from '@heroicons/react/24/outline'

interface Service {
  id: number
  title: string
  price: number
  duration_minutes: number
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

interface SubscriptionSlideoutProps {
  isOpen: boolean
  onClose: () => void
  onSubscriptionCreated?: () => void
  clientId: number
  subscription?: any // For editing
}

export default function SubscriptionSlideout({ isOpen, onClose, onSubscriptionCreated, clientId, subscription }: SubscriptionSlideoutProps) {
  const [services, setServices] = useState<Service[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [showServiceDropdown, setShowServiceDropdown] = useState(false)
  const [serviceSearch, setServiceSearch] = useState('')
  const [subscriptionTitle, setSubscriptionTitle] = useState('')
  const [startingDate, setStartingDate] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState<number>(1) // Default Monday
  const [intervalWeeks, setIntervalWeeks] = useState<number>(1)
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')
  const [note, setNote] = useState('')
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTimeRangeMode, setIsTimeRangeMode] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  
  // Editing states for service values
  const [editingPrice, setEditingPrice] = useState<number | null>(null)
  const [editingDuration, setEditingDuration] = useState<number | null>(null)

  useEffect(() => {
    if (isOpen) {
      fetchServices()
      fetchUsers()
      if (subscription) {
        // Load subscription data for editing
        setSubscriptionTitle(subscription.title || '')
        setStartingDate(subscription.starting_date || subscription.next_occurrence_date || '')
        setDayOfWeek(subscription.day_of_week || 1)
        setIntervalWeeks(subscription.interval_weeks || 1)
        setTimeFrom(subscription.scheduled_time_from || '')
        setTimeTo(subscription.scheduled_time_to || '')
        setNote(subscription.note || '')
        setSelectedUserId(subscription.assigned_user_id || null)
        setIsTimeRangeMode(!!(subscription.scheduled_time_from && subscription.scheduled_time_to))
        // Load services from subscription
        if (subscription.services) {
          setSelectedServices(subscription.services.map((s: any) => ({
            id: s.service_id,
            title: s.title || '',
            price: s.custom_price || 0,
            duration_minutes: s.custom_duration_minutes || 0,
            customPrice: (s.custom_price || 0).toString(),
            customDuration: s.custom_duration_minutes || 0
          })))
        }
      } else {
        resetForm()
      }
    }
  }, [isOpen, subscription])

  const resetForm = () => {
    setSubscriptionTitle('')
    setStartingDate('')
    setDayOfWeek(1)
    setIntervalWeeks(1)
    setTimeFrom('')
    setTimeTo('')
    setIsTimeRangeMode(false)
    setNote('')
    setShowNoteInput(false)
    setSelectedServices([])
    setSelectedUserId(null)
    setServiceSearch('')
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('.dropdown-container') && !target.closest('[data-time-picker]')) {
        setShowServiceDropdown(false)
        setShowTimePicker(false)
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
      const response = await fetch('http://localhost:3002/api/services', {
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

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:3002/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok) {
        setUsers(data.users || [])
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const handleServiceSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setServiceSearch(e.target.value)
    setShowServiceDropdown(true)
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

  const removeService = (serviceId: number) => {
    setSelectedServices(selectedServices.filter(s => s.id !== serviceId))
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

  const handleSubmit = async () => {
    if (!subscriptionTitle.trim() || !startingDate || selectedServices.length === 0) {
      return
    }

    try {
      setIsSubmitting(true)
      const token = localStorage.getItem('token')
      
      const subscriptionData = {
        title: subscriptionTitle.trim(),
        client_id: clientId,
        assigned_user_id: selectedUserId || null, // Explicitly set to null if not selected
        services: selectedServices.map(service => ({
          service_id: service.id,
          custom_price: parseFloat(service.customPrice) || service.price,
          custom_duration: service.customDuration
        })),
        starting_date: startingDate && startingDate.trim() !== '' ? startingDate.trim() : null,
        day_of_week: dayOfWeek,
        interval_weeks: intervalWeeks,
        scheduled_time_from: timeFrom && timeFrom.trim() !== '' ? timeFrom : null,
        scheduled_time_to: timeTo && timeTo.trim() !== '' ? timeTo : null,
        note: note.trim() || null
      }

      const url = subscription 
        ? `http://localhost:3002/api/subscriptions/${subscription.id}`
        : 'http://localhost:3002/api/subscriptions'
      
      const method = subscription ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(subscriptionData)
      })

      const data = await response.json()

      if (response.ok) {
        onSubscriptionCreated?.()
        onClose()
      } else {
        console.error('Error creating subscription:', data.error)
        alert(data.error || 'Failed to save subscription')
      }
    } catch (error) {
      console.error('Error saving subscription:', error)
      alert('Failed to save subscription')
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredServices = services.filter(service =>
    service.title.toLowerCase().includes(serviceSearch.toLowerCase())
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
          <h2 className="text-lg font-semibold text-gray-900 pr-12">
            {subscription ? 'Edit Subscription' : 'Create Subscription'}
          </h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              value={subscriptionTitle}
              onChange={(e) => setSubscriptionTitle(e.target.value)}
              placeholder="Enter subscription title..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
            />
          </div>

          {/* Starting Date */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Starting Date</label>
            <input
              type="date"
              value={startingDate}
              onChange={(e) => setStartingDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
            />
            <p className="text-xs text-gray-500">All jobs will be scheduled after this date</p>
          </div>

          {/* Services */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Services</label>
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

          {/* Employee (Optional) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Employee (Optional)</label>
            <select
              value={selectedUserId || ''}
              onChange={(e) => setSelectedUserId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors text-sm"
            >
              <option value="">No employee assigned</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>
                  {user.first_name} {user.last_name} ({user.role})
                </option>
              ))}
            </select>
          </div>

          {/* Schedule */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">Schedule</label>
            
            {/* Day of Week */}
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Day of Week</label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors text-sm"
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
              </select>
            </div>

            {/* Frequency */}
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Repeat Every</label>
              <select
                value={intervalWeeks}
                onChange={(e) => setIntervalWeeks(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors text-sm"
              >
                <option value={1}>Every week</option>
                <option value={2}>Every 2 weeks</option>
                <option value={3}>Every 3 weeks</option>
                <option value={4}>Every 4 weeks</option>
                <option value={6}>Every 6 weeks</option>
                <option value={8}>Every 8 weeks</option>
              </select>
            </div>

            {/* Time (Optional) */}
            <div className="relative">
              <label className="text-xs text-gray-600 mb-1 block">Time (Optional)</label>
              <button
                type="button"
                onClick={() => setShowTimePicker(!showTimePicker)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-left hover:bg-gray-50 transition-colors"
              >
                {timeFrom && timeTo 
                  ? `${timeFrom} - ${timeTo}`
                  : timeFrom 
                    ? timeFrom
                    : timeTo
                      ? timeTo
                      : 'No time set'
                }
              </button>
              
              {showTimePicker && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4" data-time-picker>
                  <div className="mb-4">
                    <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setTimeTo('')
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
                          setIsTimeRangeMode(true)
                          if (!timeTo && timeFrom) {
                            setTimeTo(timeFrom)
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

                  <div className="space-y-3">
                    {!isTimeRangeMode ? (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-2">Time</label>
                        <input
                          type="time"
                          value={timeFrom}
                          onChange={(e) => setTimeFrom(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-2">Between</label>
                        <div className="flex items-center space-x-3">
                          <input
                            type="time"
                            value={timeFrom}
                            onChange={(e) => setTimeFrom(e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                          />
                          <span className="text-sm text-gray-500 font-medium">to</span>
                          <input
                            type="time"
                            value={timeTo}
                            onChange={(e) => setTimeTo(e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTimeFrom('')
                          setTimeTo('')
                          setShowTimePicker(false)
                        }}
                        className="flex-1 py-2 px-3 text-xs text-gray-600 hover:text-gray-800 transition-colors"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowTimePicker(false)}
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

          {/* Notes */}
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
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note for this subscription..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-colors text-sm resize-none"
                  rows={3}
                  style={{ minHeight: '80px', maxHeight: '120px' }}
                />
                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNote('')
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

        {/* Footer */}
        <div className="border-t border-gray-100 p-6">
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !subscriptionTitle.trim() || !startingDate || selectedServices.length === 0}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Saving...' : subscription ? 'Update Subscription' : 'Create Subscription'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

