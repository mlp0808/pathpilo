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
  BellIcon
} from '@heroicons/react/24/outline'

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

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/'
  }

  const settingsNavigation = [
    { name: 'User', href: '/settings/user', icon: UserIcon },
    { name: 'Business', href: '/settings/business', icon: BuildingOfficeIcon },
    { name: 'Notifications', href: '/settings/notifications', icon: BellIcon },
    { name: 'Billing', href: '/settings/billing', icon: CreditCardIcon },
    { name: 'Invoices', href: '/settings/invoices', icon: DocumentTextIcon },
  ]

  return (
    <div className="fixed inset-y-0 left-0 w-[200px] bg-gray-50 flex flex-col overflow-hidden border-r border-gray-200">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <button
          onClick={handleLogout}
          className="flex items-center space-x-1.5 text-gray-600 hover:text-gray-900 transition-colors duration-200"
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          <span className="text-xs font-medium">Logout</span>
        </button>
        
        <div className="text-gray-400 text-xs font-medium">
          Settings
        </div>
      </div>

      {/* Back Button Container */}
      <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 transition-colors duration-200"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          <span className="text-sm font-medium">Back to Dashboard</span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400">
        {settingsNavigation.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`group flex items-center px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon
                className={`mr-2.5 h-4 w-4 flex-shrink-0 transition-colors duration-200 ${
                  isActive ? 'text-blue-700' : 'text-gray-400 group-hover:text-gray-700'
                }`}
                aria-hidden="true"
              />
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
