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
  ClipboardDocumentListIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  BuildingOfficeIcon,
  InboxIcon,
  RocketLaunchIcon
} from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import { clearClientLocaleStorage } from '../i18n'
import { useAppI18n } from './I18nProvider'
import VideoGuideModal from './VideoGuideModal'

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

function roleLabelKey(role: string): 'app.role.owner' | 'app.role.manager' | 'app.role.admin' | 'app.role.employee' {
  const r = String(role || '').toLowerCase()
  if (r === 'owner') return 'app.role.owner'
  if (r === 'manager') return 'app.role.manager'
  if (r === 'admin') return 'app.role.admin'
  return 'app.role.employee'
}

export default function Sidebar({ user, onSettingsClick }: SidebarProps) {
  const { t } = useAppI18n()
  const pathname = usePathname()
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)
  const [isVideoGuideOpen, setIsVideoGuideOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Auto-open Get Started modal on login; stays closed once dismissed until next logout
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem('pathpilo_video_guide_dismissed')) return
    setIsVideoGuideOpen(true)
  }, [])

  const handleVideoGuideClose = () => {
    setIsVideoGuideOpen(false)
    sessionStorage.setItem('pathpilo_video_guide_dismissed', 'true')
  }

  // Jobs sub-nav: show Overview + Completed when we're on any jobs route (not an accordion)
  const isOnJobsSection = pathname.includes('/jobs')

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
    clearClientLocaleStorage()
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('pathpilo_video_guide_dismissed')
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

      // Endpoint is POST /api/companies/switch with company_id in the body
      const response = await fetch(apiUrl('/companies/switch'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ company_id: companyId })
      })

      const data = await response.json()

      if (response.ok) {
        // Store updated token (has new activeCompanyId baked in)
        localStorage.setItem('token', data.token)

        // Fully replace user object so every field is in sync
        localStorage.setItem('user', JSON.stringify({
          id: data.user.id,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          email: data.user.email,
          languageCode: data.user.languageCode,
          role: data.user.role,
          companyId: data.user.companyId,
          companyName: data.user.companyName,
          companies: data.user.companies || [],
          activeCompany: data.user.activeCompany || null,
        }))

        // Hard-navigate to the new company's dashboard
        const newSlug = data.user.activeCompany?.slug
        window.location.href = newSlug ? `/${newSlug}/dashboard` : '/select-company'
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

  const jobsBase = companySlug ? `/${companySlug}/jobs` : '/jobs'
  const navigation: Array<{
    name: string
    href?: string
    icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
    children?: Array<{ name: string; href: string }>
  }> = [
    { name: t('app.nav.dashboard', 'Dashboard'), href: companySlug ? `/${companySlug}/dashboard` : '/dashboard', icon: HomeIcon },
    {
      name: t('app.nav.jobs', 'Jobs'),
      icon: ClipboardDocumentListIcon,
      children: [
        { name: t('app.nav.jobsOverview', 'Overview'), href: jobsBase },
        { name: t('app.nav.jobsCompleted', 'Completed'), href: `${jobsBase}/completed` },
      ],
    },
    { name: t('app.nav.clients', 'Clients'), href: companySlug ? `/${companySlug}/clients` : '/clients', icon: UserGroupIcon },
    { name: t('app.nav.leads', 'Leads'), href: companySlug ? `/${companySlug}/leads` : '/leads', icon: InboxIcon },
    { name: t('app.nav.team', 'Team'), href: companySlug ? `/${companySlug}/team` : '/team', icon: UsersIcon },
    { name: t('app.nav.services', 'Services'), href: companySlug ? `/${companySlug}/services` : '/services', icon: Cog6ToothIcon },
  ]

  return (
    <div className="fixed inset-y-0 left-0 w-[200px] bg-[#1a2e2e] flex flex-col overflow-hidden">
      {/* Header: PathPilo.app */}
      <div className="px-4 pt-4 pb-2">
        <Link href={companySlug ? `/${companySlug}/dashboard` : '/dashboard'} className="block">
          <span className="text-white font-semibold text-base">PathPilo</span>
          <span className="text-white/70 font-normal text-sm">.app</span>
        </Link>
      </div>

      {/* Top bar: Logout */}
      <div className="flex items-center px-4 py-2 border-b border-white/10">
        <button
          onClick={handleLogout}
          className="flex items-center space-x-1.5 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          <span className="text-xs font-medium">{t('app.sidebar.logout', 'Logout')}</span>
        </button>
      </div>

      {/* User */}
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold text-sm truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-gray-400 text-xs truncate">
              {user.email}
            </p>
          </div>
          <button
            onClick={onSettingsClick}
            className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
          >
            <Cog6ToothIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation - design: inactive = green icon + white text; active = green vertical bar + white icon + white text */}
      <nav className="flex-1 px-0 py-4 overflow-y-auto">
        {navigation.map((item) => {
          const Icon = item.icon
          const hasChildren = item.children && item.children.length > 0

          if (hasChildren) {
            // Jobs: link to Overview (same as first child). Sub-items Overview + Completed show when we're in jobs section.
            const overviewHref = item.children![0].href
            const isJobsActive = pathname === overviewHref
            return (
              <div key={item.name} className="flex flex-col">
                <Link
                  href={overviewHref}
                  className={`group flex items-stretch w-full text-sm font-medium transition-colors ${
                    isJobsActive ? 'text-white bg-white/5' : 'text-white hover:bg-white/5'
                  }`}
                >
                  <span
                    className={`flex-shrink-0 w-1 min-h-[2.5rem] self-stretch ${
                      isJobsActive ? 'bg-accent-500' : 'bg-transparent'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="flex items-center flex-1 py-2.5 pl-3 pr-4">
                    <Icon
                      className={`mr-3 h-5 w-5 flex-shrink-0 ${
                        isJobsActive ? 'text-white' : 'text-accent-500 group-hover:text-accent-400'
                      }`}
                      aria-hidden="true"
                    />
                    {item.name}
                  </span>
                </Link>
                {isOnJobsSection && item.children!.map((sub) => {
                  const isActive = pathname === sub.href
                  return (
                    <Link
                      key={sub.name}
                      href={sub.href}
                      className={`group flex items-stretch w-full text-sm font-medium transition-colors pl-4 ${
                        isActive ? 'text-white bg-white/5' : 'text-white hover:bg-white/5'
                      }`}
                    >
                      <span
                        className={`flex-shrink-0 w-1 min-h-[2.25rem] self-stretch ${
                          isActive ? 'bg-accent-500' : 'bg-transparent'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="flex items-center flex-1 py-2 pl-3 pr-4 text-white/95">
                        {sub.name}
                      </span>
                    </Link>
                  )
                })}
              </div>
            )
          }

          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.name}
              href={item.href!}
              className={`group flex items-stretch w-full text-sm font-medium transition-colors ${
                isActive ? 'text-white bg-white/5' : 'text-white hover:bg-white/5'
              }`}
            >
              <span
                className={`flex-shrink-0 w-1 min-h-[2.5rem] self-stretch ${
                  isActive ? 'bg-accent-500' : 'bg-transparent'
                }`}
                aria-hidden="true"
              />
              <span className="flex items-center flex-1 py-2.5 pl-3 pr-4">
                <Icon
                  className={`mr-3 h-5 w-5 flex-shrink-0 ${
                    isActive ? 'text-white' : 'text-accent-500 group-hover:text-accent-400'
                  }`}
                  aria-hidden="true"
                />
                {item.name}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Company Switcher */}
      {showCompanySwitcher && (
        <div className="px-4 py-3 border-t border-white/10">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsCompanyDropdownOpen(!isCompanyDropdownOpen)}
              disabled={isSwitching}
              className="w-full flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

            {isCompanyDropdownOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-sidebar-dark rounded-lg shadow-xl border border-white/10 overflow-hidden z-50">
                {user.companies?.map((company) => {
                  const isActive = activeCompany?.id === company.id
                  return (
                    <button
                      key={company.id}
                      onClick={() => handleCompanySwitch(company.id)}
                      disabled={isActive || isSwitching}
                      className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-accent-500/20 text-accent-400 cursor-default'
                          : 'text-gray-300 hover:bg-white/5 hover:text-white cursor-pointer'
                      } ${isSwitching ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{company.name}</span>
                        {isActive && <span className="ml-2 text-accent-400 text-[10px]">{t('app.sidebar.active', 'Active')}</span>}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{t(roleLabelKey(company.role), company.role)}</div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Get Started - bottom left */}
      <div className="px-4 py-3 border-t border-white/10">
        <button
          onClick={() => setIsVideoGuideOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-500 hover:bg-accent-600 text-white font-semibold text-sm rounded-xl shadow-lg shadow-accent-500/25 hover:shadow-accent-500/40 transition-all duration-200"
        >
          <RocketLaunchIcon className="w-5 h-5" />
          <span>{t('app.sidebar.getStarted', 'Get started')}</span>
        </button>
      </div>

      <VideoGuideModal
        isOpen={isVideoGuideOpen}
        onClose={handleVideoGuideClose}
      />
    </div>
  )
}
