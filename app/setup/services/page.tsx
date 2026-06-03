'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon } from '@heroicons/react/24/outline'
import { apiUrl } from '../../utils/api'
import { formatMoney, getCountryRule } from '../../config/countryRules'
import { useCompanyCountryCode } from '../../hooks/useCompanyCountryCode'
import SetupWizardLayout, {
  setupFieldInputClass,
  setupFieldLabelClass,
} from '@/app/components/setup/SetupWizardLayout'
import SetupWizardHint from '@/app/components/setup/SetupWizardHint'

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
  const companyCountryCode = useCompanyCountryCode()
  const priceCurrency = getCountryRule(companyCountryCode).defaultCurrency
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

  const handleContinue = async () => {
    const { advanceOnboardingProgress, patchSessionOnboardingStep } =
      await import('../../utils/onboardingClient')
    await advanceOnboardingProgress('clients')
    patchSessionOnboardingStep('clients')
    router.push('/setup/clients')
  }

  const handleBack = () => {
    router.push('/setup/company')
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

  const inputCls = setupFieldInputClass
  const labelCls = setupFieldLabelClass

  return (
    <SetupWizardLayout
      step={2}
      title="Add your services"
      description="Create templates for your services. You can customise pricing and duration per client later."
      onBack={handleBack}
    >
      <div className="relative z-10">
        {/* Instruction — always at top when not in form, or when form with no services yet */}
        {!showForm && (
          <SetupWizardHint showArrow={services.length === 0}>
            {services.length === 0
              ? 'Click the button below and add your service information.'
              : 'Add another service using the button below.'}
          </SetupWizardHint>
        )}

        {/* Saved services — directly under the instruction */}
        {services.length > 0 && (
          <div className="relative z-[1] mb-4 space-y-2">
            {services.map((service, index) => {
              const hours = parseInt(service.duration_hours) || 0
              const mins = parseInt(service.duration_minutes) || 0
              const durationText = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`
              return (
                <div
                  key={service.id || index}
                  className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">{service.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {formatMoney(Number(service.price) || 0, companyCountryCode)} · {durationText}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Add-service form or add button — below services */}
        {showForm ? (
        <form onSubmit={handleSubmitService} className="space-y-5 animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">New service</p>
            <button type="button" onClick={handleCancel} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
              Cancel
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="title" className={labelCls}>Service title <span className="text-red-500">*</span></label>
            <input type="text" id="title" name="title" value={currentService.title} onChange={handleInputChange} required className={inputCls} placeholder="e.g. Window Cleaning" />
          </div>

          <div>
            <label htmlFor="price" className={labelCls}>Price ({priceCurrency}) <span className="text-red-500">*</span></label>
            <input type="number" id="price" name="price" value={currentService.price} onChange={handleInputChange} required min="0" step="0.01" className={inputCls} placeholder="e.g. 150" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="duration_hours" className={labelCls}>Hours <span className="text-red-500">*</span></label>
              <input type="number" id="duration_hours" name="duration_hours" value={currentService.duration_hours} onChange={handleInputChange} required min="0" className={inputCls} placeholder="0" />
            </div>
            <div>
              <label htmlFor="duration_minutes" className={labelCls}>Minutes <span className="text-red-500">*</span></label>
              <input type="number" id="duration_minutes" name="duration_minutes" value={currentService.duration_minutes} onChange={handleInputChange} required min="0" max="59" className={inputCls} placeholder="30" />
            </div>
          </div>

          <div className="rounded-xl border border-accent-200/80 bg-accent-50 px-4 py-3">
            <p className="text-accent-800 text-xs">Pricing and duration can be customised per client later.</p>
          </div>

          <button type="submit" disabled={isSubmitting} className="w-full bg-accent-500 hover:bg-accent-400 text-white py-3.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 shadow-lg shadow-accent-500/25">
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Adding…
              </span>
            ) : 'Save service'}
          </button>
        </form>
        ) : (
          <button
            type="button"
            onClick={handleAddService}
            className="relative z-20 flex w-full items-center justify-center gap-2.5 bg-gray-50 border border-dashed border-gray-200 rounded-xl px-6 py-5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:border-gray-300 hover:bg-white transition-all"
          >
            <PlusIcon className="w-4 h-4" />
            Add a service
          </button>
        )}

        {/* Continue */}
        {!showForm && (
        <div className="mt-8 pt-6 border-t border-gray-100">
          <button
            type="button"
            onClick={handleContinue}
            disabled={services.length === 0}
            className={`w-full py-3.5 px-6 rounded-xl text-sm font-semibold transition-all ${
              services.length === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-accent-500 hover:bg-accent-600 text-white shadow-lg shadow-accent-500/20'
            }`}
          >
            {services.length === 0 ? 'Add at least one service to continue' : 'Continue →'}
          </button>
        </div>
        )}
      </div>
    </SetupWizardLayout>
  )
}
