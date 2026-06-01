'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeftIcon,
  UserIcon,
  BuildingOfficeIcon,
  CreditCardIcon,
  ArrowRightOnRectangleIcon,
  BellIcon,
  InboxIcon,
  PuzzlePieceIcon,
  DocumentTextIcon,
  ClockIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import type { ComponentType, SVGProps } from 'react'
import { useAppI18n } from './I18nProvider'
import { clearClientLocaleStorage } from '../i18n'

interface SettingsSidebarProps {
  user: {
    firstName: string
    lastName: string
    email: string
  }
  onBack: () => void
  /** Renders the sidebar as a mobile drawer when these props are passed. */
  isMobileOpen?: boolean
  onMobileClose?: () => void
}

type NavItem = {
  name: string
  href: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  /** Extra paths that should also light this item up (e.g. legacy redirects). */
  matchExtra?: string[]
}

type NavSection = {
  /** Short uppercase label rendered above the items. Use empty string for an unlabelled top section. */
  label: string
  items: NavItem[]
}

export default function SettingsSidebar({
  user: _user,
  onBack,
  isMobileOpen,
  onMobileClose,
}: SettingsSidebarProps) {
  const pathname = usePathname()
  const { t } = useAppI18n()
  const isDrawer = onMobileClose !== undefined

  useEffect(() => {
    if (!isDrawer || !isMobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose?.()
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', handleKey)
    }
  }, [isDrawer, isMobileOpen, onMobileClose])

  // Auto-close on route change so tapping a nav item in the drawer collapses
  // it cleanly without us wiring onClick on every Link.
  useEffect(() => {
    if (isDrawer) onMobileClose?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Extract company slug from URL: /{slug}/settings/... → slug
  // Falls back to empty string for legacy /settings/... routes
  const pathParts = pathname.split('/').filter(Boolean)
  const companySlug = pathParts[0] !== 'settings' ? pathParts[0] : ''
  const base = companySlug ? `/${companySlug}/settings` : '/settings'

  const handleLogout = () => {
    clearClientLocaleStorage()
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('pathpilo_video_guide_dismissed')
    window.location.href = '/'
  }

  // Three top-level groups keep things simple while leaving room to grow:
  //   Account  → things about you personally
  //   Company  → everything about running this company in PathPilo
  //   Add-ons  → optional integrations bolted on top
  // The "Plan & billing" page itself owns the wording that distinguishes
  // "PathPilo billing you" from "you billing your clients" — see its eyebrow.
  const sections: NavSection[] = [
    {
      label: t('settings.sidebar.groupAccount', 'Account'),
      items: [
        { name: t('settings.sidebar.user', 'User'), href: `${base}/user`, icon: UserIcon },
      ],
    },
    {
      label: t('settings.sidebar.groupCompany', 'Company'),
      items: [
        { name: t('settings.sidebar.business', 'Business'), href: `${base}/business`, icon: BuildingOfficeIcon },
        { name: t('settings.sidebar.workHours', 'Work hours'), href: `${base}/work-hours`, icon: ClockIcon },
        { name: t('settings.sidebar.leadForm', 'Lead form'), href: `${base}/leads-form`, icon: InboxIcon },
        {
          name: t('settings.sidebar.invoices', 'Invoices'),
          href: `${base}/invoice-options`,
          icon: DocumentTextIcon,
          // Old routes kept as redirects — keep this item highlighted while they run.
          matchExtra: [
            `${base}/client-terms`,
            `${base}/clients`,
            `${base}/invoice-terms`,
            `${base}/invoices`,
          ],
        },
        {
          name: t('settings.sidebar.notifications', 'Notifications'),
          href: `${base}/notifications`,
          icon: BellIcon,
        },
        {
          name: t('settings.sidebar.planAndBilling', 'Plan & billing'),
          href: `${base}/billing`,
          icon: CreditCardIcon,
        },
      ],
    },
    {
      label: t('settings.sidebar.groupAddOns', 'Add-ons'),
      items: [
        { name: t('settings.sidebar.extensions', 'Extensions'), href: `${base}/extensions`, icon: PuzzlePieceIcon },
      ],
    },
  ]

  const isActiveItem = (item: NavItem) => {
    const candidates = [item.href, ...(item.matchExtra ?? [])]
    return candidates.some((href) => pathname === href || pathname.startsWith(href + '/'))
  }

  const body = (
    <>
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <button
          onClick={handleLogout}
          className="flex items-center space-x-1.5 text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          <span className="text-xs font-medium">{t('settings.sidebar.logout', 'Logout')}</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs font-medium">
            {t('settings.sidebar.title', 'Settings')}
          </span>
          {isDrawer ? (
            <button
              type="button"
              aria-label="Close menu"
              onClick={onMobileClose}
              className="text-gray-500 hover:text-gray-900 p-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/20"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Back */}
      <div className="px-4 py-3 border-b border-gray-200">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          <span className="text-sm font-medium">
            {t('settings.sidebar.backToDashboard', 'Back to Dashboard')}
          </span>
        </button>
      </div>

      {/* Navigation — grouped */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {sections.map((section, sectionIdx) => (
          <div
            key={section.label || `section-${sectionIdx}`}
            className={sectionIdx === 0 ? '' : 'mt-4'}
          >
            {section.label && (
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = isActiveItem(item)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center px-3 py-2 text-sm rounded-lg transition-all ${
                      isActive
                        ? 'bg-gray-100 text-gray-900 font-semibold'
                        : 'text-gray-600 font-medium hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon
                      className={`mr-3 h-4 w-4 flex-shrink-0 ${
                        isActive ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-700'
                      }`}
                      aria-hidden="true"
                    />
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom Spacing */}
      <div className="px-4 py-3 pb-safe-plus">
        <div className="text-xs text-gray-400 text-center">Vevago v1.0</div>
      </div>
    </>
  )

  if (isDrawer) {
    if (!isMobileOpen) return null
    return (
      <div className="lg:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true">
        <button
          type="button"
          aria-label="Close menu"
          onClick={onMobileClose}
          className="absolute inset-0 bg-black/50 backdrop-blur-[1px] animate-backdrop-in cursor-default"
        />
        <div className="relative h-full w-[82vw] max-w-[300px] bg-white flex flex-col overflow-hidden shadow-2xl animate-drawer-in-left">
          {body}
        </div>
      </div>
    )
  }

  return (
    <div className="hidden lg:flex fixed inset-y-0 left-0 w-[200px] bg-white border-r border-gray-200 flex-col overflow-hidden z-30">
      {body}
    </div>
  )
}
