'use client'

import { usePathname } from 'next/navigation'
import { useUser } from '@/app/hooks/useUser'
import { useWorkspaceGate } from '@/app/hooks/useWorkspaceGate'
import { getActiveCompanySlugFromSession } from '@/app/utils/sessionClient'
import MultiUserAccessWall from '@/app/components/MultiUserAccessWall'

/**
 * Non-owner members on a Standard (non-Pro) company never reach app pages —
 * they see the "plan does not support multiple users" screen instead.
 */
export default function WorkspaceAccessGuard({
  children,
  companySlug,
}: {
  children: React.ReactNode
  companySlug?: string
}) {
  const pathname = usePathname()
  const { user, loading: userLoading } = useUser()

  const slug =
    companySlug ||
    (pathname.startsWith('/settings')
      ? getActiveCompanySlugFromSession(user as Record<string, unknown> | null)
      : null)

  const { state, blockInfo } = useWorkspaceGate(slug)

  if (state === 'blocked' && blockInfo) {
    const companies = user?.companies
    const showSwitchCompany = Array.isArray(companies) && companies.length > 1
    return (
      <MultiUserAccessWall
        companyName={blockInfo.companyName}
        owner={blockInfo.owner}
        showSwitchCompany={showSwitchCompany}
      />
    )
  }

  if (userLoading || state === 'checking') {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500" />
          <p className="mt-2 text-sm text-primary-500">Loading…</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
