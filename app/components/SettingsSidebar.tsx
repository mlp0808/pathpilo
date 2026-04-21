'use client'

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

export default function SettingsSidebar({ user: _user, onBack }: SettingsSidebarProps) {
  const pathname = usePathname()
  const { t } = useAppI18n()

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
          name: t('settings.sidebar.invoiceOptions', 'Invoice options'),
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

  return (
    <div className="fixed inset-y-0 left-0 w-[200px] bg-sidebar flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button
          onClick={handleLogout}
          className="flex items-center space-x-1.5 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          <span className="text-xs font-medium">{t('settings.sidebar.logout', 'Logout')}</span>
        </button>
        <span className="text-gray-400 text-xs font-medium">
          {t('settings.sidebar.title', 'Settings')}
        </span>
      </div>

      {/* Back */}
      <div className="px-4 py-3 border-b border-white/10">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-gray-300 hover:text-white transition-colors"
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
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500/70">
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
                    className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                      isActive
                        ? 'bg-accent-500 text-white'
                        : 'text-gray-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon
                      className={`mr-3 h-4 w-4 flex-shrink-0 ${
                        isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'
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
      <div className="px-4 py-3">
        <div className="text-xs text-gray-500 text-center">Vevago v1.0</div>
      </div>
    </div>
  )
}
