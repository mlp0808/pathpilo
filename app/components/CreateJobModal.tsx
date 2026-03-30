'use client'

import { useState, useEffect } from 'react'
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useUser } from '../hooks/useUser'
import { apiUrl } from '../utils/api'
import { formatMoney } from '../config/countryRules'
import { useCompanyCountryCode } from '../hooks/useCompanyCountryCode'
import { useAppI18n } from './I18nProvider'

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

interface CreateJobModalProps {
  isOpen: boolean
  onClose: () => void
  onJobCreated?: () => void
  clientId: number
  clientName: string
}

export default function CreateJobModal({ isOpen, onClose, onJobCreated, clientId, clientName }: CreateJobModalProps) {
  const { t } = useAppI18n()
  const { user } = useUser()
  const companyCountryCode = useCompanyCountryCode(user)
  const [createdJobId, setCreatedJobId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [services, setServices] = useState<Service[]>([])
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showServiceDropdown, setShowServiceDropdown] = useState(false)
  const [jobDate, setJobDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loadingServices, setLoadingServices] = useState(false)

  // Fetch services when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchServices()
      // Set default date to today
      const today = new Date().toISOString().split('T')[0]
      setJobDate(today)
    } else {
      // Reset form when modal closes
      setTitle('')
      setSelectedServices([])
      setSearchTerm('')
      setShowServiceDropdown(false)
      setJobDate('')
      setError('')
      setCreatedJobId(null)
    }
  }, [isOpen])

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
        setServices(data.services)
      } else {
        setError(t('app.jobs.create.errLoadServices'))
      }
    } catch (error) {
      setError(t('app.jobs.create.errNetworkLoadServices'))
      console.error('Services fetch error:', error)
    } finally {
      setLoadingServices(false)
    }
  }

  const filteredServices = services.filter(service =>
    service.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
    !selectedServices.some(selected => selected.id === service.id)
  )

  const handleServiceSelect = (service: Service) => {
    const selectedService: SelectedService = {
      ...service,
      customPrice: service.price,
      customDuration: service.duration_minutes
    }
    setSelectedServices(prev => [...prev, selectedService])
    setSearchTerm('')
    setShowServiceDropdown(false)
  }

  const handleServicePriceChange = (serviceId: number, newPrice: number) => {
    setSelectedServices(prev => 
      prev.map(service => 
        service.id === serviceId 
          ? { ...service, customPrice: newPrice }
          : service
      )
    )
  }

  const handleServiceDurationChange = (serviceId: number, newDuration: number) => {
    setSelectedServices(prev => 
      prev.map(service => 
        service.id === serviceId 
          ? { ...service, customDuration: newDuration }
          : service
      )
    )
  }

  const handleRemoveService = (serviceId: number) => {
    setSelectedServices(prev => prev.filter(service => service.id !== serviceId))
  }

  const formatDuration = (minutes: number) => {
    if (typeof minutes !== 'number' || isNaN(minutes)) return '0min'
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    let durationString = ''
    if (hours > 0) {
      durationString += `${hours}h `
    }
    if (remainingMinutes > 0 || hours === 0) {
      durationString += `${remainingMinutes}min`
    }
    return durationString.trim()
  }

  const formatPrice = (price: number) => {
    if (typeof price !== 'number' || isNaN(price)) return formatMoney(0, companyCountryCode)
    return formatMoney(price, companyCountryCode)
  }

  const handleSubmitJob = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim()) {
      setError(t('app.jobs.create.errTitleRequired'))
      return
    }
    
    if (selectedServices.length === 0) {
      setError(t('app.jobs.create.errServiceRequired'))
      return
    }
    
    if (!jobDate) {
      setError(t('app.jobs.create.errDateRequired'))
      return
    }

    setIsSubmitting(true)
    setError('')
    
    try {
      const token = localStorage.getItem('token')
      
      const jobData = {
        title: title.trim(),
        client_id: clientId,
        services: selectedServices.map(service => ({
          service_id: service.id,
          custom_price: service.customPrice,
          custom_duration: service.customDuration
        })),
        scheduled_date: jobDate
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
        // Don't close modal yet - let user add notes first
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

  const handleCancel = () => {
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t('app.jobs.create.title')}</h2>
            <p className="text-sm text-gray-600 mt-1">{t('app.jobs.create.forClient').replace('{{name}}', clientName)}</p>
          </div>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmitJob} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-600 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Title Field */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-900 mb-2">
              {t('app.jobs.create.jobTitle')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
              placeholder={t('app.jobs.create.jobTitlePlaceholder')}
            />
          </div>

          {/* Add Service Field */}
          <div className="relative">
            <label htmlFor="service-search" className="block text-sm font-medium text-gray-900 mb-2">
              {t('app.jobs.create.addService')}
            </label>
            <div className="relative">
              <input
                type="text"
                id="service-search"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setShowServiceDropdown(true)
                }}
                onFocus={() => setShowServiceDropdown(true)}
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                placeholder={t('app.jobs.create.searchPlaceholder')}
                disabled={loadingServices}
              />
              {loadingServices && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>

            {/* Service Dropdown */}
            {showServiceDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filteredServices.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500">
                    {searchTerm ? t('app.jobs.create.noServicesSearch') : t('app.jobs.create.noServicesEmpty')}
                  </div>
                ) : (
                  filteredServices.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => handleServiceSelect(service)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 focus:outline-none focus:bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{service.title}</div>
                          <div className="text-xs text-gray-500">
                            {formatPrice(service.price)} • {formatDuration(service.duration_minutes)}
                          </div>
                        </div>
                        <PlusIcon className="w-4 h-4 text-blue-600" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selected Services */}
          {selectedServices.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                {t('app.jobs.create.selectedServices')}
              </label>
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
                          <span className="text-xs text-gray-600">Price:</span>
                          <input
                            type="number"
                            value={service.customPrice || service.price}
                            onChange={(e) => handleServicePriceChange(service.id, parseFloat(e.target.value) || 0)}
                            min="0"
                            step="0.01"
                            className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
                            placeholder="0.00"
                          />
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-600">{t('app.jobs.create.time')}</span>
                          <input
                            type="number"
                            value={service.customDuration || service.duration_minutes}
                            onChange={(e) => handleServiceDurationChange(service.id, parseInt(e.target.value) || 0)}
                            min="0"
                            className="w-16 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
                            placeholder="0"
                          />
                        </div>
                        
                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveService(service.id)}
                          className="text-red-600 hover:text-red-800 transition-colors ml-2"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}



          {/* Date Field */}
          <div>
            <label htmlFor="job-date" className="block text-sm font-medium text-gray-900 mb-2">
              Job Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              id="job-date"
              value={jobDate}
              onChange={(e) => setJobDate(e.target.value)}
              required
              className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 bg-gray-100 text-gray-700 py-3 px-6 rounded-lg text-sm font-semibold hover:bg-gray-200 focus:ring-2 focus:ring-gray-500/20 focus:ring-offset-2 transition-all duration-200"
            >
              {t('app.jobs.create.cancel')}
            </button>
            {createdJobId ? (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gradient-to-r from-green-600 to-green-700 text-white py-3 px-6 rounded-lg text-sm font-semibold hover:from-green-700 hover:to-green-800 focus:ring-2 focus:ring-green-500/20 focus:ring-offset-2 transition-all duration-200 shadow-lg hover:shadow-xl hover:shadow-green-500/25"
              >
                {t('app.jobs.create.done')}
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting || selectedServices.length === 0}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-lg text-sm font-semibold hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:shadow-blue-500/25"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>{t('app.jobs.create.creating')}</span>
                  </span>
                ) : (
                  t('app.jobs.create.createJob')
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
