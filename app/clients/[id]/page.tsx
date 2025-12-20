'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '../../components/AppLayout'
import EditClientModal from '../../components/EditClientModal'
import CreateJobSlideout from '../../components/CreateJobSlideout'
import JobViewSlideout from '../../components/JobViewSlideout'
import SubscriptionSlideout from '../../components/SubscriptionSlideout'
import CreateInvoiceModal from '../../components/CreateInvoiceModal'
import SendInvoiceModal from '../../components/SendInvoiceModal'
import { apiUrl } from '../../utils/api'

interface Client {
  id: number
  first_name: string
  last_name: string
  country: string
  personal_address: string
  personal_zip_code: string
  personal_city: string
  personal_email: string
  personal_phone: string
  billing_address: string | null
  billing_zip_code: string | null
  billing_city: string | null
  billing_email: string | null
  billing_phone: string | null
  created_at: string
  updated_at: string
}

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const clientId = params.id as string
  
  const [client, setClient] = useState<Client | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'jobs' | 'subscriptions' | 'invoicing' | 'reporting'>('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isEditClientModalOpen, setIsEditClientModalOpen] = useState(false)
  const [isCreateJobModalOpen, setIsCreateJobModalOpen] = useState(false)
  const [isEditJobModalOpen, setIsEditJobModalOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [isCreateSubscriptionModalOpen, setIsCreateSubscriptionModalOpen] = useState(false)
  const [isEditSubscriptionModalOpen, setIsEditSubscriptionModalOpen] = useState(false)
  const [editingSubscription, setEditingSubscription] = useState<any>(null)
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false)
  const [completedJobs, setCompletedJobs] = useState<any[]>([])
  const [completedJobsLoading, setCompletedJobsLoading] = useState(false)
  const [invoices, setInvoices] = useState<any[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [selectedJobs, setSelectedJobs] = useState<Set<number>>(new Set())
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)
  const [openInvoiceMenuId, setOpenInvoiceMenuId] = useState<number | null>(null)
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<number | null>(null)
  const [deleteJobAction, setDeleteJobAction] = useState<'restore' | 'delete_jobs'>('restore')
  const [sendInvoiceId, setSendInvoiceId] = useState<number | null>(null)
  const [sendInvoiceDefaultSubject, setSendInvoiceDefaultSubject] = useState('')
  const [sendInvoiceDefaultMessage, setSendInvoiceDefaultMessage] = useState('')
  const [sendingInvoice, setSendingInvoice] = useState(false)
  const [createInvoiceData, setCreateInvoiceData] = useState({
    issue_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
    tax_rate: 25,
    currency: 'DKK',
    notes: '',
    payment_terms: 'Payment due within 30 days',
    discounts: {} as { [key: string]: number } // job_id -> discount amount
  })

  useEffect(() => {
    if (clientId) {
      fetchClient()
    }
  }, [clientId])

  const fetchClient = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      
      const response = await fetch(apiUrl(`/clients/${clientId}`), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setClient(data.client)
      } else {
        setError(data.error || 'Failed to fetch client')
      }
    } catch (error) {
      setError('Network error: Failed to fetch client')
      console.error('Client fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleClientUpdated = () => {
    fetchClient() // Refresh client data
  }

  const fetchJobs = async () => {
    if (!clientId) return
    
    try {
      setJobsLoading(true)
      const token = localStorage.getItem('token')
      
      const response = await fetch(apiUrl(`/clients/${clientId}/jobs`), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setJobs(data.jobs)
      } else {
        console.error('Failed to fetch jobs:', data.error)
      }
    } catch (error) {
      console.error('Network error: Failed to fetch jobs', error)
    } finally {
      setJobsLoading(false)
    }
  }

  const handleJobCreated = () => {
    console.log('Job created successfully')
    fetchJobs() // Refresh the jobs list
  }

  const handleJobClick = (job: any) => {
    setEditingJob(job)
    setIsEditJobModalOpen(true)
  }

  const fetchSubscriptions = async () => {
    if (!clientId) return
    
    try {
      setSubscriptionsLoading(true)
      const token = localStorage.getItem('token')
      
      const response = await fetch(apiUrl(`/clients/${clientId}/subscriptions`), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setSubscriptions(data.subscriptions || [])
      } else {
        console.error('Failed to fetch subscriptions:', data.error)
      }
    } catch (error) {
      console.error('Network error: Failed to fetch subscriptions', error)
    } finally {
      setSubscriptionsLoading(false)
    }
  }

  const handleSubscriptionCreated = () => {
    fetchSubscriptions()
  }

  const handleSubscriptionClick = (subscription: any) => {
    setEditingSubscription(subscription)
    setIsEditSubscriptionModalOpen(true)
  }

  const handleDeleteSubscription = async (subscriptionId: number) => {
    if (!confirm('Are you sure you want to delete this subscription?')) return

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/subscriptions/${subscriptionId}`), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        fetchSubscriptions()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to delete subscription')
      }
    } catch (error) {
      console.error('Error deleting subscription:', error)
      alert('Failed to delete subscription')
    }
  }

  const fetchCompletedJobs = async () => {
    if (!clientId) return

    try {
      setCompletedJobsLoading(true)
      const token = localStorage.getItem('token')

      const response = await fetch(apiUrl(`/clients/${clientId}/jobs`), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (response.ok) {
        // Filter only completed jobs that have services assigned
        const completed = data.jobs.filter((job: any) =>
          job.status === 'completed' &&
          job.services &&
          job.services.length > 0 &&
          !job.invoice_id // hide jobs already connected to an invoice
        )
        setCompletedJobs(completed)
      } else {
        console.error('Failed to fetch completed jobs:', data.error)
      }
    } catch (error) {
      console.error('Network error: Failed to fetch completed jobs', error)
    } finally {
      setCompletedJobsLoading(false)
    }
  }

  const fetchInvoices = async () => {
    if (!clientId) return

    try {
      setInvoicesLoading(true)
      const token = localStorage.getItem('token')

      const response = await fetch(apiUrl(`/clients/${clientId}/invoices`), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (response.ok) {
        setInvoices(data.invoices || [])
      } else {
        console.error('Failed to fetch invoices:', data.error)
      }
    } catch (error) {
      console.error('Network error: Failed to fetch invoices', error)
    } finally {
      setInvoicesLoading(false)
    }
  }

  const downloadInvoicePdf = async (invoiceId: number, invoiceNumber?: string) => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/invoices/${invoiceId}/pdf`), {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        alert(data.error || 'Failed to download PDF')
        return
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${invoiceNumber || invoiceId}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Download PDF failed:', e)
      alert('Failed to download PDF')
    }
  }

  const markInvoiceSentExternal = async (invoiceId: number) => {
    if (!confirm('Mark this invoice as sent? This will lock it from editing/deleting.')) return
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/invoices/${invoiceId}/status`), {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'sent' })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        alert(data.error || 'Failed to mark as sent')
        return
      }
      await fetchInvoices()
      await fetchCompletedJobs()
    } catch (e) {
      console.error('Mark sent failed:', e)
      alert('Failed to mark as sent')
    }
  }

  const openSendInvoice = async (invoice: any) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl('/email-templates'), {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json().catch(() => ({}))
      const tpl = data?.templates?.send_invoice || { subject: '', message: '' }
      setSendInvoiceDefaultSubject(tpl.subject || `Invoice ${invoice.invoice_number}`)
      setSendInvoiceDefaultMessage(tpl.message || '')
      setSendInvoiceId(invoice.id)
    } catch (e) {
      console.error('Failed to load email template:', e)
      setSendInvoiceDefaultSubject(`Invoice ${invoice.invoice_number}`)
      setSendInvoiceDefaultMessage('')
      setSendInvoiceId(invoice.id)
    }
  }

  const sendInvoiceEmail = async (payload: { subject: string; message: string }) => {
    if (!sendInvoiceId) return
    try {
      setSendingInvoice(true)
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/invoices/${sendInvoiceId}/send-email`), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        alert(data.error || 'Failed to send invoice')
        return
      }
      setSendInvoiceId(null)
      await fetchInvoices()
      await fetchCompletedJobs()
      alert('Invoice sent!')
    } catch (e) {
      console.error('Send invoice failed:', e)
      alert('Failed to send invoice')
    } finally {
      setSendingInvoice(false)
    }
  }

  const deleteInvoice = async () => {
    if (!deleteInvoiceId) return
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/invoices/${deleteInvoiceId}`), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jobAction: deleteJobAction })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        alert(data.error || 'Failed to delete invoice')
        return
      }
      setDeleteInvoiceId(null)
      await fetchInvoices()
      await fetchCompletedJobs()
    } catch (e) {
      console.error('Delete invoice failed:', e)
      alert('Failed to delete invoice')
    }
  }

  const handleJobSelection = (jobId: number) => {
    const newSelection = new Set(selectedJobs)
    if (newSelection.has(jobId)) {
      newSelection.delete(jobId)
    } else {
      newSelection.add(jobId)
    }
    setSelectedJobs(newSelection)
  }

  const handleCreateInvoice = async (invoiceData: any) => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(apiUrl(`/clients/${clientId}/invoices`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          job_ids: Array.from(selectedJobs),
          ...invoiceData
        })
      })

      const data = await response.json()

      if (response.ok) {
        setSelectedJobs(new Set())
        setShowCreateInvoice(false)
        fetchInvoices()
        fetchCompletedJobs() // Refresh to show which jobs are now invoiced
      } else {
        alert(data.error || 'Failed to create invoice')
      }
    } catch (error) {
      console.error('Error creating invoice:', error)
      alert('Failed to create invoice')
    }
  }

  // Fetch jobs when switching to jobs tab
  useEffect(() => {
    if (activeTab === 'jobs' && clientId) {
      fetchJobs()
    }
  }, [activeTab, clientId])

  // Fetch subscriptions when switching to subscriptions tab
  useEffect(() => {
    if (activeTab === 'subscriptions' && clientId) {
      fetchSubscriptions()
    }
  }, [activeTab, clientId])

  // Fetch completed jobs and invoices when switching to invoicing tab
  useEffect(() => {
    if (activeTab === 'invoicing' && clientId) {
      fetchCompletedJobs()
      fetchInvoices()
    }
  }, [activeTab, clientId])

  const formatDate = (dateString: string) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDateCompact = (dateString: string) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    const isYesterday = date.toDateString() === new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString()
    
    if (isToday) {
      return `Today ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
    } else if (isYesterday) {
      return `Yesterday ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading client...</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (error || !client) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 text-red-400">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Error</h3>
            <p className="mt-1 text-sm text-gray-500">{error || 'Client not found'}</p>
            <div className="mt-6">
              <button
                onClick={() => router.back()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  const tabs = [
    { id: 'overview', name: 'Overview', icon: '👤' },
    { id: 'jobs', name: 'Jobs', icon: '🔧' },
    { id: 'subscriptions', name: 'Subscriptions', icon: '🔄' },
    { id: 'invoicing', name: 'Invoicing', icon: '💰' },
    { id: 'reporting', name: 'Reporting', icon: '📊' }
  ] as const

  return (
    <AppLayout>
      <div>
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.back()}
                className="flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Clients
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                {client.first_name} {client.last_name}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Client since {formatDate(client.created_at)}
              </p>
            </div>
            
            <button
              onClick={() => setIsEditClientModalOpen(true)}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Client
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {activeTab === 'overview' && (
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Client Information</h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Personal Information */}
                <div>
                  <h3 className="text-md font-medium text-gray-900 mb-4">Personal Information</h3>
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Name</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {client.first_name} {client.last_name}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Country</dt>
                      <dd className="mt-1 text-sm text-gray-900">{client.country || '-'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Address</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {client.personal_address || '-'}
                        {client.personal_zip_code && `, ${client.personal_zip_code}`}
                        {client.personal_city && `, ${client.personal_city}`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Email</dt>
                      <dd className="mt-1 text-sm text-gray-900">{client.personal_email || '-'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Phone</dt>
                      <dd className="mt-1 text-sm text-gray-900">{client.personal_phone || '-'}</dd>
                    </div>
                  </dl>
                </div>

                {/* Billing Information */}
                <div>
                  <h3 className="text-md font-medium text-gray-900 mb-4">Billing Information</h3>
                  {client.billing_address || client.billing_email || client.billing_phone ? (
                    <dl className="space-y-3">
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Billing Address</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {client.billing_address || '-'}
                          {client.billing_zip_code && `, ${client.billing_zip_code}`}
                          {client.billing_city && `, ${client.billing_city}`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Billing Email</dt>
                        <dd className="mt-1 text-sm text-gray-900">{client.billing_email || '-'}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Billing Phone</dt>
                        <dd className="mt-1 text-sm text-gray-900">{client.billing_phone || '-'}</dd>
                      </div>
                    </dl>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="mt-2 text-sm">No separate billing information</p>
                      <p className="text-xs text-gray-400">Using personal information for billing</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Created</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDate(client.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                    <dd className="mt-1 text-sm text-gray-900">{formatDate(client.updated_at)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          {activeTab === 'jobs' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Jobs</h2>
                  <p className="text-sm text-gray-600">
                    {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} for {client.first_name} {client.last_name}
                  </p>
                </div>
                <button
                  onClick={() => setIsCreateJobModalOpen(true)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Job
                </button>
              </div>

              {jobsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-gray-600">Loading jobs...</p>
                  </div>
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-12">
                  <div className="mx-auto h-12 w-12 text-gray-400">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No jobs yet</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Get started by creating your first job for {client.first_name} {client.last_name}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                    <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Job Title
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Scheduled Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Services
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Duration
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Price
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {jobs.map((job) => (
                        <tr 
                          key={job.id} 
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => handleJobClick(job)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                            #{job.id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{job.title}</div>
                              {job.note && (
                                <div className="text-sm text-gray-500 mt-1 max-w-xs truncate">
                                  {job.note}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDateCompact(job.scheduled_date)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">
                              {job.services.length} service{job.services.length !== 1 ? 's' : ''}
                            </div>
                            <div className="text-xs text-gray-500 mt-1 max-w-xs">
                              {job.services.map((service: any, index: number) => (
                                <span key={service.id}>
                                  {service.service_title}
                                  {index < job.services.length - 1 ? ', ' : ''}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {Math.floor((job.total_duration || 0) / 60)}h {(job.total_duration || 0) % 60}m
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'DKK' }).format(job.total_price || 0)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              job.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                              job.status === 'in-progress' ? 'bg-yellow-100 text-yellow-800' :
                              job.status === 'completed' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {job.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation()
                                handleJobClick(job)
                              }}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'subscriptions' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Subscriptions</h2>
                  <p className="text-sm text-gray-600">
                    {subscriptions.length} {subscriptions.length === 1 ? 'subscription' : 'subscriptions'} for {client.first_name} {client.last_name}
                  </p>
                </div>
                <button
                  onClick={() => setIsCreateSubscriptionModalOpen(true)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Subscription
                </button>
              </div>

              {subscriptionsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-gray-600">Loading subscriptions...</p>
                  </div>
                </div>
              ) : subscriptions.length === 0 ? (
                <div className="text-center py-12">
                  <div className="mx-auto h-12 w-12 text-gray-400">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No subscriptions yet</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Create recurring subscriptions for {client.first_name} {client.last_name}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                    <table className="min-w-full divide-y divide-gray-300">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Title
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Schedule
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Employee
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Services
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {subscriptions.map((subscription) => {
                          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                          const scheduleText = `${dayNames[subscription.day_of_week]}, every ${subscription.interval_weeks} week${subscription.interval_weeks > 1 ? 's' : ''}`
                          
                          return (
                            <tr 
                              key={subscription.id} 
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() => handleSubscriptionClick(subscription)}
                            >
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">{subscription.title}</div>
                                  {subscription.note && (
                                    <div className="text-sm text-gray-500 mt-1 max-w-xs truncate">
                                      {subscription.note}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <div>{scheduleText}</div>
                                {subscription.scheduled_time_from && (
                                  <div className="text-xs text-gray-500">
                                    {subscription.scheduled_time_from}
                                    {subscription.scheduled_time_to && ` - ${subscription.scheduled_time_to}`}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {subscription.assigned_user_first_name 
                                  ? `${subscription.assigned_user_first_name} ${subscription.assigned_user_last_name}`
                                  : 'No employee'
                                }
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-sm text-gray-900">
                                  {subscription.service_count || 0} service{(subscription.service_count || 0) !== 1 ? 's' : ''}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  subscription.is_active 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {subscription.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex items-center space-x-3">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleSubscriptionClick(subscription)
                                    }}
                                    className="text-blue-600 hover:text-blue-900"
                                  >
                                    Edit
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDeleteSubscription(subscription.id)
                                    }}
                                    className="text-red-600 hover:text-red-900"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'invoicing' && (
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Invoicing</h2>
                  <p className="text-sm text-gray-600">
                    Create and manage invoices for {client.first_name} {client.last_name}
                  </p>
                </div>
                <div className="flex space-x-3">
                  {selectedJobs.size > 0 && (
                    <button
                      onClick={() => setShowCreateInvoice(true)}
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      Create Invoice ({selectedJobs.size} job{selectedJobs.size !== 1 ? 's' : ''})
                    </button>
                  )}
                  <button
                    onClick={() => {
                      fetchCompletedJobs()
                      fetchInvoices()
                    }}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Completed Jobs */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-md font-medium text-gray-900 mb-4">Completed Jobs</h3>

                  {completedJobsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-center">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                        <p className="mt-2 text-sm text-gray-600">Loading completed jobs...</p>
                      </div>
                    </div>
                  ) : completedJobs.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="mx-auto h-8 w-8 text-gray-400">
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="mt-2 text-sm text-gray-500">No invoice-ready jobs available</p>
                      <p className="text-xs text-gray-400">Complete jobs with services assigned to create invoices</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {completedJobs.map((job) => (
                        <div
                          key={job.id}
                          className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                            selectedJobs.has(job.id)
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                          }`}
                          onClick={() => handleJobSelection(job.id)}
                        >
                          <input
                            type="checkbox"
                            checked={selectedJobs.has(job.id)}
                            onChange={() => handleJobSelection(job.id)}
                            className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {job.title}
                              </p>
                              <span className="text-sm font-semibold text-gray-900 ml-2">
                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'DKK' }).format(job.total_price || 0)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              Completed {formatDateCompact(job.scheduled_date)}
                            </p>
                            <div className="flex items-center mt-2 text-xs text-gray-500">
                              <span>{job.services.length} service{job.services.length !== 1 ? 's' : ''}</span>
                              <span className="mx-2">•</span>
                              <span>{Math.floor((job.total_duration || 0) / 60)}h {(job.total_duration || 0) % 60}m</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Invoices */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-md font-medium text-gray-900 mb-4">Invoices</h3>

                  {invoicesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-center">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                        <p className="mt-2 text-sm text-gray-600">Loading invoices...</p>
                      </div>
                    </div>
                  ) : invoices.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="mx-auto h-8 w-8 text-gray-400">
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="mt-2 text-sm text-gray-500">No invoices yet</p>
                      <p className="text-xs text-gray-400">Create your first invoice from completed jobs</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {invoices.map((invoice) => (
                        <div
                          key={invoice.id}
                          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-900">
                              #{invoice.invoice_number}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                                invoice.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                                invoice.status === 'overdue' ? 'bg-red-100 text-red-800' :
                                invoice.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {invoice.status}
                              </span>

                              {/* Actions (3 dots) */}
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setOpenInvoiceMenuId(openInvoiceMenuId === invoice.id ? null : invoice.id)
                                  }}
                                  className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                                  title="Invoice actions"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6h.01M12 12h.01M12 18h.01" />
                                  </svg>
                                </button>

                                {openInvoiceMenuId === invoice.id && (
                                  <div
                                    className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenInvoiceMenuId(null)
                                        downloadInvoicePdf(invoice.id, invoice.invoice_number)
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                    >
                                      Download PDF
                                    </button>

                                    {invoice.status === 'draft' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setOpenInvoiceMenuId(null)
                                            markInvoiceSentExternal(invoice.id)
                                          }}
                                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                        >
                                          Mark as sent (external)
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setOpenInvoiceMenuId(null)
                                            openSendInvoice(invoice)
                                          }}
                                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                                        >
                                          Send invoice to client…
                                        </button>
                                        <div className="border-t border-gray-100 my-1" />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setOpenInvoiceMenuId(null)
                                            setDeleteJobAction('restore')
                                            setDeleteInvoiceId(invoice.id)
                                          }}
                                          className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-700"
                                        >
                                          Delete invoice…
                                        </button>
                                      </>
                                    )}

                                    {invoice.status !== 'draft' && (
                                      <div className="px-3 py-2 text-xs text-gray-500">
                                        Sent invoices are locked (cannot be edited/deleted).
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 mb-2">
                            Issued {formatDateCompact(invoice.issue_date)} • Due {formatDateCompact(invoice.due_date)}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">
                              {invoice.item_count} item{invoice.item_count !== 1 ? 's' : ''}
                            </span>
                            <span className="text-sm font-semibold text-gray-900">
                              {new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency }).format(invoice.total)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reporting' && (
            <div className="p-6">
              <div className="text-center py-12">
                <div className="mx-auto h-12 w-12 text-gray-400">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="mt-2 text-sm font-medium text-gray-900">Reporting</h3>
                <p className="mt-1 text-sm text-gray-500">
                  View history and revenue reports for {client.first_name} {client.last_name}
                </p>
                <div className="mt-6">
                  <button
                    disabled
                    className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-400 bg-gray-100 cursor-not-allowed"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    View Reports (Coming Soon)
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  Reports will show job history, revenue, and performance metrics
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Edit Client Modal */}
        <EditClientModal
          isOpen={isEditClientModalOpen}
          onClose={() => setIsEditClientModalOpen(false)}
          onClientUpdated={handleClientUpdated}
          client={client}
        />

        {/* Create Job Slideout */}
        {client && (
          <CreateJobSlideout
            isOpen={isCreateJobModalOpen}
            onClose={() => setIsCreateJobModalOpen(false)}
            onJobCreated={handleJobCreated}
            clientId={client.id}
            clientName={`${client.first_name} ${client.last_name}`}
          />
        )}

        {/* Edit Job Slideout */}
        <JobViewSlideout
          isOpen={isEditJobModalOpen}
          onClose={() => {
            setIsEditJobModalOpen(false)
            setEditingJob(null)
          }}
          job={editingJob}
        />

        {/* Create Subscription Slideout */}
        {client && (
          <SubscriptionSlideout
            isOpen={isCreateSubscriptionModalOpen}
            onClose={() => setIsCreateSubscriptionModalOpen(false)}
            onSubscriptionCreated={handleSubscriptionCreated}
            clientId={client.id}
          />
        )}

        {/* Edit Subscription Slideout */}
        {client && editingSubscription && (
          <SubscriptionSlideout
            isOpen={isEditSubscriptionModalOpen}
            onClose={() => {
              setIsEditSubscriptionModalOpen(false)
              setEditingSubscription(null)
            }}
            onSubscriptionCreated={handleSubscriptionCreated}
            clientId={client.id}
            subscription={editingSubscription}
          />
        )}

        {/* Create Invoice Modal */}
        {showCreateInvoice && (
          <CreateInvoiceModal
            selectedJobs={selectedJobs}
            completedJobs={completedJobs}
            createInvoiceData={createInvoiceData}
            setCreateInvoiceData={setCreateInvoiceData}
            onClose={() => setShowCreateInvoice(false)}
            onCreateInvoice={handleCreateInvoice}
          />
        )}

        {/* Delete Invoice Modal */}
        {deleteInvoiceId && (
          <div className="fixed inset-0 z-[70]">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteInvoiceId(null)} />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-base font-semibold text-gray-900">Delete invoice</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    This can only be done while the invoice is <span className="font-medium">draft</span>.
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="jobAction"
                        className="mt-1"
                        checked={deleteJobAction === 'restore'}
                        onChange={() => setDeleteJobAction('restore')}
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">Delete invoice, keep jobs</div>
                        <div className="text-xs text-gray-500">Jobs will be restored and become invoiceable again.</div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="jobAction"
                        className="mt-1"
                        checked={deleteJobAction === 'delete_jobs'}
                        onChange={() => setDeleteJobAction('delete_jobs')}
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">Delete invoice and delete jobs</div>
                        <div className="text-xs text-gray-500">Removes the jobs linked to this invoice.</div>
                      </div>
                    </label>
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteInvoiceId(null)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={deleteInvoice}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Send Invoice Modal */}
        <SendInvoiceModal
          isOpen={sendInvoiceId !== null}
          invoiceNumber={invoices.find((i) => i.id === sendInvoiceId)?.invoice_number}
          defaultSubject={sendInvoiceDefaultSubject}
          defaultMessage={sendInvoiceDefaultMessage}
          isSending={sendingInvoice}
          onClose={() => setSendInvoiceId(null)}
          onSend={sendInvoiceEmail}
        />
      </div>
    </AppLayout>
  )
}
