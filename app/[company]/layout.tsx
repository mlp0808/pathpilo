'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import { useUser } from '@/app/hooks/useUser'
import { apiUrl } from '@/app/utils/api'
import { clearClientLocaleStorage } from '@/app/i18n'
import { isOverwatchActive, stopOverwatchSession } from '@/app/utils/overwatch'

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
          <a
            href="https://pathpilo.com/contact"
            className="btn-primary"
          >
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
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <CompanyLayoutContent>{children}</CompanyLayoutContent>
    </Suspense>
  )
}

function CompanyLayoutContent({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  const pathname = usePathname()
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

    // If we already resolved this slug, don't do it again
    if (lastResolvedSlug === companySlug) {
      setIsResolving(false)
      return
    }

    const resolveAndSwitchCompany = async () => {
      try {
        setIsResolving(true)
        const token = localStorage.getItem('token')
        
        // Resolve slug to company
        const resolveResponse = await fetch(apiUrl(`/companies/slug/${companySlug}`), {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        
        if (!resolveResponse.ok) {
          // User doesn't have access or company doesn't exist
          console.log(`Company ${companySlug} not found or no access, trying to find valid company...`)

          // Try to find a valid company for this user
          const userStr = localStorage.getItem('user')
          if (userStr) {
            try {
              const userData = JSON.parse(userStr)
              const validCompany = userData.companies?.find((c: any) => c.slug !== companySlug)
              if (validCompany) {
                console.log(`Redirecting to valid company: ${validCompany.slug}`)
                router.replace(`/${validCompany.slug}/dashboard`)
                return
              }
            } catch (e) {
              console.error('Error parsing user data:', e)
            }
          }

          // If no valid company found, redirect to plain dashboard (will handle company selection there)
          router.replace('/select-company')
          return
        }
        
        const resolveData = await resolveResponse.json()
        const companyId = resolveData.company.id

        // Company suspended — show wall immediately, no further processing
        if (resolveData.company.suspendedAt) {
          setSuspendedCompanyName(resolveData.company.name)
          setIsResolving(false)
          return
        }
        
        // Check if user's active company matches
        const userStr2 = localStorage.getItem('user')
        if (userStr2) {
          try {
            const userData = JSON.parse(userStr2)
            if (userData.activeCompany?.id === companyId) {
              // Already on this company, just render
              setLastResolvedSlug(companySlug)
              setIsResolving(false)
              return
            }
          } catch (e) {
            console.error('Error parsing user data in layout:', e)
          }
        }
        
        // Switch to this company
        const switchResponse = await fetch(apiUrl('/companies/switch'), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ company_slug: companySlug })
        })
        
        if (switchResponse.ok) {
          const switchData = await switchResponse.json()
          // Update token and user data
          localStorage.setItem('token', switchData.token)
          localStorage.setItem('user', JSON.stringify(switchData.user))
          // Mark this slug as resolved and continue
          setLastResolvedSlug(companySlug)
          setIsResolving(false)
          return
        } else {
          // Failed to switch, try to find a valid company
          console.log('Failed to switch company, trying to find valid company...')

          const userStr = localStorage.getItem('user')
          if (userStr) {
            try {
              const userData = JSON.parse(userStr)
              const validCompany = userData.companies?.find((c: any) => c.slug !== companySlug)
              if (validCompany) {
                console.log(`Redirecting to valid company: ${validCompany.slug}`)
                router.replace(`/${validCompany.slug}/dashboard`)
                return
              }
            } catch (e) {
              console.error('Error parsing user data:', e)
            }
          }

          // If no valid company found, redirect to company selection
          router.replace('/select-company')
        }
      } catch (error) {
        console.error('Error resolving company slug:', error)

        // Try to find a valid company for this user
        const userStr = localStorage.getItem('user')
        if (userStr) {
          try {
            const userData = JSON.parse(userStr)
            const validCompany = userData.companies?.find((c: any) => c.slug !== companySlug)
            if (validCompany) {
              console.log(`Redirecting to valid company: ${validCompany.slug}`)
              router.replace(`/${validCompany.slug}/dashboard`)
              return
            }
          } catch (e) {
            console.error('Error parsing user data:', e)
          }
        }

        router.replace('/select-company')
      } finally {
        setIsResolving(false)
      }
    }

    resolveAndSwitchCompany()
  }, [companySlug, userLoading, router, lastResolvedSlug]) // Track last resolved slug to prevent loops

  if (userLoading || isResolving) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
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


