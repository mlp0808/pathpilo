'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  ArrowLeftIcon,
  UserIcon,
  BuildingOfficeIcon,
  CreditCardIcon,
  DocumentTextIcon,
  ArrowRightOnRectangleIcon,
  BellIcon,
  InboxIcon
} from '@heroicons/react/24/outline'
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

export default function SettingsSidebar({ user, onBack }: SettingsSidebarProps) {
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

  const settingsNavigation = [
    { name: t('settings.sidebar.user', 'User'), href: `${base}/user`, icon: UserIcon },
    { name: t('settings.sidebar.business', 'Business'), href: `${base}/business`, icon: BuildingOfficeIcon },
    { name: t('settings.sidebar.notifications', 'Notifications'), href: `${base}/notifications`, icon: BellIcon },
    { name: t('settings.sidebar.leadForm', 'Lead form'), href: `${base}/leads-form`, icon: InboxIcon },
    { name: t('settings.sidebar.billing', 'Billing'), href: `${base}/billing`, icon: CreditCardIcon },
    { name: t('settings.sidebar.invoices', 'Invoices'), href: `${base}/invoices`, icon: DocumentTextIcon },
  ]

  return (
    <div className="fixed inset-y-0 left-0 w-[200px] bg-sidebar flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button onClick={handleLogout} className="flex items-center space-x-1.5 text-gray-400 hover:text-white transition-colors">
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          <span className="text-xs font-medium">{t('settings.sidebar.logout', 'Logout')}</span>
        </button>
        <span className="text-gray-400 text-xs font-medium">{t('settings.sidebar.title', 'Settings')}</span>
      </div>

      {/* Back */}
      <div className="px-4 py-3 border-b border-white/10">
        <button onClick={onBack} className="flex items-center space-x-2 text-gray-300 hover:text-white transition-colors">
          <ArrowLeftIcon className="w-4 h-4" />
          <span className="text-sm font-medium">{t('settings.sidebar.backToDashboard', 'Back to Dashboard')}</span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {settingsNavigation.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                isActive ? 'bg-accent-500 text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className={`mr-3 h-4 w-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} aria-hidden="true" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Bottom Spacing */}
      <div className="px-4 py-3">
        <div className="text-xs text-gray-500 text-center">
          Vevago v1.0
        </div>
      </div>
    </div>
  )
}
