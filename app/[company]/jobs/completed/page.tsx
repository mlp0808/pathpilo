'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '@/app/components/AppLayout'
import JobViewSlideout from '@/app/components/JobViewSlideout'
import { apiUrl } from '@/app/utils/api'
import { EyeIcon, ChevronDownIcon, DocumentTextIcon, XMarkIcon } from '@heroicons/react/24/outline'

interface CompletedJob {
  id: number
  client_id?: number
  title: string
  name?: string
  last_name?: string
  status?: 'scheduled' | 'completed' | 'sub_completed' | 'cancelled'
  service_count: number
  total_price: number
  recurring_job_id?: number | null
  is_generated?: boolean
  updated_at?: string
  created_at?: string
  [key: string]: unknown
}

interface ClientOption {
  client_id: number
  name: string
}

function isSubscriptionJob(job: CompletedJob): boolean {
  return !!(job.recurring_job_id != null || job.is_generated)
}

function formatDate(value: string | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCurrency(value: number | string | undefined): string {
  if (value === undefined || value === null) return '0.00'
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(n)) return '0.00'
  return n.toFixed(2)
}

const INVOICE_TITLE_MAX = 30
function invoiceTitleDisplay(title: string | null | undefined): string {
  if (!title) return '—'
  return title.length > INVOICE_TITLE_MAX ? title.slice(0, INVOICE_TITLE_MAX) + '...' : title
}

