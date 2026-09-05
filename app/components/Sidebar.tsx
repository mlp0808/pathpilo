'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  HomeIcon,
  UserGroupIcon,
  UsersIcon,
  Cog6ToothIcon,
  ClipboardDocumentListIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  BuildingOfficeIcon,
  InboxIcon,
  RocketLaunchIcon,
  DocumentTextIcon,
  QuestionMarkCircleIcon,
  MapPinIcon,
  BellIcon,
  BoltIcon,
  ArrowPathRoundedSquareIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import { useAppI18n } from './I18nProvider'
import VideoGuideModal from './VideoGuideModal'
import { useCompanyPlan } from '../hooks/useCompanyPlan'
import CrownIcon from './icons/CrownIcon'

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
}

function roleLabelKey(role: string): 'app.role.owner' | 'app.role.manager' | 'app.role.admin' | 'app.role.employee' {
  const r = String(role || '').toLowerCase()
  if (r === 'owner') return 'app.role.owner'
  if (r === 'manager') return 'app.role.manager'
  if (r === 'admin') return 'app.role.admin'
  return 'app.role.employee'
}

export default function Sidebar({ user }: SidebarProps) {
  const { t } = useAppI18n()
  const pathname = usePathname()
  const { loading: planLoading, hasProAccess } = useCompanyPlan()
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)
  const [isVideoGuideOpen, setIsVideoGuideOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleVideoGuideClose = () => {
    setIsVideoGuideOpen(false)
    sessionStorage.setItem('pathpilo_video_guide_dismissed', 'true')
  }

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
  const teamHref = companySlug ? `/${companySlug}/team` : '/team'
  const recurringBase = companySlug ? `/${companySlug}/recurring` : '/recurring'
  type NavItem = {
    name: string
    href: string
    icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
    proOnly?: boolean
    beta?: boolean
    children?: Array<{ name: string; href: string }>
  }
  const navigation: NavItem[] = [
    { name: t('app.nav.dashboard', 'Dashboard'), href: companySlug ? `/${companySlug}/dashboard` : '/dashboard', icon: HomeIcon },
    { name: t('app.nav.jobs', 'Jobs'), href: jobsBase, icon: ClipboardDocumentListIcon },
    { name: t('app.nav.map', 'Map'), href: companySlug ? `/${companySlug}/map` : '/map', icon: MapPinIcon, beta: true },
    {
      name: t('app.nav.recurring', 'Recurring'),
      href: recurringBase,
      icon: ArrowPathRoundedSquareIcon,
      children: [
        { name: t('app.nav.recurringSubscriptions', 'Subscriptions'), href: `${recurringBase}/subscriptions` },
        { name: t('app.nav.recurringRounds', 'Rounds'), href: `${recurringBase}/rounds` },
      ],
    },
    { name: t('app.nav.clients', 'Clients'), href: companySlug ? `/${companySlug}/clients` : '/clients', icon: UserGroupIcon },
    { name: t('app.nav.invoices', 'Invoices'), href: companySlug ? `/${companySlug}/invoices` : '/invoices', icon: DocumentTextIcon },
    { name: t('app.nav.leads', 'Leads'), href: companySlug ? `/${companySlug}/leads` : '/leads', icon: InboxIcon },
    { name: t('app.nav.team', 'Team'), href: teamHref, icon: UsersIcon, proOnly: true },
    { name: t('app.nav.items', 'Items'), href: companySlug ? `/${companySlug}/services` : '/services', icon: Cog6ToothIcon },
  ]
  const showTeamProBadge = !planLoading && !hasProAccess

  const dashboardHref = companySlug ? `/${companySlug}/dashboard` : '/dashboard'

  // Reserved slots for features that aren't shipped yet — visible so the shape
  // of the product is clear, but inert until they land.
  const upcoming: Array<{
    key: string
    icon: React.ComponentType<{ className?: string }>
    label: string
  }> = [
    { key: 'notifications', icon: BellIcon, label: t('app.sidebar.notifications', 'Notifications') },
    { key: 'activity', icon: BoltIcon, label: t('app.sidebar.activity', 'Activity') },
  ]
  const comingSoon = t('app.sidebar.comingSoon', 'Coming soon')

  const body = (
    <>
      {/* Brand block: logo, plus the reserved slots for what's coming next. */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <Link href={dashboardHref} className="min-w-0 flex-shrink" aria-label="PathPilo">
            <Image
              src="/images/brand/logo-header-white.png"
              alt="PathPilo"
              width={130}
              height={40}
              priority
              className="h-6 w-auto"
            />
          </Link>

          <div className="flex flex-shrink-0 items-center gap-1">
            {upcoming.map(item => {
              const Icon = item.icon
              return (
                <span
                  key={item.key}
                  title={`${item.label} — ${comingSoon}`}
                  aria-label={`${item.label} — ${comingSoon}`}
                  className="flex h-7 w-7 cursor-default items-center justify-center rounded-lg text-gray-400/75 transition-colors hover:bg-white/5 hover:text-gray-200"
                >
                  <Icon className="h-4 w-4" />
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {/* Navigation - design: inactive = green icon + white text; active = green vertical bar + white icon + white text */}
      <nav className="flex-1 px-0 pt-1 pb-4 overflow-y-auto">
        {navigation.map((item) => {
          const Icon = item.icon
          const sectionActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          const hasChildren = !!item.children?.length
          return (
            <div key={item.name}>
              <Link
                href={hasChildren ? (item.children![0].href) : item.href}
                className={`group flex items-stretch w-full text-sm font-medium transition-colors ${
                  sectionActive ? 'text-white bg-white/5' : 'text-white hover:bg-white/5'
                }`}
              >
                <span
                  className={`flex-shrink-0 w-1 min-h-[2.5rem] self-stretch ${
                    sectionActive ? 'bg-accent-500' : 'bg-transparent'
                  }`}
                  aria-hidden="true"
                />
                <span className="flex items-center flex-1 py-2.5 pl-3 pr-4">
                  <Icon
                    className={`mr-3 h-5 w-5 flex-shrink-0 ${
                      sectionActive ? 'text-white' : 'text-accent-500 group-hover:text-accent-400'
                    }`}
                    aria-hidden="true"
                  />
                  {item.name}
                  {item.beta && (
                    <span className="ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-accent-500/25 text-accent-300 ring-1 ring-inset ring-accent-400/30">
                      Beta
                    </span>
                  )}
                  {item.proOnly && showTeamProBadge && (
                    <span
                      className="ml-1.5 inline-flex flex-shrink-0"
                      title={t('app.proGate.proFeature', 'Pro feature')}
                      aria-label={t('app.proGate.proFeature', 'Pro feature')}
                    >
                      <CrownIcon className="h-3.5 w-3.5 text-amber-400" />
                    </span>
                  )}
                </span>
              </Link>
              {hasChildren && sectionActive && (
                <div className="mb-1 ml-[1.15rem] border-l border-white/10 pl-2">
                  {item.children!.map(child => {
                    const childActive = pathname === child.href || pathname.startsWith(`${child.href}/`)
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`block rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                          childActive
                            ? 'text-white bg-white/10'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {child.name}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
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

      {/* Bottom actions: Get help + Get started */}
      <div className="px-4 py-3 border-t border-white/10 pb-safe-plus space-y-2">
        <a
          href="https://help.pathpilo.com"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-2.5 px-3 py-2 text-gray-300 hover:text-white hover:bg-white/5 transition-colors rounded-lg text-sm font-medium"
        >
          <QuestionMarkCircleIcon className="w-4 h-4 text-accent-500 flex-shrink-0" />
          <span>{t('app.sidebar.getHelp', 'Get help')}</span>
        </a>
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
    </>
  )

  return (
    <div className="hidden lg:flex fixed inset-y-0 left-0 w-[200px] bg-[#1a2e2e] flex-col overflow-hidden z-30">
      {body}
    </div>
  )
}
