'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
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
  XMarkIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '../utils/api'
import { clearClientLocaleStorage } from '../i18n'
import { useAppI18n } from './I18nProvider'
import VideoGuideModal from './VideoGuideModal'
import SidebarAccountPanel from './SidebarAccountPanel'
import SidebarSmsBar from './SidebarSmsBar'
import { isOverwatchActive, stopOverwatchSession } from '../utils/overwatch'
import { useCompanyPlan } from '../hooks/useCompanyPlan'
import CrownIcon from './icons/CrownIcon'
import {
  buildSettingsNavSections,
  isSettingsNavItemActive,
} from '../config/settingsNav'

type MobileNavTab = 'menu' | 'settings'

interface Company {
  id: number
  name: string
  slug?: string
  role: string
  isOwner: boolean
}

interface MobileNavDrawerProps {
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
  isOpen: boolean
  onClose: () => void
  isSettingsPage: boolean
}

function roleLabelKey(role: string): 'app.role.owner' | 'app.role.manager' | 'app.role.admin' | 'app.role.employee' {
  const r = String(role || '').toLowerCase()
  if (r === 'owner') return 'app.role.owner'
  if (r === 'manager') return 'app.role.manager'
  if (r === 'admin') return 'app.role.admin'
  return 'app.role.employee'
}

