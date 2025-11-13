'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '../../components/AppLayout'
import EditClientModal from '../../components/EditClientModal'
import CreateJobSlideout from '../../components/CreateJobSlideout'
import JobViewSlideout from '../../components/JobViewSlideout'
import SubscriptionSlideout from '../../components/SubscriptionSlideout'
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
              <div className="text-center py-12">
                <div className="mx-auto h-12 w-12 text-gray-400">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="mt-2 text-sm font-medium text-gray-900">Invoicing</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Create and manage invoices for {client.first_name} {client.last_name}
                </p>
                <div className="mt-6">
                  <button
                    disabled
                    className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-400 bg-gray-100 cursor-not-allowed"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Invoice (Coming Soon)
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  Invoicing will be generated from completed jobs
                </p>
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
      </div>
    </AppLayout>
  )
}
