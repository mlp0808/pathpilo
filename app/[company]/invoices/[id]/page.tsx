'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '@/app/components/AppLayout'
import { apiUrl } from '@/app/utils/api'
import Link from 'next/link'
import { ArrowLeftIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline'

function formatDate(value: string | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCurrency(amount: number | string | undefined, currency = 'DKK'): string {
  if (amount === undefined || amount === null) return '0.00'
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(n)) return '0.00'
  return `${n.toFixed(2)} ${currency}`
}

const INVOICE_STATUSES = [
  { value: 'draft', label: 'Created' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'credited', label: 'Credited' },
] as const

function statusToLabel(status: string): string {
  if (status === 'cancelled') return 'Credited'
  return INVOICE_STATUSES.find((s) => s.value === status)?.label ?? status
}

export default function InvoicePage() {
  const params = useParams()
  const router = useRouter()
  const company = params?.company as string
  const id = params?.id as string
  const [invoice, setInvoice] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusUpdating, setStatusUpdating] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token || !id) {
      setLoading(false)
      setError(!id ? 'Invalid invoice' : 'Not authenticated')
      return
    }
    fetch(apiUrl(`/invoices/${id}`), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.invoice) setInvoice(data.invoice)
        else setError(data.error || 'Invoice not found')
      })
      .catch(() => setError('Failed to load invoice'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <AppLayout>
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
            <p className="mt-2 text-sm text-gray-500">Loading invoice...</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (error || !invoice) {
    return (
      <AppLayout>
        <div className="p-6">
          <p className="text-red-600">{error || 'Invoice not found'}</p>
          <Link
            href={company ? `/${company}/jobs/completed` : '/jobs/completed'}
            className="mt-4 inline-flex items-center text-sm text-accent-600 hover:text-accent-700"
          >
            <ArrowLeftIcon className="mr-1 h-4 w-4" />
            Back to Completed
          </Link>
        </div>
      </AppLayout>
    )
  }

  const items = invoice.items || []
  const subtotal = Number(invoice.subtotal) || 0
  const taxAmount = Number(invoice.tax_amount) || 0
  const total = Number(invoice.total) || 0
  const currency = invoice.currency || 'DKK'

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === (invoice?.status || '')) return
    const token = localStorage.getItem('token')
    if (!token || !id) return
    setStatusUpdating(true)
    try {
      const res = await fetch(apiUrl(`/invoices/${id}/status`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (res.ok && data.invoice) {
        setInvoice((prev: any) => (prev ? { ...prev, status: data.invoice.status } : prev))
      } else {
        alert(data.error || 'Failed to update status')
      }
    } catch (e) {
      console.error(e)
      alert('Failed to update status')
    } finally {
      setStatusUpdating(false)
    }
  }

  return (
    <AppLayout>
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href={company ? `/${company}/jobs/completed` : '/jobs/completed'}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeftIcon className="mr-1 h-4 w-4" />
            Back to Completed
          </Link>
        </div>

        <div className="flex gap-8">
          {/* Invoice document – classic layout */}
          <div className="min-w-0 flex-1">
            <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm print:shadow-none">
              <div className="border-b border-gray-200 pb-6">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">INVOICE</h1>
                {invoice.title && (
                  <p className="mt-1 text-sm text-gray-600">{invoice.title}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-6 text-sm">
                  <div>
                    <span className="font-medium text-gray-500">Invoice number</span>
                    <p className="font-medium text-gray-900">{invoice.invoice_number || '—'}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500">Issue date</span>
                    <p className="text-gray-900">{formatDate(invoice.issue_date)}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500">Due date</span>
                    <p className="text-gray-900">{formatDate(invoice.due_date)}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500">Status</span>
                    <p className="text-gray-900">{statusToLabel(invoice.status || 'draft')}</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-2">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Bill to</h2>
                  <p className="mt-2 font-medium text-gray-900">{invoice.client_name || '—'}</p>
                  {(invoice.address || invoice.zip_code || invoice.city) && (
                    <p className="mt-1 text-sm text-gray-600">
                      {[invoice.address, invoice.zip_code, invoice.city].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {invoice.email && (
                    <p className="mt-1 text-sm text-gray-600">{invoice.email}</p>
                  )}
                  {invoice.phone && (
                    <p className="text-sm text-gray-600">{invoice.phone}</p>
                  )}
                </div>
              </div>

              <div className="mt-8 overflow-hidden border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                        Description
                      </th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">
                        Qty
                      </th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">
                        Unit price
                      </th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
                          No line items
                        </td>
                      </tr>
                    ) : (
                      items.map((item: any) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {item.description || item.service_title || '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600">
                            {item.quantity ?? 1}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600">
                            {formatCurrency(item.unit_price, currency)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                            {formatCurrency(item.line_total, currency)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex justify-end">
                <div className="w-56 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal, currency)}</span>
                  </div>
                  {Number(invoice.tax_rate) > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Tax ({invoice.tax_rate}%)</span>
                      <span>{formatCurrency(taxAmount, currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold text-gray-900">
                    <span>Total</span>
                    <span>{formatCurrency(total, currency)}</span>
                  </div>
                </div>
              </div>

              {(invoice.payment_terms || invoice.notes) && (
                <div className="mt-8 border-t border-gray-200 pt-6">
                  {invoice.payment_terms && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium text-gray-500">Payment terms:</span>{' '}
                      {invoice.payment_terms}
                    </p>
                  )}
                  {invoice.notes && (
                    <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Status + Options – to the right of the invoice */}
          <div className="flex w-52 flex-shrink-0 flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Status
              </label>
              <p className="mt-1.5 text-sm font-medium text-gray-900">
                {statusToLabel(invoice.status || 'draft')}
              </p>
              <select
                value={invoice.status || 'draft'}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={statusUpdating}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:opacity-50"
              >
                {INVOICE_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
            >
              <EllipsisVerticalIcon className="h-5 w-5" />
              Options
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
