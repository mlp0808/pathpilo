'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowRightOnRectangleIcon,
  ChevronRightIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline'
import { useAppI18n } from './I18nProvider'
import { apiUrl } from '../utils/api'
import {
  buildSettingsNavSections,
  isSettingsNavItemActive,
} from '../config/settingsNav'

interface SmsUsageSummary {
  hasPlan: boolean
  used: number
  included: number
  remaining: number
}

interface SidebarAccountPanelProps {
  companyName: string
  userName: string
  companySlug: string
  overwatchActive: boolean
  onLogout: () => void
  onQuitOverwatch: () => void
  /** Mobile drawer: panel opens below the trigger instead of to the right. */
  placement?: 'sidebar' | 'drawer'
  onNavigate?: () => void
}

const PANEL_SHELL =
  'rounded-xl border border-gray-200 bg-white shadow-lg shadow-gray-900/10 overflow-hidden flex flex-col'

export default function SidebarAccountPanel({
  companyName,
  userName,
  companySlug,
  overwatchActive,
  onLogout,
  onQuitOverwatch,
  placement = 'sidebar',
  onNavigate,
}: SidebarAccountPanelProps) {
  const { t } = useAppI18n()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [sms, setSms] = useState<SmsUsageSummary | null>(null)
  const [smsLoading, setSmsLoading] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })

  const sections = buildSettingsNavSections(t, companySlug)

  const fetchSms = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    setSmsLoading(true)
    try {
      const res = await fetch(apiUrl('/companies/sms-usage'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setSms(await res.json())
      } else {
        setSms(null)
      }
    } catch {
      setSms(null)
    } finally {
      setSmsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void fetchSms()
  }, [open, fetchSms])

  const updatePanelPosition = useCallback(() => {
    if (!open || placement !== 'sidebar' || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    let top = rect.top
    const panelHeight = panelRef.current?.offsetHeight ?? 0
    if (panelHeight > 0) {
      const maxTop = window.innerHeight - panelHeight - 8
      top = Math.max(8, Math.min(rect.top, maxTop))
    }
    setPanelPos({
      top,
      left: rect.right + 8,
    })
  }, [open, placement])

  useEffect(() => {
    if (!open || placement !== 'sidebar') return
    updatePanelPosition()
    window.addEventListener('resize', updatePanelPosition)
    window.addEventListener('scroll', updatePanelPosition, true)
    return () => {
      window.removeEventListener('resize', updatePanelPosition)
      window.removeEventListener('scroll', updatePanelPosition, true)
    }
  }, [open, placement, updatePanelPosition])

  useLayoutEffect(() => {
    updatePanelPosition()
  }, [open, placement, sms, smsLoading, updatePanelPosition])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const smsPct =
    sms?.hasPlan && sms.included > 0
      ? Math.min(100, Math.round((sms.used / sms.included) * 100))
      : 0

  const handleSignOut = () => {
    setOpen(false)
    if (overwatchActive) onQuitOverwatch()
    else onLogout()
  }

  const logoutLabel = overwatchActive
    ? t('app.sidebar.quitOverwatch', 'Quit Overwatch')
    : t('app.sidebar.logout', 'Log out')

  const panelContent = (
    <div
      ref={panelRef}
      className={
        placement === 'drawer'
          ? `mt-2 w-full ${PANEL_SHELL}`
          : `fixed z-[80] w-[min(100vw-1rem,17.5rem)] max-h-[calc(100vh-1rem)] overflow-y-auto ${PANEL_SHELL}`
      }
      style={placement === 'sidebar' ? { top: panelPos.top, left: panelPos.left } : undefined}
      role="menu"
      aria-label={t('app.sidebar.accountMenu', 'Account and settings')}
    >
      <div className="relative shrink-0 px-4 pt-3.5 pb-3 pr-11 border-b border-gray-200">
        <button
          type="button"
          onClick={handleSignOut}
          title={logoutLabel}
          aria-label={logoutLabel}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <ArrowRightOnRectangleIcon className="h-4 w-4" />
        </button>
        <p className="text-xs font-medium text-accent-600 truncate">{companyName}</p>
        <p className="mt-0.5 text-sm font-semibold text-gray-900 truncate">{userName}</p>
      </div>

      <div className="shrink-0 px-4 py-2 border-b border-gray-100">
        {smsLoading ? (
          <p className="text-[11px] text-gray-400">{t('app.sidebar.smsLoading', 'Loading…')}</p>
        ) : sms?.hasPlan ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
              <span className="flex items-center gap-1 min-w-0 truncate">
                <ChatBubbleLeftRightIcon className="h-3.5 w-3.5 text-accent-500 flex-shrink-0" />
                <span className="truncate">
                  {sms.used.toLocaleString()} / {sms.included.toLocaleString()}
                </span>
              </span>
              <span className="flex-shrink-0 text-gray-400">
                {sms.remaining.toLocaleString()} {t('app.sidebar.smsLeft', 'left')}
              </span>
            </div>
            <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  smsPct > 100 ? 'bg-red-500' : smsPct > 80 ? 'bg-amber-500' : 'bg-accent-500'
                }`}
                style={{ width: `${Math.min(100, smsPct)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
            <ChatBubbleLeftRightIcon className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
            <span>{t('app.sidebar.smsNoneShort', 'No SMS plan')}</span>
          </p>
        )}
      </div>

      <nav className="px-2 py-2 pb-2.5">
        {sections.map((section, sectionIdx) => (
          <div key={section.label || `section-${sectionIdx}`} className={sectionIdx === 0 ? '' : 'mt-3'}>
            {section.label ? (
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                {section.label}
              </p>
            ) : null}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = isSettingsNavItemActive(pathname, item)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      setOpen(false)
                      onNavigate?.()
                    }}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-gray-100 text-gray-900 font-semibold'
                        : 'text-gray-600 font-medium hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 flex-shrink-0 ${
                        isActive ? 'text-gray-900' : 'text-gray-400'
                      }`}
                      aria-hidden
                    />
                    <span className="truncate">{item.name}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  )

  return (
    <div ref={rootRef} className="relative px-3 py-3 border-b border-white/10">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors ${
          open ? 'bg-white/10 ring-1 ring-white/10' : 'bg-white/5 hover:bg-white/10'
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-accent-500 truncate">{companyName}</p>
          <p className="text-sm font-semibold text-white truncate">{userName}</p>
          <p className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-gray-500">
            <Cog6ToothIcon className="h-3 w-3 flex-shrink-0 text-gray-500" aria-hidden />
            <span>{t('app.sidebar.settings', 'Settings')}</span>
          </p>
        </div>
        <ChevronRightIcon
          className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${
            open ? (placement === 'drawer' ? 'rotate-90' : 'rotate-180') : ''
          }`}
        />
      </button>

      {open ? panelContent : null}
    </div>
  )
}
