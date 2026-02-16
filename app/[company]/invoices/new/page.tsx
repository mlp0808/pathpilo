'use client'

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import AppLayout from '@/app/components/AppLayout'
import { apiUrl } from '@/app/utils/api'
import Link from 'next/link'
import { ArrowLeftIcon, DocumentTextIcon } from '@heroicons/react/24/outline'

const MAX_TITLE_LEN = 30

function formatDate(value: string): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatMoney(amount: number, currency: string): string {
  return `${Number(amount).toFixed(2)} ${currency}`
}

function NewInvoicePageContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const company = (params?.company as string) || ''
  const jobIdsParam = searchParams.get('jobIds') || ''
  const jobIds = useMemo(() => {
    if (!jobIdsParam.trim()) return []
    return jobIdsParam.split(',').map((id) => parseInt(id.trim(), 10)).filter((id) => !isNaN(id))
  }, [jobIdsParam])

  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: 'Invoice',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    tax_rate: 25,
    currency: 'DKK',
    payment_terms: 'Payment due within 30 days',
    notes: '',
    discounts: {} as Record<string, number>,
  })

  const selectedJobs = useMemo(() => {
    if (jobIds.length === 0) return []
    return jobs.filter((j) => jobIds.includes(j.id))
  }, [jobs, jobIds])

  const clientId = selectedJobs[0]?.client_id ?? null
  const clientName = selectedJobs[0]
    ? [selectedJobs[0].name, selectedJobs[0].last_name].filter(Boolean).join(' ').trim() || '—'
    : '—'

  const subtotal = useMemo(() => {
    return selectedJobs.reduce((sum, job) => {
      const discount = form.discounts[job.id] ?? 0
      return sum + Math.max(0, (job.total_price || 0) - discount)
    }, 0)
  }, [selectedJobs, form.discounts])

  const taxAmount = useMemo(() => subtotal * (form.tax_rate / 100), [subtotal, form.tax_rate])
  const total = useMemo(() => subtotal + taxAmount, [subtotal, taxAmount])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      setError('Not authenticated')
      return
    }
    if (jobIds.length === 0) {
      setLoading(false)
      setError('No jobs selected. Go to Completed and select jobs to invoice.')
      return
    }
    fetch(apiUrl('/jobs?status=completed'), { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        if (data.jobs) setJobs(data.jobs)
        else setJobs([])
        setError(null)
      })
      .catch(() => setError('Failed to load jobs'))
      .finally(() => setLoading(false))
  }, [jobIds.length])

  const handleDiscountChange = useCallback((jobId: number, value: number) => {
    setForm((prev) => ({
      ...prev,
      discounts: { ...prev.discounts, [jobId]: Math.max(0, value) },
    }))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clientId || selectedJobs.length === 0) return
    setSubmitting(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/clients/${clientId}/invoices`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          job_ids: selectedJobs.map((j) => j.id),
          title: form.title.slice(0, MAX_TITLE_LEN),
          issue_date: form.issue_date,
          due_date: form.due_date,
          tax_rate: form.tax_rate,
          currency: form.currency,
          payment_terms: form.payment_terms,
          notes: form.notes,
          discounts: form.discounts,
        }),
      })
      const data = await res.json()
      if (res.ok && data.invoice?.id) {
        router.push(`/${company}/invoices/${data.invoice.id}`)
      } else {
        alert(data.error || 'Failed to create invoice')
      }
    } catch (err) {
      console.error(err)
      alert('Failed to create invoice')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
            <p className="text-sm text-gray-500">Loading...</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (error || jobIds.length === 0) {
    return (
      <AppLayout>
        <div className="p-6">
          <p className="text-red-600">{error || 'Select jobs from the Completed page first.'}</p>
          <Link
            href={`/${company}/jobs/completed`}
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent-600 hover:text-accent-700"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Completed
          </Link>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-page">
        <div className="border-b border-gray-200/80 bg-white/80 backdrop-blur-sm">
          <div className="mx-auto max-w-[1600px] px-6 py-4">
            <div className="flex items-center justify-between">
              <Link
                href={`/${company}/jobs/completed`}
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-primary-800"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back to Completed
              </Link>
              <h1 className="text-lg font-semibold text-primary-800">New invoice</h1>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mx-auto max-w-[1600px] px-6 py-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr,420px]">
            {/* Left: Form */}
            <div className="space-y-6">
              <section className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                  <DocumentTextIcon className="h-4 w-4 text-accent-500" />
                  Invoice details
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Title</label>
                    <input
                      type="text"
                      maxLength={MAX_TITLE_LEN}
                      value={form.title}
                      onChange={(e) => setForm((p) => ({ ...p, title: e.target.value.slice(0, MAX_TITLE_LEN) }))}
                      className="input-field w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                      placeholder="Invoice"
                    />
                    <p className="mt-1 text-xs text-gray-500">{form.title.length}/{MAX_TITLE_LEN}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Issue date</label>
                      <input
                        type="date"
                        value={form.issue_date}
                        onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))}
                        className="input-field w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Due date</label>
                      <input
                        type="date"
                        value={form.due_date}
                        onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
                        className="input-field w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Currency</label>
                      <select
                        value={form.currency}
                        onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                        className="input-field w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                      >
                        <option value="DKK">DKK</option>
                        <option value="EUR">EUR</option>
                        <option value="USD">USD</option>
                        <option value="GBP">GBP</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Tax rate (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={form.tax_rate}
                        onChange={(e) => setForm((p) => ({ ...p, tax_rate: parseFloat(e.target.value) || 0 }))}
                        className="input-field w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Line items & discounts</h2>
                <div className="space-y-3">
                  {selectedJobs.map((job) => {
                    const discount = form.discounts[job.id] ?? 0
                    const lineTotal = Math.max(0, (job.total_price || 0) - discount)
                    return (
                      <div
                        key={job.id}
                        className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-100 bg-gray-50/50 p-4"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 truncate">{job.title || 'Untitled job'}</p>
                          <p className="text-xs text-gray-500">
                            {formatMoney(job.total_price ?? 0, form.currency)} before discount
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-500">Discount</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={discount || ''}
                            onChange={(e) => handleDiscountChange(job.id, parseFloat(e.target.value) || 0)}
                            className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                          />
                        </div>
                        <p className="w-28 text-right text-sm font-semibold text-gray-900">
                          {formatMoney(lineTotal, form.currency)}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Payment & notes</h2>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Payment terms</label>
                    <input
                      type="text"
                      value={form.payment_terms}
                      onChange={(e) => setForm((p) => ({ ...p, payment_terms: e.target.value }))}
                      className="input-field w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                      placeholder="e.g. Payment due within 30 days"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Notes (optional)</label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                      rows={3}
                      className="input-field w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                      placeholder="Additional notes..."
                    />
                  </div>
                </div>
              </section>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || selectedJobs.length === 0}
                  className="btn-primary inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold shadow-sm disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <DocumentTextIcon className="h-5 w-5" />
                      Create invoice
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right: Preview */}
            <div className="lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-lg">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Preview</p>
                <div className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50/30">
                  <div className="border-b border-gray-200/80 bg-white px-5 py-4">
                    <h3 className="text-lg font-bold tracking-tight text-primary-800">INVOICE</h3>
                    {form.title && (
                      <p className="mt-0.5 text-sm text-gray-600">{form.title.slice(0, MAX_TITLE_LEN)}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-4 text-xs">
                      <div>
                        <span className="text-gray-500">Issue</span>
                        <p className="font-medium text-gray-900">{formatDate(form.issue_date)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Due</span>
                        <p className="font-medium text-gray-900">{formatDate(form.due_date)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="border-b border-gray-200/80 bg-white px-5 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Bill to</p>
                    <p className="mt-1 font-medium text-gray-900">{clientName}</p>
                  </div>
                  <div className="border-b border-gray-200/80 bg-white">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/80">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Description</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedJobs.map((job) => {
                          const discount = form.discounts[job.id] ?? 0
                          const lineTotal = Math.max(0, (job.total_price || 0) - discount)
                          return (
                            <tr key={job.id} className="border-b border-gray-100">
                              <td className="px-4 py-2.5 text-gray-900">{job.title || 'Untitled job'}</td>
                              <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                                {formatMoney(lineTotal, form.currency)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-white px-5 py-4">
                    <div className="ml-auto w-48 space-y-1.5 text-sm">
                      <div className="flex justify-between text-gray-600">
                        <span>Subtotal</span>
                        <span>{formatMoney(subtotal, form.currency)}</span>
                      </div>
                      {form.tax_rate > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span>Tax ({form.tax_rate}%)</span>
                          <span>{formatMoney(taxAmount, form.currency)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold text-gray-900">
                        <span>Total</span>
                        <span>{formatMoney(total, form.currency)}</span>
                      </div>
                    </div>
                    {form.payment_terms && (
                      <p className="mt-3 text-xs text-gray-500">{form.payment_terms}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}

export default function NewInvoicePage() {
  return (
    <Suspense
      fallback={
        <AppLayout>
          <div className="flex min-h-[60vh] items-center justify-center p-6">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
          </div>
        </AppLayout>
      }
    >
      <NewInvoicePageContent />
    </Suspense>
  )
}
