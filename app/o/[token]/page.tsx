'use client'

/**
 * Public offer page — /o/{token} (Phase 3 of the map multitool).
 *
 * The recipient sees the offer and the proposed visit dates, picks one, and
 * the job is scheduled automatically into that employee's route. No login.
 */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiUrl } from '@/app/utils/api'
import { CheckCircleIcon, CalendarDaysIcon, MapPinIcon } from '@heroicons/react/24/outline'

interface PublicOffer {
  company_name: string
  title: string | null
  message: string | null
  recipient_name: string | null
  address: string
  price: string | number | null
  status: string
  accepted_date: string | null
  proposed_dates: { date: string; time_hint: string | null }[]
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export default function PublicOfferPage() {
  const params = useParams()
  const token = typeof params?.token === 'string' ? params.token : ''
  const [offer, setOffer] = useState<PublicOffer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [acceptedDate, setAcceptedDate] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(apiUrl(`/public/offers/${encodeURIComponent(token)}`))
      .then(async res => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Offer not found')
        return res.json()
      })
      .then(data => {
        if (!alive) return
        setOffer(data.offer)
        if (data.offer?.status === 'accepted') setAcceptedDate(data.offer.accepted_date)
      })
      .catch(e => { if (alive) setError(e?.message || 'Offer not found') })
    return () => { alive = false }
  }, [token])

  const handleAccept = async () => {
    if (!selected) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(apiUrl(`/public/offers/${encodeURIComponent(token)}/accept`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selected }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not confirm the date')
      setAcceptedDate(selected)
    } catch (e: any) {
      setError(e?.message || 'Could not confirm the date')
    } finally {
      setSubmitting(false)
    }
  }

  if (error && !offer) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-white shadow-sm border border-gray-200 p-8 text-center">
          <h1 className="text-lg font-bold text-gray-800 mb-1">Offer not available</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </main>
    )
  }

  if (!offer) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-8 h-8 rounded-full border-2 border-gray-300 border-t-accent-500 animate-spin" />
      </main>
    )
  }

  const isAccepted = acceptedDate != null

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Offer from</div>
          <h1 className="text-xl font-bold text-gray-900">{offer.company_name}</h1>
        </div>

        <div className="rounded-2xl bg-white shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">{offer.title || 'Service offer'}</h2>
            {offer.recipient_name && (
              <p className="text-sm text-gray-500 mt-0.5">For {offer.recipient_name}</p>
            )}
            {offer.address && (
              <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-2">
                <MapPinIcon className="w-4 h-4 flex-shrink-0" /> {offer.address}
              </p>
            )}
            {offer.price != null && Number(offer.price) > 0 && (
              <p className="text-sm font-semibold text-gray-800 mt-2">Price: {offer.price}</p>
            )}
            {offer.message && (
              <p className="text-sm text-gray-600 mt-3 whitespace-pre-line">{offer.message}</p>
            )}
          </div>

          <div className="p-6">
            {isAccepted ? (
              <div className="text-center py-2">
                <CheckCircleIcon className="w-12 h-12 text-accent-500 mx-auto mb-3" />
                <h3 className="text-base font-bold text-gray-900">You&apos;re booked in</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {acceptedDate ? fmtDate(String(acceptedDate).split('T')[0]) : ''}
                </p>
                <p className="text-xs text-gray-400 mt-3">
                  {offer.company_name} has been notified and will see you then.
                </p>
              </div>
            ) : (
              <>
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-800 mb-3">
                  <CalendarDaysIcon className="w-4 h-4" /> Choose a date that suits you
                </h3>
                <div className="space-y-2">
                  {offer.proposed_dates.map(d => (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => setSelected(d.date)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                        selected === d.date
                          ? 'border-accent-500 bg-accent-500/[0.06] ring-1 ring-accent-500'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="block text-sm font-semibold text-gray-800">{fmtDate(d.date)}</span>
                      {d.time_hint && <span className="block text-xs text-gray-500 mt-0.5">{d.time_hint}</span>}
                    </button>
                  ))}
                </div>

                {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={!selected || submitting}
                  className="mt-4 w-full rounded-full bg-accent-500 text-white text-sm font-semibold py-3 hover:bg-accent-600 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Confirming…' : 'Confirm this date'}
                </button>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">Powered by PathPilo</p>
      </div>
    </main>
  )
}
