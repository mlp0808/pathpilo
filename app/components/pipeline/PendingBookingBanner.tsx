'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CheckIcon } from '@heroicons/react/24/solid'
import { useAppI18n } from '../I18nProvider'
import { apiUrl } from '../../utils/api'
import { refreshNotifications } from '../../hooks/useNotifications'
import { pipelineHref } from '../../lib/pipeline'

/** Yellow visit from an accepted offer — admin marks it seen to make it a normal job. */
export default function PendingBookingBanner({
  offerId,
  onConfirmed,
}: {
  offerId: number
  onConfirmed: () => void
}) {
  const { t } = useAppI18n()
  const params = useParams()
  const slug = typeof params?.company === 'string' ? params.company : ''
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(apiUrl(`/offers/${offerId}/confirm`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not confirm')
      refreshNotifications()
      onConfirmed()
    } catch (e: any) {
      setError(e?.message || 'Could not confirm')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-1 h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-amber-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{t('app.pipeline.pendingTitle', 'Offer accepted')}</p>
          <p className="mt-0.5 text-xs text-gray-600">
            {t('app.pipeline.pendingBody', 'Verify the job to put it on the day as a normal visit. Move it first if the day doesn’t work. Reminders wait until then.')}
          </p>
          {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-accent-600 disabled:opacity-60"
            >
              <CheckIcon className="h-3.5 w-3.5" />
              {t('app.pipeline.action.confirm', 'Verify job')}
            </button>
            <Link
              href={pipelineHref(slug, { kind: 'offer', id: offerId })}
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-white hover:text-gray-900"
            >
              {t('app.pipeline.viewOffer', 'View offer')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