export default function CompletedJobsPage() {
  const params = useParams()
  const router = useRouter()
  const company = (params?.company as string) || ''
  const [jobs, setJobs] = useState<CompletedJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewingJob, setViewingJob] = useState<CompletedJob | null>(null)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [clientFilterOpen, setClientFilterOpen] = useState(false)
  const [clientSearchQuery, setClientSearchQuery] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)
  const clientFilterRef = useRef<HTMLDivElement>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)

  // Only show completed jobs that are not yet invoiced (invoiced jobs "go away" from this list)
  const jobsNotInvoiced = jobs.filter((j) => !(j as any).invoice_id)

  // Jobs that can be added to an invoice: completed or sub_completed only (cancelled appear in list but not on invoice)
  const isJobInvoiceable = (job: CompletedJob) =>
    job.status === 'completed' || job.status === 'sub_completed'

  // Unique clients that have completed, not-yet-invoiced jobs
  const clientsWithCompletedJobs: ClientOption[] = (() => {
    const seen = new Set<number>()
    const list: ClientOption[] = []
    for (const job of jobsNotInvoiced) {
      const cid = job.client_id
      if (cid != null && !seen.has(cid)) {
        seen.add(cid)
        list.push({
          client_id: cid,
          name: [job.name, job.last_name].filter(Boolean).join(' ') || '—',
        })
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  })()

  const filteredClientOptions = clientSearchQuery.trim()
    ? clientsWithCompletedJobs.filter((c) =>
        c.name.toLowerCase().includes(clientSearchQuery.trim().toLowerCase())
      )
    : clientsWithCompletedJobs

  const selectedClient = selectedClientId != null
    ? clientsWithCompletedJobs.find((c) => c.client_id === selectedClientId)
    : null

  const displayedJobs = selectedClientId == null
    ? jobsNotInvoiced
    : jobsNotInvoiced.filter((j) => j.client_id === selectedClientId)

  // Only completed and sub_completed jobs can be selected for invoice; cancelled appear in list but are not on the final invoice
  const displayedInvoiceable = displayedJobs.filter(
    (j) => j.status === 'completed' || j.status === 'sub_completed'
  )

  // Selected job objects (from not-invoiced jobs list)
  const selectedJobObjects = jobsNotInvoiced.filter((j) => selectedIds.has(j.id))
  const selectedClientIds = new Set(selectedJobObjects.map((j) => j.client_id).filter((id): id is number => id != null))
  const allSameClient = selectedClientIds.size <= 1
  const canCreateInvoice = selectedIds.size >= 1 && allSameClient
  const invoiceClientId = selectedJobObjects[0]?.client_id ?? null

  const goToCreateInvoice = () => {
    if (selectedIds.size === 0 || !allSameClient) return
    const ids = Array.from(selectedIds).join(',')
    router.push(`/${company}/invoices/new?jobIds=${ids}`)
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clientFilterRef.current && !clientFilterRef.current.contains(e.target as Node)) {
        setClientFilterOpen(false)
      }
    }
    if (clientFilterOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [clientFilterOpen])

  const toggleSelect = (id: number) => {
    const job = jobsNotInvoiced.find((j) => j.id === id)
    if (job && !isJobInvoiceable(job)) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === displayedInvoiceable.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(displayedInvoiceable.map((j) => j.id)))
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      setError('Not authenticated')
      return
    }
    fetch(apiUrl('/jobs?status=completed'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.jobs) setJobs(data.jobs)
        else setJobs([])
        setError(null)
      })
      .catch((err) => {
        console.error('Failed to fetch completed jobs:', err)
        setError('Failed to load completed jobs')
        setJobs([])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    setInvoicesLoading(true)
    fetch(apiUrl('/invoices'), { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (data.invoices) setInvoices(data.invoices)
        else setInvoices([])
      })
      .catch(() => setInvoices([]))
      .finally(() => setInvoicesLoading(false))
  }, [])

  const openJob = (job: CompletedJob) => {
    setViewingJob(job)
    setIsViewModalOpen(true)
  }

  const clientName = (job: CompletedJob) => {
    const first = job.name || ''
    const last = job.last_name || ''
    return [first, last].filter(Boolean).join(' ') || '—'
  }

  const dateCompleted = (job: CompletedJob) => {
    return formatDate(job.updated_at || job.created_at)
  }

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="text-2xl font-semibold text-primary-800">Completed</h1>
        <p className="mt-1 text-sm text-gray-500">All completed jobs, newest first.</p>

        {loading && (
          <div className="mt-6 flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
              <p className="mt-2 text-sm text-gray-500">Loading completed jobs...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Top bar: client filter (left) + Create Invoice (right) */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              {/* Client filter: search field – type to see matching clients (no full list, works with 1000s) */}
              {clientsWithCompletedJobs.length > 0 ? (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">Client</label>
                  <div className="relative w-full min-w-[220px] max-w-sm" ref={clientFilterRef}>
                    {selectedClientId != null ? (
                      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
                        <span className="flex-1 truncate text-sm text-gray-900">{selectedClient?.name ?? 'Client'}</span>
                        <button
                          type="button"
                          onClick={() => { setSelectedClientId(null); setClientSearchQuery(''); setClientFilterOpen(false) }}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title="Show all clients"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={clientSearchQuery}
                          onChange={(e) => { setClientSearchQuery(e.target.value); setClientFilterOpen(true) }}
                          onFocus={() => setClientFilterOpen(true)}
                          placeholder="Search by client name..."
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 pr-9 text-sm text-gray-900 shadow-sm transition-colors placeholder-gray-400 hover:border-gray-300 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                        />
                        {clientSearchQuery && (
                          <button
                            type="button"
                            onClick={() => { setClientSearchQuery(''); setClientFilterOpen(true) }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    )}
                    {clientFilterOpen && selectedClientId == null && (
                      <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                        <ul className="max-h-52 overflow-y-auto py-1">
                          <li>
                            <button
                              type="button"
                              onClick={() => { setClientFilterOpen(false); setClientSearchQuery('') }}
                              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                            >
                              All clients
                            </button>
                          </li>
                          {clientSearchQuery.trim().length < 2 ? (
                            <li className="px-3 py-2 text-sm text-gray-500">Type at least 2 characters to search for a client</li>
                          ) : filteredClientOptions.length === 0 ? (
                            <li className="px-3 py-2 text-sm text-gray-500">No matching clients</li>
                          ) : (
                            filteredClientOptions.slice(0, 50).map((c) => (
                              <li key={c.client_id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedClientId(c.client_id)
                                    setClientFilterOpen(false)
                                    setClientSearchQuery('')
                                  }}
                                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-accent-50 hover:text-accent-800"
                                >
                                  {c.name}
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div />
              )}

              {/* Create Invoice: red message when mixed clients, button when same client */}
              <div className="flex flex-shrink-0 items-center gap-3">
                {selectedIds.size >= 1 && !allSameClient && (
                  <p className="text-sm text-red-600">
                    All selected jobs should be from the same client/organisation
                  </p>
                )}
                <button
                  type="button"
                  onClick={goToCreateInvoice}
                  disabled={!canCreateInvoice}
                  className="inline-flex items-center rounded-xl border border-transparent bg-accent-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <DocumentTextIcon className="mr-2 h-4 w-4" />
                  Create Invoice
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th scope="col" className="w-10 px-4 py-3.5 text-left">
                      <input
                        type="checkbox"
                        checked={displayedInvoiceable.length > 0 && selectedIds.size === displayedInvoiceable.length}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-500"
                      />
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Job name
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Client name
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Type
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Total value
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Date completed
                    </th>
                    <th scope="col" className="relative px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">
                      <span className="sr-only">View</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {displayedJobs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500">
                        {jobs.length === 0 ? 'No completed jobs yet.' : 'No completed jobs for this client.'}
                      </td>
                    </tr>
                  ) : (
                    displayedJobs.map((job) => {
                      const invoiceable = isJobInvoiceable(job)
                      return (
                      <tr
                        key={job.id}
                        className={`transition-colors hover:bg-gray-50/50 ${!invoiceable ? 'bg-gray-50/50' : ''}`}
                      >
                        <td className="w-10 whitespace-nowrap px-4 py-3.5">
                          {invoiceable ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(job.id)}
                              onChange={() => toggleSelect(job.id)}
                              className="h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-500"
                            />
                          ) : (
                            <span className="text-xs text-gray-400" title="Cancelled jobs are not included on the invoice">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm font-medium text-gray-900">
                          {job.title || 'Untitled job'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-600">
                          {clientName(job)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              job.status === 'cancelled'
                                ? 'bg-gray-200 text-gray-700'
                                : job.status === 'sub_completed'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-accent-100 text-accent-800'
                            }`}
                          >
                            {job.status === 'cancelled'
                              ? 'Cancelled'
                              : job.status === 'sub_completed'
                              ? 'Sub-completed'
                              : 'Completed'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              isSubscriptionJob(job)
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {isSubscriptionJob(job) ? 'Subscription' : 'Manual'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-600">
                          {formatCurrency(job.total_price)} kr.
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-600">
                          {dateCompleted(job)}
                        </td>
                        <td className="relative whitespace-nowrap px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                              Tasks: {job.service_count ?? 0}
                            </span>
                            <button
                              type="button"
                              onClick={() => openJob(job)}
                              className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 transition-colors hover:bg-accent-50 hover:text-accent-600"
                              title="View job"
                            >
                              <EyeIcon className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )})
                  )}
                </tbody>
              </table>
            </div>
          </div>

            {/* Invoices section – clear distinction below completed jobs */}
            <section className="mt-10 border-t border-gray-200 pt-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Invoices</h2>
              <p className="text-sm text-gray-500 mb-4">All invoices for this company, newest first.</p>
              {invoicesLoading ? (
                <div className="flex items-center justify-center py-12 rounded-2xl border border-gray-200 bg-gray-50/50">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
                  <span className="ml-2 text-sm text-gray-500">Loading invoices...</span>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr className="bg-gray-50/80">
                          <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                            Invoice number
                          </th>
                          <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                            Invoice title
                          </th>
                          <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                            Client name
                          </th>
                          <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                            Due date
                          </th>
                          <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                            Total amount
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {invoices.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">
                              No invoices yet.
                            </td>
                          </tr>
                        ) : (
                          invoices.map((inv: any) => (
                            <tr
                              key={inv.id}
                              className="cursor-pointer transition-colors hover:bg-accent-50/50"
                              onClick={() => router.push(`/${company}/invoices/${inv.id}?from=completed`)}
                            >
                              <td className="whitespace-nowrap px-4 py-3.5 text-sm font-medium text-gray-900">
                                {inv.invoice_number || '—'}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-700" title={inv.title || ''}>
                                {invoiceTitleDisplay(inv.title)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-600">
                                {inv.client_name || '—'}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-600">
                                {formatDate(inv.due_date)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-600">
                                {formatCurrency(inv.total)} {inv.currency || 'DKK'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <JobViewSlideout
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false)
          setViewingJob(null)
        }}
        job={viewingJob}
        onJobUpdated={() => {
          const token = localStorage.getItem('token')
          if (token) {
            fetch(apiUrl('/jobs?status=completed'), {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then((res) => res.json())
              .then((data) => {
                if (data.jobs) setJobs(data.jobs)
              })
              .catch(() => {})
          }
        }}
      />

    </AppLayout>
  )
}
