'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { pushFeaturePageView } from '../lib/dataLayer'

type FeatureKey = 'routeplanning' | 'subscriptions' | 'team'

export default function FeaturePageAnalytics({ featureKey }: { featureKey: FeatureKey }) {
  const pathname = usePathname()

  useEffect(() => {
    pushFeaturePageView(featureKey, pathname || undefined)
  }, [featureKey, pathname])

  return null
}
