'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BellIcon,
  CheckCircleIcon,
  EyeIcon,
  InboxArrowDownIcon,
  XCircleIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline'
import { useAppI18n } from '../I18nProvider'
import {
  useNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../../hooks/useNotifications'
import { ago, fill, pipelineHref } from '../../lib/pipeline'
import { formatDay } from '../../lib/offers'

type Translate = ReturnType<typeof useAppI18n>['t']

export type NotificationView = {
  Icon: React.ComponentType<{ className?: string }>
  tone: string
  title: string
  body: string
  href: string
  cta: string | null
}

export function describeNotification(n: AppNotification, t: Translate, locale: string, slug: string): NotificationView {
  const name = n.meta?.name || t('app.notifications.someone', 'Someone')
  const vars = { name, number: n.meta?.number || '' }
  const kind = n.entity_type === 'lead' || n.entity_type === 'offer' ? n.entity_type : null
  const href =
    kind && n.entity_id
      ? pipelineHref(slug, { kind, id: Number(n.entity_id) })
      : n.type?.startsWith('offer.') && n.entity_id
        ? pipelineHref(slug, { kind: 'offer', id: Number(n.entity_id) })
        : n.type?.startsWith('lead.') && n.entity_id
          ? pipelineHref(slug, { kind: 'lead', id: Number(n.entity_id) })
          : `${slug ? `/${slug}` : ''}/pipeline`
  switch (n.type) {
    case 'lead.new':
      return {
        Icon: InboxArrowDownIcon,
        tone: 'bg-sky-50 text-sky-600',
        title: fill(t('app.notifications.leadNew', '{name} sent a request'), vars),
        body: [n.meta?.city, n.meta?.message].filter(Boolean).join(' · '),
        href,
        cta: t('app.notifications.reviewCta', 'Review'),
      }
    case 'offer.accepted':
      return {
        Icon: CheckCircleIcon,
        tone: 'bg-[#ecfdf3] text-[#1f7a46]',
        title: fill(t('app.notifications.offerAccepted', '{name} accepted offer #{number}'), vars),
        body: n.meta?.date
          ? fill(t('app.notifications.wants', 'Wants {date}'), {
              date: formatDay(n.meta.date, locale, { weekday: 'long', day: 'numeric', month: 'short' }),
            })
          : t('app.notifications.noDay', 'No day picked yet'),
        href,
        cta: t('app.notifications.confirmCta', 'Verify job'),
      }
    case 'offer.declined':
      return {
        Icon: XCircleIcon,
        tone: 'bg-rose-50 text-rose-600',
        title: fill(t('app.notifications.offerDeclined', '{name} declined offer #{number}'), vars),
        body: n.meta?.reason ? `“${n.meta.reason}”` : '',
        href,
        cta: null,
      }
    case 'offer.viewed':
    default:
      return {
        Icon: EyeIcon,
        tone: 'bg-violet-50 text-violet-600',
        title: fill(t('app.notifications.offerViewed', '{name} opened offer #{number}'), vars),
        body: '',
        href,
        cta: null,
      }
  }
}

function isToday(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

export default function NotificationBell({
  companySlug,
  variant,
}: {
  companySlug: string
  variant: 'sidebar' | 'header'
}) {
  const { t, locale } = useAppI18n()
  const router = useRouter()
  const { items, unread, attention, loaded } = useNotifications()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect()
      const width = Math.min(392, window.innerWidth - 16)
      const left = variant === 'sidebar' ? Math.max(8, r.left - 8) : Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
      setPos({ top: r.bottom + 8, left, width })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, variant])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || btnRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const needsYou = attention.leads + attention.offers + attention.bookings
  const today = items.filter(n => isToday(n.created_at))
  const earlier = items.filter(n => !isToday(n.created_at))

  const openItem = (n: AppNotification, href: string) => {
    markNotificationRead(n.id)
    setOpen(false)
    router.push(href)
  }

  const label = t('app.sidebar.notifications', 'Notifications')
  const buttonClass =
    variant === 'sidebar'
      ? `relative flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
          open ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white'
        }`
      : `relative rounded-full p-2 transition-colors ${
          open ? 'bg-gray-900/[0.06] text-gray-900' : 'text-gray-500 hover:bg-gray-900/[0.05] hover:text-gray-900'
        }`

  const renderRow = (n: AppNotification) => {
    const v = describeNotification(n, t, locale, companySlug)
    return (
      <li key={n.id}>
        <button
          type="button"
          onClick={() => openItem(n, v.href)}
          className="group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
        >
          <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${v.tone}`}>
            <v.Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <span className={`text-[13px] leading-snug ${n.read ? 'text-gray-600' : 'font-semibold text-gray-900'}`}>
                {v.title}
              </span>
              <span className="mt-0.5 flex flex-shrink-0 items-center gap-1.5 text-[11px] text-gray-400">
                {ago(n.created_at, locale)}
                {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />}
              </span>
            </span>
            {v.body && <span className="mt-0.5 block truncate text-xs text-gray-500">{v.body}</span>}
            {v.cta && !n.read && (
              <span className="mt-2 inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 shadow-sm group-hover:border-gray-300">
                {v.cta}
                <ArrowRightIcon className="h-3 w-3" />
              </span>
            )}
          </span>
        </button>
      </li>
    )
  }

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={label}
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            className="fixed z-[70] flex max-h-[min(640px,calc(100dvh-80px))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_24px_60px_-16px_rgba(15,23,42,0.28)]"
          >
            <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
              <h2 className="text-sm font-semibold text-gray-900">{label}</h2>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markAllNotificationsRead()}
                  className="text-xs font-medium text-gray-500 hover:text-gray-900"
                >
                  {t('app.notifications.markAll', 'Mark all read')}
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
              {!loaded ? (
                <div className="space-y-2 px-3 py-3">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-8 w-8 animate-pulse rounded-full bg-gray-100" />
                      <div className="h-3 flex-1 animate-pulse rounded bg-gray-100" />
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center px-6 py-10 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-50">
                    <BellIcon className="h-5 w-5 text-gray-300" />
                  </span>
                  <p className="mt-3 text-sm font-medium text-gray-700">
                    {t('app.notifications.empty', "You're all caught up")}
                  </p>
                </div>
              ) : (
                <>
                  {today.length > 0 && (
                    <>
                      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        {t('app.notifications.today', 'Today')}
                      </p>
                      <ul>{today.map(renderRow)}</ul>
                    </>
                  )}
                  {earlier.length > 0 && (
                    <>
                      <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        {t('app.notifications.earlier', 'Earlier')}
                      </p>
                      <ul>{earlier.map(renderRow)}</ul>
                    </>
                  )}
                </>
              )}
            </div>

            <Link
              href={`${companySlug ? `/${companySlug}` : ''}/pipeline`}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between border-t border-gray-100 bg-gray-50/70 px-4 py-3 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100/70 hover:text-gray-900"
            >
              <span className="flex items-center gap-2">
                {needsYou > 0 ? (
                  <>
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-900 px-1.5 text-[10px] font-bold text-white">
                      {needsYou}
                    </span>
                    {t('app.notifications.needYou', 'need you in the pipeline')}
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="h-4 w-4 text-[#1f7a46]" />
                    {t('app.notifications.pipelineClear', 'Pipeline is clear')}
                  </>
                )}
              </span>
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className={buttonClass}
        aria-label={unread > 0 ? `${label} (${unread})` : label}
        aria-expanded={open}
      >
        <BellIcon className={variant === 'sidebar' ? 'h-4 w-4' : 'h-5 w-5'} />
        {unread > 0 && (
          <span
            className={`absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[9px] font-bold leading-none text-white ${
              variant === 'sidebar' ? '-right-1 -top-1 ring-2 ring-[#1a2e2e]' : 'right-0.5 top-0.5 ring-2 ring-white'
            }`}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {panel}
    </>
  )
}
