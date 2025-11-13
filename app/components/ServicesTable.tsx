'use client'

import { useMemo, useState } from 'react'
import EditServiceModal from './EditServiceModal'
import { apiUrl } from '../utils/api'

interface Service {
  id: number
  title: string
  price: number
  duration_minutes: number
  created_at: string
}

interface ServicesTableProps {
  services: Service[]
  searchTerm: string
  onServiceUpdated?: () => void
}

const formatDate = (dateString: string) => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const formatDuration = (minutes: number) => {
  if (typeof minutes !== 'number' || isNaN(minutes)) return '-'
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

const formatPrice = (price: number | string) => {
  // Convert to number if it's a string
  const numPrice = typeof price === 'string' ? parseFloat(price) : price
  if (isNaN(numPrice) || numPrice == null) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'DKK' // Changed to DKK since that's what we're using in the form
  }).format(numPrice)
}

export default function ServicesTable({ services, searchTerm, onServiceUpdated }: ServicesTableProps) {
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [deletingServiceId, setDeletingServiceId] = useState<number | null>(null)
  const filteredServices = useMemo(() => {
    if (!searchTerm) {
      return services
    }
    const lowercasedSearchTerm = searchTerm.toLowerCase()
    return services.filter(service =>
      service.title.toLowerCase().includes(lowercasedSearchTerm)
    )
  }, [services, searchTerm])

  const handleEditService = (service: Service) => {
    setEditingService(service)
    setIsEditModalOpen(true)
  }

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false)
    setEditingService(null)
  }

  const handleServiceUpdated = () => {
    if (onServiceUpdated) {
      onServiceUpdated()
    }
  }

  const handleDeleteService = async (serviceId: number) => {
    if (!confirm('Are you sure you want to delete this service? This action cannot be undone.')) {
      return
    }

    setDeletingServiceId(serviceId)
    
    try {
      const token = localStorage.getItem('token')
      
      const response = await fetch(apiUrl(`/services/${serviceId}`), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.ok) {
        if (onServiceUpdated) {
          onServiceUpdated()
        }
      } else {
        const data = await response.json()
        alert(`Failed to delete service: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Delete service error:', error)
      alert('Network error: Failed to delete service')
    } finally {
      setDeletingServiceId(null)
    }
  }

  if (filteredServices.length === 0 && searchTerm) {
    return (
      <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="mx-auto h-12 w-12 text-gray-400">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No services found</h3>
        <p className="mt-1 text-sm text-gray-500">
          We couldn't find any services matching "{searchTerm}".
        </p>
      </div>
    )
  }

  if (services.length === 0 && !searchTerm) {
    return (
      <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="mx-auto h-12 w-12 text-gray-400">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No services yet</h3>
        <p className="mt-1 text-sm text-gray-500">
          Get started by adding your first service.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Service
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Price
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Duration
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Created
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {filteredServices.map((service) => (
            <tr key={service.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {service.title}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {formatPrice(service.price)}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {formatDuration(service.duration_minutes)}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDate(service.created_at)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <div className="flex space-x-2">
                  <button 
                    onClick={() => handleEditService(service)}
                    className="text-blue-600 hover:text-blue-900 transition-colors"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => handleDeleteService(service.id)}
                    disabled={deletingServiceId === service.id}
                    className="text-red-600 hover:text-red-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingServiceId === service.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* Edit Service Modal */}
      <EditServiceModal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        onServiceUpdated={handleServiceUpdated}
        service={editingService}
      />
    </div>
  )
}
