'use client'

import { useState, useEffect } from 'react'
import { useUser } from '../hooks/useUser'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import SettingsSidebar from './SettingsSidebar'
import { apiUrl } from '../utils/api'
import { useAppI18n } from './I18nProvider'

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { t } = useAppI18n()
  const { user, loading } = useUser()
  const pathname = usePathname()
  const [syncingCompany, setSyncingCompany] = useState(false)

  // Extract the company slug from the URL — e.g. /my-company/jobs → "my-company"
  const urlSlug = pathname.split('/').filter(Boolean)[0] || ''

  // Non-company routes that should not trigger a company switch
  const nonCompanyRoutes = ['setup', 'login', 'register', 'invite', 'select-company']
  const isCompanyRoute = urlSlug && !nonCompanyRoutes.includes(urlSlug)

  // Settings can be at /settings/... (legacy) or /{slug}/settings/...
  const isSettingsPage =
    pathname.startsWith('/settings') ||
    pathname.split('/').filter(Boolean)[1] === 'settings'

  useEffect(() => {
    if (!isCompanyRoute || !user || syncingCompany) return

    const activeSlug = (user.activeCompany as any)?.slug
    if (!activeSlug || activeSlug === urlSlug) return

    // The URL slug doesn't match the JWT's active company — sync silently
    const targetCompany = user.companies?.find((c: any) => c.slug === urlSlug)
    if (!targetCompany) return // user has no access to this slug, leave as-is

    const token = localStorage.getItem('token')
    if (!token) return

    setSyncingCompany(true)
    fetch(apiUrl('/companies/switch'), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: targetCompany.id }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.token) {
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
          // Reload to pick up the new token throughout the app
          window.location.reload()
        }
      })
      .catch(() => { /* silent — don't block the UI */ })
      .finally(() => setSyncingCompany(false))
  }, [isCompanyRoute, urlSlug, user, syncingCompany])

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
  const activeSlug = (user.activeCompany as any)?.slug || ''

  return (
    <div className="min-h-screen bg-page flex overflow-x-hidden">
      {isSettingsPage ? (
        <SettingsSidebar
          user={user}
          onBack={() => {
            window.location.href = activeSlug ? `/${activeSlug}/dashboard` : '/select-company'
          }}
        />
      ) : (
        <Sidebar
          user={user}
          onSettingsClick={() => {
            window.location.href = activeSlug
              ? `/${activeSlug}/settings/user`
              : '/settings/user'
          }}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 ml-[200px] relative overflow-x-hidden max-w-full flex flex-col">
        <main className="px-[40px] pt-[15px] pb-[15px] overflow-x-hidden max-w-full flex-1 flex flex-col min-h-0">
          {children}
        </main>
      </div>
    </div>
  )
}
