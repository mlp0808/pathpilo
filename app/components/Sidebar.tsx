'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  HomeIcon, 
  UserGroupIcon, 
  UsersIcon, 
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  QuestionMarkCircleIcon,
  ClipboardDocumentListIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'

interface Company {
  id: number
  name: string
  slug?: string
  role: string
  isOwner: boolean
}

interface SidebarProps {
  user: {
    firstName: string
    lastName: string
    email: string
    companies?: Company[]
    activeCompany?: {
      id: number
      name: string
      slug?: string
      role: string
      isOwner: boolean
    } | null
  }
  onSettingsClick?: () => void
}

export default function Sidebar({ user, onSettingsClick }: SidebarProps) {
  const pathname = usePathname()
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCompanyDropdownOpen(false)
      }
    }

    if (isCompanyDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isCompanyDropdownOpen])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/'
  }

  const handleCompanySwitch = async (companyId: number) => {
    if (isSwitching) return
    
    setIsSwitching(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        console.error('No token found')
        return
      }

      const response = await fetch(apiUrl(`/companies/${companyId}/switch`), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (response.ok) {
        // Update token
        localStorage.setItem('token', data.token)
        
        // Update user data in localStorage
        const userData = localStorage.getItem('user')
        if (userData) {
          const userObj = JSON.parse(userData)
          userObj.activeCompany = data.activeCompany
          userObj.companyId = data.activeCompany.id
          userObj.companyName = data.activeCompany.name
          userObj.role = data.activeCompany.role
          localStorage.setItem('user', JSON.stringify(userObj))
        }

        // Navigate to the new company's dashboard
        const newCompanySlug = data.activeCompany?.slug
        if (newCompanySlug) {
          window.location.href = `/${newCompanySlug}/dashboard`
        } else {
          window.location.reload()
        }
      } else {
        console.error('Failed to switch company:', data.error)
        alert('Failed to switch company: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error switching company:', error)
      alert('Error switching company. Please try again.')
    } finally {
      setIsSwitching(false)
      setIsCompanyDropdownOpen(false)
    }
  }

  // Only show dropdown if user has multiple companies
  const showCompanySwitcher = user.companies && user.companies.length > 1
  const activeCompany = user.activeCompany || (user.companies && user.companies.length > 0 ? user.companies[0] : null)
  const companySlug = (activeCompany as any)?.slug || (user.companies?.[0] as any)?.slug || ''

  const navigation = [
    { name: 'Dashboard', href: companySlug ? `/${companySlug}/dashboard` : '/dashboard', icon: HomeIcon },
    { name: 'Jobs', href: companySlug ? `/${companySlug}/jobs` : '/jobs', icon: ClipboardDocumentListIcon },
    { name: 'Clients', href: companySlug ? `/${companySlug}/clients` : '/clients', icon: UserGroupIcon },
    { name: 'Team', href: companySlug ? `/${companySlug}/team` : '/team', icon: UsersIcon },
    { name: 'Services', href: companySlug ? `/${companySlug}/services` : '/services', icon: Cog6ToothIcon },
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

      {/* Company Switcher - Only show if user has multiple companies */}
      {showCompanySwitcher && (
        <div className="px-4 py-3 border-t border-gray-800">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsCompanyDropdownOpen(!isCompanyDropdownOpen)}
              disabled={isSwitching}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center space-x-2 min-w-0 flex-1">
                <BuildingOfficeIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-xs font-medium text-gray-300 truncate">
                  {activeCompany?.name || 'Select Company'}
                </span>
              </div>
              {isCompanyDropdownOpen ? (
                <ChevronUpIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              )}
            </button>

            {/* Dropdown Menu */}
            {isCompanyDropdownOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden z-50">
                {user.companies?.map((company) => {
                  const isActive = activeCompany?.id === company.id
                  return (
                    <button
                      key={company.id}
                      onClick={() => handleCompanySwitch(company.id)}
                      disabled={isActive || isSwitching}
                      className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors duration-200 ${
                        isActive
                          ? 'bg-gray-700 text-blue-400 cursor-default'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white cursor-pointer'
                      } ${isSwitching ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{company.name}</span>
                        {isActive && (
                          <span className="ml-2 text-blue-400 text-[10px]">Active</span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5 capitalize">
                        {company.role}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Spacing */}
      <div className="px-4 py-3">
        <div className="text-xs text-gray-500 text-center">
          Vevago v1.0
        </div>
      </div>
    </div>
  )
}
