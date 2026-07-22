'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { pushFeaturePageView } from '../lib/dataLayer'

type FeatureKey =
  | 'routeplanning'
  | 'subscriptions'
  | 'team'
  | 'scheduling'
  | 'leads'
  | 'reminders'
  | 'analytics'
  | 'services'

export default function FeaturePageAnalytics({ featureKey }: { featureKey: FeatureKey }) {
  const pathname = usePathname()

  useEffect(() => {
    pushFeaturePageView(featureKey, pathname || undefined)
  }, [featureKey, pathname])

  return null
}
