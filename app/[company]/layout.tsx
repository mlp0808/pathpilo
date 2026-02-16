'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import { useUser } from '@/app/hooks/useUser'
import { apiUrl } from '@/app/utils/api'

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

  const companySlug = params?.company as string

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
        
        // Check if user's active company already matches this slug
        const userStr = localStorage.getItem('user')
        if (userStr) {
          try {
            const userData = JSON.parse(userStr)
            if (userData.activeCompany?.slug === companySlug) {
              // Already on this company, just render
              setLastResolvedSlug(companySlug)
              setIsResolving(false)
              return
            }
          } catch (e) {
            console.error('Error parsing user data in layout:', e)
          }
        }
        
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

  return <>{children}</>
}


