'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import { useAppI18n } from './I18nProvider'
import { apiUrl } from '../utils/api'

interface SmsUsageSummary {
  hasPlan: boolean
  used: number
  included: number
  remaining: number
}

type SidebarSmsBarProps = {
  /** Dark sidebar drawer vs light settings chrome */
  variant?: 'dark' | 'light'
}

export default function SidebarSmsBar({ variant = 'dark' }: SidebarSmsBarProps) {
  const { t } = useAppI18n()
  const [sms, setSms] = useState<SmsUsageSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSms = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/companies/sms-usage'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSms(res.ok ? await res.json() : null)
    } catch {
      setSms(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSms()
  }, [fetchSms])

  const smsPct =
    sms?.hasPlan && sms.included > 0
      ? Math.min(100, Math.round((sms.used / sms.included) * 100))
      : 0

  const isDark = variant === 'dark'
  const borderClass = isDark ? 'border-white/10' : 'border-gray-200'
  const mutedClass = isDark ? 'text-gray-500' : 'text-gray-400'
  const textClass = isDark ? 'text-gray-400' : 'text-gray-500'
  const trackClass = isDark ? 'bg-white/10' : 'bg-gray-100'
  const iconClass = isDark ? 'text-accent-500' : 'text-accent-600'
  const iconMutedClass = isDark ? 'text-gray-600' : 'text-gray-300'

  return (
    <div
      className={`shrink-0 px-3 py-2 pb-safe-plus border-t ${borderClass}`}
      aria-label={t('app.sidebar.smsAllowance', 'SMS this month')}
    >
      {loading ? (
        <p className={`text-[10px] ${mutedClass}`}>{t('app.sidebar.smsLoading', 'Loading…')}</p>
      ) : sms?.hasPlan ? (
        <div className="space-y-1">
          <div className={`flex items-center justify-between gap-2 text-[10px] ${textClass}`}>
            <span className="flex items-center gap-1 min-w-0 truncate">
              <ChatBubbleLeftRightIcon className={`h-3 w-3 flex-shrink-0 ${iconClass}`} />
              <span className="truncate">
                {sms.used.toLocaleString()} / {sms.included.toLocaleString()}
              </span>
            </span>
            <span className={`flex-shrink-0 ${mutedClass}`}>
              {sms.remaining.toLocaleString()} {t('app.sidebar.smsLeft', 'left')}
            </span>
          </div>
          <div className={`h-0.5 rounded-full ${trackClass} overflow-hidden`}>
            <div
              className={`h-full rounded-full transition-all ${
                smsPct > 100 ? 'bg-red-500' : smsPct > 80 ? 'bg-amber-500' : 'bg-accent-500'
              }`}
              style={{ width: `${Math.min(100, smsPct)}%` }}
            />
          </div>
        </div>
      ) : (
        <p className={`text-[10px] ${mutedClass} flex items-center gap-1`}>
          <ChatBubbleLeftRightIcon className={`h-3 w-3 flex-shrink-0 ${iconMutedClass}`} />
          <span>{t('app.sidebar.smsNoneShort', 'No SMS plan')}</span>
        </p>
      )}
    </div>
  )
}
