'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/app/hooks/useUser'
import MultiUserAccessWall, { type WorkspaceOwner } from '@/app/components/MultiUserAccessWall'
import {
  readPersistedWorkspaceBlock,
  type WorkspaceBlockInfo,
} from '@/app/hooks/useWorkspaceGate'
import { apiUrl } from '@/app/utils/api'
import { isOwnerOfSlug } from '@/app/utils/sessionClient'
import { isOverwatchActive } from '@/app/utils/overwatch'

export default function WorkspaceBlockedPage() {
  const router = useRouter()
  const { user, loading } = useUser()
  const [block, setBlock] = useState<WorkspaceBlockInfo | null>(null)

  useEffect(() => {
    if (loading) return

    if (isOverwatchActive()) {
      router.replace('/select-company')
      return
    }

    const persisted = readPersistedWorkspaceBlock()
    if (persisted) {
      const slug = persisted.companySlug
      if (slug && user && isOwnerOfSlug(user as Record<string, unknown>, slug)) {
        router.replace(`/${slug}/dashboard`)
        return
      }
      setBlock(persisted)
      return
    }

    // Direct visit without persisted state — pick first non-owned company slug and re-check.
    const companies = user?.companies as Array<{ slug?: string; role?: string; isOwner?: boolean }> | undefined
    const membership = companies?.find((c) => {
      if (!c.slug) return false
      if (c.isOwner) return false
      const r = String(c.role || '').toLowerCase()
      return r !== 'owner' && r !== 'company-owner'
    })
    const slug = membership?.slug || (user?.activeCompany as { slug?: string } | undefined)?.slug

    const token = localStorage.getItem('token')
    if (!slug || !token) {
      router.replace('/select-company')
      return
    }

    if (user && isOwnerOfSlug(user as Record<string, unknown>, slug)) {
      router.replace(`/${slug}/dashboard`)
      return
    }

    fetch(apiUrl(`/companies/workspace-access?slug=${encodeURIComponent(slug)}`), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.blocked) {
          router.replace(`/${slug}/dashboard`)
          return
        }
        setBlock({
          companyName: data.companyName || 'This company',
          owner: (data.owner || {}) as WorkspaceOwner,
          companySlug: slug,
        })
      })
      .catch(() => {
        setBlock({ companyName: 'This company', owner: {}, companySlug: slug })
      })
  }, [loading, user, router])

  if (loading || !block) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500" />
      </div>
    )
  }

  const companies = user?.companies
  const showSwitchCompany = Array.isArray(companies) && companies.length > 1

  return (
    <MultiUserAccessWall
      companyName={block.companyName}
      owner={block.owner}
      showSwitchCompany={showSwitchCompany}
    />
  )
}
