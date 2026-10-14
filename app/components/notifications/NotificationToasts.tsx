'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useAppI18n } from '../I18nProvider'
import { useNotifications, markNotificationRead, type AppNotification } from '../../hooks/useNotifications'
import { describeNotification } from './NotificationBell'

const TOAST_MS = 8000
/** Views are nice to know, not worth interrupting for. */
const TOAST_TYPES = new Set(['lead.new', 'offer.accepted', 'offer.declined'])

export default function NotificationToasts({ companySlug }: { companySlug: string }) {
  const { t, locale } = useAppI18n()
  const router = useRouter()
  const { items, loaded } = useNotifications()
  const seen = useRef<Set<number> | null>(null)
  const [toasts, setToasts] = useState<AppNotification[]>([])

  useEffect(() => {
    if (!loaded) return
    if (seen.current == null) {
      seen.current = new Set(items.map(n => n.id))
      return
    }
    const fresh = items.filter(n => !seen.current!.has(n.id) && !n.read && TOAST_TYPES.has(n.type))
    items.forEach(n => seen.current!.add(n.id))
    if (fresh.length === 0) return
    setToasts(prev => [...fresh, ...prev].slice(0, 3))
    fresh.forEach(n => {
      window.setTimeout(() => setToasts(prev => prev.filter(x => x.id !== n.id)), TOAST_MS)
    })
  }, [items, loaded])

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 top-16 z-[65] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map(n => {
        const v = describeNotification(n, t, locale, companySlug)
        return (
          <div
            key={n.id}
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-[0_18px_40px_-12px_rgba(15,23,42,0.25)] animate-[mission-toast-in_220ms_ease-out]"
          >
            <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${v.tone}`}>
              <v.Icon className="h-4 w-4" />
            </span>
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                markNotificationRead(n.id)
                setToasts(prev => prev.filter(x => x.id !== n.id))
                router.push(v.href)
              }}
            >
              <p className="text-[13px] font-semibold leading-snug text-gray-900">{v.title}</p>
              {v.body && <p className="mt-0.5 truncate text-xs text-gray-500">{v.body}</p>}
              <p className="mt-1.5 text-xs font-semibold text-accent-700">{v.cta || t('app.notifications.open', 'Open')} →</p>
            </button>
            <button
              type="button"
              onClick={() => setToasts(prev => prev.filter(x => x.id !== n.id))}
              className="rounded-md p-1 text-gray-300 hover:bg-gray-50 hover:text-gray-500"
              aria-label={t('app.notifications.dismiss', 'Dismiss')}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
