'use client'

import { useMemo, useState, useEffect } from 'react'

const MAX_INVOICE_TITLE_LEN = 30

interface CreateInvoiceModalProps {
  selectedJobs: Set<number>
  completedJobs: any[]
  createInvoiceData: any
  setCreateInvoiceData: (data: any) => void
  onClose: () => void
  onCreateInvoice: (data: any) => void
}

type ViewStyle = 'jobs' | 'tasks' | 'jobs-with-tasks'

export default function CreateInvoiceModal({
  selectedJobs,
  completedJobs,
  createInvoiceData,
  setCreateInvoiceData,
  onClose,
  onCreateInvoice
}: CreateInvoiceModalProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1)
  const [viewStyle, setViewStyle] = useState<ViewStyle>('jobs')
  const [isSummaryOpen, setIsSummaryOpen] = useState(false)

  const formatMoney = (amount: number) => {
    const safe = Number.isFinite(amount) ? amount : 0
    return `${createInvoiceData.currency} ${safe.toFixed(2)}`
  }

  const selectedJobData = useMemo(() => {
    return Array.from(selectedJobs)
      .map(jobId => completedJobs.find(j => j.id === jobId))
      .filter(Boolean) as any[]
  }, [selectedJobs, completedJobs])

  // Default invoice title: "Invoice" (max 30 chars)
  const defaultInvoiceTitle = 'Invoice'

  useEffect(() => {
    setCreateInvoiceData((prev: any) => ({
      ...prev,
      title: prev.title != null && prev.title !== '' ? prev.title : defaultInvoiceTitle
    }))
  }, [defaultInvoiceTitle])

  const invoiceTitleValue = (createInvoiceData.title ?? defaultInvoiceTitle).slice(0, MAX_INVOICE_TITLE_LEN)

  const subtotal = useMemo(() => {
    const discounts = createInvoiceData.discounts || {}

    if (viewStyle === 'tasks') {
      let sum = 0
      for (const job of selectedJobData) {
        const services = job?.services || []
        for (let i = 0; i < services.length; i++) {
          const service = services[i]
          const unitPrice = parseFloat(service?.custom_price ?? service?.price ?? 0) || 0
          const key = `task:${job.id}:${service?.service_id ?? service?.id ?? i}`
          const discount = parseFloat(discounts[key] ?? 0) || 0
          sum += Math.max(0, unitPrice - discount)
        }
      }
      return sum
    }

    // jobs + jobs-with-tasks: discount per job row
    return selectedJobData.reduce((sum, job) => {
      const discount = parseFloat(discounts[job.id] ?? 0) || 0
      return sum + Math.max(0, (job.total_price || 0) - discount)
    }, 0)
  }, [createInvoiceData.discounts, selectedJobData, viewStyle])

  const taxAmount = useMemo(() => {
    const rate = parseFloat(createInvoiceData.tax_rate) || 0
    return subtotal * (rate / 100)
  }, [createInvoiceData.tax_rate, subtotal])

  const total = useMemo(() => subtotal + taxAmount, [subtotal, taxAmount])

  const handleDiscountChange = (key: string, discount: number) => {
    setCreateInvoiceData((prev: any) => ({
      ...prev,
      discounts: {
        ...prev.discounts,
        [key]: Math.max(0, discount)
      }
    }))
  }

  const renderJobRows = () => {
    if (viewStyle === 'jobs') {
      return selectedJobData.map(job => {
        const discount = parseFloat(createInvoiceData.discounts?.[job.id] ?? 0) || 0
        const finalPrice = Math.max(0, (job.total_price || 0) - discount)

        return (
          <div key={job.id} className="grid grid-cols-[1fr_140px_120px] gap-4 items-start py-4">
            <div className="min-w-0">
              <div className="font-medium text-gray-900 truncate">{job.title || 'Untitled Job'}</div>
              <div className="text-sm text-gray-500 truncate">
                {job.services && job.services.length > 0
                  ? job.services.map((service: any) => service.title || service.custom_title || 'Service').join(', ')
                  : 'No services'
                }
              </div>
            </div>

            <div>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={createInvoiceData.discounts?.[job.id] ?? ''}
                onChange={(e) => handleDiscountChange(String(job.id), parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="text-right">
              <div className="text-sm font-semibold text-gray-900">{formatMoney(finalPrice)}</div>
              {discount > 0 && <div className="text-xs text-red-600">- {formatMoney(discount)}</div>}
            </div>
          </div>
        )
      })
    }

    if (viewStyle === 'tasks') {
      const rows: any[] = []

      selectedJobData.forEach((job: any) => {
        const services = job?.services || []
        services.forEach((service: any, idx: number) => {
          const unitPrice = parseFloat(service?.custom_price ?? service?.price ?? 0) || 0
          const key = `task:${job.id}:${service?.service_id ?? service?.id ?? idx}`
          const discount = parseFloat(createInvoiceData.discounts?.[key] ?? 0) || 0
          const finalPrice = Math.max(0, unitPrice - discount)

          rows.push(
            <div key={key} className="grid grid-cols-[1fr_140px_120px] gap-4 items-start py-4">
              <div className="min-w-0">
                <div className="font-medium text-gray-900 truncate">{service?.title || service?.custom_title || 'Service'}</div>
                <div className="text-sm text-gray-500 truncate">From: {job.title || 'Untitled Job'}</div>
              </div>

              <div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={createInvoiceData.discounts?.[key] ?? ''}
                  onChange={(e) => handleDiscountChange(key, parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">{formatMoney(finalPrice)}</div>
                {discount > 0 && <div className="text-xs text-red-600">- {formatMoney(discount)}</div>}
              </div>
            </div>
          )
        })
      })

      if (rows.length === 0) {
        return <div className="py-12 text-center text-sm text-gray-500">No tasks found on the selected jobs.</div>
      }

      return rows
    }

    if (viewStyle === 'jobs-with-tasks') {
      return selectedJobData.map(job => {
        const discount = parseFloat(createInvoiceData.discounts?.[job.id] ?? 0) || 0
        const finalPrice = Math.max(0, (job.total_price || 0) - discount)

        return (
          <div key={job.id} className="py-4">
            <div className="grid grid-cols-[1fr_140px_120px] gap-4 items-start">
              <div className="min-w-0">
                <div className="font-medium text-gray-900 truncate">{job.title || 'Untitled Job'}</div>
                <div className="text-sm text-gray-500">Includes:</div>
              </div>

              <div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={createInvoiceData.discounts?.[job.id] ?? ''}
                  onChange={(e) => handleDiscountChange(String(job.id), parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">{formatMoney(finalPrice)}</div>
                {discount > 0 && <div className="text-xs text-red-600">- {formatMoney(discount)}</div>}
              </div>
            </div>

            {job.services && job.services.length > 0 && (
              <div className="mt-2 ml-2 border-l border-gray-200 pl-3 space-y-1">
                {job.services.map((service: any, index: number) => (
                  <div key={index} className="text-sm text-gray-600 truncate">
                    {service.title || service.custom_title || 'Service'}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })
    }

    return null
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center justify-center sm:p-4 animate-backdrop-in">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl max-w-4xl w-full max-h-[92vh] sm:max-h-[90vh] sm:min-h-[70vh] overflow-hidden flex pb-safe animate-sheet-in-bottom sm:animate-pop">
        {/* Step Indicator */}
        <div className="w-16 bg-gray-50 border-r border-gray-200 flex flex-col items-center py-6">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium mb-2 ${
            currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
          }`}>
            1
          </div>
          <div className={`w-0.5 h-8 mb-2 ${
            currentStep >= 2 ? 'bg-blue-600' : 'bg-gray-200'
          }`}></div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            currentStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
          }`}>
            2
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden relative">
          {/* Step 1: Invoice Settings */}
          <div className={`absolute inset-0 transition-transform duration-300 ${
            currentStep === 1 ? 'translate-x-0' : '-translate-x-full'
          } flex flex-col`}>
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">Create Invoice</h3>
                  <p className="text-sm text-gray-600 mt-1">Step 1: Invoice Settings</p>
                </div>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 p-6 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Invoice title <span className="text-gray-500 font-normal">(max {MAX_INVOICE_TITLE_LEN} characters)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={MAX_INVOICE_TITLE_LEN}
                    value={invoiceTitleValue}
                    onChange={(e) => setCreateInvoiceData((prev: any) => ({ ...prev, title: e.target.value.slice(0, MAX_INVOICE_TITLE_LEN) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g. job name or [Job 1] + [Job 2]"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {invoiceTitleValue.length}/{MAX_INVOICE_TITLE_LEN}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    value={createInvoiceData.issue_date}
                    onChange={(e) => setCreateInvoiceData((prev: any) => ({ ...prev, issue_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={createInvoiceData.due_date}
                    onChange={(e) => setCreateInvoiceData((prev: any) => ({ ...prev, due_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Currency
                  </label>
                  <select
                    value={createInvoiceData.currency}
                    onChange={(e) => setCreateInvoiceData((prev: any) => ({ ...prev, currency: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="DKK">DKK (Danish Krone)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="USD">USD (US Dollar)</option>
                    <option value="GBP">GBP (British Pound)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tax Rate (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={createInvoiceData.tax_rate}
                    onChange={(e) => setCreateInvoiceData((prev: any) => ({ ...prev, tax_rate: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Terms
                </label>
                <input
                  type="text"
                  value={createInvoiceData.payment_terms}
                  onChange={(e) => setCreateInvoiceData((prev: any) => ({ ...prev, payment_terms: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Payment due within 30 days"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={createInvoiceData.notes}
                  onChange={(e) => setCreateInvoiceData((prev: any) => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Additional notes for the invoice..."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Next: Review Items
              </button>
            </div>
          </div>

          {/* Step 2: Review and Discounts */}
          <div className={`absolute inset-0 transition-transform duration-300 ${
            currentStep === 2 ? 'translate-x-0' : 'translate-x-full'
          } flex flex-col`}>
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="text-center">
                  <h3 className="text-xl font-semibold text-gray-900">Review Invoice</h3>
                  <p className="text-sm text-gray-600 mt-1">Step 2: Review Items & Apply Discounts</p>
                </div>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col bg-gray-50">
              {/* View Style Selector */}
              <div className="px-6 py-4 border-b border-gray-200 bg-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">Line item view</h4>
                    <p className="text-xs text-gray-600">Choose how to group invoice items</p>
                  </div>
                  <div className="bg-gray-100 p-1 rounded-lg flex gap-1">
                    <button
                      onClick={() => setViewStyle('jobs')}
                      className={`px-3 py-2 text-sm rounded-md transition-colors ${
                        viewStyle === 'jobs'
                          ? 'bg-white shadow-sm text-gray-900'
                          : 'text-gray-700 hover:text-gray-900'
                      }`}
                    >
                      Jobs
                    </button>
                    <button
                      onClick={() => setViewStyle('tasks')}
                      className={`px-3 py-2 text-sm rounded-md transition-colors ${
                        viewStyle === 'tasks'
                          ? 'bg-white shadow-sm text-gray-900'
                          : 'text-gray-700 hover:text-gray-900'
                      }`}
                    >
                      Tasks
                    </button>
                    <button
                      onClick={() => setViewStyle('jobs-with-tasks')}
                      className={`px-3 py-2 text-sm rounded-md transition-colors ${
                        viewStyle === 'jobs-with-tasks'
                          ? 'bg-white shadow-sm text-gray-900'
                          : 'text-gray-700 hover:text-gray-900'
                      }`}
                    >
                      Jobs + tasks
                    </button>
                  </div>
                </div>
              </div>

              {/* Main Content Area (single column) */}
              <div className="flex-1 overflow-hidden p-6">
                <div className="h-full flex flex-col gap-4">
                  {/* Items table */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col min-h-0">
                    <div className="px-5 py-4 border-b border-gray-200">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-base font-semibold text-gray-900">Invoice items</div>
                          <div className="text-sm text-gray-500">
                            {Array.from(selectedJobs).length} selected job{Array.from(selectedJobs).length !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsSummaryOpen(v => !v)}
                          className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          {isSummaryOpen ? 'Hide summary' : 'Show summary'}
                        </button>
                      </div>
                    </div>

                    <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                      <div className="grid grid-cols-[1fr_140px_120px] gap-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        <div>Description</div>
                        <div className="text-right">Discount</div>
                        <div className="text-right">Amount</div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-5 divide-y divide-gray-100">
                      {renderJobRows()}
                    </div>
                  </div>

                  {/* Collapsible summary panel */}
                  {isSummaryOpen && (
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-200">
                        <div className="text-base font-semibold text-gray-900">Summary</div>
                        <div className="text-sm text-gray-500">Totals update as you add discounts</div>
                      </div>

                      <div className="p-5 space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Subtotal</span>
                            <span className="font-medium text-gray-900">{formatMoney(subtotal)}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Tax ({parseFloat(createInvoiceData.tax_rate) || 0}%)</span>
                            <span className="font-medium text-gray-900">{formatMoney(taxAmount)}</span>
                          </div>
                          <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-900">Total</span>
                            <span className="text-lg font-bold text-gray-900">{formatMoney(total)}</span>
                          </div>
                        </div>

                        <div className="border-t border-gray-200 pt-4">
                          <div className="text-sm font-semibold text-gray-900 mb-2">Details</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-gray-600">Issue date</span>
                              <span className="text-gray-900">{createInvoiceData.issue_date}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-gray-600">Due date</span>
                              <span className="text-gray-900">{createInvoiceData.due_date}</span>
                            </div>
                            {createInvoiceData.payment_terms && (
                              <div className="sm:col-span-2">
                                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Payment terms</div>
                                <div className="text-gray-900">{createInvoiceData.payment_terms}</div>
                              </div>
                            )}
                            {createInvoiceData.notes && (
                              <div className="sm:col-span-2">
                                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Notes</div>
                                <div className="text-gray-900 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-lg p-3">
                                  {createInvoiceData.notes}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end space-x-3">
              <button
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => onCreateInvoice(createInvoiceData)}
                disabled={selectedJobs.size === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Create Invoice
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
