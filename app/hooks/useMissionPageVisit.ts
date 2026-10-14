'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { apiUrl } from '@/app/utils/api'
import { PATH_TO_VISIT, requestMissionsRefresh } from '@/app/config/missions'

/** Records that this company has opened a mission-related page. */
export default function useMissionPageVisit() {
  const pathname = usePathname()
  const lastSent = useRef<string>('')

  useEffect(() => {
    const parts = pathname.split('/').filter(Boolean)
    // /{company}/{segment}[/{sub}] — settings pages are matched as "settings/sub".
    const segment = parts[1] || ''
    const sub = parts[2] || ''
    const page = (sub && PATH_TO_VISIT[`${segment}/${sub}`]) || PATH_TO_VISIT[segment]
    if (!page) return
    const token = localStorage.getItem('token')
    if (!token) return
    const key = `${page}`
    if (lastSent.current === key) return
    lastSent.current = key

    void fetch(apiUrl('/companies/getting-started/visit'), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ page }),
    })
      .then((res) => {
        if (res.ok) requestMissionsRefresh()
      })
      .catch(() => {
        lastSent.current = ''
      })
  }, [pathname])
}
