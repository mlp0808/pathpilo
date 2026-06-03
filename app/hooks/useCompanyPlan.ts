'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiUrl } from '../utils/api'

export interface CompanyPlanStatus {
  plan: 'standard' | 'pro'
  trialDaysLeft: number | null
  subscription: {
    status: string
    currentPeriodEnd: string
    cancelAtPeriodEnd: boolean
    interval: 'month' | 'year'
  } | null
  hasStripeCustomer: boolean
}

/** True when the company can use Pro-only features (team, etc.). */
export function hasProPlanAccess(status: CompanyPlanStatus | null): boolean {
  if (!status || status.plan !== 'pro') return false
  const sub = status.subscription
  if (sub && (sub.status === 'active' || sub.status === 'trialing')) return true
  if ((status.trialDaysLeft ?? 0) > 0) return true
  // Comped Pro: no Stripe subscription and no trial expiry date
  if (!sub && status.trialDaysLeft === null) return true
  return false
}

export function useCompanyPlan() {
  const [status, setStatus] = useState<CompanyPlanStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setStatus(null)
        return
      }
      const res = await fetch(apiUrl('/stripe/subscription'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setStatus(await res.json())
    } catch {
      /* keep previous status */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    status,
    loading,
    hasProAccess: hasProPlanAccess(status),
    refresh,
  }
}
