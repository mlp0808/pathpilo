'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

/** @deprecated Use /settings/clients — invoice defaults live under Clients. */
export default function InvoicesSettingsRedirectPage() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const parts = pathname.split('/').filter(Boolean)
    const slug = parts[0] !== 'settings' ? parts[0] : ''
    const target = slug ? `/${slug}/settings/clients` : '/settings/clients'
    router.replace(target)
  }, [router, pathname])

  return (
    <div className="p-6 flex justify-center py-24">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
    </div>
  )
}
