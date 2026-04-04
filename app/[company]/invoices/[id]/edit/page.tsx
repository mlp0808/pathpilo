'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '@/app/components/AppLayout'
import { apiUrl } from '@/app/utils/api'
import { getCountryRule } from '@/app/config/countryRules'
import Link from 'next/link'
import { ArrowLeftIcon, DocumentTextIcon } from '@heroicons/react/24/outline'

const MAX_TITLE_LEN = 30

const PAYMENT_TERMS_PLACEHOLDERS = [
  '{due_date}',
  '{overdue_days}',
  '{invoice_date}',
  '{invoice_number}',
] as const

function formatDate(value: string | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatNumber(amount: number | string | undefined): string {
  if (amount === undefined || amount === null) return '0.00'
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(n)) return '0.00'
  return n.toFixed(2)
}

/** Days between two YYYY-MM-DD (or ISO) dates. */
function daysBetween(start: string, end: string): number {
  if (!start || !end) return 0
  const a = new Date(start)
  const b = new Date(end)
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000))
}

/** Add days to a YYYY-MM-DD date string, return YYYY-MM-DD. */
function addDays(dateStr: string, days: number): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default function EditInvoicePage() {
  const params = useParams()
  const router = useRouter()
  const company = (params?.company as string) || ''
  const id = (params?.id as string) || ''

  const [invoice, setInvoice] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: 'Invoice',
    issue_date: '',
    due_in_days: 30,
    tax_rate: 25,
    currency: 'DKK',
    payment_terms: '',
    description: '',
    show_completed_date: false,
  })
  const countryCode = typeof window !== 'undefined'
    ? (() => {
        try {
          const user = JSON.parse(localStorage.getItem('user') || '{}')
          return user?.activeCompany?.countryCode || 'DK'
        } catch {
          return 'DK'
        }
      })()
    : 'DK'
  const countryRule = getCountryRule(countryCode)

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
        if (data.invoice) {
          const inv = data.invoice
          setInvoice(inv)
          if (inv.status !== 'draft') {
            setError('Only draft invoices can be edited.')
            return
          }
          setForm({
            title: inv.title || 'Invoice',
            issue_date: inv.issue_date ? inv.issue_date.split('T')[0] : '',
            due_in_days: (() => {
              const issue = inv.issue_date ? inv.issue_date.split('T')[0] : ''
              const due = inv.due_date ? inv.due_date.split('T')[0] : ''
              if (!issue || !due) return 30
              return Math.max(0, daysBetween(issue, due))
            })(),
            tax_rate: Number(inv.tax_rate) ?? 25,
            currency: inv.currency || 'DKK',
            payment_terms: inv.payment_terms || '',
            description: inv.description || '',
            show_completed_date: Boolean(inv.show_completed_date),
          })
        } else {
          setError(data.error || 'Invoice not found')
        }
      })
      .catch(() => setError('Failed to load invoice'))
      .finally(() => setLoading(false))
  }, [id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invoice || invoice.status !== 'draft') return
    setSubmitting(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/invoices/${id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: form.title.slice(0, MAX_TITLE_LEN),
          issue_date: form.issue_date,
          due_date: form.issue_date ? addDays(form.issue_date, form.due_in_days) : '',
          tax_rate: form.tax_rate,
          currency: form.currency,
          payment_terms: form.payment_terms,
          notes: '',
          description: form.description.trim() || '',
          show_completed_date: form.show_completed_date,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        router.push(`/${company}/invoices/${id}`)
      } else {
        setError(data.error || 'Failed to update invoice')
      }
    } catch (err) {
      console.error(err)
      setError('Failed to update invoice')
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

  if (error || !invoice) {
    return (
      <AppLayout>
        <div className="p-6">
          <p className="text-red-600">{error || 'Invoice not found'}</p>
          <Link
            href={`/${company}/invoices/${id}`}
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent-600 hover:text-accent-700"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to invoice
          </Link>
        </div>
      </AppLayout>
    )
  }

  const items = invoice.items || []

  return (
    <AppLayout>
      <div className="min-h-screen bg-page">
        <div className="border-b border-gray-200/80 bg-white/80 backdrop-blur-sm">
          <div className="mx-auto max-w-[1600px] px-6 py-4">
            <div className="flex items-center justify-between">
              <Link
                href={`/${company}/invoices/${id}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-primary-800"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back to invoice
              </Link>
              <h1 className="text-lg font-semibold text-primary-800">Edit invoice</h1>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mx-auto max-w-[1600px] px-6 py-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr,420px]">
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
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Due in (days)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.due_in_days}
                        onChange={(e) => setForm((p) => ({ ...p, due_in_days: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                        className="input-field w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                        placeholder="30"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Due date is calculated as issue date + this number of days
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="edit-show-completed-date"
                      checked={form.show_completed_date}
                      onChange={(e) => setForm((p) => ({ ...p, show_completed_date: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-500"
                    />
                    <label htmlFor="edit-show-completed-date" className="text-sm font-medium text-gray-700">
                      Show completed date on each line item (e.g. &quot;Carpet Cleaning - 25 Feb 2026&quot;)
                    </label>
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
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">{countryRule.taxLabel} (%)</label>
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
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Line items (read-only)</h2>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="text-sm text-gray-500">No line items</p>
                  ) : (
                    items.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-2 text-sm"
                      >
                        <span className="text-gray-900">{item.description || item.service_title || '—'}</span>
                        <span className="font-medium text-gray-900">
                          {formatNumber(item.line_total)} {form.currency}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Payment</h2>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Description (on invoice, above table)</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                      rows={3}
                      className="input-field w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                      placeholder="Optional description..."
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Payment terms</label>
                    <textarea
                      value={form.payment_terms}
                      onChange={(e) => setForm((p) => ({ ...p, payment_terms: e.target.value }))}
                      rows={6}
                      className="input-field w-full rounded-xl border border-gray-200 px-4 py-2.5 font-mono text-sm focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
                      placeholder="Use {due_date}, {overdue_days}, {invoice_date}, {invoice_number} as placeholders"
                    />
                    <p className="mt-1.5 text-xs text-gray-500">
                      Placeholders: {PAYMENT_TERMS_PLACEHOLDERS.join(', ')}
                    </p>
                  </div>
                </div>
              </section>

              <div className="flex justify-end gap-3">
                <Link
                  href={`/${company}/invoices/${id}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold shadow-sm disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <DocumentTextIcon className="h-5 w-5" />
                      Save changes
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-lg">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Preview</p>
                <div className="space-y-2 text-sm text-gray-600">
                  <p><span className="font-medium text-gray-700">Client:</span> {invoice.client_name}</p>
                  <p><span className="font-medium text-gray-700">Invoice no.:</span> {invoice.invoice_number_display || invoice.invoice_number || id}</p>
                  <p><span className="font-medium text-gray-700">Issue date:</span> {formatDate(form.issue_date)}</p>
                  <p><span className="font-medium text-gray-700">Due in:</span> {form.due_in_days} days → {formatDate(form.issue_date ? addDays(form.issue_date, form.due_in_days) : '')}</p>
                  <p><span className="font-medium text-gray-700">Total:</span> {formatNumber(invoice.total)} {form.currency}</p>
                </div>
                <p className="mt-4 text-xs text-gray-500">
                  Full preview is on the invoice view page after saving.
                </p>
              </div>
            </div>
          </div>
        </form>
      </div>
    </AppLayout>
  )
}
