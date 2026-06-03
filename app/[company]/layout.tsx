'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser, SESSION_UPDATED_EVENT } from '@/app/hooks/useUser'
import { apiUrl } from '@/app/utils/api'
import { clearClientLocaleStorage } from '@/app/i18n'
import { isOverwatchActive, stopOverwatchSession } from '@/app/utils/overwatch'
import WorkspaceAccessGuard from '@/app/components/WorkspaceAccessGuard'
import { getOwnerSetupResumePath, isOwnerUser, ownerMustCompleteSetup } from '@/app/utils/onboardingClient'

function SuspendedWall({ companyName }: { companyName: string }) {
  const handleLogout = () => {
    clearClientLocaleStorage()
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
  }
  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-primary-800 mb-2">This company has expired</h1>
          <p className="text-gray-600">
            <strong>{companyName}</strong> is currently on hold.
            The software is unavailable for all users of this company.
          </p>
          <p className="text-sm text-gray-400 mt-3">
            Contact the company owner, or go to our support page for more help.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <a href="https://pathpilo.com/contact" className="btn-primary">
            Go to support
          </a>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <p className="mt-2 text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <CompanyLayoutWithGuard>{children}</CompanyLayoutWithGuard>
    </Suspense>
  )
}

function CompanyLayoutWithGuard({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const companySlug = params?.company as string

  return (
    <WorkspaceAccessGuard companySlug={companySlug}>
      <CompanyLayoutContent>{children}</CompanyLayoutContent>
    </WorkspaceAccessGuard>
  )
}

/** When the URL slug cannot be resolved, prefer another membership; if only one company exists, use it. */
function pickFallbackCompany(
  userData: { companies?: Array<{ slug?: string }> },
  currentSlug: string
): { slug: string } | undefined {
  const list = userData.companies || []
  const alt = list.find((c) => c?.slug && c.slug !== currentSlug)
  if (alt?.slug) return { slug: alt.slug }
  if (list.length === 1 && list[0]?.slug) return { slug: list[0].slug }
  return undefined
}

function CompanyLayoutContent({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  const { user, loading: userLoading } = useUser()
  const [isResolving, setIsResolving] = useState(true)
  const [lastResolvedSlug, setLastResolvedSlug] = useState<string | null>(null)
  const [suspendedCompanyName, setSuspendedCompanyName] = useState<string | null>(null)
  const [overwatchActive, setOverwatchActive] = useState(false)
  const [overwatchAdminEmail, setOverwatchAdminEmail] = useState<string | null>(null)

  const companySlug = params?.company as string

  useEffect(() => {
    if (typeof window === 'undefined') return
    setOverwatchActive(isOverwatchActive())
    try {
      const rawUser = localStorage.getItem('user')
      if (!rawUser) return
      const parsed = JSON.parse(rawUser)
      const adminEmail = parsed?.overwatch?.adminEmail
      if (adminEmail && typeof adminEmail === 'string') {
        setOverwatchAdminEmail(adminEmail)
      }
    } catch {
      // ignore malformed local storage payload
    }
  }, [])

  useEffect(() => {
    if (userLoading || !companySlug) {
      if (!userLoading && !companySlug) {
        setIsResolving(false)
      }
      return
    }

    if (lastResolvedSlug === companySlug) {
      setIsResolving(false)
      return
    }

    const resolveAndSwitchCompany = async () => {
      try {
        setIsResolving(true)
        const token = localStorage.getItem('token')

        const resolveResponse = await fetch(apiUrl(`/companies/slug/${companySlug}`), {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!resolveResponse.ok) {
          const userStr = localStorage.getItem('user')
          if (userStr) {
            try {
              const userData = JSON.parse(userStr)
              const validCompany = pickFallbackCompany(userData, companySlug)
              if (validCompany) {
                router.replace(`/${validCompany.slug}/dashboard`)
                return
              }
            } catch {
              /* ignore */
            }
          }
          router.replace('/select-company')
          return
        }

        const resolveData = await resolveResponse.json()
        const companyId = resolveData.company.id

        if (resolveData.company.suspendedAt) {
          setSuspendedCompanyName(resolveData.company.name)
          setIsResolving(false)
          return
        }

        const userStr2 = localStorage.getItem('user')
        if (userStr2) {
          try {
            const userData = JSON.parse(userStr2)
            if (Number(userData.activeCompany?.id) === Number(companyId)) {
              setLastResolvedSlug(companySlug)
              setIsResolving(false)
              return
            }
          } catch {
            /* ignore */
          }
        }

        const switchResponse = await fetch(apiUrl('/companies/switch'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ company_slug: companySlug }),
        })

        if (switchResponse.ok) {
          const switchData = await switchResponse.json()
          localStorage.setItem('token', switchData.token)
          localStorage.setItem('user', JSON.stringify(switchData.user))
          window.dispatchEvent(new Event(SESSION_UPDATED_EVENT))
          setLastResolvedSlug(companySlug)
          setIsResolving(false)
          return
        }

        const userStr = localStorage.getItem('user')
        if (userStr) {
          try {
            const userData = JSON.parse(userStr)
            const validCompany = pickFallbackCompany(userData, companySlug)
            if (validCompany) {
              router.replace(`/${validCompany.slug}/dashboard`)
              return
            }
          } catch {
            /* ignore */
          }
        }
        router.replace('/select-company')
      } catch {
        router.replace('/select-company')
      } finally {
        setIsResolving(false)
      }
    }

    resolveAndSwitchCompany()
  }, [companySlug, userLoading, router, lastResolvedSlug])

  useEffect(() => {
    if (userLoading || isResolving || !user) return
    const u = user as unknown as Record<string, unknown>
    if (isOwnerUser(u) && ownerMustCompleteSetup(u)) {
      router.replace(getOwnerSetupResumePath(u))
    }
  }, [user, userLoading, isResolving, router])

  if (userLoading || isResolving) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (
    user &&
    isOwnerUser(user as unknown as Record<string, unknown>) &&
    ownerMustCompleteSetup(user as unknown as Record<string, unknown>)
  ) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  if (suspendedCompanyName) {
    return <SuspendedWall companyName={suspendedCompanyName} />
  }

  return (
    <>
      {overwatchActive && (
        <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span>
            Overwatch mode active{overwatchAdminEmail ? ` (${overwatchAdminEmail})` : ''}. You are temporarily viewing this company as owner.
          </span>
          <button
            onClick={() => {
              stopOverwatchSession()
              window.location.href = '/admin/companies'
            }}
            className="rounded border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Quit Overwatch
          </button>
        </div>
      )}
      {children}
    </>
  )
}
