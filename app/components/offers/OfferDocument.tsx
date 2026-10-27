'use client'

import type { ReactNode } from 'react'
import { resolveAssetUrl } from '@/app/utils/api'
import {
  formatDocDate,
  formatDocMoney,
  offerLabel,
  type OfferDocumentData,
} from '@/app/lib/offers'

function fmtMinutes(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h === 0) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

export default function OfferDocument({
  data,
  children,
}: {
  data: OfferDocumentData
  /** Rendered as the last section inside the card (e.g. day picker + accept). */
  children?: ReactNode
}) {
  const L = (k: Parameters<typeof offerLabel>[1]) => offerLabel(data.locale, k)
  const money = (n: number) => formatDocMoney(n, data.currency, data.moneyLocale || data.locale)
  const logo = data.company.logoUrl ? resolveAssetUrl(data.company.logoUrl) || data.company.logoUrl : null
  const contacts = [data.company.email, data.company.phone, data.company.website].filter(Boolean)

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_12px_32px_-12px_rgba(15,23,42,0.12)]">
      <header className="px-6 pb-7 pt-7 sm:px-10 sm:pt-9">
        <div className="flex items-start justify-between gap-6">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={data.company.name} className="h-11 w-auto max-w-[160px] object-contain sm:h-12" />
          ) : (
            <p className="text-lg font-bold tracking-tight text-[#193434]">{data.company.name}</p>
          )}
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">{L('offer')}</p>
            {data.number && (
              <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-[#193434]">#{data.number}</p>
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-6 text-sm text-gray-600 sm:grid-cols-2 sm:gap-12">
          <div className="min-w-0 space-y-0.5">
            <p className="font-semibold text-gray-900">{data.company.name}</p>
            {data.company.address && <p>{data.company.address}</p>}
            {data.company.zipCity && <p>{data.company.zipCity}</p>}
            {data.company.cvr && <p>{data.company.cvrLabel} {data.company.cvr}</p>}
            {data.company.vatNumber && <p>VAT {data.company.vatNumber}</p>}
          </div>
          <div className="min-w-0 space-y-0.5 sm:text-right">
            <p className="font-semibold text-gray-900">{data.client.name || '—'}</p>
            {data.client.address && <p className="whitespace-pre-line">{data.client.address}</p>}
            {data.client.email && <p>{data.client.email}</p>}
            {data.client.phone && <p>{data.client.phone}</p>}
          </div>
        </div>

        <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-gray-100 text-sm sm:grid-cols-3">
          <div className="bg-gray-50/80 px-4 py-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{L('date')}</dt>
            <dd className="mt-0.5 font-semibold text-gray-900">{formatDocDate(data.sentAt || data.createdAt, data.dateLocale || data.locale)}</dd>
          </div>
          <div className="bg-gray-50/80 px-4 py-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{L('validUntil')}</dt>
            <dd className="mt-0.5 font-semibold text-gray-900">
              {data.validUntil ? formatDocDate(data.validUntil, data.dateLocale || data.locale) : L('forever')}
            </dd>
          </div>
          {data.durationMinutes > 0 && (
            <div className="col-span-2 bg-gray-50/80 px-4 py-3 sm:col-span-1">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{L('estTime')}</dt>
              <dd className="mt-0.5 font-semibold text-gray-900">{fmtMinutes(data.durationMinutes)}</dd>
            </div>
          )}
        </dl>
      </header>

      {data.title && (
        <div className="border-t border-gray-100 px-6 pt-6 sm:px-10">
          <h1 className="text-lg font-semibold tracking-tight text-gray-900">{data.title}</h1>
        </div>
      )}

      {data.message && (
        <div className={`px-6 pb-6 sm:px-10 ${data.title ? 'pt-2' : 'border-t border-gray-100 py-6'}`}>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-700">{data.message}</p>
        </div>
      )}

      <section className="border-t border-gray-100 px-6 py-6 sm:px-10">
        <div className="flex justify-between border-b border-gray-100 pb-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          <span>{L('description')}</span>
          <span>{L('amount')}</span>
        </div>
        {data.items.map((row, i) => (
          <div key={`${row.title}-${i}`} className="flex items-start justify-between gap-4 border-b border-gray-100 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">{row.title}</p>
              {row.quantity !== 1 && (
                <p className="mt-0.5 text-xs tabular-nums text-gray-400">
                  {row.quantity} × {money(row.unitPrice)}
                </p>
              )}
            </div>
            <p className="flex-shrink-0 text-sm font-semibold tabular-nums text-gray-900">{money(row.lineTotal)}</p>
          </div>
        ))}

        <div className="ml-auto mt-5 max-w-xs space-y-1.5 text-sm">
          {data.taxRate > 0 && (
            <>
              <div className="flex justify-between text-gray-500">
                <span>{L('subtotal')}</span>
                <span className="tabular-nums">{money(data.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>{data.taxLabel} ({data.taxRate}%)</span>
                <span className="tabular-nums">{money(data.taxAmount)}</span>
              </div>
            </>
          )}
          <div className="flex items-baseline justify-between border-t border-gray-200 pt-2.5">
            <span className="font-semibold text-gray-900">{L('total')}</span>
            <span className="text-xl font-bold tabular-nums text-[#193434]">{money(data.total)}</span>
          </div>
        </div>
      </section>

      {children && <div className="border-t border-gray-100">{children}</div>}

      {contacts.length > 0 && (
        <footer className="border-t border-gray-100 bg-gray-50/60 px-6 py-4 text-center text-xs text-gray-500 sm:px-10">
          {L('questions')} {data.company.name} · {contacts.join(' · ')}
        </footer>
      )}
    </article>
  )
}
