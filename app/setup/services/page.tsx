'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'

interface Service {
  id?: number
  title: string
  price: string
  duration_hours: string
  duration_minutes: string
}

export default function ServicesSetupPage() {
  const [services, setServices] = useState<Service[]>([])
  const [showForm, setShowForm] = useState(false)
  const [currentService, setCurrentService] = useState<Service>({
    title: '',
    price: '',
    duration_hours: '',
    duration_minutes: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setCurrentService(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleAddService = () => {
    setShowForm(true)
    setError('')
  }

  const handleSubmitService = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')
    
    try {
      const token = localStorage.getItem('token')
      
      // Convert hours and minutes to total minutes
      const totalMinutes = (parseInt(currentService.duration_hours) || 0) * 60 + (parseInt(currentService.duration_minutes) || 0)
      
      const serviceData = {
        title: currentService.title,
        price: currentService.price,
        duration_minutes: totalMinutes
      }
      
      const response = await fetch(apiUrl('/services'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(serviceData)
      })
      
      const data = await response.json()
      
      if (response.ok) {
        // Add service to local list
        setServices(prev => [...prev, { ...currentService, id: data.service.id }])
        
        // Reset form
        setCurrentService({
          title: '',
          price: '',
          duration_hours: '',
          duration_minutes: ''
        })
        setShowForm(false)
      } else {
        setError(data.error || 'Failed to create service')
      }
    } catch (error) {
      setError('Network error: Failed to create service')
      console.error('Service creation error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleContinue = () => {
    router.push('/setup/clients')
  }

  const handleCancel = () => {
    setShowForm(false)
    setCurrentService({
      title: '',
      price: '',
      duration_hours: '',
      duration_minutes: ''
    })
    setError('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="grid grid-cols-5 gap-16 items-start">
          {/* Left Column - Text (40%) */}
          <div className="col-span-2 pt-4">
            <div className="space-y-6">
              <div>
                <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 mb-4">
                  Step 2 of 3
                </div>
                <h1 className="text-3xl font-semibold text-gray-900 mb-4 tracking-tight">
                  Add your services
                </h1>
                <p className="text-base text-gray-600 leading-relaxed">
                  Create templates for your services. These are standard values that can be customized for each client later.
                </p>
              </div>
              
              <div className="space-y-3 pt-4">
                <div className="flex items-center space-x-3 text-sm text-gray-500">
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
                  <span>Company Information</span>
                </div>
                <div className="flex items-center space-x-3 text-sm text-gray-500">
                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                  <span>Services</span>
                </div>
                <div className="flex items-center space-x-3 text-sm text-gray-400">
                  <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
                  <span>Preferences</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Form (60%) */}
          <div className="col-span-3">
            <div className="bg-white/70 backdrop-blur-sm border border-gray-200/60 rounded-2xl p-8 shadow-xl shadow-gray-900/5">
              
              {/* Services List */}
              {services.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Your Services</h3>
                  <div className="space-y-2">
                    {services.map((service, index) => {
                      // Convert minutes back to hours and minutes for display
                      const totalMinutes = parseInt(service.duration_minutes) || 0
                      const hours = Math.floor(totalMinutes / 60)
                      const minutes = totalMinutes % 60
                      const durationText = hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`
                      
                      return (
                        <div key={service.id || index} className="flex items-center justify-between bg-gray-50/80 rounded-lg p-3">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">{service.title}</div>
                            <div className="text-xs text-gray-500">
                              {service.price} DKK • {durationText}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Add Service Form */}
              {showForm ? (
                <form onSubmit={handleSubmitService} className="space-y-5 animate-in slide-in-from-bottom-4 duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-900">Add Service</h3>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="text-gray-400 hover:text-gray-600 text-sm"
                    >
                      Cancel
                    </button>
                  </div>

                  {error && (
                    <div className="bg-red-50/80 border border-red-200/60 rounded-xl p-4 backdrop-blur-sm">
                      <p className="text-red-600 text-sm font-medium">{error}</p>
                    </div>
                  )}

                  {/* Service Title */}
                  <div className="group">
                    <label htmlFor="title" className="block text-sm font-medium text-gray-900 mb-2">
                      Service title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="title"
                      name="title"
                      value={currentService.title}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
                      placeholder="e.g. Window Cleaning"
                    />
                  </div>

                  {/* Price */}
                  <div className="group">
                    <label htmlFor="price" className="block text-sm font-medium text-gray-900 mb-2">
                      Price (DKK) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      id="price"
                      name="price"
                      value={currentService.price}
                      onChange={handleInputChange}
                      required
                      min="0"
                      step="0.01"
                      className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
                      placeholder="e.g. 150"
                    />
                  </div>

                  {/* Duration - Hours and Minutes */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="group">
                      <label htmlFor="duration_hours" className="block text-sm font-medium text-gray-900 mb-2">
                        Hours <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        id="duration_hours"
                        name="duration_hours"
                        value={currentService.duration_hours}
                        onChange={handleInputChange}
                        required
                        min="0"
                        className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
                        placeholder="e.g. 1"
                      />
                    </div>
                    <div className="group">
                      <label htmlFor="duration_minutes" className="block text-sm font-medium text-gray-900 mb-2">
                        Minutes <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        id="duration_minutes"
                        name="duration_minutes"
                        value={currentService.duration_minutes}
                        onChange={handleInputChange}
                        required
                        min="0"
                        max="59"
                        className="w-full px-4 py-3 text-sm bg-white/80 border border-gray-200/80 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400 hover:border-gray-300"
                        placeholder="e.g. 30"
                      />
                    </div>
                  </div>

                  {/* Note about customization */}
                  <div className="bg-blue-50/80 border border-blue-200/60 rounded-xl p-4 backdrop-blur-sm">
                    <p className="text-blue-700 text-xs">
                      <span className="font-medium">Note:</span> These are standard values that can be customized for each client later.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:shadow-blue-500/25"
                  >
                      {isSubmitting ? (
                        <span className="flex items-center justify-center space-x-2">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          <span>Adding Service...</span>
                        </span>
                      ) : (
                        'Add Service'
                      )}
                  </button>
                </form>
              ) : (
                <div className="text-center">
                  <button
                    onClick={handleAddService}
                    className="inline-flex items-center space-x-2 bg-white/80 border border-gray-200/80 rounded-xl px-6 py-4 text-sm font-medium text-gray-900 hover:bg-white hover:border-gray-300 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    <PlusIcon className="w-5 h-5" />
                    <span>Add a service</span>
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-8 pt-6 border-t border-gray-200/60">
                <div className="flex flex-col sm:flex-row gap-3">
                  {services.length > 0 && !showForm ? (
                    <button
                      onClick={handleContinue}
                      className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 transition-all duration-200 shadow-lg hover:shadow-xl hover:shadow-blue-500/25"
                    >
                      Continue to Dashboard
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleContinue}
                        className="flex-1 bg-gray-100 text-gray-700 py-3 px-6 rounded-xl text-sm font-semibold hover:bg-gray-200 focus:ring-2 focus:ring-gray-500/20 focus:ring-offset-2 transition-all duration-200"
                      >
                        Skip Services
                      </button>
                      <button
                        onClick={handleContinue}
                        className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 transition-all duration-200 shadow-lg hover:shadow-xl hover:shadow-blue-500/25"
                      >
                        Continue to Dashboard
                      </button>
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  You can add services later from your dashboard
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
