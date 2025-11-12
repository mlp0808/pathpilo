'use client'

import { useState } from 'react'
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline'

interface Service {
  title: string
  price: string
  duration_hours: string
  duration_minutes: string
}

interface AddServiceModalProps {
  isOpen: boolean
  onClose: () => void
  onServiceAdded: () => void
}

export default function AddServiceModal({ isOpen, onClose, onServiceAdded }: AddServiceModalProps) {
  const [currentService, setCurrentService] = useState<Service>({
    title: '',
    price: '',
    duration_hours: '',
    duration_minutes: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setCurrentService(prev => ({
      ...prev,
      [name]: value
    }))
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
      
      const response = await fetch('http://localhost:3002/api/services', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(serviceData)
      })
      
      const data = await response.json()
      
      if (response.ok) {
        // Reset form
        setCurrentService({
          title: '',
          price: '',
          duration_hours: '',
          duration_minutes: ''
        })
        setError('')
        onServiceAdded()
        onClose()
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

  const handleCancel = () => {
    setCurrentService({
      title: '',
      price: '',
      duration_hours: '',
      duration_minutes: ''
    })
    setError('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Add Service</h2>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmitService} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-600 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Service Title */}
          <div>
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
              className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
              placeholder="e.g. Window Cleaning"
            />
          </div>

          {/* Price */}
          <div>
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
              className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
              placeholder="e.g. 150"
            />
          </div>

          {/* Duration - Hours and Minutes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
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
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                placeholder="e.g. 1"
              />
            </div>
            <div>
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
                className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 placeholder-gray-400"
                placeholder="e.g. 30"
              />
            </div>
          </div>

          {/* Note about customization */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-700 text-xs">
              <span className="font-medium">Note:</span> These are standard values that can be customized for each client later.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 bg-gray-100 text-gray-700 py-3 px-6 rounded-lg text-sm font-semibold hover:bg-gray-200 focus:ring-2 focus:ring-gray-500/20 focus:ring-offset-2 transition-all duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-lg text-sm font-semibold hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500/20 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:shadow-blue-500/25"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Adding...</span>
                </span>
              ) : (
                'Add Service'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}




