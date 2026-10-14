'use client'

import { useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

export default function NewOfferRedirect() {
  const params = useParams()
  const search = useSearchParams()
  const router = useRouter()
  const company = typeof params?.company === 'string' ? params.company : ''

  useEffect(() => {
    const client = search.get('client')
    router.replace(`/${company}/offers?new=1${client ? `&client=${encodeURIComponent(client)}` : ''}`)
  }, [company, router, search])

  return null
}
