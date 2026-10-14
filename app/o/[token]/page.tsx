'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { CheckIcon } from '@heroicons/react/24/solid'
import { apiUrl } from '@/app/utils/api'
import OfferDocument from '@/app/components/offers/OfferDocument'
import {
  formatDay,
  formatDocMoney,
  offerLabel,
  parseYmd,
  todayYmd,
  type OfferDocumentData,
} from '@/app/lib/offers'

export default function PublicOfferPage() {
  const params = useParams()
  const search = useSearchParams()
  const token = typeof params?.token === 'string' ? params.token : ''
  const preview = search.get('preview') === '1'
  const [doc, setDoc] = useState<OfferDocumentData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => {
    let alive = true
    fetch(apiUrl(`/public/offers/${encodeURIComponent(token)}${preview ? '?preview=1' : ''}`), { credentials: 'omit' })
      .then(async res => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Offer not found')
        return data
      })
      .then(data => {
        if (!alive) return
        setDoc(data.document)
        if (data.document?.days?.length === 1) setSelected(data.document.days[0].date)
      })
      .catch(e => { if (alive) setError(e?.message || 'Offer not found') })
    return () => { alive = false }
  }, [token, preview])

  const accept = async () => {
    if (!doc) return
    if (doc.days.length > 0 && !selected) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(apiUrl(`/public/offers/${encodeURIComponent(token)}/accept`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selected ? { date: selected } : {}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not accept')
      setDoc({ ...doc, status: 'accepted', acceptedDate: data.date || null, acceptedAt: new Date().toISOString() })
    } catch (e: any) {
      setError(e?.message || 'Could not accept')
    } finally {
      setSubmitting(false)
    }
  }

  const decline = async () => {
    if (!doc) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(apiUrl(`/public/offers/${encodeURIComponent(token)}/decline`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not decline')
      setDoc({ ...doc, status: 'declined', declinedAt: new Date().toISOString() })
      setDeclining(false)
    } catch (e: any) {
      setError(e?.message || 'Could not decline')
    } finally {
      setSubmitting(false)
    }
  }

  if (error && !doc) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f7f5] p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg ring-1 ring-black/5">
          <p className="text-lg font-semibold text-slate-900">{offerLabel('en', 'notFound')}</p>
          <p className="mt-2 text-sm text-slate-600">{offerLabel('en', 'notFoundBody')}</p>
        </div>
      </main>
    )
  }

  if (!doc) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f7f5]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#193434]/15 border-t-[#3DD57A]" />
      </main>
    )
  }

  const L = (k: Parameters<typeof offerLabel>[1]) => offerLabel(doc.locale, k)
  const isAccepted = doc.status === 'accepted'
  const isConfirmed = isAccepted && !!doc.confirmedAt
  const isDeclined = doc.status === 'declined'
  const isExpired = !isAccepted && !isDeclined && !!doc.validUntil && String(doc.validUntil).slice(0, 10) < todayYmd()
  const isOpen = !isAccepted && !isDeclined && !isExpired
  const canAccept = isOpen && (doc.days.length === 0 || !!selected)
  const total = formatDocMoney(doc.total, doc.currency, doc.locale)
  const acceptLabel = doc.days.length > 0 && selected
    ? `${L('acceptOn')} ${formatDay(selected, doc.locale, { weekday: 'short', day: 'numeric', month: 'short' })}`
    : L('accept')
  const acceptedDay = doc.acceptedDate
    ? formatDay(String(doc.acceptedDate).slice(0, 10), doc.locale, { weekday: 'long', day: 'numeric', month: 'long' })
    : null

  const panel = isAccepted ? (
    <div className="px-6 py-8 text-center sm:px-10">
      {isConfirmed ? (
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#3DD57A] text-white shadow-lg shadow-[#3DD57A]/30">
          <CheckIcon className="h-7 w-7" />
        </div>
      ) : (
        <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white ring-2 ring-[#3DD57A]">
          <CheckIcon className="h-7 w-7 text-[#3DD57A]" />
          <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 animate-pulse rounded-full bg-amber-400 ring-2 ring-white" />
        </div>
      )}
      <p className="mt-4 text-lg font-bold text-gray-900">{isConfirmed ? L('confirmed') : L('requested')}</p>
      {acceptedDay && (
        <p className="mt-1 text-[15px] font-semibold text-[#193434]">
          {isConfirmed ? L('bookedFor') : L('requestedFor')} {acceptedDay}
        </p>
      )}
      <p className="mt-2 text-sm text-gray-500">
        {isConfirmed ? L('thanks') : `${doc.company.name} ${L('requestedBody')}`}
      </p>
    </div>
  ) : isDeclined ? (
    <div className="px-6 py-8 text-center sm:px-10">
      <p className="text-base font-semibold text-gray-900">{L('declined')}</p>
      <p className="mt-1 text-sm text-gray-500">{L('declinedBody')}</p>
    </div>
  ) : isExpired ? (
    <div className="px-6 py-6 text-center text-sm font-semibold text-gray-500 sm:px-10">{L('expired')}</div>
  ) : (
    <div className="px-6 py-6 sm:px-10">
      {doc.days.length > 0 && (
        <>
          <p className="mb-3 text-sm font-semibold text-gray-900">{L('pickDay')}</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {doc.days.map(d => {
              const on = selected === d.date
              const dt = parseYmd(d.date)
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setSelected(d.date)}
                  className={`relative rounded-2xl border px-3 py-3.5 text-left transition-all ${
                    on
                      ? 'border-accent-500 bg-white text-gray-900 shadow-sm ring-1 ring-accent-500/30'
                      : 'border-gray-200 bg-white text-gray-900 hover:border-gray-300'
                  }`}
                >
                  <span className={`block text-[11px] font-semibold uppercase tracking-wider ${on ? 'text-accent-700' : 'text-gray-400'}`}>
                    {dt.toLocaleDateString(doc.locale === 'da' ? 'da-DK' : 'en-GB', { weekday: 'long' })}
                  </span>
                  <span className="mt-0.5 block text-lg font-bold tabular-nums">
                    {dt.toLocaleDateString(doc.locale === 'da' ? 'da-DK' : 'en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                  {on && (
                    <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent-500">
                      <CheckIcon className="h-3 w-3 text-white" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
      <button
        type="button"
        onClick={accept}
        disabled={!canAccept || submitting || preview}
        className="mt-5 hidden w-full rounded-xl bg-accent-500 py-3.5 text-[15px] font-semibold text-white transition hover:bg-accent-600 disabled:opacity-40 sm:block"
      >
        {submitting ? '…' : acceptLabel}
      </button>
      {declining ? (
        <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
          <p className="text-sm font-semibold text-gray-900">{L('declineTitle')}</p>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            placeholder={L('declineReason')}
            className="mt-2 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setDeclining(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
              {L('cancel')}
            </button>
            <button
              type="button"
              onClick={decline}
              disabled={submitting || preview}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-40"
            >
              {L('declineConfirm')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setDeclining(true)}
            className="text-sm font-medium text-gray-400 underline-offset-4 transition hover:text-gray-700 hover:underline"
          >
            {L('decline')}
          </button>
        </div>
      )}
    </div>
  )

  return (
    <main className="min-h-screen bg-[#f4f7f5] pb-28 sm:pb-12">
      <div className="mx-auto max-w-2xl px-3 pt-5 sm:px-6 sm:pt-10">
        {preview && (
          <div className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-center text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
            Preview
          </div>
        )}
        <OfferDocument data={doc}>{panel}</OfferDocument>
      </div>

      {isOpen && !declining && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur sm:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{L('total')}</p>
              <p className="truncate text-base font-bold tabular-nums text-[#193434]">{total}</p>
            </div>
            <button
              type="button"
              onClick={accept}
              disabled={!canAccept || submitting || preview}
              className="ml-auto flex-1 rounded-xl bg-accent-500 py-3.5 text-[15px] font-semibold text-white disabled:opacity-40"
            >
              {submitting ? '…' : doc.days.length > 0 && !selected ? L('pickDay') : acceptLabel}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