export default function MobileNavDrawer({
  user,
  isOpen,
  onClose,
  isSettingsPage,
}: MobileNavDrawerProps) {
  const { t } = useAppI18n()
  const pathname = usePathname()
  const { loading: planLoading, hasProAccess } = useCompanyPlan()
  const [activeTab, setActiveTab] = useState<MobileNavTab>('menu')
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)
  const [isVideoGuideOpen, setIsVideoGuideOpen] = useState(false)
  const [overwatchActive, setOverwatchActive] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const pathParts = pathname.split('/').filter(Boolean)
  const companySlugFromPath = pathParts[0] !== 'settings' ? pathParts[0] : ''
  const activeCompany =
    user.activeCompany || (user.companies && user.companies.length > 0 ? user.companies[0] : null)
  const companySlug =
    (activeCompany as { slug?: string })?.slug ||
    (user.companies?.[0] as { slug?: string })?.slug ||
    companySlugFromPath ||
    ''

  const settingsSections = buildSettingsNavSections(t, companySlug)
  const showCompanySwitcher = user.companies && user.companies.length > 1
  const displayName = `${user.firstName} ${user.lastName}`.trim()
  const displayCompany = activeCompany?.name || user.companies?.[0]?.name || ''

  const jobsBase = companySlug ? `/${companySlug}/jobs` : '/jobs'
  const teamHref = companySlug ? `/${companySlug}/team` : '/team'
  const navigation: Array<{
    name: string
    href: string
    icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
    proOnly?: boolean
  }> = [
    { name: t('app.nav.dashboard', 'Dashboard'), href: companySlug ? `/${companySlug}/dashboard` : '/dashboard', icon: HomeIcon },
    { name: t('app.nav.jobs', 'Jobs'), href: jobsBase, icon: ClipboardDocumentListIcon },
    { name: t('app.nav.clients', 'Clients'), href: companySlug ? `/${companySlug}/clients` : '/clients', icon: UserGroupIcon },
    { name: t('app.nav.invoices', 'Invoices'), href: companySlug ? `/${companySlug}/invoices` : '/invoices', icon: DocumentTextIcon },
    { name: t('app.nav.leads', 'Leads'), href: companySlug ? `/${companySlug}/leads` : '/leads', icon: InboxIcon },
    { name: t('app.nav.team', 'Team'), href: teamHref, icon: UsersIcon, proOnly: true },
    { name: t('app.nav.services', 'Services'), href: companySlug ? `/${companySlug}/services` : '/services', icon: Cog6ToothIcon },
  ]
  const showTeamProBadge = !planLoading && !hasProAccess

  useEffect(() => {
    setOverwatchActive(isOverwatchActive())
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setActiveTab(isSettingsPage ? 'settings' : 'menu')
  }, [isOpen, isSettingsPage])

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCompanyDropdownOpen(false)
      }
    }
    if (isCompanyDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isCompanyDropdownOpen])

  const handleLogout = () => {
    clearClientLocaleStorage()
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('pathpilo_video_guide_dismissed')
    window.location.href = '/'
  }

  const handleQuitOverwatch = () => {
    const restored = stopOverwatchSession()
    if (!restored) {
      alert('No active overwatch session found.')
      return
    }
    window.location.href = '/admin/companies'
  }

  const handleCompanySwitch = async (companyId: number) => {
    if (isSwitching) return
    setIsSwitching(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const response = await fetch(apiUrl('/companies/switch'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ company_id: companyId }),
      })
      const data = await response.json()
      if (response.ok) {
        localStorage.setItem('token', data.token)
        localStorage.setItem(
          'user',
          JSON.stringify({
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
          }),
        )
        const newSlug = data.user.activeCompany?.slug
        window.location.href = newSlug ? `/${newSlug}/dashboard` : '/select-company'
      } else {
        alert('Failed to switch company: ' + (data.error || 'Unknown error'))
      }
    } catch {
      alert('Error switching company. Please try again.')
    } finally {
      setIsSwitching(false)
      setIsCompanyDropdownOpen(false)
    }
  }

  if (!isOpen) return null

  const tabClass = (tab: MobileNavTab) =>
    `flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
      activeTab === tab
        ? 'border-accent-500 text-white'
        : 'border-transparent text-gray-500 hover:text-gray-300'
    }`

  return (
    <div className="lg:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px] animate-backdrop-in cursor-default"
      />
      <div className="relative h-full w-[82vw] max-w-[300px] bg-[#1a2e2e] flex flex-col overflow-hidden shadow-2xl animate-drawer-in-left">
        <div className="shrink-0 flex items-center justify-end px-3 pt-3 pb-1">
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="shrink-0 flex border-b border-white/10 px-3">
          <button type="button" className={tabClass('menu')} onClick={() => setActiveTab('menu')}>
            {t('app.mobileNav.tabMenu', 'Menu')}
          </button>
          <button type="button" className={tabClass('settings')} onClick={() => setActiveTab('settings')}>
            {t('app.mobileNav.tabSettings', 'Settings')}
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {activeTab === 'menu' ? (
            <>
              <div className="flex-1 overflow-y-auto min-h-0">
                <SidebarAccountPanel
                  companyName={displayCompany}
                  userName={displayName}
                  companySlug={companySlug}
                  overwatchActive={overwatchActive}
                  onLogout={handleLogout}
                  onQuitOverwatch={handleQuitOverwatch}
                  placement="drawer"
                  onNavigate={onClose}
                />

                <nav className="px-0 py-2">
                  {navigation.map((item) => {
                    const Icon = item.icon
                    const isActive =
                      pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={onClose}
                        className={`group flex items-stretch w-full text-sm font-medium transition-colors ${
                          isActive ? 'text-white bg-white/5' : 'text-white hover:bg-white/5'
                        }`}
                      >
                        <span
                          className={`flex-shrink-0 w-1 min-h-[2.5rem] self-stretch ${
                            isActive ? 'bg-accent-500' : 'bg-transparent'
                          }`}
                          aria-hidden
                        />
                        <span className="flex items-center flex-1 py-2.5 pl-3 pr-4">
                          <Icon
                            className={`mr-3 h-5 w-5 flex-shrink-0 ${
                              isActive ? 'text-white' : 'text-accent-500 group-hover:text-accent-400'
                            }`}
                            aria-hidden
                          />
                          {item.name}
                          {item.proOnly && showTeamProBadge && (
                            <span className="ml-1.5 inline-flex flex-shrink-0" title={t('app.proGate.proFeature', 'Pro feature')}>
                              <CrownIcon className="h-3.5 w-3.5 text-amber-400" />
                            </span>
                          )}
                        </span>
                      </Link>
                    )
                  })}
                </nav>

                {showCompanySwitcher && (
                  <div className="px-4 py-3 border-t border-white/10">
                    <div className="relative" ref={dropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIsCompanyDropdownOpen(!isCompanyDropdownOpen)}
                        disabled={isSwitching}
                        className="w-full flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
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
                            const isActiveCo = activeCompany?.id === company.id
                            return (
                              <button
                                key={company.id}
                                type="button"
                                onClick={() => handleCompanySwitch(company.id)}
                                disabled={isActiveCo || isSwitching}
                                className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${
                                  isActiveCo
                                    ? 'bg-accent-500/20 text-accent-400 cursor-default'
                                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="truncate">{company.name}</span>
                                  {isActiveCo && (
                                    <span className="ml-2 text-accent-400 text-[10px]">
                                      {t('app.sidebar.active', 'Active')}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-gray-500 mt-0.5">
                                  {t(roleLabelKey(company.role), company.role)}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="px-4 py-3 border-t border-white/10 space-y-2">
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
                    type="button"
                    onClick={() => setIsVideoGuideOpen(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-500 hover:bg-accent-600 text-white font-semibold text-sm rounded-xl"
                  >
                    <RocketLaunchIcon className="w-5 h-5" />
                    <span>{t('app.sidebar.getStarted', 'Get started')}</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <nav className="flex-1 overflow-y-auto min-h-0 px-3 py-3">
              {settingsSections.map((section, sectionIdx) => (
                <div
                  key={section.label || `section-${sectionIdx}`}
                  className={sectionIdx === 0 ? '' : 'mt-4'}
                >
                  {section.label ? (
                    <p className="px-1 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
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
                          onClick={onClose}
                          className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                            isActive
                              ? 'bg-white/10 text-white font-semibold'
                              : 'text-gray-300 font-medium hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 flex-shrink-0 ${
                              isActive ? 'text-accent-400' : 'text-accent-500'
                            }`}
                            aria-hidden
                          />
                          {item.name}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>
          )}

          <SidebarSmsBar variant="dark" />
        </div>
      </div>

      <VideoGuideModal
        isOpen={isVideoGuideOpen}
        onClose={() => {
          setIsVideoGuideOpen(false)
          sessionStorage.setItem('pathpilo_video_guide_dismissed', 'true')
        }}
      />
    </div>
  )
}
