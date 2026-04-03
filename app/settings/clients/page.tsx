'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppI18n } from '../../components/I18nProvider'
import { apiUrl } from '../../utils/api'

type InvoiceDefaults = {
  invoiceDefaultDueDays: number
  invoiceDefaultPaymentTerms: string
  invoiceEmailDefaultSubject: string
  invoiceEmailDefaultBody: string
  invoiceReminderDefaultSubject: string
  invoiceReminderDefaultBody: string
  invoiceNextNumber: number
  maxNumericInvoice: number
}

const PLACEHOLDER_HINT = '{invoice_number}'

export default function ClientSettingsPage() {
  const { t } = useAppI18n()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState<InvoiceDefaults>({
    invoiceDefaultDueDays: 30,
    invoiceDefaultPaymentTerms: '',
    invoiceEmailDefaultSubject: '',
    invoiceEmailDefaultBody: '',
    invoiceReminderDefaultSubject: '',
    invoiceReminderDefaultBody: '',
    invoiceNextNumber: 1,
    maxNumericInvoice: 0,
  })

  const load = useCallback(async () => {
    setError('')
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setError('Not signed in')
        setLoading(false)
        return
      }
      const res = await fetch(apiUrl('/companies/invoice-defaults'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to load settings')
        setLoading(false)
        return
      }
      if (data.defaults) {
        setForm({
          invoiceDefaultDueDays: data.defaults.invoiceDefaultDueDays ?? 30,
          invoiceDefaultPaymentTerms: data.defaults.invoiceDefaultPaymentTerms ?? '',
          invoiceEmailDefaultSubject: data.defaults.invoiceEmailDefaultSubject ?? '',
          invoiceEmailDefaultBody: data.defaults.invoiceEmailDefaultBody ?? '',
          invoiceReminderDefaultSubject: data.defaults.invoiceReminderDefaultSubject ?? '',
          invoiceReminderDefaultBody: data.defaults.invoiceReminderDefaultBody ?? '',
          invoiceNextNumber: data.defaults.invoiceNextNumber ?? 1,
          maxNumericInvoice: data.defaults.maxNumericInvoice ?? 0,
        })
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const res = await fetch(apiUrl('/companies/invoice-defaults'), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoiceDefaultDueDays: form.invoiceDefaultDueDays,
          invoiceDefaultPaymentTerms: form.invoiceDefaultPaymentTerms,
          invoiceEmailDefaultSubject: form.invoiceEmailDefaultSubject,
          invoiceEmailDefaultBody: form.invoiceEmailDefaultBody,
          invoiceReminderDefaultSubject: form.invoiceReminderDefaultSubject,
          invoiceReminderDefaultBody: form.invoiceReminderDefaultBody,
          invoiceNextNumber: form.invoiceNextNumber,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to save')
        return
      }
      if (data.defaults) {
        setForm((prev) => ({
          ...prev,
          ...data.defaults,
        }))
      }
      setSuccess(t('settings.clients.saved', 'Saved'))
      setTimeout(() => setSuccess(''), 4000)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            {t('settings.clients.title', 'Clients')}
          </h1>
          <p className="text-gray-600 mt-2 text-sm">
            {t(
              'settings.clients.intro',
              'Defaults for invoices you send to clients: due dates, payment terms, numbering, and email templates.'
            )}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}
        {success && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {success}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-8">
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {t('settings.invoices.sectionNewInvoice', 'New invoice')}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {t('settings.invoices.sectionNewInvoiceHint', 'Applied when you create an invoice from completed jobs.')}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('settings.invoices.dueDays', 'Default due date (days after issue date)')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={form.invoiceDefaultDueDays}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, invoiceDefaultDueDays: parseInt(e.target.value, 10) || 30 }))
                  }
                  className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('settings.invoices.paymentTerms', 'Default payment terms text')}
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  {t('settings.invoices.placeholdersHint', 'You can use')}{' '}
                  <code className="bg-gray-100 px-1 rounded">{'{due_date}'}</code>,{' '}
                  <code className="bg-gray-100 px-1 rounded">{'{invoice_date}'}</code>,{' '}
                  <code className="bg-gray-100 px-1 rounded">{'{invoice_number}'}</code>,{' '}
                  <code className="bg-gray-100 px-1 rounded">{'{overdue_days}'}</code>.
                </p>
                <textarea
                  value={form.invoiceDefaultPaymentTerms}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceDefaultPaymentTerms: e.target.value }))}
                  rows={8}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {t('settings.invoices.sectionNumbering', 'Invoice numbering')}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {t(
                'settings.invoices.sectionNumberingHint',
                'Numbers are digits only (1, 2, 3…). Set the next number to issue — for example 3020 after switching systems. It must not match an existing invoice.'
              )}
            </p>
            {form.maxNumericInvoice > 0 && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
                {t(
                  'settings.invoices.maxNumericHint',
                  `Highest numeric invoice number in use: ${form.maxNumericInvoice}. The next number you set must not already exist and is usually above this if you still keep those invoices.`
                )}
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('settings.invoices.nextNumber', 'Next invoice number')}
              </label>
              <input
                type="number"
                min={1}
                value={form.invoiceNextNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, invoiceNextNumber: Math.max(1, parseInt(e.target.value, 10) || 1) }))
                }
                className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {t('settings.invoices.sectionEmail', 'Sending invoice to client')}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {t('settings.invoices.sectionEmailHint', 'Prefills the send dialog. Use')}{' '}
              <code className="bg-gray-100 px-1 rounded">{PLACEHOLDER_HINT}</code>{' '}
              {t('settings.invoices.sectionEmailHint2', 'in the subject.')}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('settings.invoices.emailSubject', 'Default subject')}
                </label>
                <input
                  type="text"
                  value={form.invoiceEmailDefaultSubject}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceEmailDefaultSubject: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('settings.invoices.emailBody', 'Default message (optional)')}
                </label>
                <p className="text-xs text-gray-500 mb-1">
                  {t('settings.invoices.emailBodyHint', 'Shown as the intro before the e-invoice button in the email.')}
                </p>
                <textarea
                  value={form.invoiceEmailDefaultBody}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceEmailDefaultBody: e.target.value }))}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {t('settings.invoices.sectionReminder', 'Reminders')}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {t('settings.invoices.sectionReminderHint', 'Defaults when you send a reminder for an invoice that was already sent.')}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('settings.invoices.reminderSubject', 'Default reminder subject')}
                </label>
                <input
                  type="text"
                  value={form.invoiceReminderDefaultSubject}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceReminderDefaultSubject: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('settings.invoices.reminderBody', 'Default reminder message')}
                </label>
                <textarea
                  value={form.invoiceReminderDefaultBody}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceReminderDefaultBody: e.target.value }))}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {saving ? t('app.common.saving', 'Saving…') : t('settings.invoices.save', 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
