'use client'

import { useAppI18n } from '@/app/components/I18nProvider'
import type { OfferRecord } from '@/app/lib/offers'

export default function OfferStatusPill({
  offer,
}: {
  offer: Pick<OfferRecord, 'status' | 'viewed_at'> & Partial<Pick<OfferRecord, 'confirmed_at'>>
}) {
  const { t } = useAppI18n()
  const viewed = offer.status === 'sent' && !!offer.viewed_at
  const [label, tone] =
    offer.status === 'accepted'
      ? offer.confirmed_at
        ? [t('app.offers.statusBooked', 'Booked'), 'bg-accent-500/15 text-accent-700']
        : [t('app.offers.statusToConfirm', 'Accepted'), 'bg-[#ecfdf3] text-[#1f7a46]']
      : offer.status === 'declined'
        ? [t('app.offers.statusDeclined', 'Declined'), 'bg-rose-50 text-rose-700']
        : viewed
          ? [t('app.offers.statusViewed', 'Viewed'), 'bg-violet-50 text-violet-700']
          : offer.status === 'sent'
            ? [t('app.offers.statusSent', 'Sent'), 'bg-sky-50 text-sky-700']
            : offer.status === 'revoked'
              ? [t('app.offers.statusRevoked', 'Withdrawn'), 'bg-gray-100 text-gray-500']
              : [t('app.offers.statusDraft', 'Draft'), 'bg-gray-100 text-gray-600']
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone}`}>
      {viewed && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />}
      {label}
    </span>
  )
}
