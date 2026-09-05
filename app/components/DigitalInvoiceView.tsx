'use client'

import { useState } from 'react'
import { resolveAssetUrl } from '@/app/utils/api'
import Link from 'next/link'
import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentIcon,
  ArrowDownTrayIcon,
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
    /** Street line (preferred for multi-line layout). */
    address?: string | null
    /** Postal code + city on one line. */
    zipCity?: string | null
    /** Legacy combined address — used as fallback when address/zipCity absent. */
    addressLine: string | null
    country?: string | null
    countryCode?: string | null
    cvr: string | null
    /** Country-aware label for the company number ("CVR no.", "Co. Reg. No.", etc.) */
    cvrLabel?: string
    /** Separate VAT registration number (e.g. GB123456789 for UK). */
    vatNumber?: string | null
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

        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
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

        <article className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-sm">
          {/* Header: logo + date/#, then company | client on one row */}
          <div className="border-b border-gray-100 px-6 py-8 sm:px-10">
            <div className="mb-6 flex items-start justify-between gap-6">
              {inv.company.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveAssetUrl(inv.company.logoUrl) ?? inv.company.logoUrl ?? ''}
                  alt={inv.company.name || 'Company logo'}
                  className="h-12 w-auto max-w-[150px] object-contain"
                />
              ) : null}
              <div className={`space-y-1 text-right ${inv.company.logoUrl ? '' : 'ml-auto'}`}>
                <p className="text-sm font-medium text-gray-900">
                  {formatDateShort(inv.issueDate, locale)}
                </p>
                <p className="text-2xl font-bold tabular-nums tracking-tight text-[#193434]">
                  #{inv.invoiceNumber}
                </p>
                {inv.badge.sublabel && (
                  <p className="text-xs text-gray-500">{inv.badge.sublabel}</p>
                )}
              </div>
            </div>

            <div className="grid items-start gap-10 sm:grid-cols-2 sm:gap-16">
              <div className="min-w-0 space-y-0.5 text-sm text-gray-600">
                {inv.company.name && (
                  <p className="text-base font-semibold leading-snug text-[#193434]">{inv.company.name}</p>
                )}
                {inv.company.address ? (
                  <p>{inv.company.address}</p>
                ) : inv.company.addressLine ? (
                  <p>{inv.company.addressLine}</p>
                ) : null}
                {inv.company.zipCity && <p>{inv.company.zipCity}</p>}
                {inv.company.country && <p>{inv.company.country}</p>}
                {inv.company.cvr && (
                  <p>
                    {cvrLabel} {inv.company.cvr}
                  </p>
                )}
                {inv.company.vatNumber && <p>VAT {inv.company.vatNumber}</p>}
                {inv.company.email && <p>{inv.company.email}</p>}
                {inv.company.phone && <p>{inv.company.phone}</p>}
              </div>

              <div className="min-w-0 space-y-0.5 text-left text-sm text-gray-600 sm:ml-auto sm:max-w-xs sm:text-right">
                <p className="text-base font-semibold leading-snug text-gray-900">{inv.client.name}</p>
                {inv.client.address && <p className="whitespace-pre-line">{inv.client.address}</p>}
                {inv.client.ean && (
                  <p>
                    {tr('invoice.eanLabel', 'EAN/GLN')} {inv.client.ean}
                  </p>
                )}
                {inv.client.email && <p>{inv.client.email}</p>}
                {inv.client.phone && <p>{inv.client.phone}</p>}
              </div>
            </div>
          </div>

          {(inv.description || inv.title) && (
            <div className="space-y-2 border-b border-gray-100 px-6 py-8 sm:px-10">
              {inv.description && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{inv.description}</p>
              )}
              {inv.title && <p className="text-lg font-semibold text-gray-900">{inv.title}</p>}
            </div>
          )}

          <div className="px-6 py-8 sm:px-10">
            <div className="hidden grid-cols-[1fr,8rem] gap-3 border-b border-gray-100 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 sm:grid">
              <span>{tr('invoice.description', 'Description')}</span>
              <span className="text-right">{tr('invoice.amount', 'Amount')}</span>
            </div>
            {inv.lineItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">{tr('invoice.noLineItems', 'No line items')}</p>
            ) : (
              <div>
                {inv.lineItems.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-1 items-start gap-1 border-b border-gray-100 py-4 sm:grid-cols-[1fr,8rem] sm:gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{row.description}</p>
                      {Number(row.quantity) !== 1 && (
                        <p className="mt-0.5 text-xs text-gray-400">
                          {row.quantity} × {formatMoney(row.unitPrice, inv.currency)}
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-gray-900 sm:text-right">
                      {formatMoney(row.lineTotal, inv.currency)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8 grid gap-10 sm:grid-cols-[1.2fr,0.8fr] sm:gap-16">
              <div>
                {inv.paymentTermsResolved ? (
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-500">
                    {inv.paymentTermsResolved}
                  </p>
                ) : null}
                <div className={`${inv.paymentTermsResolved ? 'mt-3' : ''} space-y-1 text-xs text-gray-500`}>
                  <p>
                    <span className="text-gray-400">{tr('invoice.dueDate', 'Due date')} · </span>
                    <span className="font-medium text-gray-600">{inv.due.formatted || '—'}</span>
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm sm:ml-auto sm:w-full sm:max-w-xs">
                <div className="flex justify-between text-gray-600">
                  <span>{tr('invoice.subtotal', 'Subtotal')}</span>
                  <span className="tabular-nums">{formatMoney(inv.subtotal, inv.currency)}</span>
                </div>
                {inv.taxRate > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>
                      {taxLabel} ({inv.taxRate}%)
                    </span>
                    <span className="tabular-nums">{formatMoney(inv.taxAmount, inv.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold text-gray-900">
                  <span>{tr('invoice.total', 'Total')}</span>
                  <span className="tabular-nums">{formatMoney(inv.total, inv.currency)}</span>
                </div>
                {inv.balance > 0 && inv.balance !== inv.total && (
                  <div className="flex justify-between pt-1 text-sm font-semibold text-[#193434]">
                    <span>{tr('invoice.amountDue', 'Amount due')}</span>
                    <span className="tabular-nums">{formatMoney(inv.balance, inv.currency)}</span>
                  </div>
                )}
                {inv.transactions.length > 0 && (
                  <div className="space-y-2 border-t border-gray-100 pt-3">
                    {inv.transactions.map((t, i) => (
                      <div key={i} className="flex justify-between text-xs text-gray-600">
                        <span className="truncate pr-2">
                          {t.type === 'payment'
                            ? tr('invoice.payment', 'Payment')
                            : tr('invoice.adjustment', 'Adjustment')}{' '}
                          · {formatDateShort(t.date, locale)}
                        </span>
                        <span
                          className={
                            t.type === 'payment'
                              ? 'tabular-nums text-emerald-700'
                              : 'tabular-nums text-amber-700'
                          }
                        >
                          {t.type === 'payment' ? '−' : '+'} {formatMoney(t.amount, inv.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {showHowToPay && (
            <div className="border-t border-gray-100 px-6 py-8 sm:px-10">
              <div className="space-y-5">
                {inv.paymentMethods.map((m) => (
                  <div key={m.id} className="border-t border-gray-100 pt-5 first:border-t-0 first:pt-0">
                    <p className="text-xs font-semibold text-gray-900">{m.title}</p>
                    {m.description ? (
                      <p className="mt-0.5 text-xs text-gray-500">{m.description}</p>
                    ) : null}
                    {m.type === 'bank_transfer' && m.bank && (() => {
                      const isUk = inv.company.countryCode?.toUpperCase() === 'GB'
                      const detailRows: { label: string; value: string; mono?: boolean }[] = []
                      if (m.bank.accountHolder) {
                        detailRows.push({
                          label: tr('invoice.accountHolder', 'Account holder'),
                          value: m.bank.accountHolder,
                        })
                      }
                      if (isUk) {
                        if (m.bank.registrationNumber) {
                          detailRows.push({
                            label: tr('invoice.sortCode', 'Sort code'),
                            value: m.bank.registrationNumber,
                            mono: true,
                          })
                        }
                        if (m.bank.accountNumber) {
                          detailRows.push({
                            label: tr('invoice.accountNo', 'Account no.'),
                            value: m.bank.accountNumber,
                            mono: true,
                          })
                        }
                        if (m.bank.iban) {
                          detailRows.push({
                            label: tr('invoice.iban', 'IBAN'),
                            value: m.bank.iban.replace(/(.{4})/g, '$1 ').trim(),
                            mono: true,
                          })
                        }
                      } else {
                        if (m.bank.iban) {
                          detailRows.push({
                            label: tr('invoice.iban', 'IBAN'),
                            value: m.bank.iban.replace(/(.{4})/g, '$1 ').trim(),
                            mono: true,
                          })
                        }
                        if (m.bank.registrationNumber) {
                          detailRows.push({
                            label: tr('invoice.regNo', 'Reg. no.'),
                            value: m.bank.registrationNumber,
                            mono: true,
                          })
                        }
                        if (m.bank.accountNumber) {
                          detailRows.push({
                            label: tr('invoice.accountNo', 'Account no.'),
                            value: m.bank.accountNumber,
                            mono: true,
                          })
                        }
                      }
                      return (
                        <div className="mt-3">
                          <dl className="divide-y divide-gray-100 border-y border-gray-100">
                            {detailRows.map((row) => (
                              <div
                                key={row.label}
                                className="grid grid-cols-1 gap-0.5 py-2.5 sm:grid-cols-[8.5rem,1fr] sm:items-baseline sm:gap-4"
                              >
                                <dt className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                                  {row.label}
                                </dt>
                                <dd
                                  className={`text-xs text-gray-800 ${
                                    row.mono ? 'break-all font-mono tabular-nums tracking-tight' : 'font-medium'
                                  }`}
                                >
                                  {row.value}
                                </dd>
                              </div>
                            ))}
                            {m.bank.paymentReference && (
                              <div className="grid grid-cols-1 gap-2 py-2.5 sm:grid-cols-[8.5rem,1fr] sm:items-center sm:gap-4">
                                <dt className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                                  {tr('invoice.paymentReference', 'Payment reference')}
                                </dt>
                                <dd className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xs font-semibold tabular-nums text-gray-900">
                                    {m.bank.paymentReference}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => copyReference(m.bank!.paymentReference)}
                                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
                                  >
                                    <ClipboardDocumentIcon className="h-3 w-3" aria-hidden />
                                    {copied ? tr('invoice.copied', 'Copied') : tr('invoice.copy', 'Copy')}
                                  </button>
                                </dd>
                              </div>
                            )}
                          </dl>
                          {m.bank.instructions && (
                            <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-gray-500">
                              {m.bank.instructions}
                            </p>
                          )}
                        </div>
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
