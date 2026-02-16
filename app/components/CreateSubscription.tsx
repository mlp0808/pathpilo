'use client'

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { XMarkIcon, PlusIcon, CheckCircleIcon, UserIcon, ClockIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import ConfirmModal from './ConfirmModal'

interface Service {
  id: number
  title: string
  price: number
  duration_minutes: number
}

interface Client {
  id: number
  name: string
  last_name?: string
  client_type: 'person' | 'company'
  address?: string
  zip_code?: string
  city?: string
  email?: string
  phone?: string
}

interface SelectedService {
  id: number
  title: string
  price: number
  duration_minutes: number
  customPrice: string
  customDuration: number
  isCustom?: boolean
  customTitle?: string
}

interface CreateSubscriptionProps {
  isOpen: boolean
  onClose: () => void
  onSubscriptionCreated?: () => void
}

export default function CreateSubscription({ isOpen, onClose, onSubscriptionCreated }: CreateSubscriptionProps) {
  const [services, setServices] = useState<Service[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [subscriptionTitle, setSubscriptionTitle] = useState('')
  const [jobDate, setJobDate] = useState('')
  const [jobTimeFrom, setJobTimeFrom] = useState('')
  const [jobTimeTo, setJobTimeTo] = useState('')
  const [jobNote, setJobNote] = useState('')
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdSubscriptionId, setCreatedSubscriptionId] = useState<number | null>(null)
  const [editingPrice, setEditingPrice] = useState<number | null>(null)
  const [editingDuration, setEditingDuration] = useState<number | null>(null)
  const [editingTitle, setEditingTitle] = useState<number | null>(null)
  const [isAddingNewClient, setIsAddingNewClient] = useState(false)
  const [isEditingClient, setIsEditingClient] = useState(false)
  const [isTimeRangeMode, setIsTimeRangeMode] = useState(false)
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [pendingTimeFrom, setPendingTimeFrom] = useState('')
  const [pendingTimeTo, setPendingTimeTo] = useState('')
  const [showTimeFromPicker, setShowTimeFromPicker] = useState(false)
  const [showTimeToPicker, setShowTimeToPicker] = useState(false)
  const [editingClientData, setEditingClientData] = useState({
    client_type: 'person' as 'person' | 'company',
    name: '',
    last_name: '',
    company_number: '',
    address: '',
    zip_code: '',
    city: '',
    email: '',
    phone: ''
  })
  const [newClientData, setNewClientData] = useState({
    client_type: 'person' as 'person' | 'company',
    name: '',
    last_name: '',
    company_number: '',
    address: '',
    zip_code: '',
    city: '',
    email: '',
    phone: ''
  })
  const [clientSearch, setClientSearch] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [serviceSearch, setServiceSearch] = useState('')
  const [showServiceDropdown, setShowServiceDropdown] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [currentStep, setCurrentStep] = useState<1 | 2>(1)

  // Refs and portal positions for dropdowns (escape overflow-hidden)
  const clientDropdownTriggerRef = useRef<HTMLDivElement>(null)
  const serviceDropdownTriggerRef = useRef<HTMLDivElement>(null)
  const userDropdownTriggerRef = useRef<HTMLDivElement>(null)
  const timeFromPickerTriggerRef = useRef<HTMLDivElement>(null)
  const timeToPickerTriggerRef = useRef<HTMLDivElement>(null)
  const [clientDropdownRect, setClientDropdownRect] = useState<DOMRect | null>(null)
  const [serviceDropdownRect, setServiceDropdownRect] = useState<DOMRect | null>(null)
  const [userDropdownRect, setUserDropdownRect] = useState<DOMRect | null>(null)
  const [timeFromPickerRect, setTimeFromPickerRect] = useState<DOMRect | null>(null)
  const [timeToPickerRect, setTimeToPickerRect] = useState<DOMRect | null>(null)

  // Subscription-specific state
  const [recurrenceType, setRecurrenceType] = useState<'weekly' | 'monthly'>('weekly')
  const [dayOfWeek, setDayOfWeek] = useState<number>(1) // Monday
  const [dayOfMonth, setDayOfMonth] = useState<number>(1)
  const [intervalValue, setIntervalValue] = useState<number>(1)

  const resetForm = () => {
    setSelectedServices([])
    setSelectedClient(null)
    setSelectedUserId(null)
    setSubscriptionTitle('')
    setJobDate('')
    setJobTimeFrom('')
    setJobTimeTo('')
    setJobNote('')
    setShowNoteInput(false)
    setCreatedSubscriptionId(null)
    setEditingPrice(null)
    setEditingDuration(null)
    setEditingTitle(null)
    setIsAddingNewClient(false)
    setNewClientData({
      client_type: 'person',
      name: '',
      last_name: '',
      company_number: '',
      address: '',
      zip_code: '',
      city: '',
      email: '',
      phone: ''
    })
    setClientSearch('')
    setShowClientDropdown(false)
    setServiceSearch('')
    setShowServiceDropdown(false)
    setShowTimeFromPicker(false)
    setShowTimeToPicker(false)

    // Subscription-specific
    setRecurrenceType('weekly')
    setDayOfWeek(1)
    setDayOfMonth(1)
    setIntervalValue(1)
    setCurrentStep(1)
  }

  useEffect(() => {
    if (isOpen) {
      fetchServices()
      fetchClients()
      fetchUsers()
      resetForm()
    }
  }, [isOpen])

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.dropdown-container') && !target.closest('[data-time-picker]')) {
        setShowClientDropdown(false)
        setShowServiceDropdown(false)
        setShowUserDropdown(false)
      }
    }

    if (showClientDropdown || showServiceDropdown || showUserDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showClientDropdown, showServiceDropdown, showUserDropdown])

  // Measure dropdown/picker trigger rects for portaling (escape overflow-hidden)
  useLayoutEffect(() => {
    if (!showClientDropdown) {
      setClientDropdownRect(null)
      return
    }
    const el = clientDropdownTriggerRef.current
    const update = () => {
      if (el) setClientDropdownRect(el.getBoundingClientRect())
    }
    update()
    const raf = requestAnimationFrame(() => {
      if (clientDropdownTriggerRef.current) {
        setClientDropdownRect(clientDropdownTriggerRef.current.getBoundingClientRect())
      }
    })
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', update)
    }
  }, [showClientDropdown])
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
  useLayoutEffect(() => {
    if (!showTimeFromPicker || !timeFromPickerTriggerRef.current) {
      setTimeFromPickerRect(null)
      return
    }
    const el = timeFromPickerTriggerRef.current
    const update = () => setTimeFromPickerRect(el.getBoundingClientRect())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [showTimeFromPicker])
  useLayoutEffect(() => {
    if (!showTimeToPicker || !pendingTimeFrom || !timeToPickerTriggerRef.current) {
      setTimeToPickerRect(null)
      return
    }
    const el = timeToPickerTriggerRef.current
    const update = () => setTimeToPickerRect(el.getBoundingClientRect())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [showTimeToPicker, pendingTimeFrom])

  // Handle click outside to close time pickers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-time-from-picker]') && !target.closest('[data-time-to-picker]')) {
        setShowTimeFromPicker(false)
        setShowTimeToPicker(false)
      }
    }

    if (showTimeFromPicker || showTimeToPicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTimeFromPicker, showTimeToPicker])


  const fetchServices = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl('/services'), {
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
      const response = await fetch(apiUrl('/clients'), {
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
      const response = await fetch(apiUrl('/users'), {
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

  const filteredClients = clients.filter(client => {
    const fullName = client.client_type === 'company'
      ? client.name
      : `${client.name}${client.last_name ? ` ${client.last_name}` : ''}`.trim()
    return fullName.toLowerCase().includes(clientSearch.toLowerCase())
  })

  const addService = (service: Service) => {
    if (!selectedServices.find(s => s.id === service.id)) {
      setSelectedServices([...selectedServices, {
        ...service,
        customPrice: service.price.toString(),
        customDuration: service.duration_minutes
      }])
    }
  }

  const addCustomService = () => {
    const title = serviceSearch.trim()
    if (title) {
      const newService: SelectedService = {
        id: Date.now(), // temporary ID
        title: title,
        price: 0,
        duration_minutes: 0,
        customPrice: '0',
        customDuration: 0,
        isCustom: true,
        customTitle: title
      }
      setSelectedServices([...selectedServices, newService])
    }
  }

  const removeService = (serviceId: number) => {
    setSelectedServices(selectedServices.filter(s => s.id !== serviceId))
  }

  const updateService = (serviceId: number, field: 'customPrice' | 'customDuration', value: string | number) => {
    setSelectedServices(selectedServices.map(s =>
      s.id === serviceId ? { ...s, [field]: value } : s
    ))
  }

  const handleSubmitSubscription = async () => {
    const hasValidServices = selectedServices.length > 0
    if (!hasValidServices) {
      return
    }

    // If adding new client, we need to validate the form
    if (isAddingNewClient && !newClientData.name.trim()) {
      return
    }

    // If not adding new client, we need a selected client
    if (!isAddingNewClient && !selectedClient) {
      return
    }

    try {
      setIsSubmitting(true)
      const token = localStorage.getItem('token')

      // Validate required fields before proceeding
      if (!subscriptionTitle.trim()) {
        alert('Please enter a subscription title')
        setIsSubmitting(false)
        return
      }

      if (!selectedClient && !isAddingNewClient) {
        alert('Please select or add a client')
        setIsSubmitting(false)
        return
      }

      if (selectedServices.length === 0) {
        alert('Please select at least one service')
        setIsSubmitting(false)
        return
      }

      if (!jobDate) {
        alert('Please select a starting date')
        setIsSubmitting(false)
        return
      }

      if (!recurrenceType) {
        alert('Please select a recurrence type')
        setIsSubmitting(false)
        return
      }

      if (!intervalValue || intervalValue <= 0) {
        alert('Please enter a valid interval value')
        setIsSubmitting(false)
        return
      }

      let clientId = selectedClient?.id

      // Create new client if in "add new client" mode OR if selectedClient has invalid ID
      if (isAddingNewClient || (selectedClient && (selectedClient.id === -1 || !selectedClient.id))) {
        try {
          const clientResponse = await fetch(apiUrl('/clients'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              client_type: newClientData.client_type || (selectedClient?.client_type || 'person'),
              name: newClientData.name || selectedClient?.name,
              last_name: newClientData.last_name || selectedClient?.last_name || null,
              company_number: newClientData.company_number || selectedClient?.company_number || null,
              address: newClientData.address || selectedClient?.address || null,
              zip_code: newClientData.zip_code || selectedClient?.zip_code || null,
              city: newClientData.city || selectedClient?.city || null,
              email: newClientData.email || selectedClient?.email || null,
              phone: newClientData.phone || selectedClient?.phone || null
            })
          })

          const clientData = await clientResponse.json()

          if (!clientResponse.ok) {
            console.error('Error creating client:', clientData.error)
            alert(`Error creating client: ${clientData.error || 'Unknown error'}`)
            setIsSubmitting(false)
            return
          }

          if (!clientData.client || !clientData.client.id) {
            console.error('Invalid client creation response:', clientData)
            alert('Error: Client was created but invalid response received')
            setIsSubmitting(false)
            return
          }

          clientId = clientData.client.id
          console.log('Client created successfully, ID:', clientId)
        } catch (error) {
          console.error('Error creating client:', error)
          alert(`Error creating client: ${error instanceof Error ? error.message : 'Unknown error'}`)
          setIsSubmitting(false)
          return
        }
      }

      // Validate that we have a valid client ID before proceeding
      if (!clientId || clientId === -1 || (typeof clientId === 'number' && clientId <= 0)) {
        console.error('Invalid client ID:', clientId)
        alert('Error: Invalid client. Please select or create a valid client.')
        setIsSubmitting(false)
        return
      }

      const subscriptionData = {
        title: subscriptionTitle.trim() || 'Subscription',
        client_id: clientId,
        assigned_user_id: selectedUserId || null,
        services: selectedServices.map(service => (
          service.isCustom
            ? {
                custom_title: (service.customTitle && service.customTitle.trim().length > 0) ? service.customTitle : 'Custom task',
                custom_price: parseFloat(service.customPrice) || 0,
                custom_duration: service.customDuration || 0
              }
            : {
          service_id: service.id,
          custom_price: parseFloat(service.customPrice) || service.price,
          custom_duration: service.customDuration
              }
        )),
        starting_date: jobDate ? jobDate.split('T')[0] : null,
        recurrence_type: recurrenceType,
        day_of_week: recurrenceType === 'weekly' ? dayOfWeek : null,
        day_of_month: recurrenceType === 'monthly' ? dayOfMonth : null,
        interval_value: intervalValue,
        scheduled_time_from: jobTimeFrom && jobTimeFrom.trim() !== '' ? jobTimeFrom : null,
        scheduled_time_to: jobTimeTo && jobTimeTo.trim() !== '' ? jobTimeTo : null,
        note: jobNote.trim() || null
      }

      console.log('Submitting subscription data:', subscriptionData)

      const response = await fetch(apiUrl('/subscriptions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(subscriptionData)
      })

      const data = await response.json()

      if (response.ok) {
        console.log('Subscription created successfully:', data)
        setCreatedSubscriptionId(data.subscription.id)
        
        // Call the callback to refresh lists
        if (onSubscriptionCreated) {
          console.log('Calling onSubscriptionCreated callback')
          onSubscriptionCreated()
        }
        
        // Close modal after a brief delay to ensure callback completes
        setTimeout(() => {
          onClose()
        }, 200)
      } else {
        console.error('Error creating subscription:', data.error)
        alert(`Error creating subscription: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error creating subscription:', error)
      alert('Error creating subscription')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
        <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full min-h-[660px] max-h-[98vh] flex flex-col overflow-hidden animate-slideDown transform transition-all duration-300 ease-out">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gradient-to-r from-white to-primary-50/30">
            <div className="space-y-0.5">
              <h2 className="text-2xl font-bold text-primary-800 tracking-tight">Create Subscription</h2>
              <p className="text-sm text-gray-500 font-medium">Set up a recurring job schedule</p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 bg-white rounded-xl flex items-center justify-center hover:bg-gray-50 transition-all duration-200 ease-out shadow-sm border border-gray-200 hover:border-gray-300 hover:shadow-md group"
            >
              <XMarkIcon className="w-5 h-5 text-gray-500 group-hover:text-gray-700 transition-colors" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-white to-gray-50/50">
            {/* Step 1: Client & Services */}
            {currentStep === 1 && (
              <div className="animate-fadeIn space-y-6">
                {/* Title Section */}
                <div>
                  <label className="block text-xs font-semibold text-primary-700 mb-2">Subscription Title *</label>
                  <input
                    type="text"
                    value={subscriptionTitle}
                    onChange={(e) => setSubscriptionTitle(e.target.value)}
                    placeholder="e.g., Weekly Maintenance, Monthly Cleaning..."
                    required
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 ease-out text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                  />
                </div>

                {/* Client Section */}
            <div className="space-y-4">
              {selectedClient ? (
                <div className="space-y-4">
                  {isEditingClient ? (
                    <div className="space-y-4">
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            checked={editingClientData.client_type === 'person'}
                            onChange={() => setEditingClientData({...editingClientData, client_type: 'person'})}
                            className="mr-2"
                          />
                          <span className="text-sm">Private Person</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            checked={editingClientData.client_type === 'company'}
                            onChange={() => setEditingClientData({...editingClientData, client_type: 'company'})}
                            className="mr-2"
                          />
                          <span className="text-sm">Company</span>
                        </label>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Name</label>
                        <input
                          type="text"
                          value={editingClientData.name}
                          onChange={(e) => setEditingClientData({...editingClientData, name: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                        />
                      </div>

                      {editingClientData.client_type === 'person' && (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Last Name</label>
                          <input
                            type="text"
                            value={editingClientData.last_name}
                            onChange={(e) => setEditingClientData({...editingClientData, last_name: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                          />
                        </div>
                      )}

                      {editingClientData.client_type === 'company' && (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Company Number</label>
                          <input
                            type="text"
                            value={editingClientData.company_number}
                            onChange={(e) => setEditingClientData({...editingClientData, company_number: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Address</label>
                        <input
                          type="text"
                          value={editingClientData.address}
                          onChange={(e) => setEditingClientData({...editingClientData, address: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Zip Code</label>
                          <input
                            type="text"
                            value={editingClientData.zip_code}
                            onChange={(e) => setEditingClientData({...editingClientData, zip_code: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">City</label>
                          <input
                            type="text"
                            value={editingClientData.city}
                            onChange={(e) => setEditingClientData({...editingClientData, city: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Email</label>
                        <input
                          type="email"
                          value={editingClientData.email}
                          onChange={(e) => setEditingClientData({...editingClientData, email: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Phone</label>
                        <input
                          type="tel"
                          value={editingClientData.phone}
                          onChange={(e) => setEditingClientData({...editingClientData, phone: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
                        />
                      </div>

                      <button
                        onClick={async () => {
                          try {
                            const response = await fetch(apiUrl('/clients/' + selectedClient.id), {
                              method: 'PUT',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${localStorage.getItem('token')}`
                              },
                              body: JSON.stringify(editingClientData)
                            })
                            if (response.ok) {
                              const data = await response.json()
                              setSelectedClient(data.client)
                              setIsEditingClient(false)
                              // Refresh clients list
                              fetchClients()
                            }
                          } catch (error) {
                            console.error('Error updating client:', error)
                          }
                        }}
                        disabled={!editingClientData.name.trim()}
                        className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 ease-out"
                      >
                        Update Client
                      </button>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {selectedClient.client_type === 'company'
                              ? selectedClient.name
                              : `${selectedClient.name}${selectedClient.last_name ? ` ${selectedClient.last_name}` : ''}`.trim()
                            }
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {selectedClient.address && selectedClient.city
                              ? `${selectedClient.address}, ${selectedClient.city}`
                              : 'No address'
                            }
                          </div>
                          {selectedClient.email && (
                            <div className="text-xs text-gray-500 mt-1">{selectedClient.email}</div>
                          )}
                          {selectedClient.phone && (
                            <div className="text-xs text-gray-500 mt-1">{selectedClient.phone}</div>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={() => {
                              if (!isEditingClient) {
                                setEditingClientData({
                                  client_type: selectedClient.client_type || 'person',
                                  name: selectedClient.name || '',
                                  last_name: selectedClient.last_name || '',
                                  company_number: '',
                                  address: selectedClient.address || '',
                                  zip_code: selectedClient.zip_code || '',
                                  city: selectedClient.city || '',
                                  email: selectedClient.email || '',
                                  phone: selectedClient.phone || ''
                                });
                              }
                              setIsEditingClient(!isEditingClient);
                            }}
                            className="text-xs text-blue-600 hover:text-blue-700 transition-colors duration-150 ease-out"
                          >
                            {isEditingClient ? 'Cancel' : 'Edit'}
                          </button>
                          <button
                            onClick={() => { setSelectedClient(null); setClientSearch(''); setIsEditingClient(false) }}
                            className="text-gray-400 hover:text-gray-600 transition-colors duration-150 ease-out p-1 rounded hover:bg-gray-100"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : isAddingNewClient ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        checked={newClientData.client_type === 'person'}
                        onChange={() => setNewClientData({...newClientData, client_type: 'person'})}
                        className="mr-2"
                      />
                      <span className="text-sm">Private Person</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        checked={newClientData.client_type === 'company'}
                        onChange={() => setNewClientData({...newClientData, client_type: 'company'})}
                        className="mr-2"
                      />
                      <span className="text-sm">Company</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label className="block text-sm font-medium text-gray-900 mb-2">
                        {newClientData.client_type === 'company' ? 'Company Name *' : 'First Name *'}
                      </label>
                      <input
                        type="text"
                        value={newClientData.name}
                        onChange={(e) => setNewClientData({...newClientData, name: e.target.value})}
                        className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
                        placeholder={newClientData.client_type === 'company' ? 'Company name' : 'John'}
                      />
                    </div>
                    {newClientData.client_type === 'person' ? (
                      <div className="group">
                        <label className="block text-sm font-medium text-gray-900 mb-2">Last Name</label>
                        <input
                          type="text"
                          value={newClientData.last_name}
                          onChange={(e) => setNewClientData({...newClientData, last_name: e.target.value})}
                          className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
                          placeholder="Smith"
                        />
                      </div>
                    ) : (
                      <div className="group">
                        <label className="block text-sm font-medium text-gray-900 mb-2">Company Number</label>
                        <input
                          type="text"
                          value={newClientData.company_number}
                          onChange={(e) => setNewClientData({...newClientData, company_number: e.target.value})}
                          className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
                          placeholder="CVR number"
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="group">
                      <label className="block text-sm font-medium text-gray-900 mb-2">Address</label>
                      <input
                        type="text"
                        value={newClientData.address}
                        onChange={(e) => setNewClientData({...newClientData, address: e.target.value})}
                        className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
                        placeholder="Street address"
                      />
                    </div>
                    <div className="group">
                      <label className="block text-sm font-medium text-gray-900 mb-2">Zip</label>
                      <input
                        type="text"
                        value={newClientData.zip_code}
                        onChange={(e) => setNewClientData({...newClientData, zip_code: e.target.value})}
                        className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
                        placeholder="2100"
                      />
                    </div>
                    <div className="group">
                      <label className="block text-sm font-medium text-gray-900 mb-2">City</label>
                      <input
                        type="text"
                        value={newClientData.city}
                        onChange={(e) => setNewClientData({...newClientData, city: e.target.value})}
                        className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
                        placeholder="Copenhagen"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label className="block text-sm font-medium text-gray-900 mb-2">Email</label>
                      <input
                        type="email"
                        value={newClientData.email}
                        onChange={(e) => setNewClientData({...newClientData, email: e.target.value})}
                        className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-400"
                        placeholder="client@example.com"
                      />
                    </div>
                    <div className="group">
                      <label className="block text-sm font-medium text-gray-900 mb-2">Phone</label>
                      <input
                        type="tel"
                        value={newClientData.phone}
                        onChange={(e) => setNewClientData({...newClientData, phone: e.target.value})}
                        className="w-full px-4 py-3 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-500"
                        placeholder="+45 12 34 56 78"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNewClient(false)
                        setNewClientData({
                          client_type: 'person',
                          name: '',
                          last_name: '',
                          company_number: '',
                          address: '',
                          zip_code: '',
                          city: '',
                          email: '',
                          phone: ''
                        })
                      }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (newClientData.name.trim()) {
                          setSelectedClient({
                            id: -1, // temporary ID for new client
                            name: newClientData.name,
                            last_name: newClientData.last_name,
                            client_type: newClientData.client_type
                          })
                          setIsAddingNewClient(false)
                        }
                      }}
                      disabled={!newClientData.name.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Save & Select Client
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative dropdown-container" ref={clientDropdownTriggerRef}>
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={(e) => { setClientSearch(e.target.value); setShowClientDropdown(true) }}
                      onFocus={() => setShowClientDropdown(true)}
                      placeholder="choose a client"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 ease-out text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                    />
                  </div>
                  {typeof document !== 'undefined' && showClientDropdown && clientDropdownRect && createPortal(
                    <div className="dropdown-container bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto animate-slideDown backdrop-blur-sm" style={{ position: 'fixed', top: clientDropdownRect.bottom + 8, left: clientDropdownRect.left, width: clientDropdownRect.width, zIndex: 9999 }}>
                      {filteredClients.length > 0 ? (
                        <>
                          {filteredClients.map((client) => (
                            <button
                              key={client.id}
                              onClick={() => { setSelectedClient(client); setClientSearch(''); setShowClientDropdown(false) }}
                              className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 transition-colors duration-150 ease-out"
                            >
                              <div className="text-sm font-medium text-gray-900">
                                {client.client_type === 'company'
                                  ? client.name
                                  : `${client.name}${client.last_name ? ` ${client.last_name}` : ''}`.trim()}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {client.address ? `${client.address}, ${client.city}` : 'No address'}
                              </div>
                            </button>
                          ))}
                          <button
                            onClick={() => { setIsAddingNewClient(true); setShowClientDropdown(false); setClientSearch('') }}
                            className="w-full px-3 py-2 text-left hover:bg-blue-50 border-t border-gray-200 bg-gray-50 transition-colors duration-150 ease-out sticky bottom-0"
                          >
                            <div className="text-sm font-medium text-blue-600 flex items-center">
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Add new client
                            </div>
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="px-3 py-2 text-sm text-gray-500">No clients found</div>
                          <button
                            onClick={() => { setIsAddingNewClient(true); setShowClientDropdown(false); setClientSearch('') }}
                            className="w-full px-3 py-2 text-left hover:bg-blue-50 border-t border-gray-200 bg-gray-50 transition-colors duration-150 ease-out sticky bottom-0"
                          >
                            <div className="text-sm font-medium text-blue-600 flex items-center">
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Add new client
                            </div>
                          </button>
                        </>
                      )}
                    </div>,
                    document.body
                  )}
                </div>
              )}
            </div>

            {/* Services Section */}
            <div className="space-y-4">
              {!selectedClient && !isAddingNewClient ? (
                <div className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg">
                  Please select or add a client above first
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Service selection */}
                  <div className="relative dropdown-container" ref={serviceDropdownTriggerRef}>
                    <label className="block text-xs font-semibold text-primary-700 mb-2">Services</label>
                    <input
                      type="text"
                      value={serviceSearch}
                      onChange={(e) => { setServiceSearch(e.target.value); setShowServiceDropdown(true) }}
                      onFocus={() => setShowServiceDropdown(true)}
                      placeholder="Search for services..."
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 ease-out text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                    />
                  </div>
                  {typeof document !== 'undefined' && showServiceDropdown && serviceDropdownRect && createPortal(
                    <div className="dropdown-container bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto animate-slideDown backdrop-blur-sm" style={{ position: 'fixed', top: serviceDropdownRect.bottom + 8, left: serviceDropdownRect.left, width: serviceDropdownRect.width, zIndex: 9999 }}>
                      {services.filter(service =>
                        service.title.toLowerCase().includes(serviceSearch.toLowerCase()) &&
                        !selectedServices.find(s => s.id === service.id)
                      ).length > 0 ? (
                        <>
                          {services.filter(service =>
                            service.title.toLowerCase().includes(serviceSearch.toLowerCase()) &&
                            !selectedServices.find(s => s.id === service.id)
                          ).map((service) => (
                            <button
                              key={service.id}
                              onClick={() => addService(service)}
                              className="w-full px-4 py-3 text-left hover:bg-accent-50/50 border-b border-gray-100 transition-all duration-150 ease-out hover:pl-5 first:rounded-t-2xl last:rounded-b-2xl group"
                            >
                              <div className="text-sm font-semibold text-primary-800 group-hover:text-accent-600 transition-colors">{service.title}</div>
                              <div className="text-xs text-gray-500 mt-0.5 font-medium">{service.price} DKK • {service.duration_minutes}min</div>
                            </button>
                          ))}
                          <button
                            onClick={() => {
                              const tempId = -Date.now()
                              setSelectedServices(prev => [
                                ...prev,
                                {
                                  id: tempId,
                                  title: '(custom task)',
                                  price: 0,
                                  duration_minutes: 0,
                                  customPrice: '0',
                                  customDuration: 0,
                                  isCustom: true,
                                  customTitle: ''
                                }
                              ])
                              setEditingTitle(tempId)
                              setShowServiceDropdown(false)
                              setServiceSearch('')
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-blue-50 border-t border-gray-200 bg-gray-50 transition-colors duration-150 ease-out sticky bottom-0"
                          >
                            <div className="text-sm font-medium text-blue-600 flex items-center">
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Add custom task
                            </div>
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="px-3 py-2 text-sm text-gray-500">No services found</div>
                          <button
                            onClick={() => {
                              const tempId = -Date.now()
                              setSelectedServices(prev => [
                                ...prev,
                                {
                                  id: tempId,
                                  title: '(custom task)',
                                  price: 0,
                                  duration_minutes: 0,
                                  customPrice: '0',
                                  customDuration: 0,
                                  isCustom: true,
                                  customTitle: ''
                                }
                              ])
                              setEditingTitle(tempId)
                              setShowServiceDropdown(false)
                              setServiceSearch('')
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-blue-50 border-t border-gray-200 bg-gray-50 transition-colors duration-150 ease-out sticky bottom-0"
                          >
                            <div className="text-sm font-medium text-blue-600 flex items-center">
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Add custom task
                            </div>
                          </button>
                        </>
                      )}
                    </div>,
                    document.body
                  )}

                  {selectedServices.length > 0 && (
                    <div className="space-y-2">
                      {selectedServices.map((service) => (
                        <div key={service.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-white to-accent-50/20 rounded-xl border border-accent-200/30 shadow-sm hover:shadow-md transition-all duration-200 group">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-primary-800">
                              {service.isCustom ? (
                                editingTitle === service.id ? (
                                  <input
                                    type="text"
                                    placeholder="Task title"
                                    defaultValue={service.customTitle || ''}
                                    onBlur={(e) => {
                                      const value = e.target.value.trim()
                                      setSelectedServices(prev =>
                                        prev.map(s => s.id === service.id ? { ...s, customTitle: value, title: value || '(custom task)' } : s)
                                      )
                                      setEditingTitle(null)
                                    }}
                                    onKeyPress={(e) => e.key === 'Enter' && (e.currentTarget.blur())}
                                    className="text-sm text-accent-600 bg-white border-2 border-accent-400 rounded-lg px-2.5 py-1 w-full max-w-[220px] focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
                                    autoFocus
                                  />
                                ) : (
                                  <button onClick={() => setEditingTitle(service.id)} className="text-left text-sm font-semibold text-accent-600 hover:text-accent-700 transition-colors underline decoration-2 underline-offset-2">
                                    {service.customTitle && service.customTitle.trim().length > 0 ? service.customTitle : '(custom task)'}
                                  </button>
                                )
                              ) : (
                                service.title
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-4 ml-4">
                            <div className="flex items-center space-x-2 bg-white/60 px-2.5 py-1 rounded-lg border border-gray-200/50">
                              <span className="text-xs font-medium text-gray-500">Price:</span>
                              {editingPrice === service.id ? (
                                <input
                                  type="number"
                                  defaultValue={service.customPrice}
                                  onBlur={(e) => { updateService(service.id, 'customPrice', e.target.value); setEditingPrice(null) }}
                                  onKeyPress={(e) => e.key === 'Enter' && (e.currentTarget.blur())}
                                  className="text-xs font-semibold text-accent-600 bg-white border-2 border-accent-400 rounded-lg px-2 py-0.5 w-16 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
                                  autoFocus
                                />
                              ) : (
                                <button onClick={() => setEditingPrice(service.id)} className="text-xs font-semibold text-accent-600 hover:text-accent-700 transition-colors underline decoration-1 underline-offset-2">
                                  {service.customPrice}kr.
                                </button>
                              )}
                            </div>
                            <div className="flex items-center space-x-2 bg-white/60 px-2.5 py-1 rounded-lg border border-gray-200/50">
                              <span className="text-xs font-medium text-gray-500">Time:</span>
                              {editingDuration === service.id ? (
                                <input
                                  type="number"
                                  defaultValue={service.customDuration}
                                  onBlur={(e) => { updateService(service.id, 'customDuration', parseInt(e.target.value) || 0); setEditingDuration(null) }}
                                  onKeyPress={(e) => e.key === 'Enter' && (e.currentTarget.blur())}
                                  className="text-xs font-semibold text-accent-600 bg-white border-2 border-accent-400 rounded-lg px-2 py-0.5 w-14 focus:ring-2 focus:ring-accent-500/20 focus:outline-none"
                                  autoFocus
                                />
                              ) : (
                                <button onClick={() => setEditingDuration(service.id)} className="text-xs font-semibold text-accent-600 hover:text-accent-700 transition-colors underline decoration-1 underline-offset-2">
                                  {service.customDuration}min.
                                </button>
                              )}
                            </div>
                            <button 
                              onClick={() => removeService(service.id)} 
                              className="text-gray-400 hover:text-red-600 transition-all duration-200 ease-out p-1.5 rounded-lg hover:bg-red-50 ml-1 group/remove"
                            >
                              <XMarkIcon className="w-4 h-4 group-hover/remove:scale-110 transition-transform" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Assign to User, Time, and Note - moved here */}
                  {selectedServices.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      {/* Assign to User */}
                      <div className="relative dropdown-container" ref={userDropdownTriggerRef}>
                        {selectedUserId ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-accent-50 to-accent-50/50 border border-accent-200/60 rounded-full shadow-sm hover:shadow-md transition-all duration-200 group">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm ring-2 ring-white/50">
                                {users.find(u => u.id === selectedUserId)?.first_name?.[0]}{users.find(u => u.id === selectedUserId)?.last_name?.[0]}
                              </div>
                              <span className="text-sm font-semibold text-primary-800">
                                {users.find(u => u.id === selectedUserId)?.first_name} {users.find(u => u.id === selectedUserId)?.last_name}
                              </span>
                            </div>
                            <button
                              onClick={() => setSelectedUserId(null)}
                              className="ml-1 p-0.5 rounded-full hover:bg-white/80 transition-all duration-150 group-hover:bg-white/60"
                            >
                              <XMarkIcon className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700 transition-colors" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowUserDropdown(!showUserDropdown)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600 hover:text-primary-800 hover:border-accent-300 hover:bg-accent-50/30 shadow-sm hover:shadow-md transition-all duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
                          >
                            <UserIcon className="w-4 h-4 text-gray-400 group-hover:text-accent-500" />
                            <span>Assign employee</span>
                            <PlusIcon className="w-3 h-3 text-gray-400 group-hover:text-accent-500" />
                          </button>
                        )}
                      </div>
                      {typeof document !== 'undefined' && showUserDropdown && !selectedUserId && userDropdownRect && createPortal(
                        <div className="dropdown-container bg-white border border-gray-200 rounded-2xl shadow-2xl min-w-[220px] max-h-60 overflow-y-auto animate-slideDown backdrop-blur-sm" style={{ position: 'fixed', top: userDropdownRect.bottom + 8, left: userDropdownRect.left, zIndex: 9999 }}>
                          {users.map((user) => (
                            <button
                              key={user.id}
                              onClick={() => {
                                setSelectedUserId(user.id)
                                setShowUserDropdown(false)
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-accent-50/50 transition-all duration-150 ease-out flex items-center gap-3 group first:rounded-t-2xl last:rounded-b-2xl hover:pl-5"
                            >
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm group-hover:shadow-md group-hover:scale-110 transition-all ring-2 ring-white/50">
                                {user.first_name?.[0]}{user.last_name?.[0]}
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-primary-800 group-hover:text-accent-600 transition-colors">
                                  {user.first_name} {user.last_name}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>,
                        document.body
                      )}

                      {/* Time field */}
                      <div className="relative">
                        {jobTimeFrom || jobTimeTo ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-accent-50 to-accent-50/50 border border-accent-200/60 rounded-full shadow-sm hover:shadow-md transition-all duration-200 group">
                            <div className="flex items-center gap-2">
                              <ClockIcon className="w-4 h-4 text-accent-600" />
                              <span className="text-sm font-semibold text-primary-800">
                                {jobTimeFrom && jobTimeTo ? `${jobTimeFrom} - ${jobTimeTo}`
                                : jobTimeFrom ? jobTimeFrom
                                : jobTimeTo ? jobTimeTo
                                : ''}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setJobTimeFrom('')
                                setJobTimeTo('')
                              }}
                              className="ml-1 p-0.5 rounded-full hover:bg-white/80 transition-all duration-150 group-hover:bg-white/60"
                            >
                              <XMarkIcon className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700 transition-colors" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setPendingTimeFrom(jobTimeFrom)
                              setPendingTimeTo(jobTimeTo)
                              setIsTimeRangeMode(!!jobTimeTo)
                              setShowTimeFromPicker(false)
                              setShowTimeToPicker(false)
                              setShowTimeModal(true)
                            }}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600 hover:text-primary-800 hover:border-accent-300 hover:bg-accent-50/30 shadow-sm hover:shadow-md transition-all duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
                          >
                            <ClockIcon className="w-4 h-4 text-gray-400 group-hover:text-accent-500" />
                            <span>Add time</span>
                            <PlusIcon className="w-3 h-3 text-gray-400 group-hover:text-accent-500" />
                          </button>
                        )}
                      </div>

                      {/* Note field */}
                      <div className="relative">
                        {jobNote.trim() ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-accent-50 to-accent-50/50 border border-accent-200/60 rounded-full shadow-sm hover:shadow-md transition-all duration-200 max-w-xs group">
                            <div className="flex items-center gap-2 min-w-0">
                              <DocumentTextIcon className="w-4 h-4 text-accent-600 flex-shrink-0" />
                              <span className="text-sm font-semibold text-primary-800 truncate">
                                {jobNote.length > 20 ? `${jobNote.substring(0, 20)}...` : jobNote}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setJobNote('')
                                setShowNoteInput(false)
                              }}
                              className="ml-1 p-0.5 rounded-full hover:bg-white/80 transition-all duration-150 group-hover:bg-white/60 flex-shrink-0"
                            >
                              <XMarkIcon className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700 transition-colors" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShowNoteInput(true)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600 hover:text-primary-800 hover:border-accent-300 hover:bg-accent-50/30 shadow-sm hover:shadow-md transition-all duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
                          >
                            <DocumentTextIcon className="w-4 h-4 text-gray-400 group-hover:text-accent-500" />
                            <span>Add note</span>
                            <PlusIcon className="w-3 h-3 text-gray-400 group-hover:text-accent-500" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

                {/* Step 1 Navigation */}
                <div className="flex justify-end pt-6 border-t border-gray-100">
                  <button
                    onClick={() => setCurrentStep(2)}
                    disabled={!selectedClient || selectedServices.length === 0}
                    className="px-8 py-3 bg-accent-500 text-white text-sm font-semibold rounded-xl hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 ease-out shadow-lg shadow-accent-500/20 hover:shadow-xl hover:shadow-accent-500/30 hover:scale-[1.02] active:scale-[0.98] transform"
                  >
                    Go to date settings →
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Schedule & Recurring Settings */}
            {currentStep === 2 && (
              <div className="animate-fadeIn space-y-6">
                {/* Recurring Settings Section */}
                <div className="space-y-4">

              {!selectedClient && !isAddingNewClient ? (
                <div className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg">
                  Please select or add a client above first
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Recurrence Type */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Recurrence Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRecurrenceType('weekly')}
                        className={`px-4 py-2.5 text-sm font-semibold rounded-xl border transition-all duration-200 ${
                          recurrenceType === 'weekly'
                            ? 'bg-accent-500 border-accent-500 text-white shadow-lg shadow-accent-500/20'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-accent-50/30 hover:border-accent-200'
                        }`}
                      >
                        Weekly
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecurrenceType('monthly')}
                        className={`px-4 py-2.5 text-sm font-semibold rounded-xl border transition-all duration-200 ${
                          recurrenceType === 'monthly'
                            ? 'bg-accent-500 border-accent-500 text-white shadow-lg shadow-accent-500/20'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-accent-50/30 hover:border-accent-200'
                        }`}
                      >
                        Monthly
                      </button>
                    </div>
                  </div>

                  {/* Weekly Settings */}
                  {recurrenceType === 'weekly' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Day of Week</label>
                        <select
                          value={dayOfWeek}
                          onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 ease-out text-sm bg-white"
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
                      <div>
                        <label className="block text-xs font-semibold text-primary-700 mb-2">Every X Weeks</label>
                        <input
                          type="number"
                          min="1"
                          max="52"
                          value={intervalValue}
                          onChange={(e) => setIntervalValue(parseInt(e.target.value) || 1)}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 ease-out text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                          placeholder="1"
                        />
                      </div>
                    </div>
                  )}

                  {/* Monthly Settings */}
                  {recurrenceType === 'monthly' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-primary-700 mb-2">Day of Month</label>
                        <select
                          value={dayOfMonth}
                          onChange={(e) => setDayOfMonth(parseInt(e.target.value))}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 ease-out text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                        >
                          {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                            <option key={day} value={day}>
                              {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-primary-700 mb-2">Every X Months</label>
                        <input
                          type="number"
                          min="1"
                          max="12"
                          value={intervalValue}
                          onChange={(e) => setIntervalValue(parseInt(e.target.value) || 1)}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 ease-out text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                          placeholder="1"
                        />
                      </div>
                    </div>
                  )}

                  {/* Starting Date */}
                  <div>
                    <label className="block text-xs font-semibold text-primary-700 mb-2">Starting Date *</label>
                    <input
                      type="date"
                      value={jobDate}
                      onChange={(e) => setJobDate(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 ease-out text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                    />
                  </div>

                  {/* Preview */}
                  <div className="bg-gradient-to-br from-accent-50/50 to-white rounded-2xl p-5 border-2 border-accent-200/30 shadow-lg">
                    <div className="text-xs font-bold text-accent-600 mb-3 uppercase tracking-wider">Preview</div>
                    <div className="space-y-2">
                      <div className="text-base font-bold text-primary-800">
                        {recurrenceType === 'weekly'
                          ? `Repeats every ${intervalValue} week${intervalValue > 1 ? 's' : ''} on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]}`
                          : `Repeats every ${intervalValue} month${intervalValue > 1 ? 's' : ''} on the ${dayOfMonth}${dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th'}`
                        }
                      </div>
                      {jobDate ? (
                        <div className="text-sm font-semibold text-primary-600 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-accent-500"></div>
                          Starting on {new Date(jobDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400 italic">
                          Select a starting date above
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
                </div>

                {/* Step 2 Navigation */}
                <div className="flex justify-between items-center pt-6 border-t border-gray-100">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-6 py-3 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 border border-gray-200 hover:border-gray-300 transition-all duration-200 ease-out hover:shadow-sm"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitSubscription}
                    disabled={isSubmitting || !jobDate || !selectedClient || selectedServices.length === 0 || !recurrenceType || intervalValue <= 0}
                    className="px-8 py-3 bg-accent-500 text-white text-sm font-semibold rounded-xl hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 ease-out shadow-lg shadow-accent-500/20 hover:shadow-xl hover:shadow-accent-500/30 hover:scale-[1.02] active:scale-[0.98] transform"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Creating...
                      </span>
                    ) : (
                      'Save Subscription'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Success Message */}
          {createdSubscriptionId && (
            <div className="text-center space-y-3 py-6 animate-fadeIn">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircleIcon className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Subscription Created!</h3>
                <p className="text-sm text-gray-600">The recurring job schedule has been set up successfully.</p>
              </div>
            </div>
          )}
        </div>

        {/* Time Modal */}
        <ConfirmModal
          isOpen={showTimeModal}
          onClose={() => setShowTimeModal(false)}
          onConfirm={() => {
            setJobTimeFrom(pendingTimeFrom)
            setJobTimeTo(isTimeRangeMode ? pendingTimeTo : '')
            setShowTimeModal(false)
          }}
          title="Set Time"
          description="Set the scheduled time for this subscription"
          confirmLabel="Save Time"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsTimeRangeMode(false)}
                className={`px-4 py-2.5 text-sm font-semibold rounded-xl border transition-all duration-200 ${
                  !isTimeRangeMode
                    ? 'bg-accent-500 border-accent-500 text-white shadow-lg shadow-accent-500/20'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-accent-50/30 hover:border-accent-200'
                }`}
              >
                Single Time
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsTimeRangeMode(true)
                  if (!pendingTimeTo && pendingTimeFrom) setPendingTimeTo(pendingTimeFrom)
                }}
                className={`px-4 py-2.5 text-sm font-semibold rounded-xl border transition-all duration-200 ${
                  isTimeRangeMode
                    ? 'bg-accent-500 border-accent-500 text-white shadow-lg shadow-accent-500/20'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-accent-50/30 hover:border-accent-200'
                }`}
              >
                Time Range
              </button>
            </div>
            <div className="relative" data-time-from-picker ref={timeFromPickerTriggerRef}>
              <label className="block text-xs font-semibold text-primary-700 mb-2">
                {isTimeRangeMode ? 'Start Time' : 'Select Time'}
              </label>
              <input
                type="time"
                value={pendingTimeFrom}
                onChange={(e) => setPendingTimeFrom(e.target.value)}
                onFocus={() => setShowTimeFromPicker(true)}
                onClick={() => setShowTimeFromPicker(true)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 ease-out text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300"
                placeholder="Select or type time"
              />
            </div>
            {typeof document !== 'undefined' && showTimeFromPicker && timeFromPickerRect && createPortal(
              <div className="dropdown-container max-h-64 overflow-y-auto border border-gray-200 rounded-xl p-3 bg-white shadow-2xl animate-slideDown" style={{ position: 'fixed', top: timeFromPickerRect.bottom + 8, left: timeFromPickerRect.left, width: timeFromPickerRect.width, zIndex: 9999 }} data-time-picker>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 48 }, (_, i) => {
                    const hours = Math.floor(i / 2)
                    const minutes = (i % 2) * 30
                    const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
                    const displayTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
                    const isSelected = pendingTimeFrom === timeString
                    return (
                      <button
                        key={timeString}
                        type="button"
                        onClick={() => {
                          setPendingTimeFrom(timeString)
                          setShowTimeFromPicker(false)
                        }}
                        className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                          isSelected
                            ? 'bg-accent-500 text-white shadow-md shadow-accent-500/30 scale-105 ring-2 ring-accent-300'
                            : 'bg-white text-gray-700 hover:bg-accent-50 hover:border-accent-200 border border-gray-200 hover:scale-105'
                        }`}
                      >
                        {displayTime}
                      </button>
                    )
                  })}
                </div>
              </div>,
              document.body
            )}
            {isTimeRangeMode && (
              <div className="relative" data-time-to-picker ref={timeToPickerTriggerRef}>
                <label className="block text-xs font-semibold text-primary-700 mb-2">End Time</label>
                <input
                  type="time"
                  value={pendingTimeTo}
                  onChange={(e) => setPendingTimeTo(e.target.value)}
                  onFocus={() => pendingTimeFrom && setShowTimeToPicker(true)}
                  onClick={() => pendingTimeFrom && setShowTimeToPicker(true)}
                  disabled={!pendingTimeFrom}
                  className={`w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 ease-out text-sm bg-white shadow-sm hover:shadow-md hover:border-gray-300 ${
                    !pendingTimeFrom ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  placeholder={pendingTimeFrom ? "Select or type time" : "Select start time first"}
                />
              </div>
            )}
            {typeof document !== 'undefined' && showTimeToPicker && pendingTimeFrom && timeToPickerRect && createPortal(
              <div className="dropdown-container max-h-64 overflow-y-auto border border-gray-200 rounded-xl p-3 bg-white shadow-2xl animate-slideDown" style={{ position: 'fixed', top: timeToPickerRect.bottom + 8, left: timeToPickerRect.left, width: timeToPickerRect.width, zIndex: 9999 }} data-time-picker>
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 48 }, (_, i) => {
                    const hours = Math.floor(i / 2)
                    const minutes = (i % 2) * 30
                    const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
                    const displayTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
                    const isSelected = pendingTimeTo === timeString
                    const isDisabled = timeString <= pendingTimeFrom
                    const isFromTime = timeString === pendingTimeFrom
                    return (
                      <button
                        key={timeString}
                        type="button"
                        onClick={() => {
                          if (!isDisabled) {
                            setPendingTimeTo(timeString)
                            setShowTimeToPicker(false)
                          }
                        }}
                        disabled={isDisabled}
                        className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                          isSelected
                            ? 'bg-accent-500 text-white shadow-md shadow-accent-500/30 scale-105 ring-2 ring-accent-300'
                            : isFromTime
                            ? 'bg-accent-100 border-2 border-accent-400 text-accent-700 font-bold'
                            : isDisabled
                            ? 'bg-gray-50 text-gray-300 cursor-not-allowed opacity-40'
                            : 'bg-white text-gray-700 hover:bg-accent-50 hover:border-accent-200 border border-gray-200 hover:scale-105'
                        }`}
                      >
                        {displayTime}
                      </button>
                    )
                  })}
                </div>
              </div>,
              document.body
            )}
          </div>
        </ConfirmModal>

        {/* Note Modal */}
        <ConfirmModal
          isOpen={showNoteInput}
          onClose={() => setShowNoteInput(false)}
          onConfirm={() => {
            setShowNoteInput(false)
          }}
          title="Add Note"
          description="Add a note to this subscription"
          confirmLabel="Save Note"
          enableNotification={false}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-primary-700 mb-2">Note</label>
              <textarea
                value={jobNote}
                onChange={(e) => setJobNote(e.target.value)}
                placeholder="Enter a note for this subscription..."
                rows={5}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all duration-200 text-sm resize-none bg-white shadow-sm hover:shadow-md hover:border-gray-300"
              />
            </div>
          </div>
        </ConfirmModal>
      </div>
    </>
  )
}