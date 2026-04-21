'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

/** @deprecated Renamed to /settings/client-terms. Kept so old links/bookmarks still resolve. */
export default function InvoiceTermsRedirectPage() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const parts = pathname.split('/').filter(Boolean)
    const slug = parts[0] !== 'settings' ? parts[0] : ''
    const target = slug ? `/${slug}/settings/invoice-options` : '/settings/invoice-options'
    router.replace(target)
  }, [router, pathname])

  return (
    <div className="p-6 flex justify-center py-24">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
    </div>
  )
}
