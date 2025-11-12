'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  HomeIcon, 
  UserGroupIcon, 
  UsersIcon, 
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  QuestionMarkCircleIcon,
  ClipboardDocumentListIcon
} from '@heroicons/react/24/outline'

interface SidebarProps {
  user: {
    firstName: string
    lastName: string
    email: string
  }
  onSettingsClick?: () => void
}

export default function Sidebar({ user, onSettingsClick }: SidebarProps) {
  const pathname = usePathname()

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/'
  }

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { name: 'Jobs', href: '/jobs', icon: ClipboardDocumentListIcon },
    { name: 'Clients', href: '/clients', icon: UserGroupIcon },
    { name: 'Team', href: '/team', icon: UsersIcon },
    { name: 'Services', href: '/services', icon: Cog6ToothIcon },
  ]

  return (
    <div className="fixed inset-y-0 left-0 w-[200px] bg-gray-900 flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <button
          onClick={handleLogout}
          className="flex items-center space-x-1.5 text-gray-400 hover:text-white transition-colors duration-200"
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          <span className="text-xs font-medium">Logout</span>
        </button>
        
        <Link 
          href="#" 
          className="text-gray-400 hover:text-white transition-colors duration-200 text-xs font-medium"
        >
          Help
        </Link>
      </div>

      {/* User Info Container */}
      <div className="px-4 py-3 bg-[#2F3A53]">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-xs truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-gray-300 text-xs truncate">
              {user.email}
            </p>
          </div>
          
          <button 
            onClick={onSettingsClick}
            className="ml-2 text-gray-400 hover:text-white transition-colors duration-200"
          >
            <Cog6ToothIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500">
        {navigation.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`group flex items-center px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-gray-800 text-blue-400'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon
                className={`mr-2.5 h-4 w-4 flex-shrink-0 transition-colors duration-200 ${
                  isActive ? 'text-blue-400' : 'text-gray-400 group-hover:text-white'
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
