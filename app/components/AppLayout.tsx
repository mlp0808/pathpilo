'use client'

import { useState, useEffect, useRef } from 'react'
import { useUser, SESSION_UPDATED_EVENT } from '../hooks/useUser'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import SettingsSidebar from './SettingsSidebar'
import MobileNavDrawer from './MobileNavDrawer'
import AppTopHeader from './AppTopHeader'
import { apiUrl } from '../utils/api'
import { useAppI18n } from './I18nProvider'
import { getActiveCompanySlugFromSession, getDashboardHref } from '../utils/sessionClient'
import PendingAutomationToasts from './PendingAutomationToasts'
import WorkspaceAccessGuard from './WorkspaceAccessGuard'

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { t } = useAppI18n()
  const { user, loading } = useUser()
  const pathname = usePathname()
  const [syncingCompany, setSyncingCompany] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  /** Stops hammering POST /companies/switch if the server returns no token or errors. */
  const switchBackoffKey = useRef<string | null>(null)

  // Extract the company slug from the URL — e.g. /my-company/jobs → "my-company"
  const urlSlug = pathname.split('/').filter(Boolean)[0] || ''

  // Non-company routes that should not trigger a company switch
  const nonCompanyRoutes = ['setup', 'login', 'register', 'invite', 'select-company']
  const isCompanyRoute = urlSlug && !nonCompanyRoutes.includes(urlSlug)

  // Settings can be at /settings/... (legacy) or /{slug}/settings/...
  const isSettingsPage =
    pathname.startsWith('/settings') ||
    pathname.split('/').filter(Boolean)[1] === 'settings'

  // The map is a full-bleed tool: on desktop it runs top-to-bottom next to the
  // sidebar with its own search floating over it, so the header steps aside.
  // Phones keep it — it's the only way to reach the menu from there.
  const isMapPage = pathname.endsWith('/map')

  // Day-view route planner (jobs?view=day) also goes full-bleed. It signals via
  // a document attribute because it syncs the URL with replaceState, which
  // Next.js searchParams won't notice.
  const [fullBleedTool, setFullBleedTool] = useState(false)
  useEffect(() => {
    const sync = () => setFullBleedTool(document.documentElement.dataset.fullBleedTool === '1')
    sync()
    window.addEventListener('pathpilo:full-bleed', sync)
    return () => window.removeEventListener('pathpilo:full-bleed', sync)
  }, [pathname])

  const headerHideClass = isMapPage ? 'lg:hidden' : fullBleedTool ? 'hidden' : ''

  const targetCompanyId = user?.companies?.find((c: { slug?: string }) => c.slug === urlSlug)?.id
  const activeCompanyId = user?.activeCompany?.id

  useEffect(() => {
    switchBackoffKey.current = null
  }, [urlSlug, activeCompanyId])

  useEffect(() => {
    if (!isCompanyRoute || !user || syncingCompany) return
    if (targetCompanyId == null) return

    // Same workspace as the URL slug — no server round-trip (avoids loops when
    // `useUser` merges profile and replaces the `user` object reference).
    if (
      activeCompanyId != null &&
      targetCompanyId != null &&
      Number(activeCompanyId) === Number(targetCompanyId)
    ) {
      return
    }

    const backoffKey = `${urlSlug}:${targetCompanyId}`
    if (switchBackoffKey.current === backoffKey) return

    const token = localStorage.getItem('token')
    if (!token) return

    setSyncingCompany(true)
    fetch(apiUrl('/companies/switch'), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: targetCompanyId }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.token) {
          switchBackoffKey.current = null
          localStorage.setItem('token', data.token)
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
          window.dispatchEvent(new Event(SESSION_UPDATED_EVENT))
        } else {
          switchBackoffKey.current = backoffKey
        }
      })
      .catch(() => {
        switchBackoffKey.current = backoffKey
      })
      .finally(() => setSyncingCompany(false))
  }, [isCompanyRoute, urlSlug, syncingCompany, targetCompanyId, activeCompanyId])

  if (loading || syncingCompany) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500"></div>
          <p className="mt-2 text-primary-500">{t('app.layout.loading', 'Loading...')}</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null // Will redirect to login
  }

  // Derive the correct slug for back-navigation from the active company
  const activeSlug =
    (user.activeCompany as { slug?: string } | null)?.slug ||
    getActiveCompanySlugFromSession(user as Record<string, unknown>) ||
    ''

  const dashboardHrefMobile = getDashboardHref(user as Record<string, unknown>)

  const shell = (
    <div className="min-h-screen bg-page flex overflow-x-hidden">
      {/* Desktop side column (lg+). Settings and main app share the same
          shell so anywhere the user is, the chrome is consistent. */}
      <Sidebar user={user} />
      {isSettingsPage ? (
        <SettingsSidebar
          user={user}
          onBack={() => {
            window.location.href = dashboardHrefMobile
          }}
        />
      ) : null}
      <MobileNavDrawer
        user={user}
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        isSettingsPage={isSettingsPage}
      />

      {/* Main column.
          - Below lg we don't reserve the 200px sidebar gutter.
          - AppTopHeader is a transparent strip above every page. */}
      <div className={`flex-1 lg:ml-[200px] relative overflow-x-hidden max-w-full flex flex-col ${isSettingsPage ? 'bg-white' : ''}`}>
        <AppTopHeader
          companySlug={activeSlug || (isCompanyRoute ? urlSlug : '')}
          userName={`${user.firstName} ${user.lastName}`.trim()}
          companyName={
            (user.activeCompany as { name?: string } | null)?.name ||
            user.companies?.[0]?.name ||
            ''
          }
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
          className={headerHideClass}
        />

        <main className="px-4 sm:px-6 lg:px-[40px] pt-1 sm:pt-2 lg:pt-2 pb-4 sm:pb-6 lg:pb-[15px] overflow-x-hidden max-w-full flex-1 flex flex-col min-h-0">
          {children}
        </main>
        <PendingAutomationToasts />
      </div>
    </div>
  )

  // Legacy /settings/* routes are not under [company]/layout — guard them here.
  if (pathname.startsWith('/settings')) {
    const slug = getActiveCompanySlugFromSession(user as Record<string, unknown>)
    return <WorkspaceAccessGuard companySlug={slug || undefined}>{shell}</WorkspaceAccessGuard>
  }

  return shell
}
