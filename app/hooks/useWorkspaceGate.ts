'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiUrl } from '../utils/api'
import { getStoredUser, isOwnerOfSlug } from '../utils/sessionClient'
import { isOverwatchActive } from '../utils/overwatch'
import type { WorkspaceOwner } from '../components/MultiUserAccessWall'

export const WORKSPACE_BLOCK_STORAGE_KEY = 'vevago_workspace_block'

export type WorkspaceGateState = 'checking' | 'allowed' | 'blocked'

export interface WorkspaceBlockInfo {
  companyName: string
  owner: WorkspaceOwner
  companySlug: string
}

function persistBlock(info: WorkspaceBlockInfo) {
  try {
    sessionStorage.setItem(WORKSPACE_BLOCK_STORAGE_KEY, JSON.stringify(info))
  } catch {
    /* ignore */
  }
}

/**
 * Blocks non-owner members when the company in the URL is not on Pro.
 * When blocked, returns blockInfo so the guard can show MultiUserAccessWall
 * and updates the URL to /workspace-blocked.
 */
export function useWorkspaceGate(companySlug: string | undefined | null): {
  state: WorkspaceGateState
  blockInfo: WorkspaceBlockInfo | null
} {
  const router = useRouter()
  const [state, setState] = useState<WorkspaceGateState>(() => {
    if (!companySlug) return 'allowed'
    if (typeof window !== 'undefined' && isOverwatchActive()) return 'allowed'
    const user = getStoredUser()
    if (user && isOwnerOfSlug(user, companySlug)) return 'allowed'
    return 'checking'
  })
  const [blockInfo, setBlockInfo] = useState<WorkspaceBlockInfo | null>(null)

  useEffect(() => {
    if (!companySlug) {
      setState('allowed')
      setBlockInfo(null)
      return
    }
    if (isOverwatchActive()) {
      setState('allowed')
      setBlockInfo(null)
      return
    }

    const user = getStoredUser()
    if (user && isOwnerOfSlug(user, companySlug)) {
      setState('allowed')
      setBlockInfo(null)
      return
    }

    let cancelled = false
    setState('checking')
    setBlockInfo(null)

    const token = localStorage.getItem('token')
    fetch(apiUrl(`/companies/workspace-access?slug=${encodeURIComponent(companySlug)}`), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('access check failed')
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        if (data.blocked) {
          const info: WorkspaceBlockInfo = {
            companyName: data.companyName || 'This company',
            owner: data.owner || {},
            companySlug,
          }
          persistBlock(info)
          setBlockInfo(info)
          setState('blocked')
          if (window.location.pathname !== '/workspace-blocked') {
            router.replace('/workspace-blocked')
          }
        } else {
          setState('allowed')
          setBlockInfo(null)
        }
      })
      .catch(async () => {
        if (cancelled) return
        // Fail closed — still try to load owner details for the message screen.
        try {
          const res = await fetch(
            apiUrl(`/companies/workspace-access?slug=${encodeURIComponent(companySlug)}`),
            { headers: { Authorization: `Bearer ${token}` } },
          )
          const data = res.ok ? await res.json() : null
          const info: WorkspaceBlockInfo = {
            companyName: data?.companyName || 'This company',
            owner: data?.owner || {},
            companySlug,
          }
          persistBlock(info)
          setBlockInfo(info)
        } catch {
          const info: WorkspaceBlockInfo = {
            companyName: 'This company',
            owner: {},
            companySlug,
          }
          persistBlock(info)
          setBlockInfo(info)
        }
        setState('blocked')
        if (window.location.pathname !== '/workspace-blocked') {
          router.replace('/workspace-blocked')
        }
      })

    return () => {
      cancelled = true
    }
  }, [companySlug, router])

  return { state, blockInfo }
}

export function readPersistedWorkspaceBlock(): WorkspaceBlockInfo | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(WORKSPACE_BLOCK_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WorkspaceBlockInfo
    if (!parsed?.companyName) return null
    return parsed
  } catch {
    return null
  }
}
