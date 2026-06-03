'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeftIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline'
import { useAppI18n } from './I18nProvider'
import { clearClientLocaleStorage } from '../i18n'
import {
  buildSettingsNavSections,
  isSettingsNavItemActive,
} from '../config/settingsNav'

interface SettingsSidebarProps {
  user: {
    firstName: string
    lastName: string
    email: string
  }
  onBack: () => void
}

export default function SettingsSidebar({ user: _user, onBack }: SettingsSidebarProps) {
  const pathname = usePathname()
  const { t } = useAppI18n()

  // Extract company slug from URL: /{slug}/settings/... → slug
  // Falls back to empty string for legacy /settings/... routes
  const pathParts = pathname.split('/').filter(Boolean)
  const companySlug = pathParts[0] !== 'settings' ? pathParts[0] : ''
  const sections = buildSettingsNavSections(t, companySlug)

  const handleLogout = () => {
    clearClientLocaleStorage()
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('pathpilo_video_guide_dismissed')
    window.location.href = '/'
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
        <span className="text-gray-500 text-xs font-medium">
          {t('settings.sidebar.title', 'Settings')}
        </span>
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
                const isActive = isSettingsNavItemActive(pathname, item)
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

  return (
    <div className="hidden lg:flex fixed inset-y-0 left-0 w-[200px] bg-white border-r border-gray-200 flex-col overflow-hidden z-30">
      {body}
    </div>
  )
}
