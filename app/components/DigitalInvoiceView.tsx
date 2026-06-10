'use client'

import { useState } from 'react'
import { resolveAssetUrl } from '@/app/utils/api'
import Link from 'next/link'
import {
  BuildingOffice2Icon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  BanknotesIcon,
  ClipboardDocumentIcon,
  ArrowDownTrayIcon,
  EnvelopeIcon,
  PhoneIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline'
import { t as translate, type MessageKey } from '../i18n'

export type PublicInvoicePayload = {
  invoiceNumber: string
  title: string
  description: string
  issueDate: string
  dueDate: string
  currency: string
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  balance: number
  status: string
  /**
   * Language of this invoice. Comes from the company country at issue time
   * (snapshot) or the live country for drafts. ALL customer-facing labels on
   * this view are translated via this locale — not via the admin UI locale.
   * A Danish company's invoice always shows "Moms" / "FAKTURA" even when the
   * logged-in admin's dashboard is in English.
   */
  locale?: string
  showCompletedDate: boolean
  paymentTermsResolved: string
  /** Country-aware tax label: VAT / Moms / MVA / USt / etc. */
  taxLabel?: string
  /** Combined "Reference / PO" line for B2B invoices. Hidden when empty. */
  referenceText?: string | null
  client: {
    name: string
    address: string | null
    email: string | null
    phone: string | null
    /** Optional EAN/GLN for Danish public-sector invoicing. Hidden when empty. */
    ean?: string | null
  }
  company: {
    name: string | null
    addressLine: string | null
    country?: string | null
    countryCode?: string | null
    cvr: string | null
    /** Country-aware label for the company number ("CVR no.", "Org.nr", "USt-IdNr.", etc.) */
    cvrLabel?: string
    email?: string | null
    phone?: string | null
    website?: string | null
    /** Public URL path (or absolute URL) to the company logo. */
    logoUrl?: string | null
  }
  lineItems: Array<{
    id: number
    description: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }>
  transactions: Array<{
    type: string
    amount: number
    description: string
    paymentSource: string | null
    date: string
  }>
  due: {
    date: string
    daysUntilDue: number | null
    formatted: string | null
  }
  badge: {
    kind: string
    label: string
    sublabel: string | null
    daysOverdue?: number
    daysUntilDue?: number
  }
  paymentMethods: Array<{
    id: string
    title: string
    description: string
    type: string
    bank: {
      accountHolder: string
      iban: string
      accountNumber: string
      registrationNumber: string
      instructions: string
      paymentReference: string
    }
  }>
}

export function formatMoney(n: number, currency: string) {
  const v = Number(n) || 0
  return `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

// Locale-aware short date on the digital view. Kept in lockstep with the
// server's formatter in api-server/utils/eInvoicePayload.js so the PDF and
// the digital view never display a differently-formatted date for the same
// invoice.
const DIGITAL_MONTHS: Record<string, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  da: ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
}
function formatDateShort(iso: string | undefined, locale?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const loc = locale && DIGITAL_MONTHS[locale] ? locale : 'en'
  const months = DIGITAL_MONTHS[loc]
  const day = String(d.getDate()).padStart(2, '0')
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function badgeStyles(kind: string) {
  switch (kind) {
    case 'paid':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200/80'
    case 'overpaid':
      return 'bg-sky-50 text-sky-900 ring-sky-200/80'
    case 'overdue':
      return 'bg-rose-50 text-rose-900 ring-rose-200/80'
    case 'due_today':
      return 'bg-amber-50 text-amber-900 ring-amber-200/80'
    case 'due_soon':
      return 'bg-slate-100 text-slate-800 ring-slate-200/80'
    case 'draft':
      return 'bg-gray-100 text-gray-700 ring-gray-200/80'
    case 'cancelled':
    case 'credited':
      return 'bg-gray-100 text-gray-600 ring-gray-200/60'
    default:
      return 'bg-white text-slate-800 ring-slate-200/80'
  }
}

function BadgeIcon({ kind }: { kind: string }) {
  if (kind === 'paid' || kind === 'overpaid') return <CheckCircleIcon className="h-5 w-5 shrink-0" aria-hidden />
  if (kind === 'overdue' || kind === 'due_today') return <ExclamationTriangleIcon className="h-5 w-5 shrink-0" aria-hidden />
  return <ClockIcon className="h-5 w-5 shrink-0 opacity-80" aria-hidden />
}

type DigitalInvoiceViewProps = {
  data: PublicInvoicePayload
  /** Public client link, staff preview (auth), or embedded on admin invoice page */
  variant?: 'public' | 'preview' | 'admin'
  /** Shown in admin when no payment integrations; links to Extensions */
  extensionsHref?: string
  /** When true (usually no bank transfer enabled), show warning in the payment section on admin */
  adminPaymentMissing?: boolean
  /** When provided, a "Download PDF" button is shown on the public invoice. */
  pdfHref?: string
}

export function DigitalInvoiceView({
  data: inv,
  variant = 'public',
  extensionsHref = '/settings/extensions',
  adminPaymentMissing = false,
  pdfHref,
}: DigitalInvoiceViewProps) {
  const [copied, setCopied] = useState(false)
  const badgeKind = inv.badge.kind

  // Locale of the INVOICE (derived from company country). This is the single
  // language in which every customer-facing label on this view is rendered,
  // regardless of whether the viewer is the paying client (public), the
  // admin previewing the email (preview), or an admin reviewing the history
  // page (admin). It decouples invoice wording from the admin's UI locale —
  // a requirement the user explicitly called out.
  const locale = inv.locale || 'en'
  const tr = (key: MessageKey, fallback?: string) => translate(locale, key, fallback)
  const trInterp = (key: MessageKey, values: Record<string, string | number>, fallback?: string) => {
    const tpl = tr(key, fallback)
    return tpl.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
      Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : '',
    )
  }

  const copyReference = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const showHowToPay = inv.paymentMethods.length > 0 && inv.balance > 0
  const showAdminPaymentGap =
    adminPaymentMissing && variant === 'admin' && inv.balance > 0 && inv.paymentMethods.length === 0

  const taxLabel = inv.taxLabel || tr('invoice.vatFallback', 'VAT')
  const cvrLabel = inv.company.cvrLabel || tr('invoice.companyNoFallback', 'Company no.')
  // Build a small "questions?" footer pulling whatever contact details the
  // company has filled in. All fields are optional — only what's set is shown.
  const companyContacts = [inv.company.email, inv.company.phone, inv.company.website].filter(Boolean) as string[]
  const footerInner =
    variant === 'preview'
      ? tr('invoice.previewFooter', 'This is a staff preview. Clients only get a shareable link after the invoice is sent.')
      : variant === 'admin'
        ? tr('invoice.adminFooter', 'Internal view \u2014 matches what clients see on the digital invoice (except payment methods may differ until Extensions are configured).')
        : `${tr('invoice.secureLink', 'Secure link \u2014 keep it private.')} ${
            companyContacts.length > 0
              ? trInterp(
                  'invoice.questionsContact',
                  { who: inv.company.name || tr('invoice.theSender', 'the sender'), ways: companyContacts.join(' \u00b7 ') },
                  `Questions? Contact ${inv.company.name || 'the sender'} via ${companyContacts.join(' \u00b7 ')}.`,
                )
              : trInterp(
                  'invoice.questionsContactShort',
                  { who: inv.company.name || tr('invoice.theSender', 'the sender') },
                  `Questions? Contact ${inv.company.name || 'the sender'}.`,
                )
          }`

  const subFooter =
    variant === 'public'
      ? tr('invoice.poweredBySub', 'Powered by a secure link. Do not share if you are not the intended recipient.')
      : variant === 'preview'
        ? tr('invoice.previewSubFooter', 'Preview only — not shared with the client.')
        : null

  return (
    <div className={`bg-slate-50 ${variant === 'admin' ? 'min-h-0' : 'min-h-screen'}`}>
      <div className="relative mx-auto max-w-lg px-4 pb-12 pt-2 sm:max-w-2xl sm:px-6 sm:pt-4 lg:max-w-3xl">
        {variant === 'preview' && (
          <div className="mb-6 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 shadow-sm">
            <p className="font-semibold">{tr('invoice.previewBanner', 'Preview')}</p>
            <p className="mt-1 text-amber-900/90">
              {tr(
                'invoice.previewBannerBody',
                'This is how the client will see the digital invoice. A public link is only available after you send the invoice.',
              )}
            </p>
          </div>
        )}

        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            {inv.company.logoUrl ? (
              // Uploaded company logo (rendered via the API server's /uploads
              // proxy). max-h ensures even tall logos don't blow up the header.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveAssetUrl(inv.company.logoUrl) ?? inv.company.logoUrl ?? ''}
                alt={inv.company.name || 'Company logo'}
                className="h-14 w-auto max-w-[180px] object-contain rounded-md bg-white"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#193434] shadow-lg shadow-[#193434]/25">
                <BuildingOffice2Icon className="h-6 w-6 text-[#3DD57A]" aria-hidden />
              </div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {tr('invoice.invoiceFrom', 'Invoice from')}
              </p>
              {inv.company.name && (
                <h1 className="text-xl font-bold tracking-tight text-[#193434] sm:text-2xl">{inv.company.name}</h1>
              )}
              {inv.company.addressLine && (
                <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-600">{inv.company.addressLine}</p>
              )}
              {inv.company.country && (
                <p className="text-xs text-slate-500">{inv.company.country}</p>
              )}
              {inv.company.cvr && (
                <p className="mt-1 text-xs text-slate-500">
                  {cvrLabel} {inv.company.cvr}
                </p>
              )}
              {(inv.company.email || inv.company.phone || inv.company.website) && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  {inv.company.email && (
                    <span className="inline-flex items-center gap-1">
                      <EnvelopeIcon className="h-3 w-3" aria-hidden />
                      {inv.company.email}
                    </span>
                  )}
                  {inv.company.phone && (
                    <span className="inline-flex items-center gap-1">
                      <PhoneIcon className="h-3 w-3" aria-hidden />
                      {inv.company.phone}
                    </span>
                  )}
                  {inv.company.website && (
                    <span className="inline-flex items-center gap-1">
                      <GlobeAltIcon className="h-3 w-3" aria-hidden />
                      {inv.company.website.replace(/^https?:\/\//, '')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 self-start">
            <div
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 ${badgeStyles(badgeKind)}`}
            >
              <BadgeIcon kind={badgeKind} />
              <span>{inv.badge.label}</span>
            </div>
            {pdfHref && variant === 'public' && (
              <a
                href={pdfHref}
                download
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-[#193434] ring-1 ring-slate-200 shadow-sm hover:bg-slate-50"
                title={tr('invoice.downloadPdf', 'Download PDF')}
              >
                <ArrowDownTrayIcon className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">{tr('invoice.downloadPdf', 'Download PDF')}</span>
                <span className="sm:hidden">{tr('invoice.pdfShort', 'PDF')}</span>
              </a>
            )}
          </div>
        </header>

        <article className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-900/5 ring-1 ring-slate-900/5">
          <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-5 sm:px-8 sm:py-7">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  {tr('invoice.invoiceLower', 'Invoice')}
                </p>
                <p className="text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">#{inv.invoiceNumber}</p>
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600 sm:mt-0">
                <CalendarDaysIcon className="h-5 w-5 text-[#3DD57A]" aria-hidden />
                <div>
                  <p>
                    <span className="text-slate-500">{tr('invoice.due', 'Due')} </span>
                    <span className="font-semibold text-slate-900">{inv.due.formatted || '—'}</span>
                  </p>
                  {inv.badge.sublabel && <p className="text-xs text-slate-500">{inv.badge.sublabel}</p>}
                </div>
              </div>
            </div>
            {(inv.title || inv.description) && (
              <div className="mt-5 border-t border-slate-200/80 pt-5">
                {inv.title && <p className="font-semibold text-slate-900">{inv.title}</p>}
                {inv.description && (
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{inv.description}</p>
                )}
              </div>
            )}
          </div>

          <div className="border-b border-slate-100 px-5 py-6 sm:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {tr('invoice.billToShort', 'Bill to')}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{inv.client.name}</p>
                {inv.client.address && <p className="mt-1 text-sm text-slate-600">{inv.client.address}</p>}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                  {inv.client.email && <span>{inv.client.email}</span>}
                  {inv.client.phone && <span>{inv.client.phone}</span>}
                </div>
                {inv.client.ean && (
                  <p className="mt-2 text-xs text-slate-500">
                    {tr('invoice.eanLabel', 'EAN/GLN')}{' '}
                    <span className="font-mono text-slate-700">{inv.client.ean}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-b border-slate-100 px-5 py-4 sm:grid-cols-3 sm:px-8">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                {tr('invoice.issueDate', 'Issue date')}
              </p>
              <p className="mt-0.5 text-sm font-medium text-slate-900">{formatDateShort(inv.issueDate, locale)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                {tr('invoice.dueDate', 'Due date')}
              </p>
              <p className="mt-0.5 text-sm font-medium text-slate-900">{inv.due.formatted || '—'}</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                {tr('invoice.amountDue', 'Amount due')}
              </p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-[#193434]">
                {formatMoney(inv.balance > 0 ? inv.balance : 0, inv.currency)}
              </p>
            </div>
          </div>

          <div className="px-5 py-6 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {tr('invoice.lineItems', 'Line items')}
            </p>
            <div className="mt-3 hidden overflow-x-auto rounded-xl border border-slate-100 sm:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">{tr('invoice.description', 'Description')}</th>
                    <th className="px-4 py-3 text-right">{tr('invoice.qty', 'Qty')}</th>
                    <th className="px-4 py-3 text-right">{tr('invoice.price', 'Price')}</th>
                    <th className="px-4 py-3 text-right">{tr('invoice.amount', 'Amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inv.lineItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        {tr('invoice.noLineItems', 'No line items')}
                      </td>
                    </tr>
                  ) : (
                    inv.lineItems.map((row) => (
                      <tr key={row.id} className="text-slate-800">
                        <td className="px-4 py-3 align-top">{row.description}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{row.quantity}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatMoney(row.unitPrice, inv.currency)}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{formatMoney(row.lineTotal, inv.currency)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <ul className="mt-3 space-y-3 sm:hidden">
              {inv.lineItems.map((row) => (
                <li key={row.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                  <p className="font-medium text-slate-900">{row.description}</p>
                  <div className="mt-2 flex justify-between text-sm text-slate-600">
                    <span>
                      {row.quantity} × {formatMoney(row.unitPrice, inv.currency)}
                    </span>
                    <span className="font-semibold tabular-nums text-slate-900">{formatMoney(row.lineTotal, inv.currency)}</span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex justify-end">
              <div className="w-full max-w-xs space-y-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>{tr('invoice.subtotal', 'Subtotal')}</span>
                  <span className="tabular-nums">{formatMoney(inv.subtotal, inv.currency)}</span>
                </div>
                {inv.taxRate > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>{taxLabel} ({inv.taxRate}%)</span>
                    <span className="tabular-nums">{formatMoney(inv.taxAmount, inv.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                  <span>{tr('invoice.total', 'Total')}</span>
                  <span className="tabular-nums">{formatMoney(inv.total, inv.currency)}</span>
                </div>
                {inv.transactions.length > 0 && (
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    {inv.transactions.map((t, i) => (
                      <div key={i} className="flex justify-between text-xs text-slate-600">
                        <span className="truncate pr-2">
                          {t.type === 'payment'
                            ? tr('invoice.payment', 'Payment')
                            : tr('invoice.adjustment', 'Adjustment')}{' '}
                          · {formatDateShort(t.date, locale)}
                        </span>
                        <span className={t.type === 'payment' ? 'text-emerald-700 tabular-nums' : 'text-amber-700 tabular-nums'}>
                          {t.type === 'payment' ? '−' : '+'} {formatMoney(t.amount, inv.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {inv.paymentTermsResolved && (
            <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-5 sm:px-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {tr('invoice.paymentTerms', 'Payment terms')}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{inv.paymentTermsResolved}</p>
            </div>
          )}

          {showHowToPay && (
            <div className="border-t border-slate-100 px-5 py-7 sm:px-8">
              <div className="mb-4 flex items-center gap-2">
                <BanknotesIcon className="h-6 w-6 text-[#3DD57A]" aria-hidden />
                <h2 className="text-lg font-bold text-[#193434]">{tr('invoice.howToPay', 'How to pay')}</h2>
              </div>
              <p className="mb-5 text-sm text-slate-600">
                {tr(
                  'invoice.howToPayIntro',
                  'You can pay using the options below. Please include the payment reference so we can match your payment to this invoice.',
                )}
              </p>
              <div className="space-y-4">
                {inv.paymentMethods.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-2xl border border-emerald-200/60 bg-[linear-gradient(135deg,rgba(61,213,122,0.08)_0%,rgba(255,255,255,0.9)_50%)] p-5 shadow-sm ring-1 ring-emerald-900/5"
                  >
                    <p className="font-semibold text-[#193434]">{m.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{m.description}</p>
                    {m.type === 'bank_transfer' && m.bank && (() => {
                      const isUk = inv.company.countryCode?.toUpperCase() === 'GB'
                      const regSortBlock = (m.bank.registrationNumber || m.bank.accountNumber) ? (
                        <div className="flex flex-wrap gap-6">
                          {m.bank.registrationNumber && (
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                                {isUk
                                  ? tr('invoice.sortCode', 'Sort code')
                                  : tr('invoice.regNo', 'Reg. no.')}
                              </dt>
                              <dd className="mt-0.5 font-mono font-medium">{m.bank.registrationNumber}</dd>
                            </div>
                          )}
                          {m.bank.accountNumber && (
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                                {tr('invoice.accountNo', 'Account no.')}
                              </dt>
                              <dd className="mt-0.5 font-mono font-medium">{m.bank.accountNumber}</dd>
                            </div>
                          )}
                        </div>
                      ) : null
                      const ibanBlock = m.bank.iban ? (
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                            {tr('invoice.iban', 'IBAN')}
                          </dt>
                          <dd className="mt-0.5 break-all font-mono text-sm font-medium tracking-tight text-slate-900">
                            {m.bank.iban.replace(/(.{4})/g, '$1 ').trim()}
                          </dd>
                        </div>
                      ) : null
                      return (
                      <dl className="mt-4 space-y-3 text-sm">
                        {m.bank.accountHolder && (
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                              {tr('invoice.accountHolder', 'Account holder')}
                            </dt>
                            <dd className="mt-0.5 font-medium text-slate-900">{m.bank.accountHolder}</dd>
                          </div>
                        )}
                        {isUk ? (
                          <>
                            {regSortBlock}
                            {ibanBlock}
                          </>
                        ) : (
                          <>
                            {ibanBlock}
                            {regSortBlock}
                          </>
                        )}
                        {m.bank.paymentReference && (
                          <div className="rounded-xl bg-white/80 p-3 ring-1 ring-slate-200/80">
                            <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                              {tr('invoice.paymentReference', 'Payment reference')}
                            </dt>
                            <dd className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-slate-900">{m.bank.paymentReference}</span>
                              <button
                                type="button"
                                onClick={() => copyReference(m.bank!.paymentReference)}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#193434] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#142828]"
                              >
                                <ClipboardDocumentIcon className="h-3.5 w-3.5" aria-hidden />
                                {copied ? tr('invoice.copied', 'Copied') : tr('invoice.copy', 'Copy')}
                              </button>
                            </dd>
                          </div>
                        )}
                        {m.bank.instructions && (
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
                              {tr('invoice.instructions', 'Instructions')}
                            </dt>
                            <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{m.bank.instructions}</dd>
                          </div>
                        )}
                      </dl>
                      )
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}

          {showAdminPaymentGap && (
            <div className="border-t border-amber-100 bg-amber-50/50 px-5 py-7 sm:px-8">
              <div className="mb-2 flex items-center gap-2">
                <ExclamationTriangleIcon className="h-6 w-6 text-amber-600" aria-hidden />
                <h2 className="text-lg font-bold text-amber-950">
                  {tr('invoice.noPaymentOptions', 'No payment options configured')}
                </h2>
              </div>
              <p className="text-sm text-amber-950/90">
                {tr(
                  'invoice.noPaymentOptionsBody',
                  'Clients will not see how to pay until you enable at least one payment method (for example bank transfer) under Extensions.',
                )}
              </p>
              <Link
                href={extensionsHref}
                className="mt-4 inline-flex text-sm font-semibold text-[#193434] underline decoration-[#193434]/30 underline-offset-2 hover:decoration-[#193434]"
              >
                {tr('invoice.openExtensions', 'Open Extensions')}
              </Link>
            </div>
          )}

          <footer className="border-t border-slate-100 px-5 py-5 text-center text-xs text-slate-500 sm:px-8">{footerInner}</footer>
        </article>

        {subFooter && <p className="mt-8 text-center text-[11px] text-slate-400">{subFooter}</p>}
      </div>
    </div>
  )
}
