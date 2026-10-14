'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DocumentTextIcon } from '@heroicons/react/24/outline'
import { useAppI18n } from '../I18nProvider'
import { apiUrl } from '../../utils/api'
import { useNotifications } from '../../hooks/useNotifications'
import { todayYmd, type OfferDate, type OfferRecord } from '../../lib/offers'
import { fill, isExpired, offerName, pipelineHref } from '../../lib/pipeline'

export type OfferOut = { id: number; name: string; number: string | null; userId: number | null }

/** Sent offers that are still open, keyed by each day they suggest. */
export function useOffersOutByDate(): Record<string, OfferOut[]> {
  const [offers, setOffers] = useState<OfferRecord[]>([])
  const { items } = useNotifications()
  const newest = items[0]?.id

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    let cancelled = false
    fetch(apiUrl('/offers'), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : { offers: [] }))
      .then(d => { if (!cancelled) setOffers(d?.offers || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [newest])

  return useMemo(() => {
    const today = todayYmd()
    const map: Record<string, OfferOut[]> = {}
    for (const o of offers) {
      if (o.status !== 'sent' || o.archived_at || isExpired(o)) continue
      let dates: OfferDate[] = []
      try {
        dates = typeof o.proposed_dates === 'string' ? JSON.parse(o.proposed_dates) : o.proposed_dates || []
      } catch { /* malformed legacy row */ }
      for (const d of dates) {
        const date = String(d?.date || '').slice(0, 10)
        if (!date || date < today) continue
        ;(map[date] ||= []).push({
          id: o.id,
          name: offerName(o),
          number: o.number || null,
          userId: d.user_id != null ? Number(d.user_id) : null,
        })
      }
    }
    return map
  }, [offers])
}

export function offersOutFor(list: OfferOut[] | undefined, userId: number | 'all'): OfferOut[] {
  if (!list?.length) return []
  return userId === 'all' ? list : list.filter(o => o.userId == null || o.userId === Number(userId))
}

/** Quiet reminder on a schedule day that offers suggesting it are still out. */
export function OffersOutPill({ offers, companySlug, compact }: { offers: OfferOut[]; companySlug: string; compact?: boolean }) {
  const { t } = useAppI18n()
  const [open, setOpen] = useState(false)
  if (offers.length === 0) return null
  const label = offers.length === 1
    ? fill(t('app.pipeline.offerOutOne', 'Offer out · {name}'), { name: offers[0].name })
    : fill(t('app.pipeline.offersOut', '{n} offers out'), { n: offers.length })
  const names = offers.map(o => o.name).join(', ')

  if (compact) {
    return (
      <Link
        href={offers.length === 1 ? pipelineHref(companySlug, { kind: 'offer', id: offers[0].id }) : `${companySlug ? `/${companySlug}` : ''}/offers`}
        onClick={e => e.stopPropagation()}
        title={names}
        className="flex items-center gap-1 truncate rounded-md border border-dashed border-gray-300 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700"
      >
        <DocumentTextIcon className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{offers.length === 1 ? offers[0].name : fill(t('app.pipeline.offersOut', '{n} offers out'), { n: offers.length })}</span>
      </Link>
    )
  }

  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white/50" onClick={e => e.stopPropagation()}>
      {offers.length === 1 ? (
        <Link
          href={pipelineHref(companySlug, { kind: 'offer', id: offers[0].id })}
          title={t('app.pipeline.offerOutHint', 'Suggested in an offer the client hasn’t answered yet')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-800"
        >
          <DocumentTextIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
          <span className="truncate">{label}</span>
        </Link>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            title={names}
            className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] font-medium text-gray-500 hover:text-gray-800"
          >
            <DocumentTextIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
            <span className="flex-1 truncate">{label}</span>
            <span className="text-gray-300">{open ? '–' : '+'}</span>
          </button>
          {open && (
            <ul className="border-t border-dashed border-gray-200 px-1 py-1">
              {offers.map(o => (
                <li key={o.id}>
                  <Link
                    href={pipelineHref(companySlug, { kind: 'offer', id: o.id })}
                    className="block truncate rounded-md px-1.5 py-1 text-[11px] text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  >
                    {o.name}
                    {o.number ? <span className="text-gray-400"> · #{o.number}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
